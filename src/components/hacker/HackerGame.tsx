"use client";

import { motion } from "framer-motion";
import { useState, useEffect, useRef } from "react";
import { Terminal, Shield, Lock, Unlock, Zap, Cpu, Wifi, AlertTriangle, CheckCircle, XCircle } from "lucide-react";

interface FirewallNode {
  id: string;
  strength: number;
  type: "firewall" | "encoder" | "decryptor" | "honeypot";
  compromised: boolean;
}

interface HackTarget {
  id: string;
  name: string;
  security: number;
  progress: number;
  reward: number;
  nodes: FirewallNode[];
  status: "locked" | "in_progress" | "compromised" | "failed";
}

const initialTargets: HackTarget[] = [
  { id: "t1", name: "Megacorp Alpha", security: 30, progress: 0, reward: 5000, status: "locked", nodes: [
    { id: "n1", strength: 20, type: "firewall", compromised: false },
    { id: "n2", strength: 15, type: "encoder", compromised: false },
    { id: "n3", strength: 10, type: "honeypot", compromised: false },
  ]},
  { id: "t2", name: "Nexus Financial", security: 55, progress: 0, reward: 15000, status: "locked", nodes: [
    { id: "n4", strength: 30, type: "firewall", compromised: false },
    { id: "n5", strength: 25, type: "decryptor", compromised: false },
    { id: "n6", strength: 20, type: "encoder", compromised: false },
    { id: "n7", strength: 15, type: "honeypot", compromised: false },
  ]},
  { id: "t3", name: "Black Market DB", security: 80, progress: 0, reward: 50000, status: "locked", nodes: [
    { id: "n8", strength: 50, type: "firewall", compromised: false },
    { id: "n9", strength: 40, type: "decryptor", compromised: false },
    { id: "n10", strength: 35, type: "encoder", compromised: false },
    { id: "n11", strength: 30, type: "honeypot", compromised: false },
    { id: "n12", strength: 25, type: "firewall", compromised: false },
  ]},
];

export default function HackerGame() {
  const [targets, setTargets] = useState<HackTarget[]>(initialTargets);
  const [activeTarget, setActiveTarget] = useState<HackTarget | null>(null);
  const [hackPower, setHackPower] = useState(10);
  const [resources, setResources] = useState({ money: 1000, exp: 0, level: 1 });
  const [log, setLog] = useState<string[]>(["Initializing hack toolkit...", "WARNING: Unauthorized access detected", " countermeasures active"]);
  const [isHacking, setIsHacking] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [log]);

  useEffect(() => {
    if (!isHacking || !activeTarget) return;

    const interval = setInterval(() => {
      const nodeIndex = activeTarget.nodes.findIndex(n => !n.compromised);
      if (nodeIndex === -1) {
        setTargets(prev => prev.map(t => t.id === activeTarget.id ? { ...t, status: "compromised", progress: 100 } : t));
        setLog(prev => [...prev, `ALERT: ${activeTarget.name} COMPROMISED!`, `Reward: $${activeTarget.reward.toLocaleString()}`, `Experience gained: +${activeTarget.security * 10}`]);
        setResources(prev => ({ ...prev, money: prev.money + activeTarget.reward, exp: prev.exp + activeTarget.security * 10 }));
        setActiveTarget(null);
        setIsHacking(false);
        return;
      }

      const node = activeTarget.nodes[nodeIndex];
      const damage = hackPower * (0.5 + Math.random() * 0.5);
      const newStrength = Math.max(0, node.strength - damage);

      if (newStrength <= 0) {
        setActiveTarget(prev => {
          if (!prev) return null;
          const newNodes = prev.nodes.map((n, i) => i === nodeIndex ? { ...n, compromised: true } : n);
          const newProgress = (prev.nodes.filter((n, i) => i <= nodeIndex || n.compromised).length / prev.nodes.length) * 100;
          return { ...prev, nodes: newNodes, progress: newProgress };
        });
        setLog(prev => [...prev, `Node ${node.id} BREACHED!`, `${node.type.toUpperCase()} compromised`]);
      } else {
        setActiveTarget(prev => {
          if (!prev) return null;
          const newNodes = prev.nodes.map((n, i) => i === nodeIndex ? { ...n, strength: newStrength } : n);
          const compromisedCount = newNodes.filter(n => n.compromised).length;
          const newProgress = ((compromisedCount * 100) + ((100 - newStrength) / prev.nodes.length)) / prev.nodes.length;
          return { ...prev, nodes: newNodes, progress: newProgress };
        });
        setLog(prev => [...prev, `Attacking ${node.type}... ${Math.round(newStrength)}% integrity remaining`]);
      }

      if (Math.random() < 0.1) {
        setLog(prev => [...prev, "WARNING: Intrusion detection threshold approaching"]);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [isHacking, activeTarget, hackPower]);

  const startHack = (target: HackTarget) => {
    if (target.status !== "locked") return;
    setLog(prev => [...prev, `Initiating hack sequence on ${target.name}...`, `Security level: ${target.security}`, "Decrypting packets..."]);
    setTargets(prev => prev.map(t => t.id === target.id ? { ...t, status: "in_progress" } : t));
    setActiveTarget({ ...target, nodes: target.nodes.map(n => ({ ...n })) });
    setIsHacking(true);
  };

  const upgradePower = () => {
    const cost = hackPower * 500;
    if (resources.money >= cost) {
      setResources(prev => ({ ...prev, money: prev.money - cost }));
      setHackPower(prev => prev + 5);
      setLog(prev => [...prev, `Hack power upgraded to ${hackPower + 5}`, `$${cost.toLocaleString()} deducted`]);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-orbitron font-bold text-cyber-green cyber-text-glow">HACKING INTERFACE</h1>
        <p className="text-cyber-text-dim mt-1">Breach security systems and extract data</p>
      </motion.div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Hack Power", value: hackPower, color: "cyber-green" },
          { label: "Credits", value: `$${resources.money.toLocaleString()}`, color: "cyber-yellow" },
          { label: "Experience", value: resources.exp, color: "cyber-purple" },
          { label: "Level", value: resources.level, color: "cyber-blue" },
        ].map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
            className="bg-cyber-dark/50 border border-cyber-blue/20 rounded-xl p-4">
            <span className="text-xs text-cyber-text-dim">{stat.label}</span>
            <div className={`text-xl font-bold text-${stat.color}`}>{stat.value}</div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="bg-cyber-dark/50 border border-cyber-blue/20 rounded-xl p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-orbitron text-cyber-text">Target Systems</h3>
              <button onClick={upgradePower} className="px-3 py-1 bg-cyber-green/20 border border-cyber-green/30 rounded text-xs text-cyber-green hover:bg-cyber-green/30">
                Upgrade Power (${hackPower * 500})
              </button>
            </div>
            <div className="space-y-2">
              {targets.map((target) => (
                <div key={target.id} className={`p-4 rounded-lg border transition-all ${
                  target.status === "compromised" ? "bg-cyber-green/10 border-cyber-green/30" :
                  target.status === "in_progress" ? "bg-cyber-red/10 border-cyber-red/30" :
                  "bg-cyber-gray/30 border-cyber-blue/20 hover:border-cyber-blue/40"
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {target.status === "compromised" ? <CheckCircle className="w-5 h-5 text-cyber-green" /> :
                       target.status === "in_progress" ? <Zap className="w-5 h-5 text-cyber-red animate-pulse" /> :
                       <Lock className="w-5 h-5 text-cyber-text-dim" />}
                      <span className="font-medium text-cyber-text">{target.name}</span>
                    </div>
                    <span className="text-sm text-cyber-yellow">${target.reward.toLocaleString()}</span>
                  </div>
                  {target.status === "locked" && (
                    <button onClick={() => startHack(target)}
                      className="w-full py-2 bg-cyber-red/20 border border-cyber-red/50 rounded text-sm text-cyber-red hover:bg-cyber-red/30">
                      BREACH SECURITY ({target.security}%)
                    </button>
                  )}
                  {target.status === "in_progress" && activeTarget?.id === target.id && (
                    <div>
                      <div className="flex justify-between text-xs text-cyber-text-dim mb-1">
                        <span>Breach Progress</span>
                        <span>{Math.round(activeTarget.progress)}%</span>
                      </div>
                      <div className="h-2 bg-cyber-gray rounded-full overflow-hidden">
                        <motion.div initial={{ width: 0 }} animate={{ width: `${activeTarget.progress}%` }}
                          className="h-full bg-cyber-red" />
                      </div>
                      <div className="mt-2 flex gap-1">
                        {activeTarget.nodes.map((node, i) => (
                          <div key={node.id} className={`flex-1 h-1 rounded ${node.compromised ? "bg-cyber-green" : "bg-cyber-gray"}`} />
                        ))}
                      </div>
                    </div>
                  )}
                  {target.status === "compromised" && (
                    <div className="text-sm text-cyber-green">System compromised - Reward claimed</div>
                  )}
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            ref={logRef}
            className="bg-cyber-darker border border-cyber-green/30 rounded-xl p-4 h-48 overflow-y-auto font-mono text-xs">
            {log.map((line, i) => (
              <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                transition={{ delay: i * 0.05 }}
                className={line.includes("WARNING") ? "text-cyber-orange" : line.includes("ALERT") ? "text-cyber-red" : "text-cyber-green"}>
                {line}
              </motion.div>
            ))}
          </motion.div>
        </div>

        <div className="space-y-4">
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}
            className="bg-cyber-dark/50 border border-cyber-blue/20 rounded-xl p-4">
            <h3 className="text-sm font-orbitron text-cyber-text mb-3">Active Target</h3>
            {activeTarget ? (
              <div className="space-y-3">
                <div className="text-lg font-bold text-cyber-red">{activeTarget.name}</div>
                <div className="space-y-1">
                  {activeTarget.nodes.map((node) => (
                    <div key={node.id} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1">
                        {node.type === "firewall" && <Shield className="w-3 h-3 text-cyber-blue" />}
                        {node.type === "encoder" && <Lock className="w-3 h-3 text-cyber-purple" />}
                        {node.type === "decryptor" && <Unlock className="w-3 h-3 text-cyber-yellow" />}
                        {node.type === "honeypot" && <AlertTriangle className="w-3 h-3 text-cyber-red" />}
                        <span className="text-cyber-text">{node.type.toUpperCase()}</span>
                      </div>
                      {node.compromised ? (
                        <span className="text-cyber-green">BREACHED</span>
                      ) : (
                        <div className="flex items-center gap-1">
                          <div className="w-16 h-1 bg-cyber-gray rounded-full overflow-hidden">
                            <div className="h-full bg-cyber-red" style={{ width: `${node.strength}%` }} />
                          </div>
                          <span className="text-cyber-text-dim">{node.strength}%</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center text-cyber-text-dim py-4">No active target</div>
            )}
          </motion.div>

          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 }}
            className="bg-cyber-dark/50 border border-cyber-blue/20 rounded-xl p-4">
            <h3 className="text-sm font-orbitron text-cyber-text mb-3">System Stats</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-cyber-text-dim">Bots Online</span><span className="text-cyber-green">12</span></div>
              <div className="flex justify-between"><span className="text-cyber-text-dim">IP Trace</span><span className="text-cyber-yellow">37%</span></div>
              <div className="flex justify-between"><span className="text-cyber-text-dim">Detection</span><span className="text-cyber-red">LOW</span></div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}