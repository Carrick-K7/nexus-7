"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { 
  Trophy, Medal, Star, Award, Zap, Shield, 
  Brain, TrendingUp, CheckCircle, Lock
} from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import type { TranslationKey } from "@/i18n/translations";

interface Achievement {
  id: string;
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
  icon: React.ElementType;
  progress: number;
  maxProgress: number;
  unlocked: boolean;
  rarity: "common" | "rare" | "epic" | "legendary";
  reward: number;
}

const achievementsList: Achievement[] = [
  { id: "a1", titleKey: "achievementFirstLogin", descriptionKey: "achievementFirstLoginDesc", icon: Star, progress: 1, maxProgress: 1, unlocked: true, rarity: "common", reward: 100 },
  { id: "a2", titleKey: "achievementExplorer", descriptionKey: "achievementExplorerDesc", icon: TrendingUp, progress: 8, maxProgress: 21, unlocked: false, rarity: "rare", reward: 500 },
  { id: "a3", titleKey: "achievementSecurityExpert", descriptionKey: "achievementSecurityExpertDesc", icon: Shield, progress: 0, maxProgress: 1, unlocked: false, rarity: "epic", reward: 1000 },
  { id: "a4", titleKey: "achievementAIWhisperer", descriptionKey: "achievementAIWhispererDesc", icon: Brain, progress: 3, maxProgress: 10, unlocked: false, rarity: "rare", reward: 300 },
  { id: "a5", titleKey: "achievementMarketMaster", descriptionKey: "achievementMarketMasterDesc", icon: Trophy, progress: 2, maxProgress: 5, unlocked: false, rarity: "rare", reward: 400 },
  { id: "a6", titleKey: "achievementCityGovernor", descriptionKey: "achievementCityGovernorDesc", icon: Medal, progress: 0, maxProgress: 90, unlocked: false, rarity: "legendary", reward: 5000 },
  { id: "a7", titleKey: "achievementQuickLearner", descriptionKey: "achievementQuickLearnerDesc", icon: Award, progress: 1, maxProgress: 3, unlocked: false, rarity: "common", reward: 200 },
  { id: "a8", titleKey: "achievementSpeedrunner", descriptionKey: "achievementSpeedrunnerDesc", icon: Zap, progress: 0, maxProgress: 1, unlocked: false, rarity: "epic", reward: 800 },
];

export default function AchievementsPanel() {
  const { t } = useTranslation();
  const [achievements] = useState<Achievement[]>(achievementsList);
  const [selectedTab, setSelectedTab] = useState<"all" | "unlocked" | "locked">("all");

  const filteredAchievements = achievements.filter(a => {
    if (selectedTab === "unlocked") return a.unlocked;
    if (selectedTab === "locked") return !a.unlocked;
    return true;
  });

  const totalPoints = achievements.reduce((sum, a) => sum + (a.unlocked ? a.reward : 0), 0);
  const unlockedCount = achievements.filter(a => a.unlocked).length;

  const getRarityColor = (rarity: Achievement["rarity"]) => {
    switch (rarity) {
      case "common": return "text-cyber-gray border-cyber-gray";
      case "rare": return "text-cyber-blue border-cyber-blue";
      case "epic": return "text-cyber-purple border-cyber-purple";
      case "legendary": return "text-cyber-yellow border-cyber-yellow";
    }
  };

  const getRarityBg = (rarity: Achievement["rarity"]) => {
    switch (rarity) {
      case "common": return "bg-cyber-gray/10";
      case "rare": return "bg-cyber-blue/10";
      case "epic": return "bg-cyber-purple/10";
      case "legendary": return "bg-cyber-yellow/10";
    }
  };

  const getRarityLabel = (rarity: Achievement["rarity"]) => {
    const rarityKeys: Record<Achievement["rarity"], TranslationKey> = {
      common: "rarityCommon",
      rare: "rarityRare",
      epic: "rarityEpic",
      legendary: "rarityLegendary",
    };

    return t(rarityKeys[rarity]);
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-cyber-yellow/20 border border-cyber-yellow/30">
            <Trophy className="w-6 h-6 text-cyber-yellow" />
          </div>
          <div>
            <h1 className="text-3xl font-orbitron font-bold text-cyber-yellow cyber-text-glow">
              {t("achievementsTitle")}
            </h1>
            <p className="text-cyber-text-dim mt-1">{t("achievementsDesc")}</p>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="bg-gradient-to-br from-cyber-yellow/20 to-cyber-orange/10 border border-cyber-yellow/30 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-2">
            <Trophy className="w-6 h-6 text-cyber-yellow" />
            <span className="text-sm text-cyber-text-dim">{t("totalPoints")}</span>
          </div>
          <div className="text-4xl font-orbitron font-bold text-cyber-yellow">{totalPoints.toLocaleString()}</div>
        </div>
        <div className="bg-cyber-dark/50 border border-cyber-blue/30 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-2">
            <Award className="w-6 h-6 text-cyber-blue" />
            <span className="text-sm text-cyber-text-dim">{t("unlocked")}</span>
          </div>
          <div className="text-4xl font-orbitron font-bold text-cyber-blue">{unlockedCount}/{achievements.length}</div>
        </div>
        <div className="bg-cyber-dark/50 border border-cyber-purple/30 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-2">
            <Star className="w-6 h-6 text-cyber-purple" />
            <span className="text-sm text-cyber-text-dim">{t("completion")}</span>
          </div>
          <div className="text-4xl font-orbitron font-bold text-cyber-purple">
            {Math.round((unlockedCount / achievements.length) * 100)}%
          </div>
        </div>
        <div className="bg-cyber-dark/50 border border-cyber-green/30 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-2">
            <Zap className="w-6 h-6 text-cyber-green" />
            <span className="text-sm text-cyber-text-dim">{t("availableRewards")}</span>
          </div>
          <div className="text-4xl font-orbitron font-bold text-cyber-green">
            {achievements.filter(a => !a.unlocked).reduce((sum, a) => sum + a.reward, 0).toLocaleString()}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", "unlocked", "locked"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setSelectedTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              selectedTab === tab
                ? "bg-cyber-yellow/20 text-cyber-yellow border border-cyber-yellow/50"
                : "bg-cyber-dark/50 text-cyber-text-dim hover:bg-cyber-gray"
            }`}
          >
            {tab === "all" ? t("all") : tab === "unlocked" ? t("unlocked") : t("locked")} ({tab === "all" ? achievements.length : tab === "unlocked" ? unlockedCount : achievements.length - unlockedCount})
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {filteredAchievements.map((achievement, index) => {
          const Icon = achievement.icon;
          const progressPercent = (achievement.progress / achievement.maxProgress) * 100;
          
          return (
            <motion.div
              key={achievement.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.05 }}
              className={`relative overflow-hidden rounded-xl border-2 ${
                achievement.unlocked 
                  ? `${getRarityColor(achievement.rarity)} ${getRarityBg(achievement.rarity)}` 
                  : "border-cyber-gray/20 bg-cyber-dark/30 opacity-60"
              }`}
            >
              {achievement.unlocked && (
                <div className="absolute top-2 right-2">
                  <CheckCircle className="w-5 h-5 text-cyber-green" />
                </div>
              )}
              
              <div className="p-5">
                <div className="flex items-start gap-4">
                  <div className={`p-3 rounded-lg ${
                    achievement.unlocked ? getRarityBg(achievement.rarity) : "bg-cyber-gray/20"
                  }`}>
                    {achievement.unlocked ? (
                      <Icon className={`w-8 h-8 ${getRarityColor(achievement.rarity)}`} />
                    ) : (
                      <Lock className="w-8 h-8 text-cyber-gray" />
                    )}
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className={`font-orbitron font-bold ${achievement.unlocked ? "text-cyber-text" : "text-cyber-gray"}`}>
                        {t(achievement.titleKey)}
                      </h3>
                      <span className={`text-xs px-2 py-0.5 rounded uppercase font-bold ${
                        achievement.unlocked ? getRarityBg(achievement.rarity) : "bg-cyber-gray/20 text-cyber-gray"
                      } ${achievement.unlocked ? getRarityColor(achievement.rarity) : ""}`}>
                        {getRarityLabel(achievement.rarity)}
                      </span>
                    </div>
                    <p className="text-sm text-cyber-text-dim mb-3">{t(achievement.descriptionKey)}</p>
                    
                    {!achievement.unlocked && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-cyber-text-dim">{t("progress")}</span>
                          <span className="text-cyber-text">{achievement.progress}/{achievement.maxProgress}</span>
                        </div>
                        <div className="h-2 bg-cyber-dark rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${progressPercent}%` }}
                            className="h-full bg-gradient-to-r from-cyber-blue to-cyber-purple"
                          />
                        </div>
                      </div>
                    )}
                    
                    <div className="flex items-center gap-2 mt-3 text-sm">
                      <Zap className="w-4 h-4 text-cyber-yellow" />
                      <span className={achievement.unlocked ? "text-cyber-yellow" : "text-cyber-text-dim"}>
                        {achievement.reward.toLocaleString()} XP
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-cyber-yellow/10 to-cyber-orange/10 border border-cyber-yellow/20 rounded-xl p-6"
      >
        <div className="flex items-center gap-3 mb-4">
          <Star className="w-6 h-6 text-cyber-yellow" />
          <h2 className="text-lg font-orbitron font-bold text-cyber-yellow">{t("achievementTips")}</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 text-sm text-cyber-text-dim">
          <div className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-cyber-green mt-0.5" />
            <span>{t("achievementTipExplore")}</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-cyber-green mt-0.5" />
            <span>{t("achievementTipAria")}</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-cyber-green mt-0.5" />
            <span>{t("achievementTipMissions")}</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
