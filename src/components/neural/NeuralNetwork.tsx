
"use client";

import { motion } from "framer-motion";

export default function NeuralNetwork() {
  return (
    <div className="p-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-orbitron font-bold text-cyber-blue cyber-text-glow">NEURAL NETWORK</h1>
        <p className="text-cyber-text-dim mt-1">Central AI processing matrix visualization</p>
      </motion.div>
      <div className="bg-cyber-dark/50 border border-cyber-blue/20 rounded-xl p-6 h-96 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🧠</div>
          <p className="text-cyber-text-dim">Neural Network Canvas - 11 nodes active</p>
          <p className="text-xs text-cyber-text-dim mt-2">Click nodes to view details</p>
        </div>
      </div>
    </div>
  );
}

