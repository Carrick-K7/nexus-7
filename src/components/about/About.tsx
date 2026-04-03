"use client";

import { motion } from "framer-motion";
import { useTranslation } from "@/hooks/useTranslation";
import { TranslationKey } from "@/i18n/translations";
import { 
  Brain, Atom, Satellite, TerminalSquare, Users, Activity, 
  Zap, Monitor, Rocket, Shield, Radio, Cpu
} from "lucide-react";

const features = [
  { icon: Brain, key: "neuralNetwork", color: "cyber-blue" },
  { icon: Atom, key: "quantumComputing", color: "cyber-purple" },
  { icon: Satellite, key: "satelliteControl", color: "cyber-cyan" },
  { icon: TerminalSquare, key: "hackingInterface", color: "cyber-green" },
  { icon: Users, key: "multiAgentAI", color: "cyber-pink" },
  { icon: Activity, key: "liveSimulation", color: "cyber-orange" },
];

export default function About() {
  const { t } = useTranslation();

  return (
    <div className="p-6 space-y-8 overflow-y-auto h-full">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center max-w-4xl mx-auto"
      >
        <div className="flex justify-center mb-6">
          <div className="p-4 rounded-2xl bg-gradient-to-br from-cyber-blue/20 to-cyber-purple/20 border border-cyber-blue/30">
            <Monitor className="w-16 h-16 text-cyber-blue" />
          </div>
        </div>
        
        <h1 className="text-4xl font-orbitron font-bold text-cyber-blue cyber-text-glow mb-2">
          {t("about_title")}
        </h1>
        <p className="text-lg text-cyber-text-dim">{t("about_desc")}</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-cyber-dark/50 border border-cyber-blue/20 rounded-xl p-8 max-w-4xl mx-auto"
      >
        <h2 className="text-2xl font-orbitron font-bold text-cyber-purple mb-4">NEXUS 2087</h2>
        <p className="text-cyber-text leading-relaxed mb-6">
          {t("about_intro")}
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-cyber-text">
              <Rocket className="w-4 h-4 text-cyber-cyan" />
              <span>Year: 2087</span>
            </div>
            <div className="flex items-center gap-2 text-cyber-text">
              <Shield className="w-4 h-4 text-cyber-green" />
              <span>Security: Level 5</span>
            </div>
            <div className="flex items-center gap-2 text-cyber-text">
              <Radio className="w-4 h-4 text-cyber-orange" />
              <span>Network: Quantum-Linked</span>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-cyber-text">
              <Cpu className="w-4 h-4 text-cyber-pink" />
              <span>Processing: 128 Qubits</span>
            </div>
            <div className="flex items-center gap-2 text-cyber-text">
              <Satellite className="w-4 h-4 text-cyber-blue" />
              <span>Satellites: 5 Active</span>
            </div>
            <div className="flex items-center gap-2 text-cyber-text">
              <Users className="w-4 h-4 text-cyber-purple" />
              <span>AI Agents: 4 Active</span>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="max-w-4xl mx-auto"
      >
        <h2 className="text-2xl font-orbitron font-bold text-cyber-text mb-6">{t("features")}</h2>
        <div className="grid grid-cols-2 gap-4">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={feature.key}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + index * 0.05 }}
                className="flex items-center gap-4 p-4 bg-cyber-dark/30 border border-cyber-blue/10 rounded-lg hover:border-cyber-blue/30 transition-colors"
              >
                <div className={`p-3 rounded-lg bg-${feature.color}/10 border border-${feature.color}/20`}>
                  <Icon className={`w-6 h-6 text-${feature.color}`} />
                </div>
                <span className="text-cyber-text">{t(feature.key as TranslationKey)}</span>
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-gradient-to-r from-cyber-blue/10 via-cyber-purple/10 to-cyber-pink/10 border border-cyber-blue/20 rounded-xl p-6 max-w-4xl mx-auto"
      >
        <div className="flex items-center gap-3 mb-4">
          <Zap className="w-6 h-6 text-cyber-yellow" />
          <h3 className="text-xl font-orbitron font-bold text-cyber-yellow">NEXUS SYSTEM</h3>
        </div>
        <p className="text-cyber-text-dim text-sm leading-relaxed">
          Built with Next.js 15, React, TypeScript, Tailwind CSS, Zustand, Framer Motion, and Recharts.
          Designed for the future of urban management in a cyberpunk metropolis.
        </p>
        <div className="flex gap-4 mt-4">
          {["Dashboard", "Trading", "Terminal", "AI Agents", "Quantum Core"].map((item) => (
            <span key={item} className="px-2 py-1 bg-cyber-gray/50 rounded text-xs text-cyber-text-dim">
              {item}
            </span>
          ))}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="text-center text-cyber-text-dim text-sm max-w-4xl mx-auto pb-8"
      >
        <p>NEXUS OMNIScient City Control Center © 2087</p>
        <p className="mt-1">All systems operational. Welcome, Operator.</p>
      </motion.div>
    </div>
  );
}
