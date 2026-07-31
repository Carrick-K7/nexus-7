"use client";

import { useNexusStore } from "@/stores/nexus-store";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useEffect } from "react";
import { Bot, Send, Sparkles, User, Volume2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

const quickQuestions = [
  "Show city status report",
  "Analyze traffic patterns",
  "Recommend optimal energy distribution",
  "Explain the last coordinator decision",
];

export default function AIAssistant() {
  const {
    ariaMessages,
    addAriaMessage,
    aiAgents,
    cityStats,
    simulation,
    modelRuntime,
    pauseSimulation,
    resumeSimulation,
  } = useNexusStore();
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);

  const aria = aiAgents.find(a => a.id === "aria")!;

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: "smooth" });
  }, [ariaMessages]);

  const handleSend = async (text: string) => {
    if (!text.trim()) return;
    addAriaMessage({ role: "user", content: text });
    setInput("");
    setIsTyping(true);
    const normalized = text.toLowerCase();
    setTimeout(() => {
      const latestDecision = [...simulation.events]
        .reverse()
        .find((event) => event.type === "coordinator.decision");
      const scheduled = Array.isArray(latestDecision?.payload.scheduled)
        ? latestDecision.payload.scheduled
        : [];
      const rejected = Array.isArray(latestDecision?.payload.rejected)
        ? latestDecision.payload.rejected
        : [];
      let response = `Analyzing current city data at tick ${simulation.world.tick}. Energy ${cityStats.energy.toFixed(1)}%, traffic ${cityStats.traffic.toFixed(1)}%, crime ${cityStats.crime.toFixed(1)}%, happiness ${cityStats.happiness.toFixed(1)}%.`;

      if (normalized.includes("pause")) {
        pauseSimulation();
        response = `Simulation paused at tick ${simulation.world.tick}. No further autonomous commands will be scheduled until resumed.`;
      } else if (normalized.includes("resume")) {
        resumeSimulation();
        response = `Simulation resumed from tick ${simulation.world.tick}. ARIA coordination and agent budgets are active.`;
      } else if (
        normalized.includes("why") ||
        normalized.includes("decision") ||
        normalized.includes("coordinator")
      ) {
        response = latestDecision
          ? `At tick ${latestDecision.tick}, ARIA reviewed ${String(latestDecision.payload.observationCount)} observations and ${String(latestDecision.payload.proposalCount)} proposals. ${scheduled.length} command(s) were scheduled and ${rejected.length} rejected by cooldown, budget, risk, or conflict rules.`
          : "No coordinator decision has been recorded yet. Advance the simulation to create one.";
      } else if (normalized.includes("traffic")) {
        response = `Traffic is ${cityStats.traffic.toFixed(1)}%. CIVITAS may propose a bounded reroute when its policy observes congestion, subject to cooldown and command budget.`;
      } else if (normalized.includes("energy")) {
        response = `Energy availability is ${cityStats.energy.toFixed(1)}%. CIVITAS has authority to adjust energy within guardrail limits; ARIA resolves competing proposals.`;
      }

      addAriaMessage({ role: "aria", content: response });
      setIsTyping(false);
    }, 500);
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-orbitron font-bold text-cyber-pink cyber-text-glow">{t('aria_title')}</h1>
        <p className="text-cyber-text-dim mt-1">{t('aria_desc')}</p>
      </motion.div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-4">
        <div className="xl:col-span-3">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="bg-cyber-dark/50 border border-cyber-blue/20 rounded-xl overflow-hidden h-[500px] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 bg-cyber-dark/80 border-b border-cyber-blue/20">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyber-pink to-cyber-purple flex items-center justify-center">
                    <Bot className="w-5 h-5 text-white" />
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-cyber-green border-2 border-cyber-dark" />
                </div>
                <div>
                  <div className="font-medium text-cyber-text">ARIA</div>
                  <div className="text-xs text-cyber-text-dim">{t('ariaActive')} {aria.mood}%</div>
                </div>
              </div>
              <button className="p-2 rounded hover:bg-cyber-gray transition-colors">
                <Volume2 className="w-4 h-4 text-cyber-text-dim" />
              </button>
            </div>

            <div ref={messagesRef} className="flex-1 overflow-y-auto p-4 space-y-4">
              <AnimatePresence>
                {ariaMessages.length === 0 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-8">
                    <Sparkles className="w-12 h-12 text-cyber-pink mx-auto mb-3" />
                    <p className="text-cyber-text-dim">{t('ariaReady')}</p>
                  </motion.div>
                )}
                {ariaMessages.map((msg) => (
                  <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                    {msg.role === "aria" && (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyber-pink to-cyber-purple flex items-center justify-center flex-shrink-0">
                        <Bot className="w-4 h-4 text-white" />
                      </div>
                    )}
                    <div className={`max-w-[70%] rounded-xl px-4 py-3 ${
                      msg.role === "aria" ? "bg-cyber-gray/50 text-cyber-text" : "bg-cyber-blue/20 text-cyber-text"
                    }`}>
                      <p className="text-sm">{msg.content}</p>
                      <p className="text-xs text-cyber-text-dim mt-1">{new Date(msg.timestamp).toLocaleTimeString()}</p>
                    </div>
                    {msg.role === "user" && (
                      <div className="w-8 h-8 rounded-full bg-cyber-blue flex items-center justify-center flex-shrink-0">
                        <User className="w-4 h-4 text-white" />
                      </div>
                    )}
                  </motion.div>
                ))}
                {isTyping && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyber-pink to-cyber-purple flex items-center justify-center">
                      <Bot className="w-4 h-4 text-white" />
                    </div>
                    <div className="bg-cyber-gray/50 rounded-xl px-4 py-3">
                      <div className="flex gap-1">
                        <motion.div animate={{ y: [0, -5, 0] }} transition={{ duration: 0.5, repeat: Infinity }} className="w-2 h-2 bg-cyber-pink rounded-full" />
                        <motion.div animate={{ y: [0, -5, 0] }} transition={{ duration: 0.5, repeat: Infinity, delay: 0.1 }} className="w-2 h-2 bg-cyber-pink rounded-full" />
                        <motion.div animate={{ y: [0, -5, 0] }} transition={{ duration: 0.5, repeat: Infinity, delay: 0.2 }} className="w-2 h-2 bg-cyber-pink rounded-full" />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="p-4 border-t border-cyber-blue/20">
              <div className="flex gap-2 mb-3 overflow-x-auto pb-2">
                {quickQuestions.map((q, i) => (
                  <button key={i} onClick={() => handleSend(q)}
                    className="flex-shrink-0 px-3 py-1.5 bg-cyber-gray/50 border border-cyber-blue/20 rounded-full text-xs text-cyber-text-dim hover:bg-cyber-gray hover:text-cyber-text transition-colors">
                    {q}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input type="text" value={input} onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend(input)}
                  placeholder={t('askAria')}
                  className="flex-1 px-4 py-2 bg-cyber-gray border border-cyber-blue/20 rounded-lg text-sm text-cyber-text placeholder-cyber-text-dim focus:outline-none focus:border-cyber-blue/50" />
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                  onClick={() => handleSend(input)}
                  className="px-4 py-2 bg-cyber-pink rounded-lg hover:bg-cyber-pink/80 transition-colors">
                  <Send className="w-4 h-4 text-white" />
                </motion.button>
              </div>
            </div>
          </motion.div>
        </div>

        <div className="space-y-4">
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}
            className="bg-cyber-dark/50 border border-cyber-blue/20 rounded-xl p-4">
            <h3 className="text-sm font-orbitron text-cyber-text mb-3">{t('aria_title')} Status</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-cyber-text-dim">{t('ariaMood')}</span>
                <span className="text-sm text-cyber-pink">{aria.mood}%</span>
              </div>
              <div className="h-1.5 bg-cyber-gray rounded-full overflow-hidden">
                <div className="h-full bg-cyber-pink" style={{ width: `${aria.mood}%` }} />
              </div>
              <div className="border-t border-cyber-gray/30 pt-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-cyber-text-dim">{t("globalCommandBudget")}</span>
                  <span className="text-cyber-blue">
                    {simulation.configuration.agentRuntime?.globalCommandBudget ?? 2}/tick
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-cyber-text-dim">{t("policyVersion")}</span>
                  <code className="text-cyber-blue">{simulation.policyVersion}</code>
                </div>
                {modelRuntime.lastExecution && (
                  <div className="mt-3 space-y-2 border-t border-cyber-gray/30 pt-3 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-cyber-text-dim">{t("modelProvider")}</span>
                      <code className="truncate text-cyber-blue">
                        {modelRuntime.lastExecution.providerId}/{modelRuntime.lastExecution.model}
                      </code>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-cyber-text-dim">{t("modelUsage")}</span>
                      <span className="text-cyber-text">
                        {modelRuntime.lastExecution.usage.tokenCount} tok · $
                        {modelRuntime.lastExecution.usage.costUsd.toFixed(4)} ·{" "}
                        {modelRuntime.lastExecution.usage.latencyMs}ms
                      </span>
                    </div>
                    {modelRuntime.lastExecution.fallbackReason && (
                      <p className="text-cyber-yellow">
                        {t("fallback")}: {modelRuntime.lastExecution.fallbackReason}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
