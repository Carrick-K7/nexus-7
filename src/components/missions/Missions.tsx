"use client";

import { useNexusStore } from "@/stores/nexus-store";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { ScrollText, AlertTriangle, Clock, CheckCircle2, Lock, ChevronRight, Trophy } from "lucide-react";
import type { Mission } from "@/types";
import { useTranslation } from "@/hooks/useTranslation";

const initialMissions: Mission[] = [
  { id: "m1", title: "Critical Infrastructure Repair", description: "Power grid in Iron Works district is failing.", type: "urgent", difficulty: 4, reward: { type: "credits", amount: 5000 }, progress: 65, deadline: Date.now() + 86400000, status: "in_progress", assigned: true },
  { id: "m2", title: "Neural Network Optimization", description: "Optimize the AI processing nodes to improve efficiency.", type: "normal", difficulty: 3, reward: { type: "credits", amount: 2500 }, progress: 30, deadline: Date.now() + 172800000, status: "in_progress", assigned: true },
  { id: "m3", title: "Data Heist: Corporate Espionage", description: "Infiltrate rival megacorp servers.", type: "hidden", difficulty: 5, reward: { type: "credits", amount: 15000 }, progress: 0, deadline: Date.now() + 604800000, status: "available", assigned: false },
  { id: "m4", title: "Medical Supply Run", description: "Deliver medical supplies to underprivileged district.", type: "normal", difficulty: 2, reward: { type: "credits", amount: 1200 }, progress: 100, deadline: Date.now() - 3600000, status: "completed", assigned: true },
];

export default function Missions() {
  const { missions, addMission } = useNexusStore();
  const { t } = useTranslation();
  const [filter, setFilter] = useState<"all" | "available" | "in_progress" | "completed">("all");
  const [selectedMission, setSelectedMission] = useState<Mission | null>(null);

  useEffect(() => {
    if (missions.length === 0) {
      initialMissions.forEach(m => addMission(m));
    }
  }, []);

  const filteredMissions = filter === "all" ? (missions.length > 0 ? missions : initialMissions) : 
    (missions.length > 0 ? missions : initialMissions).filter(m => m.status === filter);

  const availableCount = (missions.length > 0 ? missions : initialMissions).filter(m => m.status === "available").length;
  const inProgressCount = (missions.length > 0 ? missions : initialMissions).filter(m => m.status === "in_progress").length;
  const completedCount = (missions.length > 0 ? missions : initialMissions).filter(m => m.status === "completed").length;

  return (
    <div className="p-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-orbitron font-bold text-cyber-purple cyber-text-glow">{t('missions_title')}</h1>
        <p className="text-cyber-text-dim mt-1">{t('missions_desc')}</p>
      </motion.div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: t('available'), value: availableCount, icon: ScrollText, color: "cyber-blue" },
          { label: t('inProgress'), value: inProgressCount, icon: Clock, color: "cyber-yellow" },
          { label: t('completed'), value: completedCount, icon: CheckCircle2, color: "cyber-green" },
          { label: t('totalRewards'), value: "$1.2K", icon: Trophy, color: "cyber-purple" },
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

      <div className="flex gap-2">
        {(["all", "available", "in_progress", "completed"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize ${filter === f ? "bg-cyber-purple text-white" : "bg-cyber-gray text-cyber-text-dim hover:bg-cyber-gray-light"}`}>
            {f === 'all' ? t('all') : f === 'available' ? t('available') : f === 'in_progress' ? t('inProgress') : t('completed')}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-3">
          {(filteredMissions.length > 0 ? filteredMissions : initialMissions).map((mission) => (
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