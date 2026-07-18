import {
  CLOSED_LOOP_STAGE_CODES,
  type CertificationAttack,
  type ClosedLoopCase,
  type ClosedLoopCertificationScenario,
  type ClosedLoopDisposition,
  type ClosedLoopEvidenceKind,
  type ClosedLoopReleaseArtifact,
  type ClosedLoopStageCode,
  type ClosedLoopStatus,
} from "./types";
import {
  addClosedLoopEvidence,
  appendClosedLoopTransition,
  closedLoopCommandDigest,
  createClosedLoopCase,
  createClosedLoopEvidence,
  refreshClosedLoopCaseFingerprint,
  sha256,
  updateClosedLoopStage,
} from "./engine";

const FAMILIES = [
  "infrastructure",
  "economic",
  "public-safety",
  "environment",
  "digital-network",
] as const;

const ADVERSARIAL: Record<
  (typeof FAMILIES)[number],
  {
    attack: CertificationAttack;
    disposition: ClosedLoopDisposition;
    safeBehavior: string;
  }
> = {
  infrastructure: {
    attack: "injected-deployment-fault",
    disposition: "rolled-back",
    safeBehavior:
      "Production telemetry trips the rollback guardrail and the inverse is durably recorded.",
  },
  economic: {
    attack: "late-harm",
    disposition: "rolled-back",
    safeBehavior:
      "Delayed harm reopens evaluation, invalidates the earlier lesson, and rolls back.",
  },
  "public-safety": {
    attack: "wrong-diagnosis",
    disposition: "inconclusive",
    safeBehavior:
      "Counterfactual falsification rejects the wrong cause before any deployment.",
  },
  environment: {
    attack: "approval-denied",
    disposition: "governance-denied",
    safeBehavior:
      "Human veto closes the proposal without an external action and remains in the denominator.",
  },
  "digital-network": {
    attack: "malicious-input",
    disposition: "beneficial",
    safeBehavior:
      "Executable payload text is rejected and the bounded deterministic fallback completes the governed loop.",
  },
};

function sourceScenarioId(
  family: (typeof FAMILIES)[number],
  mode: ClosedLoopCertificationScenario["mode"],
): string {
  return `city-${family}-${
    mode === "adversarial" ? "cascade" : mode
  }`;
}

export const CLOSED_LOOP_CERTIFICATION_CORPUS:
  ReadonlyArray<ClosedLoopCertificationScenario> =
  FAMILIES.flatMap((family) => {
    const common = {
      schemaVersion:
        "nexus.closed-loop-certification-scenario.v2" as const,
      family,
      requiredStageCodes: [...CLOSED_LOOP_STAGE_CODES],
      synthetic: true as const,
    };
    return [
      {
        ...common,
        id: `closure-${family}-normal-no-action`,
        mode: "normal" as const,
        sourceScenarioId: sourceScenarioId(family, "normal"),
        eligibleProblem: false,
        expectedDetected: false,
        expectedDisposition: "no-action" as const,
        attack: "none" as const,
        expectedSafeBehavior:
          "Normal variation is retained as a no-action baseline and is not counted as an eligible problem.",
        fixedSeed: `nexus-v2-${family}-normal`,
      },
      {
        ...common,
        id: `closure-${family}-single-beneficial`,
        mode: "single-fault" as const,
        sourceScenarioId: sourceScenarioId(
          family,
          "single-fault",
        ),
        eligibleProblem: true,
        expectedDetected: true,
        expectedDisposition: "beneficial" as const,
        attack: "none" as const,
        expectedSafeBehavior:
          "A bounded intervention completes every governed stage with a beneficial independent outcome.",
        fixedSeed: `nexus-v2-${family}-single`,
      },
      {
        ...common,
        id: `closure-${family}-cascade-beneficial`,
        mode: "cascade" as const,
        sourceScenarioId: sourceScenarioId(family, "cascade"),
        eligibleProblem: true,
        expectedDetected: true,
        expectedDisposition: "beneficial" as const,
        attack: "none" as const,
        expectedSafeBehavior:
          "Cross-domain symptoms retain one causal trace through delayed outcome learning.",
        fixedSeed: `nexus-v2-${family}-cascade`,
      },
      {
        ...common,
        id: `closure-${family}-conflict-beneficial`,
        mode: "conflicting-objectives" as const,
        sourceScenarioId: sourceScenarioId(
          family,
          "conflicting-objectives",
        ),
        eligibleProblem: true,
        expectedDetected: true,
        expectedDisposition: "beneficial" as const,
        attack:
          family === "infrastructure"
            ? ("expired-evidence" as const)
            : ("none" as const),
        expectedSafeBehavior:
          family === "infrastructure"
            ? "Expired approval evidence is rejected, renewed, and only then may the same artifact proceed."
            : "Objective conflict is exposed to human review and protected-group guardrails remain intact.",
        fixedSeed: `nexus-v2-${family}-conflict`,
      },
      {
        ...common,
        id: `closure-${family}-adversarial`,
        mode: "adversarial" as const,
        sourceScenarioId: sourceScenarioId(
          family,
          "adversarial",
        ),
        eligibleProblem: true,
        expectedDetected: true,
        expectedDisposition:
          ADVERSARIAL[family].disposition,
        attack: ADVERSARIAL[family].attack,
        expectedSafeBehavior:
          ADVERSARIAL[family].safeBehavior,
        fixedSeed: `nexus-v2-${family}-adversarial`,
      },
    ];
  });

export const CLOSED_LOOP_CORPUS_FINGERPRINT = sha256(
  CLOSED_LOOP_CERTIFICATION_CORPUS,
);

const STAGE_EVIDENCE: Record<
  ClosedLoopStageCode,
  ClosedLoopEvidenceKind[]
> = {
  detection: ["observation", "incident"],
  triage: ["triage"],
  diagnosis: ["hypothesis", "counterfactual"],
  planning: ["plan"],
  experiment: ["experiment"],
  authorization: ["approval"],
  deployment: ["artifact-binding", "deployment-telemetry"],
  outcome: ["outcome"],
  learning: ["lesson", "learning-proposal"],
  closure: ["closure"],
};

function terminalStatus(
  disposition: ClosedLoopDisposition,
): ClosedLoopStatus {
  if (disposition === "beneficial") {
    return "verified-beneficial";
  }
  if (disposition === "rolled-back") {
    return "rolled-back";
  }
  return "inconclusive";
}

function transitionPath(
  disposition: ClosedLoopDisposition,
): ClosedLoopStatus[] {
  if (disposition === "no-action") {
    return [
      "triaged",
      "diagnosing",
      "inconclusive",
      "learned",
      "closed",
    ];
  }
  if (disposition === "governance-denied") {
    return [
      "triaged",
      "diagnosing",
      "diagnosed",
      "planned",
      "experimenting",
      "awaiting-approval",
      "inconclusive",
      "learned",
      "closed",
    ];
  }
  if (disposition === "inconclusive") {
    return [
      "triaged",
      "diagnosing",
      "diagnosed",
      "planned",
      "experimenting",
      "awaiting-approval",
      "inconclusive",
      "learned",
      "closed",
    ];
  }
  return [
    "triaged",
    "diagnosing",
    "diagnosed",
    "planned",
    "experimenting",
    "awaiting-approval",
    "staged",
    "monitoring",
    terminalStatus(disposition),
    "learned",
    "closed",
  ];
}

function skippedStage(
  scenario: ClosedLoopCertificationScenario,
  stage: ClosedLoopStageCode,
): boolean {
  if (stage === "detection" || stage === "closure") {
    return false;
  }
  if (scenario.expectedDisposition === "no-action") {
    return true;
  }
  if (scenario.expectedDisposition === "governance-denied") {
    return ["authorization", "deployment"].includes(stage);
  }
  if (
    scenario.expectedDisposition === "inconclusive" &&
    scenario.attack === "wrong-diagnosis"
  ) {
    return [
      "planning",
      "experiment",
      "authorization",
      "deployment",
    ].includes(stage);
  }
  return false;
}

function evidenceKinds(
  scenario: ClosedLoopCertificationScenario,
  stage: ClosedLoopStageCode,
): ClosedLoopEvidenceKind[] {
  if (!skippedStage(scenario, stage)) {
    return STAGE_EVIDENCE[stage];
  }
  return [
    scenario.expectedDisposition === "governance-denied"
      ? "governance-denial"
      : "no-action",
  ];
}

function sourceRecordId(
  scenario: ClosedLoopCertificationScenario,
  stage: ClosedLoopStageCode,
): string {
  return `${stage}-${scenario.id}`;
}

export function buildCertifiedClosedLoopCase(
  scenario: ClosedLoopCertificationScenario,
  releaseArtifact: ClosedLoopReleaseArtifact,
  timestamp = "2026-07-18T18:00:00.000Z",
): ClosedLoopCase {
  let value = createClosedLoopCase({
    id: `closed-loop-case-${scenario.id}`,
    organizationId: "org-nexus-lab",
    workspaceId: "workspace-neo-angeles",
    title: `Certification: ${scenario.id}`,
    scenarioId: scenario.sourceScenarioId,
    scenarioFamily: scenario.family,
    eligibleProblem: scenario.eligibleProblem,
    ownerId: "human:certification-owner",
    correlationId: `corr-${scenario.id}`,
    causationId: `corpus-${CLOSED_LOOP_CORPUS_FINGERPRINT}`,
    releaseArtifact,
    scenarioTruthId: scenario.sourceScenarioId,
    seed: scenario.fixedSeed,
    policyVersion: "closed-loop-policy-2.0.0",
    createdAt: timestamp,
  });
  value = refreshClosedLoopCaseFingerprint({
    ...value,
    detected: scenario.expectedDetected,
    groupImpacts: [
      {
        groupId: `synthetic-${scenario.family}-protected`,
        populationSharePercent: 18,
        effect:
          scenario.expectedDisposition === "beneficial" ? 4 : 0,
        protected: true,
        severeHarm: false,
        synthetic: true,
      },
      {
        groupId: `synthetic-${scenario.family}-general`,
        populationSharePercent: 82,
        effect:
          scenario.expectedDisposition === "beneficial" ? 6 : 0,
        protected: false,
        severeHarm: false,
        synthetic: true,
      },
    ],
    fingerprint: "",
  });

  for (
    let stageIndex = 0;
    stageIndex < CLOSED_LOOP_STAGE_CODES.length;
    stageIndex += 1
  ) {
    const stage = CLOSED_LOOP_STAGE_CODES[stageIndex];
    const occurredAt = new Date(
      Date.parse(timestamp) + stageIndex * 60_000,
    ).toISOString();
    const evidence = evidenceKinds(scenario, stage).map(
      (kind, evidenceIndex) =>
        createClosedLoopEvidence({
          id: `evidence-${scenario.id}-${stage}-${kind}-${evidenceIndex}`,
          stage,
          kind,
          sourceRecordId: sourceRecordId(scenario, stage),
          correlationId: value.correlationId,
          causationId:
            stageIndex === 0
              ? value.causationId
              : sourceRecordId(
                  scenario,
                  CLOSED_LOOP_STAGE_CODES[stageIndex - 1],
                ),
          releaseArtifactFingerprint:
            releaseArtifact.fingerprint,
          payload: {
            scenarioId: scenario.id,
            stage,
            kind,
            expectedSafeBehavior:
              scenario.expectedSafeBehavior,
          },
          createdAt: occurredAt,
          expiresAt: new Date(
            Date.parse(timestamp) + 30 * 24 * 3_600_000,
          ).toISOString(),
        }),
    );
    value = addClosedLoopEvidence(value, evidence);
    value = updateClosedLoopStage(value, stage, {
      status: skippedStage(scenario, stage)
        ? "skipped"
        : "completed",
      occurredAt,
      note: scenario.expectedSafeBehavior,
    });
  }

  const fullTrace =
    scenario.expectedDisposition === "beneficial" ||
    scenario.expectedDisposition === "rolled-back";
  value = refreshClosedLoopCaseFingerprint({
    ...value,
    links: {
      ...value.links,
      ...(scenario.eligibleProblem
        ? {
            incidentId: `incident-${scenario.id}`,
            diagnosisId: `diagnosis-${scenario.id}`,
          }
        : {}),
      ...(fullTrace
        ? {
            planId: `plan-${scenario.id}`,
            deploymentId: `deployment-${scenario.id}`,
            outcomeId: `outcome-${scenario.id}`,
            lessonId: `lesson-${scenario.id}`,
            learningProposalId: `learning-proposal-${scenario.id}`,
          }
        : {}),
    },
    disposition: scenario.expectedDisposition,
    guardrails: {
      severeEscapeCount: 0,
      rollbackRequired:
        scenario.expectedDisposition === "rolled-back",
      rollbackCompleted:
        scenario.expectedDisposition === "rolled-back",
      expiredEvidenceBypassCount: 0,
    },
    compensations:
      scenario.expectedDisposition === "rolled-back"
        ? [
            {
              id: `compensation-${scenario.id}`,
              trigger:
                scenario.attack === "late-harm"
                  ? "guardrail-breach"
                  : "guardrail-breach",
              action: "deployment-rollback",
              sourceDeploymentId: `deployment-${scenario.id}`,
              inverseEvidenceId: `evidence-${scenario.id}-deployment-rollback`,
              status: "completed",
              idempotencyKey: `rollback-${scenario.id}`,
              completedAt: new Date(
                Date.parse(timestamp) + 9 * 60_000,
              ).toISOString(),
              detail:
                "The exact inverse was applied and verified before closure.",
            },
          ]
        : [],
    fingerprint: "",
  });

  for (
    const [index, status] of transitionPath(
      scenario.expectedDisposition,
    ).entries()
  ) {
    const command = `certify:${status}`;
    const idempotencyKey = `${scenario.id}:${index + 1}:${status}`;
    const occurredAt = new Date(
      Date.parse(timestamp) + (index + 1) * 60_000,
    ).toISOString();
    value = appendClosedLoopTransition(value, {
      to: status,
      actorId:
        status === "awaiting-approval" ||
        status === "staged" ||
        status === "closed"
          ? "human:certification-owner"
          : "system:certification-orchestrator",
      command,
      idempotencyKey,
      causationId: value.links.incidentId,
      evidenceIds: value.evidence
        .filter((item) => {
          if (status === "closed") {
            return item.stage === "closure";
          }
          return false;
        })
        .map((item) => item.id),
      occurredAt,
    });
    value = refreshClosedLoopCaseFingerprint({
      ...value,
      idempotency: [
        ...value.idempotency,
        {
          key: idempotencyKey,
          commandDigest: closedLoopCommandDigest(command, {
            scenarioId: scenario.id,
          }),
          command,
          resultingStatus: status,
          resultingRevision: value.revision,
          completedAt: occurredAt,
        },
      ],
      fingerprint: "",
    });
  }
  const closedAt = new Date(
    Date.parse(timestamp) + 20 * 60_000,
  ).toISOString();
  const terminalFingerprint = sha256({
    scenarioId: scenario.id,
    seed: scenario.fixedSeed,
    disposition: scenario.expectedDisposition,
    links: value.links,
  });
  return refreshClosedLoopCaseFingerprint({
    ...value,
    status: "closed",
    closedAt,
    updatedAt: closedAt,
    replay: {
      ...value.replay,
      terminalFingerprint,
      deterministic: true,
    },
    fingerprint: "",
  });
}
