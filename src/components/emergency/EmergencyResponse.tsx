"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Heart,
  MapPin,
  Phone,
  Shield,
  Siren,
  Truck,
  Users,
  Zap,
} from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useNexusStore } from "@/stores/nexus-store";

interface Emergency {
  id: string;
  type: "fire" | "medical" | "security" | "traffic" | "environmental";
  title: string;
  location: string;
  severity: "critical" | "high" | "medium" | "low";
  status: "active" | "responding" | "contained" | "resolved";
  tick: number;
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

const BASE_TEAMS: ResponseTeam[] = [
  { id: "t1", name: "Fire Unit 1", type: "fire", status: "available", location: "Iron Works", eta: "3 min" },
  { id: "t2", name: "Fire Unit 2", type: "fire", status: "available", location: "Iron Works", eta: "5 min" },
  { id: "t3", name: "Medical Team 1", type: "medical", status: "available", location: "Highway 101", eta: "4 min" },
  { id: "t4", name: "Security Team 1", type: "security", status: "available", location: "Neo Downtown", eta: "Ready" },
  { id: "t5", name: "Rescue Unit 1", type: "rescue", status: "returning", location: "Station", eta: "10 min" },
];

const INCIDENT_CONFIG = {
  crime: {
    type: "security" as const,
    title: "Crime Threshold Incident",
    location: "Black Zone security grid",
  },
  traffic: {
    type: "traffic" as const,
    title: "Traffic Gridlock",
    location: "Neo Downtown interchange",
  },
  energy: {
    type: "fire" as const,
    title: "Power Grid Critical",
    location: "Iron Works energy sector",
  },
  pollution: {
    type: "environmental" as const,
    title: "Environmental Threshold",
    location: "Green Sector air grid",
  },
};

export default function EmergencyResponse() {
  const { t } = useTranslation();
  const simulation = useNexusStore((state) => state.simulation);
  const cityStats = useNexusStore((state) => state.cityStats);
  const [selectedEmergency, setSelectedEmergency] = useState<Emergency | null>(null);
  const emergencies = useMemo<Emergency[]>(() => {
    return simulation.events
      .filter((event) => event.type === "observation.threshold")
      .slice(-6)
      .reverse()
      .map((event) => {
        const metric = String(event.payload.metric);
        const value = Number(event.payload.value);
        const responseRecorded = simulation.events.some(
          (candidate) =>
            candidate.correlationId === event.correlationId &&
            candidate.type === "agent.action",
        );
        const config =
          INCIDENT_CONFIG[metric as keyof typeof INCIDENT_CONFIG] ?? {
            type: "environmental" as const,
            title: "City Threshold Incident",
            location: "Neo Angeles",
          };

        return {
          id: event.id,
          type: config.type,
          title: config.title,
          location: config.location,
          severity:
            value >= 90 ? "critical" : value >= 75 ? "high" : "medium",
          status: responseRecorded ? "responding" : "active",
          tick: event.tick,
          description: `${metric} observed at ${value}; threshold ${String(event.payload.threshold)}. ${String(event.payload.assignedAgent).toUpperCase()} was assigned.`,
          responseTeams: responseRecorded ? 2 : 1,
        };
      });
  }, [simulation.events]);
  const teams = useMemo<ResponseTeam[]>(
    () =>
      BASE_TEAMS.map((team, index) => ({
        ...team,
        status:
          index < Math.min(emergencies.length, 4)
            ? "deployed"
            : index === 4
              ? "returning"
              : "available",
      })),
    [emergencies.length],
  );
  const resolvedToday = simulation.events.filter(
    (event) =>
      event.type === "action.evaluated" && event.payload.successful === true,
  ).length;

  const getSeverityColor = (severity: Emergency["severity"]) => {
    switch (severity) {
      case "critical":
        return "text-cyber-red bg-cyber-red/20 border-cyber-red";
      case "high":
        return "text-cyber-orange bg-cyber-orange/20 border-cyber-orange";
      case "medium":
        return "text-cyber-yellow bg-cyber-yellow/20 border-cyber-yellow";
      default:
        return "text-cyber-green bg-cyber-green/20 border-cyber-green";
    }
  };

  const getStatusColor = (status: Emergency["status"]) => {
    switch (status) {
      case "active":
        return "bg-cyber-red animate-pulse";
      case "responding":
        return "bg-cyber-orange animate-pulse";
      case "contained":
        return "bg-cyber-yellow";
      default:
        return "bg-cyber-green";
    }
  };

  const getTypeIcon = (type: Emergency["type"]) => {
    switch (type) {
      case "fire":
        return <Zap className="h-5 w-5 text-cyber-orange" />;
      case "medical":
        return <Heart className="h-5 w-5 text-cyber-red" />;
      case "security":
        return <Shield className="h-5 w-5 text-cyber-blue" />;
      case "traffic":
        return <Truck className="h-5 w-5 text-cyber-blue" />;
      default:
        return <AlertTriangle className="h-5 w-5 text-cyber-yellow" />;
    }
  };

  const getTeamIcon = (type: ResponseTeam["type"]) => {
    switch (type) {
      case "fire":
        return <Zap className="h-4 w-4 text-cyber-orange" />;
      case "medical":
        return <Heart className="h-4 w-4 text-cyber-red" />;
      case "security":
        return <Shield className="h-4 w-4 text-cyber-blue" />;
      default:
        return <Users className="h-4 w-4 text-cyber-blue" />;
    }
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-2 flex items-center gap-3">
          <div className="rounded-lg border border-cyber-red/30 bg-cyber-red/20 p-2">
            <Siren className="h-6 w-6 text-cyber-red" />
          </div>
          <div>
            <h1 className="text-3xl font-orbitron font-bold text-cyber-red cyber-text-glow">
              {t("emergency_title")}
            </h1>
            <p className="mt-1 text-cyber-text-dim">{t("emergency_desc")}</p>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-cyber-red/30 bg-cyber-dark/50 p-4">
          <div className="mb-2 flex items-center gap-2 text-cyber-red">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm font-medium">{t("activeEmergencies")}</span>
          </div>
          <div className="text-3xl font-orbitron font-bold text-cyber-red">
            {emergencies.filter(
              (emergency) =>
                emergency.status === "active" ||
                emergency.status === "responding",
            ).length}
          </div>
        </div>

        <div className="rounded-lg border border-cyber-blue/30 bg-cyber-dark/50 p-4">
          <div className="mb-2 flex items-center gap-2 text-cyber-blue">
            <Users className="h-4 w-4" />
            <span className="text-sm font-medium">{t("responseTeams")}</span>
          </div>
          <div className="text-3xl font-orbitron font-bold text-cyber-blue">
            {teams.filter((team) => team.status === "available").length}/{teams.length}
          </div>
        </div>

        <div className="rounded-lg border border-cyber-blue/30 bg-cyber-dark/50 p-4">
          <div className="mb-2 flex items-center gap-2 text-cyber-blue">
            <MapPin className="h-4 w-4" />
            <span className="text-sm font-medium">{t("evacShelters")}</span>
          </div>
          <div className="text-3xl font-orbitron font-bold text-cyber-blue">
            {Math.max(4, Math.round(cityStats.population / 700000))}
          </div>
        </div>

        <div className="rounded-lg border border-cyber-green/30 bg-cyber-dark/50 p-4">
          <div className="mb-2 flex items-center gap-2 text-cyber-green">
            <CheckCircle className="h-4 w-4" />
            <span className="text-sm font-medium">{t("completed")}</span>
          </div>
          <div className="text-3xl font-orbitron font-bold text-cyber-green">
            {resolvedToday}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <h2 className="text-xl font-orbitron font-bold text-cyber-text">
            {t("activeEmergencies")}
          </h2>
          {emergencies.map((emergency) => (
            <motion.button
              type="button"
              key={emergency.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              onClick={() => setSelectedEmergency(emergency)}
              className={`w-full rounded-lg border bg-cyber-dark/50 p-4 text-left transition-colors hover:border-cyber-blue/50 ${
                selectedEmergency?.id === emergency.id
                  ? "border-cyber-blue"
                  : "border-cyber-blue/20"
              }`}
            >
              <div className="flex items-start gap-3">
                {getTypeIcon(emergency.type)}
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <h3 className="font-medium text-cyber-text">{emergency.title}</h3>
                    <div
                      className={`rounded border px-2 py-0.5 text-xs font-bold uppercase ${getSeverityColor(emergency.severity)}`}
                    >
                      {emergency.severity}
                    </div>
                  </div>
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-cyber-text-dim">
                    <MapPin className="h-3 w-3" />
                    {emergency.location}
                    <span>•</span>
                    <Clock className="h-3 w-3" />
                    {Math.max(0, simulation.world.tick - emergency.tick)} ticks ago
                  </div>
                  <p className="text-sm text-cyber-text-dim">{emergency.description}</p>
                  <div className="mt-3 flex items-center gap-4">
                    <div className="flex items-center gap-1">
                      <div className={`h-2 w-2 rounded-full ${getStatusColor(emergency.status)}`} />
                      <span className="text-xs uppercase text-cyber-text-dim">
                        {emergency.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-cyber-text-dim">
                      <Users className="h-3 w-3" />
                      {emergency.responseTeams} {t("responseTeams")}
                    </div>
                  </div>
                </div>
              </div>
            </motion.button>
          ))}
          {emergencies.length === 0 && (
            <div className="rounded-lg border border-cyber-green/30 bg-cyber-green/5 p-6 text-center text-sm text-cyber-text-dim">
              No threshold emergencies in the current run.
            </div>
          )}
        </div>

        <div className="space-y-4">
          <h2 className="text-xl font-orbitron font-bold text-cyber-text">
            {t("responseTeams")}
          </h2>
          {teams.map((team) => (
            <motion.div
              key={team.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="rounded-lg border border-cyber-blue/20 bg-cyber-dark/50 p-4"
            >
              <div className="flex items-center gap-3">
                {getTeamIcon(team.type)}
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-cyber-text">{team.name}</h3>
                    <div
                      className={`rounded px-2 py-0.5 text-xs font-bold uppercase ${
                        team.status === "available"
                          ? "bg-cyber-green/20 text-cyber-green"
                          : team.status === "deployed"
                            ? "bg-cyber-orange/20 text-cyber-orange"
                            : "bg-cyber-blue/20 text-cyber-blue"
                      }`}
                    >
                      {team.status}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-4 text-xs text-cyber-text-dim">
                    <span>📍 {team.location}</span>
                    <span>⏱️ {team.eta}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}

          <div className="mt-4 rounded-lg border border-cyber-red/20 bg-gradient-to-r from-cyber-red/10 to-cyber-orange/10 p-4">
            <div className="flex items-center gap-3">
              <Phone className="h-6 w-6 text-cyber-red" />
              <div>
                <h3 className="font-bold text-cyber-text">{t("emergencyHotline")}</h3>
                <p className="text-sm text-cyber-text-dim">{t("immediateAssistance")}</p>
              </div>
              <div className="ml-auto text-2xl font-orbitron font-bold text-cyber-red">
                911
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
