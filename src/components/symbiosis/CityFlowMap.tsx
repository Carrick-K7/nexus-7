"use client";

import {
  useMemo,
  useState,
} from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  Database,
  Network,
  Radio,
  Warehouse,
} from "lucide-react";
import type {
  HumanObservatoryReport,
  ObservatoryHealth,
} from "@/symbiosis/observatory";
import type {
  ResourceCode,
} from "@/symbiosis/contracts";

const RESOURCE_ORDER: ResourceCode[] = [
  "food",
  "water",
  "energy",
  "transport",
  "compute",
  "medical",
  "housing",
  "employment",
];

const RESOURCE_COLOR: Record<ResourceCode, string> = {
  food: "#9ee36d",
  water: "#58a6ff",
  energy: "#ffd166",
  transport: "#ff8c42",
  compute: "#c77dff",
  medical: "#ff5d8f",
  housing: "#4dd4ac",
  employment: "#00f0ff",
};

const RESOURCE_LABEL: Record<
  ResourceCode,
  { en: string; zh: string }
> = {
  food: { en: "Food", zh: "食物" },
  water: { en: "Water", zh: "水" },
  energy: { en: "Energy", zh: "能源" },
  transport: { en: "Transport", zh: "交通运力" },
  compute: { en: "Compute", zh: "算力" },
  medical: { en: "Medical", zh: "医疗能力" },
  housing: { en: "Housing", zh: "居住容量" },
  employment: { en: "Work", zh: "工作机会" },
};

const copy = {
  en: {
    title: "LIVING CITY FLOW",
    description:
      "A Cities: Skylines-style information layer over the settled city: every number below comes from the current Turn's persisted production, consumption, transfer, and inventory ledger.",
    all: "All flows",
    noTransfer:
      "No inter-community balancing was required for this resource in the current Turn. Local production and consumption still settled.",
    ledgers: "ledger rows",
    states: "resident states",
    events: "settled events",
    polling: "observer refreshes every 15 seconds",
    production: "Produced",
    consumption: "Consumed",
    inbound: "Moved in",
    outbound: "Moved out",
    inventory: "Inventory",
    net: "Net",
    pressure: "Pressure",
    resource: "Resource",
    equation: "Every row satisfies opening + produced + in = consumed + out + closing.",
    units: "modeled units",
  },
  zh: {
    title: "城市实时资源流",
    description:
      "借鉴《城市：天际线》的信息图层：下方每个数字都直接来自当前 Turn 已持久化的生产、消费、调度和库存资源账。",
    all: "全部流向",
    noTransfer:
      "当前 Turn 的该资源无需跨社区平衡；本地生产和消费仍已真实结算。",
    ledgers: "条资源账",
    states: "条居民状态",
    events: "个已结算事件",
    polling: "观测端每 15 秒同步",
    production: "生产",
    consumption: "消费",
    inbound: "调入",
    outbound: "调出",
    inventory: "期末库存",
    net: "净变化",
    pressure: "压力",
    resource: "资源",
    equation: "每行均满足：期初 + 生产 + 调入 = 消耗 + 调出 + 期末。",
    units: "模型单位",
  },
} as const;

const COMMUNITY_POSITION = [
  { x: 21, y: 70 },
  { x: 49, y: 56 },
  { x: 79, y: 27 },
] as const;

function compact(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function signed(value: number): string {
  if (value === 0) return "0";
  return `${value > 0 ? "+" : ""}${compact(value)}`;
}

function healthColor(status: ObservatoryHealth): string {
  if (status === "healthy") return "#4dd4ac";
  if (status === "watch") return "#00f0ff";
  if (status === "strained") return "#ffd166";
  return "#ff5d8f";
}

export default function CityFlowMap({
  data,
  language,
}: {
  data: HumanObservatoryReport;
  language: "en" | "zh";
}) {
  const text = copy[language];
  const [resource, setResource] = useState<ResourceCode | "all">("all");
  const positions = new Map(
    data.communities.map((community, index) => [
      community.id,
      COMMUNITY_POSITION[index] ?? { x: 50, y: 50 },
    ]),
  );
  const visibleTransfers = data.economy.transfers.filter(
    (transfer) => resource === "all" || transfer.resource === resource,
  );
  const visibleResources = useMemo(
    () =>
      data.economy.resources.filter(
        (entry) => resource === "all" || entry.resource === resource,
      ),
    [data.economy.resources, resource],
  );

  return (
    <section
      className="overflow-hidden rounded-3xl border border-cyber-blue/30 bg-cyber-darker/95"
      aria-labelledby="living-city-flow-title"
      data-testid="city-flow-map"
    >
      <div className="border-b border-cyber-gray-light p-5 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-4xl">
            <div className="flex items-center gap-2">
              <Radio className="h-5 w-5 text-cyber-green" aria-hidden="true" />
              <h2
                id="living-city-flow-title"
                className="font-orbitron text-sm text-cyber-green"
              >
                {text.title}
              </h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-cyber-text-dim">
              {text.description}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            {[
              [Database, data.economy.persistedLedgerRows, text.ledgers],
              [Activity, data.economy.residentStateRows, text.states],
              [Network, data.economy.settledEventCount, text.events],
              [Radio, "15s", text.polling],
            ].map(([Icon, value, label]) => {
              const MetricIcon = Icon as typeof Database;
              return (
                <div
                  key={String(label)}
                  className="rounded-xl border border-cyber-gray-light bg-cyber-black/45 px-3 py-2"
                >
                  <MetricIcon
                    className="mb-1 h-3.5 w-3.5 text-cyber-blue"
                    aria-hidden="true"
                  />
                  <strong className="font-mono text-cyber-text">
                    {String(value)}
                  </strong>
                  <span className="ml-1 text-cyber-text-dim">
                    {String(label)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <div
          className="mt-5 flex gap-2 overflow-x-auto pb-1"
          role="group"
          aria-label={language === "zh" ? "资源图层" : "Resource layer"}
        >
          <button
            type="button"
            onClick={() => setResource("all")}
            aria-pressed={resource === "all"}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${
              resource === "all"
                ? "border-cyber-blue bg-cyber-blue/15 text-cyber-blue"
                : "border-cyber-gray-light text-cyber-text-dim"
            }`}
          >
            {text.all}
          </button>
          {RESOURCE_ORDER.map((entry) => (
            <button
              key={entry}
              type="button"
              onClick={() => setResource(entry)}
              aria-pressed={resource === entry}
              className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${
                resource === entry
                  ? "border-cyber-blue bg-cyber-blue/15 text-cyber-text"
                  : "border-cyber-gray-light text-cyber-text-dim"
              }`}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: RESOURCE_COLOR[entry] }}
                aria-hidden="true"
              />
              {RESOURCE_LABEL[entry][language]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
        <div className="city-flow-canvas relative min-h-[420px] overflow-hidden border-b border-cyber-gray-light xl:border-b-0 xl:border-r">
          <svg
            viewBox="0 0 100 100"
            className="absolute inset-0 h-full w-full"
            role="img"
            aria-label={
              language === "zh"
                ? "三个社区及当前资源调度流向"
                : "Three communities and current resource transfer flows"
            }
          >
            <defs>
              <pattern
                id="city-grid"
                width="7"
                height="7"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M 7 0 L 0 0 0 7"
                  fill="none"
                  stroke="var(--city-grid-line)"
                  strokeWidth="0.25"
                />
              </pattern>
              <filter id="flow-glow">
                <feGaussianBlur stdDeviation="0.8" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <rect width="100" height="100" fill="url(#city-grid)" />
            {data.communities.slice(0, 2).map((community, index) => {
              const from = positions.get(community.id);
              const to = positions.get(data.communities[index + 1]?.id);
              if (!from || !to) return null;
              return (
                <line
                  key={`network-${community.id}`}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke="var(--city-network-line)"
                  strokeWidth="1.2"
                  strokeDasharray="2 2"
                />
              );
            })}
            {visibleTransfers.map((transfer, index) => {
              const from = positions.get(transfer.fromCommunityId);
              const to = positions.get(transfer.toCommunityId);
              if (!from || !to) return null;
              const middleX = (from.x + to.x) / 2;
              const middleY = (from.y + to.y) / 2 - 7 - index * 0.4;
              return (
                <path
                  key={`${transfer.eventId}-${index}`}
                  d={`M ${from.x} ${from.y} Q ${middleX} ${middleY} ${to.x} ${to.y}`}
                  fill="none"
                  stroke={RESOURCE_COLOR[transfer.resource]}
                  strokeWidth={Math.min(
                    3.5,
                    0.8 + Math.log10(Math.max(1, transfer.amount)) * 0.55,
                  )}
                  strokeLinecap="round"
                  opacity="0.85"
                  filter="url(#flow-glow)"
                />
              );
            })}
            {data.communities.map((community) => {
              const point = positions.get(community.id);
              if (!point) return null;
              return (
                <g key={community.id}>
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r="9"
                    fill="var(--city-node)"
                    stroke={healthColor(community.status)}
                    strokeWidth="1"
                  />
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r="5.5"
                    fill={healthColor(community.status)}
                    opacity="0.12"
                  />
                  <text
                    x={point.x}
                    y={point.y - 1}
                    textAnchor="middle"
                    fill="var(--city-node-text)"
                    fontSize="2.4"
                    fontWeight="700"
                  >
                    {community.name[language].split("（")[0].split(" (")[0]}
                  </text>
                  <text
                    x={point.x}
                    y={point.y + 3}
                    textAnchor="middle"
                    fill="var(--city-node-text-dim)"
                    fontSize="2"
                  >
                    {community.residentCount} ·{" "}
                    {Math.round(community.resourceContinuity * 100)}%
                  </text>
                </g>
              );
            })}
          </svg>
          <div className="absolute bottom-4 left-4 right-4 flex flex-wrap gap-2">
            {visibleTransfers.length === 0 ? (
              <p className="max-w-xl rounded-xl border border-cyber-gray-light bg-cyber-black/80 px-3 py-2 text-xs leading-5 text-cyber-text-dim">
                {text.noTransfer}
              </p>
            ) : (
              visibleTransfers.slice(0, 8).map((transfer) => (
                <span
                  key={`${transfer.eventId}-${transfer.fromCommunityId}-${transfer.toCommunityId}`}
                  className="rounded-full border border-cyber-gray-light bg-cyber-black/85 px-3 py-1.5 text-xs text-cyber-text"
                >
                  <span
                    className="mr-2 inline-block h-2 w-2 rounded-full"
                    style={{ background: RESOURCE_COLOR[transfer.resource] }}
                  />
                  {RESOURCE_LABEL[transfer.resource][language]}{" "}
                  {compact(transfer.amount)}
                </span>
              ))
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-px bg-cyber-gray-light sm:grid-cols-3 xl:grid-cols-2">
          {[
            [ArrowUpFromLine, text.production, data.economy.production],
            [ArrowDownToLine, text.consumption, data.economy.consumption],
            [Network, text.outbound, data.economy.transferred],
            [Warehouse, text.inventory, data.economy.inventory],
          ].map(([Icon, label, value]) => {
            const MetricIcon = Icon as typeof Database;
            return (
              <div
                key={String(label)}
                className="bg-cyber-black/55 p-5"
              >
                <MetricIcon
                  className="h-4 w-4 text-cyber-blue"
                  aria-hidden="true"
                />
                <p className="mt-3 text-xs text-cyber-text-dim">
                  {String(label)}
                </p>
                <p className="mt-1 font-mono text-2xl text-cyber-text">
                  {compact(Number(value))}
                </p>
                <p className="mt-1 text-[10px] text-cyber-text-dim">
                  {text.units}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <div
        className="overflow-x-auto border-t border-cyber-gray-light"
        tabIndex={0}
        aria-label={text.equation}
      >
        <table
          className="w-full min-w-[980px] text-left text-sm"
          data-testid="resource-ledger-table"
        >
          <thead className="bg-cyber-black/65 text-xs text-cyber-text-dim">
            <tr>
              <th className="px-4 py-3">{text.resource}</th>
              <th className="px-4 py-3">{text.production}</th>
              <th className="px-4 py-3">{text.consumption}</th>
              <th className="px-4 py-3">{text.inbound}</th>
              <th className="px-4 py-3">{text.outbound}</th>
              <th className="px-4 py-3">{text.inventory}</th>
              <th className="px-4 py-3">{text.net}</th>
              <th className="px-4 py-3">{text.pressure}</th>
            </tr>
          </thead>
          <tbody>
            {visibleResources.map((entry) => (
              <tr
                key={entry.resource}
                className="border-t border-cyber-gray-light bg-cyber-darker/85"
              >
                <td className="px-4 py-3">
                  <span
                    className="mr-2 inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: RESOURCE_COLOR[entry.resource] }}
                    aria-hidden="true"
                  />
                  <span className="text-cyber-text">
                    {RESOURCE_LABEL[entry.resource][language]}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-cyber-green">
                  {compact(entry.produced)}
                </td>
                <td className="px-4 py-3 font-mono text-cyber-orange">
                  {compact(entry.consumed)}
                </td>
                <td className="px-4 py-3 font-mono text-cyber-blue">
                  {compact(entry.transferredIn)}
                </td>
                <td className="px-4 py-3 font-mono text-cyber-purple">
                  {compact(entry.transferredOut)}
                </td>
                <td className="px-4 py-3 font-mono text-cyber-text">
                  {compact(entry.closing)} / {compact(entry.capacity)}
                </td>
                <td
                  className={`px-4 py-3 font-mono ${
                    entry.netChange >= 0
                      ? "text-cyber-green"
                      : "text-cyber-red"
                  }`}
                >
                  {signed(entry.netChange)}
                </td>
                <td className="px-4 py-3 font-mono text-cyber-text">
                  {Math.round(entry.pressure * 100)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-cyber-gray-light px-5 py-3 text-xs text-cyber-text-dim">
        {text.equation}
      </p>
    </section>
  );
}
