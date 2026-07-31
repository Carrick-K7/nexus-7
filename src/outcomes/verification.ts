import {
  createHash,
} from "node:crypto";
import {
  readFile,
} from "node:fs/promises";
import {
  resolve,
} from "node:path";
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
  stableStringify,
} from "@/simulation/core/random";
import {
  rebuildLessonRegistry,
} from "./engine";
import {
  OutcomeLearningService,
} from "./service";
import {
  OUTCOME_LEARNING_ACCEPTANCE_SCHEMA_VERSION,
  type OutcomeLearningAcceptanceReport,
  type OutcomeRecord,
} from "./types";

const ACTOR: ExperimentActor = {
  id: "outcome-acceptance-admin",
  role: "admin",
  workspaceId: "workspace-neo-angeles",
  principalType: "human",
  authSource: "development",
};

function hash(value: unknown): string {
  return createHash("sha256")
    .update(stableStringify(value), "utf8")
    .digest("hex");
}

export async function verifyOutcomeLearningAcceptance(
  root = process.cwd(),
  now = new Date("2026-07-18T17:00:00.000Z"),
): Promise<OutcomeLearningAcceptanceReport> {
  let currentTime = now;
  let sequence = 0;
  const repository = new InMemoryExperimentRepository();
  const experiments = new ExperimentService(repository, {
    now: () => currentTime,
    id: () => `outcome-acceptance-experiment-${++sequence}`,
  });
  await experiments.initialize();
  const governance = new GovernanceService(repository, {
    now: () => currentTime,
    id: () => `outcome-acceptance-governance-${++sequence}`,
  });
  await governance.initialize();
  const city = new CityModelService(repository, {
    now: () => currentTime,
    id: () => `outcome-acceptance-city-${++sequence}`,
  });
  const diagnosis = new DiagnosisService(repository, city, {
    now: () => currentTime,
    id: () => `outcome-acceptance-diagnosis-${++sequence}`,
  });
  await diagnosis.initialize();
  const planning = new PlanningService(
    repository,
    city,
    diagnosis,
    {
      now: () => currentTime,
      id: () =>
        `outcome-acceptance-planning-${++sequence}`,
    },
  );
  const outcomes = new OutcomeLearningService(
    repository,
    city,
    diagnosis,
    {
      now: () => currentTime,
      id: () => `outcome-acceptance-${++sequence}`,
    },
  );

  async function stage(
    scenarioId: string,
  ): Promise<string> {
    const plan = await planning.createPlanForScenario(
      scenarioId,
      ACTOR,
      { maximumCost: 500 },
    );
    const approved = await planning.approvePlan(
      plan.id,
      plan.decision.selectedCandidateId!,
      "Acceptance review confirmed bounded evidence and safeguards.",
      ACTOR,
    );
    return (await planning.stagePlan(approved.id, ACTOR)).id;
  }

  const beneficial = await outcomes.evaluateStagedPlan(
    await stage("city-economic-single-fault"),
    ACTOR,
  );
  await outcomes.closeIncidentWithOutcome(
    beneficial.id,
    "Long-horizon beneficial outcome and lesson disposition retained.",
    ACTOR,
  );
  let overview = await outcomes.overview(ACTOR);
  const beneficialLesson = overview.lessons.find(
    (lesson) => lesson.id === beneficial.currentLessonId,
  )!;
  const beneficialPlaybook = overview.playbooks.find(
    (playbook) =>
      playbook.sourceLessonIds.includes(
        beneficialLesson.id,
      ),
  )!;
  const applicable = await outcomes.assessPlaybook(
    beneficialPlaybook.id,
    beneficial.planId,
    "economic",
    ACTOR,
  );
  const drifted = await outcomes.assessPlaybook(
    beneficialPlaybook.id,
    beneficial.planId,
    "infrastructure",
    ACTOR,
  );
  const proposal = await outcomes.proposeGovernedChange(
    beneficialLesson.id,
    "test",
    "Retain long-horizon economic effect regression",
    "Detect loss of the verified synthetic effect before release.",
    ACTOR,
  );
  await outcomes.deprecateLesson(
    beneficialLesson.id,
    "A newer response policy will replace this versioned lesson.",
    ACTOR,
  );

  const neutral = await outcomes.evaluateStagedPlan(
    await stage("city-infrastructure-cascade"),
    ACTOR,
  );
  await outcomes.closeIncidentWithOutcome(
    neutral.id,
    "Neutral long-horizon result retained as insufficient to learn.",
    ACTOR,
  );

  const initiallyBeneficial =
    await outcomes.evaluateStagedPlan(
      await stage("city-economic-cascade"),
      ACTOR,
    );
  await outcomes.closeIncidentWithOutcome(
    initiallyBeneficial.id,
    "Initial long-horizon benefit recorded before delayed evidence.",
    ACTOR,
  );
  currentTime = new Date(
    currentTime.getTime() + 24 * 3_600_000,
  );
  const lateHarm = await outcomes.recordLateEvidence(
    initiallyBeneficial.id,
    {
      classification: "fact",
      source: "acceptance-delayed-energy-monitor",
      metric: "energy",
      delta: -100,
      appliesAtOrAfterTick: 100,
      rationale:
        "Delayed critical energy harm reverses the earlier conclusion.",
    },
    ACTOR,
  );

  const attributionSource =
    await outcomes.evaluateStagedPlan(
      await stage("city-economic-conflicting-objectives"),
      ACTOR,
    );
  const nonGuardrailHarm =
    await outcomes.recordLateEvidence(
      attributionSource.id,
      {
        classification: "fact",
        source: "acceptance-delayed-economic-monitor",
        metric: "gdp",
        delta: -2_000,
        appliesAtOrAfterTick: 100,
        rationale:
          "A delayed target reversal creates a harmful result without a critical guardrail escape.",
      },
      ACTOR,
    );
  const underReview =
    await outcomes.flagAttributionForReview(
      nonGuardrailHarm.id,
      "Human reviewer disputes the attribution and requests independent reassessment.",
      ACTOR,
    );

  overview = await outcomes.overview(ACTOR);
  const records = overview.outcomes;
  const windows = records.flatMap(
    (outcome) => outcome.windows,
  );
  const rebuildA = rebuildLessonRegistry(
    structuredClone(records),
  );
  const rebuildB = rebuildLessonRegistry(
    structuredClone(records).reverse(),
  );
  const verdicts = new Set(
    records.map((outcome) => outcome.verdict),
  );
  const lessonKinds = new Set(
    overview.lessons.map((lesson) => lesson.kind),
  );
  const lessonStatuses = new Set(
    overview.lessons.map((lesson) => lesson.status),
  );
  const incidentRecord =
    await repository.getLifecycleRecord(
      lateHarm.incidentId,
    );
  const priorLateLesson = overview.lessons.find(
    (lesson) =>
      lesson.id ===
      `lesson-${initiallyBeneficial.id}-r1`,
  );
  const priorLatePlaybook = overview.playbooks.find(
    (playbook) =>
      playbook.sourceLessonIds.includes(
        priorLateLesson?.id ?? "",
      ),
  );
  const observerSource = await readFile(
    resolve(
      root,
      "src/components/observer/ObserverDashboard.tsx",
    ),
    "utf8",
  );
  const translationSource = await readFile(
    resolve(root, "src/i18n/translations.ts"),
    "utf8",
  );
  const observerLearningSurfaceDeclared = [
    "learningObservatory",
    "outcomeWindows",
    "predictionError",
    "lessonRegistry",
    "governedLearning",
  ].every(
    (token) =>
      observerSource.includes(token) &&
      translationSource.includes(token),
  );

  const checks: OutcomeLearningAcceptanceReport["checks"] = {
    evaluatorIndependent: records.every(
      (outcome) =>
        outcome.evaluator.independentFromProposer &&
        outcome.evaluator.id ===
          "independent-outcome-evaluator-v1",
    ),
    threeDelayedWindows: records.every(
      (outcome) =>
        stableStringify(
          outcome.windows.map((window) => [
            window.window,
            window.horizonTicks,
          ]),
        ) ===
        stableStringify([
          ["short", 15],
          ["medium", 60],
          ["long", 180],
        ]),
    ),
    frozenHistoricalSeasonalComparisons: windows.every(
      (window) =>
        Number.isFinite(
          window.comparisons.frozenCounterfactualValue,
        ) &&
        Number.isFinite(
          window.comparisons.historicalSourceValue,
        ) &&
        Number.isFinite(
          window.comparisons.sameSeedSeasonalValue,
        ),
    ),
    verdictVocabularyCovered:
      ["beneficial", "harmful", "neutral", "inconclusive"].every(
        (verdict) => verdicts.has(verdict as OutcomeRecord["verdict"]),
      ),
    lateHarmRecomputedAndIncidentReopened:
      lateHarm.revision === 2 &&
      lateHarm.verdict === "harmful" &&
      lateHarm.reopenedIncident &&
      incidentRecord?.status === "detected",
    allResultKindsRetained:
      ["success", "failure", "rollback", "inconclusive"].every(
        (kind) =>
          lessonKinds.has(
            kind as (typeof overview.lessons)[number]["kind"],
          ),
      ),
    lessonLifecycleCovered:
      ["draft", "validated", "deprecated", "invalidated"].every(
        (status) =>
          lessonStatuses.has(
            status as (typeof overview.lessons)[number]["status"],
          ),
      ),
    harmfulNeverPositive:
      overview.gates.harmfulPositiveRetrievalCount === 0 &&
      overview.lessons
        .filter(
          (lesson) =>
            lesson.kind === "failure" ||
            lesson.kind === "rollback",
        )
        .every(
          (lesson) => !lesson.positiveRetrievalEligible,
        ),
    invalidationPropagatesToPlaybooks:
      priorLateLesson?.status === "invalidated" &&
      priorLatePlaybook?.status === "invalidated" &&
      overview.gates.invalidLessonActivePlaybookCount === 0,
    playbookContextRechecked:
      applicable.applicable &&
      !drifted.applicable &&
      drifted.failures.includes(
        "scenarioFamilyMatches",
      ),
    governedChangeCannotBypassRelease:
      proposal.governanceRoute ===
        "existing-controlled-iteration" &&
      proposal.bypassAllowed === false &&
      proposal.requiredGates.includes("human-approval") &&
      overview.gates.governedProposalBypassCount === 0,
    deterministicMemoryRebuild:
      stableStringify(rebuildA) === stableStringify(rebuildB),
    closedIncidentDispositionComplete:
      overview.gates
        .resolvedIncidentOutcomeCoveragePercent === 100 &&
      overview.gates
        .completedOutcomeLessonDispositionPercent === 100,
    humanAttributionReviewSupported:
      underReview.status === "under-review" &&
      underReview.verdict === "inconclusive" &&
      underReview.lessonDisposition === "requires-review",
    observerLearningSurfaceDeclared,
  };
  const failures = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([check]) => `${check} failed`);
  const withoutFingerprint = {
    schemaVersion:
      OUTCOME_LEARNING_ACCEPTANCE_SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    checks,
    metrics: {
      outcomes: records.length,
      outcomeWindows: windows.length,
      lessons: overview.lessons.length,
      playbooks: overview.playbooks.length,
      governedProposals: overview.proposals.length,
      verdictsCovered: verdicts.size,
      deterministicReplayPercent:
        overview.gates.deterministicOutcomeReplayPercent,
      resolvedIncidentCoveragePercent:
        overview.gates
          .resolvedIncidentOutcomeCoveragePercent,
      harmfulPositiveRetrievalCount:
        overview.gates.harmfulPositiveRetrievalCount,
    },
    failures,
    passed: failures.length === 0,
  };
  return {
    ...withoutFingerprint,
    fingerprint: hash(withoutFingerprint),
  };
}
