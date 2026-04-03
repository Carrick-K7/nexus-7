"use client";

import { motion } from "framer-motion";
import { useTranslation } from "@/hooks/useTranslation";
import { useState, useEffect } from "react";
import { 
  Zap, Droplets, Wheat, Coins, Factory, 
  Truck, Heart, Shield, TrendingUp, TrendingDown
} from "lucide-react";

interface Resource {
  id: string;
  name: string;
  icon: typeof Zap;
  current: number;
  max: number;
  rate: number;
  color: string;
}

export default function ResourceManagement() {
  const { t } = useTranslation();
  const [resources, setResources] = useState<Resource[]>([
    { id: "power", name: "Power Grid", icon: Zap, current: 8472, max: 10000, rate: 12, color: "cyber-yellow" },
    { id: "water", name: "Water Supply", icon: Droplets, current: 7823, max: 10000, rate: -5, color: "cyber-blue" },
    { id: "food", name: "Food Reserves", icon: Wheat, current: 5234, max: 8000, rate: 8, color: "cyber-green" },
    { id: "credits", name: "City Credits", icon: Coins, current: 2.4, max: 10, rate: 0.3, color: "cyber-purple" },
    { id: "energy", name: "Energy Cells", icon: Zap, current: 3456, max: 5000, rate: -2, color: "cyber-orange" },
    { id: "materials", name: "Raw Materials", icon: Factory, current: 6789, max: 10000, rate: 15, color: "cyber-gray" },
  ]);

  useEffect(() => {
    const interval = setInterval(() => {
      setResources(prev => prev.map(r => ({
        ...r,
        current: Math.max(0, Math.min(r.max, r.current + r.rate * 0.1)),
      })));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-6 space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-cyber-orange/20 border border-cyber-orange/30">
            <Factory className="w-6 h-6 text-cyber-orange" />
          </div>
          <div>
            <h1 className="text-3xl font-orbitron font-bold text-cyber-orange cyber-text-glow">
              {t("resourceManagement")}
            </h1>
            <p className="text-cyber-text-dim mt-1">{t("resourceManagementDesc")}</p>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-3 gap-4">
        {resources.map((resource, index) => {
          const Icon = resource.icon;
          const percentage = (resource.current / resource.max) * 100;
          const isLow = percentage < 25;
          const isSurplus = resource.rate > 0;

          return (
            <motion.div
              key={resource.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`bg-cyber-dark/50 border rounded-xl p-4 ${
                isLow ? "border-cyber-red/50" : "border-cyber-blue/20"
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Icon className={`w-5 h-5 text-${resource.color}`} />
                  <span className="text-sm font-medium text-cyber-text">{resource.name}</span>
                </div>
                <div className={`flex items-center gap-1 text-xs ${isSurplus ? "text-cyber-green" : "text-cyber-red"}`}>
                  {isSurplus ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {Math.abs(resource.rate)}/s
                </div>
              </div>

              <div className="mb-2">
                <div className="flex justify-between text-xs text-cyber-text-dim mb-1">
                  <span>{t("storage")}</span>
                  <span>{Math.round(resource.current).toLocaleString()} / {resource.max.toLocaleString()}</span>
                </div>
                <div className={`h-2 rounded-full overflow-hidden ${isLow ? "bg-cyber-red/30" : "bg-cyber-gray"}`}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${percentage}%` }}
                    transition={{ delay: 0.2 + index * 0.1, duration: 0.5 }}
                    className={`h-full rounded-full ${
                      percentage > 75 ? "bg-cyber-green" :
                      percentage > 50 ? "bg-cyber-yellow" :
                      percentage > 25 ? "bg-cyber-orange" : "bg-cyber-red"
                    }`}
                    style={{
                      boxShadow: `0 0 10px ${
                        percentage > 75 ? "#00ff88" :
                        percentage > 50 ? "#f0ff00" :
                        percentage > 25 ? "#ff8c00" : "#ff3333"
                      }`
                    }}
                  />
                </div>
              </div>

              <div className="flex justify-between text-xs">
                <span className="text-cyber-text-dim">{t("capacity")}</span>
                <span className={percentage > 75 ? "text-cyber-green" : percentage > 50 ? "text-cyber-yellow" : percentage > 25 ? "text-cyber-orange" : "text-cyber-red"}>
                  {percentage.toFixed(1)}%
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="bg-cyber-dark/50 border border-cyber-blue/20 rounded-xl p-6"
      >
        <h3 className="text-lg font-orbitron text-cyber-text mb-4">{t("resourceDistribution")}</h3>
        <div className="space-y-3">
          {[
            { label: t("residential"), value: 35, color: "cyber-purple" },
            { label: t("industrial"), value: 28, color: "cyber-orange" },
            { label: t("commercial"), value: 22, color: "cyber-blue" },
            { label: t("infraDistribution"), value: 15, color: "cyber-green" },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-4">
              <div className="w-24 text-xs text-cyber-text-dim">{item.label}</div>
              <div className="flex-1 h-4 bg-cyber-gray rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${item.value}%` }}
                  transition={{ delay: 0.7, duration: 0.8 }}
                  className={`h-full bg-gradient-to-r from-${item.color} to-${item.color}/50`}
                />
              </div>
              <div className="w-12 text-xs text-cyber-text text-right">{item.value}%</div>
            </div>
          ))}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
        className="grid grid-cols-4 gap-4"
      >
        <div className="bg-gradient-to-r from-cyber-yellow/10 to-transparent border border-cyber-yellow/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Truck className="w-5 h-5 text-cyber-yellow" />
            <span className="text-sm text-cyber-text-dim">{t("supplyConvoys")}</span>
          </div>
          <div className="text-2xl font-orbitron font-bold text-cyber-yellow">12</div>
        </div>

        <div className="bg-gradient-to-r from-cyber-green/10 to-transparent border border-cyber-green/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Heart className="w-5 h-5 text-cyber-green" />
            <span className="text-sm text-cyber-text-dim">{t("citizenSatisfaction")}</span>
          </div>
          <div className="text-2xl font-orbitron font-bold text-cyber-green">78%</div>
        </div>

        <div className="bg-gradient-to-r from-cyber-blue/10 to-transparent border border-cyber-blue/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-5 h-5 text-cyber-blue" />
            <span className="text-sm text-cyber-text-dim">{t("resourceSecurity")}</span>
          </div>
          <div className="text-2xl font-orbitron font-bold text-cyber-blue">94%</div>
        </div>

        <div className="bg-gradient-to-r from-cyber-purple/10 to-transparent border border-cyber-purple/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-5 h-5 text-cyber-purple" />
            <span className="text-sm text-cyber-text-dim">{t("efficiency")}</span>
          </div>
          <div className="text-2xl font-orbitron font-bold text-cyber-purple">87%</div>
        </div>
      </motion.div>
    </div>
  );
}
