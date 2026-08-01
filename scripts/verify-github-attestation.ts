import {
  execFileSync,
} from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  createPrivateKey,
} from "node:crypto";
import {
  createExternalAttestationReceipt,
  sha256FileContent,
} from "../src/evidence/attestation-receipt";
import {
  requiresExternalAttestationVerification,
  type CiEvidenceManifest,
} from "../src/evidence/ci-evidence";
/*
 * The manifest names the expected verifier but never self-asserts that the
 * attestation exists. This process supplies that independent verification.
 */
interface GithubAttestationVerification {
  verificationResult?: {
    statement?: {
      subject?: Array<{
        name?: string;
        digest?: Record<string, string>;
      }>;
    };
  };
}

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

async function main(): Promise<void> {
  const evidencePath = path.resolve(
    process.cwd(),
    process.argv[2] ?? "public/data/ci-evidence.json",
  );
  const outputPath = path.resolve(
    process.cwd(),
    process.argv[3] ?? ".artifacts/attestation-receipt.json",
  );
  const evidenceContent = await fs.readFile(evidencePath);
  const manifest = JSON.parse(
    evidenceContent.toString("utf8"),
  ) as CiEvidenceManifest;
  if (
    !requiresExternalAttestationVerification(manifest) ||
    manifest.source.dirty
  ) {
    throw new Error(
      "Only a clean external-CI evidence manifest can receive a promotion receipt",
    );
  }
  if (!manifest.gates.every((gate) => gate.status === "passed")) {
    throw new Error("Evidence manifest contains a failed release gate");
  }
  const repository =
    process.env.NEXUS_ATTESTATION_REPOSITORY ??
    manifest.source.repository.replace(/^https:\/\/github\.com\//, "").replace(
      /\.git$/,
      "",
    );
  const signerWorkflow = required(
    process.env.NEXUS_ATTESTATION_SIGNER_WORKFLOW,
    "NEXUS_ATTESTATION_SIGNER_WORKFLOW",
  );
  const verificationJson = execFileSync(
    "gh",
    [
      "attestation",
      "verify",
      evidencePath,
      "--repo",
      repository,
      "--signer-workflow",
      signerWorkflow,
      "--source-digest",
      manifest.source.commitSha,
      "--deny-self-hosted-runners",
      "--format",
      "json",
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    },
  );
  const verifications = JSON.parse(
    verificationJson,
  ) as GithubAttestationVerification[];
  if (!Array.isArray(verifications) || verifications.length === 0) {
    throw new Error("GitHub CLI returned no verified attestations");
  }
  const subjectSha256 = sha256FileContent(evidenceContent);
  const matchingSubject = verifications.some((verification) =>
    verification.verificationResult?.statement?.subject?.some(
      (subject) => subject.digest?.sha256 === subjectSha256,
    ),
  );
  if (!matchingSubject) {
    throw new Error(
      "Verified attestation does not contain the evidence manifest digest",
    );
  }
  const privateKeyPem = Buffer.from(
    required(
      process.env.NEXUS_ATTESTATION_RECEIPT_PRIVATE_KEY_BASE64,
      "NEXUS_ATTESTATION_RECEIPT_PRIVATE_KEY_BASE64",
    ),
    "base64",
  ).toString("utf8");
  const verifiedAt = new Date();
  const receipt = createExternalAttestationReceipt(
    {
      schemaVersion: 1,
      provider: "github-actions-sigstore",
      repository,
      sourceCommitSha: manifest.source.commitSha,
      subjectPath: path.relative(process.cwd(), evidencePath),
      subjectSha256,
      manifestFingerprint: manifest.fingerprint,
      workflow: manifest.source.workflow,
      signerWorkflow,
      runId: manifest.source.runId,
      gates: manifest.gates.map((gate) => gate.name),
      verifiedAt: verifiedAt.toISOString(),
      expiresAt: new Date(
        verifiedAt.getTime() + 24 * 60 * 60 * 1_000,
      ).toISOString(),
    },
    createPrivateKey(privateKeyPem),
  );
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(
    outputPath,
    `${JSON.stringify(receipt, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      event: "attestation.receipt.issued",
      outputPath,
      repository,
      sourceCommitSha: manifest.source.commitSha,
      subjectSha256,
      expiresAt: receipt.payload.expiresAt,
    }),
  );
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
