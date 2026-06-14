"use client";

import { useNexusStore } from "@/stores/nexus-store";
import { useTranslation } from "@/hooks/useTranslation";
import { motion } from "framer-motion";
import { useEffect } from "react";
import { Users, Zap, Car, Shield, Cloud, Droplets, Wifi, Heart, TrendingUp } from "lucide-react";
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
  const { cityStats, districts, cityStatsHistory, addNotification } = useNexusStore();
  const { t } = useTranslation();

  useEffect(() => {
    const interval = setInterval(() => {
      addNotification({ type: "info", title: t("systemUpdate"), message: t("cityMetricsRefreshed"), source: "NEXUS" });
    }, 20000);
    return () => clearInterval(interval);
  }, [addNotification, t]);

  return (
    <div className="p-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-orbitron font-bold text-cyber-blue cyber-text-glow">{t("cityOverview")}</h1>
        <p className="text-cyber-text-dim mt-1">{t("realTimeMonitoring")}</p>
      </motion.div>

      <div className="grid grid-cols-4 gap-4">
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
        <div className="h-64">
          {cityStatsHistory.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
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
              Collecting data... ({cityStatsHistory.length}/2 snapshots)
            </div>
          )}
        </div>
      </motion.div>

      <div className="grid grid-cols-2 gap-6">
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
          <div className="grid grid-cols-2 gap-4">
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
