"use client";

import { motion } from "framer-motion";
import { useTranslation } from "@/hooks/useTranslation";
import { useMemo, useState } from "react";
import { Newspaper, Radio, AlertTriangle, TrendingUp, Clock } from "lucide-react";
import { useNexusStore } from "@/stores/nexus-store";
import type { DomainEvent } from "@/simulation";

interface NewsItem {
  id: string;
  title: string;
  category: "news" | "alert" | "update";
  tick: number;
  content: string;
  priority: "low" | "medium" | "high";
}

export default function NewsPanel() {
  const { t } = useTranslation();
  const simulation = useNexusStore((state) => state.simulation);
  const cityStats = useNexusStore((state) => state.cityStats);
  const [filter, setFilter] = useState<"all" | "news" | "alert" | "update">("all");
  const news = useMemo(() => {
    const toNewsItem = (event: DomainEvent): NewsItem | null => {
      if (event.type === "city.mechanism.applied") {
        return {
          id: event.id,
          title: t("domainMechanismApplied"),
          category: "alert",
          tick: event.tick,
          content: `${String(event.payload.mechanism)} · ${String(event.payload.causeMetric)} → ${String(event.payload.effectMetric)} Δ${String(event.payload.delta)}`,
          priority: "medium",
        };
      }
      if (event.type === "observation.threshold") {
        return {
          id: event.id,
          title: t("thresholdObservationNews"),
          category: "alert",
          tick: event.tick,
          content: `${String(event.payload.metric)} ${String(event.payload.value)} · ${String(event.payload.assignedAgent).toUpperCase()}`,
          priority:
            event.payload.riskTier === "high" ? "high" : "medium",
        };
      }
      if (event.type === "agent.action") {
        return {
          id: event.id,
          title: t("governedActionNews"),
          category: "update",
          tick: event.tick,
          content: `${String(event.payload.actorId).toUpperCase()} · ${String(event.payload.metric)} ${String(event.payload.before)} → ${String(event.payload.after)}`,
          priority: "low",
        };
      }
      if (
        event.type === "city.day.started" ||
        (
          event.type === "system.signal" &&
          event.payload.category === "ambient"
        )
      ) {
        return {
          id: event.id,
          title: t("worldEventNews"),
          category: "news",
          tick: event.tick,
          content: String(
            event.payload.message ??
              `${t("simulationDay")} ${String(event.payload.day)}`,
          ),
          priority: "low",
        };
      }
      return null;
    };
    const domainNews = simulation.events
      .slice()
      .reverse()
      .map(toNewsItem)
      .filter((item): item is NewsItem => item !== null)
      .slice(0, 30);
    return domainNews.length > 0
      ? domainNews
      : [
          {
            id: `world-${simulation.world.scenarioId}`,
            title: t("sharedWorldInitialized"),
            category: "news" as const,
            tick: simulation.world.tick,
            content: `${simulation.world.scenarioId} · ${t("ontologyVersion")} nexus.city-ontology.v1`,
            priority: "low" as const,
          },
        ];
  }, [
    simulation.events,
    simulation.world.scenarioId,
    simulation.world.tick,
    t,
  ]);

  const filteredNews = filter === "all" 
    ? news 
    : news.filter(n => n.category === filter);

  const getTickAge = (tick: number) =>
    `${Math.max(0, simulation.world.tick - tick)} ${t("ticksAgo")}`;

  const getCategoryIcon = (category: NewsItem["category"]) => {
    switch (category) {
      case "alert": return <AlertTriangle className="w-4 h-4 text-cyber-red" />;
      case "update": return <Radio className="w-4 h-4 text-cyber-blue" />;
      default: return <Newspaper className="w-4 h-4 text-cyber-cyan" />;
    }
  };

  const getPriorityColor = (priority: NewsItem["priority"]) => {
    switch (priority) {
      case "high": return "border-l-cyber-red";
      case "medium": return "border-l-cyber-orange";
      default: return "border-l-cyber-green";
    }
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-cyber-cyan/20 border border-cyber-cyan/30">
            <Newspaper className="w-6 h-6 text-cyber-cyan" />
          </div>
          <div>
            <h1 className="text-3xl font-orbitron font-bold text-cyber-cyan cyber-text-glow">
              {t("news_title")}
            </h1>
            <p className="text-cyber-text-dim mt-1">{t("latestUpdates")}</p>
          </div>
        </div>
      </motion.div>

      <div className="flex flex-wrap gap-2">
        {(["all", "news", "alert", "update"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === f
                ? "bg-cyber-cyan/20 text-cyber-cyan border border-cyber-cyan/50"
                : "bg-cyber-dark/50 text-cyber-text-dim hover:bg-cyber-gray"
            }`}
          >
            {f === "all" ? t("all") : f === "alert" ? t("warning") : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filteredNews.map((item, index) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            className={`bg-cyber-dark/50 border border-cyber-blue/20 rounded-lg p-4 border-l-4 ${getPriorityColor(item.priority)} hover:border-cyber-blue/40 transition-colors`}
          >
            <div className="flex items-start gap-3">
              {getCategoryIcon(item.category)}
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-cyber-text font-medium">{item.title}</h3>
                  <div className="flex items-center gap-2 text-cyber-text-dim text-xs">
                    <Clock className="w-3 h-3" />
                    {getTickAge(item.tick)}
                  </div>
                </div>
                <p className="text-cyber-text-dim text-sm">{item.content}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-cyber-cyan/10 to-cyber-blue/10 border border-cyber-cyan/20 rounded-xl p-4"
      >
        <div className="flex items-center gap-3">
          <TrendingUp className="w-5 h-5 text-cyber-green" />
          <div>
            <p className="text-cyber-text font-medium">{t('cityHappinessIndex')}</p>
            <p className="text-cyber-text-dim text-sm">
              {t("sharedWorldMetric")}
            </p>
          </div>
          <div className="ml-auto text-2xl font-orbitron font-bold text-cyber-green">
            {cityStats.happiness.toFixed(1)}%
          </div>
        </div>
      </motion.div>
    </div>
  );
}
