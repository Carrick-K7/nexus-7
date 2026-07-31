"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Download,
  KeyRound,
  RefreshCw,
  ShieldAlert,
  TimerReset,
  Wrench,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTranslation } from "@/hooks/useTranslation";
import type {
  OperationsOverview,
  OperationalSource,
  SloSample,
} from "@/operations";
import type {
  WorkspaceAccessOverview,
} from "@/governance";

type OperationsPayload = OperationsOverview;

async function loadOperationsData(
  signal?: AbortSignal,
): Promise<{
  operations: OperationsPayload;
  access: WorkspaceAccessOverview;
}> {
  const [operationsResponse, accessResponse] = await Promise.all([
    fetch("/api/operations", { cache: "no-store", signal }),
    fetch("/api/governance/access", { cache: "no-store", signal }),
  ]);
  if (!operationsResponse.ok || !accessResponse.ok) {
    throw new Error(
      `Operations request failed with ${operationsResponse.status}/${accessResponse.status}`,
    );
  }
  const [operations, access] = await Promise.all([
    operationsResponse.json() as Promise<OperationsPayload>,
    accessResponse.json() as Promise<WorkspaceAccessOverview>,
  ]);
  return { operations, access };
}

const SOURCES: OperationalSource[] = [
  "model",
  "deployment",
  "recovery",
  "worker",
  "evidence",
  "policy",
];

function csvCell(value: unknown): string {
  let text =
    value === undefined || value === null
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  if (/^[=+\-@]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadCsv(samples: SloSample[]): void {
  const columns = [
    "id",
    "source",
    "metric",
    "value",
    "unit",
    "status",
    "observedAt",
    "dimensions",
    "evidenceId",
  ] as const;
  const rows = [
    columns.map(csvCell).join(","),
    ...samples.map((sample) =>
      columns
        .map((column) => csvCell(sample[column]))
        .join(","),
    ),
  ];
  const url = URL.createObjectURL(
    new Blob([`${rows.join("\n")}\n`], {
      type: "text/csv;charset=utf-8",
    }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "nexus-operations-slo.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

function tone(status: string): string {
  if (
    status === "healthy" ||
    status === "resolved" ||
    status === "delivered" ||
    status === "current" ||
    status === "completed" ||
    status === "closed"
  ) {
    return "border-cyber-green/40 bg-cyber-green/10 text-cyber-green";
  }
  if (
    status === "critical" ||
    status === "breaching" ||
    status === "dead-letter" ||
    status === "expired-review-required" ||
    status === "revoked-review-required"
  ) {
    return "border-cyber-red/40 bg-cyber-red/10 text-cyber-red";
  }
  return "border-cyber-yellow/40 bg-cyber-yellow/10 text-cyber-yellow";
}

export default function OperationsCenter() {
  const { t, language } = useTranslation();
  const [operations, setOperations] =
    useState<OperationsPayload | null>(null);
  const [access, setAccess] =
    useState<WorkspaceAccessOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");
  const [source, setSource] = useState<OperationalSource>("deployment");
  const [metric, setMetric] = useState("all");
  const [environment, setEnvironment] = useState("all");
  const [policyVersion, setPolicyVersion] = useState("");
  const [windowHours, setWindowHours] = useState("720");

  const date = useCallback(
    (value: string) =>
      new Intl.DateTimeFormat(
        language === "zh" ? "zh-CN" : "en-US",
        {
          dateStyle: "medium",
          timeStyle: "short",
        },
      ).format(new Date(value)),
    [language],
  );

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await loadOperationsData();
      setOperations(result.operations);
      setAccess(result.access);
      setStatusMessage(t("operationsDataRefreshed"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }, [t]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    loadOperationsData(controller.signal)
      .then((result) => {
        if (active) {
          setOperations(result.operations);
          setAccess(result.access);
          setStatusMessage(t("operationsDataRefreshed"));
        }
      })
      .catch((cause: unknown) => {
        if (
          active &&
          !(cause instanceof DOMException && cause.name === "AbortError")
        ) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      })
      .finally(() => {
        if (active) {
          setBusy(false);
        }
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [t]);

  const act = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      }
      setStatusMessage(t("operationsActionCompleted"));
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    }
  };

  const environments = useMemo(
    () => [
      ...new Set(
        (operations?.samples ?? [])
          .map((sample) => sample.dimensions.environment)
          .filter((value): value is string => Boolean(value)),
      ),
    ].sort(),
    [operations],
  );
  const metrics = useMemo(
    () => [
      ...new Set(
        (operations?.samples ?? [])
          .filter((sample) => sample.source === source)
          .map((sample) => sample.metric),
      ),
    ].sort(),
    [operations, source],
  );
  const filteredSamples = useMemo(() => {
    const referenceTime = operations
      ? Date.parse(operations.generatedAt)
      : 0;
    const cutoff =
      windowHours === "all"
        ? Number.NEGATIVE_INFINITY
        : referenceTime - Number(windowHours) * 60 * 60 * 1_000;
    return (operations?.samples ?? [])
      .filter(
        (sample) =>
          sample.source === source &&
          (metric === "all" || sample.metric === metric) &&
          (
            environment === "all" ||
            sample.dimensions.environment === environment
          ) &&
          (
            !policyVersion ||
            sample.dimensions.policyVersion
              ?.toLowerCase()
              .includes(policyVersion.toLowerCase()) ||
            sample.dimensions.version
              ?.toLowerCase()
              .includes(policyVersion.toLowerCase()) ||
            sample.dimensions.artifact
              ?.toLowerCase()
              .includes(policyVersion.toLowerCase())
          ) &&
          Date.parse(sample.observedAt) >= cutoff,
      )
      .sort((left, right) =>
        left.observedAt.localeCompare(right.observedAt),
      );
  }, [
    environment,
    metric,
    operations,
    policyVersion,
    source,
    windowHours,
  ]);
  const chartMetrics = useMemo(
    () => [
      ...new Set(filteredSamples.map((sample) => sample.metric)),
    ].slice(0, 4),
    [filteredSamples],
  );
  const chartData = useMemo(() => {
    const points = new Map<string, Record<string, number | string>>();
    for (const sample of filteredSamples.slice(-240)) {
      const key = sample.observedAt;
      const point = points.get(key) ?? {
        observedAt: key,
        label: new Intl.DateTimeFormat(
          language === "zh" ? "zh-CN" : "en-US",
          { month: "short", day: "numeric", hour: "2-digit" },
        ).format(new Date(key)),
      };
      point[sample.metric] = sample.value;
      points.set(key, point);
    }
    return [...points.values()];
  }, [filteredSamples, language]);
  const latestEvidence = useMemo(() => {
    const latest = new Map<string, SloSample>();
    for (const sample of operations?.samples ?? []) {
      if (sample.source !== "evidence") {
        continue;
      }
      const key = sample.dimensions.kind ?? sample.metric;
      const current = latest.get(key);
      if (!current || current.observedAt < sample.observedAt) {
        latest.set(key, sample);
      }
    }
    return [...latest.entries()];
  }, [operations]);
  const drills = useMemo(
    () =>
      (operations?.samples ?? []).filter(
        (sample) =>
          sample.dimensions.drillId &&
          (sample.source === "recovery" ||
            sample.source === "deployment"),
      ),
    [operations],
  );

  const cards = operations
    ? [
        {
          label: t("openIncidents"),
          value: operations.summary.openIncidents,
          icon: AlertTriangle,
          style:
            operations.summary.openIncidents > 0
              ? "text-cyber-red"
              : "text-cyber-green",
        },
        {
          label: t("criticalIncidents"),
          value: operations.summary.criticalIncidents,
          icon: ShieldAlert,
          style:
            operations.summary.criticalIncidents > 0
              ? "text-cyber-red"
              : "text-cyber-green",
        },
        {
          label: t("pendingDeliveries"),
          value: operations.summary.pendingDeliveries,
          icon: BellRing,
          style: "text-cyber-blue",
        },
        {
          label: t("deadLetters"),
          value: operations.summary.deadLetters,
          icon: TimerReset,
          style:
            operations.summary.deadLetters > 0
              ? "text-cyber-red"
              : "text-cyber-green",
        },
      ]
    : [];

  return (
    <div className="space-y-6 p-4 sm:p-6" data-testid="operations-center">
      <motion.header
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-start gap-3"
      >
        <div className="rounded-lg border border-cyber-blue/30 bg-cyber-blue/10 p-2">
          <Activity className="h-6 w-6 text-cyber-blue" />
        </div>
        <div>
          <h1 className="font-orbitron text-2xl font-bold text-cyber-blue sm:text-3xl">
            {t("operationsCenter")}
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-cyber-text-dim">
            {t("operationsCenterDesc")}
          </p>
          {access && (
            <p className="mt-2 text-xs text-cyber-text-dim">
              {access.organization.name} · {access.workspace.workspaceId}
            </p>
          )}
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={busy}
            className="flex items-center gap-2 rounded-lg border border-cyber-blue/40 px-3 py-2 text-sm text-cyber-text disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${busy ? "animate-spin" : ""}`}
            />
            {t("refresh")}
          </button>
          <a
            href="/api/operations"
            className="flex items-center gap-2 rounded-lg border border-cyber-green/40 px-3 py-2 text-sm text-cyber-text"
          >
            <Download className="h-4 w-4" />
            JSON
          </a>
          <button
            type="button"
            onClick={() => downloadCsv(filteredSamples)}
            className="flex items-center gap-2 rounded-lg border border-cyber-green/40 px-3 py-2 text-sm text-cyber-text"
          >
            <Download className="h-4 w-4" />
            CSV
          </button>
        </div>
      </motion.header>

      <p className="sr-only" aria-live="polite" role="status">
        {statusMessage}
      </p>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-cyber-red/40 bg-cyber-red/10 p-4 text-sm text-cyber-red"
        >
          {error}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <article
              key={card.label}
              className="rounded-xl border border-cyber-blue/20 bg-cyber-dark/60 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-cyber-text-dim">
                  {card.label}
                </span>
                <Icon className={`h-4 w-4 ${card.style}`} />
              </div>
              <p className={`mt-2 text-3xl font-bold ${card.style}`}>
                {card.value}
              </p>
            </article>
          );
        })}
      </div>

      <section className="rounded-xl border border-cyber-blue/20 bg-cyber-dark/60 p-4 sm:p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[150px] flex-1">
            <label
              htmlFor="operations-source"
              className="mb-1 block text-xs text-cyber-text-dim"
            >
              {t("telemetrySource")}
            </label>
            <select
              id="operations-source"
              value={source}
              onChange={(event) => {
                setSource(event.target.value as OperationalSource);
                setMetric("all");
              }}
              className="w-full rounded-lg border border-cyber-blue/30 bg-cyber-black/50 px-3 py-2 text-sm text-cyber-text"
            >
              {SOURCES.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[160px] flex-1">
            <label
              htmlFor="operations-metric"
              className="mb-1 block text-xs text-cyber-text-dim"
            >
              {t("metric")}
            </label>
            <select
              id="operations-metric"
              value={metric}
              onChange={(event) => setMetric(event.target.value)}
              className="w-full rounded-lg border border-cyber-blue/30 bg-cyber-black/50 px-3 py-2 text-sm text-cyber-text"
            >
              <option value="all">{t("all")}</option>
              {metrics.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[150px] flex-1">
            <label
              htmlFor="operations-environment"
              className="mb-1 block text-xs text-cyber-text-dim"
            >
              {t("environment")}
            </label>
            <select
              id="operations-environment"
              value={environment}
              onChange={(event) => setEnvironment(event.target.value)}
              className="w-full rounded-lg border border-cyber-blue/30 bg-cyber-black/50 px-3 py-2 text-sm text-cyber-text"
            >
              <option value="all">{t("all")}</option>
              {environments.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[150px] flex-1">
            <label
              htmlFor="operations-window"
              className="mb-1 block text-xs text-cyber-text-dim"
            >
              {t("timeWindow")}
            </label>
            <select
              id="operations-window"
              value={windowHours}
              onChange={(event) => setWindowHours(event.target.value)}
              className="w-full rounded-lg border border-cyber-blue/30 bg-cyber-black/50 px-3 py-2 text-sm text-cyber-text"
            >
              <option value="24">{t("last24Hours")}</option>
              <option value="168">{t("last7Days")}</option>
              <option value="720">{t("last30Days")}</option>
              <option value="all">{t("allTime")}</option>
            </select>
          </div>
          <div className="min-w-[180px] flex-1">
            <label
              htmlFor="operations-version"
              className="mb-1 block text-xs text-cyber-text-dim"
            >
              {t("versionOrArtifact")}
            </label>
            <input
              id="operations-version"
              value={policyVersion}
              onChange={(event) => setPolicyVersion(event.target.value)}
              placeholder={t("filterVersion")}
              className="w-full rounded-lg border border-cyber-blue/30 bg-cyber-black/50 px-3 py-2 text-sm text-cyber-text"
            />
          </div>
        </div>

        <div
          className="mt-5 h-72 min-w-0"
          role="img"
          aria-label={t("sloTrend")}
        >
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 8, right: 12, left: 0, bottom: 8 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(0,240,255,0.12)"
                />
                <XAxis
                  dataKey="label"
                  stroke="#7f8da8"
                  fontSize={11}
                  minTickGap={36}
                />
                <YAxis stroke="#7f8da8" fontSize={11} width={48} />
                <Tooltip
                  contentStyle={{
                    background: "#08111f",
                    border: "1px solid rgba(0,240,255,.3)",
                  }}
                />
                {chartMetrics.map((entry, index) => (
                  <Line
                    key={entry}
                    type="monotone"
                    dataKey={entry}
                    stroke={
                      ["#00f0ff", "#7d5cff", "#2cf5a0", "#ffbd2e"][
                        index
                      ]
                    }
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-cyber-text-dim">
              {t("noTelemetryForFilter")}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-cyber-red/20 bg-cyber-dark/60 p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-cyber-red" />
          <h2 className="font-orbitron text-lg text-cyber-text">
            {t("incidentQueue")}
          </h2>
        </div>
        <div className="space-y-3">
          {operations?.incidents.length ? (
            operations.incidents.map((incident) => (
              <article
                key={incident.id}
                className="rounded-lg border border-cyber-gray/40 bg-cyber-black/20 p-4"
                data-testid="operations-incident"
              >
                <div className="flex flex-wrap items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="text-xs text-cyber-blue">
                        {incident.code}
                      </code>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs ${tone(incident.severity)}`}
                      >
                        {incident.severity}
                      </span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs ${tone(incident.status)}`}
                      >
                        {incident.status}
                      </span>
                    </div>
                    <h3 className="mt-2 font-semibold text-cyber-text">
                      {incident.summary}
                    </h3>
                    <p className="mt-1 break-all text-xs text-cyber-text-dim">
                      {incident.id} · {date(incident.lastObservedAt)} ·{" "}
                      {t("occurrences")}: {incident.occurrenceCount}
                    </p>
                  </div>
                  {incident.status === "open" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void act({
                          action: "acknowledge-incident",
                          incidentId: incident.id,
                        })
                      }
                      className="rounded-lg border border-cyber-yellow/40 px-3 py-2 text-xs text-cyber-yellow disabled:opacity-50"
                    >
                      {t("acknowledge")}
                    </button>
                  )}
                  {incident.status !== "resolved" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void act({
                          action: "resolve-incident",
                          incidentId: incident.id,
                          resolution:
                            "Resolved from the Operations Center",
                        })
                      }
                      className="rounded-lg border border-cyber-green/40 px-3 py-2 text-xs text-cyber-green disabled:opacity-50"
                    >
                      {t("resolve")}
                    </button>
                  )}
                </div>
              </article>
            ))
          ) : (
            <p className="text-sm text-cyber-text-dim">
              {t("noOperationalIncidents")}
            </p>
          )}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-xl border border-cyber-yellow/20 bg-cyber-dark/60 p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-cyber-yellow" />
            <h2 className="font-orbitron text-lg text-cyber-text">
              {t("evidenceFreshness")}
            </h2>
          </div>
          <div className="space-y-2">
            {latestEvidence.length > 0 ? (
              latestEvidence.map(([kind, sample]) => (
                <div
                  key={kind}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-cyber-gray/30 p-3"
                >
                  <span className="min-w-0 flex-1 text-sm text-cyber-text">
                    {kind}
                  </span>
                  <span className="text-xs text-cyber-text-dim">
                    {sample.value.toFixed(1)}%
                  </span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs ${tone(sample.status)}`}
                  >
                    {sample.status}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-cyber-text-dim">
                {t("noEvidenceSamples")}
              </p>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-cyber-purple/20 bg-cyber-dark/60 p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-cyber-purple" />
            <h2 className="font-orbitron text-lg text-cyber-text">
              {t("accessGovernance")}
            </h2>
          </div>
          {access ? (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-cyber-gray/30 p-3">
                  <p className="text-xs text-cyber-text-dim">
                    {t("openAccessReviews")}
                  </p>
                  <p className="mt-1 text-xl font-bold text-cyber-text">
                    {
                      access.accessReviewCampaigns.filter(
                        (campaign) => campaign.status === "open",
                      ).length
                    }
                  </p>
                </div>
                <div className="rounded-lg border border-cyber-gray/30 p-3">
                  <p className="text-xs text-cyber-text-dim">
                    {t("breakGlassReview")}
                  </p>
                  <p className="mt-1 text-xl font-bold text-cyber-text">
                    {
                      access.riskReport.breakGlassReviewRequiredIds
                        .length
                    }
                  </p>
                </div>
              </div>
              {[
                [
                  t("orphanedAccounts"),
                  access.riskReport.orphanedServiceAccountIds,
                ],
                [
                  t("expiredAccounts"),
                  access.riskReport.expiredServiceAccountIds,
                ],
                [
                  t("overdueReviews"),
                  access.riskReport.overdueAccessReviewItemIds,
                ],
              ].map(([label, ids]) => (
                <div
                  key={String(label)}
                  className="rounded-lg border border-cyber-gray/30 p-3"
                >
                  <span className="text-cyber-text">{String(label)}</span>
                  <span className="float-right text-cyber-yellow">
                    {(ids as string[]).length}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-cyber-text-dim">
              {t("collectingData")}
            </p>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-cyber-blue/20 bg-cyber-dark/60 p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2">
          <Wrench className="h-5 w-5 text-cyber-blue" />
          <h2 className="font-orbitron text-lg text-cyber-text">
            {t("drillHistory")}
          </h2>
        </div>
        <div className="overflow-x-auto" tabIndex={0}>
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead>
              <tr className="border-b border-cyber-gray/40 text-xs uppercase text-cyber-text-dim">
                <th className="p-3">{t("drill")}</th>
                <th className="p-3">{t("metric")}</th>
                <th className="p-3">{t("value")}</th>
                <th className="p-3">{t("status")}</th>
                <th className="p-3">{t("observedAt")}</th>
              </tr>
            </thead>
            <tbody>
              {drills.map((sample) => (
                <tr key={sample.id} className="border-b border-cyber-gray/20">
                  <td className="p-3 font-mono text-xs text-cyber-blue">
                    {sample.dimensions.drillId}
                  </td>
                  <td className="p-3 text-cyber-text">{sample.metric}</td>
                  <td className="p-3 text-cyber-text">
                    {sample.value} {sample.unit}
                  </td>
                  <td className="p-3">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs ${tone(sample.status)}`}
                    >
                      {sample.status}
                    </span>
                  </td>
                  <td className="p-3 text-cyber-text-dim">
                    {date(sample.observedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {drills.length === 0 && (
            <p className="p-4 text-sm text-cyber-text-dim">
              {t("noDrillEvidence")}
            </p>
          )}
        </div>
      </section>

      <details className="rounded-xl border border-cyber-blue/20 bg-cyber-dark/60 p-4 sm:p-5">
        <summary className="cursor-pointer font-orbitron text-lg text-cyber-text">
          {t("rawOperationalEvidence")}
        </summary>
        <p className="mt-2 text-sm text-cyber-text-dim">
          {t("rawOperationalEvidenceDesc")}
        </p>
        <div className="mt-4 space-y-2">
          {filteredSamples
            .slice(-20)
            .reverse()
            .map((sample) => (
              <div
                key={sample.id}
                className="rounded-lg border border-cyber-gray/30 p-3 text-xs"
              >
                <div className="flex flex-wrap gap-2">
                  <code className="break-all text-cyber-blue">
                    {sample.id}
                  </code>
                  <span className="text-cyber-text">
                    {sample.metric}={sample.value} {sample.unit}
                  </span>
                  <span className="ml-auto text-cyber-text-dim">
                    {date(sample.observedAt)}
                  </span>
                </div>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all text-cyber-text-dim">
                  {JSON.stringify(sample.dimensions, null, 2)}
                </pre>
              </div>
            ))}
        </div>
      </details>
    </div>
  );
}
