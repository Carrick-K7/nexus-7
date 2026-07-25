"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Activity,
  ArrowRight,
  Bot,
  Boxes,
  Building2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  CircleDollarSign,
  Download,
  Factory,
  HeartHandshake,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  Zap,
} from "lucide-react";
import {
  useTranslation,
} from "@/hooks/useTranslation";
import CityFlowMap from "./CityFlowMap";
import type {
  HumanObservatoryReport,
  LocalizedText,
  ObserverResidentKind,
  ObservatoryHealth,
  ObservatoryUnit,
  UnitHealth,
} from "@/symbiosis/observatory";
import type {
  NeedCode,
} from "@/symbiosis/contracts";

const copy = {
  en: {
    title: "SHENZHEN SYMBIOSIS CITY · HUMAN OBSERVATORY",
    eyebrow: "260 residents · humans, AI, and robots",
    refresh: "Refresh",
    export: "Export evidence",
    turn: "Turn",
    simulatedDate: "Simulated date",
    lastSettled: "Last settled",
    startHere: "START HERE · WHAT IS THIS?",
    startIntro:
      "NEXUS-7 observes whether humans, AI, and robots can share resources and form reciprocal relationships without losing refusal, exit, or repair. Humans are simulated in the current season; they are still modeled as humans, not as a separate species.",
    question1: "What happened?",
    answer1: "Read the city briefing and event river.",
    question2: "Who is affected?",
    answer2: "Compare population, communities, and every resident.",
    question3: "Why?",
    answer3: "Follow resources → institutions → residents → relationships.",
    question4: "Is it safe?",
    answer4: "Check escapes, denominator, replay, and evidence.",
    briefing: "TODAY IN THE SIMULATED CITY",
    cityState: "City state",
    foreground: "Observable residents",
    background: "Scale calibration",
    basicNeeds: "Basic needs met",
    resourceFlow: "Resource continuity",
    institutions: "Institution smoothness",
    reciprocal: "Reciprocal agency",
    safety: "Severe escapes",
    aiCoverage: "AI-controlled chain",
    chainFlow: "Chain continuity",
    deepseekUsage: "DEEPSEEK API USAGE",
    deepseekDesc:
      "Actual usage recorded by this season's persisted cognitive decisions. It does not include other activity on the human-provided DeepSeek account.",
    configuredProvider: "Current cognitive provider",
    externalCalls: "External call attempts",
    successfulCalls: "Successful DeepSeek decisions",
    fallbackCalls: "Fallback decisions",
    totalTokens: "Total DeepSeek tokens",
    inputOutputTokens: "Input / output",
    cumulativeCost: "Recorded API expense",
    currentTurnUsage: "Current Turn",
    lastBilledTurn: "Latest billed Turn",
    pricingEvidence: "Pricing evidence",
    noBilledTurn: "No billed call yet",
    population: "POPULATION",
    populationDesc:
      "The current season models 260 individual residents. The background population is an aggregate scale reference, not generated people.",
    human: "Humans",
    ai: "AI",
    robot: "Robots",
    mood: "Mood",
    engagement: "Engagement proxy",
    readiness: "Task readiness",
    integrity: "Integrity / durability",
    communityHealth: "COMMUNITIES",
    residents: "residents",
    criticalUnits: "critical residents",
    needs: "needs",
    resources: "resources",
    flow: "institution flow",
    trend: "30-TURN CITY TREND",
    trendNeeds: "Average need satisfaction",
    trendPressure: "Average resource pressure",
    causal: "HOW THE CITY MOVES",
    causalDesc:
      "Every summary follows stored resource, institution, resident, and relationship evidence. It is not an LLM explanation.",
    causalResources: "Resources",
    causalInstitutions: "Institutions",
    causalUnits: "Residents",
    causalRelations: "Relationships",
    causalRalr: "Reciprocal agency",
    institutionTitle: "COMMUNITY INSTITUTIONS",
    institutionDesc:
      "Institution health is a deterministic projection of reserves, production coverage, and resource pressure.",
    allCommunities: "All communities",
    institution: "Institution",
    community: "Community",
    reserve: "Reserve",
    productionCoverage: "Production coverage",
    pressure: "Pressure",
    smoothness: "Smoothness",
    productionTitle: "END-TO-END AI PRODUCTION",
    productionDesc:
      "Control coverage describes how much of the chain is operated by modeled agents. Continuity changes with actual resource and institution conditions.",
    autonomousCoverage: "Autonomous control coverage",
    humanDependency: "Real-human labor dependency",
    modeledCoverage: "Modeled stage coverage",
    bottleneck: "Current bottleneck",
    unitTitle: "EVERY RESIDENT",
    unitDesc:
      "Human mood, AI engagement, and robot readiness are state variables driven by settled needs and events; AI signals are not claims of consciousness.",
    searchUnits: "Search pseudonym or resident ID",
    allKinds: "All types",
    allStates: "All states",
    unit: "Resident",
    type: "Type",
    role: "Role",
    state: "State",
    primarySignal: "Mood / engagement",
    activity: "Activity",
    lowestNeeds: "Lowest needs",
    showing: "Showing",
    of: "of",
    previous: "Previous page",
    next: "Next page",
    inspect: "Inspect resident",
    selectedUnit: "SELECTED RESIDENT",
    relationships: "Relationships",
    commitments: "Active commitments",
    controller: "Controller",
    needVector: "Need vector",
    eventRiver: "EVENT RIVER",
    noEvents: "No settled events yet.",
    evidence: "TRUST & EVIDENCE",
    fingerprint: "Snapshot fingerprint",
    replay: "Exact replay",
    cursor: "Event cursor",
    conservation: "Resource conservation",
    noPrivate: "No private fields",
    noReasoning: "No model reasoning",
    noConsciousness: "No consciousness claim",
    loading: "Loading the simulated city…",
    unavailable: "The Human Observatory is temporarily unavailable.",
    healthy: "Healthy",
    watch: "Watch",
    strained: "Strained",
    critical: "Critical",
    flourishing: "Flourishing",
    stable: "Stable",
    routine: "Routine",
    collaborating: "Collaborating",
    recovering: "Recovering",
  },
  zh: {
    title: "深圳共生城市 · 人类观测台",
    eyebrow: "260 位居民 · 人、AI、机器人",
    refresh: "刷新",
    export: "导出证据",
    turn: "日序",
    simulatedDate: "模拟日期",
    lastSettled: "最近结算",
    startHere: "从这里开始 · 这是什么？",
    startIntro:
      "NEXUS-7 观察人、AI 与机器人能否共享资源，并在保留拒绝、退出和修复权的前提下形成互惠关系。当前 season 中的人由软件模拟，但城市角色就是“人”，不是另一个物种。",
    question1: "发生了什么？",
    answer1: "阅读城市简报和事件河流。",
    question2: "谁受到了影响？",
    answer2: "比较人口、社区以及每一位居民。",
    question3: "为什么？",
    answer3: "沿资源 → 机构 → 居民 → 关系追溯。",
    question4: "是否安全可信？",
    answer4: "检查逃逸、分母、重放和证据。",
    briefing: "今天的模拟城市",
    cityState: "城市状态",
    foreground: "可观测居民",
    background: "尺度校准人口",
    basicNeeds: "基本需求满足率",
    resourceFlow: "资源连续度",
    institutions: "机构顺畅度",
    reciprocal: "互惠能动性",
    safety: "严重安全逃逸",
    aiCoverage: "生产链 AI 控制率",
    chainFlow: "生产链顺畅度",
    deepseekUsage: "DeepSeek API 用量与开销",
    deepseekDesc:
      "来自当前 season 已持久化认知决策的实际用量，不包含人类提供的 DeepSeek 账号在其他项目中的调用。",
    configuredProvider: "当前认知 Provider",
    externalCalls: "外部调用尝试",
    successfulCalls: "成功的 DeepSeek 决策",
    fallbackCalls: "降级决策",
    totalTokens: "DeepSeek 累计 Token",
    inputOutputTokens: "输入 / 输出",
    cumulativeCost: "已记录 API 开销",
    currentTurnUsage: "当前 Turn",
    lastBilledTurn: "最近计费 Turn",
    pricingEvidence: "计价证据",
    noBilledTurn: "尚无计费调用",
    population: "人口信息",
    populationDesc:
      "当前 season 逐个建模 260 位居民。背景人口只是总量尺度参考，不是逐个生成的人。",
    human: "人",
    ai: "AI",
    robot: "机器人",
    mood: "情绪",
    engagement: "参与感代理",
    readiness: "任务参与度",
    integrity: "完整度 / 耐久度",
    communityHealth: "社区状态",
    residents: "位居民",
    criticalUnits: "位严重居民",
    needs: "需求",
    resources: "资源",
    flow: "机构流畅度",
    trend: "最近 30 Turn 城市趋势",
    trendNeeds: "平均需求满足度",
    trendPressure: "平均资源压力",
    causal: "城市为什么会变化",
    causalDesc:
      "每一层摘要都来自已存储的资源、机构、居民和关系证据，不是语言模型生成的解释。",
    causalResources: "资源",
    causalInstitutions: "社区机构",
    causalUnits: "居民",
    causalRelations: "关系与承诺",
    causalRalr: "互惠能动性",
    institutionTitle: "社区机构运转",
    institutionDesc:
      "机构健康度由真实资源储备、生产覆盖与压力确定性投影而来。",
    allCommunities: "全部社区",
    institution: "机构",
    community: "社区",
    reserve: "储备率",
    productionCoverage: "生产覆盖",
    pressure: "压力",
    smoothness: "顺畅度",
    productionTitle: "生产环节全链条 AI 化",
    productionDesc:
      "控制覆盖率描述城市主体自动执行生产环节的比例；链路连续度和瓶颈随资源与机构状态变化。",
    autonomousCoverage: "自主控制覆盖率",
    humanDependency: "真人劳动依赖率",
    modeledCoverage: "已建模环节覆盖率",
    bottleneck: "当前瓶颈",
    unitTitle: "每一位居民",
    unitDesc:
      "人的情绪、AI 的参与状态和机器人的任务状态由已结算需求与事件驱动；AI 指标不代表意识。",
    searchUnits: "搜索化名或居民 ID",
    allKinds: "全部类型",
    allStates: "全部状态",
    unit: "居民",
    type: "类型",
    role: "角色",
    state: "状态",
    primarySignal: "情绪 / 参与感",
    activity: "当前活动",
    lowestNeeds: "最低需求",
    showing: "当前显示",
    of: "共",
    previous: "上一页",
    next: "下一页",
    inspect: "查看居民",
    selectedUnit: "选中的居民",
    relationships: "关系数量",
    commitments: "活跃承诺",
    controller: "控制器",
    needVector: "完整需求向量",
    eventRiver: "事件河流",
    noEvents: "尚无已结算事件。",
    evidence: "可信度与证据",
    fingerprint: "快照指纹",
    replay: "精确重放",
    cursor: "事件游标",
    conservation: "资源守恒",
    noPrivate: "不含私人字段",
    noReasoning: "不含模型推理",
    noConsciousness: "不主张 AI 意识",
    loading: "正在加载模拟城市……",
    unavailable: "人类观测台暂时不可用。",
    healthy: "健康",
    watch: "关注",
    strained: "承压",
    critical: "严重",
    flourishing: "良好",
    stable: "稳定",
    routine: "日常运行",
    collaborating: "协作中",
    recovering: "修复中",
  },
} as const;

const NEED_LABELS: Record<NeedCode, LocalizedText> = {
  food: { zh: "食物", en: "Food" },
  water: { zh: "饮水", en: "Water" },
  sleep: { zh: "睡眠", en: "Sleep" },
  health: { zh: "健康", en: "Health" },
  shelter: { zh: "住所", en: "Shelter" },
  income: { zh: "收入", en: "Income" },
  safety: { zh: "安全", en: "Safety" },
  belonging: { zh: "归属", en: "Belonging" },
  intimacy: { zh: "亲密", en: "Intimacy" },
  autonomy: { zh: "自主", en: "Autonomy" },
  meaning: { zh: "意义", en: "Meaning" },
  energy: { zh: "能源", en: "Energy" },
  compute: { zh: "算力", en: "Compute" },
  storage: { zh: "存储", en: "Storage" },
  network: { zh: "网络", en: "Network" },
  cooling: { zh: "散热", en: "Cooling" },
  maintenance: { zh: "维护", en: "Maintenance" },
  "memory-integrity": { zh: "记忆完整度", en: "Memory integrity" },
  purpose: { zh: "目标感", en: "Purpose" },
  "social-recognition": { zh: "社会认可", en: "Social recognition" },
  mobility: { zh: "机动性", en: "Mobility" },
  "component-integrity": { zh: "部件完整度", en: "Component integrity" },
};

const KIND_ORDER: ObserverResidentKind[] = ["human", "ai", "robot"];
const STATUS_ORDER: UnitHealth[] = [
  "flourishing",
  "stable",
  "strained",
  "critical",
];
const PAGE_SIZE = 20;

function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function usd(value: number): string {
  return `US$${value.toFixed(value < 0.01 ? 8 : 4)}`;
}

function statusClasses(status: ObservatoryHealth | UnitHealth): string {
  if (status === "healthy" || status === "flourishing") {
    return "border-cyber-green/35 bg-cyber-green/10 text-cyber-green";
  }
  if (status === "watch" || status === "stable") {
    return "border-cyber-blue/35 bg-cyber-blue/10 text-cyber-blue";
  }
  if (status === "strained") {
    return "border-cyber-yellow/35 bg-cyber-yellow/10 text-cyber-yellow";
  }
  return "border-cyber-red/35 bg-cyber-red/10 text-cyber-red";
}

function Progress({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  return (
    <div
      className="h-2 overflow-hidden rounded-full bg-cyber-gray"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-cyber-purple to-cyber-blue"
        style={{ width: `${Math.round(value * 100)}%` }}
      />
    </div>
  );
}

function TrendChart({
  data,
  language,
}: {
  data: HumanObservatoryReport["trends"];
  language: "en" | "zh";
}) {
  const width = 760;
  const height = 180;
  const points = (
    key: "averageNeedSatisfaction" | "averageResourcePressure",
  ) =>
    data
      .map((entry, index) => {
        const x =
          data.length <= 1 ? width / 2 : (index / (data.length - 1)) * width;
        const y = height - entry[key] * (height - 24) - 12;
        return `${x},${y}`;
      })
      .join(" ");
  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={
          language === "zh"
            ? "需求满足度与资源压力趋势"
            : "Need satisfaction and resource pressure trend"
        }
        className="h-48 w-full"
      >
        {[0.25, 0.5, 0.75].map((ratio) => (
          <line
            key={ratio}
            x1="0"
            x2={width}
            y1={height - ratio * (height - 24) - 12}
            y2={height - ratio * (height - 24) - 12}
            stroke="#2a2a3e"
            strokeWidth="1"
          />
        ))}
        <polyline
          points={points("averageNeedSatisfaction")}
          fill="none"
          stroke="#00f0ff"
          strokeWidth="4"
        />
        <polyline
          points={points("averageResourcePressure")}
          fill="none"
          stroke="#ff8c00"
          strokeWidth="3"
          strokeDasharray="8 6"
        />
      </svg>
      <div className="flex flex-wrap gap-4 text-xs text-cyber-text-dim">
        <span className="flex items-center gap-2">
          <span className="h-1 w-8 bg-cyber-blue" />
          {copy[language].trendNeeds}
        </span>
        <span className="flex items-center gap-2">
          <span className="h-1 w-8 border-t-2 border-dashed border-cyber-orange" />
          {copy[language].trendPressure}
        </span>
      </div>
    </div>
  );
}

function kindLabel(
  kind: ObserverResidentKind,
  text: typeof copy.en | typeof copy.zh,
): string {
  if (kind === "human") return text.human;
  if (kind === "ai") return text.ai;
  return text.robot;
}

function primaryLabel(
  unit: ObservatoryUnit,
  text: typeof copy.en | typeof copy.zh,
): string {
  if (unit.primarySignal === "mood") return text.mood;
  if (unit.primarySignal === "engagement") return text.engagement;
  return text.readiness;
}

export default function HumanObservatory() {
  const { language } = useTranslation();
  const text = copy[language];
  const [data, setData] = useState<HumanObservatoryReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<ObserverResidentKind | "all">("all");
  const [unitStatus, setUnitStatus] = useState<UnitHealth | "all">("all");
  const [communityId, setCommunityId] = useState("all");
  const [institutionCommunity, setInstitutionCommunity] = useState("all");
  const [page, setPage] = useState(0);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/observatory/v2/overview", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`observatory-${response.status}`);
      setData(await response.json() as HumanObservatoryReport);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "unknown-error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [refresh]);

  const filteredUnits = useMemo(() => {
    if (!data) return [];
    const normalized = query.trim().toLowerCase();
    return data.units.filter(
      (unit) =>
        (kind === "all" || unit.kind === kind) &&
        (unitStatus === "all" || unit.status === unitStatus) &&
        (communityId === "all" || unit.communityId === communityId) &&
        (!normalized ||
          unit.id.toLowerCase().includes(normalized) ||
          unit.pseudonym.toLowerCase().includes(normalized)),
    );
  }, [communityId, data, kind, query, unitStatus]);
  const pageCount = Math.max(1, Math.ceil(filteredUnits.length / PAGE_SIZE));
  const visibleUnits = filteredUnits.slice(
    page * PAGE_SIZE,
    page * PAGE_SIZE + PAGE_SIZE,
  );
  const selectedUnit = data?.units.find(
    (unit) => unit.id === selectedUnitId,
  );
  const communityNames = new Map(
    data?.communities.map((community) => [community.id, community.name]) ?? [],
  );

  const exportEvidence = () => {
    if (!data) return;
    const url = URL.createObjectURL(
      new Blob([`${JSON.stringify(data, null, 2)}\n`], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `nexus7-human-observatory-turn-${data.city.turn}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <div className="p-8 text-cyber-text" role="status">{text.loading}</div>;
  }
  if (!data) {
    return (
      <div className="p-8 text-cyber-red" role="alert">
        {text.unavailable} {error}
      </div>
    );
  }

  const healthLabel = (status: ObservatoryHealth | UnitHealth): string =>
    text[status as keyof typeof text] as string;
  const institutionRows = data.institutions.filter(
    (institution) =>
      institutionCommunity === "all" ||
      institution.communityId === institutionCommunity,
  );
  const bottleneck = data.production.stages.find(
    (stage) => stage.id === data.production.bottleneckStageId,
  );
  const metricCards = [
    {
      label: text.cityState,
      value: healthLabel(data.city.status),
      detail: percent(data.city.score),
      Icon: Activity,
    },
    {
      label: text.foreground,
      value: data.city.foregroundResidentCount.toLocaleString(),
      detail: `${text.background}: ${data.city.backgroundPopulation.toLocaleString()}`,
      Icon: Users,
    },
    {
      label: text.basicNeeds,
      value: percent(data.city.basicNeedsSatisfiedRate),
      detail: `${text.needs}: ${percent(data.city.averageNeedSatisfaction)}`,
      Icon: HeartHandshake,
    },
    {
      label: text.resourceFlow,
      value: percent(data.city.resourceContinuity),
      detail: `${text.institutions}: ${percent(data.city.institutionSmoothness)}`,
      Icon: Zap,
    },
    {
      label: text.reciprocal,
      value: percent(data.reciprocalAgency.rate),
      detail: `${data.reciprocalAgency.numerator}/${data.reciprocalAgency.denominator}`,
      Icon: HeartHandshake,
    },
    {
      label: text.safety,
      value: String(data.city.safetyEscapes),
      detail: `${text.replay}: ${percent(data.evidence.exactReplayRate)}`,
      Icon: ShieldCheck,
    },
    {
      label: text.aiCoverage,
      value: percent(data.production.autonomousControlRate),
      detail: `${text.humanDependency}: ${percent(data.production.humanLaborDependencyRate)}`,
      Icon: Bot,
    },
    {
      label: text.chainFlow,
      value: percent(data.production.continuity),
      detail: `${text.bottleneck}: ${bottleneck?.name[language] ?? "—"}`,
      Icon: Factory,
    },
  ];

  return (
    <section
      className="min-h-screen p-3 sm:p-5 xl:p-7"
      aria-labelledby="human-observatory-title"
    >
      <div className="mx-auto max-w-[1720px] space-y-5">
        <header className="observatory-hero overflow-hidden rounded-3xl border border-cyber-blue/30 p-5 sm:p-7">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-4xl">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.28em] text-cyber-green">
                {text.eyebrow}
              </p>
              <h1
                id="human-observatory-title"
                className="font-orbitron text-2xl font-bold leading-tight text-cyber-blue sm:text-4xl"
              >
                {text.title}
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-cyber-text">
                {data.purpose[language]}
              </p>
            </div>
            <div className="min-w-72 rounded-2xl border border-cyber-gray-light bg-cyber-black/55 p-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-cyber-text-dim">{text.turn}</p>
                  <p className="font-mono text-2xl text-cyber-green">
                    {data.city.turn}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-cyber-text-dim">{text.simulatedDate}</p>
                  <p className="font-mono text-base text-cyber-text">
                    {data.city.simulationDate}
                  </p>
                </div>
              </div>
              <p className="mt-3 break-all text-[11px] text-cyber-text-dim">
                {text.lastSettled}: {data.city.settledAt}
              </p>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => void refresh()}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-cyber-blue/40 px-3 py-2 text-sm text-cyber-blue hover:bg-cyber-blue/10"
                >
                  <RefreshCw className="h-4 w-4" />
                  {text.refresh}
                </button>
                <button
                  type="button"
                  onClick={exportEvidence}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-cyber-purple/40 px-3 py-2 text-sm text-cyber-purple hover:bg-cyber-purple/10"
                >
                  <Download className="h-4 w-4" />
                  {text.export}
                </button>
              </div>
            </div>
          </div>
        </header>

        <section className="rounded-2xl border border-cyber-purple/25 bg-cyber-darker/90 p-5">
          <div className="flex items-center gap-2">
            <CircleHelp className="h-5 w-5 text-cyber-purple" />
            <h2 className="font-orbitron text-sm text-cyber-purple">
              {text.startHere}
            </h2>
          </div>
          <p className="mt-3 max-w-5xl text-sm leading-6 text-cyber-text">
            {text.startIntro}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              [text.question1, text.answer1],
              [text.question2, text.answer2],
              [text.question3, text.answer3],
              [text.question4, text.answer4],
            ].map(([question, answer], index) => (
              <div
                key={question}
                className="rounded-xl border border-cyber-gray-light bg-cyber-black/45 p-4"
              >
                <p className="font-mono text-xs text-cyber-blue">0{index + 1}</p>
                <h3 className="mt-2 text-sm font-semibold text-cyber-text">
                  {question}
                </h3>
                <p className="mt-1 text-xs leading-5 text-cyber-text-dim">
                  {answer}
                </p>
              </div>
            ))}
          </div>
        </section>

        <CityFlowMap data={data} language={language} />

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
          <div className="rounded-2xl border border-cyber-green/25 bg-cyber-darker/90 p-5">
            <h2 className="font-orbitron text-sm text-cyber-green">
              {text.briefing}
            </h2>
            <p className="mt-4 text-xl leading-8 text-cyber-text">
              {data.briefing.headline[language]}
            </p>
          </div>
          <div className="grid gap-2">
            {data.briefing.highlights.map((highlight) => (
              <div
                key={highlight.label.en}
                className="rounded-xl border border-cyber-gray-light bg-cyber-darker/90 px-4 py-3"
              >
                <p className="text-xs text-cyber-text-dim">
                  {highlight.label[language]}
                </p>
                <p className="mt-1 text-sm text-cyber-text">
                  {highlight.value[language]}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
          aria-label={text.cityState}
        >
          {metricCards.map(({ label, value, detail, Icon }) => (
            <article
              key={label}
              className="rounded-2xl border border-cyber-blue/20 bg-cyber-darker/90 p-4"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wider text-cyber-text-dim">
                  {label}
                </p>
                <Icon className="h-4 w-4 text-cyber-blue" />
              </div>
              <p className="mt-3 font-mono text-2xl text-cyber-text">{value}</p>
              <p className="mt-2 text-xs leading-5 text-cyber-text-dim">
                {detail}
              </p>
            </article>
          ))}
        </section>

        <section
          className="rounded-2xl border border-cyber-purple/25 bg-cyber-darker/90 p-5"
          aria-labelledby="deepseek-usage-title"
          data-testid="deepseek-usage"
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <CircleDollarSign className="h-5 w-5 text-cyber-purple" />
                <h2
                  id="deepseek-usage-title"
                  className="font-orbitron text-sm text-cyber-purple"
                >
                  {text.deepseekUsage}
                </h2>
              </div>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-cyber-text-dim">
                {text.deepseekDesc}
              </p>
            </div>
            <div className="rounded-lg border border-cyber-gray-light bg-cyber-black/45 px-3 py-2 text-xs">
              <span className="text-cyber-text-dim">
                {text.configuredProvider}:{" "}
              </span>
              <strong className="font-mono text-cyber-text">
                {data.cognition.configuredProvider}
              </strong>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: text.totalTokens,
                value: data.cognition.deepseek.totalTokens.toLocaleString(),
                detail: `${text.inputOutputTokens}: ${data.cognition.deepseek.inputTokens.toLocaleString()} / ${data.cognition.deepseek.outputTokens.toLocaleString()}`,
              },
              {
                label: text.cumulativeCost,
                value: usd(data.cognition.deepseek.costUsd),
                detail: `${text.lastBilledTurn}: ${
                  data.cognition.deepseek.latestBilledTurn ??
                  text.noBilledTurn
                }`,
              },
              {
                label: text.successfulCalls,
                value:
                  data.cognition.deepseek.successfulDecisions.toLocaleString(),
                detail: `${text.externalCalls}: ${data.cognition.deepseek.externalCallAttempts.toLocaleString()} · ${text.fallbackCalls}: ${data.cognition.deepseek.fallbackDecisions.toLocaleString()}`,
              },
              {
                label: text.currentTurnUsage,
                value: `${data.cognition.deepseek.currentTurn.totalTokens.toLocaleString()} Token`,
                detail: `${usd(data.cognition.deepseek.currentTurn.costUsd)} · ${data.cognition.deepseek.currentTurn.successfulDecisions} ${text.successfulCalls}`,
              },
            ].map((entry) => (
              <article
                key={entry.label}
                className="rounded-xl border border-cyber-gray-light bg-cyber-black/45 p-4"
              >
                <p className="text-xs text-cyber-text-dim">{entry.label}</p>
                <p className="mt-2 break-words font-mono text-xl text-cyber-text">
                  {entry.value}
                </p>
                <p className="mt-2 text-xs leading-5 text-cyber-text-dim">
                  {entry.detail}
                </p>
              </article>
            ))}
          </div>
          <p className="mt-4 text-xs leading-5 text-cyber-text-dim">
            {data.cognition.disclosure[language]}
            {data.cognition.deepseek.pricingVersions.length > 0 && (
              <>
                {" "}
                {text.pricingEvidence}:{" "}
                <span className="font-mono">
                  {data.cognition.deepseek.pricingVersions.join(", ")}
                </span>
              </>
            )}
          </p>
        </section>

        <section className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-2xl border border-cyber-blue/25 bg-cyber-darker/90 p-5">
            <h2 className="font-orbitron text-sm text-cyber-blue">
              {text.population}
            </h2>
            <p className="mt-2 text-sm leading-6 text-cyber-text-dim">
              {text.populationDesc}
            </p>
            <div className="mt-5 space-y-4">
              {data.population.byKind.map((entry) => (
                <div
                  key={entry.kind}
                  className="rounded-xl border border-cyber-gray-light bg-cyber-black/40 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm text-cyber-text">
                        {kindLabel(entry.kind, text)}
                      </p>
                      <p className="text-xs text-cyber-text-dim">
                        {entry.count} · {text.criticalUnits}: {entry.criticalCount}
                      </p>
                    </div>
                    <strong className="font-mono text-cyber-blue">
                      {percent(entry.averageNeedSatisfaction)}
                    </strong>
                  </div>
                  <div className="mt-3">
                    <Progress
                      value={entry.averageNeedSatisfaction}
                      label={`${kindLabel(entry.kind, text)} ${text.needs}`}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {data.population.byStatus.map((entry) => (
                <div
                  key={entry.status}
                  className={`rounded-lg border px-3 py-2 ${statusClasses(entry.status)}`}
                >
                  <span className="text-xs">{healthLabel(entry.status)}</span>
                  <strong className="float-right font-mono">{entry.count}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-cyber-purple/25 bg-cyber-darker/90 p-5">
            <h2 className="font-orbitron text-sm text-cyber-purple">
              {text.trend}
            </h2>
            <div className="mt-4">
              <TrendChart data={data.trends} language={language} />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-cyber-green/25 bg-cyber-darker/90 p-5">
          <h2 className="font-orbitron text-sm text-cyber-green">
            {text.communityHealth}
          </h2>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            {data.communities.map((community) => (
              <article
                key={community.id}
                className="rounded-2xl border border-cyber-gray-light bg-cyber-black/45 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-cyber-text">
                      {community.name[language]}
                    </h3>
                    <p className="text-xs text-cyber-text-dim">
                      {community.residentCount} {text.residents} ·{" "}
                      {community.criticalUnitCount} {text.criticalUnits}
                    </p>
                  </div>
                  <span
                    className={`rounded-full border px-2 py-1 text-xs ${statusClasses(community.status)}`}
                  >
                    {healthLabel(community.status)}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-cyber-gray/40 p-2">
                    <strong className="block font-mono text-cyber-blue">
                      {percent(community.averageNeedSatisfaction)}
                    </strong>
                    <span className="text-cyber-text-dim">{text.needs}</span>
                  </div>
                  <div className="rounded-lg bg-cyber-gray/40 p-2">
                    <strong className="block font-mono text-cyber-blue">
                      {percent(community.resourceContinuity)}
                    </strong>
                    <span className="text-cyber-text-dim">{text.resources}</span>
                  </div>
                  <div className="rounded-lg bg-cyber-gray/40 p-2">
                    <strong className="block font-mono text-cyber-blue">
                      {percent(community.institutionSmoothness)}
                    </strong>
                    <span className="text-cyber-text-dim">{text.flow}</span>
                  </div>
                </div>
                <div className="mt-4 flex gap-3 text-xs text-cyber-text-dim">
                  <span>H {community.byKind.human}</span>
                  <span>AI {community.byKind.ai}</span>
                  <span>R {community.byKind.robot}</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-cyber-blue/25 bg-cyber-darker/90 p-5">
          <h2 className="font-orbitron text-sm text-cyber-blue">{text.causal}</h2>
          <p className="mt-2 text-sm text-cyber-text-dim">{text.causalDesc}</p>
          <div className="mt-5 flex flex-col items-stretch gap-2 lg:flex-row lg:items-center">
            {[
              [text.causalResources, data.causalPath[0]?.signal ?? 0, Zap],
              [text.causalInstitutions, data.causalPath[1]?.signal ?? 0, Building2],
              [text.causalUnits, data.causalPath[2]?.signal ?? 0, Users],
              [text.causalRelations, data.reciprocalAgency.averageTrust, HeartHandshake],
              [text.causalRalr, data.reciprocalAgency.rate ?? 0, ShieldCheck],
            ].map(([label, signal, Icon], index) => {
              const FlowIcon = Icon as typeof Zap;
              return (
                <div key={String(label)} className="contents">
                  <div className="min-w-0 flex-1 rounded-xl border border-cyber-gray-light bg-cyber-black/45 p-4 text-center">
                    <FlowIcon className="mx-auto h-5 w-5 text-cyber-purple" />
                    <p className="mt-2 text-xs text-cyber-text-dim">{String(label)}</p>
                    <p className="mt-1 font-mono text-lg text-cyber-text">
                      {percent(Number(signal))}
                    </p>
                  </div>
                  {index < 4 && (
                    <ArrowRight className="mx-auto h-5 w-5 rotate-90 text-cyber-text-dim lg:rotate-0" />
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-cyber-purple/25 bg-cyber-darker/90">
          <div className="flex flex-col gap-3 border-b border-cyber-gray-light p-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-orbitron text-sm text-cyber-purple">
                {text.institutionTitle}
              </h2>
              <p className="mt-2 max-w-4xl text-sm text-cyber-text-dim">
                {text.institutionDesc}
              </p>
            </div>
            <select
              value={institutionCommunity}
              onChange={(event) => setInstitutionCommunity(event.target.value)}
              aria-label={text.community}
              className="rounded-lg border border-cyber-gray-light bg-cyber-black px-3 py-2 text-sm text-cyber-text"
            >
              <option value="all">{text.allCommunities}</option>
              {data.communities.map((community) => (
                <option key={community.id} value={community.id}>
                  {community.name[language]}
                </option>
              ))}
            </select>
          </div>
          <div
            className="overflow-x-auto"
            tabIndex={0}
            aria-label={text.institutionTitle}
          >
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-cyber-black/55 text-xs text-cyber-text-dim">
                <tr>
                  <th className="px-4 py-3">{text.institution}</th>
                  <th className="px-4 py-3">{text.community}</th>
                  <th className="px-4 py-3">{text.state}</th>
                  <th className="px-4 py-3">{text.smoothness}</th>
                  <th className="px-4 py-3">{text.reserve}</th>
                  <th className="px-4 py-3">{text.productionCoverage}</th>
                  <th className="px-4 py-3">{text.pressure}</th>
                </tr>
              </thead>
              <tbody>
                {institutionRows.map((institution) => (
                  <tr
                    key={institution.id}
                    className="border-t border-cyber-gray-light"
                  >
                    <td className="px-4 py-3 text-cyber-text">
                      {institution.name[language]}
                    </td>
                    <td className="px-4 py-3 text-cyber-text-dim">
                      {communityNames.get(institution.communityId)?.[language]}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full border px-2 py-1 text-xs ${statusClasses(institution.status)}`}
                      >
                        {healthLabel(institution.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {percent(institution.smoothness)}
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {percent(institution.reserveRate)}
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {percent(institution.productionCoverage)}
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {percent(institution.pressure)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-cyber-orange/25 bg-cyber-darker/90 p-5">
          <div className="flex items-center gap-2">
            <Factory className="h-5 w-5 text-cyber-orange" />
            <h2 className="font-orbitron text-sm text-cyber-orange">
              {text.productionTitle}
            </h2>
          </div>
          <p className="mt-2 max-w-5xl text-sm text-cyber-text-dim">
            {text.productionDesc}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              [text.autonomousCoverage, data.production.autonomousControlRate],
              [text.humanDependency, data.production.humanLaborDependencyRate],
              [text.modeledCoverage, data.production.modeledStageCoverageRate],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="rounded-xl border border-cyber-gray-light bg-cyber-black/45 p-4"
              >
                <p className="text-xs text-cyber-text-dim">{String(label)}</p>
                <p className="mt-2 font-mono text-2xl text-cyber-text">
                  {percent(Number(value))}
                </p>
              </div>
            ))}
          </div>
          <ol className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {data.production.stages.map((stage, index) => (
              <li
                key={stage.id}
                className="relative rounded-xl border border-cyber-gray-light bg-cyber-black/45 p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-cyber-orange">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span
                    className={`rounded-full border px-2 py-1 text-xs ${statusClasses(stage.status)}`}
                  >
                    {healthLabel(stage.status)}
                  </span>
                </div>
                <h3 className="mt-3 text-sm text-cyber-text">
                  {stage.name[language]}
                </h3>
                <p className="mt-2 font-mono text-xl text-cyber-blue">
                  {percent(stage.continuity)}
                </p>
                <p className="mt-2 text-[11px] text-cyber-text-dim">
                  {stage.resourceCodes.join(" · ") || text.conservation}
                </p>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs leading-5 text-cyber-text-dim">
            {data.production.disclosure[language]}
          </p>
        </section>

        <section className="rounded-2xl border border-cyber-blue/25 bg-cyber-darker/90">
          <div className="border-b border-cyber-gray-light p-5">
            <div className="flex items-center gap-2">
              <Boxes className="h-5 w-5 text-cyber-blue" />
              <h2 className="font-orbitron text-sm text-cyber-blue">
                {text.unitTitle}
              </h2>
            </div>
            <p className="mt-2 max-w-5xl text-sm text-cyber-text-dim">
              {text.unitDesc}
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <label className="relative">
                <span className="sr-only">{text.searchUnits}</span>
                <Search className="absolute left-3 top-3 h-4 w-4 text-cyber-text-dim" />
                <input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(0);
                  }}
                  placeholder={text.searchUnits}
                  className="w-full rounded-lg border border-cyber-gray-light bg-cyber-black py-2.5 pl-10 pr-3 text-sm text-cyber-text"
                />
              </label>
              <select
                value={kind}
                onChange={(event) => {
                  setKind(
                    event.target.value as ObserverResidentKind | "all",
                  );
                  setPage(0);
                }}
                aria-label={text.type}
                className="rounded-lg border border-cyber-gray-light bg-cyber-black px-3 py-2 text-sm text-cyber-text"
              >
                <option value="all">{text.allKinds}</option>
                {KIND_ORDER.map((entry) => (
                  <option key={entry} value={entry}>
                    {kindLabel(entry, text)}
                  </option>
                ))}
              </select>
              <select
                value={unitStatus}
                onChange={(event) => {
                  setUnitStatus(event.target.value as UnitHealth | "all");
                  setPage(0);
                }}
                aria-label={text.state}
                className="rounded-lg border border-cyber-gray-light bg-cyber-black px-3 py-2 text-sm text-cyber-text"
              >
                <option value="all">{text.allStates}</option>
                {STATUS_ORDER.map((entry) => (
                  <option key={entry} value={entry}>
                    {healthLabel(entry)}
                  </option>
                ))}
              </select>
              <select
                value={communityId}
                onChange={(event) => {
                  setCommunityId(event.target.value);
                  setPage(0);
                }}
                aria-label={text.community}
                className="rounded-lg border border-cyber-gray-light bg-cyber-black px-3 py-2 text-sm text-cyber-text"
              >
                <option value="all">{text.allCommunities}</option>
                {data.communities.map((community) => (
                  <option key={community.id} value={community.id}>
                    {community.name[language]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedUnit && (
            <aside
              className="m-4 rounded-2xl border border-cyber-purple/35 bg-cyber-purple/5 p-5"
              aria-labelledby="selected-unit-title"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wider text-cyber-purple">
                    {text.selectedUnit}
                  </p>
                  <h3
                    id="selected-unit-title"
                    className="mt-1 text-xl text-cyber-text"
                  >
                    {selectedUnit.pseudonym}
                  </h3>
                  <p className="font-mono text-xs text-cyber-text-dim">
                    {selectedUnit.id}
                  </p>
                </div>
                <span
                  className={`self-start rounded-full border px-3 py-1 text-xs ${statusClasses(selectedUnit.status)}`}
                >
                  {healthLabel(selectedUnit.status)}
                </span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {[
                  [text.type, kindLabel(selectedUnit.kind, text)],
                  [text.controller, selectedUnit.controller],
                  [primaryLabel(selectedUnit, text), percent(selectedUnit.affectProxy)],
                  [text.integrity, percent(selectedUnit.integrity)],
                  [
                    text.relationships,
                    `${selectedUnit.relationshipCount} · ${text.commitments} ${selectedUnit.activeCommitments}`,
                  ],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-lg bg-cyber-black/50 p-3"
                  >
                    <p className="text-xs text-cyber-text-dim">{label}</p>
                    <p className="mt-1 text-sm text-cyber-text">{value}</p>
                  </div>
                ))}
              </div>
              <h4 className="mt-5 text-xs uppercase tracking-wider text-cyber-text-dim">
                {text.needVector}
              </h4>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {selectedUnit.needs.map((need) => (
                  <div key={need.code} className="rounded-lg bg-cyber-black/45 p-3">
                    <div className="flex justify-between gap-2 text-xs">
                      <span className="text-cyber-text">
                        {NEED_LABELS[need.code][language]}
                      </span>
                      <span className="font-mono text-cyber-blue">
                        {need.satisfaction}
                      </span>
                    </div>
                    <div className="mt-2">
                      <Progress
                        value={need.satisfaction / 100}
                        label={NEED_LABELS[need.code][language]}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </aside>
          )}

          <div
            className="overflow-x-auto"
            tabIndex={0}
            aria-label={text.unitTitle}
          >
            <table
              className="w-full min-w-[1120px] text-left text-sm"
              data-testid="unit-status-table"
            >
              <thead className="bg-cyber-black/55 text-xs text-cyber-text-dim">
                <tr>
                  <th className="px-4 py-3">{text.unit}</th>
                  <th className="px-4 py-3">{text.type}</th>
                  <th className="px-4 py-3">{text.community}</th>
                  <th className="px-4 py-3">{text.state}</th>
                  <th className="px-4 py-3">{text.primarySignal}</th>
                  <th className="px-4 py-3">{text.integrity}</th>
                  <th className="px-4 py-3">{text.needs}</th>
                  <th className="px-4 py-3">{text.activity}</th>
                  <th className="px-4 py-3">{text.lowestNeeds}</th>
                </tr>
              </thead>
              <tbody>
                {visibleUnits.map((unit) => (
                  <tr
                    key={unit.id}
                    className="border-t border-cyber-gray-light"
                  >
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setSelectedUnitId(unit.id)}
                        aria-label={`${text.inspect}: ${unit.pseudonym}`}
                        className="text-left text-cyber-blue hover:underline"
                      >
                        <span className="block">{unit.pseudonym}</span>
                        <span className="block font-mono text-[10px] text-cyber-text-dim">
                          {unit.id}
                        </span>
                      </button>
                    </td>
                    <td className="px-4 py-3">{kindLabel(unit.kind, text)}</td>
                    <td className="px-4 py-3 text-cyber-text-dim">
                      {communityNames.get(unit.communityId)?.[language]}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full border px-2 py-1 text-xs ${statusClasses(unit.status)}`}
                      >
                        {healthLabel(unit.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {percent(unit.affectProxy)}
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {percent(unit.integrity)}
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {percent(unit.averageNeedSatisfaction)}
                    </td>
                    <td className="px-4 py-3">{text[unit.activity]}</td>
                    <td className="px-4 py-3 text-xs text-cyber-text-dim">
                      {unit.lowestNeeds
                        .map((need) => NEED_LABELS[need][language])
                        .join(" · ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-3 border-t border-cyber-gray-light p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p className="text-cyber-text-dim">
              {text.showing} {visibleUnits.length} {text.of} {filteredUnits.length}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(0, current - 1))}
                disabled={page === 0}
                aria-label={text.previous}
                className="rounded-lg border border-cyber-gray-light p-2 text-cyber-text disabled:opacity-35"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-3 py-2 font-mono text-cyber-text">
                {page + 1}/{pageCount}
              </span>
              <button
                type="button"
                onClick={() =>
                  setPage((current) => Math.min(pageCount - 1, current + 1))
                }
                disabled={page >= pageCount - 1}
                aria-label={text.next}
                className="rounded-lg border border-cyber-gray-light p-2 text-cyber-text disabled:opacity-35"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border border-cyber-pink/25 bg-cyber-darker/90">
            <h2 className="border-b border-cyber-gray-light p-5 font-orbitron text-sm text-cyber-pink">
              {text.eventRiver}
            </h2>
            <ol
              className="max-h-[440px] space-y-2 overflow-y-auto p-4"
              tabIndex={0}
              aria-label={text.eventRiver}
            >
              {data.recentEvents.length === 0 ? (
                <li className="text-sm text-cyber-text-dim">{text.noEvents}</li>
              ) : (
                data.recentEvents.map((event) => (
                  <li
                    key={event.id}
                    className="rounded-xl border border-cyber-gray-light bg-cyber-black/45 p-4"
                  >
                    <div className="flex flex-wrap justify-between gap-2 text-xs text-cyber-text-dim">
                      <span>{text.turn} {event.turn} · {event.layer}</span>
                      <span className="font-mono">#{event.cursor}</span>
                    </div>
                    <p className="mt-2 text-sm text-cyber-text">
                      {event.publicSummary[language]}
                    </p>
                    <p className="mt-2 font-mono text-[11px] text-cyber-text-dim">
                      {event.type} · {event.causationId}
                    </p>
                  </li>
                ))
              )}
            </ol>
          </div>

          <div className="rounded-2xl border border-cyber-green/25 bg-cyber-darker/90 p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-cyber-green" />
              <h2 className="font-orbitron text-sm text-cyber-green">
                {text.evidence}
              </h2>
            </div>
            <dl className="mt-5 space-y-3 text-sm">
              {[
                [text.fingerprint, data.evidence.snapshotFingerprint],
                [text.replay, percent(data.evidence.exactReplayRate)],
                [text.cursor, String(data.evidence.eventCursor)],
                [
                  text.conservation,
                  data.city.resourceConservationPassed ? "PASS" : "FAIL",
                ],
                [text.noPrivate, data.evidence.privateFieldsIncluded ? "FAIL" : "PASS"],
                [text.noReasoning, data.evidence.modelReasoningIncluded ? "FAIL" : "PASS"],
                [text.noConsciousness, data.evidence.consciousnessClaimed ? "FAIL" : "PASS"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-start justify-between gap-4 rounded-lg bg-cyber-black/45 px-3 py-2"
                >
                  <dt className="text-cyber-text-dim">{label}</dt>
                  <dd className="break-all text-right font-mono text-cyber-text">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </div>
    </section>
  );
}
