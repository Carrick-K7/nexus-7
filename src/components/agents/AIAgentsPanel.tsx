"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, BarChart3, Building2, Eye, X, Activity, Clock, Zap, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

interface AgentLog {
  id: string;
  timestamp: number;
  type: "info" | "warning" | "success" | "error";
  message: string;
}

interface Agent {
  id: string;
  name: string;
  role: string;
  status: "active" | "idle" | "warning";
  efficiency: number;
  currentTask: string;
  icon: typeof Shield;
  color: string;
  glowColor: string;
  logs: AgentLog[];
  tasks: string[];
}

const AGENT_TASKS = {
  atlas: [
    "Scanning perimeter sensors",
    "Analyzing threat patterns",
    "Deploying countermeasures",
    "Monitoring defense grid",
    "Hunting cyber intruders",
    "Updating security protocols",
  ],
  economica: [
    "Analyzing market volatility",
    "Rebalancing portfolio assets",
    "Forecasting economic trends",
    "Optimizing trade routes",
    "Monitoring crypto markets",
    "Calculating risk matrices",
  ],
  civitas: [
    "Assessing infrastructure health",
    "Routing traffic patterns",
    "Managing power grid load",
    "Scheduling maintenance",
    "Monitoring construction sites",
    "Optimizing resource allocation",
  ],
  spectre: [
    "Collecting intelligence feeds",
    "Analyzing social media patterns",
    "Monitoring communications",
    "Tracking anomaly signatures",
    "Processing data streams",
    "Generating threat reports",
  ],
};

const generateLogs = (agentId: string, _agentName: string): AgentLog[] => {
  const logTypes: AgentLog["type"][] = ["info", "warning", "success", "error"];
  const baseMessages: Record<string, string[]> = {
    atlas: [
      "Threat level assessment: NOMINAL",
      "Defense perimeter: SECURED",
      "Unauthorized access attempt blocked",
      "Firewall updated successfully",
      "Anomalous activity detected in sector 7",
      "Security scan completed - no threats found",
      "Countermeasures deployed",
      "Authentication protocol reinforced",
    ],
    economica: [
      "Market analysis complete",
      "Trade execution: SUCCESS",
      "Volatility spike detected",
      "Portfolio rebalancing initiated",
      "Risk assessment updated",
      "Economic forecast synchronized",
      "Asset allocation optimized",
      "Trading algorithm calibrated",
    ],
    civitas: [
      "Infrastructure metrics updated",
      "Power grid load: OPTIMAL",
      "Maintenance window scheduled",
      "Construction progress: 78%",
      "Resource distribution balanced",
      "Traffic flow optimized",
      "Utility networks nominal",
      "Building permits processed",
    ],
    spectre: [
      "Intelligence data ingested",
      "Pattern recognition complete",
      "Social sentiment: CAUTIOUS",
      "Anomaly detection: ACTIVE",
      "Data correlation successful",
      "Surveillance sweep completed",
      "Threat vector identified",
      "Information network secured",
    ],
  };

  const messages = baseMessages[agentId] || baseMessages.atlas;
  return Array.from({ length: 12 }, (_, i) => ({
    id: `${agentId}-log-${i}`,
    timestamp: Date.now() - (12 - i) * 60000 * Math.random() * 5,
    type: logTypes[Math.floor(Math.random() * logTypes.length)],
    message: messages[Math.floor(Math.random() * messages.length)],
  }));
};

const createAgent = (id: string, name: string, role: string, icon: typeof Shield, color: string, glowColor: string): Agent => ({
  id,
  name,
  role,
  status: Math.random() > 0.3 ? "active" : Math.random() > 0.5 ? "idle" : "warning",
  efficiency: Math.floor(Math.random() * 30) + 70,
  currentTask: AGENT_TASKS[id as keyof typeof AGENT_TASKS]?.[0] || "Processing...",
  icon,
  color,
  glowColor,
  logs: generateLogs(id, name),
  tasks: AGENT_TASKS[id as keyof typeof AGENT_TASKS] || [],
});

const INITIAL_AGENTS: Agent[] = [
  createAgent("atlas", "ATLAS", "Defense/Security", Shield, "#00f0ff", "rgba(0, 240, 255, 0.5)"),
  createAgent("economica", "ECONOMICA", "Economy/Trading", BarChart3, "#f0ff00", "rgba(240, 255, 0, 0.5)"),
  createAgent("civitas", "CIVITAS", "Infrastructure", Building2, "#ff00ff", "rgba(255, 0, 255, 0.5)"),
  createAgent("spectre", "SPECTRE", "Surveillance/Intel", Eye, "#ff3366", "rgba(255, 51, 102, 0.5)"),
];

const getStatusColor = (status: Agent["status"]) => {
  switch (status) {
    case "active": return "text-cyber-green";
    case "idle": return "text-cyber-yellow";
    case "warning": return "text-cyber-red";
  }
};

const getStatusBg = (status: Agent["status"]) => {
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
  agent: Agent;
  onClick: () => void;
  index: number;
}

const AgentCard = ({ agent, onClick, index }: AgentCardProps) => {
  const { t } = useTranslation();
  const Icon = agent.icon;
  
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
        style={{ background: `linear-gradient(135deg, ${agent.color}, transparent, ${agent.color})` }}
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
              background: `${agent.color}15`,
              boxShadow: `0 0 20px ${agent.glowColor}, inset 0 0 10px ${agent.glowColor}`
            }}
          >
            <Icon className="w-8 h-8" style={{ color: agent.color }} />
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-orbitron font-bold tracking-wider" style={{ color: agent.color }}>
              {agent.name}
            </h3>
            <p className="text-sm text-cyber-text-dim mt-0.5">{agent.role}</p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-cyber-text-dim uppercase tracking-wider">{t('efficiency')}</span>
            <span className="text-sm font-mono font-bold" style={{ color: agent.color }}>{agent.efficiency}%</span>
          </div>
          <div className="h-1.5 bg-cyber-dark rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${agent.efficiency}%` }}
              transition={{ delay: 0.5 + index * 0.15, duration: 1, ease: "easeOut" }}
              className="h-full rounded-full"
              style={{ background: `linear-gradient(90deg, ${agent.color}80, ${agent.color})` }}
            />
          </div>
          
          <div className="pt-2 border-t border-cyber-gray/20">
            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${agent.status === 'active' ? 'bg-cyber-green animate-pulse' : agent.status === 'idle' ? 'bg-cyber-yellow' : 'bg-cyber-red'}`} />
              <span className="text-xs text-cyber-text truncate">{agent.currentTask}</span>
            </div>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyber-gray/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </motion.div>
  );
};

interface AgentModalProps {
  agent: Agent;
  onClose: () => void;
}

const AgentModal = ({ agent, onClose }: AgentModalProps) => {
  const { t } = useTranslation();
  const Icon = agent.icon;
  
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
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
          border: `1px solid ${agent.color}40`,
          boxShadow: `0 0 60px ${agent.glowColor}, 0 0 100px ${agent.glowColor}30`
        }}
      >
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-current to-transparent opacity-50" style={{ color: agent.color }} />
        
        <div className="p-6 border-b border-cyber-gray/20">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div
                className="p-4 rounded-xl"
                style={{ 
                  background: `${agent.color}15`,
                  boxShadow: `0 0 30px ${agent.glowColor}`
                }}
              >
                <Icon className="w-10 h-10" style={{ color: agent.color }} />
              </div>
              <div>
                <h2 className="text-2xl font-orbitron font-bold tracking-wider" style={{ color: agent.color }}>
                  {agent.name}
                </h2>
                <p className="text-cyber-text-dim mt-1">{agent.role}</p>
              </div>
            </div>
            
            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-cyber-gray/20 hover:bg-cyber-gray/40 transition-colors"
            >
              <X className="w-5 h-5 text-cyber-text" />
            </button>
          </div>
          
          <div className="grid grid-cols-3 gap-4 mt-6">
            <div className="bg-cyber-dark/50 rounded-lg p-3 border border-cyber-gray/20">
              <div className="text-xs text-cyber-text-dim uppercase tracking-wider mb-1">{t('status')}</div>
              <div className={`text-lg font-bold ${getStatusColor(agent.status)}`}>
                {agent.status.toUpperCase()}
              </div>
            </div>
            <div className="bg-cyber-dark/50 rounded-lg p-3 border border-cyber-gray/20">
              <div className="text-xs text-cyber-text-dim uppercase tracking-wider mb-1">{t('efficiency')}</div>
              <div className="text-lg font-bold" style={{ color: agent.color }}>
                {agent.efficiency}%
              </div>
            </div>
            <div className="bg-cyber-dark/50 rounded-lg p-3 border border-cyber-gray/20">
              <div className="text-xs text-cyber-text-dim uppercase tracking-wider mb-1">{t('tasks')}</div>
              <div className="text-lg font-bold text-cyber-text">
                {agent.tasks.length}
              </div>
            </div>
          </div>
        </div>
        
        <div className="p-6 overflow-y-auto max-h-[50vh]">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-cyber-blue" />
            <h3 className="text-sm font-orbitron text-cyber-text uppercase tracking-wider">{t('activityLogs')}</h3>
          </div>
          
          <div className="space-y-2">
            {agent.logs.map((log, i) => (
              <motion.div
                key={log.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-start gap-3 p-3 rounded-lg bg-cyber-dark/30 border border-cyber-gray/10 hover:border-cyber-gray/30 transition-colors"
              >
                <div className="mt-0.5">{getLogIcon(log.type)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-cyber-text">{log.message}</p>
                  <p className="text-xs text-cyber-text-dim mt-1 font-mono">{formatTimestamp(log.timestamp)}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
        
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyber-gray/30 to-transparent opacity-50" />
      </motion.div>
    </motion.div>
  );
};

export default function AIAgentsPanel() {
  const { t } = useTranslation();
  const [agents, setAgents] = useState<Agent[]>(INITIAL_AGENTS);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  const cycleAgentTasks = useCallback(() => {
    setAgents(prev => prev.map(agent => {
      const currentTaskIndex = agent.tasks.indexOf(agent.currentTask);
      const nextTaskIndex = (currentTaskIndex + 1) % agent.tasks.length;
      const newEfficiency = Math.max(60, Math.min(99, agent.efficiency + (Math.random() > 0.5 ? 1 : -1)));
      const newStatus: Agent["status"] = newEfficiency > 85 ? "active" : newEfficiency > 70 ? "idle" : "warning";
      
      const newLog: AgentLog = {
        id: `${agent.id}-log-${Date.now()}`,
        timestamp: Date.now(),
        type: Math.random() > 0.8 ? (Math.random() > 0.5 ? "warning" : "error") : "info",
        message: agent.tasks[nextTaskIndex],
      };
      
      return {
        ...agent,
        currentTask: agent.tasks[nextTaskIndex],
        efficiency: newEfficiency,
        status: newStatus,
        logs: [newLog, ...agent.logs.slice(0, 11)],
      };
    }));
  }, []);

  useEffect(() => {
    const interval = setInterval(cycleAgentTasks, 4000);
    return () => clearInterval(interval);
  }, [cycleAgentTasks]);

  return (
    <div className="p-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-cyber-purple/20 border border-cyber-purple/30">
            <Zap className="w-6 h-6 text-cyber-purple" />
          </div>
          <div>
            <h1 className="text-3xl font-orbitron font-bold text-cyber-purple cyber-text-glow">
              {t('agents_title')}
            </h1>
            <p className="text-cyber-text-dim mt-1">{t('agents_desc')}</p>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-2 gap-5">
        {agents.map((agent, index) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            index={index}
            onClick={() => setSelectedAgent(agent)}
          />
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="bg-cyber-dark/40 border border-cyber-gray/20 rounded-xl p-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-cyber-green animate-pulse" />
              <span className="text-sm text-cyber-text">{t('networkStatus')}</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs text-cyber-text-dim">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>{t('tasksCycling')}</span>
            </div>
            <div className="text-xs font-mono text-cyber-text-dim">
              {agents.filter(a => a.status === "active").length}/{agents.length} ACTIVE
            </div>
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {selectedAgent && (
          <AgentModal agent={selectedAgent} onClose={() => setSelectedAgent(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
