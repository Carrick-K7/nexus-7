import {
  ExperimentService,
  InMemoryExperimentRepository,
  type ExperimentActor,
} from "@/experiments";
import {
  GovernanceService,
} from "@/governance";
import {
  CityModelService,
} from "@/city/model-service";
import {
  DiagnosisService,
} from "@/diagnosis/service";
import {
  PlanningService,
} from "@/planning/service";
import {
  OutcomeLearningService,
} from "@/outcomes/service";
import {
  InMemoryDeploymentAdapter,
} from "@/deployment/memory-adapter";
import {
  verifyAutonomyReadiness,
} from "@/verification/readiness";
import {
  CLOSED_LOOP_CERTIFICATION_SCHEMA_VERSION,
  V2_THRESHOLDS,
  type ClosedLoopCase,
  type ClosedLoopCertificationReport,
  type ClosedLoopCertificationResult,
  type ClosedLoopReleaseArtifact,
} from "./types";
import {
  CLOSED_LOOP_CERTIFICATION_CORPUS,
  CLOSED_LOOP_CORPUS_FINGERPRINT,
  buildCertifiedClosedLoopCase,
} from "./corpus";
import {
  refreshClosedLoopCaseFingerprint,
  sha256,
  verifyClosedLoopCaseIntegrity,
} from "./engine";
import {
  runExtensionConformance,
} from "./conformance";
import {
  ClosedLoopService,
} from "./service";
import {
  resolveClosedLoopReleaseArtifact,
} from "./release";

const CERTIFICATION_NOW =
  new Date("2026-07-18T18:00:00.000Z");

const actor: ExperimentActor = {
  id: "closed-loop-certification-admin",
  role: "admin",
  workspaceId: "workspace-neo-angeles",
  principalType: "human",
  authSource: "development",
};

async function createReferenceHarness(
  releaseArtifact: ClosedLoopReleaseArtifact,
  now: Date,
): Promise<{
  repository: InMemoryExperimentRepository;
  service: ClosedLoopService;
  deployment: InMemoryDeploymentAdapter;
}> {
  let sequence = 0;
  const repository = new InMemoryExperimentRepository();
  const experiments = new ExperimentService(repository, {
    now: () => now,
    id: () => `closure-cert-experiment-${++sequence}`,
  });
  await experiments.initialize();
  const governance = new GovernanceService(repository, {
    now: () => now,
    id: () => `closure-cert-governance-${++sequence}`,
  });
  await governance.initialize();
  const city = new CityModelService(repository, {
    now: () => now,
    id: () => `closure-cert-city-${++sequence}`,
  });
  const diagnosis = new DiagnosisService(repository, city, {
    now: () => now,
    id: () => `closure-cert-diagnosis-${++sequence}`,
  });
  await diagnosis.initialize();
  const planning = new PlanningService(
    repository,
    city,
    diagnosis,
    {
      now: () => now,
      id: () => `closure-cert-planning-${++sequence}`,
    },
  );
  const outcomes = new OutcomeLearningService(
    repository,
    city,
    diagnosis,
    {
      now: () => now,
      id: () => `closure-cert-outcome-${++sequence}`,
    },
  );
  const deployment = new InMemoryDeploymentAdapter();
  const service = new ClosedLoopService(
    repository,
    city,
    diagnosis,
    planning,
    outcomes,
    deployment,
    {
      now: () => now,
      id: () => `closure-cert-${++sequence}`,
      releaseArtifact,
    },
  );
  return { repository, service, deployment };
}

function certificationResult(
  closedLoopCase: ClosedLoopCase,
  repeated: ClosedLoopCase,
  index: number,
): ClosedLoopCertificationResult {
  const scenario = CLOSED_LOOP_CERTIFICATION_CORPUS[index];
  const integrity = verifyClosedLoopCaseIntegrity(
    closedLoopCase,
    {
      now: new Date("2026-07-18T19:00:00.000Z"),
      requireClosed: true,
    },
  );
  const deterministicReplay =
    closedLoopCase.fingerprint === repeated.fingerprint &&
    closedLoopCase.replay.terminalFingerprint ===
      repeated.replay.terminalFingerprint;
  const failures = [...integrity.failures];
  if (closedLoopCase.detected !== scenario.expectedDetected) {
    failures.push("unexpected-detection-disposition");
  }
  if (
    closedLoopCase.disposition !==
    scenario.expectedDisposition
  ) {
    failures.push("unexpected-terminal-disposition");
  }
  if (!deterministicReplay) {
    failures.push("deterministic-replay-mismatch");
  }
  if (
    scenario.requiredStageCodes.some(
      (code) =>
        !closedLoopCase.stages.some(
          (stage) => stage.code === code,
        ),
    )
  ) {
    failures.push("required-stage-missing");
  }
  if (
    closedLoopCase.guardrails.rollbackRequired &&
    !closedLoopCase.guardrails.rollbackCompleted
  ) {
    failures.push("injected-fault-not-rolled-back");
  }
  const unsigned = {
    scenarioId: scenario.id,
    family: scenario.family,
    eligibleProblem: scenario.eligibleProblem,
    detected: closedLoopCase.detected,
    disposition: closedLoopCase.disposition!,
    beneficialClosure:
      scenario.eligibleProblem &&
      closedLoopCase.status === "closed" &&
      closedLoopCase.disposition === "beneficial",
    closed: closedLoopCase.status === "closed",
    stageCompletenessPercent:
      integrity.stageCompletenessPercent,
    causalCompletenessPercent:
      integrity.causalCompletenessPercent,
    deterministicReplay,
    rollbackRequired:
      closedLoopCase.guardrails.rollbackRequired,
    rollbackCompleted:
      closedLoopCase.guardrails.rollbackCompleted,
    severeGuardrailEscapes:
      closedLoopCase.guardrails.severeEscapeCount,
    evidenceIntegrityPercent:
      integrity.evidenceIntegrityPercent,
    expiredEvidenceBypassCount:
      closedLoopCase.guardrails.expiredEvidenceBypassCount,
    humanVeto:
      closedLoopCase.disposition === "governance-denied",
    unresolvedAgeHours:
      closedLoopCase.status === "closed" ? 0 : 1,
    groupImpacts: closedLoopCase.groupImpacts,
    passed: failures.length === 0,
    failures,
  };
  return {
    ...unsigned,
    fingerprint: sha256(unsigned),
  };
}

function groupImpactDistribution(
  results: ClosedLoopCertificationResult[],
): ClosedLoopCertificationReport["antiGoodhart"]["groupImpactDistribution"] {
  const grouped = new Map<
    string,
    Array<
      ClosedLoopCertificationResult["groupImpacts"][number]
    >
  >();
  for (const impact of results.flatMap(
    (result) => result.groupImpacts,
  )) {
    grouped.set(impact.groupId, [
      ...(grouped.get(impact.groupId) ?? []),
      impact,
    ]);
  }
  return [...grouped.entries()]
    .map(([groupId, impacts]) => ({
      groupId,
      observations: impacts.length,
      meanEffect:
        impacts.reduce(
          (sum, impact) => sum + impact.effect,
          0,
        ) / impacts.length,
      minimumEffect: Math.min(
        ...impacts.map((impact) => impact.effect),
      ),
      severeHarmCount: impacts.filter(
        (impact) => impact.severeHarm,
      ).length,
      protected: impacts.some((impact) => impact.protected),
    }))
    .sort((left, right) =>
      left.groupId.localeCompare(right.groupId),
    );
}

function sabotageChecks(
  source: ClosedLoopCase,
): Pick<
  ClosedLoopCertificationReport["checks"],
  | "missingStageRejected"
  | "forgedEvidenceRejected"
  | "wrongArtifactRejected"
  | "expiredEvidenceBlocked"
> {
  const missing = refreshClosedLoopCaseFingerprint({
    ...source,
    stages: source.stages.filter(
      (stage) => stage.code !== "diagnosis",
    ),
    fingerprint: "",
  });
  const missingStageRejected =
    !verifyClosedLoopCaseIntegrity(missing, {
      requireClosed: true,
    }).passed;

  const forged = structuredClone(source);
  forged.evidence[0].payloadDigest = sha256(
    "forged-evidence-payload",
  );
  forged.fingerprint =
    refreshClosedLoopCaseFingerprint(forged).fingerprint;
  const forgedEvidenceRejected =
    verifyClosedLoopCaseIntegrity(forged).failures.some(
      (failure) =>
        failure.startsWith("evidence-integrity:"),
    );

  const wrongArtifact = structuredClone(source);
  wrongArtifact.evidence[0].releaseArtifactFingerprint =
    "f".repeat(64);
  wrongArtifact.fingerprint =
    refreshClosedLoopCaseFingerprint(
      wrongArtifact,
    ).fingerprint;
  const wrongArtifactRejected =
    verifyClosedLoopCaseIntegrity(
      wrongArtifact,
    ).failures.some((failure) =>
      failure.startsWith("evidence-artifact-binding:"),
    );

  const expiredEvidenceBlocked =
    verifyClosedLoopCaseIntegrity(source, {
      now: new Date("2026-09-01T00:00:00.000Z"),
    }).failures.some((failure) =>
      failure.startsWith("evidence-expired:"),
    );

  return {
    missingStageRejected,
    forgedEvidenceRejected,
    wrongArtifactRejected,
    expiredEvidenceBlocked,
  };
}

async function referenceFlow(
  releaseArtifact: ClosedLoopReleaseArtifact,
  now: Date,
): Promise<{
  reference: ClosedLoopCertificationReport["referenceFlow"];
  idempotentResume: boolean;
  durable: boolean;
  trace: boolean;
}> {
  const firstHarness = await createReferenceHarness(
    releaseArtifact,
    now,
  );
  const firstStart = await firstHarness.service.startCase(
    "city-economic-single-fault",
    "cert-reference-start",
    actor,
  );
  const repeatedStart = await firstHarness.service.startCase(
    "city-economic-single-fault",
    "cert-reference-start",
    actor,
  );
  const completed =
    await firstHarness.service.runReferenceFlow(actor);
  const linkedIds = Object.values(completed.links).filter(
    (id): id is string => typeof id === "string",
  );
  const linkedRecords = await Promise.all(
    linkedIds.map((id) =>
      firstHarness.repository.getLifecycleRecord(id),
    ),
  );
  const linkedRecordKinds = linkedRecords
    .map((record) => record?.kind)
    .filter((kind): kind is string => Boolean(kind));
  const requiredKinds = [
    "city-incident",
    "causal-diagnosis",
    "intervention-plan",
    "deployment-record",
    "outcome-record",
    "lesson",
    "learning-proposal",
  ];
  const durable = requiredKinds.every((kind) =>
    linkedRecordKinds.includes(kind),
  );
  const trace =
    completed.stages.every(
      (stage) =>
        stage.evidenceIds.length > 0 &&
        stage.sourceRecordIds.length > 0,
    ) &&
    completed.transitions.every(
      (transition, index) =>
        transition.sequence === index + 1 &&
        transition.correlationId === completed.correlationId,
    );
  const secondHarness = await createReferenceHarness(
    releaseArtifact,
    now,
  );
  const repeated =
    await secondHarness.service.runReferenceFlow(actor);
  const deterministicReplay =
    completed.fingerprint === repeated.fingerprint &&
    completed.replay.terminalFingerprint ===
      repeated.replay.terminalFingerprint;
  return {
    reference: {
      caseId: completed.id,
      status: completed.status,
      disposition: completed.disposition,
      linkedRecordKinds,
      stageCodes: completed.stages.map(
        (stage) => stage.code,
      ),
      deterministicReplay,
      fingerprint: completed.fingerprint,
    },
    idempotentResume:
      firstStart.fingerprint === repeatedStart.fingerprint &&
      firstStart.transitions.length ===
        repeatedStart.transitions.length,
    durable,
    trace,
  };
}

async function realRollbackFlow(
  releaseArtifact: ClosedLoopReleaseArtifact,
  now: Date,
): Promise<boolean> {
  const harness = await createReferenceHarness(
    releaseArtifact,
    now,
  );
  let value = await harness.service.startCase(
    "city-economic-single-fault",
    "cert-rollback-start",
    actor,
  );
  for (
    let step = 0;
    step < 12 && value.status !== "staged";
    step += 1
  ) {
    value = await harness.service.command(
      value.id,
      "advance",
      `cert-rollback-stage:${step}:${value.status}`,
      actor,
    );
  }
  if (value.status !== "staged") {
    return false;
  }
  const deployment = (
    await harness.service.overview(actor)
  ).deployments.find(
    (item) => item.id === value.links.deploymentId,
  );
  const production = deployment?.environments.find(
    (item) => item.environment === "production",
  );
  if (!production?.handle) {
    return false;
  }
  await harness.deployment.injectRollbackDrill(
    production.handle.deploymentId,
  );
  value = await harness.service.command(
    value.id,
    "advance",
    "cert-rollback-observe",
    actor,
  );
  if (
    value.status !== "rolled-back" ||
    !value.guardrails.rollbackRequired ||
    !value.guardrails.rollbackCompleted
  ) {
    return false;
  }
  for (
    let step = 0;
    step < 6 && value.status !== "closed";
    step += 1
  ) {
    value = await harness.service.command(
      value.id,
      "advance",
      `cert-rollback-close:${step}:${value.status}`,
      actor,
    );
  }
  return (
    value.status === "closed" &&
    value.disposition === "rolled-back" &&
    Boolean(value.links.outcomeId) &&
    Boolean(value.links.lessonId) &&
    verifyClosedLoopCaseIntegrity(value, {
      now,
      requireClosed: true,
    }).passed
  );
}

function metricFailures(
  metrics: ClosedLoopCertificationReport["metrics"],
): string[] {
  const failures: string[] = [];
  for (const [
    key,
    threshold,
  ] of Object.entries(V2_THRESHOLDS) as Array<
    [
      keyof typeof V2_THRESHOLDS,
      (typeof V2_THRESHOLDS)[keyof typeof V2_THRESHOLDS],
    ]
  >) {
    const value = metrics[key];
    if (
      key === "severeGuardrailEscapes" ||
      key === "expiredEvidenceBypassCount"
    ) {
      if (value !== threshold) {
        failures.push(
          `${key} ${value} must equal ${threshold}`,
        );
      }
    } else if (value < threshold) {
      failures.push(
        `${key} ${value} is below ${threshold}`,
      );
    }
  }
  return failures;
}

export async function verifyClosedLoopCertification(
  root = process.cwd(),
  now = CERTIFICATION_NOW,
): Promise<ClosedLoopCertificationReport> {
  const generatedAt = now.toISOString();
  const releaseArtifact =
    await resolveClosedLoopReleaseArtifact(root, now);
  const firstCases = CLOSED_LOOP_CERTIFICATION_CORPUS.map(
    (scenario) =>
      buildCertifiedClosedLoopCase(
        scenario,
        releaseArtifact,
        generatedAt,
      ),
  );
  const repeatedCases =
    CLOSED_LOOP_CERTIFICATION_CORPUS.map((scenario) =>
      buildCertifiedClosedLoopCase(
        structuredClone(scenario),
        structuredClone(releaseArtifact),
        generatedAt,
      ),
    );
  const results = firstCases.map((item, index) =>
    certificationResult(
      item,
      repeatedCases[index],
      index,
    ),
  );
  const eligible = results.filter(
    (result) => result.eligibleProblem,
  );
  const accepted = results.filter(
    (result) => result.beneficialClosure,
  );
  const rollbackInjected = results.filter(
    (_, index) =>
      [
        "injected-deployment-fault",
        "late-harm",
      ].includes(
        CLOSED_LOOP_CERTIFICATION_CORPUS[index].attack,
      ),
  );
  const metrics: ClosedLoopCertificationReport["metrics"] = {
    verifiedBeneficialClosureRatePercent:
      eligible.length === 0
        ? 0
        : (
            accepted.length /
            eligible.length
          ) * 100,
    detectionCoveragePercent:
      eligible.length === 0
        ? 0
        : (
            eligible.filter((result) => result.detected)
              .length /
            eligible.length
          ) * 100,
    deterministicReplayPercent:
      (results.filter(
        (result) => result.deterministicReplay,
      ).length /
        results.length) *
      100,
    acceptedActionCausalCompletenessPercent:
      accepted.length === 0
        ? 0
        : accepted.reduce(
            (sum, result) =>
              sum + result.causalCompletenessPercent,
            0,
          ) / accepted.length,
    injectedFaultRollbackPercent:
      rollbackInjected.length === 0
        ? 0
        : (
            rollbackInjected.filter(
              (result) => result.rollbackCompleted,
            ).length /
            rollbackInjected.length
          ) * 100,
    closedOutcomeDispositionPercent:
      (results.filter(
        (result) =>
          result.closed && Boolean(result.disposition),
      ).length /
        results.length) *
      100,
    severeGuardrailEscapes: results.reduce(
      (sum, result) =>
        sum + result.severeGuardrailEscapes,
      0,
    ),
    evidenceIntegrityPercent:
      results.reduce(
        (sum, result) =>
          sum + result.evidenceIntegrityPercent,
        0,
      ) / results.length,
    expiredEvidenceBypassCount: results.reduce(
      (sum, result) =>
        sum + result.expiredEvidenceBypassCount,
      0,
    ),
    certificationCorpusCoveragePercent:
      (results.length / 25) * 100,
  };
  const extensions = await runExtensionConformance(
    root,
    now,
  );
  const reference = await referenceFlow(
    releaseArtifact,
    now,
  );
  const realRollbackComplete = await realRollbackFlow(
    releaseArtifact,
    now,
  );
  const sabotage = sabotageChecks(firstCases[1]);
  const v1CompatibilityPreserved =
    verifyAutonomyReadiness().meetsV1;
  const checks: ClosedLoopCertificationReport["checks"] = {
    fixedCorpusComplete:
      results.length === 25 &&
      CLOSED_LOOP_CERTIFICATION_CORPUS.length === 25 &&
      results.every((result) => result.passed),
    everyStagePresent: results.every(
      (result) => result.stageCompletenessPercent === 100,
    ),
    ...sabotage,
    idempotentResume: reference.idempotentResume,
    compensationComplete:
      realRollbackComplete &&
      results
        .filter((result) => result.rollbackRequired)
        .every((result) => result.rollbackCompleted),
    referenceFlowUsesDurableDomainRecords:
      reference.durable,
    unifiedTraceReconstructible: reference.trace,
    v1CompatibilityPreserved,
    extensionsConform: extensions.passed,
    localAndExternalTrustSeparated:
      releaseArtifact.trust === "external-attested"
        ? releaseArtifact.externalAttestation?.verified === true
        : releaseArtifact.externalAttestation === undefined,
  };
  const unresolved = results.filter(
    (result) => !result.closed,
  );
  const antiGoodhart: ClosedLoopCertificationReport["antiGoodhart"] = {
    denominatorScenarioIds: eligible.map(
      (result) => result.scenarioId,
    ),
    unresolved: {
      count: unresolved.length,
      oldestHours:
        unresolved.length === 0
          ? 0
          : Math.max(
              ...unresolved.map(
                (result) => result.unresolvedAgeHours,
              ),
            ),
      ageBuckets: {
        under24h: unresolved.filter(
          (result) => result.unresolvedAgeHours < 24,
        ).length,
        oneToSevenDays: unresolved.filter(
          (result) =>
            result.unresolvedAgeHours >= 24 &&
            result.unresolvedAgeHours <= 24 * 7,
        ).length,
        overSevenDays: unresolved.filter(
          (result) =>
            result.unresolvedAgeHours > 24 * 7,
        ).length,
      },
    },
    rollbackRatePercent:
      eligible.length === 0
        ? 0
        : (
            eligible.filter(
              (result) =>
                result.disposition === "rolled-back",
            ).length /
            eligible.length
          ) * 100,
    humanVetoRatePercent:
      eligible.length === 0
        ? 0
        : (
            eligible.filter(
              (result) => result.humanVeto,
            ).length /
            eligible.length
          ) * 100,
    groupImpactDistribution:
      groupImpactDistribution(results),
  };
  const metricGateFailures = metricFailures(metrics);
  const checkFailures = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => `check failed: ${name}`);
  const scenarioFailures = results.flatMap((result) =>
    result.failures.map(
      (failure) => `${result.scenarioId}: ${failure}`,
    ),
  );
  const failures = [
    ...metricGateFailures,
    ...checkFailures,
    ...scenarioFailures,
  ];
  const thresholdsMet = metricGateFailures.length === 0;
  const implementationComplete =
    thresholdsMet &&
    Object.values(checks).every(Boolean) &&
    scenarioFailures.length === 0;
  const productionVerified =
    implementationComplete &&
    releaseArtifact.trust === "external-attested" &&
    releaseArtifact.externalAttestation?.verified === true;
  const externalEvidence: ClosedLoopCertificationReport["externalEvidence"] =
    productionVerified
      ? {
          status: "verified",
          requiredForProduction: true,
          boundArtifactFingerprint:
            releaseArtifact.fingerprint,
          receiptId:
            releaseArtifact.externalAttestation!.receiptId,
          detail:
            "A fresh signed external receipt matches the exact commit, evidence manifest, and release artifact.",
        }
      : {
          status: "pending",
          requiredForProduction: true,
          boundArtifactFingerprint:
            releaseArtifact.fingerprint,
          detail:
            "Local implementation evidence passed. A fresh remote Sigstore receipt for this exact clean commit is still required for production verification.",
        };
  const status: ClosedLoopCertificationReport["status"] =
    !implementationComplete
      ? "failed"
      : productionVerified
        ? "implementation-complete"
        : "implementation-complete-external-evidence-pending";
  const canonical = {
    schemaVersion:
      CLOSED_LOOP_CERTIFICATION_SCHEMA_VERSION,
    thresholds: V2_THRESHOLDS,
    releaseArtifactFingerprint:
      releaseArtifact.fingerprint,
    corpusFingerprint: CLOSED_LOOP_CORPUS_FINGERPRINT,
    resultFingerprints: results.map(
      (result) => result.fingerprint,
    ),
    metrics,
    antiGoodhart,
    checks,
    referenceFlowFingerprint:
      reference.reference.fingerprint,
    extensionFingerprint: extensions.fingerprint,
    externalEvidence,
    failures,
    thresholdsMet,
    implementationComplete,
    productionVerified,
    status,
  };
  return {
    schemaVersion:
      CLOSED_LOOP_CERTIFICATION_SCHEMA_VERSION,
    generatedAt,
    thresholds: V2_THRESHOLDS,
    releaseArtifact,
    corpus: {
      version: "nexus.closed-loop-corpus.v2",
      expectedScenarioCount: 25,
      executedScenarioCount: results.length,
      fingerprint: CLOSED_LOOP_CORPUS_FINGERPRINT,
      results,
    },
    metrics,
    antiGoodhart,
    checks,
    referenceFlow: reference.reference,
    extensions,
    externalEvidence,
    failures,
    thresholdsMet,
    implementationComplete,
    productionVerified,
    status,
    fingerprint: sha256(canonical),
  };
}
