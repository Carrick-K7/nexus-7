"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, BarChart3, Building2, Eye, X, Activity, AlertTriangle, CheckCircle2, Brain } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useNexusStore } from "@/stores/nexus-store";
import { AGENT_TASKS } from "@/data/agent-tasks";
import type { AgentLog } from "@/types";

interface AgentConfig {
  icon: typeof Shield;
  color: string;
  glowColor: string;
}

const AGENT_CONFIG: Record<string, AgentConfig> = {
  aria:      { icon: Brain,      color: "#a855f7", glowColor: "rgba(168,85,247,0.5)" },
  atlas:     { icon: Shield,     color: "#00f0ff", glowColor: "rgba(0,240,255,0.5)" },
  economica: { icon: BarChart3,  color: "#f0ff00", glowColor: "rgba(240,255,0,0.5)" },
  civitas:   { icon: Building2, color: "#ff00ff", glowColor: "rgba(255,0,255,0.5)" },
  spectre:   { icon: Eye,        color: "#ff3366", glowColor: "rgba(255,51,102,0.5)" },
};

const getStatusColor = (status: "active" | "idle" | "warning") => {
  switch (status) {
    case "active": return "text-cyber-green";
    case "idle": return "text-cyber-yellow";
    case "warning": return "text-cyber-red";
  }
};

const getStatusBg = (status: "active" | "idle" | "warning") => {
  switch (status) {
    case "active": return "bg-cyber-green/20 border-cyber-green/50";
    case "idle": return "bg-cyber-yellow/20 border-cyber-yellow/50";
    case "warning": return "bg-cyber-red/20 border-cyber-red/50";
  }
};

const getLogIcon = (type: AgentLog["type"]) => {
  switch (type) {
    case "info": return <Activity className="w-4 h-4 text-cyber-blue" />;
    case "warning": return <AlertTriangle className="w-4 h-4 text-cyber-yellow" />;
    case "success": return <CheckCircle2 className="w-4 h-4 text-cyber-green" />;
    case "error": return <AlertTriangle className="w-4 h-4 text-cyber-red" />;
  }
};

const formatTimestamp = (timestamp: number) => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

interface AgentCardProps {
  agent: { id: string; name: string; role: string; status: "active" | "idle" | "warning"; mood: number; currentTask?: string };
  config: AgentConfig;
  onClick: () => void;
  index: number;
}

const AgentCard = ({ agent, config, onClick, index }: AgentCardProps) => {
  const { t } = useTranslation();
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.15, duration: 0.5 }}
      whileHover={{ scale: 1.02, y: -5 }}
      onClick={onClick}
      className="relative group cursor-pointer"
    >
      <div
        className="absolute -inset-0.5 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{ background: `linear-gradient(135deg, ${config.color}, transparent, ${config.color})` }}
      />
      <div className="relative bg-cyber-dark/80 backdrop-blur-sm border border-cyber-gray/30 rounded-xl p-5 group-hover:border-cyber-gray/60 transition-all">
        <div className="absolute top-3 right-3">
          <div className={`px-2 py-1 rounded text-xs font-mono uppercase ${getStatusBg(agent.status)} ${getStatusColor(agent.status)}`}>
            {agent.status}
          </div>
        </div>

        <div className="flex items-start gap-4">
          <div
            className="p-3 rounded-lg"
            style={{
              background: `${config.color}15`,
              boxShadow: `0 0 20px ${config.glowColor}, inset 0 0 10px ${config.glowColor}`
            }}
          >
            <Icon className="w-8 h-8" style={{ color: config.color }} />
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-orbitron font-bold tracking-wider" style={{ color: config.color }}>
              {agent.name}
            </h3>
            <p className="text-sm text-cyber-text-dim mt-0.5">{agent.role}</p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-cyber-text-dim uppercase tracking-wider">{t("efficiency")}</span>
            <span className="text-sm font-mono font-bold" style={{ color: config.color }}>{agent.mood}%</span>
          </div>
          <div className="h-1.5 bg-cyber-dark rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${agent.mood}%` }}
              transition={{ delay: 0.5 + index * 0.15, duration: 1, ease: "easeOut" }}
              className="h-full rounded-full"
              style={{ background: `linear-gradient(90deg, ${config.color}80, ${config.color})` }}
            />
          </div>

          <div className="pt-2 border-t border-cyber-gray/20">
            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${agent.status === 'active' ? 'bg-cyber-green animate-pulse' : agent.status === 'idle' ? 'bg-cyber-yellow' : 'bg-cyber-red'}`} />
              <span className="text-xs text-cyber-text truncate">{agent.currentTask || "Idle"}</span>
            </div>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyber-gray/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </motion.div>
  );
};

interface AgentModalProps {
  agent: { id: string; name: string; role: string; status: "active" | "idle" | "warning"; mood: number; currentTask?: string };
  config: AgentConfig;
  onClose: () => void;
}

const AgentModal = ({ agent, config, onClose }: AgentModalProps) => {
  const { t } = useTranslation();
  void t;
  const Icon = config.icon;
  const agentLogs = useNexusStore((s) => s.agentLogs);
  const agentLogsForThisAgent = useMemo(
    () => agentLogs.filter((log) => log.agentId === agent.id),
    [agent.id, agentLogs],
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`agent-modal-${agent.id}`}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl max-h-[80vh] overflow-hidden rounded-2xl"
        style={{
          background: `linear-gradient(135deg, #0a0a0f 0%, #12121a 100%)`,
          border: `1px solid ${config.color}40`,
          boxShadow: `0 0 60px ${config.glowColor}, 0 0 100px ${config.glowColor}30`
        }}
      >
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-current to-transparent opacity-50" style={{ color: config.color }} />

        <div className="p-6 border-b border-cyber-gray/20">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div
                className="p-4 rounded-xl"
                style={{
                  background: `${config.color}15`,
                  boxShadow: `0 0 30px ${config.glowColor}`
                }}
              >
                <Icon className="w-10 h-10" style={{ color: config.color }} />
              </div>
              <div>
                <h2 id={`agent-modal-${agent.id}`} className="text-2xl font-orbitron font-bold tracking-wider" style={{ color: config.color }}>
                  {agent.name}
                </h2>
                <p className="text-cyber-text-dim mt-1">{agent.role}</p>
              </div>
            </div>

            <button
              onClick={onClose}
              aria-label={`Close ${agent.name} details`}
              className="p-2 rounded-lg bg-cyber-gray/20 hover:bg-cyber-gray/40 transition-colors"
            >
              <X className="w-5 h-5 text-cyber-text-dim" />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(80vh - 120px)' }}>
          <div className="space-y-6">
            <div>
              <h4 className="text-sm font-orbitron text-cyber-text-dim uppercase tracking-wider mb-3">Current Task</h4>
              <div className="p-3 rounded-lg bg-cyber-dark/50 border border-cyber-gray/30">
                <p className="text-sm text-cyber-blue">{agent.currentTask || "Idle"}</p>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-orbitron text-cyber-text-dim uppercase tracking-wider mb-3">Agent Logs</h4>
              <div className="space-y-2">
                {agentLogsForThisAgent.length === 0 ? (
                  <p className="text-xs text-cyber-text-dim">No logs yet. Agent actions will appear here.</p>
                ) : (
                  agentLogsForThisAgent.slice(-10).map((log) => (
                    <div key={log.id} className="flex items-start gap-3 p-2 rounded bg-cyber-dark/30">
                      <div className="mt-0.5">{getLogIcon(log.type)}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-cyber-text">{log.message}</p>
                        <p className="text-xs text-cyber-text-dim mt-1">{formatTimestamp(log.timestamp)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-orbitron text-cyber-text-dim uppercase tracking-wider mb-3">Available Tasks</h4>
              <div className="flex flex-wrap gap-2">
                {(AGENT_TASKS[agent.id] || []).map((task, i) => (
                  <span key={i} className="px-2 py-1 rounded text-xs bg-cyber-dark/50 border border-cyber-gray/30 text-cyber-text-dim">
                    {task}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default function AIAgentsPanel() {
  const { t } = useTranslation();
  const aiAgents = useNexusStore((s) => s.aiAgents);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const selectedAgent = aiAgents.find((a) => a.id === selectedAgentId) ?? null;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-orbitron font-bold text-cyber-purple cyber-text-glow">
          {t("agents")}
        </h1>
        <p className="text-cyber-text-dim mt-1">{t("agents_desc")}</p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {aiAgents.map((agent, i) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            config={AGENT_CONFIG[agent.id]}
            onClick={() => setSelectedAgentId(agent.id)}
            index={i}
          />
        ))}
      </div>

      <AnimatePresence>
        {selectedAgent && (
          <AgentModal
            key={selectedAgent.id}
            agent={selectedAgent}
            config={AGENT_CONFIG[selectedAgent.id]}
            onClose={() => setSelectedAgentId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
