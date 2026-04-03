"use client";

import { motion } from "framer-motion";
import { useTranslation } from "@/hooks/useTranslation";
import { useState, useEffect } from "react";
import { Newspaper, Radio, AlertTriangle, TrendingUp, Clock } from "lucide-react";

interface NewsItem {
  id: string;
  title: string;
  category: "news" | "alert" | "update";
  timestamp: number;
  content: string;
  priority: "low" | "medium" | "high";
}

const mockNews: NewsItem[] = [
  { id: "1", title: "Neo Downtown Power Grid Upgrade Complete", category: "news", timestamp: Date.now() - 300000, content: "The power grid in Neo Downtown has been successfully upgraded to handle 20% more load.", priority: "low" },
  { id: "2", title: "Security Breach Attempt in Iron Works", category: "alert", timestamp: Date.now() - 600000, content: "Unauthorized access attempt detected and blocked by ATLAS security system.", priority: "high" },
  { id: "3", title: "New Transit Line Opening", category: "update", timestamp: Date.now() - 1200000, content: "Hyperloop transit line connecting Chrome Heights to Silicon Valley II opens tomorrow.", priority: "medium" },
  { id: "4", title: "Air Quality Index Improved", category: "news", timestamp: Date.now() - 1800000, content: "Green Sector air quality improved by 15% following new filtration systems.", priority: "low" },
  { id: "5", title: "Market Volatility Alert", category: "alert", timestamp: Date.now() - 2400000, content: "ECONOMICA reports unusual trading patterns in PWR and DAT markets.", priority: "medium" },
  { id: "6", title: "Satellite NEXUS-12 Maintenance Scheduled", category: "update", timestamp: Date.now() - 3600000, content: "Routine maintenance for NEXUS-12 will occur during off-peak hours.", priority: "low" },
];

export default function NewsPanel() {
  const { t } = useTranslation();
  const [news] = useState<NewsItem[]>(mockNews);
  const [filter, setFilter] = useState<"all" | "news" | "alert" | "update">("all");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const filteredNews = filter === "all" 
    ? news 
    : news.filter(n => n.category === filter);

  const getTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((now - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  const getCategoryIcon = (category: NewsItem["category"]) => {
    switch (category) {
      case "alert": return <AlertTriangle className="w-4 h-4 text-cyber-red" />;
      case "update": return <Radio className="w-4 h-4 text-cyber-blue" />;
      default: return <Newspaper className="w-4 h-4 text-cyber-cyan" />;
    }
  };

  const getPriorityColor = (priority: NewsItem["priority"]) => {
    switch (priority) {
      case "high": return "border-l-cyber-red";
      case "medium": return "border-l-cyber-orange";
      default: return "border-l-cyber-green";
    }
  };

  return (
    <div className="p-6 space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-cyber-cyan/20 border border-cyber-cyan/30">
            <Newspaper className="w-6 h-6 text-cyber-cyan" />
          </div>
          <div>
            <h1 className="text-3xl font-orbitron font-bold text-cyber-cyan cyber-text-glow">
              {t("news_title")}
            </h1>
            <p className="text-cyber-text-dim mt-1">{t("latestUpdates")}</p>
          </div>
        </div>
      </motion.div>

      <div className="flex gap-2">
        {(["all", "news", "alert", "update"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === f
                ? "bg-cyber-cyan/20 text-cyber-cyan border border-cyber-cyan/50"
                : "bg-cyber-dark/50 text-cyber-text-dim hover:bg-cyber-gray"
            }`}
          >
            {f === "all" ? t("all") : f === "alert" ? t("warning") : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filteredNews.map((item, index) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            className={`bg-cyber-dark/50 border border-cyber-blue/20 rounded-lg p-4 border-l-4 ${getPriorityColor(item.priority)} hover:border-cyber-blue/40 transition-colors`}
          >
            <div className="flex items-start gap-3">
              {getCategoryIcon(item.category)}
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-cyber-text font-medium">{item.title}</h3>
                  <div className="flex items-center gap-2 text-cyber-text-dim text-xs">
                    <Clock className="w-3 h-3" />
                    {getTimeAgo(item.timestamp)}
                  </div>
                </div>
                <p className="text-cyber-text-dim text-sm">{item.content}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-cyber-cyan/10 to-cyber-blue/10 border border-cyber-cyan/20 rounded-xl p-4"
      >
        <div className="flex items-center gap-3">
          <TrendingUp className="w-5 h-5 text-cyber-green" />
          <div>
            <p className="text-cyber-text font-medium">{t('cityHappinessIndex')}</p>
            <p className="text-cyber-text-dim text-sm">{t('cityHappinessChange')}</p>
          </div>
          <div className="ml-auto text-2xl font-orbitron font-bold text-cyber-green">72%</div>
        </div>
      </motion.div>
    </div>
  );
}
