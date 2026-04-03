"use client";

import { useNexusStore } from "@/stores/nexus-store";
import { motion } from "framer-motion";
import { useEffect } from "react";
import { Users, Zap, Car, Shield, Cloud, Droplets, Wifi, Heart, TrendingUp, AlertTriangle } from "lucide-react";

const cardData = [
  { key: "population", label: "Population", icon: Users, format: (v: number) => `${(v / 1000000).toFixed(2)}M` },
  { key: "energy", label: "Energy Grid", icon: Zap, format: (v: number) => `${v}%` },
  { key: "traffic", label: "Traffic Flow", icon: Car, format: (v: number) => `${v}%` },
  { key: "crime", label: "Crime Index", icon: Shield, format: (v: number) => v.toString() },
  { key: "pollution", label: "Pollution", icon: Cloud, format: (v: number) => `${v}%` },
  { key: "medical", label: "Medical Ready", icon: Heart, format: (v: number) => `${v}%` },
  { key: "internet", label: "Network", icon: Wifi, format: (v: number) => `${v}%` },
  { key: "water", label: "Water Supply", icon: Droplets, format: (v: number) => `${v}%` },
];

const crimeHotspots = [
  { name: "Iron Works", incidents: 847, risk: "high" },
  { name: "Chrome Heights", incidents: 234, risk: "medium" },
  { name: "Neo Downtown", incidents: 156, risk: "low" },
];

export default function Dashboard() {
  const { cityStats, districts, addNotification } = useNexusStore();

  useEffect(() => {
    const interval = setInterval(() => {
      addNotification({ type: "info", title: "System Update", message: "City metrics refreshed", source: "NEXUS" });
    }, 20000);
    return () => clearInterval(interval);
  }, [addNotification]);

  return (
    <div className="p-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-orbitron font-bold text-cyber-blue cyber-text-glow">CITY OVERVIEW</h1>
        <p className="text-cyber-text-dim mt-1">Real-time monitoring of Neo Angeles City</p>
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
                <div className="text-sm text-cyber-text-dim">{item.label}</div>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
          className="bg-cyber-dark/50 border border-cyber-blue/20 rounded-xl p-6">
          <h3 className="text-lg font-orbitron text-cyber-text mb-4">District Status</h3>
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
          <h3 className="text-lg font-orbitron text-cyber-text mb-4">System Health</h3>
          <div className="grid grid-cols-2 gap-4">
            {[{ label: "Neural Network", value: 94 }, { label: "Quantum Core", value: 88 }, { label: "Defense Grid", value: 99 }, { label: "Comms Array", value: 76 }].map((sys) => (
              <div key={sys.label} className="p-4 bg-cyber-gray/30 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-cyber-text">{sys.label}</span>
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