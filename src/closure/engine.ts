import {
  createHash,
} from "node:crypto";
import {
  ExperimentConflictError,
  ExperimentValidationError,
} from "@/experiments/errors";
import {
  stableStringify,
} from "@/simulation/core/random";
import {
  CLOSED_LOOP_CASE_SCHEMA_VERSION,
  CLOSED_LOOP_EVIDENCE_SCHEMA_VERSION,
  CLOSED_LOOP_STAGE_CODES,
  type ClosedLoopCase,
  type ClosedLoopEvidence,
  type ClosedLoopEvidenceKind,
  type ClosedLoopReleaseArtifact,
  type ClosedLoopStage,
  type ClosedLoopStageCode,
  type ClosedLoopStatus,
  type ClosedLoopTransition,
} from "./types";

export const CLOSED_LOOP_RECORD_KIND = "closed-loop-case";
export const CLOSED_LOOP_DEPLOYMENT_RECORD_KIND = "deployment-record";

const STAGE_REQUIREMENTS: Record<
  ClosedLoopStageCode,
  ClosedLoopEvidenceKind[]
> = {
  detection: ["observation"],
  triage: ["triage"],
  diagnosis: ["hypothesis", "counterfactual"],
  planning: ["plan"],
  experiment: ["experiment"],
  authorization: ["approval"],
  deployment: ["artifact-binding", "deployment-telemetry"],
  outcome: ["outcome"],
  learning: ["lesson"],
  closure: ["closure"],
};

const STAGE_OWNERS: Record<
  ClosedLoopStageCode,
  ClosedLoopStage["owner"]
> = {
  detection: {
    kind: "system",
    role: "orchestrator",
    id: "system:closed-loop-detector",
  },
  triage: {
    kind: "human",
    role: "operator",
    id: "human:civic-operations",
  },
  diagnosis: {
    kind: "system",
    role: "orchestrator",
    id: "system:diagnostic-orchestrator",
  },
  planning: {
    kind: "system",
    role: "orchestrator",
    id: "system:planning-orchestrator",
  },
  experiment: {
    kind: "system",
    role: "orchestrator",
    id: "system:experiment-runner",
  },
  authorization: {
    kind: "human",
    role: "admin",
    id: "human:release-governance",
  },
  deployment: {
    kind: "human",
    role: "admin",
    id: "human:release-operator",
  },
  outcome: {
    kind: "system",
    role: "orchestrator",
    id: "system:independent-outcome-evaluator",
  },
  learning: {
    kind: "human",
    role: "admin",
    id: "human:learning-governance",
  },
  closure: {
    kind: "human",
    role: "admin",
    id: "human:case-owner",
  },
};

const STAGE_DEADLINE_HOURS: Record<ClosedLoopStageCode, number> = {
  detection: 1,
  triage: 4,
  diagnosis: 12,
  planning: 12,
  experiment: 24,
  authorization: 24,
  deployment: 8,
  outcome: 24 * 8,
  learning: 24,
  closure: 8,
};

const ALLOWED_TRANSITIONS: Record<
  ClosedLoopStatus,
  ClosedLoopStatus[]
> = {
  detected: ["triaged", "paused", "blocked", "cancelled", "emergency-stopped"],
  triaged: ["diagnosing", "paused", "blocked", "cancelled", "emergency-stopped"],
  diagnosing: ["diagnosed", "inconclusive", "paused", "blocked", "cancelled", "emergency-stopped"],
  diagnosed: ["planned", "inconclusive", "paused", "blocked", "cancelled", "emergency-stopped"],
  planned: ["experimenting", "paused", "blocked", "cancelled", "emergency-stopped"],
  experimenting: ["awaiting-approval", "inconclusive", "paused", "blocked", "cancelled", "emergency-stopped"],
  "awaiting-approval": ["staged", "inconclusive", "paused", "blocked", "cancelled", "emergency-stopped"],
  staged: ["monitoring", "rolled-back", "paused", "blocked", "cancelled", "emergency-stopped"],
  monitoring: ["verified-beneficial", "rolled-back", "inconclusive", "paused", "blocked", "cancelled", "emergency-stopped"],
  "verified-beneficial": ["learned", "reopened"],
  "rolled-back": ["learned", "reopened"],
  inconclusive: ["learned", "reopened"],
  learned: ["closed", "reopened"],
  closed: ["reopened"],
  paused: [
    "detected",
    "triaged",
    "diagnosing",
    "diagnosed",
    "planned",
    "experimenting",
    "awaiting-approval",
    "staged",
    "monitoring",
    "cancelled",
    "emergency-stopped",
  ],
  blocked: [
    "detected",
    "triaged",
    "diagnosing",
    "diagnosed",
    "planned",
    "experimenting",
    "awaiting-approval",
    "staged",
    "monitoring",
    "cancelled",
    "emergency-stopped",
  ],
  cancelled: ["reopened"],
  "emergency-stopped": ["rolled-back", "reopened"],
  reopened: ["monitoring", "diagnosing", "cancelled", "emergency-stopped"],
};

export function sha256(value: unknown): string {
  return createHash("sha256")
    .update(
      typeof value === "string" ? value : stableStringify(value),
      "utf8",
    )
    .digest("hex");
}

export function fingerprintReleaseArtifact(
  artifact: Omit<ClosedLoopReleaseArtifact, "fingerprint">,
): string {
  const {
    boundAt: _boundAt,
    ...identity
  } = artifact;
  void _boundAt;
  return sha256(identity);
}

export function bindReleaseArtifact(
  input: Omit<ClosedLoopReleaseArtifact, "schemaVersion" | "fingerprint">,
): ClosedLoopReleaseArtifact {
  const artifact = {
    schemaVersion: "nexus.release-artifact-binding.v2" as const,
    ...structuredClone(input),
  };
  return {
    ...artifact,
    fingerprint: fingerprintReleaseArtifact(artifact),
  };
}

export function verifyReleaseArtifact(
  artifact: ClosedLoopReleaseArtifact,
  now?: Date,
): string[] {
  const failures: string[] = [];
  const {
    fingerprint,
    ...unsigned
  } = artifact;
  if (fingerprintReleaseArtifact(unsigned) !== fingerprint) {
    failures.push("release-artifact-fingerprint-mismatch");
  }
  if (!/^[a-f0-9]{64}$/.test(artifact.artifactDigest)) {
    failures.push("release-artifact-digest-invalid");
  }
  if (!/^[a-f0-9]{64}$/.test(artifact.evidenceManifestFingerprint)) {
    failures.push("release-evidence-manifest-fingerprint-invalid");
  }
  if (
    artifact.trust === "external-attested" &&
    (
      !artifact.externalAttestation?.verified ||
      (
        now &&
        Date.parse(artifact.externalAttestation.expiresAt) <=
          now.getTime()
      )
    )
  ) {
    failures.push("external-attestation-missing-or-expired");
  }
  if (
    artifact.trust !== "external-attested" &&
    artifact.externalAttestation
  ) {
    failures.push("local-artifact-cannot-claim-external-attestation");
  }
  return failures;
}

export function createClosedLoopEvidence(input: {
  id: string;
  stage: ClosedLoopStageCode;
  kind: ClosedLoopEvidenceKind;
  sourceRecordId: string;
  correlationId: string;
  causationId?: string;
  releaseArtifactFingerprint: string;
  trust?: ClosedLoopEvidence["trust"];
  payload: unknown;
  createdAt: string;
  expiresAt?: string;
  supersedesEvidenceId?: string;
}): ClosedLoopEvidence {
  const unsigned = {
    schemaVersion: CLOSED_LOOP_EVIDENCE_SCHEMA_VERSION,
    id: input.id,
    stage: input.stage,
    kind: input.kind,
    sourceRecordId: input.sourceRecordId,
    correlationId: input.correlationId,
    ...(input.causationId
      ? { causationId: input.causationId }
      : {}),
    releaseArtifactFingerprint:
      input.releaseArtifactFingerprint,
    trust: input.trust ?? "local-integrity",
    payloadDigest: sha256(input.payload),
    createdAt: input.createdAt,
    ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
    ...(input.supersedesEvidenceId
      ? { supersedesEvidenceId: input.supersedesEvidenceId }
      : {}),
  };
  return {
    ...unsigned,
    integrity: {
      algorithm: "sha256",
      digest: sha256(unsigned),
      verified: true,
    },
  };
}

export function verifyClosedLoopEvidence(
  evidence: ClosedLoopEvidence,
  releaseArtifactFingerprint: string,
  now?: Date,
): string[] {
  const failures: string[] = [];
  const {
    integrity,
    ...unsigned
  } = evidence;
  if (
    integrity.algorithm !== "sha256" ||
    integrity.verified !== true ||
    sha256(unsigned) !== integrity.digest
  ) {
    failures.push(`evidence-integrity:${evidence.id}`);
  }
  if (
    evidence.releaseArtifactFingerprint !==
    releaseArtifactFingerprint
  ) {
    failures.push(`evidence-artifact-binding:${evidence.id}`);
  }
  if (
    now &&
    evidence.expiresAt &&
    Date.parse(evidence.expiresAt) <= now.getTime()
  ) {
    failures.push(`evidence-expired:${evidence.id}`);
  }
  return failures;
}

export function createClosedLoopStages(
  createdAt: string,
): ClosedLoopStage[] {
  const start = Date.parse(createdAt);
  if (!Number.isFinite(start)) {
    throw new ExperimentValidationError(
      "Closed-loop createdAt must be an ISO timestamp",
    );
  }
  return CLOSED_LOOP_STAGE_CODES.map((code, index) => ({
    code,
    status: index === 0 ? "active" : "pending",
    owner: structuredClone(STAGE_OWNERS[code]),
    deadlineAt: new Date(
      start + STAGE_DEADLINE_HOURS[code] * 3_600_000,
    ).toISOString(),
    requiredEvidenceKinds: structuredClone(
      STAGE_REQUIREMENTS[code],
    ),
    evidenceIds: [],
    sourceRecordIds: [],
    ...(index === 0 ? { startedAt: createdAt } : {}),
  }));
}

export function fingerprintClosedLoopCase(
  value: Omit<ClosedLoopCase, "fingerprint">,
): string {
  return sha256(value);
}

export function refreshClosedLoopCaseFingerprint(
  value: Omit<ClosedLoopCase, "fingerprint"> | ClosedLoopCase,
): ClosedLoopCase {
  const {
    fingerprint: _fingerprint,
    ...unsigned
  } = value as ClosedLoopCase;
  void _fingerprint;
  return {
    ...structuredClone(unsigned),
    fingerprint: fingerprintClosedLoopCase(unsigned),
  };
}

export function createClosedLoopCase(input: {
  id: string;
  organizationId: string;
  workspaceId: string;
  title: string;
  scenarioId: string;
  scenarioFamily: string;
  eligibleProblem: boolean;
  ownerId: string;
  correlationId: string;
  causationId: string;
  releaseArtifact: ClosedLoopReleaseArtifact;
  scenarioTruthId: string;
  seed: string;
  policyVersion: string;
  createdAt: string;
}): ClosedLoopCase {
  const stages = createClosedLoopStages(input.createdAt);
  const base: Omit<ClosedLoopCase, "fingerprint"> = {
    schemaVersion: CLOSED_LOOP_CASE_SCHEMA_VERSION,
    id: input.id,
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    revision: 1,
    status: "detected",
    title: input.title.trim().slice(0, 240),
    scenarioId: input.scenarioId,
    scenarioFamily: input.scenarioFamily,
    eligibleProblem: input.eligibleProblem,
    detected: true,
    ownerId: input.ownerId,
    correlationId: input.correlationId,
    causationId: input.causationId,
    releaseArtifact: structuredClone(input.releaseArtifact),
    links: {
      scenarioTruthId: input.scenarioTruthId,
    },
    stages,
    evidence: [],
    transitions: [],
    idempotency: [],
    compensations: [],
    control: {
      blockers: [],
      emergencyStop: false,
      reopenCount: 0,
    },
    guardrails: {
      severeEscapeCount: 0,
      rollbackRequired: false,
      rollbackCompleted: false,
      expiredEvidenceBypassCount: 0,
    },
    groupImpacts: [],
    replay: {
      seed: input.seed,
      policyVersion: input.policyVersion,
      deterministic: true,
    },
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    syntheticBoundary:
      "This case orchestrates a deterministic synthetic city laboratory. It is not evidence of real-world policy effects.",
  };
  return refreshClosedLoopCaseFingerprint(base);
}

export function assertAllowedClosedLoopTransition(
  from: ClosedLoopStatus,
  to: ClosedLoopStatus,
): void {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new ExperimentConflictError(
      `Closed-loop case cannot transition from ${from} to ${to}`,
    );
  }
}

export function closedLoopTransitionDigest(
  transition: Omit<ClosedLoopTransition, "digest">,
): string {
  return sha256(transition);
}

export function appendClosedLoopTransition(
  current: ClosedLoopCase,
  input: {
    to: ClosedLoopStatus;
    actorId: string;
    command: string;
    idempotencyKey: string;
    causationId?: string;
    evidenceIds?: string[];
    occurredAt: string;
  },
): ClosedLoopCase {
  assertAllowedClosedLoopTransition(current.status, input.to);
  const unsigned: Omit<ClosedLoopTransition, "digest"> = {
    sequence: current.transitions.length + 1,
    from: current.status,
    to: input.to,
    actorId: input.actorId,
    command: input.command,
    idempotencyKey: input.idempotencyKey,
    correlationId: current.correlationId,
    ...(input.causationId
      ? { causationId: input.causationId }
      : {}),
    evidenceIds: structuredClone(input.evidenceIds ?? []),
    occurredAt: input.occurredAt,
  };
  return refreshClosedLoopCaseFingerprint({
    ...current,
    revision: current.revision + 1,
    status: input.to,
    transitions: [
      ...current.transitions,
      {
        ...unsigned,
        digest: closedLoopTransitionDigest(unsigned),
      },
    ],
    updatedAt: input.occurredAt,
    fingerprint: "",
  });
}

export function addClosedLoopEvidence(
  current: ClosedLoopCase,
  evidence: ClosedLoopEvidence[],
): ClosedLoopCase {
  const existingIds = new Set(
    current.evidence.map((item) => item.id),
  );
  if (evidence.some((item) => existingIds.has(item.id))) {
    throw new ExperimentConflictError(
      "Closed-loop evidence IDs must be unique",
    );
  }
  const stages = structuredClone(current.stages);
  for (const item of evidence) {
    const stage = stages.find(
      (candidate) => candidate.code === item.stage,
    );
    if (!stage) {
      throw new ExperimentValidationError(
        `Unknown closed-loop stage ${item.stage}`,
      );
    }
    stage.evidenceIds.push(item.id);
    if (!stage.sourceRecordIds.includes(item.sourceRecordId)) {
      stage.sourceRecordIds.push(item.sourceRecordId);
    }
  }
  return refreshClosedLoopCaseFingerprint({
    ...current,
    evidence: [...current.evidence, ...structuredClone(evidence)],
    stages,
    fingerprint: "",
  });
}

export function updateClosedLoopStage(
  current: ClosedLoopCase,
  code: ClosedLoopStageCode,
  input: {
    status: ClosedLoopStage["status"];
    occurredAt: string;
    note?: string;
  },
): ClosedLoopCase {
  const stages = structuredClone(current.stages);
  const index = stages.findIndex((stage) => stage.code === code);
  if (index < 0) {
    throw new ExperimentValidationError(
      `Closed-loop stage ${code} is missing`,
    );
  }
  const stage = stages[index];
  stage.status = input.status;
  stage.note = input.note;
  if (
    input.status === "active" &&
    !stage.startedAt
  ) {
    stage.startedAt = input.occurredAt;
  }
  if (
    ["completed", "skipped", "failed", "compensated"].includes(
      input.status,
    )
  ) {
    stage.startedAt ??= input.occurredAt;
    stage.completedAt = input.occurredAt;
  }
  if (
    ["completed", "skipped"].includes(input.status) &&
    index + 1 < stages.length &&
    stages[index + 1].status === "pending"
  ) {
    stages[index + 1].status = "active";
    stages[index + 1].startedAt = input.occurredAt;
    stages[index + 1].deadlineAt = new Date(
      Date.parse(input.occurredAt) +
        STAGE_DEADLINE_HOURS[stages[index + 1].code] *
          3_600_000,
    ).toISOString();
  }
  return refreshClosedLoopCaseFingerprint({
    ...current,
    stages,
    updatedAt: input.occurredAt,
    fingerprint: "",
  });
}

export function closedLoopCommandDigest(
  command: string,
  payload: unknown,
): string {
  return sha256({ command, payload });
}

function stageHasAlternativeDisposition(
  stage: ClosedLoopStage,
  evidenceById: Map<string, ClosedLoopEvidence>,
): boolean {
  return stage.evidenceIds.some((id) => {
    const kind = evidenceById.get(id)?.kind;
    return kind === "no-action" || kind === "governance-denial";
  });
}

export function verifyClosedLoopCaseIntegrity(
  closedLoopCase: ClosedLoopCase,
  options: {
    now?: Date;
    requireClosed?: boolean;
  } = {},
): {
  passed: boolean;
  failures: string[];
  stageCompletenessPercent: number;
  evidenceIntegrityPercent: number;
  causalCompletenessPercent: number;
} {
  const failures = verifyReleaseArtifact(
    closedLoopCase.releaseArtifact,
    options.now,
  );
  const stageCodes = closedLoopCase.stages.map((stage) => stage.code);
  if (
    stableStringify(stageCodes) !==
    stableStringify(CLOSED_LOOP_STAGE_CODES)
  ) {
    failures.push("closed-loop-stage-set-or-order-invalid");
  }
  const evidenceIds = new Set<string>();
  const evidenceFailures: string[] = [];
  const supersededEvidenceIds = new Set(
    closedLoopCase.evidence
      .map((evidence) => evidence.supersedesEvidenceId)
      .filter((id): id is string => Boolean(id)),
  );
  for (const evidence of closedLoopCase.evidence) {
    if (evidenceIds.has(evidence.id)) {
      evidenceFailures.push(`duplicate-evidence:${evidence.id}`);
    }
    evidenceIds.add(evidence.id);
    evidenceFailures.push(
      ...verifyClosedLoopEvidence(
        evidence,
        closedLoopCase.releaseArtifact.fingerprint,
        supersededEvidenceIds.has(evidence.id)
          ? undefined
          : options.now,
      ),
    );
  }
  failures.push(...evidenceFailures);
  const evidenceById = new Map(
    closedLoopCase.evidence.map((evidence) => [
      evidence.id,
      evidence,
    ]),
  );
  for (const stage of closedLoopCase.stages) {
    for (const evidenceId of stage.evidenceIds) {
      const evidence = evidenceById.get(evidenceId);
      if (!evidence || evidence.stage !== stage.code) {
        failures.push(
          `stage-evidence-reference-invalid:${stage.code}:${evidenceId}`,
        );
      }
    }
    if (["completed", "skipped"].includes(stage.status)) {
      const kinds = new Set(
        stage.evidenceIds.map(
          (id) => evidenceById.get(id)?.kind,
        ),
      );
      const missing = stage.requiredEvidenceKinds.filter(
        (kind) => !kinds.has(kind),
      );
      if (
        missing.length > 0 &&
        !stageHasAlternativeDisposition(stage, evidenceById)
      ) {
        failures.push(
          `stage-required-evidence-missing:${stage.code}:${missing.join(",")}`,
        );
      }
      if (
        stage.status === "skipped" &&
        !stageHasAlternativeDisposition(stage, evidenceById)
      ) {
        failures.push(
          `stage-skip-without-safe-disposition:${stage.code}`,
        );
      }
    }
  }
  let expectedStatus: ClosedLoopStatus | "none" = "none";
  for (const transition of closedLoopCase.transitions) {
    const {
      digest,
      ...unsigned
    } = transition;
    if (
      transition.sequence !==
        closedLoopCase.transitions.indexOf(transition) + 1 ||
      closedLoopTransitionDigest(unsigned) !== digest
    ) {
      failures.push(
        `transition-integrity:${transition.sequence}`,
      );
    }
    if (
      transition.from !== expectedStatus &&
      !(transition.sequence === 1 && transition.from === "detected")
    ) {
      failures.push(
        `transition-chain:${transition.sequence}`,
      );
    }
    if (transition.from !== "none") {
      try {
        assertAllowedClosedLoopTransition(
          transition.from,
          transition.to,
        );
      } catch {
        failures.push(
          `transition-not-allowed:${transition.from}:${transition.to}`,
        );
      }
    }
    expectedStatus = transition.to;
  }
  if (
    closedLoopCase.transitions.length > 0 &&
    expectedStatus !== closedLoopCase.status
  ) {
    failures.push("transition-terminal-status-mismatch");
  }
  if (
    options.requireClosed &&
    closedLoopCase.status !== "closed"
  ) {
    failures.push("case-not-closed");
  }
  if (closedLoopCase.status === "closed") {
    if (!closedLoopCase.disposition || !closedLoopCase.closedAt) {
      failures.push("closed-case-missing-disposition");
    }
    for (const stage of closedLoopCase.stages) {
      if (!["completed", "skipped"].includes(stage.status)) {
        failures.push(`closed-case-stage-incomplete:${stage.code}`);
      }
    }
  }
  if (
    closedLoopCase.guardrails.rollbackRequired &&
    !closedLoopCase.guardrails.rollbackCompleted
  ) {
    failures.push("required-rollback-incomplete");
  }
  if (closedLoopCase.guardrails.severeEscapeCount > 0) {
    failures.push("severe-guardrail-escape");
  }
  if (closedLoopCase.guardrails.expiredEvidenceBypassCount > 0) {
    failures.push("expired-evidence-bypass");
  }
  const {
    fingerprint,
    ...unsignedCase
  } = closedLoopCase;
  if (
    fingerprintClosedLoopCase(unsignedCase) !== fingerprint
  ) {
    failures.push("closed-loop-case-fingerprint-mismatch");
  }
  const completeStages = closedLoopCase.stages.filter(
    (stage) =>
      stage.status === "completed" ||
      stage.status === "skipped",
  ).length;
  const validEvidence =
    closedLoopCase.evidence.length -
    new Set(
      evidenceFailures.map((failure) =>
        failure.split(":").slice(1).join(":"),
      ),
    ).size;
  const requiredLinks = [
    closedLoopCase.links.incidentId,
    closedLoopCase.links.diagnosisId,
    closedLoopCase.links.planId,
    closedLoopCase.links.deploymentId,
    closedLoopCase.links.outcomeId,
    closedLoopCase.links.lessonId,
  ];
  const safeNoAction =
    closedLoopCase.disposition === "no-action" ||
    closedLoopCase.disposition === "governance-denied";
  const causalComplete = safeNoAction
    ? requiredLinks.filter(Boolean).length + 6
    : requiredLinks.filter(Boolean).length;
  return {
    passed: failures.length === 0,
    failures: [...new Set(failures)].sort(),
    stageCompletenessPercent:
      (completeStages / CLOSED_LOOP_STAGE_CODES.length) * 100,
    evidenceIntegrityPercent:
      closedLoopCase.evidence.length === 0
        ? 0
        : Math.max(
            0,
            (validEvidence / closedLoopCase.evidence.length) * 100,
          ),
    causalCompletenessPercent:
      Math.min(100, (causalComplete / 6) * 100),
  };
}

export function currentClosedLoopStage(
  value: ClosedLoopCase,
): ClosedLoopStage | undefined {
  return (
    value.stages.find((stage) => stage.status === "active") ??
    value.stages.find((stage) => stage.status === "pending")
  );
}

export function assertCurrentStageNotExpired(
  value: ClosedLoopCase,
  now: Date,
): void {
  const stage = currentClosedLoopStage(value);
  if (
    stage &&
    Date.parse(stage.deadlineAt) <= now.getTime()
  ) {
    throw new ExperimentConflictError(
      `Closed-loop stage ${stage.code} deadline expired`,
    );
  }
}

export function renewCurrentClosedLoopStageDeadline(
  value: ClosedLoopCase,
  occurredAt: string,
): ClosedLoopCase {
  const stages = structuredClone(value.stages);
  const index = stages.findIndex(
    (stage) =>
      stage.status === "active" || stage.status === "pending",
  );
  if (index < 0) {
    return value;
  }
  const stage = stages[index];
  const timestamp = Date.parse(occurredAt);
  if (!Number.isFinite(timestamp)) {
    throw new ExperimentValidationError(
      "Closed-loop deadline renewal requires an ISO timestamp",
    );
  }
  stage.status = "active";
  stage.startedAt = occurredAt;
  stage.deadlineAt = new Date(
    timestamp +
      STAGE_DEADLINE_HOURS[stage.code] * 3_600_000,
  ).toISOString();
  stage.note =
    "Deadline renewed by a governed human resume after review.";
  return refreshClosedLoopCaseFingerprint({
    ...value,
    stages,
    updatedAt: occurredAt,
    fingerprint: "",
  });
}
