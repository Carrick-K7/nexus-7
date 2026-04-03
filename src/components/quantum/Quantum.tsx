"use client";

import { useNexusStore } from "@/stores/nexus-store";
import { motion } from "framer-motion";
import { useMemo } from "react";
import { Atom, Lock, Activity, Circle } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

export default function Quantum() {
  const { qubits, setQubits } = useNexusStore();
  const { t } = useTranslation();

  const entanglements = useMemo(() => {
    const newEntanglements: [number, number][] = [];
    qubits.forEach(q => {
      q.entangled.forEach(e => {
        if (q.id < e) newEntanglements.push([q.id, e]);
      });
    });
    return newEntanglements;
  }, [qubits]);

  const superpositionCount = useMemo(() => 
    qubits.filter(q => q.state === "superposition").length,
  [qubits]);

  const toggleQubit = (id: number) => {
    setQubits(qubits.map(q => {
      if (q.id === id) {
        return { ...q, state: q.state === "superposition" ? (Math.random() > 0.5 ? 0 : 1) as 0 | 1 : "superposition" };
      }
      return q;
    }));
  };

  return (
    <div className="p-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-orbitron font-bold text-cyber-purple cyber-text-glow">{t('quantum_title')}</h1>
        <p className="text-cyber-text-dim mt-1">{t('quantum_desc')}</p>
      </motion.div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: t('qubits'), value: qubits.length, icon: Circle, color: "cyber-blue" },
          { label: t('superposition'), value: superpositionCount, icon: Atom, color: "cyber-purple" },
          { label: t('entanglements'), value: entanglements.length, icon: Lock, color: "cyber-pink" },
          { label: t('coherence'), value: "94%", icon: Activity, color: "cyber-green" },
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

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="bg-cyber-dark/50 border border-cyber-blue/20 rounded-xl p-6">
            <h3 className="text-lg font-orbitron text-cyber-text mb-6">{t('quantumBitViz')}</h3>
            <div className="relative h-80">
              <svg className="w-full h-full" viewBox="0 0 800 300">
                {entanglements.map(([a, b]) => {
                  const x1 = 100 + a * 90;
                  const x2 = 100 + b * 90;
                  return (
                    <motion.line key={`${a}-${b}`} x1={x1} y1={150} x2={x2} y2={150}
                      initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                      stroke="#00f0ff" strokeWidth="2" strokeDasharray="5,5" opacity="0.6" />
                  );
                })}
                {qubits.map((qubit, i) => {
                  const x = 100 + i * 90;
                  return (
                    <g key={qubit.id}>
                      <motion.circle cx={x} cy={150} r="35"
                        fill={qubit.state === "superposition" ? "#b829ff" : qubit.state === 1 ? "#00f0ff" : "#ff3333"}
                        initial={{ scale: 0 }} animate={{ scale: 1 }}
                        whileHover={{ scale: 1.1 }}
                        onClick={() => toggleQubit(qubit.id)}
                        style={{ cursor: "pointer" }}
                      />
                      {qubit.state === "superposition" && (
                        <motion.circle cx={x} cy={150} r="45" fill="none" stroke="#b829ff" strokeWidth="2"
                          initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1.5, opacity: 0 }} transition={{ duration: 1, repeat: Infinity }} />
                      )}
                      <text x={x} y={155} textAnchor="middle" fill="white" fontSize="14" fontFamily="monospace">
                        {qubit.state === "superposition" ? "?" : qubit.state}
                      </text>
                      <text x={x} y={210} textAnchor="middle" fill="#888899" fontSize="10" fontFamily="monospace">
                        Q{qubit.id}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
            <div className="flex gap-4 mt-4">
              <div className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 rounded-full bg-cyber-blue" />
                <span className="text-cyber-text-dim">{t('state0')}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 rounded-full bg-cyber-red" />
                <span className="text-cyber-text-dim">{t('state1')}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 rounded-full bg-cyber-purple" />
                <span className="text-cyber-text-dim">{t('superposition')}</span>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => qubits.forEach((_, i) => toggleQubit(i))}
                className="px-4 py-2 bg-cyber-purple/20 border border-cyber-purple/50 rounded text-sm text-cyber-purple hover:bg-cyber-purple/30 transition-colors">
                {t('toggleAll')}
              </button>
              <button onClick={() => setQubits(qubits.map(q => ({ ...q, entangled: q.id < 7 ? [q.id + 1] : [] })))}
                className="px-4 py-2 bg-cyber-blue/20 border border-cyber-blue/50 rounded text-sm text-cyber-blue hover:bg-cyber-blue/30 transition-colors">
                {t('createEntanglements')}
              </button>
            </div>
          </motion.div>
        </div>

        <div className="space-y-4">
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}
            className="bg-cyber-dark/50 border border-cyber-blue/20 rounded-xl p-4">
            <h3 className="text-sm font-orbitron text-cyber-text mb-3">{t('quantumGates')}</h3>
            <div className="grid grid-cols-3 gap-2">
              {["H", "X", "Y", "Z", "CNOT", "SWAP"].map((gate) => (
                <button key={gate} className="py-2 bg-cyber-gray/50 border border-cyber-blue/20 rounded text-sm text-cyber-text hover:bg-cyber-gray hover:border-cyber-blue/40 transition-colors font-mono">
                  {gate}
                </button>
              ))}
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}
            className="bg-cyber-dark/50 border border-cyber-blue/20 rounded-xl p-4">
            <h3 className="text-sm font-orbitron text-cyber-text mb-3">{t('processingPower')}</h3>
            <div className="text-center py-4">
              <div className="text-3xl font-bold text-cyber-purple">2^8</div>
              <div className="text-xs text-cyber-text-dim">= 256 {t('possibleStates')}</div>
            </div>
            <div className="mt-2 h-2 bg-cyber-gray rounded-full overflow-hidden">
              <motion.div initial={{ width: 0 }} animate={{ width: "35%" }} className="h-full bg-cyber-purple" />
            </div>
            <div className="text-xs text-cyber-text-dim mt-1">35% {t('utilization')}</div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}