"use client";

import { useNexusStore } from "@/stores/nexus-store";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useEffect } from "react";
import { Bot, Send, Sparkles, User, Volume2 } from "lucide-react";

const quickQuestions = [
  "Show city status report",
  "Analyze traffic patterns",
  "Recommend optimal energy distribution",
];

export default function AIAssistant() {
  const { ariaMessages, addAriaMessage, aiAgents } = useNexusStore();
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
    setTimeout(() => {
      const responses = [
        "Analyzing current city data... Traffic patterns show a 12% increase in downtown area.",
        "Energy grid analysis complete. Solar output is at 78% capacity.",
        "Threat assessment updated. Iron Works district shows elevated risk.",
        "Processing your request... The city is operating at 87% efficiency.",
      ];
      const response = responses[Math.floor(Math.random() * responses.length)];
      addAriaMessage({ role: "aria", content: response });
      setIsTyping(false);
    }, 1500 + Math.random() * 1000);
  };

  return (
    <div className="p-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-orbitron font-bold text-cyber-pink cyber-text-glow">ARIA</h1>
        <p className="text-cyber-text-dim mt-1">Advanced Reasoning and Intelligence Assistant</p>
      </motion.div>

      <div className="grid grid-cols-4 gap-6">
        <div className="col-span-3">
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
                  <div className="text-xs text-cyber-text-dim">Active | Mood: {aria.mood}%</div>
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
                    <p className="text-cyber-text-dim">ARIA is ready to assist you.</p>
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
                  placeholder="Ask ARIA anything..."
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
            <h3 className="text-sm font-orbitron text-cyber-text mb-3">ARIA Status</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-cyber-text-dim">Mood</span>
                <span className="text-sm text-cyber-pink">{aria.mood}%</span>
              </div>
              <div className="h-1.5 bg-cyber-gray rounded-full overflow-hidden">
                <div className="h-full bg-cyber-pink" style={{ width: `${aria.mood}%` }} />
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}