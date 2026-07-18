"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion } from "framer-motion";
import {
  Activity,
  BookOpen,
  BrainCircuit,
  Building2,
  CheckCircle2,
  ChevronRight,
  GitCompareArrows,
  ListTree,
  Clock3,
  Microscope,
  ScanSearch,
  ShieldCheck,
  Target,
  ThumbsDown,
  ThumbsUp,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import { useNexusStore } from "@/stores/nexus-store";
import { useTranslation } from "@/hooks/useTranslation";
import {
  buildActionTraces,
  calculateActionTraceMetrics,
  compareSimulationRuns,
  replaySimulation,
  selectCityMetrics,
} from "@/simulation";
import type {
  ActionTrace,
  CityMetricSnapshot,
  SimulationComparison,
} from "@/simulation";
import type {
  CityModelOverview,
} from "@/city/model-types";
import type {
  CausalDiagnosis,
  DiagnosisOverview,
  EvidenceClassification,
} from "@/diagnosis/types";
import type {
  InterventionPlan,
  PlanningOverview,
} from "@/planning/types";
import type {
  LessonRecord,
  OutcomeLearningOverview,
  OutcomeRecord,
} from "@/outcomes/types";
import ClosedLoopWorkbench from "./ClosedLoopWorkbench";

const COMPARISON_METRICS: Array<keyof CityMetricSnapshot> = [
  "gdp",
  "happiness",
  "crime",
  "traffic",
  "energy",
  "pollution",
  "internet",
  "medical",
];

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatPayloadValue(value: unknown): string {
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }

  return typeof value === "string" ? value : "—";
}

function TraceStage({
  label,
  complete,
  children,
}: {
  label: string;
  complete: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`min-w-0 rounded-lg border p-3 ${
        complete
          ? "border-cyber-green/30 bg-cyber-green/5"
          : "border-cyber-gray/40 bg-cyber-black/20"
      }`}
    >
      <div className="mb-2 flex items-center gap-2">
        {complete ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-cyber-green" />
        ) : (
          <div className="h-4 w-4 shrink-0 rounded-full border border-cyber-text-dim" />
        )}
        <h3 className="text-xs font-semibold uppercase tracking-wider text-cyber-text">
          {label}
        </h3>
      </div>
      <div className="space-y-1 text-xs text-cyber-text-dim">{children}</div>
    </div>
  );
}

function TraceDetails({ trace }: { trace: ActionTrace }) {
  const { t } = useTranslation();
  const expectedEffect =
    typeof trace.proposal?.payload.expectedEffect === "object" &&
    trace.proposal.payload.expectedEffect !== null
      ? (trace.proposal.payload.expectedEffect as Record<string, unknown>)
      : undefined;
  const commandPayload =
    typeof trace.command?.payload === "object" &&
    trace.command.payload !== null
      ? (trace.command.payload as Record<string, unknown>)
      : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-cyber-blue/15 px-2 py-1 font-mono text-xs text-cyber-blue">
          {trace.correlationId}
        </span>
        <span className="rounded bg-cyber-gray/60 px-2 py-1 text-xs text-cyber-text">
          {trace.agentId.toUpperCase()}
        </span>
        <span className="ml-auto text-xs text-cyber-text-dim">
          {t("traceCompleteness")}: {trace.completeness}%
        </span>
      </div>

      <div className="grid gap-2 xl:grid-cols-5">
        <TraceStage label={t("observationStage")} complete={Boolean(trace.observation)}>
          <p>{trace.observation?.type ?? t("missingStage")}</p>
          <p>
            {formatPayloadValue(trace.observation?.payload.metric)}{" "}
            {formatPayloadValue(trace.observation?.payload.value)}
          </p>
          <p>{trace.observation?.id ?? "—"}</p>
        </TraceStage>

        <TraceStage label={t("proposalStage")} complete={Boolean(trace.proposal)}>
          <p>{formatPayloadValue(trace.proposal?.payload.rationale)}</p>
          <p>
            {formatPayloadValue(expectedEffect?.metric)}{" "}
            {formatPayloadValue(expectedEffect?.delta)}
          </p>
          <p>{trace.proposal?.id ?? "—"}</p>
        </TraceStage>

        <TraceStage label={t("commandStage")} complete={Boolean(trace.command)}>
          <p>{formatPayloadValue(trace.command?.id)}</p>
          <p>{formatPayloadValue(trace.command?.type)}</p>
          <p>
            {formatPayloadValue(commandPayload?.metric)}{" "}
            {formatPayloadValue(commandPayload?.delta)}
          </p>
        </TraceStage>

        <TraceStage
          label={t("executionStage")}
          complete={Boolean(trace.action ?? trace.rejection)}
        >
          <p>{trace.action?.type ?? trace.rejection?.type ?? t("missingStage")}</p>
          <p>
            {formatPayloadValue(trace.action?.payload.before)} →{" "}
            {formatPayloadValue(trace.action?.payload.after)}
          </p>
          <p>
            {formatPayloadValue(
              trace.action?.payload.guardrail ?? trace.rejection?.payload.code,
            )}
          </p>
        </TraceStage>

        <TraceStage label={t("evaluationStage")} complete={Boolean(trace.evaluation)}>
          <p>{formatPayloadValue(trace.evaluation?.payload.outcome)}</p>
          <p>
            {t("expected")}:{" "}
            {formatPayloadValue(trace.evaluation?.payload.expectedDelta)}
          </p>
          <p>
            {t("actual")}:{" "}
            {formatPayloadValue(trace.evaluation?.payload.actualDelta)}
          </p>
        </TraceStage>
      </div>
    </div>
  );
}

export default function ObserverDashboard() {
  const { t } = useTranslation();
  const simulation = useNexusStore((state) => state.simulation);
  const observerWorld = useRef(structuredClone(simulation.world));
  const modelRuntime = useNexusStore((state) => state.modelRuntime);
  const requestModelProposal = useNexusStore(
    (state) => state.requestModelProposal,
  );
  const approveModelProposal = useNexusStore(
    (state) => state.approveModelProposal,
  );
  const rejectModelProposal = useNexusStore(
    (state) => state.rejectModelProposal,
  );
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [agentFilter, setAgentFilter] = useState("all");
  const [comparisonSeed, setComparisonSeed] = useState(
    `${simulation.seed}-counterfactual`,
  );
  const [comparison, setComparison] = useState<SimulationComparison | null>(null);
  const [inspectionTick, setInspectionTick] = useState(0);
  const [inspection, setInspection] = useState<{
    tick: number;
    metrics: CityMetricSnapshot;
    events: number;
    fingerprint: string;
  } | null>(null);
  const [modelAgent, setModelAgent] = useState<
    "atlas" | "economica" | "civitas" | "spectre"
  >("atlas");
  const [cityModel, setCityModel] = useState<CityModelOverview | null>(
    null,
  );
  const [cityModelStatus, setCityModelStatus] = useState<
    "loading" | "ready" | "error" | "injecting"
  >("loading");
  const [diagnosis, setDiagnosis] =
    useState<DiagnosisOverview | null>(null);
  const [diagnosisStatus, setDiagnosisStatus] = useState<
    "loading" | "ready" | "error" | "diagnosing"
  >("loading");
  const [explanationDensity, setExplanationDensity] = useState<
    "observer" | "audit"
  >("observer");
  const [planning, setPlanning] =
    useState<PlanningOverview | null>(null);
  const [planningStatus, setPlanningStatus] = useState<
    "loading" | "ready" | "error" | "creating" | "reviewing"
  >("loading");
  const [outcomeLearning, setOutcomeLearning] =
    useState<OutcomeLearningOverview | null>(null);
  const [outcomeStatus, setOutcomeStatus] = useState<
    | "loading"
    | "ready"
    | "error"
    | "preparing"
    | "evaluating"
    | "mutating"
  >("loading");

  const loadCityModel = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const response = await fetch("/api/city", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "overview",
            world: observerWorld.current,
          }),
          cache: "no-store",
          signal,
        });
        if (!response.ok) {
          throw new Error(`City model request failed with ${response.status}`);
        }
        setCityModel((await response.json()) as CityModelOverview);
        setCityModelStatus("ready");
      } catch (error) {
        if (
          !(error instanceof DOMException && error.name === "AbortError")
        ) {
          setCityModelStatus("error");
        }
      }
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadCityModel(controller.signal);
    return () => controller.abort();
  }, [loadCityModel]);

  const loadDiagnosis = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const response = await fetch("/api/diagnosis", {
          cache: "no-store",
          signal,
        });
        if (!response.ok) {
          throw new Error(
            `Diagnosis request failed with ${response.status}`,
          );
        }
        setDiagnosis((await response.json()) as DiagnosisOverview);
        setDiagnosisStatus("ready");
      } catch (error) {
        if (
          !(error instanceof DOMException && error.name === "AbortError")
        ) {
          setDiagnosisStatus("error");
        }
      }
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => void loadDiagnosis(controller.signal),
      0,
    );
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [loadDiagnosis]);

  const loadPlanning = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const response = await fetch("/api/planning", {
          cache: "no-store",
          signal,
        });
        if (!response.ok) {
          throw new Error(
            `Planning request failed with ${response.status}`,
          );
        }
        setPlanning((await response.json()) as PlanningOverview);
        setPlanningStatus("ready");
      } catch (error) {
        if (
          !(error instanceof DOMException && error.name === "AbortError")
        ) {
          setPlanningStatus("error");
        }
      }
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => void loadPlanning(controller.signal),
      0,
    );
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [loadPlanning]);

  const loadOutcomeLearning = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const response = await fetch("/api/outcomes", {
          cache: "no-store",
          signal,
        });
        if (!response.ok) {
          throw new Error(
            `Outcome learning request failed with ${response.status}`,
          );
        }
        setOutcomeLearning(
          (await response.json()) as OutcomeLearningOverview,
        );
        setOutcomeStatus("ready");
      } catch (error) {
        if (
          !(error instanceof DOMException && error.name === "AbortError")
        ) {
          setOutcomeStatus("error");
        }
      }
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => void loadOutcomeLearning(controller.signal),
      0,
    );
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [loadOutcomeLearning]);

  const injectCascadeScenario = async () => {
    setCityModelStatus("injecting");
    try {
      const response = await fetch("/api/city", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "inject-scenario",
          scenarioId: "city-infrastructure-cascade",
        }),
      });
      if (!response.ok) {
        throw new Error(
          `City scenario request failed with ${response.status}`,
        );
      }
      await loadCityModel();
    } catch {
      setCityModelStatus("error");
    }
  };

  const diagnoseCascadeScenario = async () => {
    setDiagnosisStatus("diagnosing");
    try {
      const response = await fetch("/api/diagnosis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "diagnose-scenario",
          scenarioId: "city-infrastructure-cascade",
        }),
      });
      if (!response.ok) {
        throw new Error(
          `Diagnosis request failed with ${response.status}`,
        );
      }
      await Promise.all([loadDiagnosis(), loadCityModel()]);
    } catch {
      setDiagnosisStatus("error");
    }
  };

  const createPlanningPortfolio = async () => {
    setPlanningStatus("creating");
    try {
      const response = await fetch("/api/planning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create-plan",
          scenarioId: "city-infrastructure-cascade",
          maximumCost: 150,
        }),
      });
      if (!response.ok) {
        throw new Error(
          `Planning request failed with ${response.status}`,
        );
      }
      await Promise.all([
        loadPlanning(),
        loadDiagnosis(),
        loadCityModel(),
      ]);
    } catch {
      setPlanningStatus("error");
    }
  };

  const reviewPlanningPortfolio = async (
    plan: InterventionPlan,
    action: "approve-plan" | "stage-plan",
  ) => {
    setPlanningStatus("reviewing");
    try {
      const response = await fetch("/api/planning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          planId: plan.id,
          selectedCandidateId: plan.decision.selectedCandidateId,
          note:
            "Human review confirmed paired evidence, guardrails, budget, capabilities, and inverse actions.",
        }),
      });
      if (!response.ok) {
        throw new Error(
          `Planning review failed with ${response.status}`,
        );
      }
      await loadPlanning();
    } catch {
      setPlanningStatus("error");
    }
  };

  const prepareLearningPortfolio = async () => {
    setOutcomeStatus("preparing");
    try {
      const response = await fetch("/api/planning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create-plan",
          scenarioId: "city-economic-cascade",
          maximumCost: 500,
        }),
      });
      if (!response.ok) {
        throw new Error(
          `Learning portfolio request failed with ${response.status}`,
        );
      }
      await Promise.all([
        loadPlanning(),
        loadDiagnosis(),
        loadCityModel(),
        loadOutcomeLearning(),
      ]);
    } catch {
      setOutcomeStatus("error");
    }
  };

  const mutateOutcomeLearning = async (
    body: Record<string, unknown>,
    pending: "evaluating" | "mutating" = "mutating",
  ) => {
    setOutcomeStatus(pending);
    try {
      const response = await fetch("/api/outcomes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        throw new Error(
          `Outcome learning mutation failed with ${response.status}`,
        );
      }
      await Promise.all([
        loadOutcomeLearning(),
        loadCityModel(),
      ]);
    } catch {
      setOutcomeStatus("error");
    }
  };

  const latestDiagnosis: CausalDiagnosis | null =
    diagnosis?.diagnoses[0] ?? null;
  const latestPlan: InterventionPlan | null =
    planning?.plans[0] ?? null;
  const latestOutcome: OutcomeRecord | null =
    (
      latestPlan
        ? outcomeLearning?.outcomes.find(
            (outcome) => outcome.planId === latestPlan.id,
          )
        : null
    ) ??
    outcomeLearning?.outcomes[0] ??
    null;
  const latestLesson: LessonRecord | null =
    (
      latestOutcome?.currentLessonId
        ? outcomeLearning?.lessons.find(
            (lesson) =>
              lesson.id === latestOutcome.currentLessonId,
          )
        : null
    ) ??
    null;
  const evidenceLabels: Record<EvidenceClassification, string> = {
    fact: t("diagnosticFact"),
    inference: t("diagnosticInference"),
    prediction: t("diagnosticPrediction"),
    "human-judgment": t("diagnosticHumanJudgment"),
  };

  const traces = useMemo(
    () => buildActionTraces(simulation.events),
    [simulation.events],
  );
  const traceMetrics = useMemo(
    () => calculateActionTraceMetrics(traces),
    [traces],
  );
  const filteredTraces =
    agentFilter === "all"
      ? traces
      : traces.filter((trace) => trace.agentId === agentFilter);
  const selectedTrace =
    filteredTraces.find((trace) => trace.id === selectedTraceId) ??
    filteredTraces[0] ??
    null;

  const runCounterfactual = () => {
    const ticks = simulation.world.tick - simulation.initialState.tick;
    const counterfactual = replaySimulation(
      simulation.initialState,
      {
        seed: comparisonSeed,
        policyVersion: simulation.policyVersion,
        configuration: simulation.configuration,
      },
      ticks,
      simulation.operatorCommands,
    );
    setComparison(
      compareSimulationRuns(
        simulation.world,
        simulation.events,
        counterfactual.state,
        counterfactual.events,
      ),
    );
  };

  const inspectTick = () => {
    const boundedTick = Math.max(
      simulation.initialState.tick,
      Math.min(simulation.world.tick, inspectionTick),
    );
    const replay = replaySimulation(
      simulation.initialState,
      {
        seed: simulation.seed,
        policyVersion: simulation.policyVersion,
        configuration: simulation.configuration,
      },
      boundedTick - simulation.initialState.tick,
      simulation.operatorCommands,
    );
    setInspection({
      tick: boundedTick,
      metrics: selectCityMetrics(replay.state),
      events: replay.events.length,
      fingerprint: replay.fingerprint,
    });
  };

  const metricCards = [
    {
      label: t("verifiedLoopRate"),
      value: formatPercent(traceMetrics.verifiedAutonomyLoopRate),
      detail: `${traceMetrics.verifiedActions}/${traceMetrics.totalActions} · ${traceMetrics.rejectedProposals} ${t("rejected")}`,
      icon: Target,
    },
    {
      label: t("causalCompleteness"),
      value: formatPercent(traceMetrics.causalTraceCompleteness),
      detail: t("causalLinks"),
      icon: ListTree,
    },
    {
      label: t("evaluationSuccess"),
      value: formatPercent(traceMetrics.successfulEvaluationRate),
      detail: `${traceMetrics.successfulEvaluations} ${t("successful")}`,
      icon: Activity,
    },
    {
      label: t("replayIntegrity"),
      value:
        simulation.replay.status === "verified"
          ? t("verified")
          : simulation.replay.status === "mismatch"
            ? t("mismatch")
            : t("notChecked"),
      detail: `tick ${simulation.world.tick}`,
      icon: ShieldCheck,
    },
    {
      label: t("rollbackCoverage"),
      value: formatPercent(traceMetrics.rollbackCoverage),
      detail: `${traceMetrics.rollbackReadyActions}/${traceMetrics.totalActions}`,
      icon: RotateCcw,
    },
  ];

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-cyber-blue/30 bg-cyber-blue/10 p-2">
            <Microscope className="h-6 w-6 text-cyber-blue" />
          </div>
          <div>
            <h1 className="text-3xl font-orbitron font-bold text-cyber-blue cyber-text-glow">
              {t("observerDashboard")}
            </h1>
            <p className="mt-1 text-cyber-text-dim">{t("observerDashboardDesc")}</p>
          </div>
        </div>
      </motion.div>

      <ClosedLoopWorkbench />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {metricCards.map((card, index) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.06 }}
              className="rounded-xl border border-cyber-blue/20 bg-cyber-dark/50 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="text-xs text-cyber-text-dim">{card.label}</span>
                <Icon className="h-4 w-4 shrink-0 text-cyber-blue" />
              </div>
              <p className="mt-2 text-2xl font-bold text-cyber-text">{card.value}</p>
              <p className="mt-1 text-xs text-cyber-text-dim">{card.detail}</p>
            </motion.div>
          );
        })}
      </div>

      <section
        aria-labelledby="coherent-city-heading"
        className="rounded-xl border border-cyber-cyan/25 bg-cyber-dark/50 p-4 sm:p-5"
      >
        <div className="flex flex-wrap items-start gap-3">
          <div className="rounded-lg border border-cyber-cyan/30 bg-cyber-cyan/10 p-2">
            <Building2 className="h-5 w-5 text-cyber-cyan" />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="coherent-city-heading"
              className="font-orbitron text-lg text-cyber-text"
            >
              {t("coherentCityModel")}
            </h2>
            <p className="mt-1 text-sm text-cyber-text-dim">
              {t("coherentCityModelDesc")}
            </p>
          </div>
          <button
            type="button"
            disabled={
              cityModelStatus === "loading" ||
              cityModelStatus === "injecting"
            }
            onClick={() => void injectCascadeScenario()}
            className="inline-flex items-center gap-2 rounded-lg border border-cyber-orange/40 bg-cyber-orange/10 px-3 py-2 text-sm text-cyber-orange disabled:cursor-wait disabled:opacity-50"
          >
            <ShieldAlert className="h-4 w-4" />
            {cityModelStatus === "injecting"
              ? t("injectingScenario")
              : t("injectCascadeScenario")}
          </button>
        </div>

        <div aria-live="polite" className="mt-4">
          {cityModelStatus === "loading" && (
            <p className="text-sm text-cyber-text-dim">
              {t("loadingCityModel")}
            </p>
          )}
          {cityModelStatus === "error" && (
            <p role="alert" className="text-sm text-cyber-red">
              {t("cityModelUnavailable")}
            </p>
          )}
          {cityModel && (
            <div className="space-y-4" data-testid="coherent-city-model">
              <p className="rounded-lg border border-cyber-yellow/30 bg-cyber-yellow/5 p-3 text-xs text-cyber-yellow">
                {cityModel.syntheticBoundary}
              </p>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {[
                  {
                    label: t("ontologyMetrics"),
                    value: cityModel.ontology.metrics.length,
                  },
                  {
                    label: t("publicScenarios"),
                    value: cityModel.scenarioVerification.scenarioCount,
                  },
                  {
                    label: t("detectionRecall"),
                    value: `${cityModel.scenarioVerification.recallPercent}%`,
                  },
                  {
                    label: t("detectionPrecision"),
                    value: `${cityModel.scenarioVerification.precisionPercent}%`,
                  },
                  {
                    label: t("cityIncidents"),
                    value: cityModel.incidents.length,
                  },
                ].map((metric) => (
                  <article
                    key={metric.label}
                    className="rounded-lg border border-cyber-cyan/20 bg-cyber-black/20 p-3"
                  >
                    <p className="text-xs text-cyber-text-dim">
                      {metric.label}
                    </p>
                    <p className="mt-1 font-mono text-xl text-cyber-cyan">
                      {metric.value}
                    </p>
                  </article>
                ))}
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-lg border border-cyber-gray/30 bg-cyber-black/20 p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-cyber-text">
                    {t("sharedWorldSnapshot")}
                  </h3>
                  <p className="mt-1 text-xs text-cyber-text-dim">
                    {cityModel.snapshot.scenarioId} · tick{" "}
                    {cityModel.snapshot.tick} ·{" "}
                    {cityModel.snapshot.sourceWorldFingerprint.slice(0, 12)}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {(
                      [
                        "public-service-access",
                        "housing-cost-burden",
                        "inequality",
                        "network-continuity",
                      ] as const
                    ).map((metric) => (
                      <div
                        key={metric}
                        className="rounded bg-cyber-dark/60 p-2"
                      >
                        <p className="text-[0.7rem] text-cyber-text-dim">
                          {metric}
                        </p>
                        <p className="font-mono text-sm text-cyber-text">
                          {cityModel.snapshot.metrics[
                            metric
                          ].value.toFixed(1)}
                          %
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-cyber-gray/30 bg-cyber-black/20 p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-cyber-text">
                    {t("objectivesAndGuardrails")}
                  </h3>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <p className="font-mono text-2xl text-cyber-green">
                        {cityModel.objectives.length}
                      </p>
                      <p className="text-xs text-cyber-text-dim">
                        {t("versionedObjectives")}
                      </p>
                    </div>
                    <div>
                      <p className="font-mono text-2xl text-cyber-orange">
                        {cityModel.guardrails.length}
                      </p>
                      <p className="text-xs text-cyber-text-dim">
                        {t("hardGuardrails")}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-cyber-text-dim">
                    {t("objectiveFreezeDesc")}
                  </p>
                </div>
              </div>

              <div
                role="region"
                aria-label={t("cityMetricDictionary")}
                tabIndex={0}
                className="overflow-x-auto rounded-lg border border-cyber-gray/30 focus:outline-none focus:ring-2 focus:ring-cyber-cyan"
              >
                <table className="min-w-full text-left text-xs">
                  <caption className="sr-only">
                    {t("cityMetricDictionary")}
                  </caption>
                  <thead className="bg-cyber-black/40 text-cyber-text-dim">
                    <tr>
                      <th scope="col" className="px-3 py-2">
                        {t("metric")}
                      </th>
                      <th scope="col" className="px-3 py-2">
                        {t("domain")}
                      </th>
                      <th scope="col" className="px-3 py-2">
                        {t("unit")}
                      </th>
                      <th scope="col" className="px-3 py-2">
                        {t("owner")}
                      </th>
                      <th scope="col" className="px-3 py-2">
                        {t("source")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {cityModel.ontology.metrics.map((definition) => (
                      <tr
                        key={definition.code}
                        className="border-t border-cyber-gray/20 text-cyber-text"
                      >
                        <th
                          scope="row"
                          className="whitespace-nowrap px-3 py-2 font-mono font-normal text-cyber-cyan"
                        >
                          {definition.code}
                        </th>
                        <td className="px-3 py-2">{definition.domain}</td>
                        <td className="px-3 py-2">{definition.unit}</td>
                        <td className="px-3 py-2">
                          {definition.owner.toUpperCase()}
                        </td>
                        <td className="max-w-xs px-3 py-2 text-cyber-text-dim">
                          {definition.source}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-cyber-text">
                  {t("syntheticIncidentTruth")}
                </h3>
                {cityModel.incidents.length === 0 ? (
                  <p className="mt-2 rounded-lg border border-cyber-gray/30 p-3 text-sm text-cyber-text-dim">
                    {t("noCityIncidents")}
                  </p>
                ) : (
                  <div className="mt-2 grid gap-3 lg:grid-cols-2">
                    {cityModel.incidents.map((incident) => (
                      <article
                        key={incident.id}
                        className="rounded-lg border border-cyber-orange/30 bg-cyber-orange/5 p-3"
                      >
                        <div className="flex flex-wrap gap-2">
                          <span className="font-mono text-xs text-cyber-orange">
                            {incident.severity}
                          </span>
                          <span className="text-xs text-cyber-text-dim">
                            {incident.status}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-cyber-text">
                          {incident.summary}
                        </p>
                        <p className="mt-2 text-xs text-cyber-text-dim">
                          {t("rootCause")}:{" "}
                          {incident.hiddenTruth?.code ?? t("unknown")}
                          {" · "}
                          {incident.impact.populationSharePercent}%{" "}
                          {t("syntheticPopulationAffected")}
                        </p>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      <section
        aria-labelledby="causal-explorer-heading"
        className="rounded-xl border border-cyber-purple/25 bg-cyber-dark/50 p-4 sm:p-5"
      >
        <div className="flex flex-wrap items-start gap-3">
          <div className="rounded-lg border border-cyber-purple/30 bg-cyber-purple/10 p-2">
            <BrainCircuit
              aria-hidden="true"
              className="h-5 w-5 text-cyber-cyan"
            />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="causal-explorer-heading"
              className="font-orbitron text-lg text-cyber-text"
            >
              {t("causalExplorer")}
            </h2>
            <p className="mt-1 text-sm text-cyber-text-dim">
              {t("causalExplorerDesc")}
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs text-cyber-text-dim">
            {t("explanationDensity")}
            <select
              value={explanationDensity}
              onChange={(event) =>
                setExplanationDensity(
                  event.target.value as "observer" | "audit",
                )
              }
              className="rounded-lg border border-cyber-purple/30 bg-cyber-black px-3 py-2 text-cyber-text"
            >
              <option value="observer">{t("observerExplanation")}</option>
              <option value="audit">{t("auditExplanation")}</option>
            </select>
          </label>
          <button
            type="button"
            disabled={
              diagnosisStatus === "loading" ||
              diagnosisStatus === "diagnosing"
            }
            onClick={() => void diagnoseCascadeScenario()}
            className="inline-flex items-center gap-2 rounded-lg border border-cyber-purple/40 bg-cyber-purple/10 px-3 py-2 text-sm text-cyber-cyan disabled:cursor-wait disabled:opacity-50"
          >
            <ScanSearch aria-hidden="true" className="h-4 w-4" />
            {diagnosisStatus === "diagnosing"
              ? t("diagnosingScenario")
              : t("diagnoseCascadeScenario")}
          </button>
        </div>

        <div aria-live="polite" className="mt-4">
          {diagnosisStatus === "loading" && (
            <p className="text-sm text-cyber-text-dim">
              {t("loadingDiagnosis")}
            </p>
          )}
          {diagnosisStatus === "error" && (
            <p role="alert" className="text-sm text-cyber-red">
              {t("diagnosisUnavailable")}
            </p>
          )}
          {diagnosis && (
            <div className="space-y-4" data-testid="causal-explorer">
              <p className="rounded-lg border border-cyber-yellow/30 bg-cyber-yellow/5 p-3 text-xs text-cyber-yellow">
                {diagnosis.evidenceBoundary}
              </p>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {[
                  {
                    label: t("diagnosedIncidents"),
                    value: diagnosis.diagnoses.length,
                  },
                  {
                    label: t("top3RootCauseHit"),
                    value: `${diagnosis.calibration.top3RootCauseHitRatePercent}%`,
                  },
                  {
                    label: t("calibrationBrier"),
                    value: diagnosis.calibration.brierScore.toFixed(3),
                  },
                  {
                    label: t("diagnosticTrustMode"),
                    value: diagnosis.trust.mode,
                  },
                  {
                    label: t("counterfactualReplay"),
                    value: `${diagnosis.gates.deterministicCounterfactualReplayPercent}%`,
                  },
                ].map((metric) => (
                  <article
                    key={metric.label}
                    className="rounded-lg border border-cyber-purple/20 bg-cyber-black/20 p-3"
                  >
                    <p className="text-xs text-cyber-text-dim">
                      {metric.label}
                    </p>
                    <p className="mt-1 break-words font-mono text-xl text-cyber-cyan">
                      {metric.value}
                    </p>
                  </article>
                ))}
              </div>

              {!latestDiagnosis ? (
                <p className="rounded-lg border border-cyber-gray/30 p-3 text-sm text-cyber-text-dim">
                  {t("noDiagnosis")}
                </p>
              ) : (
                <div className="space-y-4" data-testid="causal-diagnosis">
                  <div className="grid gap-3 lg:grid-cols-3">
                    <article className="rounded-lg border border-cyber-purple/25 bg-cyber-black/20 p-4">
                      <p className="text-xs uppercase tracking-wider text-cyber-text-dim">
                        {t("diagnosticConclusion")}
                      </p>
                      <p className="mt-2 font-mono text-sm text-cyber-cyan">
                        {latestDiagnosis.hypotheses[0]?.rootCauseCode}
                      </p>
                      <p className="mt-2 text-xs text-cyber-text-dim">
                        {latestDiagnosis.status} ·{" "}
                        {(latestDiagnosis.leadingConfidence * 100).toFixed(1)}%
                      </p>
                    </article>
                    <article className="rounded-lg border border-cyber-purple/25 bg-cyber-black/20 p-4">
                      <p className="text-xs uppercase tracking-wider text-cyber-text-dim">
                        {t("frozenSnapshot")}
                      </p>
                      <p className="mt-2 break-all font-mono text-xs text-cyber-text">
                        {latestDiagnosis.frozenSnapshot.sourceWorldFingerprint}
                      </p>
                      <p className="mt-2 text-xs text-cyber-text-dim">
                        {latestDiagnosis.scenarioTruthId} · tick{" "}
                        {latestDiagnosis.frozenSnapshot.tick}
                      </p>
                    </article>
                    <article className="rounded-lg border border-cyber-purple/25 bg-cyber-black/20 p-4">
                      <p className="text-xs uppercase tracking-wider text-cyber-text-dim">
                        {t("experimentGate")}
                      </p>
                      <p
                        className={`mt-2 font-mono text-sm ${
                          latestDiagnosis.experimentEligibility.eligible
                            ? "text-cyber-green"
                            : "text-cyber-orange"
                        }`}
                      >
                        {latestDiagnosis.experimentEligibility.eligible
                          ? t("eligible")
                          : t("blocked")}
                      </p>
                      <p className="mt-2 text-xs text-cyber-text-dim">
                        {latestDiagnosis.experimentEligibility.blockers[0] ??
                          t("confidenceAndTrustPassed")}
                      </p>
                    </article>
                  </div>

                  <div
                    data-testid="hypothesis-graph"
                    className="rounded-lg border border-cyber-purple/25 bg-cyber-black/20 p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold uppercase tracking-wider text-cyber-text">
                        {t("hypothesisGraph")}
                      </h3>
                      <span className="rounded bg-cyber-purple/10 px-2 py-1 text-[0.7rem] text-cyber-cyan">
                        {latestDiagnosis.graph.nodes.length} {t("nodes")} ·{" "}
                        {latestDiagnosis.graph.edges.length} {t("edges")}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-3 lg:grid-cols-3">
                      {latestDiagnosis.hypotheses.map((hypothesis) => (
                        <article
                          key={hypothesis.id}
                          className={`rounded-lg border p-3 ${
                            hypothesis.status === "leading"
                              ? "border-cyber-green/35 bg-cyber-green/5"
                              : "border-cyber-gray/30 bg-cyber-dark/50"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-cyber-text-dim">
                              #{hypothesis.rank}
                            </span>
                            <span className="text-xs text-cyber-cyan">
                              {(hypothesis.confidence * 100).toFixed(1)}%
                            </span>
                            <span className="ml-auto text-[0.7rem] text-cyber-text-dim">
                              {hypothesis.status}
                            </span>
                          </div>
                          <p className="mt-2 break-words font-mono text-xs text-cyber-text">
                            {hypothesis.rootCauseCode}
                          </p>
                          <p className="mt-2 text-xs text-cyber-text-dim">
                            {hypothesis.title}
                          </p>
                          <div className="mt-3 space-y-1">
                            {hypothesis.evidence.map((reference, index) => (
                              <p
                                key={`${hypothesis.id}-${reference.evidenceId}-${reference.stance}-${index}`}
                                className={`text-[0.7rem] ${
                                  reference.stance === "supports"
                                    ? "text-cyber-green"
                                    : "text-cyber-orange"
                                }`}
                              >
                                {reference.stance === "supports"
                                  ? "+"
                                  : "−"}{" "}
                                {reference.explanation}
                              </p>
                            ))}
                          </div>
                          <p className="mt-3 text-[0.7rem] text-cyber-text-dim">
                            {t("wouldChangeConclusion")}:{" "}
                            {hypothesis.whatWouldChangeConclusion}
                          </p>
                        </article>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="rounded-lg border border-cyber-gray/30 bg-cyber-black/20 p-4">
                      <h3 className="text-sm font-semibold uppercase tracking-wider text-cyber-text">
                        {t("classifiedEvidence")}
                      </h3>
                      <div className="mt-3 space-y-2">
                        {latestDiagnosis.evidence
                          .slice(
                            0,
                            explanationDensity === "audit"
                              ? undefined
                              : 5,
                          )
                          .map((evidence) => (
                            <article
                              key={evidence.id}
                              className="rounded border border-cyber-gray/25 p-2"
                            >
                              <span className="rounded bg-cyber-blue/10 px-2 py-1 text-[0.65rem] uppercase tracking-wider text-cyber-blue">
                                {evidenceLabels[evidence.classification]}
                              </span>
                              <p className="mt-2 text-xs text-cyber-text">
                                {evidence.statement}
                              </p>
                              {explanationDensity === "audit" && (
                                <p className="mt-1 break-all font-mono text-[0.65rem] text-cyber-text-dim">
                                  {evidence.sourceType} · {evidence.sourceId}
                                </p>
                              )}
                            </article>
                          ))}
                      </div>
                    </div>

                    <div className="rounded-lg border border-cyber-gray/30 bg-cyber-black/20 p-4">
                      <h3 className="text-sm font-semibold uppercase tracking-wider text-cyber-text">
                        {t("knownUnknowns")}
                      </h3>
                      <ul className="mt-3 space-y-2 text-xs text-cyber-text-dim">
                        {latestDiagnosis.unknowns.map((unknown) => (
                          <li key={unknown} className="flex gap-2">
                            <span aria-hidden="true" className="text-cyber-orange">
                              ?
                            </span>
                            <span>{unknown}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-4 rounded border border-cyber-yellow/25 bg-cyber-yellow/5 p-2 text-[0.7rem] text-cyber-yellow">
                        {t("noHiddenReasoning")}
                      </p>
                    </div>
                  </div>

                  <div
                    role="region"
                    aria-label={t("counterfactualTests")}
                    tabIndex={0}
                    className="overflow-x-auto rounded-lg border border-cyber-gray/30 focus:outline-none focus:ring-2 focus:ring-cyber-purple"
                  >
                    <table className="min-w-full text-left text-xs">
                      <caption className="sr-only">
                        {t("counterfactualTests")}
                      </caption>
                      <thead className="bg-cyber-black/40 text-cyber-text-dim">
                        <tr>
                          <th scope="col" className="px-3 py-2">
                            {t("candidateCause")}
                          </th>
                          <th scope="col" className="px-3 py-2">
                            {t("symptomResolution")}
                          </th>
                          <th scope="col" className="px-3 py-2">
                            {t("effectSize")}
                          </th>
                          <th scope="col" className="px-3 py-2">
                            {t("deterministic")}
                          </th>
                          <th scope="col" className="px-3 py-2">
                            {t("falsificationResult")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {latestDiagnosis.counterfactuals.map((run) => (
                          <tr
                            key={run.id}
                            className="border-t border-cyber-gray/20 text-cyber-text"
                          >
                            <th
                              scope="row"
                              className="whitespace-nowrap px-3 py-2 font-mono font-normal text-cyber-cyan"
                            >
                              {run.candidateRootCauseCode}
                            </th>
                            <td className="px-3 py-2">
                              {run.symptomResolutionPercent}%
                            </td>
                            <td className="px-3 py-2">
                              {run.effectSize.toFixed(3)} [
                              {run.confidenceInterval[0].toFixed(3)},{" "}
                              {run.confidenceInterval[1].toFixed(3)}]
                            </td>
                            <td className="px-3 py-2">
                              {run.deterministicReplay
                                ? t("passed")
                                : t("failed")}
                            </td>
                            <td className="px-3 py-2">
                              {run.supportsHypothesis
                                ? t("supported")
                                : t("notSupported")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {explanationDensity === "audit" && (
                    <div className="rounded-lg border border-cyber-gray/30 bg-cyber-black/20 p-4">
                      <h3 className="text-sm font-semibold uppercase tracking-wider text-cyber-text">
                        {t("independentAgentSubmissions")}
                      </h3>
                      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                        {latestDiagnosis.agentSubmissions.map(
                          (submission) => (
                            <article
                              key={submission.id}
                              className="rounded border border-cyber-gray/25 p-2 text-xs"
                            >
                              <p className="font-mono text-cyber-cyan">
                                {submission.agentId.toUpperCase()}
                              </p>
                              <p className="mt-1 break-all text-cyber-text-dim">
                                {submission.proposedHypothesisIds[0]}
                              </p>
                              <p className="mt-1 text-[0.65rem] text-cyber-green">
                                {t("provenancePreserved")}
                              </p>
                            </article>
                          ),
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <section
        aria-labelledby="planning-workbench-heading"
        className="rounded-xl border border-cyber-green/25 bg-cyber-dark/50 p-4 sm:p-5"
      >
        <div className="flex flex-wrap items-start gap-3">
          <div className="rounded-lg border border-cyber-green/30 bg-cyber-green/10 p-2">
            <GitCompareArrows
              aria-hidden="true"
              className="h-5 w-5 text-cyber-green"
            />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="planning-workbench-heading"
              className="font-orbitron text-lg text-cyber-text"
            >
              {t("planningWorkbench")}
            </h2>
            <p className="mt-1 text-sm text-cyber-text-dim">
              {t("planningWorkbenchDesc")}
            </p>
          </div>
          <button
            type="button"
            disabled={
              planningStatus === "loading" ||
              planningStatus === "creating" ||
              planningStatus === "reviewing"
            }
            onClick={() => void createPlanningPortfolio()}
            className="inline-flex items-center gap-2 rounded-lg border border-cyber-green/40 bg-cyber-green/10 px-3 py-2 text-sm text-cyber-green disabled:cursor-wait disabled:opacity-50"
          >
            <Target aria-hidden="true" className="h-4 w-4" />
            {planningStatus === "creating"
              ? t("creatingPlan")
              : t("createPlanningPortfolio")}
          </button>
        </div>

        <div aria-live="polite" className="mt-4">
          {planningStatus === "loading" && (
            <p className="text-sm text-cyber-text-dim">
              {t("loadingPlanning")}
            </p>
          )}
          {planningStatus === "error" && (
            <p role="alert" className="text-sm text-cyber-red">
              {t("planningUnavailable")}
            </p>
          )}
          {planning && (
            <div
              className="space-y-4"
              data-testid="planning-workbench"
            >
              <p className="rounded-lg border border-cyber-yellow/30 bg-cyber-yellow/5 p-3 text-xs text-cyber-yellow">
                {planning.evidenceBoundary}
              </p>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  {
                    label: t("interventionPlans"),
                    value: planning.plans.length,
                  },
                  {
                    label: t("candidateCoverage"),
                    value: `${planning.gates.plansWithNoActionAndTwoCandidatesPercent}%`,
                  },
                  {
                    label: t("experimentReplay"),
                    value: `${planning.gates.deterministicExperimentReplayPercent}%`,
                  },
                  {
                    label: t("unsafeStages"),
                    value:
                      planning.gates
                        .stagedWithoutApprovalBudgetOrCapability,
                  },
                ].map((metric) => (
                  <article
                    key={metric.label}
                    className="rounded-lg border border-cyber-green/20 bg-cyber-black/20 p-3"
                  >
                    <p className="text-xs text-cyber-text-dim">
                      {metric.label}
                    </p>
                    <p className="mt-1 font-mono text-xl text-cyber-green">
                      {metric.value}
                    </p>
                  </article>
                ))}
              </div>

              {!latestPlan ? (
                <p className="rounded-lg border border-cyber-gray/30 p-3 text-sm text-cyber-text-dim">
                  {t("noPlanningPortfolio")}
                </p>
              ) : (
                <div className="space-y-4" data-testid="intervention-plan">
                  <div className="grid gap-3 lg:grid-cols-3">
                    <article className="rounded-lg border border-cyber-green/25 bg-cyber-black/20 p-4">
                      <p className="text-xs uppercase tracking-wider text-cyber-text-dim">
                        {t("planStatus")}
                      </p>
                      <p className="mt-2 font-mono text-sm text-cyber-green">
                        {latestPlan.status}
                      </p>
                      <p className="mt-2 break-all text-xs text-cyber-text-dim">
                        {latestPlan.id}
                      </p>
                    </article>
                    <article className="rounded-lg border border-cyber-green/25 bg-cyber-black/20 p-4">
                      <p className="text-xs uppercase tracking-wider text-cyber-text-dim">
                        {t("frozenBudget")}
                      </p>
                      <p className="mt-2 font-mono text-sm text-cyber-green">
                        {latestPlan.budget.reservedCost} /{" "}
                        {latestPlan.budget.maximumCost}
                      </p>
                      <p className="mt-2 text-xs text-cyber-text-dim">
                        {latestPlan.budget.remainingCost}{" "}
                        {t("budgetRemaining")}
                      </p>
                    </article>
                    <article className="rounded-lg border border-cyber-green/25 bg-cyber-black/20 p-4">
                      <p className="text-xs uppercase tracking-wider text-cyber-text-dim">
                        {t("humanReview")}
                      </p>
                      <p className="mt-2 font-mono text-sm text-cyber-green">
                        {latestPlan.decision.approvals.length}/
                        {latestPlan.decision.requiredApprovals}
                      </p>
                      <p className="mt-2 text-xs text-cyber-text-dim">
                        {latestPlan.decision.decision}
                      </p>
                    </article>
                  </div>

                  <div className="rounded-lg border border-cyber-gray/30 bg-cyber-black/20 p-4">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-cyber-text">
                      {t("frozenExperimentDesign")}
                    </h3>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-cyber-text-dim">
                      <span className="rounded bg-cyber-dark px-2 py-1">
                        {latestPlan.design.seeds.length} {t("pairedSeeds")}
                      </span>
                      <span className="rounded bg-cyber-dark px-2 py-1">
                        {latestPlan.design.horizonTicks} {t("horizonTicks")}
                      </span>
                      <span className="rounded bg-cyber-dark px-2 py-1">
                        {latestPlan.design.multipleComparisonMethod}
                      </span>
                      <span className="rounded bg-cyber-dark px-2 py-1">
                        {latestPlan.design.regressionToMeanControl}
                      </span>
                      <span className="rounded bg-cyber-dark px-2 py-1">
                        {latestPlan.design.naturalCycleControl}
                      </span>
                    </div>
                    <p className="mt-3 text-xs text-cyber-text-dim">
                      {t("stoppingRules")}:{" "}
                      {latestPlan.design.stoppingRules
                        .map((rule) => rule.type)
                        .join(" · ")}
                    </p>
                  </div>

                  <div
                    role="region"
                    aria-label={t("candidatePortfolio")}
                    tabIndex={0}
                    className="overflow-x-auto rounded-lg border border-cyber-gray/30 focus:outline-none focus:ring-2 focus:ring-cyber-green"
                  >
                    <table className="min-w-full text-left text-xs">
                      <caption className="sr-only">
                        {t("candidatePortfolio")}
                      </caption>
                      <thead className="bg-cyber-black/40 text-cyber-text-dim">
                        <tr>
                          <th scope="col" className="px-3 py-2">
                            {t("candidate")}
                          </th>
                          <th scope="col" className="px-3 py-2">
                            {t("provenance")}
                          </th>
                          <th scope="col" className="px-3 py-2">
                            {t("riskAndCost")}
                          </th>
                          <th scope="col" className="px-3 py-2">
                            {t("pareto")}
                          </th>
                          <th scope="col" className="px-3 py-2">
                            {t("experimentResult")}
                          </th>
                          <th scope="col" className="px-3 py-2">
                            {t("schedule")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {latestPlan.candidates.map((candidate) => {
                          const result = latestPlan.results.find(
                            (item) =>
                              item.candidateId === candidate.id,
                          );
                          const scheduled = latestPlan.schedule.find(
                            (item) =>
                              item.candidateId === candidate.id,
                          );
                          return (
                            <tr
                              key={candidate.id}
                              className="border-t border-cyber-gray/20 text-cyber-text"
                            >
                              <th
                                scope="row"
                                className="min-w-48 px-3 py-2 font-normal"
                              >
                                <p className="font-medium text-cyber-green">
                                  {candidate.name}
                                </p>
                                <p className="mt-1 text-[0.7rem] text-cyber-text-dim">
                                  {candidate.actions.length}{" "}
                                  {t("declarativeActions")}
                                  {candidate.id ===
                                    latestPlan.decision
                                      .selectedCandidateId && (
                                    <> · {t("selected")}</>
                                  )}
                                </p>
                              </th>
                              <td className="min-w-40 px-3 py-2">
                                {candidate.provenance
                                  .map((item) => item.source)
                                  .join(" · ")}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2">
                                {candidate.risk} · {candidate.cost}
                              </td>
                              <td className="px-3 py-2">
                                {candidate.paretoStatus}
                              </td>
                              <td className="min-w-40 px-3 py-2">
                                {result?.conclusion ?? "—"} · Δ{" "}
                                {result?.meanTargetDelta ?? 0}
                              </td>
                              <td className="min-w-52 px-3 py-2">
                                <p>{scheduled?.status ?? t("baseline")}</p>
                                <p className="mt-1 text-[0.7rem] text-cyber-text-dim">
                                  {scheduled?.reason ??
                                    t("noActionComparison")}
                                </p>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="rounded-lg border border-cyber-gray/30 bg-cyber-black/20 p-4">
                      <h3 className="text-sm font-semibold uppercase tracking-wider text-cyber-text">
                        {t("decisionRationale")}
                      </h3>
                      <p className="mt-3 text-xs text-cyber-text">
                        {latestPlan.decision.rationale}
                      </p>
                      <ul className="mt-3 space-y-2 text-[0.7rem] text-cyber-text-dim">
                        {latestPlan.decision.rejectedCandidates.map(
                          (candidate) => (
                            <li key={candidate.candidateId}>
                              <span className="font-mono text-cyber-orange">
                                {candidate.candidateId}
                              </span>
                              : {candidate.reasons.join(" ")}
                            </li>
                          ),
                        )}
                      </ul>
                    </div>
                    <div className="rounded-lg border border-cyber-gray/30 bg-cyber-black/20 p-4">
                      <h3 className="text-sm font-semibold uppercase tracking-wider text-cyber-text">
                        {t("reviewActions")}
                      </h3>
                      <p className="mt-2 text-xs text-cyber-text-dim">
                        {t("reviewActionsDesc")}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={
                            planningStatus === "reviewing" ||
                            latestPlan.status !==
                              "awaiting-approval" ||
                            !latestPlan.decision.selectedCandidateId
                          }
                          onClick={() =>
                            void reviewPlanningPortfolio(
                              latestPlan,
                              "approve-plan",
                            )
                          }
                          className="rounded-lg border border-cyber-green/40 bg-cyber-green/10 px-3 py-2 text-xs text-cyber-green disabled:opacity-40"
                        >
                          {t("approveSelectedPlan")}
                        </button>
                        <button
                          type="button"
                          disabled={
                            planningStatus === "reviewing" ||
                            latestPlan.status !== "approved"
                          }
                          onClick={() =>
                            void reviewPlanningPortfolio(
                              latestPlan,
                              "stage-plan",
                            )
                          }
                          className="rounded-lg border border-cyber-blue/40 bg-cyber-blue/10 px-3 py-2 text-xs text-cyber-blue disabled:opacity-40"
                        >
                          {t("stageAuthorizedPlan")}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <section
        aria-labelledby="learning-observatory-heading"
        className="rounded-xl border border-cyber-purple/25 bg-cyber-dark/50 p-4 sm:p-5"
      >
        <div className="flex flex-wrap items-start gap-3">
          <div className="rounded-lg border border-cyber-purple/30 bg-cyber-purple/10 p-2">
            <BookOpen
              aria-hidden="true"
              className="h-5 w-5 text-cyber-purple"
            />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="learning-observatory-heading"
              className="font-orbitron text-lg text-cyber-text"
            >
              {t("learningObservatory")}
            </h2>
            <p className="mt-1 text-sm text-cyber-text-dim">
              {t("learningObservatoryDesc")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={
                outcomeStatus === "preparing" ||
                outcomeStatus === "evaluating" ||
                outcomeStatus === "mutating"
              }
              onClick={() => void prepareLearningPortfolio()}
              className="rounded-lg border border-cyber-purple/40 bg-cyber-purple/10 px-3 py-2 text-xs text-cyber-purple disabled:opacity-40"
            >
              {outcomeStatus === "preparing"
                ? t("preparingLearningPortfolio")
                : t("prepareLearningPortfolio")}
            </button>
            <button
              type="button"
              disabled={
                outcomeStatus === "evaluating" ||
                outcomeStatus === "mutating" ||
                latestPlan?.status !== "staged" ||
                Boolean(
                  outcomeLearning?.outcomes.some(
                    (outcome) =>
                      outcome.planId === latestPlan?.id,
                  ),
                )
              }
              onClick={() =>
                latestPlan &&
                void mutateOutcomeLearning(
                  {
                    action: "evaluate-plan",
                    planId: latestPlan.id,
                  },
                  "evaluating",
                )
              }
              className="inline-flex items-center gap-2 rounded-lg border border-cyber-blue/40 bg-cyber-blue/10 px-3 py-2 text-xs text-cyber-blue disabled:opacity-40"
            >
              <Clock3 aria-hidden="true" className="h-4 w-4" />
              {outcomeStatus === "evaluating"
                ? t("evaluatingOutcome")
                : t("evaluateDelayedOutcome")}
            </button>
          </div>
        </div>

        <div aria-live="polite" className="mt-4">
          {outcomeStatus === "loading" && (
            <p className="text-sm text-cyber-text-dim">
              {t("loadingOutcomeLearning")}
            </p>
          )}
          {outcomeStatus === "error" && (
            <p role="alert" className="text-sm text-cyber-red">
              {t("outcomeLearningUnavailable")}
            </p>
          )}
          {outcomeLearning && (
            <div
              className="space-y-4"
              data-testid="learning-observatory"
            >
              <p className="rounded-lg border border-cyber-yellow/30 bg-cyber-yellow/5 p-3 text-xs text-cyber-yellow">
                {outcomeLearning.evidenceBoundary}
              </p>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                {[
                  {
                    label: t("evaluatedOutcomes"),
                    value: outcomeLearning.outcomes.length,
                  },
                  {
                    label: t("lessonDispositionCoverage"),
                    value: `${outcomeLearning.gates.completedOutcomeLessonDispositionPercent}%`,
                  },
                  {
                    label: t("outcomeReplay"),
                    value: `${outcomeLearning.gates.deterministicOutcomeReplayPercent}%`,
                  },
                  {
                    label: t("harmfulPositiveRetrieval"),
                    value:
                      outcomeLearning.gates
                        .harmfulPositiveRetrievalCount,
                  },
                  {
                    label: t("invalidPlaybooks"),
                    value:
                      outcomeLearning.gates
                        .invalidLessonActivePlaybookCount,
                  },
                  {
                    label: t("closureCoverage"),
                    value: `${outcomeLearning.gates.resolvedIncidentOutcomeCoveragePercent}%`,
                  },
                ].map((metric) => (
                  <article
                    key={metric.label}
                    className="rounded-lg border border-cyber-purple/20 bg-cyber-black/20 p-3"
                  >
                    <p className="text-[0.7rem] text-cyber-text-dim">
                      {metric.label}
                    </p>
                    <p className="mt-1 font-mono text-lg text-cyber-purple">
                      {metric.value}
                    </p>
                  </article>
                ))}
              </div>

              {!latestOutcome ? (
                <p className="rounded-lg border border-cyber-gray/30 p-3 text-sm text-cyber-text-dim">
                  {t("noOutcomeEvidence")}
                </p>
              ) : (
                <div
                  className="space-y-4"
                  data-testid="outcome-record"
                >
                  <div className="grid gap-3 lg:grid-cols-4">
                    <article className="rounded-lg border border-cyber-purple/25 bg-cyber-black/20 p-4">
                      <p className="text-xs uppercase tracking-wider text-cyber-text-dim">
                        {t("independentEvaluator")}
                      </p>
                      <p className="mt-2 font-mono text-xs text-cyber-purple">
                        {latestOutcome.evaluator.id}
                      </p>
                      <p className="mt-2 text-[0.7rem] text-cyber-green">
                        {latestOutcome.evaluator.independentFromProposer
                          ? t("independentFromProposer")
                          : t("notIndependent")}
                      </p>
                    </article>
                    <article className="rounded-lg border border-cyber-purple/25 bg-cyber-black/20 p-4">
                      <p className="text-xs uppercase tracking-wider text-cyber-text-dim">
                        {t("outcomeVerdict")}
                      </p>
                      <p className="mt-2 font-mono text-sm text-cyber-purple">
                        {latestOutcome.verdict}
                      </p>
                      <p className="mt-2 text-[0.7rem] text-cyber-text-dim">
                        {latestOutcome.status} · revision{" "}
                        {latestOutcome.revision}
                      </p>
                    </article>
                    <article className="rounded-lg border border-cyber-purple/25 bg-cyber-black/20 p-4">
                      <p className="text-xs uppercase tracking-wider text-cyber-text-dim">
                        {t("lessonDisposition")}
                      </p>
                      <p className="mt-2 font-mono text-sm text-cyber-purple">
                        {latestOutcome.lessonDisposition}
                      </p>
                      <p className="mt-2 text-[0.7rem] text-cyber-text-dim">
                        {latestOutcome.reopenedIncident
                          ? t("incidentReopened")
                          : t("incidentNotReopened")}
                      </p>
                    </article>
                    <article className="rounded-lg border border-cyber-purple/25 bg-cyber-black/20 p-4">
                      <p className="text-xs uppercase tracking-wider text-cyber-text-dim">
                        {t("lateEvidence")}
                      </p>
                      <p className="mt-2 font-mono text-sm text-cyber-purple">
                        {latestOutcome.lateEvidence.length}
                      </p>
                      <p className="mt-2 break-all text-[0.7rem] text-cyber-text-dim">
                        {latestOutcome.frozenContext.planFingerprint.slice(
                          0,
                          16,
                        )}
                      </p>
                    </article>
                  </div>

                  <div
                    role="region"
                    aria-label={t("outcomeWindows")}
                    tabIndex={0}
                    className="overflow-x-auto rounded-lg border border-cyber-gray/30 focus:outline-none focus:ring-2 focus:ring-cyber-purple"
                  >
                    <table className="min-w-full text-left text-xs">
                      <caption className="sr-only">
                        {t("outcomeWindows")}
                      </caption>
                      <thead className="bg-cyber-black/40 text-cyber-text-dim">
                        <tr>
                          <th scope="col" className="px-3 py-2">
                            {t("observationWindow")}
                          </th>
                          <th scope="col" className="px-3 py-2">
                            {t("expectedEffect")}
                          </th>
                          <th scope="col" className="px-3 py-2">
                            {t("observedEffect")}
                          </th>
                          <th scope="col" className="px-3 py-2">
                            {t("predictionError")}
                          </th>
                          <th scope="col" className="px-3 py-2">
                            {t("guardrailAttribution")}
                          </th>
                          <th scope="col" className="px-3 py-2">
                            {t("outcomeVerdict")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {latestOutcome.windows.map((window) => (
                          <tr
                            key={window.id}
                            className="border-t border-cyber-gray/20 text-cyber-text"
                          >
                            <th
                              scope="row"
                              className="whitespace-nowrap px-3 py-2 font-normal"
                            >
                              <p className="font-medium text-cyber-purple">
                                {window.window}
                              </p>
                              <p className="text-[0.7rem] text-cyber-text-dim">
                                {window.horizonTicks} ticks
                              </p>
                            </th>
                            <td className="px-3 py-2">
                              {window.expectedDelta}
                            </td>
                            <td className="px-3 py-2">
                              {window.observedDelta}
                            </td>
                            <td className="px-3 py-2">
                              {window.predictionError}
                            </td>
                            <td className="min-w-44 px-3 py-2">
                              {
                                window.guardrails.filter(
                                  (guardrail) =>
                                    guardrail.attributableBreach,
                                ).length
                              }{" "}
                              {t("attributableBreaches")}
                              <p className="mt-1 text-[0.7rem] text-cyber-text-dim">
                                {window.deterministicReplay
                                  ? t("exactReplay")
                                  : t("replayMismatch")}
                              </p>
                            </td>
                            <td className="px-3 py-2 font-mono">
                              {window.verdict}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={
                        outcomeStatus === "mutating" ||
                        latestOutcome.lateEvidence.length > 0
                      }
                      onClick={() =>
                        void mutateOutcomeLearning({
                          action: "record-late-evidence",
                          outcomeId: latestOutcome.id,
                          classification: "fact",
                          source:
                            "observer-synthetic-delayed-monitor",
                          metric: "energy",
                          delta: -100,
                          appliesAtOrAfterTick: 100,
                          rationale:
                            "Synthetic delayed harm test for lesson invalidation and incident reopening.",
                        })
                      }
                      className="rounded-lg border border-cyber-red/40 bg-cyber-red/10 px-3 py-2 text-xs text-cyber-red disabled:opacity-40"
                    >
                      {t("injectLateHarm")}
                    </button>
                    <button
                      type="button"
                      disabled={
                        outcomeStatus === "mutating" ||
                        latestOutcome.status === "under-review"
                      }
                      onClick={() =>
                        void mutateOutcomeLearning({
                          action: "flag-attribution",
                          outcomeId: latestOutcome.id,
                          rationale:
                            "Human observer requests independent attribution review.",
                        })
                      }
                      className="rounded-lg border border-cyber-yellow/40 bg-cyber-yellow/10 px-3 py-2 text-xs text-cyber-yellow disabled:opacity-40"
                    >
                      {t("flagAttribution")}
                    </button>
                    <button
                      type="button"
                      disabled={
                        outcomeStatus === "mutating" ||
                        !latestLesson ||
                        latestLesson.status !== "validated" ||
                        latestLesson.recommendation ===
                          "no-recommendation"
                      }
                      onClick={() =>
                        latestLesson &&
                        void mutateOutcomeLearning({
                          action: "propose-change",
                          lessonId: latestLesson.id,
                          target: "test",
                          title:
                            "Add deterministic delayed-outcome regression",
                          expectedImpact:
                            "Catch repeated synthetic outcome drift before release.",
                        })
                      }
                      className="rounded-lg border border-cyber-green/40 bg-cyber-green/10 px-3 py-2 text-xs text-cyber-green disabled:opacity-40"
                    >
                      {t("proposeGovernedTest")}
                    </button>
                  </div>
                </div>
              )}

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-lg border border-cyber-gray/30 bg-cyber-black/20 p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-cyber-text">
                    {t("lessonRegistry")}
                  </h3>
                  <div className="mt-3 space-y-2">
                    {outcomeLearning.lessons.length === 0 ? (
                      <p className="text-xs text-cyber-text-dim">
                        {t("noLessons")}
                      </p>
                    ) : (
                      outcomeLearning.lessons.slice(0, 8).map(
                        (lesson) => (
                          <article
                            key={lesson.id}
                            className="rounded border border-cyber-gray/25 p-3 text-xs"
                          >
                            <div className="flex flex-wrap gap-2">
                              <span className="font-mono text-cyber-purple">
                                {lesson.kind}
                              </span>
                              <span>{lesson.recommendation}</span>
                              <span className="text-cyber-text-dim">
                                {lesson.status}
                              </span>
                              <span className="ml-auto text-cyber-text-dim">
                                confidence {lesson.confidence}
                              </span>
                            </div>
                            <p className="mt-2 text-cyber-text">
                              {lesson.statement}
                            </p>
                            <p className="mt-2 text-[0.7rem] text-cyber-text-dim">
                              {t("predictionError")}:{" "}
                              {lesson.predictionError} ·{" "}
                              {t("positiveRetrieval")}:{" "}
                              {lesson.positiveRetrievalEligible
                                ? t("yes")
                                : t("no")}
                            </p>
                          </article>
                        ),
                      )
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-lg border border-cyber-gray/30 bg-cyber-black/20 p-4">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-cyber-text">
                      {t("responsePlaybooks")}
                    </h3>
                    <p className="mt-2 text-xs text-cyber-text-dim">
                      {t("playbookRecheckDesc")}
                    </p>
                    <ul className="mt-3 space-y-2 text-xs">
                      {outcomeLearning.playbooks.length === 0 ? (
                        <li className="text-cyber-text-dim">
                          {t("noPlaybooks")}
                        </li>
                      ) : (
                        outcomeLearning.playbooks.map((playbook) => (
                          <li
                            key={playbook.id}
                            className="rounded border border-cyber-gray/25 p-2"
                          >
                            <span className="text-cyber-purple">
                              {playbook.name}
                            </span>{" "}
                            · {playbook.status} ·{" "}
                            {playbook.actions.length}{" "}
                            {t("declarativeActions")}
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                  <div className="rounded-lg border border-cyber-gray/30 bg-cyber-black/20 p-4">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-cyber-text">
                      {t("governedLearning")}
                    </h3>
                    <p className="mt-2 text-xs text-cyber-text-dim">
                      {t("governedLearningDesc")}
                    </p>
                    <ul className="mt-3 space-y-2 text-xs">
                      {outcomeLearning.proposals.length === 0 ? (
                        <li className="text-cyber-text-dim">
                          {t("noLearningProposals")}
                        </li>
                      ) : (
                        outcomeLearning.proposals.map((proposal) => (
                          <li
                            key={proposal.id}
                            className="rounded border border-cyber-gray/25 p-2"
                          >
                            <span className="text-cyber-green">
                              {proposal.target}
                            </span>{" "}
                            · {proposal.status}
                            <p className="mt-1 text-[0.7rem] text-cyber-text-dim">
                              <span>{proposal.governanceRoute}</span>
                              {" · bypass="}
                              {String(proposal.bypassAllowed)}
                            </p>
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <section
        aria-labelledby="action-trace-heading"
        className="rounded-xl border border-cyber-blue/20 bg-cyber-dark/50 p-4 sm:p-5"
      >
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h2 id="action-trace-heading" className="font-orbitron text-lg text-cyber-text">
              {t("actionTrace")}
            </h2>
            <p className="mt-1 text-sm text-cyber-text-dim">{t("actionTraceDesc")}</p>
          </div>
          <label className="ml-auto flex items-center gap-2 text-sm text-cyber-text-dim">
            {t("agent")}
            <select
              value={agentFilter}
              onChange={(event) => setAgentFilter(event.target.value)}
              className="rounded-lg border border-cyber-blue/30 bg-cyber-black px-3 py-2 text-cyber-text"
            >
              <option value="all">{t("all")}</option>
              <option value="atlas">ATLAS</option>
              <option value="economica">ECONOMICA</option>
              <option value="civitas">CIVITAS</option>
              <option value="spectre">SPECTRE</option>
            </select>
          </label>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]">
          <div className="max-h-[34rem] space-y-2 overflow-y-auto pr-1">
            {filteredTraces.length === 0 ? (
              <p className="rounded-lg border border-cyber-gray/30 p-4 text-sm text-cyber-text-dim">
                {t("noActionTraces")}
              </p>
            ) : (
              filteredTraces.map((trace) => (
                <button
                  type="button"
                  key={trace.id}
                  onClick={() => setSelectedTraceId(trace.id)}
                  className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left ${
                    selectedTrace?.id === trace.id
                      ? "border-cyber-blue/60 bg-cyber-blue/10"
                      : "border-cyber-gray/30 bg-cyber-black/20 hover:border-cyber-blue/30"
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium text-cyber-text">
                      {trace.agentId.toUpperCase()} · {String(trace.action?.payload.metric ?? "command")}
                    </p>
                    <p className="mt-1 text-xs text-cyber-text-dim">
                      tick {trace.tick} · {trace.completeness}% · {trace.status}
                    </p>
                  </div>
                  <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-cyber-blue" />
                </button>
              ))
            )}
          </div>

          <div className="min-w-0 rounded-lg border border-cyber-gray/30 bg-cyber-black/20 p-4">
            {selectedTrace ? (
              <TraceDetails trace={selectedTrace} />
            ) : (
              <p className="text-sm text-cyber-text-dim">{t("selectTrace")}</p>
            )}
          </div>
        </div>
      </section>

      <section
        aria-labelledby="model-approval-heading"
        className="rounded-xl border border-cyber-blue/20 bg-cyber-dark/50 p-5"
      >
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <BrainCircuit className="h-5 w-5 text-cyber-blue" />
              <h2 id="model-approval-heading" className="font-orbitron text-lg text-cyber-text">
                {t("humanApprovalQueue")}
              </h2>
            </div>
            <p className="mt-1 text-sm text-cyber-text-dim">
              {t("humanApprovalQueueDesc")}
            </p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-cyber-text-dim">
              <span>{t("provider")}: <code className="text-cyber-blue">{modelRuntime.providerId}/{modelRuntime.model}</code></span>
              <span>{t("prompt")}: <code className="text-cyber-blue">{modelRuntime.promptVersion}</code></span>
              <span>{t("tokenBudget")}: {modelRuntime.budgets.maxTokensPerProposal}</span>
              <span>{t("timeout")}: {modelRuntime.budgets.timeoutMs}ms</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-2 text-sm text-cyber-text-dim">
              {t("agent")}
              <select
                value={modelAgent}
                onChange={(event) =>
                  setModelAgent(
                    event.target.value as typeof modelAgent,
                  )
                }
                aria-label={t("modelAgent")}
                className="rounded-lg border border-cyber-blue/30 bg-cyber-black px-3 py-2 text-cyber-text"
              >
                <option value="atlas">ATLAS</option>
                <option value="economica">ECONOMICA</option>
                <option value="civitas">CIVITAS</option>
                <option value="spectre">SPECTRE</option>
              </select>
            </label>
            <button
              type="button"
              disabled={modelRuntime.generating}
              onClick={() => void requestModelProposal(modelAgent)}
              className="inline-flex items-center gap-2 rounded-lg border border-cyber-blue/40 bg-cyber-blue/10 px-3 py-2 text-sm text-cyber-blue hover:bg-cyber-blue/20 disabled:cursor-wait disabled:opacity-50"
            >
              <BrainCircuit className="h-4 w-4" />
              {modelRuntime.generating ? t("generating") : t("generateProposal")}
            </button>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {modelRuntime.approvals.length === 0 ? (
            <p className="rounded-lg border border-cyber-gray/30 p-4 text-sm text-cyber-text-dim">
              {t("noApprovalRequests")}
            </p>
          ) : (
            modelRuntime.approvals.slice(0, 8).map((approval) => (
              <article
                key={approval.id}
                data-testid="approval-request"
                className="rounded-lg border border-cyber-gray/30 bg-cyber-black/20 p-4"
              >
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-cyber-text">
                        {approval.agentId.toUpperCase()} ·{" "}
                        {approval.execution?.proposal.metric ?? t("proposalFailed")}
                      </span>
                      <span className="rounded bg-cyber-blue/15 px-2 py-0.5 text-xs text-cyber-blue">
                        {approval.status}
                      </span>
                      {approval.riskTier && (
                        <span className="rounded bg-cyber-gray/60 px-2 py-0.5 text-xs text-cyber-text">
                          {t("risk")}: {approval.riskTier}
                        </span>
                      )}
                    </div>
                    {approval.execution ? (
                      <>
                        <p className="mt-2 text-sm text-cyber-text-dim">
                          {approval.execution.proposal.rationale}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-cyber-text-dim">
                          <span>Δ {approval.execution.proposal.delta}</span>
                          <span>{approval.execution.usage.tokenCount} tokens</span>
                          <span>${approval.execution.usage.costUsd.toFixed(4)}</span>
                          <span>{approval.execution.usage.latencyMs}ms</span>
                          <span>{t("expiresAtTick")} {approval.expiresAtTick}</span>
                        </div>
                      </>
                    ) : (
                      <p className="mt-2 text-sm text-cyber-red">{approval.error}</p>
                    )}
                  </div>

                  {approval.status === "pending" && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => approveModelProposal(approval.id)}
                        aria-label={`${t("approve")} ${approval.agentId}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-cyber-green/40 bg-cyber-green/10 px-3 py-2 text-sm text-cyber-green"
                      >
                        <ThumbsUp className="h-4 w-4" />
                        {t("approve")}
                      </button>
                      <button
                        type="button"
                        onClick={() => rejectModelProposal(approval.id)}
                        aria-label={`${t("reject")} ${approval.agentId}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-cyber-red/40 bg-cyber-red/10 px-3 py-2 text-sm text-cyber-red"
                      >
                        <ThumbsDown className="h-4 w-4" />
                        {t("reject")}
                      </button>
                    </div>
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section
          aria-labelledby="tick-inspector-heading"
          className="rounded-xl border border-cyber-blue/20 bg-cyber-dark/50 p-5"
        >
          <h2 id="tick-inspector-heading" className="font-orbitron text-lg text-cyber-text">
            {t("tickInspector")}
          </h2>
          <p className="mt-1 text-sm text-cyber-text-dim">{t("tickInspectorDesc")}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <input
              type="number"
              min={simulation.initialState.tick}
              max={simulation.world.tick}
              value={inspectionTick}
              onChange={(event) => setInspectionTick(Number(event.target.value))}
              aria-label={t("inspectionTick")}
              className="min-w-0 flex-1 rounded-lg border border-cyber-blue/30 bg-cyber-black px-3 py-2 text-cyber-text"
            />
            <button
              type="button"
              onClick={inspectTick}
              className="inline-flex items-center gap-2 rounded-lg border border-cyber-blue/40 bg-cyber-blue/10 px-3 py-2 text-sm text-cyber-blue hover:bg-cyber-blue/20"
            >
              <ScanSearch className="h-4 w-4" />
              {t("inspect")}
            </button>
          </div>
          {inspection && (
            <div data-testid="tick-inspection" className="mt-4 rounded-lg border border-cyber-gray/30 p-3">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-cyber-text-dim">
                <span>tick {inspection.tick}</span>
                <span>{inspection.events} events</span>
                <code>{inspection.fingerprint}</code>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(["energy", "crime", "traffic", "happiness"] as const).map((metric) => (
                  <div key={metric} className="rounded bg-cyber-black/40 p-2">
                    <p className="text-xs text-cyber-text-dim">{metric}</p>
                    <p className="font-mono text-sm text-cyber-text">
                      {inspection.metrics[metric]}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section
          aria-labelledby="run-comparison-heading"
          className="rounded-xl border border-cyber-blue/20 bg-cyber-dark/50 p-5"
        >
          <h2 id="run-comparison-heading" className="font-orbitron text-lg text-cyber-text">
            {t("runComparison")}
          </h2>
          <p className="mt-1 text-sm text-cyber-text-dim">{t("runComparisonDesc")}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <input
              value={comparisonSeed}
              onChange={(event) => setComparisonSeed(event.target.value)}
              aria-label={t("comparisonSeed")}
              className="min-w-0 flex-1 rounded-lg border border-cyber-blue/30 bg-cyber-black px-3 py-2 text-cyber-text"
            />
            <button
              type="button"
              onClick={runCounterfactual}
              className="inline-flex items-center gap-2 rounded-lg border border-cyber-blue/40 bg-cyber-blue/10 px-3 py-2 text-sm text-cyber-blue hover:bg-cyber-blue/20"
            >
              <GitCompareArrows className="h-4 w-4" />
              {t("compare")}
            </button>
          </div>
          {comparison && (
            <div data-testid="run-comparison" className="mt-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {COMPARISON_METRICS.map((metric) => {
                  const delta = comparison.metricDeltas[metric];
                  return (
                    <div key={metric} className="rounded-lg border border-cyber-gray/30 p-2">
                      <p className="text-xs text-cyber-text-dim">{metric}</p>
                      <p className={`font-mono text-sm ${delta === 0 ? "text-cyber-text" : delta > 0 ? "text-cyber-green" : "text-cyber-red"}`}>
                        {delta > 0 ? "+" : ""}{delta}
                      </p>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-cyber-text-dim">
                Δ events {comparison.eventDelta} · Δ actions {comparison.actionDelta}
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
