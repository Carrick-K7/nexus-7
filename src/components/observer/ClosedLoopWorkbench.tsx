"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Activity,
  AlertOctagon,
  BookOpenCheck,
  CheckCircle2,
  CirclePause,
  CirclePlay,
  GitBranch,
  RotateCcw,
  ShieldCheck,
  Square,
} from "lucide-react";
import {
  useTranslation,
} from "@/hooks/useTranslation";
import type {
  TranslationKey,
} from "@/i18n/translations";
import type {
  ClosedLoopCase,
  ClosedLoopCommand,
  ClosedLoopOverview,
  ClosedLoopStageCode,
} from "@/closure";

const ADMIN_HEADERS = {
  "Content-Type": "application/json",
  "x-nexus-role": "admin",
  "x-nexus-actor": "observer-closed-loop-admin",
};

const STAGE_LABELS: Record<
  ClosedLoopStageCode,
  TranslationKey
> = {
  detection: "closureStageDetection",
  triage: "closureStageTriage",
  diagnosis: "closureStageDiagnosis",
  planning: "closureStagePlanning",
  experiment: "closureStageExperiment",
  authorization: "closureStageAuthorization",
  deployment: "closureStageDeployment",
  outcome: "closureStageOutcome",
  learning: "closureStageLearning",
  closure: "closureStageClosure",
};

const LINK_LABELS: Array<{
  key: keyof ClosedLoopCase["links"];
  label: TranslationKey;
}> = [
  { key: "incidentId", label: "closureTraceIncident" },
  { key: "diagnosisId", label: "closureTraceHypothesis" },
  { key: "planId", label: "closureTracePlan" },
  { key: "deploymentId", label: "closureTraceDeployment" },
  { key: "outcomeId", label: "closureTraceOutcome" },
  { key: "lessonId", label: "closureTraceLesson" },
  {
    key: "learningProposalId",
    label: "closureTraceProposal",
  },
];

function percent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export default function ClosedLoopWorkbench() {
  const { t } = useTranslation();
  const [overview, setOverview] =
    useState<ClosedLoopOverview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/closure", {
        cache: "no-store",
        signal,
      });
      if (!response.ok) {
        throw new Error(
          `Closed-loop overview failed with ${response.status}`,
        );
      }
      const payload =
        (await response.json()) as ClosedLoopOverview;
      if (
        payload.schemaVersion !==
        "nexus.closed-loop-overview.v2"
      ) {
        throw new Error(
          "Closed-loop overview schema is unsupported",
        );
      }
      setOverview(payload);
      setError(null);
    } catch (cause) {
      if (
        !(
          cause instanceof DOMException &&
          cause.name === "AbortError"
        )
      ) {
        setError(
          cause instanceof Error
            ? cause.message
            : String(cause),
        );
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => void load(controller.signal),
      0,
    );
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [load]);

  const latest = useMemo(
    () => overview?.cases[0],
    [overview],
  );

  const mutate = useCallback(
    async (
      body:
        | { action: "run-reference" }
        | {
            action: "command";
            caseId: string;
            command: ClosedLoopCommand;
            idempotencyKey: string;
            reason: string;
          },
    ) => {
      setBusy(true);
      setError(null);
      try {
        const response = await fetch("/api/closure", {
          method: "POST",
          headers: ADMIN_HEADERS,
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          const payload = (await response.json()) as {
            error?: string;
          };
          throw new Error(
            payload.error ??
              `Closed-loop action failed with ${response.status}`,
          );
        }
        await load();
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : String(cause),
        );
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const command = useCallback(
    (kind: ClosedLoopCommand, reason: string) => {
      if (!latest) {
        return;
      }
      void mutate({
        action: "command",
        caseId: latest.id,
        command: kind,
        idempotencyKey:
          `observer:${kind}:${latest.revision}:${Date.now()}`,
        reason,
      });
    },
    [latest, mutate],
  );

  const controls = latest
    ? [
        {
          command: "advance" as const,
          label: t("closureAdvance"),
          icon: CirclePlay,
          visible: ![
            "closed",
            "cancelled",
            "paused",
            "blocked",
          ].includes(latest.status),
        },
        {
          command: "pause" as const,
          label: t("pause"),
          icon: CirclePause,
          visible: ![
            "closed",
            "cancelled",
            "paused",
          ].includes(latest.status),
        },
        {
          command: "resume" as const,
          label: t("resume"),
          icon: CirclePlay,
          visible: ["paused", "blocked", "reopened"].includes(
            latest.status,
          ),
        },
        {
          command: "rollback" as const,
          label: t("closureRollback"),
          icon: RotateCcw,
          visible: ["staged", "monitoring"].includes(
            latest.status,
          ),
        },
        {
          command: "emergency-stop" as const,
          label: t("closureEmergencyStop"),
          icon: AlertOctagon,
          visible: ![
            "closed",
            "cancelled",
            "emergency-stopped",
          ].includes(latest.status),
        },
        {
          command: "reopen" as const,
          label: t("closureReopen"),
          icon: GitBranch,
          visible: [
            "closed",
            "cancelled",
            "verified-beneficial",
            "rolled-back",
            "inconclusive",
          ].includes(latest.status),
        },
      ].filter((item) => item.visible)
    : [];

  return (
    <section
      aria-labelledby="closed-loop-heading"
      className="rounded-xl border border-cyber-green/25 bg-cyber-dark/50 p-4 sm:p-5"
      data-testid="closed-loop-workbench"
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className="rounded-lg border border-cyber-green/30 bg-cyber-green/10 p-2">
          <BookOpenCheck className="h-5 w-5 text-cyber-green" />
        </div>
        <div className="min-w-0 flex-1">
          <h2
            id="closed-loop-heading"
            className="font-orbitron text-lg text-cyber-text"
          >
            {t("closedLoopLab")}
          </h2>
          <p className="mt-1 text-sm text-cyber-text-dim">
            {t("closedLoopLabDesc")}
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          data-testid="run-closed-loop-reference"
          onClick={() =>
            void mutate({ action: "run-reference" })
          }
          className="inline-flex items-center gap-2 rounded-lg border border-cyber-green/40 bg-cyber-green/10 px-3 py-2 text-sm font-semibold text-cyber-green disabled:cursor-wait disabled:opacity-50"
        >
          <Activity className="h-4 w-4" />
          {busy
            ? t("closureRunning")
            : t("closureRunReference")}
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-cyber-red/40 bg-cyber-red/5 p-3 text-sm text-cyber-red"
        >
          {error}
        </p>
      )}

      <p className="mt-4 rounded-lg border border-cyber-yellow/30 bg-cyber-yellow/5 p-3 text-xs text-cyber-yellow">
        {overview?.syntheticBoundary ??
          t("closureSyntheticBoundary")}
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          {
            label: t("closureTotalCases"),
            value: overview?.metrics.totalCases ?? "—",
          },
          {
            label: t("closureOpenCases"),
            value: overview?.metrics.openCases ?? "—",
          },
          {
            label: t("closureBeneficial"),
            value:
              overview?.metrics.beneficialClosures ?? "—",
          },
          {
            label: t("closureRollbackRate"),
            value: overview
              ? percent(
                  overview.metrics.rollbackRatePercent,
                )
              : "—",
          },
          {
            label: t("closureOldestUnresolved"),
            value: overview
              ? `${overview.metrics.oldestUnresolvedHours.toFixed(1)}h`
              : "—",
          },
        ].map((metric) => (
          <div
            key={metric.label}
            className="rounded-lg border border-cyber-green/20 bg-cyber-black/20 p-3"
          >
            <p className="text-xs text-cyber-text-dim">
              {metric.label}
            </p>
            <p className="mt-1 font-mono text-xl text-cyber-green">
              {metric.value}
            </p>
          </div>
        ))}
      </div>

      {!latest ? (
        <p className="mt-4 rounded-lg border border-cyber-gray/30 p-4 text-sm text-cyber-text-dim">
          {t("closureNoCases")}
        </p>
      ) : (
        <div className="mt-5 space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <span
              data-testid="closed-loop-status"
              className="rounded-full border border-cyber-green/40 bg-cyber-green/10 px-3 py-1 text-sm font-bold text-cyber-green"
            >
              {latest.status}
            </span>
            {latest.disposition && (
              <span
                data-testid="closed-loop-disposition"
                className="rounded-full border border-cyber-blue/40 bg-cyber-blue/10 px-3 py-1 text-sm text-cyber-blue"
              >
                {latest.disposition}
              </span>
            )}
            <code className="min-w-0 break-all text-xs text-cyber-text-dim">
              {latest.id}
            </code>
          </div>

          <div className="flex flex-wrap gap-2">
            {controls.map((control) => {
              const Icon = control.icon;
              return (
                <button
                  type="button"
                  key={control.command}
                  disabled={busy}
                  onClick={() =>
                    command(
                      control.command,
                      `Observer requested ${control.command}`,
                    )
                  }
                  className="inline-flex items-center gap-2 rounded-lg border border-cyber-blue/30 px-3 py-2 text-sm text-cyber-text hover:bg-cyber-blue/10 disabled:opacity-50"
                >
                  <Icon className="h-4 w-4" />
                  {control.label}
                </button>
              );
            })}
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-cyber-text">
              {t("closureStageLedger")}
            </h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
              {latest.stages.map((stage) => (
                <article
                  key={stage.code}
                  data-stage-status={stage.status}
                  className={`rounded-lg border p-3 ${
                    ["completed", "skipped"].includes(
                      stage.status,
                    )
                      ? "border-cyber-green/30 bg-cyber-green/5"
                      : stage.status === "active"
                        ? "border-cyber-blue/40 bg-cyber-blue/5"
                        : "border-cyber-gray/30 bg-cyber-black/20"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {stage.status === "completed" ? (
                      <CheckCircle2 className="h-4 w-4 text-cyber-green" />
                    ) : (
                      <Square className="h-4 w-4 text-cyber-text-dim" />
                    )}
                    <h4 className="text-xs font-semibold text-cyber-text">
                      {t(STAGE_LABELS[stage.code])}
                    </h4>
                  </div>
                  <p className="mt-2 text-xs text-cyber-text-dim">
                    {stage.status} · {stage.owner.id}
                  </p>
                  <p className="mt-1 text-xs text-cyber-text-dim">
                    {stage.evidenceIds.length}{" "}
                    {t("closureEvidenceRefs")}
                  </p>
                </article>
              ))}
            </div>
          </div>

          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-cyber-text">
              <ShieldCheck className="h-4 w-4 text-cyber-green" />
              {t("closureUnifiedTrace")}
            </h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {LINK_LABELS.map((link) => {
                const value = latest.links[link.key];
                return (
                  <div
                    key={link.key}
                    className="rounded-lg border border-cyber-gray/30 bg-cyber-black/20 p-3"
                  >
                    <p className="text-xs text-cyber-text-dim">
                      {t(link.label)}
                    </p>
                    <code className="mt-1 block break-all text-xs text-cyber-text">
                      {value ?? t("closurePending")}
                    </code>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-cyber-gray/30 bg-cyber-black/20 p-3 text-xs text-cyber-text-dim">
            <p>
              {t("closureArtifactTrust")}:{" "}
              <strong className="text-cyber-text">
                {latest.releaseArtifact.trust}
              </strong>
            </p>
            <code className="mt-1 block break-all">
              {latest.releaseArtifact.fingerprint}
            </code>
          </div>
        </div>
      )}
    </section>
  );
}
