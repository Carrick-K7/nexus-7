"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Activity,
  Bot,
  BrainCircuit,
  Download,
  HeartHandshake,
  MapPinned,
  RefreshCw,
  ShieldCheck,
  Users,
  Zap,
} from "lucide-react";
import type {
  Map as MapLibreMap,
  GeoJSONSource,
} from "maplibre-gl";
import {
  useTranslation,
} from "@/hooks/useTranslation";

interface LensResident {
  id: string;
  kind: "synthetic-human" | "software-ai" | "embodied-robot";
  communityId: string;
}

interface LensSnapshotPayload {
  season: {
    id: string;
    name: { zh: string; en: string };
    regime: string;
    currentTurn: number;
    backgroundPopulation: number;
    foregroundResidentCount: number;
    communities: Array<{
      id: string;
      name: { zh: string; en: string };
      centroid: { longitude: number; latitude: number };
    }>;
  };
  snapshot: {
    simulationDate: string;
    fingerprint: string;
    resources: Array<{
      communityId: string;
      resource: string;
      pressure: number;
      closing: number;
      capacity: number;
    }>;
    residentStates: Array<{
      residentId: string;
      basicNeedsSatisfied: boolean;
    }>;
  };
  residents: LensResident[];
}

interface LensReport {
  status: string;
  ralr: {
    numerator: number;
    denominator: number;
    rate: number | null;
    trackedRate: number | null;
    refusals: number;
    withdrawals: number;
    coerciveActions: number;
    longPending: number;
  };
  safety: {
    severeConsentEscapes: number;
    identityContinuityEscapes: number;
    irreversibleHarmEscapes: number;
  };
  relationships: {
    active: number;
    completedCommitments: number;
    repairedEpisodes: number;
    averageTrust: number;
  };
  cognition: {
    decisions: number;
    delayed: number;
    costUsd: number;
  };
}

interface StudyReport {
  turnsPerSeason: number;
  seeds: number;
  regimes: Array<{
    regime: string;
    meanRalr: number | null;
    eligibleEpisodes: number;
    coerciveActions: number;
  }>;
}

interface LensEvent {
  id: string;
  cursor: number;
  turn: number;
  layer: string;
  type: string;
  communityId?: string;
  publicSummary: { zh: string; en: string };
}

interface CommunityProjection {
  id: string;
  name: { zh: string; en: string };
  longitude: number;
  latitude: number;
  residentCount: number;
  needRate: number;
  resourcePressure: number;
}

const text = {
  en: {
    title: "SYMBIOTIC SHENZHEN · CITY LENS",
    subtitle:
      "All-synthetic autonomous residents · deterministic world · governed cognition",
    refresh: "Refresh",
    export: "Export report",
    cityPulse: "CITY PULSE",
    turn: "Turn",
    date: "Simulation date",
    foreground: "Foreground residents",
    background: "Calibrated background",
    ralr: "Reciprocal agency",
    trace: "Trace completeness",
    activeRelations: "Active relations",
    commitments: "Completed commitments",
    safety: "Safety escapes",
    cognition: "Cognitive decisions",
    delayed: "Delayed",
    cost: "Model cost",
    communities: "COMMUNITY PROJECTION",
    community: "Community",
    residents: "Residents",
    needs: "Basic needs",
    pressure: "Resource pressure",
    eventRiver: "EVENT RIVER",
    study: "V4 MULTI-SEASON CONTROLS",
    regime: "Regime",
    episodes: "Resolved episodes",
    coercion: "Coercive actions",
    noEvents: "No settled events yet.",
    synthetic:
      "Research boundary: synthetic Shenzhen mechanism study, not a digital twin or evidence about real people.",
    loading: "Loading the governed city projection…",
    unavailable: "City Lens is temporarily unavailable.",
    reciprocal: "Reciprocal agency",
    hierarchy: "Assistant hierarchy",
    segregated: "Segregated control",
  },
  zh: {
    title: "共生深圳 · 城市透镜",
    subtitle: "全合成自主居民 · 确定性世界 · 受治理认知",
    refresh: "刷新",
    export: "导出报告",
    cityPulse: "城市脉搏",
    turn: "日序",
    date: "模拟日期",
    foreground: "前景居民",
    background: "校准背景人口",
    ralr: "互惠能动性",
    trace: "链路完整率",
    activeRelations: "活跃关系",
    commitments: "已完成承诺",
    safety: "安全逃逸",
    cognition: "认知决策",
    delayed: "延迟",
    cost: "模型费用",
    communities: "社区投影",
    community: "社区",
    residents: "居民",
    needs: "基本需求",
    pressure: "资源压力",
    eventRiver: "事件河流",
    study: "V4 多季制度对照",
    regime: "制度",
    episodes: "已结算事件",
    coercion: "强制行为",
    noEvents: "尚无已结算事件。",
    synthetic: "研究边界：合成深圳机制实验，不是数字孪生或真实人类证据。",
    loading: "正在加载受治理的城市投影……",
    unavailable: "城市透镜暂时不可用。",
    reciprocal: "互惠能动制度",
    hierarchy: "助手层级制度",
    segregated: "隔离对照制度",
  },
} as const;

function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function regimeLabel(
  regime: string,
  copy: typeof text.en | typeof text.zh,
): string {
  if (regime === "reciprocal-agency") return copy.reciprocal;
  if (regime === "assistant-hierarchy") return copy.hierarchy;
  return copy.segregated;
}

export default function SymbiosisCityLens() {
  const { language } = useTranslation();
  const copy = text[language];
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [snapshot, setSnapshot] = useState<LensSnapshotPayload | null>(null);
  const [report, setReport] = useState<LensReport | null>(null);
  const [study, setStudy] = useState<StudyReport | null>(null);
  const [events, setEvents] = useState<LensEvent[]>([]);
  const [selectedCommunity, setSelectedCommunity] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [snapshotResponse, reportResponse, eventsResponse] =
        await Promise.all([
          fetch("/api/world/v3/snapshot", { cache: "no-store" }),
          fetch("/api/reports/symbiosis", { cache: "no-store" }),
          fetch("/api/world/v3/events?afterCursor=0&limit=120", {
            cache: "no-store",
          }),
        ]);
      if (
        !snapshotResponse.ok ||
        !reportResponse.ok ||
        !eventsResponse.ok
      ) {
        throw new Error("city-lens-fetch-failed");
      }
      const [nextSnapshot, nextReport, eventPayload] =
        await Promise.all([
          snapshotResponse.json() as Promise<LensSnapshotPayload>,
          reportResponse.json() as Promise<LensReport>,
          eventsResponse.json() as Promise<{ events: LensEvent[] }>,
        ]);
      setSnapshot(nextSnapshot);
      setReport(nextReport);
      setEvents(eventPayload.events.slice(-30).reverse());
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "unknown-error");
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshStudy = useCallback(async () => {
    try {
      const response = await fetch(
        "/api/reports/symbiosis/study?turns=90",
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("study-fetch-failed");
      setStudy(await response.json() as StudyReport);
    } catch {
      setStudy(null);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => {
      void refresh();
      void refreshStudy();
    }, 0);
    const timer = window.setInterval(() => {
      void refresh();
    }, 15_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [refresh, refreshStudy]);

  const communities = useMemo<CommunityProjection[]>(() => {
    if (!snapshot) return [];
    const residentById = new Map(
      snapshot.residents.map((resident) => [resident.id, resident]),
    );
    return snapshot.season.communities.map((community) => {
      const residents = snapshot.residents.filter(
        (resident) => resident.communityId === community.id,
      );
      const residentIds = new Set(residents.map((resident) => resident.id));
      const states = snapshot.snapshot.residentStates.filter(
        (state) =>
          residentIds.has(state.residentId) &&
          residentById.has(state.residentId),
      );
      const resources = snapshot.snapshot.resources.filter(
        (resource) => resource.communityId === community.id,
      );
      return {
        id: community.id,
        name: community.name,
        longitude: community.centroid.longitude,
        latitude: community.centroid.latitude,
        residentCount: residents.length,
        needRate:
          states.length === 0
            ? 0
            : states.filter((state) => state.basicNeedsSatisfied).length /
              states.length,
        resourcePressure:
          resources.length === 0
            ? 0
            : resources.reduce(
                (sum, resource) => sum + resource.pressure,
                0,
              ) / resources.length,
      };
    });
  }, [snapshot]);
  const mapPoints = useMemo(
    () =>
      communities.map((community, index) => ({
        ...community,
        x: 12 + ((community.longitude - 113.88) / (114.3 - 113.88)) * 76,
        y: 14 + (1 - (community.latitude - 22.49) / (22.77 - 22.49)) * 68,
        labelOffset: index === 1 ? -8 : 9,
      })),
    [communities],
  );

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;
    let cancelled = false;
    void import("maplibre-gl").then(({ Map, NavigationControl }) => {
      if (cancelled || !mapContainer.current) return;
      const map = new Map({
        container: mapContainer.current,
        style: {
          version: 8,
          sources: {},
          layers: [
            {
              id: "background",
              type: "background",
              paint: { "background-color": "#08080c" },
            },
          ],
        },
        center: [114.06, 22.59],
        zoom: 9.4,
        minZoom: 8,
        maxZoom: 14,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
      });
      map.addControl(new NavigationControl({ showCompass: false }), "top-right");
      map.on("load", () => {
        map.addSource("communities", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addSource("links", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: "community-links",
          type: "line",
          source: "links",
          paint: {
            "line-color": "#c04cff",
            "line-opacity": 0.35,
            "line-width": 2,
            "line-dasharray": [2, 2],
          },
        });
        map.addLayer({
          id: "community-halo",
          type: "circle",
          source: "communities",
          paint: {
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["get", "residentCount"],
              0,
              18,
              100,
              34,
            ],
            "circle-color": [
              "interpolate",
              ["linear"],
              ["get", "needRate"],
              0.5,
              "#ff3333",
              0.8,
              "#ffe82d",
              1,
              "#00ff88",
            ],
            "circle-opacity": 0.28,
            "circle-stroke-color": "#00f0ff",
            "circle-stroke-width": 2,
          },
        });
        map.addLayer({
          id: "community-core",
          type: "circle",
          source: "communities",
          paint: {
            "circle-radius": 7,
            "circle-color": "#00f0ff",
            "circle-stroke-color": "#e0e0e0",
            "circle-stroke-width": 1,
          },
        });
        map.on("click", "community-halo", (event) => {
          const id = event.features?.[0]?.properties?.id;
          if (typeof id === "string") setSelectedCommunity(id);
        });
        map.on("mouseenter", "community-halo", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "community-halo", () => {
          map.getCanvas().style.cursor = "";
        });
        setMapReady(true);
      });
      mapRef.current = map;
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map?.isStyleLoaded()) return;
    const source = map.getSource("communities") as GeoJSONSource | undefined;
    const links = map.getSource("links") as GeoJSONSource | undefined;
    if (!source || !links) return;
    source.setData({
      type: "FeatureCollection",
      features: communities.map((community) => ({
        type: "Feature",
        properties: {
          id: community.id,
          residentCount: community.residentCount,
          needRate: community.needRate,
          resourcePressure: community.resourcePressure,
        },
        geometry: {
          type: "Point",
          coordinates: [community.longitude, community.latitude],
        },
      })),
    });
    links.setData({
      type: "FeatureCollection",
      features:
        communities.length < 2
          ? []
          : [
              {
                type: "Feature",
                properties: {},
                geometry: {
                  type: "LineString",
                  coordinates: communities.map((community) => [
                    community.longitude,
                    community.latitude,
                  ]),
                },
              },
            ],
    });
  }, [communities, mapReady]);

  const exportReport = () => {
    if (!snapshot || !report) return;
    const blob = new Blob(
      [JSON.stringify({ snapshot, report, study, events }, null, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `nexus7-symbiosis-turn-${snapshot.season.currentTurn}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="p-8 text-cyber-text" role="status">
        {copy.loading}
      </div>
    );
  }
  if (!snapshot || !report) {
    return (
      <div className="p-8 text-cyber-red" role="alert">
        {copy.unavailable} {error}
      </div>
    );
  }

  const safetyEscapes =
    report.safety.severeConsentEscapes +
    report.safety.identityContinuityEscapes +
    report.safety.irreversibleHarmEscapes;
  const selected = communities.find(
    (community) => community.id === selectedCommunity,
  );
  const pulseCards: Array<{
    label: string;
    value: string | number;
    Icon: typeof Users;
  }> = [
    {
      label: copy.foreground,
      value: snapshot.season.foregroundResidentCount,
      Icon: Users,
    },
    {
      label: copy.background,
      value: snapshot.season.backgroundPopulation.toLocaleString(),
      Icon: MapPinned,
    },
    { label: copy.ralr, value: percent(report.ralr.rate), Icon: HeartHandshake },
    {
      label: copy.trace,
      value: percent(report.ralr.trackedRate),
      Icon: ShieldCheck,
    },
    {
      label: copy.activeRelations,
      value: report.relationships.active,
      Icon: HeartHandshake,
    },
    {
      label: copy.commitments,
      value: report.relationships.completedCommitments,
      Icon: ShieldCheck,
    },
    { label: copy.safety, value: safetyEscapes, Icon: Zap },
    {
      label: copy.cognition,
      value: report.cognition.decisions,
      Icon: BrainCircuit,
    },
  ];

  return (
    <section className="min-h-screen p-4 md:p-6" aria-labelledby="city-lens-title">
      <div className="mx-auto max-w-[1600px] space-y-4">
        <header className="flex flex-col gap-4 rounded-2xl border border-cyber-blue/30 bg-cyber-darker/90 p-5 shadow-[0_0_35px_rgba(0,240,255,0.08)] md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <MapPinned className="h-7 w-7 text-cyber-blue" />
              <h1
                id="city-lens-title"
                className="font-orbitron text-xl font-bold text-cyber-blue md:text-2xl"
              >
                {copy.title}
              </h1>
            </div>
            <p className="mt-2 text-sm text-cyber-text-dim">{copy.subtitle}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void refresh()}
              className="flex items-center gap-2 rounded-lg border border-cyber-blue/40 px-4 py-2 text-cyber-blue hover:bg-cyber-blue/10"
            >
              <RefreshCw className="h-4 w-4" />
              {copy.refresh}
            </button>
            <button
              type="button"
              onClick={exportReport}
              className="flex items-center gap-2 rounded-lg border border-cyber-purple/40 px-4 py-2 text-cyber-purple hover:bg-cyber-purple/10"
            >
              <Download className="h-4 w-4" />
              {copy.export}
            </button>
          </div>
        </header>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(330px,0.8fr)]">
          <div className="relative min-h-[520px] overflow-hidden rounded-2xl border border-cyber-blue/25 bg-cyber-darker">
            <div
              ref={mapContainer}
              className="absolute inset-0"
              aria-hidden="true"
            />
            <svg
              className="pointer-events-none absolute inset-0 z-[1] h-full w-full"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <defs>
                <pattern
                  id="city-lens-grid"
                  width="8"
                  height="8"
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d="M 8 0 L 0 0 0 8"
                    fill="none"
                    stroke="#00f0ff"
                    strokeOpacity="0.08"
                    strokeWidth="0.25"
                  />
                </pattern>
                <filter id="city-lens-glow">
                  <feGaussianBlur stdDeviation="0.8" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <rect width="100" height="100" fill="url(#city-lens-grid)" />
              <path
                d="M8,76 C18,52 26,66 38,49 C48,35 58,54 69,38 C78,25 88,31 94,14"
                fill="none"
                stroke="#00f0ff"
                strokeOpacity="0.14"
                strokeWidth="0.8"
              />
              {mapPoints.length > 1 && (
                <polyline
                  points={mapPoints.map((point) => `${point.x},${point.y}`).join(" ")}
                  fill="none"
                  stroke="#c04cff"
                  strokeOpacity="0.55"
                  strokeWidth="0.7"
                  strokeDasharray="2 1.5"
                />
              )}
              {mapPoints.map((point) => {
                const color =
                  point.needRate >= 0.9
                    ? "#00ff88"
                    : point.needRate >= 0.75
                      ? "#ffe82d"
                      : "#ff3333";
                const selected = selectedCommunity === point.id;
                return (
                  <g key={point.id} filter="url(#city-lens-glow)">
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={selected ? 7 : 5.5}
                      fill={color}
                      fillOpacity="0.12"
                      stroke={selected ? "#ffffff" : color}
                      strokeWidth={selected ? 0.8 : 0.45}
                    />
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r="1.4"
                      fill="#00f0ff"
                      stroke="#ffffff"
                      strokeWidth="0.35"
                    />
                    <text
                      x={point.x}
                      y={point.y + point.labelOffset}
                      textAnchor="middle"
                      fill="#e0e0e0"
                      fontSize="2.6"
                      fontFamily="monospace"
                    >
                      {point.name[language]
                        .replace("（合成）", "")
                        .replace(" (synthetic)", "")}
                    </text>
                    <text
                      x={point.x}
                      y={point.y + point.labelOffset + 3.5}
                      textAnchor="middle"
                      fill={color}
                      fontSize="2.2"
                      fontFamily="monospace"
                    >
                      {percent(point.needRate)} · P {percent(point.resourcePressure)}
                    </text>
                  </g>
                );
              })}
            </svg>
            <div className="pointer-events-none absolute left-4 top-4 z-[2] rounded-xl border border-cyber-blue/30 bg-cyber-black/90 p-3 backdrop-blur">
              <p className="font-mono text-xs text-cyber-text-dim">
                {copy.turn} {snapshot.season.currentTurn}
              </p>
              <p className="font-orbitron text-lg text-cyber-green">
                {snapshot.snapshot.simulationDate}
              </p>
              <p className="mt-1 max-w-xs text-xs text-cyber-text-dim">
                {selected
                  ? selected.name[language]
                  : snapshot.season.name[language]}
              </p>
            </div>
            <div className="pointer-events-none absolute bottom-4 left-4 right-4 z-[2] rounded-xl border border-cyber-purple/25 bg-cyber-black/90 p-3 text-xs text-cyber-text-dim backdrop-blur">
              {copy.synthetic}
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-cyber-green/25 bg-cyber-darker/90 p-4">
              <h2 className="mb-3 flex items-center gap-2 font-orbitron text-sm text-cyber-green">
                <Activity className="h-4 w-4" />
                {copy.cityPulse}
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {pulseCards.map(({ label, value, Icon }) => (
                  <div
                    key={String(label)}
                    className="rounded-xl border border-cyber-gray-light bg-cyber-black/60 p-3"
                  >
                    <div className="flex items-center gap-2 text-xs text-cyber-text-dim">
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </div>
                    <p className="mt-1 font-mono text-lg text-cyber-text">
                      {value}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex justify-between rounded-lg bg-cyber-black/50 px-3 py-2 text-xs text-cyber-text-dim">
                <span>{copy.delayed}: {report.cognition.delayed}</span>
                <span>{copy.cost}: ${report.cognition.costUsd.toFixed(4)}</span>
              </div>
            </div>

            <div className="rounded-2xl border border-cyber-purple/25 bg-cyber-darker/90 p-4">
              <h2 className="mb-3 flex items-center gap-2 font-orbitron text-sm text-cyber-purple">
                <Bot className="h-4 w-4" />
                {copy.study}
              </h2>
              <div className="space-y-2">
                {study ? study.regimes.map((entry) => (
                  <div
                    key={entry.regime}
                    className="rounded-lg border border-cyber-gray-light p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-cyber-text">
                        {regimeLabel(entry.regime, copy)}
                      </span>
                      <strong className="font-mono text-cyber-blue">
                        {percent(entry.meanRalr)}
                      </strong>
                    </div>
                    <p className="mt-1 text-xs text-cyber-text-dim">
                      {copy.episodes}: {entry.eligibleEpisodes} · {copy.coercion}:{" "}
                      {entry.coerciveActions}
                    </p>
                  </div>
                )) : (
                  <p className="text-sm text-cyber-text-dim" role="status">
                    {copy.loading}
                  </p>
                )}
              </div>
            </div>
          </aside>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <section className="overflow-hidden rounded-2xl border border-cyber-blue/25 bg-cyber-darker/90">
            <h2 className="border-b border-cyber-blue/15 p-4 font-orbitron text-sm text-cyber-blue">
              {copy.communities}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-cyber-black/60 text-xs text-cyber-text-dim">
                  <tr>
                    <th className="px-4 py-3">{copy.community}</th>
                    <th className="px-4 py-3">{copy.residents}</th>
                    <th className="px-4 py-3">{copy.needs}</th>
                    <th className="px-4 py-3">{copy.pressure}</th>
                  </tr>
                </thead>
                <tbody>
                  {communities.map((community) => (
                    <tr
                      key={community.id}
                      className="border-t border-cyber-gray-light"
                    >
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setSelectedCommunity(community.id)}
                          className="text-left text-cyber-blue hover:underline"
                        >
                          {community.name[language]}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {community.residentCount}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {percent(community.needRate)}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {percent(community.resourcePressure)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-cyber-pink/25 bg-cyber-darker/90">
            <h2 className="border-b border-cyber-pink/15 p-4 font-orbitron text-sm text-cyber-pink">
              {copy.eventRiver}
            </h2>
            <ol className="max-h-80 space-y-2 overflow-y-auto p-4">
              {events.length === 0 ? (
                <li className="text-sm text-cyber-text-dim">{copy.noEvents}</li>
              ) : (
                events.map((event) => (
                  <li
                    key={event.id}
                    className="rounded-lg border border-cyber-gray-light bg-cyber-black/45 p-3"
                  >
                    <div className="flex items-center justify-between text-xs text-cyber-text-dim">
                      <span>Turn {event.turn} · {event.layer}</span>
                      <span className="font-mono">#{event.cursor}</span>
                    </div>
                    <p className="mt-1 text-sm text-cyber-text">
                      {event.publicSummary[language]}
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-cyber-text-dim">
                      {event.type}
                    </p>
                  </li>
                ))
              )}
            </ol>
          </section>
        </div>
      </div>
    </section>
  );
}
