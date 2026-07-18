"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer } from "recharts";
import { useTranslation } from "@/hooks/useTranslation";
import { useNexusStore } from "@/stores/nexus-store";
import { randomUnit } from "@/simulation";
import type { TranslationKey } from "@/i18n/translations";
import type { CityStats, TradeAsset } from "@/types";

function getMarketFactor(symbol: string, stats: CityStats): number {
  switch (symbol) {
    case "PWR":
    case "NRG":
      return stats.energy / 78;
    case "DAT":
      return stats.internet / 94;
    case "MAT":
      return (100 - stats.pollution) / 66;
    case "CHP":
      return stats.medical / 85;
    default:
      return 1;
  }
}

function projectAsset(asset: TradeAsset, stats: CityStats) {
  const price = Math.round(asset.price * getMarketFactor(asset.symbol, stats) * 100) / 100;
  const change = Math.round((price - asset.price) * 100) / 100;
  const changePercent = Math.round((change / asset.price) * 10_000) / 100;

  return { ...asset, price, change, changePercent };
}

export default function Trading() {
  const { t } = useTranslation();
  const cityStats = useNexusStore((state) => state.cityStats);
  const cityStatsHistory = useNexusStore((state) => state.cityStatsHistory);
  const tradeAssets = useNexusStore((state) => state.tradeAssets);
  const simulation = useNexusStore((state) => state.simulation);
  const marketMovers = useMemo(
    () => tradeAssets.map((asset) => projectAsset(asset, cityStats)),
    [cityStats, tradeAssets],
  );
  const [selectedSymbol, setSelectedSymbol] = useState(marketMovers[0].symbol);
  const [orderType, setOrderType] = useState<"buy" | "sell">("buy");
  const [orderAmount, setOrderAmount] = useState(100);
  const selectedAsset =
    marketMovers.find((asset) => asset.symbol === selectedSymbol) ??
    marketMovers[0];
  const priceHistory = useMemo(() => {
    const snapshots =
      cityStatsHistory.length > 0
        ? cityStatsHistory.slice(-30)
        : Array.from({ length: 30 }, (_, index) => ({
            tick: Math.max(0, simulation.world.tick - 29 + index),
            stats: cityStats,
          }));
    const baseAsset =
      tradeAssets.find((asset) => asset.symbol === selectedAsset.symbol) ??
      selectedAsset;

    return snapshots.map((snapshot) => {
      const deterministicNoise =
        (randomUnit(
          simulation.seed,
          snapshot.tick,
          `market.${selectedAsset.symbol}`,
        ) -
          0.5) *
        0.012;
      const price =
        baseAsset.price *
        getMarketFactor(selectedAsset.symbol, snapshot.stats) *
        (1 + deterministicNoise);
      return {
        day: snapshot.tick,
        price: Math.round(price * 100) / 100,
      };
    });
  }, [
    cityStats,
    cityStatsHistory,
    selectedAsset,
    simulation.seed,
    simulation.world.tick,
    tradeAssets,
  ]);
  const totalChange = marketMovers.reduce((sum, asset) => sum + asset.change, 0);
  const totalBaseValue = tradeAssets.reduce((sum, asset) => sum + asset.price, 0);
  const portfolioChangePercent =
    totalBaseValue === 0 ? 0 : (totalChange / totalBaseValue) * 100;
  const signed = (value: number, suffix = "") =>
    `${value >= 0 ? "+" : ""}${value.toFixed(2)}${suffix}`;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-orbitron font-bold text-cyber-blue cyber-text-glow">{t("marketTrading")}</h1>
        <p className="text-cyber-text-dim mt-1">{t("resourceExchange")}</p>
      </motion.div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {([
          { labelKey: "portfolioValue" as TranslationKey, value: `$${(cityStats.gdp / 1000).toFixed(2)}M`, color: "cyber-blue" },
          { labelKey: "totalProfit" as TranslationKey, value: `${totalChange >= 0 ? "+" : ""}$${totalChange.toFixed(2)}`, color: totalChange >= 0 ? "cyber-green" : "cyber-red" },
          { labelKey: "profitPercent" as TranslationKey, value: signed(portfolioChangePercent, "%"), color: portfolioChangePercent >= 0 ? "cyber-green" : "cyber-red" },
          { labelKey: "dayChange" as TranslationKey, value: signed(marketMovers.reduce((sum, asset) => sum + asset.changePercent, 0) / marketMovers.length, "%"), color: portfolioChangePercent >= 0 ? "cyber-green" : "cyber-red" },
        ]).map((stat, i) => (
          <motion.div key={stat.labelKey} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
            className="bg-cyber-dark/50 border border-cyber-blue/20 rounded-xl p-4">
            <span className="text-xs text-cyber-text-dim">{t(stat.labelKey)}</span>
            <div className={`text-xl font-bold text-${stat.color}`}>{stat.value}</div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2 space-y-6">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="bg-cyber-dark/50 border border-cyber-blue/20 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="text-2xl font-bold text-cyber-text">{selectedAsset.symbol}</span>
                <span className="ml-2 text-sm text-cyber-text-dim">{selectedAsset.name}</span>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-cyber-text">${selectedAsset.price.toFixed(2)}</div>
                <div className={`flex items-center justify-end gap-1 ${selectedAsset.change >= 0 ? "text-cyber-green" : "text-cyber-red"}`}>
                  {selectedAsset.change >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  <span>{selectedAsset.change >= 0 ? "+" : ""}{selectedAsset.change.toFixed(2)} ({selectedAsset.changePercent.toFixed(2)}%)</span>
                </div>
              </div>
            </div>
            <div className="h-64 min-w-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <AreaChart data={priceHistory}>
                  <defs>
                    <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00ff88" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#00ff88" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" stroke="#888899" fontSize={10} />
                  <YAxis stroke="#888899" fontSize={10} />
                  <Area type="monotone" dataKey="price" stroke="#00ff88" fill="url(#priceGradient)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} className="bg-cyber-dark/50 border border-cyber-blue/20 rounded-xl p-6">
            <h3 className="text-lg font-orbitron text-cyber-text mb-4">{t("marketMovers")}</h3>
            <div className="space-y-2">
              {marketMovers.map((asset) => (
                <motion.button key={asset.symbol} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                  onClick={() => setSelectedSymbol(asset.symbol)}
                  className={`w-full flex items-center justify-between p-3 rounded-lg transition-all ${selectedAsset.symbol === asset.symbol ? "bg-cyber-blue/20 border border-cyber-blue/40" : "bg-cyber-gray/30 hover:bg-cyber-gray/50"}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${asset.change >= 0 ? "bg-cyber-green/10" : "bg-cyber-red/10"}`}>
                      {asset.change >= 0 ? <ArrowUpRight className="w-4 h-4 text-cyber-green" /> : <ArrowDownRight className="w-4 h-4 text-cyber-red" />}
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-bold text-cyber-text">{asset.symbol}</div>
                      <div className="text-xs text-cyber-text-dim">{asset.name}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-cyber-text">${asset.price.toFixed(2)}</div>
                    <div className={`text-xs ${asset.change >= 0 ? "text-cyber-green" : "text-cyber-red"}`}>{asset.change >= 0 ? "+" : ""}{asset.changePercent.toFixed(2)}%</div>
                  </div>
                </motion.button>
              ))}
            </div>
          </motion.div>
        </div>

        <div className="space-y-6">
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="bg-cyber-dark/50 border border-cyber-blue/20 rounded-xl p-6">
            <h3 className="text-lg font-orbitron text-cyber-text mb-4">{t("placeOrder")}</h3>
            <div className="flex gap-2 mb-4">
              <button onClick={() => setOrderType("buy")} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${orderType === "buy" ? "bg-cyber-green text-white" : "bg-cyber-gray text-cyber-text-dim hover:bg-cyber-gray-light"}`}>{t("buy")}</button>
              <button onClick={() => setOrderType("sell")} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${orderType === "sell" ? "bg-cyber-red text-white" : "bg-cyber-gray text-cyber-text-dim hover:bg-cyber-gray-light"}`}>{t("sell")}</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-cyber-text-dim">{t("asset")}</label>
                <div className="py-2 px-3 bg-cyber-gray/50 rounded text-sm text-cyber-text">{selectedAsset.symbol}</div>
              </div>
              <div>
                <label className="text-xs text-cyber-text-dim">{t("amount")}</label>
                <input type="number" value={orderAmount} onChange={(e) => setOrderAmount(Number(e.target.value))} className="w-full py-2 px-3 bg-cyber-gray border border-cyber-blue/20 rounded text-sm text-cyber-text focus:outline-none" />
              </div>
              <button className={`w-full py-3 rounded-lg font-medium transition-all ${orderType === "buy" ? "bg-cyber-green hover:bg-cyber-green/80 text-white" : "bg-cyber-red hover:bg-cyber-red/80 text-white"}`}>
                {orderType === "buy" ? t("buy") : t("sell")} {selectedAsset.symbol}
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
