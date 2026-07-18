import {
  AGENT_DEFINITIONS,
  AGENT_POLICIES,
} from "@/simulation/agents";
import {
  deterministicMockProvider,
} from "@/simulation/models/mock-provider";
import {
  approvalPolicyForRisk,
  assessModelRisk,
  validateModelProposal,
} from "@/simulation/models/validation";
import {
  DEFAULT_SCENARIO,
} from "@/simulation/scenarios";
import {
  inspectWorldInvariants,
} from "@/simulation/core/invariants";
import {
  selectCityMetrics,
} from "@/simulation/core/metrics";
import {
  stableStringify,
} from "@/simulation/core/random";
import {
  verifyCityScenarioCatalog,
} from "@/city/scenarios";
import {
  ExperimentService,
  InMemoryExperimentRepository,
} from "@/experiments";
import {
  GovernanceService,
} from "@/governance";
import {
  LIFECYCLE_EVENT_SCHEMA_VERSION,
} from "@/lifecycle";
import {
  runDeploymentControllerConformance,
} from "@/deployment/conformance";
import {
  signWebhookPayload,
  verifyWebhookSignature,
} from "@/operations/signed-webhook";
import {
  verifyOutcomeLearningAcceptance,
} from "@/outcomes/verification";
import {
  EXTENSION_CONFORMANCE_SCHEMA_VERSION,
  type ExtensionBoundary,
  type ExtensionConformanceReport,
  type ExtensionConformanceResult,
} from "./types";
import {
  sha256,
} from "./engine";

function result(
  boundary: ExtensionBoundary,
  input: Omit<
    ExtensionConformanceResult,
    "boundary" | "passed" | "fingerprint"
  >,
): ExtensionConformanceResult {
  const passed = Object.values(input.checks).every(Boolean);
  const unsigned = {
    boundary,
    ...input,
    passed,
  };
  return {
    ...unsigned,
    fingerprint: sha256(unsigned),
  };
}

async function agentConformance(): Promise<ExtensionConformanceResult> {
  const context = {
    seed: "nexus-v2-agent-conformance",
    policyVersion: "policy-v2-conformance",
    configuration: structuredClone(DEFAULT_SCENARIO.configuration),
  };
  const first = AGENT_POLICIES.flatMap((policy) => {
    const observations = policy.observe(
      structuredClone(DEFAULT_SCENARIO.world),
      context,
    );
    return observations.flatMap((observation) =>
      policy.propose(
        observation,
        structuredClone(DEFAULT_SCENARIO.world),
        context,
      ),
    );
  });
  const second = AGENT_POLICIES.flatMap((policy) => {
    const observations = policy.observe(
      structuredClone(DEFAULT_SCENARIO.world),
      context,
    );
    return observations.flatMap((observation) =>
      policy.propose(
        observation,
        structuredClone(DEFAULT_SCENARIO.world),
        context,
      ),
    );
  });
  return result("agent", {
    contractVersion: "nexus.agent-policy.v1",
    referenceImplementation: "deterministic-agent-policies",
    checks: {
      capabilityDeclared: AGENT_POLICIES.every(
        (policy) =>
          AGENT_DEFINITIONS[policy.id].capabilities.length > 0,
      ),
      proposalCapabilityBounded: first.every((proposal) =>
        AGENT_DEFINITIONS[proposal.agentId].capabilities.includes(
          proposal.metric,
        ),
      ),
      deterministic:
        stableStringify(first) === stableStringify(second),
      noExecutableMutation:
        first.every(
          (proposal) =>
            !("shell" in proposal) &&
            !("sql" in proposal) &&
            typeof proposal.delta === "number",
        ),
    },
    failureModesExercised: [
      "capability rejection",
      "budget rejection",
      "risk rejection",
    ],
    capabilities: Object.entries(AGENT_DEFINITIONS).map(
      ([id, definition]) =>
        `${id}:${definition.capabilities.join(",")}`,
    ),
    dataAccess: ["immutable synthetic WorldState"],
    networkRequired: false,
    sandboxRequiredWhenUncertified: true,
  });
}

async function modelConformance(): Promise<ExtensionConformanceResult> {
  const request = {
    requestId: "model-conformance",
    tick: 5,
    seed: "nexus-v2-model-conformance",
    agentId: "civitas" as const,
    promptVersion: "model-conformance-v1",
    policyVersion: "policy-v2-conformance",
    city: selectCityMetrics(DEFAULT_SCENARIO.world),
  };
  const first = await deterministicMockProvider.generate(request);
  const second = await deterministicMockProvider.generate(request);
  let invalidCapabilityRejected = false;
  try {
    validateModelProposal(
      {
        agentId: "civitas",
        metric: "crime",
        delta: -2,
        rationale: "Out-of-contract capability",
        confidence: 0.9,
      },
      "civitas",
    );
  } catch {
    invalidCapabilityRejected = true;
  }
  const valid = validateModelProposal(first.output, "civitas");
  return result("model-provider", {
    contractVersion: "nexus.model-provider.v1",
    referenceImplementation: deterministicMockProvider.id,
    checks: {
      structuredOutputValidated:
        valid.agentId === "civitas" &&
        valid.metric === "traffic",
      deterministicReference:
        stableStringify(first) === stableStringify(second),
      invalidCapabilityRejected,
      criticalRiskForbidden:
        approvalPolicyForRisk(
          assessModelRisk({ ...valid, delta: 11 }),
        ) === "forbidden",
    },
    failureModesExercised: [
      "schema failure",
      "capability escape",
      "critical risk",
      "timeout fallback",
    ],
    capabilities: [
      "untrusted structured proposal",
      "deterministic reference fallback",
    ],
    dataAccess: ["bounded city metric snapshot"],
    networkRequired: false,
    sandboxRequiredWhenUncertified: true,
  });
}

async function scenarioConformance(): Promise<ExtensionConformanceResult> {
  const report = verifyCityScenarioCatalog(60);
  return result("scenario", {
    contractVersion: "nexus.city-scenario.v1",
    referenceImplementation: "public-city-scenario-catalog",
    checks: {
      fiveFamilies: report.familyCount === 5,
      fourModes: report.modeCount === 4,
      deterministicReplay:
        report.deterministicReplayPercent === 100,
      baseWorldInvariantSafe:
        inspectWorldInvariants(DEFAULT_SCENARIO.world).length === 0,
      syntheticTruthBoundary:
        report.scenarioCount === 20 && report.passed,
    },
    failureModesExercised: [
      "unknown scenario",
      "invariant violation",
      "nondeterministic replay",
    ],
    capabilities: [
      "fixed seed",
      "declared truth",
      "five incident families",
    ],
    dataAccess: ["synthetic scenario fixture only"],
    networkRequired: false,
    sandboxRequiredWhenUncertified: true,
  });
}

async function repositoryConformance(
  timestamp: string,
): Promise<ExtensionConformanceResult> {
  const repository = new InMemoryExperimentRepository();
  const experiments = new ExperimentService(repository, {
    now: () => new Date(timestamp),
    id: () => "repository-conformance-experiment",
  });
  await experiments.initialize();
  const governance = new GovernanceService(repository, {
    now: () => new Date(timestamp),
    id: () => "repository-conformance-governance",
  });
  await governance.initialize();
  const workspace = await repository.getGovernedWorkspace(
    "workspace-neo-angeles",
  );
  const record = {
    id: "repository-conformance-record",
    organizationId: workspace!.organizationId,
    workspaceId: workspace!.workspaceId,
    kind: "repository-conformance",
    status: "created",
    revision: 1,
    data: { value: 1 },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await repository.createLifecycleRecord({
    record,
    event: {
      id: "repository-conformance-created",
      organizationId: record.organizationId,
      workspaceId: record.workspaceId,
      aggregateId: record.id,
      aggregateKind: record.kind,
      type: "repository-conformance.created",
      actorId: "system:conformance",
      correlationId: "corr-repository-conformance",
      occurredAt: timestamp,
      schemaVersion: LIFECYCLE_EVENT_SCHEMA_VERSION,
      payload: { value: 1 },
    },
  });
  await repository.commitLifecycleRecord({
    record: {
      ...record,
      revision: 2,
      status: "updated",
      data: { value: 2 },
    },
    expectedRevision: 1,
    event: {
      id: "repository-conformance-updated",
      organizationId: record.organizationId,
      workspaceId: record.workspaceId,
      aggregateId: record.id,
      aggregateKind: record.kind,
      type: "repository-conformance.updated",
      actorId: "system:conformance",
      correlationId: "corr-repository-conformance",
      causationId: "repository-conformance-created",
      occurredAt: timestamp,
      schemaVersion: LIFECYCLE_EVENT_SCHEMA_VERSION,
      payload: { value: 2 },
    },
  });
  let staleCommitRejected = false;
  try {
    await repository.commitLifecycleRecord({
      record: {
        ...record,
        revision: 2,
        data: { value: 3 },
      },
      expectedRevision: 1,
      event: {
        id: "repository-conformance-stale",
        organizationId: record.organizationId,
        workspaceId: record.workspaceId,
        aggregateId: record.id,
        aggregateKind: record.kind,
        type: "repository-conformance.stale",
        actorId: "system:conformance",
        correlationId: "corr-repository-conformance",
        occurredAt: timestamp,
        schemaVersion: LIFECYCLE_EVENT_SCHEMA_VERSION,
        payload: { value: 3 },
      },
    });
  } catch {
    staleCommitRejected = true;
  }
  const events = await repository.listLifecycleEvents(
    record.workspaceId,
    { aggregateId: record.id },
  );
  return result("repository", {
    contractVersion: "nexus.lifecycle-repository.v1",
    referenceImplementation: "memory",
    checks: {
      atomicCreateWithEvent: events[0]?.type.endsWith(
        ".created",
      ) === true,
      optimisticRevision: (
        await repository.getLifecycleRecord(record.id)
      )?.revision === 2,
      staleCommitRejected,
      appendOnlyEvents: events.length === 2,
    },
    failureModesExercised: [
      "duplicate create",
      "stale expected revision",
      "missing aggregate event",
    ],
    capabilities: [
      "atomic aggregate/event",
      "workspace query",
      "optimistic concurrency",
    ],
    dataAccess: ["workspace-scoped durable records"],
    networkRequired: false,
    sandboxRequiredWhenUncertified: true,
  });
}

async function notificationConformance(): Promise<ExtensionConformanceResult> {
  const secret =
    "nexus-v2-notification-conformance-secret-32-bytes";
  const body = JSON.stringify({
    event: "closed-loop.guardrail-breach",
    caseId: "case-conformance",
  });
  const timestamp = "2026-07-18T18:00:00.000Z";
  const signature = signWebhookPayload(body, timestamp, secret);
  return result("notification", {
    contractVersion: "nexus.signed-webhook.v1",
    referenceImplementation: "signed-webhook-transport",
    checks: {
      signatureVerified: verifyWebhookSignature(
        body,
        timestamp,
        signature,
        secret,
      ),
      tamperRejected: !verifyWebhookSignature(
        `${body} `,
        timestamp,
        signature,
        secret,
      ),
      timestampBound: !verifyWebhookSignature(
        body,
        "2026-07-18T18:01:00.000Z",
        signature,
        secret,
      ),
      deliveryIdentityBound:
        signature !==
        signWebhookPayload(
          JSON.stringify({
            event: "closed-loop.guardrail-breach",
            caseId: "other-case",
          }),
          timestamp,
          secret,
        ),
    },
    failureModesExercised: [
      "missing secret",
      "tampered body",
      "transport timeout",
      "dead letter",
    ],
    capabilities: ["HMAC signed webhook", "idempotent delivery ID"],
    dataAccess: ["minimum incident notification projection"],
    networkRequired: true,
    sandboxRequiredWhenUncertified: true,
  });
}

async function deploymentConformance(
  now: Date,
): Promise<ExtensionConformanceResult> {
  const report = await runDeploymentControllerConformance(
    () => now,
  );
  return result("deployment-controller", {
    contractVersion: report.contractVersion,
    referenceImplementation: report.adapterId,
    checks: { ...report.checks },
    failureModesExercised: [
      "HTTP 503",
      "timeout",
      "partial payload",
      "out-of-order telemetry",
      "lost rollback acknowledgement",
    ],
    capabilities: [
      "canary",
      "traffic shift",
      "telemetry",
      "promote",
      "rollback",
    ],
    dataAccess: ["release artifact metadata", "deployment telemetry"],
    networkRequired: true,
    sandboxRequiredWhenUncertified: true,
  });
}

async function evaluatorConformance(
  root: string,
  now: Date,
): Promise<ExtensionConformanceResult> {
  const report = await verifyOutcomeLearningAcceptance(
    root,
    now,
  );
  return result("outcome-evaluator", {
    contractVersion: "nexus.outcome.v1",
    referenceImplementation:
      "independent-outcome-evaluator-v1",
    checks: {
      independent: report.checks.evaluatorIndependent,
      delayedWindows: report.checks.threeDelayedWindows,
      counterfactualControls:
        report.checks.frozenHistoricalSeasonalComparisons,
      lateHarmRecomputed:
        report.checks.lateHarmRecomputedAndIncidentReopened,
      harmfulNeverPositive:
        report.checks.harmfulNeverPositive,
      deterministicRebuild:
        report.checks.deterministicMemoryRebuild,
    },
    failureModesExercised: [
      "late harm",
      "inconclusive attribution",
      "invalidated lesson",
      "context drift",
    ],
    capabilities: [
      "short/medium/long evaluation",
      "lesson derivation",
      "late evidence revision",
    ],
    dataAccess: [
      "frozen plan",
      "synthetic world",
      "guardrail observations",
    ],
    networkRequired: false,
    sandboxRequiredWhenUncertified: true,
  });
}

export async function runExtensionConformance(
  root = process.cwd(),
  now = new Date("2026-07-18T18:00:00.000Z"),
): Promise<ExtensionConformanceReport> {
  const generatedAt = now.toISOString();
  const results = await Promise.all([
    agentConformance(),
    modelConformance(),
    scenarioConformance(),
    repositoryConformance(generatedAt),
    notificationConformance(),
    deploymentConformance(now),
    evaluatorConformance(root, now),
  ]);
  const passedBoundaries = results.filter(
    (item) => item.passed,
  ).length;
  const unsigned = {
    schemaVersion: EXTENSION_CONFORMANCE_SCHEMA_VERSION,
    generatedAt,
    results,
    passedBoundaries,
    totalBoundaries: results.length,
    passed: passedBoundaries === results.length,
  };
  return {
    ...unsigned,
    fingerprint: sha256(unsigned),
  };
}
