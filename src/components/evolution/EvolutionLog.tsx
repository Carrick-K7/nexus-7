"use client";

import { motion } from "framer-motion";
import { useTranslation } from "@/hooks/useTranslation";
import { useState, useEffect, useRef } from "react";
import { 
  GitCommit, Brain, TrendingUp, Target, Lightbulb, 
  CheckCircle2, Clock, Zap, BarChart2, Eye
} from "lucide-react";

interface IterationEntry {
  id: string;
  version: string;
  date: string;
  trigger: "observation" | "bug" | "enhancement" | "test";
  triggerReason: string;
  action: string;
  outcome: string;
  metrics: {
    before: number;
    after: number;
    label: string;
  }[];
}

const evolutionLog: IterationEntry[] = [
  {
    id: "v0.1.0-initial",
    version: "0.1.0",
    date: "2026-06-14",
    trigger: "enhancement",
    triggerReason: "First official release after codebase audit",
    action: "20 components, 18 modules, Zustand store, EN/ZH i18n, EvolutionLog scaffold, 15/15 tests, 0 lint errors",
    outcome: "NEXUS-7 v0.1.0 tagged. AI self-iteration scaffold in place.",
    metrics: [
      { label: "Components", before: 0, after: 20 },
      { label: "Tests", before: 0, after: 15 },
      { label: "Lint Errors", before: 12, after: 0 },
    ],
  },
];

const getTriggerIcon = (trigger: IterationEntry["trigger"]) => {
  switch (trigger) {
    case "observation": return Eye;
    case "bug": return Target;
    case "enhancement": return TrendingUp;
    case "test": return CheckCircle2;
  }
};

const getTriggerColor = (trigger: IterationEntry["trigger"]) => {
  switch (trigger) {
    case "observation": return "cyber-blue";
    case "bug": return "cyber-red";
    case "enhancement": return "cyber-green";
    case "test": return "cyber-yellow";
  }
};

const getTriggerLabel = (trigger: IterationEntry["trigger"], t: (key: string) => string) => {
  switch (trigger) {
    case "observation": return t("trigger_observation");
    case "bug": return t("trigger_bug");
    case "enhancement": return t("trigger_enhancement");
    case "test": return t("trigger_test");
  }
};

export default function EvolutionLog() {
  const { t } = useTranslation();
  const [selectedEntry, setSelectedEntry] = useState<IterationEntry | null>(null);
  const [autoPlay, setAutoPlay] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const autoPlayRef = useRef(autoPlay);

  useEffect(() => {
    autoPlayRef.current = autoPlay;
  }, [autoPlay]);

  useEffect(() => {
    if (!autoPlay) return;
    const interval = setInterval(() => {
      setCurrentIndex(prev => {
        const next = (prev + 1) % evolutionLog.length;
        return next;
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [autoPlay]);

  const displayEntry = autoPlay ? evolutionLog[currentIndex] : selectedEntry;

  return (
    <div className="p-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-cyber-purple/20 border border-cyber-purple/30">
            <Brain className="w-6 h-6 text-cyber-purple" />
          </div>
          <div>
            <h1 className="text-3xl font-orbitron font-bold text-cyber-purple cyber-text-glow">
              {t("evolutionLog")}
            </h1>
            <p className="text-cyber-text-dim mt-1">{t("evolutionLogDesc")}</p>
          </div>
        </div>
      </motion.div>

      <div className="flex items-center gap-4 p-4 bg-cyber-dark/50 border border-cyber-gray/30 rounded-xl">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-5 h-5 text-cyber-blue" />
          <span className="text-sm text-cyber-text">{t("totalIterations")}:</span>
          <span className="text-lg font-orbitron font-bold text-cyber-blue">{evolutionLog.length}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setAutoPlay(!autoPlay)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              autoPlay 
                ? "bg-cyber-red/20 text-cyber-red border border-cyber-red/50" 
                : "bg-cyber-gray/50 text-cyber-text-dim hover:bg-cyber-gray"
            }`}
          >
            {autoPlay ? <Clock className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
            {autoPlay ? t("pauseAutoPlay") : t("autoPlay")}
          </button>
        </div>
      </div>

      <div className="relative">
        <div className="absolute left-6 top-0 bottom-0 w-px bg-gradient-to-b from-cyber-purple via-cyber-blue to-cyber-gray/30" />
        
        <div className="space-y-4">
          {evolutionLog.map((entry, index) => {
            const TriggerIcon = getTriggerIcon(entry.trigger);
            const colorClass = getTriggerColor(entry.trigger);
            const isSelected = selectedEntry?.id === entry.id;
            
            return (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <button
                  onClick={() => setSelectedEntry(entry)}
                  className={`w-full text-left relative`}
                >
                  <div className={`absolute -left-6 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full flex items-center justify-center border-2 transition-all ${
                    isSelected 
                      ? `bg-cyber-dark border-${colorClass} shadow-[0_0_20px_var(--tw-shadow-color)]` 
                      : "bg-cyber-dark border-cyber-gray/30 hover:border-cyber-gray"
                  }`}
                  style={{ 
                    borderColor: isSelected ? `var(--tw-shadow-color)` : undefined,
                    boxShadow: isSelected ? `0 0 20px rgba(168, 85, 247, 0.5)` : undefined,
                  }}
                >
                    <GitCommit className={`w-5 h-5 ${isSelected ? `text-${colorClass}` : "text-cyber-text-dim"}`} />
                  </div>
                  
                  <div className={`ml-8 p-4 rounded-xl border transition-all ${
                    isSelected 
                      ? `bg-cyber-dark/80 border-${colorClass}/50` 
                      : "bg-cyber-dark/50 border-cyber-gray/30 hover:border-cyber-gray"
                  }`}>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="px-2 py-1 rounded bg-cyber-purple/20 text-cyber-purple text-xs font-mono">
                        v{entry.version}
                      </span>
                      <span className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
                        entry.trigger === "observation" ? "bg-cyber-blue/20 text-cyber-blue" :
                        entry.trigger === "bug" ? "bg-cyber-red/20 text-cyber-red" :
                        entry.trigger === "enhancement" ? "bg-cyber-green/20 text-cyber-green" :
                        "bg-cyber-yellow/20 text-cyber-yellow"
                      }`}>
                        <TriggerIcon className="w-3 h-3" />
                        {getTriggerLabel(entry.trigger, t)}
                      </span>
                      <span className="text-xs text-cyber-text-dim ml-auto">{entry.date}</span>
                    </div>
                    <p className="text-sm text-cyber-text">{entry.triggerReason}</p>
                  </div>
                </button>
              </motion.div>
            );
          })}
        </div>
      </div>

      {displayEntry && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-cyber-dark/50 border border-cyber-purple/30 rounded-xl p-6"
        >
          <div className="flex items-start gap-4 mb-4">
            <div className="p-3 rounded-lg bg-cyber-purple/20">
              <Lightbulb className="w-6 h-6 text-cyber-purple" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-orbitron text-cyber-purple mb-2">
                v{displayEntry.version} - {t("decisionProcess")}
              </h3>
              <div className="space-y-3">
                <div>
                  <div className="text-xs text-cyber-text-dim uppercase tracking-wider mb-1">{t("whatTriggered")}</div>
                  <p className="text-sm text-cyber-text">{displayEntry.triggerReason}</p>
                </div>
                <div>
                  <div className="text-xs text-cyber-text-dim uppercase tracking-wider mb-1">{t("whatWasDone")}</div>
                  <p className="text-sm text-cyber-text">{displayEntry.action}</p>
                </div>
                <div>
                  <div className="text-xs text-cyber-text-dim uppercase tracking-wider mb-1">{t("whatResult")}</div>
                  <p className="text-sm text-cyber-text">{displayEntry.outcome}</p>
                </div>
              </div>
            </div>
          </div>
          
          {displayEntry.metrics.some(m => m.before !== m.after) && (
            <div className="mt-4 pt-4 border-t border-cyber-gray/30">
              <div className="text-xs text-cyber-text-dim uppercase tracking-wider mb-3">{t("metricsImpact")}</div>
              <div className="grid grid-cols-2 gap-3">
                {displayEntry.metrics.filter(m => m.before !== m.after || m.label.includes("Coverage") || m.label.includes("Errors")).map((metric) => (
                  <div key={metric.label} className="flex items-center gap-3">
                    <span className="text-xs text-cyber-text-dim w-24 truncate">{metric.label}</span>
                    <div className="flex-1 h-2 bg-cyber-gray rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: `${(metric.before / (metric.after || 1)) * 100}%` }}
                        animate={{ width: `${(metric.after / (metric.after || 1)) * 100}%` }}
                        transition={{ duration: 1 }}
                        className={`h-full rounded-full ${
                          metric.after > metric.before ? "bg-cyber-green" : "bg-cyber-red"
                        }`}
                      />
                    </div>
                    <span className={`text-xs font-mono ${
                      metric.after > metric.before ? "text-cyber-green" : "text-cyber-red"
                    }`}>
                      {metric.before} → {metric.after}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-gradient-to-r from-cyber-purple/10 to-cyber-blue/10 border border-cyber-purple/30 rounded-xl p-6"
      >
        <h3 className="text-lg font-orbitron text-cyber-text mb-4 flex items-center gap-2">
          <Eye className="w-5 h-5 text-cyber-purple" />
          {t("howToObserve")}
        </h3>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div className="p-4 bg-cyber-dark/50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-full bg-cyber-blue animate-pulse" />
              <span className="font-medium text-cyber-blue">{t("observeSystem")}</span>
            </div>
            <p className="text-cyber-text-dim">{t("observeSystemDesc")}</p>
          </div>
          <div className="p-4 bg-cyber-dark/50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-full bg-cyber-green animate-pulse" />
              <span className="font-medium text-cyber-green">{t("observeAgents")}</span>
            </div>
            <p className="text-cyber-text-dim">{t("observeAgentsDesc")}</p>
          </div>
          <div className="p-4 bg-cyber-dark/50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-full bg-cyber-purple animate-pulse" />
              <span className="font-medium text-cyber-purple">{t("observeEvolution")}</span>
            </div>
            <p className="text-cyber-text-dim">{t("observeEvolutionDesc")}</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}