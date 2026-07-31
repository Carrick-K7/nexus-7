import {
  createPublicKey,
  type KeyLike,
} from "node:crypto";
import {
  actorWorkspaceId,
  assertActorPermission,
} from "@/experiments/authorization";
import {
  ExperimentNotFoundError,
  ExperimentPermissionError,
} from "@/experiments/errors";
import type {
  ExperimentActor,
} from "@/experiments/types";
import type {
  ExperimentRepository,
} from "@/experiments/repository";
import type {
  OperationalIntelligenceService,
} from "@/operations/intelligence-service";
import {
  attestationPublicKeyFromEnvironment,
  verifyRemoteEvidenceReceipt,
} from "@/evidence";
import type {
  RemoteEvidenceReceipt,
} from "@/evidence";
import type {
  EvidenceFreshness,
  EvidenceRegistryOverview,
  GovernanceEvidenceKind,
  GovernanceEvidenceRecord,
} from "./types";

export const EVIDENCE_MAXIMUM_AGE_HOURS: Record<
  GovernanceEvidenceKind,
  number
> = {
  "ci-evidence": 30,
  "model-regression-live": 36,
  "recovery-drill": 8 * 24,
  "deployment-drill": 8 * 24,
  "deployment-conformance": 30 * 24,
  "symbiosis-replication": 8 * 24,
  "symbiosis-off-host-recovery": 8 * 24,
};

interface EvidenceRegistryOptions {
  now?: () => Date;
  id?: () => string;
  publicKey?: KeyLike;
  repository?: string;
  signerWorkflows?: string[];
  operationalIntelligence?: Pick<
    OperationalIntelligenceService,
    "recordSample"
  >;
}

function defaultSignerWorkflows(repository: string): string[] {
  return [
    `${repository}/.github/workflows/ci.yml`,
    `${repository}/.github/workflows/model-regression.yml`,
    `${repository}/.github/workflows/operations-drills.yml`,
  ];
}

export class EvidenceRegistryService {
  private readonly now: () => Date;
  private readonly id: () => string;
  private readonly publicKey?: KeyLike;
  private readonly repository: string;
  private readonly signerWorkflows: string[];
  private readonly operationalIntelligence?: Pick<
    OperationalIntelligenceService,
    "recordSample"
  >;

  constructor(
    private readonly storage: ExperimentRepository,
    options: EvidenceRegistryOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.id = options.id ?? (() => crypto.randomUUID());
    this.publicKey = options.publicKey;
    this.repository =
      options.repository ??
      process.env.NEXUS_EVIDENCE_REPOSITORY ??
      process.env.NEXUS_ATTESTATION_REPOSITORY ??
      "Carrick-K7/nexus-7";
    this.signerWorkflows =
      options.signerWorkflows ??
      defaultSignerWorkflows(this.repository);
    this.operationalIntelligence = options.operationalIntelligence;
  }

  private receiptPublicKey(): KeyLike {
    return (
      this.publicKey ??
      createPublicKey(attestationPublicKeyFromEnvironment())
    );
  }

  async ingest(
    receipt: RemoteEvidenceReceipt,
    actor: ExperimentActor,
  ): Promise<GovernanceEvidenceRecord> {
    assertActorPermission(actor, "evidence:ingest");
    const verification = verifyRemoteEvidenceReceipt(
      receipt,
      this.receiptPublicKey(),
      {
        repository: this.repository,
        signerWorkflows: this.signerWorkflows,
      },
      this.now(),
    );
    if (!verification.valid) {
      throw new ExperimentPermissionError(
        `Remote evidence rejected: ${verification.reasons.join("; ")}`,
      );
    }
    const workspaceId = actorWorkspaceId(actor);
    const workspace =
      await this.storage.getGovernedWorkspace(workspaceId);
    if (!workspace) {
      throw new ExperimentNotFoundError(
        `Workspace governance for ${workspaceId} was not found`,
      );
    }
    const payload = receipt.payload;
    const record = await this.storage.storeGovernanceEvidence({
      id: `evidence-${this.id()}`,
      organizationId: workspace.organizationId,
      workspaceId,
      kind: payload.kind,
      provider: payload.provider,
      repository: payload.repository,
      sourceCommitSha: payload.sourceCommitSha,
      signerWorkflow: payload.signerWorkflow,
      runId: payload.runId,
      subjectPath: payload.subjectPath,
      subjectSha256: payload.subjectSha256,
      passed: payload.passed,
      generatedAt: payload.generatedAt,
      verifiedAt: payload.verifiedAt,
      expiresAt: payload.expiresAt,
      ingestedBy: actor.id,
      ingestedAt: this.now().toISOString(),
      summary: structuredClone(payload.summary),
    });
    const ageHours = Math.max(
      0,
      (this.now().getTime() - Date.parse(record.generatedAt)) /
        (60 * 60 * 1_000),
    );
    const maximumAgeHours = EVIDENCE_MAXIMUM_AGE_HOURS[record.kind];
    await this.operationalIntelligence?.recordSample(
      {
        source: "evidence",
        metric: "freshness-utilization-percent",
        value: (ageHours / maximumAgeHours) * 100,
        unit: "percent",
        status:
          ageHours >= maximumAgeHours
            ? "breaching"
            : ageHours >= maximumAgeHours * 0.75
              ? "warning"
              : "healthy",
        dimensions: {
          kind: record.kind,
          repository: record.repository,
        },
        evidenceId: record.id,
        observedAt: record.ingestedAt,
      },
      actor,
    );
    return record;
  }

  async overview(
    actor: ExperimentActor,
  ): Promise<EvidenceRegistryOverview> {
    assertActorPermission(actor, "governance:read");
    const records = await this.storage.listGovernanceEvidence(
      actorWorkspaceId(actor),
      200,
    );
    const freshness = (
      Object.keys(EVIDENCE_MAXIMUM_AGE_HOURS) as GovernanceEvidenceKind[]
    ).map((kind) => this.freshness(kind, records));
    return {
      records,
      freshness,
      alerts: freshness.filter((entry) => entry.status !== "current"),
    };
  }

  private freshness(
    kind: GovernanceEvidenceKind,
    records: GovernanceEvidenceRecord[],
  ): EvidenceFreshness {
    const maximumAgeHours = EVIDENCE_MAXIMUM_AGE_HOURS[kind];
    const latest = records.find((record) => record.kind === kind);
    if (!latest) {
      return {
        kind,
        status: "missing",
        maximumAgeHours,
        message: `No verified ${kind} evidence has been ingested`,
      };
    }
    const now = this.now().getTime();
    const ageHours = Math.max(
      0,
      (now - Date.parse(latest.generatedAt)) / (60 * 60 * 1_000),
    );
    const expired = Date.parse(latest.expiresAt) <= now;
    if (!latest.passed || expired || ageHours > maximumAgeHours) {
      return {
        kind,
        status: "stale",
        maximumAgeHours,
        ageHours,
        expiresAt: latest.expiresAt,
        recordId: latest.id,
        message: expired
          ? `${kind} evidence receipt has expired`
          : `${kind} evidence exceeds its freshness SLO`,
      };
    }
    const expiryHours =
      (Date.parse(latest.expiresAt) - now) / (60 * 60 * 1_000);
    const expiring =
      ageHours >= maximumAgeHours * 0.75 || expiryHours <= 12;
    return {
      kind,
      status: expiring ? "expiring" : "current",
      maximumAgeHours,
      ageHours,
      expiresAt: latest.expiresAt,
      recordId: latest.id,
      message: expiring
        ? `${kind} evidence is approaching its freshness boundary`
        : `${kind} evidence is current`,
    };
  }
}
