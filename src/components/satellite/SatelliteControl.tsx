"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { Satellite, Signal, Radio, MapPin, Battery, Thermometer, AlertTriangle } from "lucide-react";

interface Satellite {
  id: string;
  name: string;
  altitude: number;
  velocity: number;
  status: "active" | "idle" | "maintenance" | "offline";
  signal: number;
  battery: number;
  temp: number;
  orbit: "leo" | "meo" | "geo";
  position: { lat: number; lng: number };
}

const initialSatellites: Satellite[] = [
  { id: "sat-1", name: "NEXUS-7", altitude: 550, velocity: 7.6, status: "active", signal: 94, battery: 78, temp: -23, orbit: "leo", position: { lat: 34.05, lng: -118.24 } },
  { id: "sat-2", name: "NEXUS-12", altitude: 35786, velocity: 3.07, status: "active", signal: 88, battery: 65, temp: -45, orbit: "geo", position: { lat: 0, lng: -74.0 } },
  { id: "sat-3", name: "NEXUS-3", altitude: 20100, velocity: 3.88, status: "maintenance", signal: 12, battery: 23, temp: 12, orbit: "meo", position: { lat: 51.5, lng: -0.1 } },
  { id: "sat-4", name: "NEXUS-9", altitude: 550, velocity: 7.6, status: "active", signal: 97, battery: 89, temp: -18, orbit: "leo", position: { lat: 35.68, lng: 139.69 } },
  { id: "sat-5", name: "NEXUS-15", altitude: 550, velocity: 7.6, status: "idle", signal: 0, battery: 100, temp: -25, orbit: "leo", position: { lat: -33.87, lng: 151.21 } },
];

export default function SatelliteControl() {
  const [satellites] = useState<Satellite[]>(initialSatellites);
  const [selectedSat, setSelectedSat] = useState<Satellite | null>(satellites[0]);

  const getStatusColor = (status: Satellite["status"]) => {
    switch (status) {
      case "active": return "text-cyber-green";
      case "idle": return "text-cyber-yellow";
      case "maintenance": return "text-cyber-orange";
      case "offline": return "text-cyber-red";
    }
  };

  return (
    <div className="p-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-orbitron font-bold text-cyber-blue cyber-text-glow">SATELLITE CONTROL</h1>
        <p className="text-cyber-text-dim mt-1">Orbital surveillance and communication network</p>
      </motion.div>

      <div className="grid grid-cols-5 gap-4">
        {[
          { label: "Total Satellites", value: satellites.length, icon: Satellite, color: "cyber-blue" },
          { label: "Active", value: satellites.filter(s => s.status === "active").length, icon: Signal, color: "cyber-green" },
          { label: "Signal Quality", value: `${Math.round(satellites.reduce((a, s) => a + s.signal, 0) / satellites.length)}%`, icon: Radio, color: "cyber-purple" },
          { label: "Coverage", value: "73%", icon: MapPin, color: "cyber-yellow" },
          { label: "Alerts", value: 1, icon: AlertTriangle, color: "cyber-red" },
        ].map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
            className="bg-cyber-dark/50 border border-cyber-blue/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <stat.icon className={`w-5 h-5 text-${stat.color}`} />
              <span className="text-xs text-cyber-text-dim">{stat.label}</span>
            </div>
            <div className={`text-2xl font-bold text-${stat.color}`}>{stat.value}</div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="bg-cyber-dark/50 border border-cyber-blue/20 rounded-xl p-6">
            <h3 className="text-lg font-orbitron text-cyber-text mb-4">Orbital Map</h3>
            <div className="relative h-96 bg-cyber-darker/50 rounded-lg overflow-hidden">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-32 h-32 rounded-full border-2 border-cyber-blue/30 relative">
                  <div className="absolute inset-4 rounded-full border border-cyber-blue/20" />
                  <div className="absolute inset-8 rounded-full border border-cyber-blue/10" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-4 h-4 rounded-full bg-cyber-blue/50" />
                  </div>
                </div>
              </div>
              {satellites.map((sat, i) => {
                const angle = (i / satellites.length) * 2 * Math.PI;
                const radius = 80 + (sat.orbit === "geo" ? 60 : sat.orbit === "meo" ? 30 : 0);
                const x = Math.cos(angle) * radius + 180;
                const y = Math.sin(angle) * radius + 160;
                return (
                  <motion.div
                    key={sat.id}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.5 + i * 0.1 }}
                    className="absolute cursor-pointer"
                    style={{ left: x, top: y, transform: "translate(-50%, -50%)" }}
                    onClick={() => setSelectedSat(sat)}
                  >
                    <div className={`w-4 h-4 rounded-full ${sat.status === "active" ? "bg-cyber-green" : sat.status === "idle" ? "bg-cyber-yellow" : sat.status === "maintenance" ? "bg-cyber-orange" : "bg-cyber-red"} ${selectedSat?.id === sat.id ? "ring-2 ring-white" : ""}`} />
                    <div className="absolute top-5 left-1/2 -translate-x-1/2 text-[8px] text-cyber-text-dim whitespace-nowrap">{sat.name}</div>
                  </motion.div>
                );
              })}
              <div className="absolute bottom-2 left-2 flex gap-4 text-[10px]">
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-cyber-green" /><span className="text-cyber-text-dim">LEO (550km)</span></div>
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-cyber-blue" /><span className="text-cyber-text-dim">MEO (20,200km)</span></div>
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-cyber-purple" /><span className="text-cyber-text-dim">GEO (35,786km)</span></div>
              </div>
            </div>
          </motion.div>
        </div>

        <div className="space-y-4">
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}
            className="bg-cyber-dark/50 border border-cyber-blue/20 rounded-xl p-4">
            <h3 className="text-sm font-orbitron text-cyber-text mb-3">Satellite Fleet</h3>
            <div className="space-y-2">
              {satellites.map((sat) => (
                <button key={sat.id} onClick={() => setSelectedSat(sat)}
                  className={`w-full flex items-center justify-between p-2 rounded-lg transition-all ${selectedSat?.id === sat.id ? "bg-cyber-blue/20 border border-cyber-blue/40" : "bg-cyber-gray/30 hover:bg-cyber-gray/50"}`}>
                  <div className="flex items-center gap-2">
                    <Satellite className={`w-4 h-4 ${getStatusColor(sat.status)}`} />
                    <span className="text-sm text-cyber-text">{sat.name}</span>
                  </div>
                  <span className={`text-xs ${getStatusColor(sat.status)}`}>{sat.status.toUpperCase()}</span>
                </button>
              ))}
            </div>
          </motion.div>

          {selectedSat && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="bg-cyber-dark/50 border border-cyber-blue/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Satellite className={`w-5 h-5 ${getStatusColor(selectedSat.status)}`} />
                <span className="font-orbitron text-cyber-text">{selectedSat.name}</span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-cyber-text-dim">Status</span><span className={`capitalize ${getStatusColor(selectedSat.status)}`}>{selectedSat.status}</span></div>
                <div className="flex justify-between"><span className="text-cyber-text-dim">Altitude</span><span className="text-cyber-text">{selectedSat.altitude.toLocaleString()} km</span></div>
                <div className="flex justify-between"><span className="text-cyber-text-dim">Velocity</span><span className="text-cyber-text">{selectedSat.velocity} km/s</span></div>
                <div className="flex justify-between"><span className="text-cyber-text-dim">Orbit</span><span className="text-cyber-text uppercase">{selectedSat.orbit}</span></div>
                <div className="flex justify-between"><span className="text-cyber-text-dim">Position</span><span className="text-cyber-text">{selectedSat.position.lat.toFixed(2)}°, {selectedSat.position.lng.toFixed(2)}°</span></div>
              </div>
              <div className="mt-3 pt-3 border-t border-cyber-blue/20 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1"><Signal className="w-3 h-3 text-cyber-green" /><span className="text-xs text-cyber-text-dim">Signal</span></div>
                  <span className="text-sm text-cyber-green">{selectedSat.signal}%</span>
                </div>
                <div className="h-1.5 bg-cyber-gray rounded-full overflow-hidden"><div className="h-full bg-cyber-green" style={{ width: `${selectedSat.signal}%` }} /></div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1"><Battery className="w-3 h-3 text-cyber-blue" /><span className="text-xs text-cyber-text-dim">Battery</span></div>
                  <span className="text-sm text-cyber-blue">{selectedSat.battery}%</span>
                </div>
                <div className="h-1.5 bg-cyber-gray rounded-full overflow-hidden"><div className="h-full bg-cyber-blue" style={{ width: `${selectedSat.battery}%` }} /></div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1"><Thermometer className="w-3 h-3 text-cyber-orange" /><span className="text-xs text-cyber-text-dim">Temp</span></div>
                  <span className="text-sm text-cyber-orange">{selectedSat.temp}°C</span>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button className="flex-1 py-1.5 bg-cyber-blue/20 border border-cyber-blue/30 rounded text-xs text-cyber-blue hover:bg-cyber-blue/30">Realign</button>
                <button className="flex-1 py-1.5 bg-cyber-purple/20 border border-cyber-purple/30 rounded text-xs text-cyber-purple hover:bg-cyber-purple/30">Transfer</button>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}