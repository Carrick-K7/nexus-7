"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  TrendingUp,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTranslation } from "@/hooks/useTranslation";
import { useNexusStore } from "@/stores/nexus-store";
import {
  advanceClock,
  buildActionTraces,
  getTraceMetric,
} from "@/simulation";
import type { DomainEvent, SimulationMetric } from "@/simulation";

interface ResourceData {
  time: string;
  power: number;
  water: number;
  bandwidth: number;
}

interface CityEvent {
  id: string;
  type: "accident" | "crime" | "market" | "system";
  title: string;
  location: string;
  time: string;
  severity: "low" | "medium" | "high";
}

interface AgentTask {
  name: string;
  atlas: number;
  economica: number;
  civitas: number;
  spectre: number;
}

interface TooltipPayload {
  name: string;
  value: number;
  color: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="rounded-lg border border-cyber-blue/30 bg-cyber-dark/90 p-3 backdrop-blur-sm">
      <p className="mb-1 text-xs text-cyber-text-dim">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="font-mono text-sm" style={{ color: entry.color }}>
          {entry.name}: {entry.value}%
        </p>
      ))}
    </div>
  );
};

function classifyEvent(event: DomainEvent): CityEvent {
  const metric = String(event.payload.metric ?? "");
  const type: CityEvent["type"] =
    metric === "crime"
      ? "crime"
      : metric === "traffic"
        ? "accident"
        : metric === "gdp" || metric === "happiness"
          ? "market"
          : "system";
  const severity: CityEvent["severity"] =
    event.type === "command.rejected"
      ? "high"
      : event.type === "observation.threshold"
        ? "medium"
        : "low";

  return {
    id: event.id,
    type,
    title: event.type,
    location: event.correlationId,
    time: `tick ${event.tick}`,
    severity,
  };
}

const getEventIcon = (type: CityEvent["type"]) =>
  type === "market" ? (
    <TrendingUp className="h-4 w-4" />
  ) : type === "system" ? (
    <Activity className="h-4 w-4" />
  ) : (
    <AlertTriangle className="h-4 w-4" />
  );

const getEventColor = (type: CityEvent["type"]) => {
  switch (type) {
    case "accident":
      return "text-cyber-orange";
    case "crime":
      return "text-cyber-red";
    case "market":
      return "text-cyber-yellow";
    default:
      return "text-cyber-blue";
  }
};

const getSeverityColor = (severity: CityEvent["severity"]) => {
  switch (severity) {
    case "high":
      return "bg-cyber-red";
    case "medium":
      return "bg-cyber-orange";
    default:
      return "bg-cyber-green";
  }
};

export default function DataAnalytics() {
  const { t } = useTranslation();
  const cityStats = useNexusStore((state) => state.cityStats);
  const history = useNexusStore((state) => state.cityStatsHistory);
  const simulation = useNexusStore((state) => state.simulation);
  const traces = useMemo(
    () => buildActionTraces(simulation.events),
    [simulation.events],
  );
  const resourceData = useMemo<ResourceData[]>(() => {
    const source =
      history.length > 0
        ? history.slice(-12)
        : [{ tick: simulation.world.tick, stats: cityStats }];

    return source.map((snapshot) => {
      const clock = advanceClock(
        simulation.initialState.clock,
        (snapshot.tick - simulation.initialState.tick) *
          simulation.configuration.minutesPerTick,
      );
      return {
        time: `${clock.hour.toString().padStart(2, "0")}:${clock.minute
          .toString()
          .padStart(2, "0")}`,
        power: snapshot.stats.energy,
        water: snapshot.stats.water,
        bandwidth: snapshot.stats.internet,
      };
    });
  }, [
    cityStats,
    history,
    simulation.configuration.minutesPerTick,
    simulation.initialState.clock,
    simulation.initialState.tick,
    simulation.world.tick,
  ]);
  const events = simulation.events
    .filter((event) => event.type !== "city.metrics.updated")
    .slice(-8)
    .reverse()
    .map(classifyEvent);
  const taskDomains: Array<{
    name: string;
    metrics: SimulationMetric[];
  }> = [
    { name: "Security", metrics: ["crime"] },
    {
      name: "Infrastructure",
      metrics: ["traffic", "energy", "pollution", "water", "medical"],
    },
    { name: "Economy", metrics: ["gdp", "happiness"] },
    { name: "Network", metrics: ["internet"] },
  ];
  const tasks: AgentTask[] = taskDomains.map((domain) => {
    const count = (agentId: string) =>
      Math.min(
        100,
        traces.filter(
          (trace) =>
            trace.agentId === agentId &&
            domain.metrics.includes(getTraceMetric(trace) ?? "crime"),
        ).length * 20,
      );
    return {
      name: domain.name,
      atlas: count("atlas"),
      economica: count("economica"),
      civitas: count("civitas"),
      spectre: count("spectre"),
    };
  });
  const threats = [
    { label: t("externalThreats"), value: Math.round(cityStats.crime), max: 100 },
    {
      label: t("systemIntegrity"),
      value: Math.round(
        (cityStats.energy + cityStats.water + cityStats.medical) / 3,
      ),
      max: 100,
    },
    { label: t("dataSecurity"), value: Math.round(cityStats.internet), max: 100 },
    {
      label: t("infrastructure"),
      value: Math.round(
        (cityStats.energy + cityStats.water + (100 - cityStats.traffic)) / 3,
      ),
      max: 100,
    },
  ];
  const metrics = [
    { label: "Population", value: cityStats.population.toLocaleString(), change: `tick ${simulation.world.tick}` },
    { label: "GDP", value: cityStats.gdp.toFixed(1), change: "shared world" },
    { label: "Power Output", value: `${cityStats.energy}%`, change: "live" },
    { label: "Water Reserve", value: `${cityStats.water}%`, change: "live" },
    { label: "Traffic Index", value: Math.round(cityStats.traffic), change: "live" },
    { label: "Crime Rate", value: Math.round(cityStats.crime), change: "live" },
  ];

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-cyber-blue/30 bg-cyber-blue/20 p-2">
            <BarChart3 className="h-6 w-6 text-cyber-blue" />
          </div>
          <div>
            <h1 className="text-3xl font-orbitron font-bold text-cyber-blue cyber-text-glow">
              {t("analytics_title")}
            </h1>
            <p className="mt-1 text-cyber-text-dim">{t("analytics_desc")}</p>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-cyber-blue/20 bg-cyber-dark/50 p-6">
          <div className="mb-4 flex items-center gap-2">
            <Activity className="h-5 w-5 text-cyber-blue" />
            <h2 className="text-lg font-orbitron text-cyber-text">
              {t("resourceConsumption")}
            </h2>
          </div>
          <div className="h-64 min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <AreaChart data={resourceData}>
                <defs>
                  <linearGradient id="colorPower" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00f0ff" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#00f0ff" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorWater" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00ff88" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#00ff88" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorBandwidth" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#b829ff" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#b829ff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" stroke="#4a4a5e" fontSize={10} tickLine={false} />
                <YAxis stroke="#4a4a5e" fontSize={10} tickLine={false} axisLine={false} domain={[0, 100]} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="power" stroke="#00f0ff" fill="url(#colorPower)" strokeWidth={2} name="Power" />
                <Area type="monotone" dataKey="water" stroke="#00ff88" fill="url(#colorWater)" strokeWidth={2} name="Water" />
                <Area type="monotone" dataKey="bandwidth" stroke="#b829ff" fill="url(#colorBandwidth)" strokeWidth={2} name="Bandwidth" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-xl border border-cyber-blue/20 bg-cyber-dark/50 p-6">
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-cyber-orange" />
            <h2 className="text-lg font-orbitron text-cyber-text">
              {t("cityEventTimeline")}
            </h2>
          </div>
          <div className="h-72 space-y-3 overflow-y-auto pr-2">
            {events.map((event) => (
              <div
                key={event.id}
                className="flex items-start gap-3 rounded-lg border border-cyber-gray/20 bg-cyber-gray/30 p-3"
              >
                <div className="rounded-lg bg-cyber-black/30 p-2">
                  <span className={getEventColor(event.type)}>
                    {getEventIcon(event.type)}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-cyber-text">
                      {event.title}
                    </p>
                    <div className={`h-2 w-2 shrink-0 rounded-full ${getSeverityColor(event.severity)}`} />
                  </div>
                  <p className="mt-1 truncate text-xs text-cyber-text-dim">{event.location}</p>
                  <p className="mt-1 font-mono text-xs text-cyber-blue">{event.time}</p>
                </div>
              </div>
            ))}
            {events.length === 0 && (
              <p className="text-sm text-cyber-text-dim">No domain events yet.</p>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-cyber-blue/20 bg-cyber-dark/50 p-6">
          <div className="mb-4 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-cyber-blue" />
            <h2 className="text-lg font-orbitron text-cyber-text">
              {t("aiAgentActivity")}
            </h2>
          </div>
          <div className="h-64 min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart data={tasks} layout="vertical">
                <XAxis type="number" stroke="#4a4a5e" fontSize={10} domain={[0, 100]} />
                <YAxis dataKey="name" type="category" stroke="#4a4a5e" fontSize={10} width={90} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="atlas" fill="#00f0ff" radius={[0, 4, 4, 0]} name="ATLAS" />
                <Bar dataKey="economica" fill="#f0ff00" radius={[0, 4, 4, 0]} name="ECONOMICA" />
                <Bar dataKey="civitas" fill="#ff00ff" radius={[0, 4, 4, 0]} name="CIVITAS" />
                <Bar dataKey="spectre" fill="#ff3366" radius={[0, 4, 4, 0]} name="SPECTRE" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-xl border border-cyber-blue/20 bg-cyber-dark/50 p-6">
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-cyber-red" />
            <h2 className="text-lg font-orbitron text-cyber-text">
              {t("threatLevelIndicators")}
            </h2>
          </div>
          <div className="space-y-5">
            {threats.map((threat) => (
              <div key={threat.label}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm text-cyber-text">{threat.label}</span>
                  <span className="font-mono text-lg font-bold text-cyber-blue">
                    {threat.value}%
                  </span>
                </div>
                <div className="h-3 overflow-hidden rounded-full border border-cyber-gray/30 bg-cyber-dark">
                  <div
                    className={`h-full rounded-full ${
                      threat.value > 80
                        ? "bg-cyber-green"
                        : threat.value > 50
                          ? "bg-cyber-orange"
                          : "bg-cyber-red"
                    }`}
                    style={{ width: `${(threat.value / threat.max) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-cyber-blue/20 bg-cyber-dark/50 p-6">
        <div className="mb-4 flex items-center gap-2">
          <Activity className="h-5 w-5 text-cyber-green" />
          <h2 className="text-lg font-orbitron text-cyber-text">
            {t("liveCityMetrics")}
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className="rounded-lg border border-cyber-gray/20 bg-cyber-gray/30 p-4"
            >
              <div className="mb-1 text-xs uppercase tracking-wider text-cyber-text-dim">
                {metric.label}
              </div>
              <div className="font-mono text-xl font-bold text-cyber-text">
                {metric.value}
              </div>
              <div className="mt-1 font-mono text-xs text-cyber-blue">
                {metric.change}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
