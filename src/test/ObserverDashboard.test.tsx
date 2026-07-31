import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import ObserverDashboard from "@/components/observer/ObserverDashboard";
import { useNexusStore } from "@/stores/nexus-store";
import {
  CITY_METRIC_DICTIONARY,
  projectCoherentCitySnapshot,
} from "@/city/ontology";
import type {
  CityModelOverview,
} from "@/city/model-types";
import type {
  DiagnosisOverview,
} from "@/diagnosis/types";
import {
  assessDiagnosticTrust,
  buildCausalDiagnosis,
  buildDiagnosticCalibration,
  buildSyntheticDiagnosticIncident,
} from "@/diagnosis/engine";
import {
  PUBLIC_CITY_SCENARIOS,
  materializeCityScenario,
} from "@/city/scenarios";
import type {
  PlanningOverview,
} from "@/planning/types";
import {
  buildInterventionPlan,
} from "@/planning/engine";
import type {
  OutcomeLearningOverview,
} from "@/outcomes/types";
import {
  buildGovernedLearningProposal,
  buildOutcome,
  buildResponsePlaybook,
  deriveLesson,
} from "@/outcomes/engine";

async function settleObserverEffects(): Promise<void> {
  await act(
    () =>
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, 0);
      }),
  );
}

describe("ObserverDashboard", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("No API fixture configured")),
    );
    const store = useNexusStore.getState();
    store.resetSimulation();
    store.pauseSimulation();
    store.setLanguage("en");

    for (let index = 0; index < 30; index += 1) {
      useNexusStore.getState().stepSimulationOnce();
    }
    useNexusStore.getState().verifySimulationReplay();
  });

  it("renders the shared ontology, scenario gate, and synthetic boundary", async () => {
    const overview: CityModelOverview = {
      schemaVersion: "nexus.city-model-overview.v1",
      generatedAt: "2026-07-18T10:00:00.000Z",
      ontology: {
        version: "nexus.city-ontology.v1",
        metrics: CITY_METRIC_DICTIONARY,
      },
      snapshot: projectCoherentCitySnapshot(
        useNexusStore.getState().simulation.world,
      ),
      objectives: [],
      guardrails: [],
      incidents: [],
      scenarioTruth: [],
      scenarioVerification: {
        schemaVersion: "nexus.city-scenario-verification.v1",
        scenarioCount: 20,
        familyCount: 5,
        modeCount: 4,
        deterministicReplayPercent: 100,
        precisionPercent: 100,
        recallPercent: 100,
        averageDetectionDelayTicks: 0,
        invariantViolations: [],
        results: [],
        passed: true,
      },
      events: [],
      syntheticBoundary:
        "All residents and outcomes are synthetic lab constructs, not claims about real people.",
    };
    const diagnosis: DiagnosisOverview = {
      schemaVersion: "nexus.diagnosis-overview.v1",
      generatedAt: "2026-07-18T10:00:00.000Z",
      diagnoses: [],
      calibration: {
        schemaVersion: "nexus.diagnostic-calibration.v1",
        generatedAt: "2026-07-18T10:00:00.000Z",
        sampleCount: 45,
        brierScore: 0.08,
        expectedCalibrationError: 0.12,
        top3RootCauseHitRatePercent: 100,
        byAgent: [],
        byFamily: [],
        passed: true,
        fingerprint: "calibration-fingerprint",
      },
      trust: {
        schemaVersion: "nexus.diagnostic-trust.v1",
        assessedAt: "2026-07-18T10:00:00.000Z",
        environment: "synthetic-lab",
        dataDistributionShift: 0,
        policyEffectShift: 0,
        modelOutputShift: 0,
        calibrationPassed: true,
        mode: "active",
        automationAllowed: true,
        reasons: ["Within policy"],
      },
      events: [],
      gates: {
        minimumExperimentConfidence: 0.65,
        diagnosedWithAlternativeAndCounterevidencePercent: 100,
        deterministicCounterfactualReplayPercent: 100,
        lowConfidenceAutomationAttempts: 0,
      },
      evidenceBoundary:
        "Structured evidence only; never hidden model chain-of-thought.",
    };
    const planning: PlanningOverview = {
      schemaVersion: "nexus.planning-overview.v1",
      generatedAt: "2026-07-18T10:00:00.000Z",
      plans: [],
      events: [],
      gates: {
        plansWithNoActionAndTwoCandidatesPercent: 100,
        deterministicExperimentReplayPercent: 100,
        firstSampleGuardrailStopPercent: 100,
        stagedWithoutApprovalBudgetOrCapability: 0,
      },
      evidenceBoundary:
        "Synthetic plans only; not deployed to a real city.",
    };
    const outcomeLearning: OutcomeLearningOverview = {
      schemaVersion: "nexus.outcome-learning-overview.v1",
      generatedAt: "2026-07-18T10:00:00.000Z",
      outcomes: [],
      lessons: [],
      playbooks: [],
      proposals: [],
      events: [],
      gates: {
        completedOutcomeLessonDispositionPercent: 100,
        deterministicOutcomeReplayPercent: 100,
        harmfulPositiveRetrievalCount: 0,
        invalidLessonActivePlaybookCount: 0,
        governedProposalBypassCount: 0,
        resolvedIncidentOutcomeCoveragePercent: 100,
      },
      contradictions: [],
      evidenceBoundary:
        "Synthetic lessons only; never real-world policy advice.",
    };
    vi.mocked(fetch).mockImplementation(async (input) => ({
      ok: true,
      status: 200,
      json: async () =>
        String(input).includes("/api/diagnosis")
          ? diagnosis
          : String(input).includes("/api/planning")
            ? planning
            : String(input).includes("/api/outcomes")
              ? outcomeLearning
            : overview,
    }) as Response);

    render(<ObserverDashboard />);

    expect(
      await screen.findByTestId("coherent-city-model"),
    ).toBeInTheDocument();
    expect(screen.getByText("Ontology metrics")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
    expect(
      screen.getByText(/not claims about real people/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("table", { name: "City metric dictionary" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByTestId("causal-explorer"),
    ).toBeInTheDocument();
    expect(screen.getByText("Top-3 root-cause hit")).toBeInTheDocument();
    expect(
      await screen.findByTestId("planning-workbench"),
    ).toBeInTheDocument();
    expect(
      await screen.findByTestId("learning-observatory"),
    ).toBeInTheDocument();
  });

  it("renders north-star metrics and complete action traces", async () => {
    render(<ObserverDashboard />);
    await settleObserverEffects();

    expect(
      screen.getByRole("heading", { name: "OBSERVER DASHBOARD" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Verified autonomy loop rate")).toBeInTheDocument();
    expect(screen.getByText("ACTION TRACE")).toBeInTheDocument();
    expect(
      screen.getAllByText(/Trace completeness:/).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText(/100(?:\.0)?%/).length).toBeGreaterThan(0);
  });

  it("renders falsifiable hypotheses, classified evidence, and frozen counterfactuals", async () => {
    const truth = PUBLIC_CITY_SCENARIOS.find(
      (scenario) => scenario.id === "city-infrastructure-cascade",
    )!;
    const generatedAt = "2026-07-18T10:00:00.000Z";
    const calibration = buildDiagnosticCalibration(generatedAt);
    const trust = assessDiagnosticTrust({
      assessedAt: generatedAt,
      calibrationPassed: calibration.passed,
    });
    const causalDiagnosis = buildCausalDiagnosis({
      incident: buildSyntheticDiagnosticIncident(truth),
      scenarioMode: truth.mode,
      scenarioTruthId: truth.id,
      family: truth.family,
      injectedMetricDeltas: truth.injectedMetricDeltas,
      createdAt: generatedAt,
      trust,
    });
    const diagnosisOverview: DiagnosisOverview = {
      schemaVersion: "nexus.diagnosis-overview.v1",
      generatedAt,
      diagnoses: [causalDiagnosis],
      calibration,
      trust,
      events: [],
      gates: {
        minimumExperimentConfidence: 0.65,
        diagnosedWithAlternativeAndCounterevidencePercent: 100,
        deterministicCounterfactualReplayPercent: 100,
        lowConfidenceAutomationAttempts: 0,
      },
      evidenceBoundary:
        "Structured evidence only; never hidden model chain-of-thought.",
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      if (String(input).includes("/api/diagnosis")) {
        return {
          ok: true,
          status: 200,
          json: async () => diagnosisOverview,
        } as Response;
      }
      throw new Error("City fixture intentionally unavailable");
    });

    render(<ObserverDashboard />);

    expect(
      await screen.findByTestId("causal-diagnosis"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("GRID_TRANSFORMER_CAPACITY_LOSS").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("table", {
        name: "Frozen-snapshot counterfactual tests",
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Fact").length).toBeGreaterThan(0);
    expect(screen.getByText("Inference")).toBeInTheDocument();
    expect(screen.getByText("Prediction")).toBeInTheDocument();
    expect(screen.getByText("Human judgment")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Explanation"), {
      target: { value: "audit" },
    });
    expect(
      screen.getByText("INDEPENDENT AGENT SUBMISSIONS"),
    ).toBeInTheDocument();
  });

  it("compares no-action and bounded candidates with frozen experiment evidence", async () => {
    const truth = PUBLIC_CITY_SCENARIOS.find(
      (scenario) => scenario.id === "city-infrastructure-cascade",
    )!;
    const generatedAt = "2026-07-18T10:00:00.000Z";
    const calibration = buildDiagnosticCalibration(generatedAt);
    const trust = assessDiagnosticTrust({
      assessedAt: generatedAt,
      calibrationPassed: calibration.passed,
    });
    const causalDiagnosis = buildCausalDiagnosis({
      incident: buildSyntheticDiagnosticIncident(truth),
      scenarioMode: truth.mode,
      scenarioTruthId: truth.id,
      family: truth.family,
      injectedMetricDeltas: truth.injectedMetricDeltas,
      createdAt: generatedAt,
      trust,
    });
    const scenario = materializeCityScenario(truth);
    const snapshot = projectCoherentCitySnapshot(scenario.world);
    const plan = buildInterventionPlan({
      diagnosis: causalDiagnosis,
      objectives: [],
      guardrails: [],
      stakeholderImpacts: snapshot.stakeholderImpacts,
      scenarioSeed: scenario.seed,
      scenarioPolicyVersion: scenario.policyVersion,
      scenarioConfiguration: scenario.configuration,
      scenarioWorld: scenario.world,
      createdAt: generatedAt,
    });
    const planningOverview: PlanningOverview = {
      schemaVersion: "nexus.planning-overview.v1",
      generatedAt,
      plans: [plan],
      events: [],
      gates: {
        plansWithNoActionAndTwoCandidatesPercent: 100,
        deterministicExperimentReplayPercent: 100,
        firstSampleGuardrailStopPercent: 100,
        stagedWithoutApprovalBudgetOrCapability: 0,
      },
      evidenceBoundary:
        "Synthetic plans only; not deployed to a real city.",
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      if (String(input).includes("/api/planning")) {
        return {
          ok: true,
          status: 200,
          json: async () => planningOverview,
        } as Response;
      }
      throw new Error("Only the planning fixture is configured");
    });

    render(<ObserverDashboard />);

    expect(
      await screen.findByTestId("intervention-plan"),
    ).toBeInTheDocument();
    expect(screen.getByText("No action")).toBeInTheDocument();
    expect(
      screen.getByText("Direct cause stabilization"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Protected-service resilience"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("table", {
        name: "Intervention candidate portfolio",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("holm-bonferroni")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Approve selected plan",
      }),
    ).toBeEnabled();
  });

  it("shows delayed prediction error, lesson provenance, playbooks, and governed proposals", async () => {
    const truth = PUBLIC_CITY_SCENARIOS.find(
      (scenario) => scenario.id === "city-economic-cascade",
    )!;
    const generatedAt = "2026-07-18T10:00:00.000Z";
    const calibration = buildDiagnosticCalibration(generatedAt);
    const trust = assessDiagnosticTrust({
      assessedAt: generatedAt,
      calibrationPassed: calibration.passed,
    });
    const diagnosis = buildCausalDiagnosis({
      incident: buildSyntheticDiagnosticIncident(truth),
      scenarioMode: truth.mode,
      scenarioTruthId: truth.id,
      family: truth.family,
      injectedMetricDeltas: truth.injectedMetricDeltas,
      createdAt: generatedAt,
      trust,
    });
    const scenario = materializeCityScenario(truth);
    const snapshot = projectCoherentCitySnapshot(scenario.world);
    const proposed = buildInterventionPlan({
      diagnosis,
      objectives: [],
      guardrails: [],
      stakeholderImpacts: snapshot.stakeholderImpacts,
      scenarioSeed: scenario.seed,
      scenarioPolicyVersion: scenario.policyVersion,
      scenarioConfiguration: scenario.configuration,
      scenarioWorld: scenario.world,
      createdAt: generatedAt,
      maximumCost: 500,
    });
    const plan = {
      ...proposed,
      status: "staged" as const,
      decision: {
        ...proposed.decision,
        decision: "approved" as const,
        approvals: [
          {
            actorId: "observer-admin",
            role: "admin" as const,
            approvedAt: generatedAt,
            note: "Fixture approval.",
          },
        ],
      },
    };
    const outcome = buildOutcome({
      plan,
      scenarioId: truth.id,
      scenarioFamily: truth.family,
      scenarioSeed: scenario.seed,
      scenarioPolicyVersion: scenario.policyVersion,
      scenarioConfiguration: scenario.configuration,
      scenarioWorld: scenario.world,
      evaluatedAt: generatedAt,
    });
    const lesson = deriveLesson(outcome);
    outcome.currentLessonId = lesson.id;
    const playbook = buildResponsePlaybook(
      lesson,
      plan,
      generatedAt,
    );
    const proposal = buildGovernedLearningProposal({
      lesson,
      target: "test",
      title: "Delayed regression",
      expectedImpact: "Detect synthetic effect drift.",
      actorId: "observer-admin",
      createdAt: generatedAt,
    });
    const fixture: OutcomeLearningOverview = {
      schemaVersion: "nexus.outcome-learning-overview.v1",
      generatedAt,
      outcomes: [outcome],
      lessons: [lesson],
      playbooks: [playbook],
      proposals: [proposal],
      events: [],
      gates: {
        completedOutcomeLessonDispositionPercent: 100,
        deterministicOutcomeReplayPercent: 100,
        harmfulPositiveRetrievalCount: 0,
        invalidLessonActivePlaybookCount: 0,
        governedProposalBypassCount: 0,
        resolvedIncidentOutcomeCoveragePercent: 100,
      },
      contradictions: [],
      evidenceBoundary:
        "Synthetic lessons only; never real-world policy advice.",
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      if (String(input).includes("/api/outcomes")) {
        return {
          ok: true,
          status: 200,
          json: async () => fixture,
        } as Response;
      }
      throw new Error("Only the outcome fixture is configured");
    });

    render(<ObserverDashboard />);

    expect(
      await screen.findByTestId("outcome-record"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("table", {
        name: "Short-, medium-, and long-horizon outcome windows",
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Prediction error").length).toBeGreaterThan(0);
    expect(screen.getByText("LESSON REGISTRY")).toBeInTheDocument();
    expect(
      screen.getByText("existing-controlled-iteration"),
    ).toBeInTheDocument();
  });

  it("reconstructs a historical tick and compares a counterfactual run", async () => {
    render(<ObserverDashboard />);
    await settleObserverEffects();

    const tickInput = screen.getByLabelText("Tick to inspect");
    fireEvent.change(tickInput, { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Inspect tick" }));
    expect(screen.getByTestId("tick-inspection")).toHaveTextContent("tick 10");

    fireEvent.click(screen.getByRole("button", { name: "Compare runs" }));
    expect(screen.getByTestId("run-comparison")).toHaveTextContent("Δ events");
  });

  it("queues, approves, and executes a structured model proposal", async () => {
    render(<ObserverDashboard />);

    fireEvent.click(
      screen.getByRole("button", { name: "Generate model proposal" }),
    );
    expect(await screen.findByText("pending")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Approve atlas" }));
    expect(screen.getByText("approved")).toBeInTheDocument();

    act(() => {
      useNexusStore.getState().stepSimulationOnce();
    });
    expect(screen.getByText("executed")).toBeInTheDocument();

    const modelTrace = useNexusStore
      .getState()
      .simulation.events.find(
        (event) =>
          event.type === "system.signal" &&
          event.payload.category === "model-provider",
      );
    expect(modelTrace).toBeDefined();
  });
});
