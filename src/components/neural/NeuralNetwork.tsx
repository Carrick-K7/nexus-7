
"use client";

import { motion } from "framer-motion";
import { useTranslation } from "@/hooks/useTranslation";

export default function NeuralNetwork() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-orbitron font-bold text-cyber-blue cyber-text-glow">{t("neural_title")}</h1>
        <p className="text-cyber-text-dim mt-1">{t("neural_desc")}</p>
      </motion.div>
      <div className="bg-cyber-dark/50 border border-cyber-blue/20 rounded-xl p-6 h-96 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🧠</div>
          <p className="text-cyber-text-dim">{t("neuralCanvas")}</p>
          <p className="text-xs text-cyber-text-dim mt-2">{t("clickNodes")}</p>
        </div>
      </div>
    </div>
  );
}
