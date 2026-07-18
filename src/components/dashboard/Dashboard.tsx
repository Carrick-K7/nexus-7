"use client";

import { useNexusStore } from "@/stores/nexus-store";
import { useTranslation } from "@/hooks/useTranslation";
import { motion } from "framer-motion";
import { useState, type ChangeEvent } from "react";
import { Users, Zap, Car, Shield, Cloud, Droplets, Wifi, Heart, TrendingUp, Pause, Play, StepForward, RotateCcw, ScanSearch, CheckCircle2, XCircle, Download, Upload } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { TranslationKey } from "@/i18n/translations";

const cardData = [
  { key: "population", icon: Users, format: (v: number) => `${(v / 1000000).toFixed(2)}M` },
  { key: "energy", icon: Zap, format: (v: number) => `${v}%` },
  { key: "traffic", icon: Car, format: (v: number) => `${v}%` },
  { key: "crime", icon: Shield, format: (v: number) => v.toString() },
  { key: "pollution", icon: Cloud, format: (v: number) => `${v}%` },
  { key: "medical", icon: Heart, format: (v: number) => `${v}%` },
  { key: "internet", icon: Wifi, format: (v: number) => `${v}%` },
  { key: "water", icon: Droplets, format: (v: number) => `${v}%` },
];

const cardLabels: Record<string, TranslationKey> = {
  population: "population",
  energy: "energyGrid",
  traffic: "trafficFlow",
  crime: "crimeIndex",
  pollution: "pollution",
  medical: "medicalReady",
  internet: "network",
  water: "waterSupply",
};

const systemHealthData = [
  { key: "sysNeuralNetwork" as TranslationKey, value: 94 },
  { key: "sysQuantumCore" as TranslationKey, value: 88 },
  { key: "sysDefenseGrid" as TranslationKey, value: 99 },
  { key: "sysCommsArray" as TranslationKey, value: 76 },
];

export default function Dashboard() {
  const {
    cityStats,
    districts,
    cityStatsHistory,
    simulation,
    pauseSimulation,
    resumeSimulation,
    stepSimulationOnce,
    resetSimulation,
    verifySimulationReplay,
    exportSimulationRun,
    importSimulationRun,
  } = useNexusStore();
  const { t } = useTranslation();
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const recentEvents = simulation.events
    .filter((event) => event.type !== "city.metrics.updated")
    .slice(-4)
    .reverse();

  const handleExport = () => {
    const serialized = exportSimulationRun();
    const url = URL.createObjectURL(
      new Blob([serialized], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `nexus-7-run-tick-${simulation.world.tick}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const [file] = Array.from(event.target.files ?? []);
    if (!file) {
      return;
    }

    const result = importSimulationRun(await file.text());
    setImportMessage(
      result.ok
        ? t("simulationImportSuccess")
        : `${t("simulationImportFailed")}: ${result.error}`,
    );
    event.target.value = "";
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-orbitron font-bold text-cyber-blue cyber-text-glow">{t("cityOverview")}</h1>
        <p className="text-cyber-text-dim mt-1">{t("realTimeMonitoring")}</p>
      </motion.div>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        aria-labelledby="simulation-control-heading"
        className="rounded-xl border border-cyber-blue/30 bg-cyber-dark/60 p-4 sm:p-5"
      >
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 id="simulation-control-heading" className="font-orbitron text-lg text-cyber-text">
                {t("simulationControl")}
              </h2>
              <span
                className={`rounded-full border px-2 py-1 text-xs font-medium ${
                  simulation.status === "running"
                    ? "border-cyber-green/40 bg-cyber-green/10 text-cyber-green"
                    : "border-cyber-yellow/40 bg-cyber-yellow/10 text-cyber-yellow"
                }`}
              >
                {simulation.status === "running" ? t("running") : t("paused")}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-cyber-text-dim">
              <span data-testid="simulation-tick">{t("tick")} {simulation.world.tick}</span>
              <span>{t("seed")}: <code className="text-cyber-blue">{simulation.seed}</code></span>
              <span>{t("policy")}: <code className="text-cyber-blue">{simulation.policyVersion}</code></span>
              <span>{t("causalEvents")}: {simulation.events.length}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={simulation.status === "running" ? pauseSimulation : resumeSimulation}
              aria-label={simulation.status === "running" ? t("pauseSimulation") : t("resumeSimulation")}
              className="inline-flex items-center gap-2 rounded-lg border border-cyber-blue/40 bg-cyber-blue/10 px-3 py-2 text-sm text-cyber-blue hover:bg-cyber-blue/20"
            >
              {simulation.status === "running" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {simulation.status === "running" ? t("pause") : t("resume")}
            </button>
            <button
              type="button"
              onClick={stepSimulationOnce}
              disabled={simulation.status === "running"}
              aria-label={t("stepSimulation")}
              className="inline-flex items-center gap-2 rounded-lg border border-cyber-purple/40 bg-cyber-purple/10 px-3 py-2 text-sm text-cyber-purple hover:bg-cyber-purple/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <StepForward className="h-4 w-4" />
              {t("step")}
            </button>
            <button
              type="button"
              onClick={verifySimulationReplay}
              aria-label={t("verifyReplay")}
              className="inline-flex items-center gap-2 rounded-lg border border-cyber-green/40 bg-cyber-green/10 px-3 py-2 text-sm text-cyber-green hover:bg-cyber-green/20"
            >
              <ScanSearch className="h-4 w-4" />
              {t("verify")}
            </button>
            <button
              type="button"
              onClick={resetSimulation}
              aria-label={t("resetSimulation")}
              className="inline-flex items-center gap-2 rounded-lg border border-cyber-text-dim/40 bg-cyber-gray/30 px-3 py-2 text-sm text-cyber-text-dim hover:text-cyber-text"
            >
              <RotateCcw className="h-4 w-4" />
              {t("reset")}
            </button>
            <button
              type="button"
              onClick={handleExport}
              aria-label={t("exportSimulation")}
              className="inline-flex items-center gap-2 rounded-lg border border-cyber-blue/40 bg-cyber-blue/10 px-3 py-2 text-sm text-cyber-blue hover:bg-cyber-blue/20"
            >
              <Download className="h-4 w-4" />
              {t("exportRun")}
            </button>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-cyber-blue/40 bg-cyber-blue/10 px-3 py-2 text-sm text-cyber-blue hover:bg-cyber-blue/20">
              <Upload className="h-4 w-4" />
              {t("importRun")}
              <input
                type="file"
                accept="application/json,.json"
                onChange={handleImport}
                aria-label={t("importSimulation")}
                className="sr-only"
              />
            </label>
          </div>
        </div>

        {importMessage && (
          <p role="status" className="mt-3 text-sm text-cyber-text">
            {importMessage}
          </p>
        )}

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0 rounded-lg border border-cyber-gray/40 bg-cyber-black/30 p-3">
            <h3 className="text-xs font-medium uppercase tracking-wider text-cyber-text-dim">
              {t("recentCausalEvents")}
            </h3>
            {recentEvents.length === 0 ? (
              <p className="mt-2 text-sm text-cyber-text-dim">{t("noCausalEvents")}</p>
            ) : (
              <ol className="mt-2 space-y-2">
                {recentEvents.map((event) => (
                  <li key={event.id} className="flex min-w-0 items-start gap-2 text-xs">
                    <code className="shrink-0 text-cyber-blue">#{event.tick}</code>
                    <span className="truncate text-cyber-text">{event.type}</span>
                    <code className="ml-auto hidden shrink-0 text-cyber-text-dim sm:block">{event.correlationId}</code>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div
            data-testid="replay-status"
            className={`flex min-w-44 items-center gap-2 rounded-lg border p-3 text-sm ${
              simulation.replay.status === "verified"
                ? "border-cyber-green/40 bg-cyber-green/10 text-cyber-green"
                : simulation.replay.status === "mismatch"
                  ? "border-cyber-red/40 bg-cyber-red/10 text-cyber-red"
                  : "border-cyber-gray/40 bg-cyber-black/30 text-cyber-text-dim"
            }`}
          >
            {simulation.replay.status === "verified" ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : simulation.replay.status === "mismatch" ? (
              <XCircle className="h-4 w-4" />
            ) : (
              <ScanSearch className="h-4 w-4" />
            )}
            <span>
              {simulation.replay.status === "verified"
                ? t("replayVerified")
                : simulation.replay.status === "mismatch"
                  ? t("replayMismatch")
                  : t("replayNotChecked")}
            </span>
          </div>
        </div>
      </motion.section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cardData.map((item, i) => {
          const Icon = item.icon;
          const value = cityStats[item.key as keyof typeof cityStats];
          return (
            <motion.div key={item.key} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
              className="bg-cyber-dark/50 border border-cyber-blue/20 rounded-xl p-4 hover:border-cyber-blue/40 transition-all">
              <div className="flex items-start justify-between">
                <div className="p-2 rounded-lg bg-cyber-blue/10"><Icon className="w-5 h-5 text-cyber-blue" /></div>
                <TrendingUp className="w-4 h-4 text-cyber-green" />
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold text-cyber-text">{item.format(value)}</div>
                <div className="text-sm text-cyber-text-dim">{t(cardLabels[item.key])}</div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Real-time City Stats Trend Chart */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
        className="bg-cyber-dark/50 border border-cyber-blue/20 rounded-xl p-6">
        <h3 className="text-lg font-orbitron text-cyber-text mb-4">{t("liveCityMetrics")}</h3>
        <div className="h-64 min-w-0">
          {cityStatsHistory.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <LineChart data={cityStatsHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="tick" tick={false} />
                <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={10} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#e2e8f0' }}
                  labelFormatter={() => ''}
                />
                <Line type="monotone" dataKey={(d: { stats: typeof cityStats }) => d.stats.energy} name="Energy" stroke="#22d3ee" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey={(d: { stats: typeof cityStats }) => d.stats.crime} name="Crime" stroke="#f43f5e" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey={(d: { stats: typeof cityStats }) => d.stats.traffic} name="Traffic" stroke="#facc15" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey={(d: { stats: typeof cityStats }) => d.stats.pollution} name="Pollution" stroke="#a78bfa" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-cyber-text-dim text-sm">
              {t("collectingData")} ({cityStatsHistory.length}/2)
            </div>
          )}
        </div>
      </motion.div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
          className="bg-cyber-dark/50 border border-cyber-blue/20 rounded-xl p-6">
          <h3 className="text-lg font-orbitron text-cyber-text mb-4">{t("districtStatus")}</h3>
          <div className="space-y-3">
            {districts.map((district) => (
              <div key={district.id} className="flex items-center justify-between p-3 bg-cyber-gray/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${district.status === "normal" ? "bg-cyber-green" : district.status === "warning" ? "bg-cyber-orange" : "bg-cyber-red"}`} />
                  <span className="text-sm text-cyber-text">{district.name}</span>
                </div>
                <span className="text-xs text-cyber-blue">{district.development}%</span>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
          className="bg-cyber-dark/50 border border-cyber-blue/20 rounded-xl p-6">
          <h3 className="text-lg font-orbitron text-cyber-text mb-4">{t("systemHealth")}</h3>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {systemHealthData.map((sys) => (
              <div key={sys.key} className="p-4 bg-cyber-gray/30 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-cyber-text">{t(sys.key)}</span>
                  <span className="text-lg font-bold text-cyber-blue">{sys.value}%</span>
                </div>
                <div className="h-2 bg-cyber-dark rounded-full overflow-hidden">
                  <div className="h-full bg-cyber-blue" style={{ width: `${sys.value}%` }} />
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
