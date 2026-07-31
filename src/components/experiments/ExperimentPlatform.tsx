"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  Database,
  Download,
  GitFork,
  Pause,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  StepForward,
} from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import type {
  ExperimentEventRecord,
  ExperimentOverview,
  ExperimentRole,
  ExperimentRun,
  ExperimentRunAction,
} from "@/experiments/types";

async function readResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? `Request failed with ${response.status}`);
  }
  return payload;
}

async function fetchOverview(): Promise<ExperimentOverview> {
  return readResponse<ExperimentOverview>(
    await fetch("/api/experiments", { cache: "no-store" }),
  );
}

export default function ExperimentPlatform() {
  const { t } = useTranslation();
  const [overview, setOverview] = useState<ExperimentOverview | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [events, setEvents] = useState<ExperimentEventRecord[]>([]);
  const [streamStatus, setStreamStatus] = useState<
    "idle" | "connected" | "reconnecting"
  >("idle");
  const [name, setName] = useState("Neo Angeles experiment");
  const [seed, setSeed] = useState("neo-angeles-experiment");
  const [role, setRole] = useState<ExperimentRole>("operator");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedRun = useMemo(
    () =>
      overview?.runs.find((run) => run.id === selectedRunId) ??
      overview?.runs[0] ??
      null,
    [overview, selectedRunId],
  );

  const requestHeaders = useMemo(
    () => ({
      "Content-Type": "application/json",
      "x-nexus-actor": "browser-operator",
      "x-nexus-role": role,
    }),
    [role],
  );

  const refresh = useCallback(async () => {
    const next = await fetchOverview();
    setOverview(next);
    setSelectedRunId((current) => current ?? next.runs[0]?.id ?? null);
    return next;
  }, []);

  useEffect(() => {
    fetchOverview()
      .then((next) => {
        setOverview(next);
        setSelectedRunId((current) => current ?? next.runs[0]?.id ?? null);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      });
  }, []);

  useEffect(() => {
    const runId = selectedRun?.id;
    if (!runId) {
      return;
    }

    let latestCursor = 0;
    let disposed = false;
    fetch(`/api/experiments/runs/${runId}/events?after=0`, {
      cache: "no-store",
    })
      .then(readResponse<{
        events: ExperimentEventRecord[];
        nextCursor: number;
      }>)
      .then((payload) => {
        if (!disposed) {
          setEvents(payload.events.slice(-50));
          latestCursor = payload.nextCursor;
        }
      })
      .catch(() => {
        if (!disposed) {
          setStreamStatus("reconnecting");
        }
      });

    const stream = new EventSource(
      `/api/experiments/runs/${runId}/stream?after=${latestCursor}`,
    );
    stream.onopen = () => setStreamStatus("connected");
    stream.onerror = () => setStreamStatus("reconnecting");
    stream.addEventListener("simulation", (message) => {
      const record = JSON.parse(
        (message as MessageEvent<string>).data,
      ) as ExperimentEventRecord;
      latestCursor = Math.max(latestCursor, record.cursor);
      setEvents((current) => {
        if (current.some((event) => event.cursor === record.cursor)) {
          return current;
        }
        return [...current, record].slice(-50);
      });
    });

    return () => {
      disposed = true;
      stream.close();
    };
  }, [selectedRun?.id]);

  const createRun = async () => {
    setBusy(true);
    setError(null);
    try {
      const run = await readResponse<ExperimentRun>(
        await fetch("/api/experiments", {
          method: "POST",
          headers: requestHeaders,
          body: JSON.stringify({ name, seed }),
        }),
      );
      await refresh();
      setEvents([]);
      setSelectedRunId(run.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const mutate = async (action: ExperimentRunAction) => {
    if (!selectedRun) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const run = await readResponse<ExperimentRun>(
        await fetch(`/api/experiments/runs/${selectedRun.id}/actions`, {
          method: "POST",
          headers: requestHeaders,
          body: JSON.stringify({
            action: action.type,
            expectedVersion: selectedRun.version,
            ...(action.type === "fork"
              ? {
                  tick: action.tick,
                  name: action.name,
                }
              : {}),
          }),
        }),
      );
      await refresh();
      setEvents([]);
      setSelectedRunId(run.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-cyber-purple/30 bg-cyber-purple/10 p-2">
            <Database className="h-6 w-6 text-cyber-purple" />
          </div>
          <div>
            <h1 className="font-orbitron text-3xl font-bold text-cyber-purple">
              {t("experimentPlatform")}
            </h1>
            <p className="mt-1 text-cyber-text-dim">
              {t("experimentPlatformDesc")}
            </p>
          </div>
        </div>
      </motion.div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-cyber-blue/20 bg-cyber-dark/50 p-4">
          <p className="text-xs uppercase tracking-wide text-cyber-text-dim">
            {t("storageBackend")}
          </p>
          <p
            data-testid="experiment-backend"
            className="mt-2 text-xl font-bold uppercase text-cyber-blue"
          >
            {overview?.backend ?? "—"}
          </p>
        </div>
        <div className="rounded-xl border border-cyber-blue/20 bg-cyber-dark/50 p-4">
          <p className="text-xs uppercase tracking-wide text-cyber-text-dim">
            {t("workspace")}
          </p>
          <p className="mt-2 truncate text-sm font-semibold text-cyber-text">
            {overview?.workspace.name ?? "—"}
          </p>
        </div>
        <div className="rounded-xl border border-cyber-blue/20 bg-cyber-dark/50 p-4">
          <p className="text-xs uppercase tracking-wide text-cyber-text-dim">
            {t("experimentSession")}
          </p>
          <p className="mt-2 truncate text-sm font-semibold text-cyber-text">
            {overview?.session.name ?? "—"}
          </p>
        </div>
        <div className="rounded-xl border border-cyber-blue/20 bg-cyber-dark/50 p-4">
          <p className="text-xs uppercase tracking-wide text-cyber-text-dim">
            {t("eventStream")}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Activity
              className={`h-4 w-4 ${
                streamStatus === "connected"
                  ? "text-cyber-green"
                  : "text-cyber-yellow"
              }`}
            />
            <span className="text-sm font-semibold text-cyber-text">
              {t(
                streamStatus === "connected"
                  ? "streamConnected"
                  : streamStatus === "reconnecting"
                    ? "streamReconnecting"
                    : "streamIdle",
              )}
            </span>
          </div>
        </div>
      </div>

      <section className="rounded-xl border border-cyber-blue/20 bg-cyber-dark/50 p-4 sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto_auto] lg:items-end">
          <label className="space-y-2 text-sm text-cyber-text-dim">
            <span>{t("runName")}</span>
            <input
              aria-label={t("runName")}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-lg border border-cyber-blue/30 bg-cyber-black px-3 py-2 text-cyber-text"
            />
          </label>
          <label className="space-y-2 text-sm text-cyber-text-dim">
            <span>{t("runSeed")}</span>
            <input
              aria-label={t("runSeed")}
              value={seed}
              onChange={(event) => setSeed(event.target.value)}
              className="w-full rounded-lg border border-cyber-blue/30 bg-cyber-black px-3 py-2 font-mono text-cyber-text"
            />
          </label>
          <label className="space-y-2 text-sm text-cyber-text-dim">
            <span>{t("workspaceRole")}</span>
            <select
              aria-label={t("workspaceRole")}
              value={role}
              onChange={(event) => setRole(event.target.value as ExperimentRole)}
              className="w-full rounded-lg border border-cyber-blue/30 bg-cyber-black px-3 py-2 text-cyber-text"
            >
              <option value="viewer">{t("roleViewer")}</option>
              <option value="operator">{t("roleOperator")}</option>
              <option value="admin">{t("roleAdmin")}</option>
            </select>
          </label>
          <button
            type="button"
            onClick={createRun}
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-lg bg-cyber-purple px-4 py-2 font-semibold text-cyber-black disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {t("createRun")}
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-3 text-sm text-cyber-red">
            {error}
          </p>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <section className="rounded-xl border border-cyber-blue/20 bg-cyber-dark/50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-orbitron text-lg text-cyber-text">
              {t("serverRuns")}
            </h2>
            <button
              type="button"
              aria-label={t("refreshRuns")}
              onClick={() => refresh()}
              className="rounded-lg p-2 text-cyber-blue hover:bg-cyber-blue/10"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-2">
            {overview?.runs.map((run) => (
              <button
                key={run.id}
                type="button"
                onClick={() => {
                  setEvents([]);
                  setSelectedRunId(run.id);
                }}
                className={`w-full rounded-lg border p-3 text-left ${
                  selectedRun?.id === run.id
                    ? "border-cyber-blue/60 bg-cyber-blue/10"
                    : "border-cyber-gray/40 bg-cyber-black/20"
                }`}
              >
                <span className="block truncate font-semibold text-cyber-text">
                  {run.name}
                </span>
                <span className="mt-1 block font-mono text-xs text-cyber-text-dim">
                  tick {run.run.world.tick} · v{run.version} · {run.status}
                </span>
              </button>
            ))}
            {overview && overview.runs.length === 0 && (
              <p className="py-6 text-center text-sm text-cyber-text-dim">
                {t("noServerRuns")}
              </p>
            )}
          </div>
        </section>

        <section
          data-testid="server-run"
          className="rounded-xl border border-cyber-blue/20 bg-cyber-dark/50 p-4 sm:p-5"
        >
          {selectedRun ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start gap-3">
                <div>
                  <h2 className="font-orbitron text-xl text-cyber-text">
                    {selectedRun.name}
                  </h2>
                  <p className="mt-1 break-all font-mono text-xs text-cyber-text-dim">
                    {selectedRun.id}
                  </p>
                </div>
                <span className="ml-auto rounded-full border border-cyber-green/30 bg-cyber-green/10 px-3 py-1 text-xs uppercase text-cyber-green">
                  {selectedRun.status}
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-cyber-black/30 p-3">
                  <p className="text-xs text-cyber-text-dim">{t("tick")}</p>
                  <p
                    data-testid="server-run-tick"
                    className="mt-1 text-xl font-bold text-cyber-blue"
                  >
                    {selectedRun.run.world.tick}
                  </p>
                </div>
                <div className="rounded-lg bg-cyber-black/30 p-3">
                  <p className="text-xs text-cyber-text-dim">
                    {t("runVersion")}
                  </p>
                  <p className="mt-1 text-xl font-bold text-cyber-blue">
                    {selectedRun.version}
                  </p>
                </div>
                <div className="rounded-lg bg-cyber-black/30 p-3">
                  <p className="text-xs text-cyber-text-dim">
                    {t("persistedEvents")}
                  </p>
                  <p className="mt-1 text-xl font-bold text-cyber-blue">
                    {events.length}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => mutate({ type: "step" })}
                  disabled={busy || role === "viewer"}
                  aria-label={t("serverStep")}
                  className="flex items-center gap-2 rounded-lg bg-cyber-blue px-3 py-2 text-sm font-semibold text-cyber-black disabled:opacity-40"
                >
                  <StepForward className="h-4 w-4" />
                  {t("serverStep")}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    mutate({
                      type:
                        selectedRun.status === "running" ? "pause" : "resume",
                    })
                  }
                  disabled={busy || role === "viewer"}
                  className="flex items-center gap-2 rounded-lg border border-cyber-blue/40 px-3 py-2 text-sm text-cyber-text disabled:opacity-40"
                >
                  {selectedRun.status === "running" ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  {selectedRun.status === "running"
                    ? t("pause")
                    : t("resume")}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    mutate({
                      type: "fork",
                      tick: selectedRun.run.world.tick,
                    })
                  }
                  disabled={busy || role === "viewer"}
                  className="flex items-center gap-2 rounded-lg border border-cyber-purple/40 px-3 py-2 text-sm text-cyber-text disabled:opacity-40"
                >
                  <GitFork className="h-4 w-4" />
                  {t("forkRun")}
                </button>
                <a
                  href={`/api/experiments/runs/${selectedRun.id}/report?download=1`}
                  className="flex items-center gap-2 rounded-lg border border-cyber-green/40 px-3 py-2 text-sm text-cyber-text"
                >
                  <Download className="h-4 w-4" />
                  {t("exportReport")}
                </a>
              </div>

              {selectedRun.parentRunId && (
                <div className="flex items-center gap-2 rounded-lg border border-cyber-purple/30 bg-cyber-purple/5 p-3 text-sm text-cyber-text-dim">
                  <GitFork className="h-4 w-4 text-cyber-purple" />
                  {t("forkedFrom")} {selectedRun.parentRunId} @ tick{" "}
                  {selectedRun.forkedFromTick}
                </div>
              )}

              <div>
                <div className="mb-3 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-cyber-green" />
                  <h3 className="font-semibold text-cyber-text">
                    {t("persistedEventLog")}
                  </h3>
                </div>
                <div className="max-h-72 space-y-2 overflow-y-auto">
                  {events
                    .slice()
                    .reverse()
                    .map((record) => (
                      <div
                        key={record.cursor}
                        className="grid grid-cols-[auto_1fr_auto] gap-3 rounded-lg border border-cyber-gray/30 bg-cyber-black/20 p-3 text-xs"
                      >
                        <span className="font-mono text-cyber-blue">
                          #{record.cursor}
                        </span>
                        <span className="truncate text-cyber-text">
                          {record.event.type}
                        </span>
                        <span className="font-mono text-cyber-text-dim">
                          tick {record.tick}
                        </span>
                      </div>
                    ))}
                  {events.length === 0 && (
                    <p className="py-6 text-center text-sm text-cyber-text-dim">
                      {t("noPersistedEvents")}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-h-72 items-center justify-center text-cyber-text-dim">
              {t("selectOrCreateRun")}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
