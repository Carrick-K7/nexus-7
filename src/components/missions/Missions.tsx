"use client";

import { useNexusStore } from "@/stores/nexus-store";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { ScrollText, AlertTriangle, Clock, CheckCircle2, Lock, ChevronRight, Trophy } from "lucide-react";
import type { Mission } from "@/types";
import { useTranslation } from "@/hooks/useTranslation";

export default function Missions() {
  const simulation = useNexusStore((state) => state.simulation);
  const { events, world } = simulation;
  const { t } = useTranslation();
  const [filter, setFilter] = useState<"all" | "available" | "in_progress" | "completed">("all");
  const [selectedMission, setSelectedMission] = useState<Mission | null>(null);
  const missions = useMemo<Mission[]>(() => {
    const latestThresholdByMetric = new Map<
      string,
      (typeof events)[number]
    >();
    for (const event of events) {
      if (event.type === "observation.threshold") {
        latestThresholdByMetric.set(String(event.payload.metric), event);
      }
    }
    const thresholdMissions = [...latestThresholdByMetric.values()].map(
      (event): Mission => {
        const action = events.find(
          (candidate) =>
            candidate.type === "agent.action" &&
            candidate.correlationId === event.correlationId,
        );
        const metric = String(event.payload.metric);
        const completed = Boolean(action);
        return {
          id: `mission-${event.id}`,
          title: `${t("respondToMetric")} ${metric.toUpperCase()}`,
          description: `${t("missionEvidenceDesc")} ${event.id} · ${String(event.payload.assignedAgent).toUpperCase()}`,
          type: "urgent",
          difficulty: event.payload.riskTier === "high" ? 5 : 4,
          reward: {
            type: "credits",
            amount: event.payload.riskTier === "high" ? 5_000 : 3_000,
          },
          progress: completed ? 100 : 0,
          deadline: event.tick + 120,
          status: completed ? "completed" : "available",
          assigned: completed,
        };
      },
    );
    const mechanismMissions = events
      .filter((event) => event.type === "city.mechanism.applied")
      .slice(-4)
      .map(
        (event): Mission => ({
          id: `mission-${event.id}`,
          title: `${t("investigateMechanism")} ${String(event.payload.mechanism)}`,
          description: `${String(event.payload.causeMetric)} → ${String(event.payload.effectMetric)} · ${event.id}`,
          type: "normal",
          difficulty: 3,
          reward: { type: "credits", amount: 2_000 },
          progress: 25,
          deadline: event.tick + 240,
          status: "in_progress",
          assigned: true,
        }),
      );
    const projected = [...thresholdMissions, ...mechanismMissions];
    return projected.length > 0
      ? projected
      : [
          {
            id: `mission-observe-${world.scenarioId}`,
            title: t("observeSharedWorld"),
            description: `${world.scenarioId} · tick ${world.tick}`,
            type: "normal",
            difficulty: 1,
            reward: { type: "credits", amount: 500 },
            progress: 0,
            deadline: world.tick + 60,
            status: "available",
            assigned: false,
          },
        ];
  }, [
    events,
    world,
    t,
  ]);

  const filteredMissions =
    filter === "all"
      ? missions
      : missions.filter((mission) => mission.status === filter);
  const availableCount = missions.filter(
    (mission) => mission.status === "available",
  ).length;
  const inProgressCount = missions.filter(
    (mission) => mission.status === "in_progress",
  ).length;
  const completedCount = missions.filter(
    (mission) => mission.status === "completed",
  ).length;
  const totalRewards = missions.reduce(
    (sum, mission) => sum + mission.reward.amount,
    0,
  );

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-orbitron font-bold text-cyber-purple cyber-text-glow">{t('missions_title')}</h1>
        <p className="text-cyber-text-dim mt-1">{t('missions_desc')}</p>
      </motion.div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: t('available'), value: availableCount, icon: ScrollText, color: "cyber-blue" },
          { label: t('inProgress'), value: inProgressCount, icon: Clock, color: "cyber-yellow" },
          { label: t('completed'), value: completedCount, icon: CheckCircle2, color: "cyber-green" },
          { label: t('totalRewards'), value: `$${totalRewards.toLocaleString()}`, icon: Trophy, color: "cyber-purple" },
        ].map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
            className="bg-cyber-dark/50 border border-cyber-blue/20 rounded-xl p-4 flex items-center gap-3">
            <stat.icon className={`w-8 h-8 text-${stat.color}`} />
            <div>
              <div className="text-xs text-cyber-text-dim">{stat.label}</div>
              <div className={`text-xl font-bold text-${stat.color}`}>{stat.value}</div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", "available", "in_progress", "completed"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize ${filter === f ? "bg-cyber-purple text-white" : "bg-cyber-gray text-cyber-text-dim hover:bg-cyber-gray-light"}`}>
            {f === 'all' ? t('all') : f === 'available' ? t('available') : f === 'in_progress' ? t('inProgress') : t('completed')}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2 space-y-3">
          {filteredMissions.map((mission) => (
            <motion.button key={mission.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
              onClick={() => setSelectedMission(mission)}
              className={`w-full text-left bg-cyber-dark/50 border rounded-xl p-4 transition-all ${
                selectedMission?.id === mission.id ? "border-cyber-purple" :
                mission.type === "urgent" ? "border-cyber-red/50" :
                mission.type === "hidden" ? "border-cyber-yellow/50" : "border-cyber-blue/20 hover:border-cyber-blue/40"
              }`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  {mission.type === "urgent" && <AlertTriangle className="w-5 h-5 text-cyber-red" />}
                  {mission.type === "hidden" && <Lock className="w-5 h-5 text-cyber-yellow" />}
                  {mission.type === "normal" && <ScrollText className="w-5 h-5 text-cyber-blue" />}
                  <div>
                    <h3 className="font-medium text-cyber-text">{mission.title}</h3>
                    <p className="text-xs text-cyber-text-dim mt-1 line-clamp-1">{mission.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    mission.status === "completed" ? "bg-cyber-green/20 text-cyber-green" :
                    mission.status === "in_progress" ? "bg-cyber-yellow/20 text-cyber-yellow" :
                    "bg-cyber-blue/20 text-cyber-blue"
                  }`}>{mission.status.replace("_", " ")}</span>
                  <ChevronRight className="w-4 h-4 text-cyber-text-dim" />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex justify-between text-xs text-cyber-text-dim mb-1">
                    <span>{t('progress')}</span>
                    <span>{mission.progress}%</span>
                  </div>
                  <div className="h-1.5 bg-cyber-gray rounded-full overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${mission.progress}%` }} className={`h-full ${mission.status === "completed" ? "bg-cyber-green" : "bg-cyber-purple"}`} />
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-cyber-text-dim">{t('reward')}</div>
                  <div className="text-sm font-bold text-cyber-yellow">${mission.reward.amount.toLocaleString()}</div>
                </div>
              </div>
            </motion.button>
          ))}
        </div>

        {selectedMission && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="bg-cyber-dark/50 border border-cyber-blue/20 rounded-xl p-6 h-fit">
            <div className="flex items-center gap-2 mb-4">
              {selectedMission.type === "urgent" && <AlertTriangle className="w-5 h-5 text-cyber-red" />}
              {selectedMission.type === "hidden" && <Lock className="w-5 h-5 text-cyber-yellow" />}
              {selectedMission.type === "normal" && <ScrollText className="w-5 h-5 text-cyber-blue" />}
              <h3 className="text-lg font-orbitron text-cyber-text">{selectedMission.title}</h3>
            </div>
            <p className="text-sm text-cyber-text-dim mb-4">{selectedMission.description}</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-cyber-text-dim">{t('status')}</span><span className="text-cyber-text capitalize">{selectedMission.status.replace("_", " ")}</span></div>
              <div className="flex justify-between"><span className="text-cyber-text-dim">{t('difficulty')}</span><span className="text-cyber-text">{selectedMission.difficulty}/5</span></div>
              <div className="flex justify-between"><span className="text-cyber-text-dim">{t('reward')}</span><span className="text-cyber-yellow font-bold">${selectedMission.reward.amount.toLocaleString()}</span></div>
            </div>
            {selectedMission.status !== "completed" && (
              <button className="w-full mt-4 py-3 bg-cyber-purple hover:bg-cyber-purple/80 rounded-lg font-medium text-white transition-colors">
                {selectedMission.status === "available" ? t('acceptMission') : t('continueMission')}
              </button>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
