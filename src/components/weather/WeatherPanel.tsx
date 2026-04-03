"use client";

import { motion } from "framer-motion";
import { useTranslation } from "@/hooks/useTranslation";
import { useState, useEffect } from "react";
import { 
  Cloud, Droplets, Wind, Sun, Thermometer, 
  Eye, Radio, MapPin, Clock
} from "lucide-react";

interface WeatherData {
  temp: number;
  humidity: number;
  wind: number;
  aqi: number;
  uv: number;
  visibility: number;
  condition: "clear" | "cloudy" | "rain" | "storm" | "fog";
  pressure: number;
  feelsLike: number;
}

const conditions = {
  clear: { icon: Sun, label: "Clear", color: "cyber-yellow" },
  cloudy: { icon: Cloud, label: "Cloudy", color: "cyber-gray" },
  rain: { icon: Droplets, label: "Rain", color: "cyber-blue" },
  storm: { icon: Radio, label: "Storm", color: "cyber-purple" },
  fog: { icon: Cloud, label: "Fog", color: "cyber-gray" },
};

export default function WeatherPanel() {
  const { t } = useTranslation();
  const [weather, setWeather] = useState<WeatherData>({
    temp: 23,
    humidity: 65,
    wind: 12,
    aqi: 42,
    uv: 6,
    visibility: 10,
    condition: "clear",
    pressure: 1013,
    feelsLike: 25,
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setWeather(prev => ({
        ...prev,
        temp: prev.temp + (Math.random() > 0.5 ? 0.1 : -0.1),
        humidity: Math.max(30, Math.min(90, prev.humidity + (Math.random() > 0.5 ? 1 : -1))),
        wind: Math.max(0, prev.wind + (Math.random() > 0.5 ? 0.5 : -0.5)),
        aqi: Math.max(0, Math.min(500, prev.aqi + Math.floor(Math.random() * 5 - 2))),
        feelsLike: prev.temp + Math.floor(Math.random() * 3 - 1),
      }));
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const getAQIColor = (aqi: number) => {
    if (aqi <= 50) return "text-cyber-green";
    if (aqi <= 100) return "text-cyber-yellow";
    if (aqi <= 150) return "text-cyber-orange";
    if (aqi <= 200) return "text-cyber-red";
    return "text-cyber-purple";
  };

  const getAQILabel = (aqi: number) => {
    if (aqi <= 50) return "Good";
    if (aqi <= 100) return "Moderate";
    if (aqi <= 150) return "Unhealthy for Sensitive";
    if (aqi <= 200) return "Unhealthy";
    return "Hazardous";
  };

  const ConditionIcon = conditions[weather.condition].icon;

  return (
    <div className="p-6 space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-cyber-cyan/20 border border-cyber-cyan/30">
            <Cloud className="w-6 h-6 text-cyber-cyan" />
          </div>
          <div>
            <h1 className="text-3xl font-orbitron font-bold text-cyber-cyan cyber-text-glow">
              {t("weather_title")}
            </h1>
            <p className="text-cyber-text-dim mt-1">{t("weather_desc")}</p>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="col-span-2 bg-gradient-to-br from-cyber-dark/80 to-cyber-dark/40 border border-cyber-blue/20 rounded-xl p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="p-4 rounded-full bg-cyber-yellow/10 border border-cyber-yellow/20">
                <ConditionIcon className="w-12 h-12 text-cyber-yellow" />
              </div>
              <div>
                <div className="text-6xl font-orbitron font-bold text-cyber-text">
                  {weather.temp.toFixed(1)}°
                </div>
                <div className="text-cyber-text-dim mt-1">{conditions[weather.condition].label}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-cyber-text-dim">{t('feelsLike')}</div>
              <div className="text-2xl font-orbitron text-cyber-blue">{weather.feelsLike}°</div>
              <div className="text-sm text-cyber-text-dim mt-1">
                <MapPin className="w-3 h-3 inline mr-1" />
                {t('neoAngeles')}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4">
            <div className="bg-cyber-dark/50 rounded-lg p-3 text-center">
              <Droplets className="w-5 h-5 text-cyber-blue mx-auto mb-1" />
              <div className="text-xl font-orbitron text-cyber-text">{weather.humidity}%</div>
              <div className="text-xs text-cyber-text-dim">{t("humidity")}</div>
            </div>
            <div className="bg-cyber-dark/50 rounded-lg p-3 text-center">
              <Wind className="w-5 h-5 text-cyber-cyan mx-auto mb-1" />
              <div className="text-xl font-orbitron text-cyber-text">{weather.wind.toFixed(1)} km/h</div>
              <div className="text-xs text-cyber-text-dim">{t("wind")}</div>
            </div>
            <div className="bg-cyber-dark/50 rounded-lg p-3 text-center">
              <Eye className="w-5 h-5 text-cyber-purple mx-auto mb-1" />
              <div className="text-xl font-orbitron text-cyber-text">{weather.visibility} km</div>
              <div className="text-xs text-cyber-text-dim">{t('visibility')}</div>
            </div>
            <div className="bg-cyber-dark/50 rounded-lg p-3 text-center">
              <Thermometer className="w-5 h-5 text-cyber-orange mx-auto mb-1" />
              <div className="text-xl font-orbitron text-cyber-text">{weather.pressure} hPa</div>
              <div className="text-xs text-cyber-text-dim">{t('pressure')}</div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-cyber-dark/50 border border-cyber-blue/20 rounded-xl p-6"
        >
          <h3 className="text-lg font-orbitron font-bold text-cyber-text mb-4">{t("airQuality")}</h3>
          <div className="text-center mb-4">
            <div className={`text-5xl font-orbitron font-bold ${getAQIColor(weather.aqi)}`}>
              {weather.aqi}
            </div>
            <div className={`text-sm ${getAQIColor(weather.aqi)} mt-1`}>
              {getAQILabel(weather.aqi)}
            </div>
          </div>
          <div className="h-2 bg-cyber-dark rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, (weather.aqi / 500) * 100)}%` }}
              className={`h-full ${
                weather.aqi <= 50 ? "bg-cyber-green" :
                weather.aqi <= 100 ? "bg-cyber-yellow" :
                weather.aqi <= 150 ? "bg-cyber-orange" :
                weather.aqi <= 200 ? "bg-cyber-red" : "bg-cyber-purple"
              }`}
            />
          </div>
          <div className="flex justify-between text-xs text-cyber-text-dim mt-2">
            <span>0</span>
            <span>500</span>
          </div>

          <div className="mt-6 pt-4 border-t border-cyber-blue/20">
            <div className="flex items-center justify-between">
              <span className="text-cyber-text-dim text-sm">{t("uvIndex")}</span>
              <span className="text-xl font-orbitron text-cyber-yellow">{weather.uv}</span>
            </div>
            <div className="text-xs text-cyber-text-dim mt-1">
              {weather.uv <= 2 ? t('uvLow') : weather.uv <= 5 ? t('uvModerate') : weather.uv <= 7 ? t('uvHigh') : t('uvVeryHigh')}
            </div>
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-cyber-dark/50 border border-cyber-blue/20 rounded-xl p-6"
      >
        <h3 className="text-lg font-orbitron font-bold text-cyber-text mb-4">{t('sevenDayForecast')}</h3>
        <div className="grid grid-cols-7 gap-4">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, i) => (
            <div key={day} className="text-center">
              <div className="text-sm text-cyber-text-dim mb-2">{day}</div>
              <div className={`p-2 rounded-lg mx-auto w-fit ${
                i === 0 ? "bg-cyber-yellow/10 border border-cyber-yellow/30" : "bg-cyber-dark/50"
              }`}>
                {i === 1 ? <Droplets className="w-5 h-5 text-cyber-blue" /> :
                 i === 3 ? <Cloud className="w-5 h-5 text-cyber-gray" /> :
                 <Sun className="w-5 h-5 text-cyber-yellow" />}
              </div>
              <div className="text-sm font-orbitron text-cyber-text mt-2">
                {22 + i}°
              </div>
              <div className="text-xs text-cyber-text-dim">
                {17 + i}°
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="grid grid-cols-3 gap-4"
      >
        <div className="bg-gradient-to-r from-cyber-green/10 to-transparent border border-cyber-green/20 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <Sun className="w-6 h-6 text-cyber-yellow" />
            <div>
              <div className="text-sm text-cyber-text-dim">{t('uvIndex')}</div>
              <div className="text-xl font-orbitron text-cyber-text">{weather.uv}</div>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-r from-cyber-blue/10 to-transparent border border-cyber-blue/20 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <Cloud className="w-6 h-6 text-cyber-gray" />
            <div>
              <div className="text-sm text-cyber-text-dim">{t('cloudCover')}</div>
              <div className="text-xl font-orbitron text-cyber-text">32%</div>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-r from-cyber-purple/10 to-transparent border border-cyber-purple/20 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <Clock className="w-6 h-6 text-cyber-purple" />
            <div>
              <div className="text-sm text-cyber-text-dim">{t('sunrise')}</div>
              <div className="text-xl font-orbitron text-cyber-text">06:23</div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
