/**
 * Local governed-receipt lifecycle drill.
 *
 * Exercises the exact receipt lifecycle used by the remote evidence pipelines
 * without any GitHub hosted run, live provider or production persistence:
 *
 *   1. issue  - sign a passing CI-evidence artifact with a throwaway Ed25519
 *               key (memory only, never written to disk);
 *   2. verify - verify signature, repository, signer allowlist and timestamps;
 *   3. ingest - store the receipt through the real EvidenceRegistryService
 *               against an in-memory repository, twice, proving idempotency;
 *   4. reject - tampered signature, untrusted workflow, expired receipt,
 *               wrong repository and viewer actor all fail closed;
 *   5. schema - malformed envelopes are rejected by the same validator the
 *               governance HTTP route uses.
 *
 * The generated key is ephemeral and the issued receipt is a mechanical drill
 * artifact only. It does not run `gh attestation verify`, it is not a governed
 * receipt, and it must never be deployed as evidence.
 */

import {
  generateKeyPairSync,
  randomUUID,
} from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  ExperimentPermissionError,
  ExperimentService,
  InMemoryExperimentRepository,
} from "../src/experiments";
import type {
  ExperimentActor,
} from "../src/experiments";
import {
  createRemoteEvidenceReceipt,
  isRemoteEvidenceReceipt,
  sha256FileContent,
  verifyRemoteEvidenceReceipt,
} from "../src/evidence";
import {
  GovernanceService,
} from "../src/governance";
import {
  EvidenceRegistryService,
} from "../src/governance/evidence-service";

const REPOSITORY = "Carrick-K7/nexus-7";
const SIGNER_WORKFLOW = "Carrick-K7/nexus-7/.github/workflows/ci.yml";
const EVIDENCE_PATH = "public/data/ci-evidence.json";

interface StepResult {
  name: string;
  passed: boolean;
  expected: string;
  observed: string;
}

interface DrillReport {
  schemaVersion: "nexus.receipt-drill.v1";
  drillId: string;
  completedAt: string;
  keyFingerprintSha256: string;
  role: "mechanical-lifecycle-drill";
  evidence: {
    subjectPath: string;
    subjectSha256: string;
    sourceCommitSha: string | null;
  };
  steps: StepResult[];
  summary: {
    total: number;
    passed: number;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function main(): Promise<void> {
  const drillId = `receipt-drill-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const now = new Date();
  const steps: StepResult[] = [];
  const record = (
    name: string,
    expected: string,
    observed: string,
  ): void => {
    steps.push({ name, passed: observed === expected, expected, observed });
  };

  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeyFingerprint = sha256FileContent(
    Buffer.from(
      publicKey.export({ type: "spki", format: "pem" }) as string,
      "utf8",
    ),
  );

  // --- Issue: sign the real passing CI-evidence artifact ---------------
  const evidenceContent = await fs.readFile(
    path.resolve(process.cwd(), EVIDENCE_PATH),
  );
  const evidence: unknown = JSON.parse(evidenceContent.toString("utf8"));
  if (
    !isRecord(evidence) ||
    !Array.isArray(evidence.gates) ||
    evidence.gates.length === 0 ||
    !evidence.gates.every(
      (gate) => isRecord(gate) && gate.status === "passed",
    )
  ) {
    throw new Error("CI evidence artifact is not structurally passing");
  }
  const source = isRecord(evidence.source) ? evidence.source : null;
  const sourceCommitSha =
    typeof source?.commitSha === "string" ? source.commitSha : null;
  const subjectSha256 = sha256FileContent(evidenceContent);
  const verifiedAt = now;
  const receipt = createRemoteEvidenceReceipt(
    {
      schemaVersion: 1,
      provider: "github-actions-sigstore",
      kind: "ci-evidence",
      repository: REPOSITORY,
      sourceCommitSha: sourceCommitSha ?? "a".repeat(40),
      signerWorkflow: SIGNER_WORKFLOW,
      runId: drillId,
      subjectPath: EVIDENCE_PATH,
      subjectSha256,
      passed: true,
      generatedAt:
        typeof evidence.generatedAt === "string"
          ? evidence.generatedAt
          : now.toISOString(),
      verifiedAt: verifiedAt.toISOString(),
      expiresAt: new Date(verifiedAt.getTime() + 7 * 24 * 60 * 60 * 1_000)
        .toISOString(),
      summary: {
        fingerprint: isRecord(evidence.fingerprint)
          ? evidence.fingerprint
          : null,
        gates: evidence.gates.length,
      },
    },
    privateKey,
  );

  // --- Verify: signature, repository, allowlist, timestamps ------------
  const verification = verifyRemoteEvidenceReceipt(
    receipt,
    publicKey,
    { repository: REPOSITORY, signerWorkflows: [SIGNER_WORKFLOW] },
    new Date(verifiedAt.getTime() + 60_000),
  );
  record(
    "verify.valid-receipt",
    "valid",
    verification.valid ? "valid" : `rejected: ${verification.reasons.join("; ")}`,
  );

  // --- Ingest: real service against an in-memory repository ------------
  const repository = new InMemoryExperimentRepository();
  const experiments = new ExperimentService(repository, { now: () => now });
  await experiments.initialize();
  const governance = new GovernanceService(repository, { now: () => now });
  await governance.initialize();
  const registry = new EvidenceRegistryService(repository, {
    now: () => new Date(verifiedAt.getTime() + 60_000),
    publicKey,
    repository: REPOSITORY,
    signerWorkflows: [SIGNER_WORKFLOW],
  });
  const operator: ExperimentActor = {
    id: "receipt-drill-ingestor",
    role: "operator",
    workspaceId: "workspace-neo-angeles",
    principalType: "service-account",
    workloadKind: "ci",
    permissionGrants: [
      "workspace:read",
      "governance:read",
      "evidence:ingest",
    ],
  };
  const first = await registry.ingest(receipt, operator);
  const second = await registry.ingest(receipt, operator);
  const records = await repository.listGovernanceEvidence(
    "workspace-neo-angeles",
    100,
  );
  const idempotent =
    first.id === second.id && records.length === 1 && records[0].id === first.id;
  record(
    "ingest.idempotent",
    "same-record-single-row",
    idempotent ? "same-record-single-row" : `records=${records.length}`,
  );

  // --- Reject: tampered signature --------------------------------------
  const tampered: typeof receipt = structuredClone(receipt);
  tampered.signature = `${receipt.signature.slice(0, -2)}AA`;
  await expectRejected(
    registry,
    tampered,
    operator,
    "reject.tampered-signature",
    "Evidence receipt signature is invalid",
    record,
  );

  // --- Reject: untrusted signer workflow -------------------------------
  const untrusted: typeof receipt = structuredClone(receipt);
  untrusted.payload.signerWorkflow =
    "Carrick-K7/nexus-7/.github/workflows/attacker.yml";
  await expectRejected(
    registry,
    untrusted,
    operator,
    "reject.untrusted-workflow",
    "Evidence signer workflow is not trusted",
    record,
  );

  // --- Reject: expired receipt ------------------------------------------
  const expired: typeof receipt = structuredClone(receipt);
  expired.payload.expiresAt = new Date(
    verifiedAt.getTime() - 60_000,
  ).toISOString();
  await expectRejected(
    registry,
    expired,
    operator,
    "reject.expired",
    "Evidence receipt has expired",
    record,
  );

  // --- Reject: wrong repository -----------------------------------------
  const wrongRepo: typeof receipt = structuredClone(receipt);
  wrongRepo.payload.repository = "attacker/repo";
  await expectRejected(
    registry,
    wrongRepo,
    operator,
    "reject.wrong-repository",
    "Evidence repository is not trusted",
    record,
  );

  // --- Reject: viewer actor has no ingestion permission -----------------
  const viewer: ExperimentActor = {
    id: "public-observer",
    role: "viewer",
    workspaceId: "workspace-neo-angeles",
    principalType: "system",
  };
  try {
    await registry.ingest(receipt, viewer);
    record("reject.viewer-permission", "denied", "accepted");
  } catch (error) {
    record(
      "reject.viewer-permission",
      "denied",
      error instanceof ExperimentPermissionError ? "denied" : "wrong-error",
    );
  }

  // --- Schema: malformed envelopes fail the route validator -------------
  const malformed = [
    { payload: receipt.payload },
    { payload: receipt.payload, signature: "" },
    { ...receipt, payload: { ...receipt.payload, schemaVersion: 2 } },
    { ...receipt, payload: { ...receipt.payload, passed: "yes" } },
  ];
  const rejectedCount = malformed.filter(
    (envelope) => !isRemoteEvidenceReceipt(envelope),
  ).length;
  record(
    "schema.malformed-rejected",
    "4/4",
    `${rejectedCount}/${malformed.length}`,
  );

  // --- Report ------------------------------------------------------------
  const passed = steps.every((step) => step.passed);
  const report: DrillReport = {
    schemaVersion: "nexus.receipt-drill.v1",
    drillId,
    completedAt: now.toISOString(),
    keyFingerprintSha256: publicKeyFingerprint,
    role: "mechanical-lifecycle-drill",
    evidence: {
      subjectPath: EVIDENCE_PATH,
      subjectSha256,
      sourceCommitSha,
    },
    steps,
    summary: {
      total: steps.length,
      passed: steps.filter((step) => step.passed).length,
    },
  };
  const outputPath = path.resolve(
    process.cwd(),
    ".artifacts/receipt-drill.json",
  );
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(
    outputPath,
    `${JSON.stringify(report, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  console.log(
    JSON.stringify(
      {
        event: "receipt-drill.completed",
        drillId,
        passed,
        total: report.summary.total,
        passedSteps: report.summary.passed,
        outputPath,
      },
      null,
      2,
    ),
  );
  if (!passed) {
    const failed = steps.filter((step) => !step.passed);
    for (const step of failed) {
      console.error(`FAIL ${step.name}: expected ${step.expected}, saw ${step.observed}`);
    }
    process.exitCode = 1;
  }
}

async function expectRejected(
  registry: EvidenceRegistryService,
  receipt: Parameters<EvidenceRegistryService["ingest"]>[0],
  actor: ExperimentActor,
  name: string,
  expectedReason: string,
  record: (name: string, expected: string, observed: string) => void,
): Promise<void> {
  try {
    await registry.ingest(receipt, actor);
    record(name, expectedReason, "accepted");
  } catch (error) {
    if (!(error instanceof ExperimentPermissionError)) {
      record(name, expectedReason, "wrong-error-type");
      return;
    }
    const message = error.message;
    record(
      name,
      expectedReason,
      message.includes(expectedReason) ? expectedReason : `other-reason: ${message}`,
    );
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
