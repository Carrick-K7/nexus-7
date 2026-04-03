"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Activity, AlertTriangle, BarChart3, TrendingUp } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

interface ResourceData {
  time: string;
  power: number;
  water: number;
  bandwidth: number;
}

interface CityEvent {
  id: string;
  type: "accident" | "crime" | "market" | "system";
  title: string;
  location: string;
  time: string;
  severity: "low" | "medium" | "high";
}

interface AgentTask {
  name: string;
  atlas: number;
  economica: number;
  civitas: number;
  spectre: number;
}

interface ThreatData {
  label: string;
  value: number;
  max: number;
}

const generateResourceData = (): ResourceData[] => {
  const now = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const time = new Date(now.getTime() - (11 - i) * 5 * 60000);
    return {
      time: time.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
      power: Math.floor(Math.random() * 30) + 60,
      water: Math.floor(Math.random() * 20) + 70,
      bandwidth: Math.floor(Math.random() * 40) + 50,
    };
  });
};

const INITIAL_EVENTS: CityEvent[] = [
  { id: "1", type: "accident", title: "Vehicle Collision", location: "Neo Downtown Interchange", time: "2 min ago", severity: "medium" },
  { id: "2", type: "crime", title: "Data Breach Attempt", location: "Chrome Heights Network", time: "5 min ago", severity: "high" },
  { id: "3", type: "market", title: "Crypto Spike +12%", location: "Global Exchange", time: "8 min ago", severity: "low" },
  { id: "4", type: "system", title: "Power Grid Fluctuation", location: "Industrial Sector 7", time: "12 min ago", severity: "medium" },
  { id: "5", type: "accident", title: "Drone Malfunction", location: "Skyway L2", time: "15 min ago", severity: "low" },
  { id: "6", type: "crime", title: "Unauthorized Access", location: "Financial District", time: "18 min ago", severity: "high" },
];

const INITIAL_TASKS: AgentTask[] = [
  { name: "Security", atlas: 85, economica: 20, civitas: 30, spectre: 75 },
  { name: "Analysis", atlas: 30, economica: 90, civitas: 45, spectre: 60 },
  { name: "Infrastructure", atlas: 25, economica: 35, civitas: 80, spectre: 20 },
  { name: "Surveillance", atlas: 40, economica: 15, civitas: 25, spectre: 95 },
  { name: "Trading", atlas: 10, economica: 95, civitas: 20, spectre: 30 },
];

const THREAT_LEVELS: ThreatData[] = [
  { label: "External Threats", value: 72, max: 100 },
  { label: "System Integrity", value: 94, max: 100 },
  { label: "Data Security", value: 65, max: 100 },
  { label: "Infrastructure", value: 88, max: 100 },
];

const METRICS = [
  { label: "Active Drones", value: 1247, change: "+23" },
  { label: "Network Nodes", value: 8432, change: "+156" },
  { label: "Power Output", value: "4.2 GW", change: "+0.3" },
  { label: "Water Reserve", value: "78%", change: "-2%" },
  { label: "Traffic Index", value: 67, change: "+5" },
  { label: "Crime Rate", value: 23, change: "-8" },
];

const getEventIcon = (type: CityEvent["type"]) => {
  switch (type) {
    case "accident": return <AlertTriangle className="w-4 h-4" />;
    case "crime": return <AlertTriangle className="w-4 h-4" />;
    case "market": return <TrendingUp className="w-4 h-4" />;
    case "system": return <Activity className="w-4 h-4" />;
  }
};

const getEventColor = (type: CityEvent["type"]) => {
  switch (type) {
    case "accident": return "text-cyber-orange";
    case "crime": return "text-cyber-red";
    case "market": return "text-cyber-yellow";
    case "system": return "text-cyber-blue";
  }
};

const getSeverityColor = (severity: CityEvent["severity"]) => {
  switch (severity) {
    case "low": return "bg-cyber-green";
    case "medium": return "bg-cyber-orange";
    case "high": return "bg-cyber-red";
  }
};

interface TooltipPayload {
  name: string;
  value: number;
  color: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-cyber-dark/90 border border-cyber-blue/30 rounded-lg p-3 backdrop-blur-sm">
        <p className="text-cyber-text-dim text-xs mb-1">{label}</p>
        {payload.map((entry, index) => (
          <p key={index} className="text-sm font-mono" style={{ color: entry.color }}>
            {entry.name}: {entry.value}%
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default function DataAnalytics() {
  const { t } = useTranslation();
  const [resourceData, setResourceData] = useState<ResourceData[]>(generateResourceData());
  const [events] = useState<CityEvent[]>(INITIAL_EVENTS);
  const [tasks] = useState<AgentTask[]>(INITIAL_TASKS);
  const [threats] = useState<ThreatData[]>(THREAT_LEVELS);

  useEffect(() => {
    const interval = setInterval(() => {
      setResourceData(prev => {
        const now = new Date();
        const newPoint = {
          time: now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
          power: Math.floor(Math.random() * 30) + 60,
          water: Math.floor(Math.random() * 20) + 70,
          bandwidth: Math.floor(Math.random() * 40) + 50,
        };
        return [...prev.slice(1), newPoint];
      });
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-cyber-blue/20 border border-cyber-blue/30">
            <BarChart3 className="w-6 h-6 text-cyber-blue" />
          </div>
          <div>
            <h1 className="text-3xl font-orbitron font-bold text-cyber-blue cyber-text-glow">
              {t('analytics_title')}
            </h1>
            <p className="text-cyber-text-dim mt-1">{t('analytics_desc')}</p>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-cyber-dark/50 border border-cyber-blue/20 rounded-xl p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-cyber-blue" />
            <h3 className="text-lg font-orbitron text-cyber-text">{t('resourceConsumption')}</h3>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={resourceData}>
                <defs>
                  <linearGradient id="colorPower" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00f0ff" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#00f0ff" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorWater" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00ff88" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#00ff88" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorBandwidth" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#b829ff" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#b829ff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" stroke="#4a4a5e" fontSize={10} tickLine={false} />
                <YAxis stroke="#4a4a5e" fontSize={10} tickLine={false} axisLine={false} domain={[0, 100]} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="power" stroke="#00f0ff" fillOpacity={1} fill="url(#colorPower)" strokeWidth={2} name="Power" />
                <Area type="monotone" dataKey="water" stroke="#00ff88" fillOpacity={1} fill="url(#colorWater)" strokeWidth={2} name="Water" />
                <Area type="monotone" dataKey="bandwidth" stroke="#b829ff" fillOpacity={1} fill="url(#colorBandwidth)" strokeWidth={2} name="Bandwidth" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-center gap-6 mt-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-cyber-blue" />
              <span className="text-xs text-cyber-text-dim">{t('power')}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-cyber-green" />
              <span className="text-xs text-cyber-text-dim">{t('water')}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-cyber-purple" />
              <span className="text-xs text-cyber-text-dim">{t('bandwidth')}</span>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-cyber-dark/50 border border-cyber-blue/20 rounded-xl p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-cyber-orange" />
            <h3 className="text-lg font-orbitron text-cyber-text">{t('cityEventTimeline')}</h3>
          </div>
          <div className="space-y-3 h-72 overflow-y-auto pr-2">
            {events.map((event, index) => (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + index * 0.05 }}
                className="flex items-start gap-3 p-3 bg-cyber-gray/30 rounded-lg border border-cyber-gray/20 hover:border-cyber-blue/30 transition-colors"
              >
                <div className={`p-2 rounded-lg ${getEventColor(event.type)}/20`}>
                  <span className={getEventColor(event.type)}>{getEventIcon(event.type)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-cyber-text font-medium truncate">{event.title}</p>
                    <div className={`w-2 h-2 rounded-full ${getSeverityColor(event.severity)}`} />
                  </div>
                  <p className="text-xs text-cyber-text-dim mt-1">{event.location}</p>
                  <p className="text-xs text-cyber-blue-dim mt-1 font-mono">{event.time}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-cyber-dark/50 border border-cyber-blue/20 rounded-xl p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 text-cyber-purple" />
            <h3 className="text-lg font-orbitron text-cyber-text">{t('aiAgentActivity')}</h3>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tasks} layout="vertical">
                <XAxis type="number" stroke="#4a4a5e" fontSize={10} tickLine={false} domain={[0, 100]} />
                <YAxis dataKey="name" type="category" stroke="#4a4a5e" fontSize={10} tickLine={false} width={80} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="atlas" fill="#00f0ff" radius={[0, 4, 4, 0]} name="ATLAS" />
                <Bar dataKey="economica" fill="#f0ff00" radius={[0, 4, 4, 0]} name="ECONOMICA" />
                <Bar dataKey="civitas" fill="#ff00ff" radius={[0, 4, 4, 0]} name="CIVITAS" />
                <Bar dataKey="spectre" fill="#ff3366" radius={[0, 4, 4, 0]} name="SPECTRE" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-cyber-dark/50 border border-cyber-blue/20 rounded-xl p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-cyber-red" />
            <h3 className="text-lg font-orbitron text-cyber-text">{t('threatLevelIndicators')}</h3>
          </div>
          <div className="space-y-5">
            {threats.map((threat, index) => (
              <motion.div
                key={threat.label}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + index * 0.1 }}
                className="relative"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-cyber-text">{threat.label}</span>
                  <span className="text-lg font-bold font-mono text-cyber-blue">{threat.value}%</span>
                </div>
                <div className="h-3 bg-cyber-dark rounded-full overflow-hidden border border-cyber-gray/30">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(threat.value / threat.max) * 100}%` }}
                    transition={{ delay: 0.6 + index * 0.1, duration: 1, ease: "easeOut" }}
                    className={`h-full rounded-full ${
                      threat.value > 80 ? "bg-cyber-red" : threat.value > 50 ? "bg-cyber-orange" : "bg-cyber-green"
                    }`}
                    style={{
                      boxShadow: `0 0 10px ${
                        threat.value > 80 ? "#ff3333" : threat.value > 50 ? "#ff8c00" : "#00ff88"
                      }`,
                    }}
                  />
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="bg-cyber-dark/50 border border-cyber-blue/20 rounded-xl p-6"
      >
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-cyber-green" />
          <h3 className="text-lg font-orbitron text-cyber-text">{t('liveCityMetrics')}</h3>
        </div>
        <div className="grid grid-cols-6 gap-4">
          {METRICS.map((metric, index) => (
            <motion.div
              key={metric.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 + index * 0.05 }}
              className="bg-cyber-gray/30 rounded-lg p-4 border border-cyber-gray/20 hover:border-cyber-blue/30 transition-colors"
            >
              <div className="text-xs text-cyber-text-dim uppercase tracking-wider mb-1">{metric.label}</div>
              <div className="text-xl font-bold text-cyber-text font-mono">{metric.value}</div>
              <div className={`text-xs font-mono mt-1 ${metric.change.startsWith("+") ? "text-cyber-green" : metric.change.startsWith("-") ? "text-cyber-red" : "text-cyber-text-dim"}`}>
                {metric.change}
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
