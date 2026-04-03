"use client";

import { useEffect, useRef } from "react";
import { useNexusStore } from "@/stores/nexus-store";

export function useCitySimulation() {
  const { gameTime, setGameTime, updateCityStats, addNotification, updateAgent } = useNexusStore();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const simulateCity = () => {
      const hour = gameTime.hour;
      const baseMultiplier = gameTime.speed;

      const trafficPattern = 
        hour >= 7 && hour <= 9 ? 0.8 + Math.random() * 0.2 :
        hour >= 17 && hour <= 19 ? 0.9 + Math.random() * 0.1 :
        hour >= 22 || hour <= 5 ? 0.2 + Math.random() * 0.1 :
        0.4 + Math.random() * 0.3;

      const energyPattern = 
        hour >= 6 && hour <= 9 ? 0.7 + Math.random() * 0.2 :
        hour >= 18 && hour <= 22 ? 0.85 + Math.random() * 0.15 :
        hour >= 0 && hour <= 5 ? 0.3 + Math.random() * 0.1 :
        0.5 + Math.random() * 0.2;

      const crimePattern = 
        hour >= 22 || hour <= 3 ? 0.6 + Math.random() * 0.3 :
        hour >= 12 && hour <= 14 ? 0.3 + Math.random() * 0.2 :
        0.2 + Math.random() * 0.2;

      const pollutionPattern = 
        hour >= 8 && hour <= 18 ? 0.6 + Math.random() * 0.2 :
        0.3 + Math.random() * 0.2;

      updateCityStats({
        traffic: Math.round(30 + trafficPattern * 50 + (Math.random() - 0.5) * 10),
        energy: Math.round(50 + energyPattern * 40 + (Math.random() - 0.5) * 5),
        crime: Math.round(10 + crimePattern * 40 + (Math.random() - 0.5) * 5),
        pollution: Math.round(20 + pollutionPattern * 50 + (Math.random() - 0.5) * 10),
        happiness: Math.round(60 + (1 - crimePattern) * 30 + (1 - pollutionPattern) * 10),
      });

      if (Math.random() < 0.1 * baseMultiplier) {
        const events = [
          { type: "info" as const, title: "Traffic Incident", message: `Congestion on Highway 7. Delay: ${Math.round(Math.random() * 20)} min.`, source: "TRAFFIC_CTL" },
          { type: "warning" as const, title: "Power Fluctuation", message: "Grid fluctuations in Industrial sector.", source: "GRID_MGMT" },
          { type: "info" as const, title: "Weather Update", message: `Temperature dropping. Expected: ${Math.round(20 + Math.random() * 5)}°C`, source: "WEATHER" },
          { type: "success" as const, title: "System Optimization", message: "Neural network efficiency +2.3%.", source: "NEXUS" },
          { type: "warning" as const, title: "Network Latency", message: "Elevated latency in Data Center Alpha.", source: "NETWORK" },
        ];
        const event = events[Math.floor(Math.random() * events.length)];
        addNotification(event);
      }

      if (Math.random() < 0.05 * baseMultiplier) {
        const agentUpdates = [
          { id: "atlas", mood: Math.max(20, 72 + Math.round((Math.random() - 0.5) * 20)) },
          { id: "economica", mood: Math.max(30, 90 + Math.round((Math.random() - 0.5) * 15)) },
          { id: "civitas", mood: Math.max(40, 68 + Math.round((Math.random() - 0.5) * 25)) },
          { id: "spectre", mood: Math.max(15, 55 + Math.round((Math.random() - 0.5) * 30)) },
        ];
        const update = agentUpdates[Math.floor(Math.random() * agentUpdates.length)];
        updateAgent(update.id, { mood: update.mood });
      }

      let newMinute = gameTime.minute + 1;
      let newHour = gameTime.hour;
      let newDay = gameTime.day;

      if (newMinute >= 60) {
        newMinute = 0;
        newHour += 1;
        if (newHour >= 24) {
          newHour = 0;
          newDay += 1;
          addNotification({
            type: "info",
            title: "New Day",
            message: `Day ${newDay} begins. City population: ${(8472934 + Math.round(Math.random() * 1000)).toLocaleString()}`,
            source: "SYSTEM",
          });
        }
      }

      setGameTime({ hour: newHour, minute: newMinute, day: newDay });
    };

    const intervalMs = 1000 / gameTime.speed;
    intervalRef.current = setInterval(simulateCity, intervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [gameTime.speed, gameTime.hour, gameTime.minute, gameTime.day]);

  return null;
}