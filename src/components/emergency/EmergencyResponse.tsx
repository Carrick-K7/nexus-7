"use client";

import { motion } from "framer-motion";
import { useTranslation } from "@/hooks/useTranslation";
import { useState } from "react";
import { 
  AlertTriangle, Siren, MapPin, Users, Shield, 
  Truck, Heart, Zap, Phone, Clock, CheckCircle
} from "lucide-react";

interface Emergency {
  id: string;
  type: "fire" | "medical" | "security" | "traffic" | "environmental";
  title: string;
  location: string;
  severity: "critical" | "high" | "medium" | "low";
  status: "active" | "responding" | "contained" | "resolved";
  timestamp: number;
  description: string;
  responseTeams: number;
}

interface ResponseTeam {
  id: string;
  name: string;
  type: "fire" | "medical" | "security" | "rescue";
  status: "available" | "deployed" | "returning";
  location: string;
  eta: string;
}

const mockEmergencies: Emergency[] = [
  {
    id: "e1",
    type: "fire",
    title: "Industrial Fire Alert",
    location: "Iron Works District, Sector 7",
    severity: "critical",
    status: "responding",
    timestamp: Date.now() - 300000,
    description: "Chemical fire reported in industrial zone. Evacuation orders issued for nearby areas.",
    responseTeams: 3,
  },
  {
    id: "e2",
    type: "security",
    title: "Security Breach",
    location: "Neo Downtown Financial Center",
    severity: "high",
    status: "active",
    timestamp: Date.now() - 600000,
    description: "Unauthorized drone activity detected near secure facilities.",
    responseTeams: 2,
  },
  {
    id: "e3",
    type: "medical",
    title: "Mass Casualty Event",
    location: "Highway 101, Chrome Heights",
    severity: "high",
    status: "contained",
    timestamp: Date.now() - 1800000,
    description: "Multi-vehicle collision. Medical teams on scene providing assistance.",
    responseTeams: 4,
  },
];

const mockTeams: ResponseTeam[] = [
  { id: "t1", name: "Fire Unit 1", type: "fire", status: "deployed", location: "Iron Works", eta: "3 min" },
  { id: "t2", name: "Fire Unit 2", type: "fire", status: "deployed", location: "Iron Works", eta: "5 min" },
  { id: "t3", name: "Medical Team 1", type: "medical", status: "deployed", location: "Highway 101", eta: "On scene" },
  { id: "t4", name: "Security Team 1", type: "security", status: "available", location: "Neo Downtown", eta: "Ready" },
  { id: "t5", name: "Rescue Unit 1", type: "rescue", status: "returning", location: "Station", eta: "10 min" },
];

export default function EmergencyResponse() {
  const { t } = useTranslation();
  const [emergencies, setEmergencies] = useState<Emergency[]>(mockEmergencies);
  const [teams] = useState<ResponseTeam[]>(mockTeams);
  const [selectedEmergency, setSelectedEmergency] = useState<Emergency | null>(null);

  const getSeverityColor = (severity: Emergency["severity"]) => {
    switch (severity) {
      case "critical": return "text-cyber-red bg-cyber-red/20 border-cyber-red";
      case "high": return "text-cyber-orange bg-cyber-orange/20 border-cyber-orange";
      case "medium": return "text-cyber-yellow bg-cyber-yellow/20 border-cyber-yellow";
      default: return "text-cyber-green bg-cyber-green/20 border-cyber-green";
    }
  };

  const getStatusColor = (status: Emergency["status"]) => {
    switch (status) {
      case "active": return "bg-cyber-red animate-pulse";
      case "responding": return "bg-cyber-orange animate-pulse";
      case "contained": return "bg-cyber-yellow";
      default: return "bg-cyber-green";
    }
  };

  const getTypeIcon = (type: Emergency["type"]) => {
    switch (type) {
      case "fire": return <Zap className="w-5 h-5 text-cyber-orange" />;
      case "medical": return <Heart className="w-5 h-5 text-cyber-red" />;
      case "security": return <Shield className="w-5 h-5 text-cyber-blue" />;
      case "traffic": return <Truck className="w-5 h-5 text-cyber-purple" />;
      default: return <AlertTriangle className="w-5 h-5 text-cyber-yellow" />;
    }
  };

  const getTeamIcon = (type: ResponseTeam["type"]) => {
    switch (type) {
      case "fire": return <Zap className="w-4 h-4 text-cyber-orange" />;
      case "medical": return <Heart className="w-4 h-4 text-cyber-red" />;
      case "security": return <Shield className="w-4 h-4 text-cyber-blue" />;
      default: return <Users className="w-4 h-4 text-cyber-purple" />;
    }
  };

  const getTimeAgo = (timestamp: number) => {
    const minutes = Math.floor((Date.now() - timestamp) / 60000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  return (
    <div className="p-6 space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-cyber-red/20 border border-cyber-red/30">
            <Siren className="w-6 h-6 text-cyber-red" />
          </div>
          <div>
            <h1 className="text-3xl font-orbitron font-bold text-cyber-red cyber-text-glow">
              {t("emergency_title")}
            </h1>
            <p className="text-cyber-text-dim mt-1">{t("emergency_desc")}</p>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-cyber-dark/50 border border-cyber-red/30 rounded-lg p-4">
          <div className="flex items-center gap-2 text-cyber-red mb-2">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm font-medium">{t("activeEmergencies")}</span>
          </div>
          <div className="text-3xl font-orbitron font-bold text-cyber-red">
            {emergencies.filter(e => e.status === "active" || e.status === "responding").length}
          </div>
        </div>
        
        <div className="bg-cyber-dark/50 border border-cyber-blue/30 rounded-lg p-4">
          <div className="flex items-center gap-2 text-cyber-blue mb-2">
            <Users className="w-4 h-4" />
            <span className="text-sm font-medium">{t("responseTeams")}</span>
          </div>
          <div className="text-3xl font-orbitron font-bold text-cyber-blue">
            {teams.filter(t => t.status === "available").length}/{teams.length}
          </div>
        </div>

        <div className="bg-cyber-dark/50 border border-cyber-purple/30 rounded-lg p-4">
          <div className="flex items-center gap-2 text-cyber-purple mb-2">
            <MapPin className="w-4 h-4" />
            <span className="text-sm font-medium">{t("evacShelters")}</span>
          </div>
          <div className="text-3xl font-orbitron font-bold text-cyber-purple">12</div>
        </div>

        <div className="bg-cyber-dark/50 border border-cyber-green/30 rounded-lg p-4">
          <div className="flex items-center gap-2 text-cyber-green mb-2">
            <CheckCircle className="w-4 h-4" />
            <span className="text-sm font-medium">{t('completed')} Today</span>
          </div>
          <div className="text-3xl font-orbitron font-bold text-cyber-green">7</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-4">
          <h2 className="text-xl font-orbitron font-bold text-cyber-text">{t("activeEmergencies")}</h2>
          {emergencies.map((emergency) => (
            <motion.div
              key={emergency.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              onClick={() => setSelectedEmergency(emergency)}
              className={`bg-cyber-dark/50 border rounded-lg p-4 cursor-pointer hover:border-cyber-blue/50 transition-colors ${
                selectedEmergency?.id === emergency.id ? "border-cyber-blue" : "border-cyber-blue/20"
              }`}
            >
              <div className="flex items-start gap-3">
                {getTypeIcon(emergency.type)}
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-cyber-text font-medium">{emergency.title}</h3>
                    <div className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${getSeverityColor(emergency.severity)}`}>
                      {emergency.severity}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-cyber-text-dim text-xs mb-2">
                    <MapPin className="w-3 h-3" />
                    {emergency.location}
                    <span>•</span>
                    <Clock className="w-3 h-3" />
                    {getTimeAgo(emergency.timestamp)}
                  </div>
                  <p className="text-cyber-text-dim text-sm">{emergency.description}</p>
                  <div className="flex items-center gap-4 mt-3">
                    <div className="flex items-center gap-1">
                      <div className={`w-2 h-2 rounded-full ${getStatusColor(emergency.status)}`} />
                      <span className="text-xs text-cyber-text-dim uppercase">{emergency.status}</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-cyber-text-dim">
                      <Users className="w-3 h-3" />
                      {emergency.responseTeams} {t('responseTeams')}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="space-y-4">
          <h2 className="text-xl font-orbitron font-bold text-cyber-text">{t("responseTeams")}</h2>
          {teams.map((team) => (
            <motion.div
              key={team.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-cyber-dark/50 border border-cyber-blue/20 rounded-lg p-4"
            >
              <div className="flex items-center gap-3">
                {getTeamIcon(team.type)}
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="text-cyber-text font-medium">{team.name}</h3>
                    <div className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                      team.status === "available" ? "bg-cyber-green/20 text-cyber-green" :
                      team.status === "deployed" ? "bg-cyber-orange/20 text-cyber-orange" :
                      "bg-cyber-blue/20 text-cyber-blue"
                    }`}>
                      {team.status}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-xs text-cyber-text-dim">
                    <span>📍 {team.location}</span>
                    <span>⏱️ {team.eta}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}

          <div className="bg-gradient-to-r from-cyber-red/10 to-cyber-orange/10 border border-cyber-red/20 rounded-lg p-4 mt-4">
            <div className="flex items-center gap-3">
              <Phone className="w-6 h-6 text-cyber-red" />
              <div>
                <h3 className="text-cyber-text font-bold">{t('emergencyHotline')}</h3>
                <p className="text-cyber-text-dim text-sm">{t('immediateAssistance')}</p>
              </div>
              <div className="ml-auto text-2xl font-orbitron font-bold text-cyber-red">911</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
