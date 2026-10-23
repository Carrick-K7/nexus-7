"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Microscope, RefreshCw, ShieldCheck } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import ResearchBriefing from "@/components/research/ResearchBriefing";
import type { Language } from "@/i18n/translations";
import type {
  HypothesisEvaluation,
  ResearchHypothesis,
  ResearchEpisode,
  ResearchOverview,
  ResearchQuestion,
  ResearchTool,
} from "@/research/contracts";

// The read projection preserves future sampler tags without granting them
// execution or certification authority. The backend contract remains unchanged.
type ObservedHypothesisEvaluation = Omit<HypothesisEvaluation, "samplingProtocol"> & { samplingProtocol: string };
type ObservedStation = Omit<NonNullable<ResearchOverview["station"]>, "hypothesisEvaluations"> & { hypothesisEvaluations?: ObservedHypothesisEvaluation[] };
type ObservedOverview = Omit<ResearchOverview, "station"> & { station: ObservedStation | null };

const ENDPOINT = "/api/research/v1/overview";
const REFRESH_INTERVAL_MS = 30_000;
const OBSERVATION_PREVIEW_LIMIT = 3;
const JSON_PREVIEW_LIMIT = 2_000;
const JSON_VALUE_LIMIT = 65_536;
const REFERENCE_PREVIEW_LIMIT = 3;
const panel = "min-w-0 rounded-2xl border border-cyber-gray-light bg-cyber-darker p-4 sm:p-5";
const summaryStyle = "cursor-pointer rounded-lg py-2 font-medium text-cyber-text focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyber-blue";
const codeStyle = "whitespace-pre-wrap break-all font-mono text-xs text-cyber-text";

const copy = {
  en: {
    title: "Research Station · Bounded symbolic research",
    intro: "Read-only evidence from bounded symbolic experiments and a closed reducer DSL. This is not LLM research or open-ended source-code evolution.",
    refresh: "Refresh research snapshot",
    loading: "Loading research snapshot…",
    refreshing: "Refreshing; the previous snapshot remains visible.",
    ready: "Last successful snapshot shown. Refresh reads data only; it does not advance research.",
    error: "Research snapshot unavailable. No result has been invented. You can retry with Refresh.",
    stale: "Stale snapshot — refresh has not succeeded. The last successful data remains below.",
    lastSuccess: "Last successful read",
    notRead: "No successful read yet",
    snapshotTime: "Server snapshot generated at",
    updated: "Station ledger updated at",
    polling: "Automatic GET refresh every 30 seconds while this page is visible. Reads do not start research.",
    clocks: "Read and response timestamps are not claim-evidence timestamps. Completed episodes and bound receipts carry the evidence; none of these timestamps is a worker heartbeat.",
    lastEpisode: "Last completed episode (reported)",
    release: "Release revision (reported)",
    releaseEvidence: "Revision binding",
    missingRuntime: "Runtime revision binding not reported (older compatible response).",
    unbound: "Local / unbound — not deployment evidence",
    deploymentEnv: "Deployment environment declaration — not an independent deployment attestation",
    ledgerStatus: "Persisted ledger state (not worker health)",
    backend: "Storage backend",
    readOnly: "Read-only observation · Research ledger persists · No city writes or deployment · External model calls: 0",
    boundary: "Evidence boundaries",
    novelty: "Natural new discoveries have not been demonstrated. Known audit seeds are not discoveries; generated challenges are not proof of novelty.",
    initialClaims: "Initial instrument claims",
    derivedQuestions: "Protocol-derived questions",
    newClaims: "New conditional hypotheses",
    protocolBoundary: "Protocol follow-ups are not new hypotheses. New conditional hypotheses count distinct frozen programDigest + subjectVersion pairs, not queue operations or repeated training snapshots. Operation rounds are not independent scientific samples.",
    noRunCounts: "No station: run-level counts are unavailable; no frozen conditional hypotheses are recorded.",
    hypotheses: "Frozen conditional hypotheses",
    noHypotheses: "No frozen conditional hypotheses recorded. Older local v1 records may omit this field; no induction run is implied.",
    hypothesisId: "Conditional hypothesis ID",
    hypothesisBoundary: "A conditional program predicts the original instrument's holds measurement inside its when condition. It is distinct from the initial instrument claim and is not a proof, a natural new discovery, or an LLM result.",
    predicate: "when · condition AST",
    expectedHolds: "expectedHolds · predicted instrument measurement",
    predictionMeaning: "expectedHolds predicts the original instrument's Measurement.holds, not whether this meta-hypothesis is true. Outside when, the program abstains; it makes no complementary claim.",
    parentHypothesis: "Parent conditional hypothesis",
    noParentHypothesis: "No parent hypothesis recorded",
    lineageBoundary: "A child does not replace its parent's refutation. Later budget-limited survival does not erase earlier contradictory evidence.",
    trainingDigest: "Frozen training digest",
    trainingReferences: "Training observation IDs",
    latestFalsification: "Latest F · falsification",
    latestAudit: "Latest T · held-out audit",
    noHypothesisEvaluation: "No receipt recorded",
    historicalRefutations: "Historical refutation receipts",
    overallHypothesis: "Overall record",
    stillRefuted: "Still refuted",
    unprovenHypothesis: "Unproven — no matching refutation recorded",
    refutationPriority: "The historical counterexample remains valid. Later samples without a counterexample cannot withdraw that refutation.",
    unknownSamplingProtocol: "Unknown sampling protocol — read-only receipt, not validated or certified by this view.",
    samplingVersionBoundary: "Protocol tags are shown exactly as stored. This view does not rerun a sampler or claim cross-version exact replay.",
    hypothesisReceipts: "F / T receipts · falsification / held-out audit",
    noHypothesisReceipts: "No falsification or held-out audit receipts recorded.",
    unmatchedReceipt: "No matching frozen hypothesis binding in this snapshot. This receipt is shown as reported, but is not attached to a hypothesis status.",
    receiptBoundary: "F is falsification; T is held-out audit. Latest means the last persisted receipt for that phase. Targeted exploration and boundary sampling do not estimate population coverage. Survived-budget means not refuted within that budget, never proved.",
    phase: "Evaluation phase",
    inScope: "In-scope observations",
    outOfScope: "Out-of-scope observations",
    contradictions: "Contradictory observations",
    attemptedCandidates: "Candidate inputs attempted",
    samplingProtocol: "Sampling protocol",
    sampleKinds: "Exploration / boundary observations",
    allowance: "Call allowance",
    observationReferences: "Observation references",
    contradictionReferences: "Contradiction references",
    excludedInputs: "Excluded input digests",
    refsNote: "At most 3 references per list are shown; totals include all entries. Full records remain in the read-only API.",
    jsonOverLimit: "Preview omitted: this JSON value exceeds the 64 KiB or structural preview budget. No content has been executed.",
    transferCounts: "Transfer question denominator",
    transferAttempted: "Attempted",
    transferSucceeded: "Succeeded",
    transferRejected: "Rejected",
    transferPending: "Pending / running",
    transferNoGain: "No gain",
    transferStopped: "Stopped",
    transferNote: "Counts use all transfer question IDs, including low-priority questions. Attempted means at least one reserved attempt, not an independent sample; it overlaps the outcome counts. Success, rejection, and no gain follow the latest completed episode. Pending includes retries and running work; stopped questions remain visible.",
    verifier: "Verifier version",
    evaluatedDigest: "Evaluated program digest",
    reducedInput: "Exact reduced input · bounded preview",
    receiptLinks: "Verifier observation references",
    initialObservation: "Initial observation",
    finalObservation: "Final observation",
    controlObservation: "Control observation",
    isolation: "The evaluator is a separate module, not hostile-process isolation. No arbitrary code execution, city mutation, deployment, or external model call is authorized by this view.",
    factsOnly: "Observations are measured facts and machine result codes, not hidden model reasoning. Negative and inconclusive results remain visible.",
    emptyTitle: "No research station data",
    empty: "The API returned no station. No worker run, episode, tool, or successful finding is implied. This page will not create a station or fabricate results.",
    state: "Station state & budget",
    stationId: "Station ID",
    revision: "Revision",
    status: "Status",
    budget: "Oracle-call budget · spent / reserved / cap",
    spent: "Spent calls",
    reserved: "Reserved calls",
    cap: "Call cap",
    abandoned: "Abandoned reservations",
    externalCalls: "External model calls",
    cost: "Actual model cost (USD)",
    episodeCap: "Episode cap",
    callsPerEpisode: "Call cap per episode",
    attemptsCap: "Attempt cap per question",
    stop: "Stop reason",
    noStop: "No stop reason recorded",
    lease: "Active reservation",
    noLease: "No active reservation",
    owner: "Owner",
    expires: "Expires at",
    seed: "Run seed",
    negative: "Negative / inconclusive episodes",
    negativeNote: "Includes not reproduced, rejected tools, refuted conditional hypotheses, no change, and inconclusive verdicts; this is not a success rate.",
    subjects: "Subject catalogue · not findings",
    noSubjects: "No subjects reported.",
    subject: "Subject",
    version: "Version",
    origin: "Evidence origin",
    interpretation: "Interpretation",
    family: "Family",
    claim: "Claim under test",
    queue: "Question queue",
    noQuestions: "No questions recorded.",
    questionsNote: "All statuses are retained, including answered and stopped questions.",
    kind: "Kind",
    priority: "Priority",
    attempts: "Attempts",
    round: "Created at round",
    reason: "Reason code",
    parent: "Causal parent episode",
    root: "No parent recorded (root question)",
    missingQuestion: "Question provenance unavailable in this snapshot",
    sourceObservation: "Source observation",
    sourceTool: "Source tool",
    none: "None recorded",
    episodes: "Episodes & causal evidence",
    noEpisodes: "No completed episodes recorded.",
    verdict: "Verdict",
    question: "Question",
    selection: "Selection reason",
    started: "Started at",
    completed: "Completed at",
    calls: "Oracle calls",
    digest: "Digest",
    previousDigest: "Previous episode digest",
    inputDigest: "Input state digest",
    followups: "Protocol-derived questions",
    lessonIds: "Lesson references",
    observations: "Observations",
    preview: "Observation preview",
    previewNote: "At most 3 observations per episode are mounted, only when expanded. Input and facts previews are capped at 2,000 characters each. Full records remain in the read-only API; internal reducer calls are not all rendered.",
    total: "Total",
    shown: "Shown",
    noObservations: "No observations recorded.",
    partition: "Partition",
    holds: "Instrument claim holds for this observation",
    facts: "Measured facts",
    input: "Input",
    measurementCode: "Measurement code",
    truncated: "Preview truncated",
    tools: "Reducer tools & reuse",
    noTools: "No tools recorded.",
    toolBoundary: "A tool is a closed data AST with generated source for inspection, not permission to execute arbitrary source code.",
    createdBy: "Created by episode",
    training: "Training subject",
    ast: "Reducer AST",
    source: "Generated source code · inspection only",
    evaluation: "Evaluation code",
    accepted: "Evaluation accepted",
    preserved: "Counterexample preserved",
    control: "Non-counterexample control rejected",
    sizes: "Original / reduced size",
    reuse: "Reused on subjects",
    crossFamily: "Cross-family reuse targets",
    sameFamily: "Same family",
    differentFamily: "Different family",
    unknownFamily: "Family not reported; cross-family reuse unproven",
    noReuse: "No reuse recorded.",
    lessons: "Lessons, refutations & limits",
    noLessons: "No lessons recorded.",
    reportedNote: "Reported note — not an independent scientific certificate",
    hypothesisNote: "Kernel hypothesis note — not a proof",
    reportedStatus: "Reported status",
    lessonAuthority: "Read the episode's raw observations and formal tool / hypothesis evaluation receipts for scientific evidence. A note's free text or reported status cannot certify a new conditional law or authorize an action.",
    applicability: "Applicability",
    evidence: "Evidence IDs",
    supersedes: "Supersedes",
    yes: "Yes",
    no: "No",
  },
  zh: {
    title: "研究站 · 有界符号研究",
    intro: "只读展示有界符号实验与封闭归约 DSL 的证据。这不是 LLM 研究，也不是开放式源码进化。",
    refresh: "刷新研究快照",
    loading: "正在读取研究快照…",
    refreshing: "正在刷新；仍显示上次成功快照。",
    ready: "显示上次成功快照。刷新仅读取数据，不会推进研究。",
    error: "研究快照暂不可用；没有虚构结果。可点击刷新重试。",
    stale: "旧快照 — 刷新尚未成功。下方保留上次成功读取的数据。",
    lastSuccess: "上次成功读取",
    notRead: "尚无成功读取",
    snapshotTime: "服务器快照生成时间",
    updated: "研究站账本更新时间",
    polling: "仅页面可见时每 30 秒自动 GET 刷新。读取不会启动研究。",
    clocks: "读取与响应时间不是声明证据的时间。已完成回合与绑定回执承载证据；这些时间都不是 worker 心跳。",
    lastEpisode: "最近已完成回合时间（报告值）",
    release: "发布修订号（报告值）",
    releaseEvidence: "修订号绑定来源",
    missingRuntime: "未报告运行时修订号绑定（兼容旧响应）。",
    unbound: "本地 / 未绑定 — 不是部署证据",
    deploymentEnv: "部署环境声明 — 不是独立部署证明",
    ledgerStatus: "持久化账本状态（不是 worker 健康状态）",
    backend: "存储后端",
    readOnly: "只读观察 · 研究账本持久化 · 不写城市或部署 · 外部模型调用：0",
    boundary: "证据边界",
    novelty: "自然新发现尚未证明。已知审计种子不算新发现；生成式挑战也不证明新颖性。",
    initialClaims: "初始仪器声明数",
    derivedQuestions: "协议派生问题数",
    newClaims: "新提出条件命题数",
    protocolBoundary: "协议后续问题不等于新命题。新条件命题按冻结的 programDigest + subjectVersion 组合去重计数，不按队列操作或重复训练快照计数。操作轮次不等于独立科学样本数。",
    noRunCounts: "尚无研究站，运行计数不可用；未记录冻结条件命题。",
    hypotheses: "冻结条件命题",
    noHypotheses: "尚无冻结条件命题记录。旧 local v1 记录可能缺少此字段，不意味着已经运行过归纳。",
    hypothesisId: "条件命题 ID",
    hypothesisBoundary: "条件程序预测 when 条件范围内原仪器的 holds 测量值。它不同于初始仪器声明，不代表证明、自然新发现或 LLM 结果。",
    predicate: "when · 条件 AST",
    expectedHolds: "expectedHolds · 预测的仪器测量值",
    predictionMeaning: "expectedHolds 预测原仪器的 Measurement.holds，不代表此元假设已经为真。在 when 范围外程序弃权，不作互补命题声明。",
    parentHypothesis: "父条件命题",
    noParentHypothesis: "未记录父条件命题",
    lineageBoundary: "子命题不会替换父命题的否证。后来在有限预算内未被推翻，也不会抹去此前的矛盾证据。",
    trainingDigest: "冻结训练摘要",
    trainingReferences: "训练观测 ID",
    latestFalsification: "最近 F · 否证检验",
    latestAudit: "最近 T · 留出审计",
    noHypothesisEvaluation: "尚无回执记录",
    historicalRefutations: "历史否证回执数",
    overallHypothesis: "整体记录",
    stillRefuted: "仍已被反驳",
    unprovenHypothesis: "未获证明 — 尚无匹配的否证记录",
    refutationPriority: "历史反例仍有效，后续样本没有反例不能撤销该否证。",
    unknownSamplingProtocol: "未知采样协议 — 仅只读展示回执，此页面未验证或认证该协议。",
    samplingVersionBoundary: "协议标签按持久记录原样显示。此页面不会重跑采样器，也不宣称跨版本 exact replay。",
    hypothesisReceipts: "F / T 回执 · 否证检验 / 留出审计",
    noHypothesisReceipts: "尚无否证检验或留出审计回执记录。",
    unmatchedReceipt: "此快照中没有匹配的冻结命题绑定。回执按原记录显示，但不计入任何命题的状态。",
    receiptBoundary: "F 为否证检验，T 为留出审计；最近指该阶段最后持久化的回执。定向探索与边界采样不代表总体覆盖。survived-budget 仅表示预算内未被推翻，绝非证明。",
    phase: "评估阶段",
    inScope: "范围内观测",
    outOfScope: "范围外观测",
    contradictions: "矛盾观测数",
    attemptedCandidates: "尝试的候选输入数",
    samplingProtocol: "采样协议",
    sampleKinds: "探索 / 边界观测数",
    allowance: "调用额度",
    observationReferences: "观测引用",
    contradictionReferences: "矛盾观测引用",
    excludedInputs: "已排除输入摘要",
    refsNote: "每组最多显示 3 条引用，总数包含全部记录。完整记录保留在只读 API。",
    jsonOverLimit: "已省略预览：此 JSON 值超过 64 KiB 或结构预览预算。没有执行任何内容。",
    transferCounts: "迁移问题分母",
    transferAttempted: "已尝试",
    transferSucceeded: "已成功",
    transferRejected: "已拒绝",
    transferPending: "待处理 / 运行中",
    transferNoGain: "无收益",
    transferStopped: "已停止",
    transferNote: "分母包含全部迁移问题 ID，包括低优先级问题。已尝试表示至少预留过一次尝试，不是独立样本；此计数与结局重叠。成功、拒绝和无收益按最近已完成回合判定。待处理包含重试及运行中问题；已停止问题照常保留。",
    verifier: "验证器版本",
    evaluatedDigest: "受检程序摘要",
    reducedInput: "确切归约输入 · 有限预览",
    receiptLinks: "验证器观测引用",
    initialObservation: "初始观测",
    finalObservation: "最终观测",
    controlObservation: "对照观测",
    isolation: "评估器仅为独立模块，并非对抗性进程隔离。此页面不授权任意代码执行、城市修改、部署或外部模型调用。",
    factsOnly: "观测仅为测量事实与机器结果码，不是模型隐藏思维链。负性与未决结果照常保留。",
    emptyTitle: "暂无研究站数据",
    empty: "API 未返回研究站，不意味着已有 worker 运行、研究回合、工具或成功发现。页面不会创建研究站或编造结果。",
    state: "研究站状态与预算",
    stationId: "研究站 ID",
    revision: "修订号",
    status: "状态",
    budget: "测量调用预算 · 已花费 / 已预留 / 上限",
    spent: "已花费调用",
    reserved: "已预留调用",
    cap: "调用上限",
    abandoned: "已放弃预留",
    externalCalls: "外部模型调用",
    cost: "实际模型费用（美元）",
    episodeCap: "回合上限",
    callsPerEpisode: "单回合调用上限",
    attemptsCap: "单问题尝试上限",
    stop: "停止原因",
    noStop: "未记录停止原因",
    lease: "当前预留",
    noLease: "暂无有效预留",
    owner: "持有者",
    expires: "到期时间",
    seed: "运行种子",
    negative: "负性 / 无结论回合",
    negativeNote: "包含未复现、工具被拒、条件命题被否证、无变化和无结论的回合；此数值不是成功率。",
    subjects: "研究对象目录 · 不是发现",
    noSubjects: "未报告研究对象。",
    subject: "研究对象",
    version: "版本",
    origin: "证据来源",
    interpretation: "解读边界",
    family: "问题族",
    claim: "待检验命题",
    queue: "问题队列",
    noQuestions: "尚无问题记录。",
    questionsNote: "保留全部状态，包括已回答和已停止的问题。",
    kind: "类型",
    priority: "优先级",
    attempts: "尝试次数",
    round: "创建轮次",
    reason: "原因码",
    parent: "因果父回合",
    root: "未记录父回合（根问题）",
    missingQuestion: "此快照中缺少问题来源记录",
    sourceObservation: "来源观测",
    sourceTool: "来源工具",
    none: "未记录",
    episodes: "研究回合与因果证据",
    noEpisodes: "尚无已完成回合记录。",
    verdict: "判定",
    question: "问题",
    selection: "选择原因",
    started: "开始时间",
    completed: "完成时间",
    calls: "测量调用",
    digest: "摘要",
    previousDigest: "上一回合摘要",
    inputDigest: "输入状态摘要",
    followups: "协议派生问题",
    lessonIds: "经验引用",
    observations: "观测",
    preview: "观测预览",
    previewNote: "每回合仅在展开后挂载最多 3 条观测。输入与事实各最多预览 2,000 字符。完整记录保留在只读 API；不会渲染全部归约器内部调用。",
    total: "总数",
    shown: "已显示",
    noObservations: "尚无观测记录。",
    partition: "数据分区",
    holds: "原仪器声明在此观测中成立",
    facts: "测量事实",
    input: "输入",
    measurementCode: "测量结果码",
    truncated: "预览已截断",
    tools: "归约工具与复用",
    noTools: "尚无工具记录。",
    toolBoundary: "工具是封闭的数据 AST，生成源码仅供检查，不代表允许执行任意源码。",
    createdBy: "生成工具的回合",
    training: "训练研究对象",
    ast: "归约器 AST",
    source: "生成源码 · 仅供检查",
    evaluation: "评估结果码",
    accepted: "评估接受",
    preserved: "反例保持",
    control: "非反例对照被拒",
    sizes: "原始 / 归约后大小",
    reuse: "已复用的研究对象",
    crossFamily: "跨问题族复用目标数",
    sameFamily: "相同问题族",
    differentFamily: "不同问题族",
    unknownFamily: "未报告问题族；跨族复用尚未证明",
    noReuse: "尚无复用记录。",
    lessons: "经验、否证与限制",
    noLessons: "尚无经验记录。",
    reportedNote: "候选/历史记录，不是独立科学证书",
    hypothesisNote: "核心条件命题记录 — 不是证明",
    reportedStatus: "记录状态",
    lessonAuthority: "科学证据应查看回合原始观测，以及正式工具 / 条件命题评估回执。记录的自由文本或记录状态不能认证新条件定律，也不能授权行动。",
    applicability: "适用范围",
    evidence: "证据 ID",
    supersedes: "替代的经验",
    yes: "是",
    no: "否",
  },
} as const;

type Copy = { [K in keyof typeof copy.en]: string };

// Localized labels accompany, rather than replace, the auditable machine codes.
const labels: Record<string, { en: string; zh: string }> = {
  running: { en: "Running", zh: "运行中" },
  paused: { en: "Paused", zh: "已暂停" },
  idle: { en: "Idle", zh: "空闲" },
  "budget-exhausted": { en: "Budget exhausted", zh: "预算耗尽" },
  pending: { en: "Pending", zh: "待处理" },
  answered: { en: "Answered", zh: "已回答" },
  stopped: { en: "Stopped", zh: "已停止" },
  survey: { en: "Survey", zh: "探查" },
  replicate: { en: "Replicate", zh: "复现" },
  minimize: { en: "Minimize", zh: "最小化" },
  transfer: { en: "Transfer", zh: "迁移" },
  induce: { en: "Induce a conditional hypothesis", zh: "归纳条件命题" },
  falsify: { en: "Attempt falsification", zh: "尝试否证" },
  "audit-hypothesis": { en: "Audit conditional hypothesis", zh: "审计条件命题" },
  hypothesis: { en: "Conditional hypothesis", zh: "条件命题" },
  "hypothesis-proposed": { en: "Conditional hypothesis proposed", zh: "已提出条件命题" },
  "hypothesis-refuted": { en: "Conditional hypothesis refuted", zh: "条件命题已被否证" },
  "hypothesis-survived": { en: "Not refuted within budget — not proved", zh: "预算内未被推翻 — 并非证明" },
  "survived-budget": { en: "Not refuted within budget — not proved", zh: "预算内未被推翻 — 并非证明" },
  falsification: { en: "F · Falsification", zh: "F · 否证检验" },
  audit: { en: "T · Held-out audit", zh: "T · 留出审计" },
  "hypothesis-training": { en: "Hypothesis training", zh: "条件命题训练" },
  "hypothesis-falsification": { en: "Hypothesis falsification", zh: "条件命题否证" },
  "hypothesis-audit": { en: "Held-out hypothesis audit", zh: "条件命题留出审计" },
  counterexample: { en: "Counterexample", zh: "反例" },
  "not-reproduced": { en: "Not reproduced", zh: "未复现" },
  confirmed: { en: "Confirmed", zh: "已确认" },
  "tool-certified": { en: "Tool certified", zh: "工具获准" },
  "tool-rejected": { en: "Tool rejected", zh: "工具被拒" },
  transferred: { en: "Transferred", zh: "已迁移" },
  "no-change": { en: "No change / no gain", zh: "无变化 / 无收益" },
  inconclusive: { en: "Inconclusive", zh: "无结论" },
  certified: { en: "Certified", zh: "已认证" },
  rejected: { en: "Rejected", zh: "已拒绝" },
  provisional: { en: "Provisional", zh: "暂定" },
  refuted: { en: "Refuted", zh: "已否证" },
  confirmation: { en: "Confirmation", zh: "确认" },
  refutation: { en: "Refutation", zh: "否证" },
  tool: { en: "Tool", zh: "工具" },
  limit: { en: "Limit", zh: "限制" },
  "known-audit-seed": { en: "Known audit seed — not a discovery", zh: "已知审计种子 — 不是新发现" },
  "generated-challenge": { en: "Generated challenge — novelty unproven", zh: "生成式挑战 — 新颖性未证明" },
  "repository-observation": { en: "Repository observation", zh: "仓库观测" },
  "declared-contract": { en: "Declared contract", zh: "已声明契约" },
  "exploratory-hypothesis": { en: "Exploratory hypothesis", zh: "探索性假设" },
  discovery: { en: "Discovery partition", zh: "发现分区" },
  "tool-training": { en: "Tool training", zh: "工具训练" },
  "tool-validation": { en: "Tool validation", zh: "工具验证" },
};

function LabeledCode({ value, language }: { value: string; language: Language }) {
  const label = labels[value]?.[language];
  return <span>{label && <>{label} · </>}<code className="break-all text-xs">{value}</code></span>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0"><dt className="text-xs text-cyber-text-dim">{label}</dt><dd className="mt-1 text-sm text-cyber-text [overflow-wrap:anywhere]">{children}</dd></div>;
}

function Disclosure({ summary, children, testId }: { summary: ReactNode; children: ReactNode; testId?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <details data-testid={testId} className="min-w-0 border-t border-cyber-gray-light py-2" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className={summaryStyle}>{summary}</summary>
      {open && <div className="mt-3 min-w-0 space-y-4 pb-2">{children}</div>}
    </details>
  );
}

// Preview safety only, not scientific verification. Check structural/text work
// before serialization; never execute a program or stringify an unbounded tree.
function boundedJsonText(value: unknown): string | null {
  let nodes = 0;
  let characters = 0;
  const active = new Set<object>();
  const visit = (item: unknown, depth: number): void => {
    if (++nodes > 4_096 || depth > 16) throw new Error("preview-structure-cap");
    if (item === null || typeof item === "boolean") { characters += 5; }
    else if (typeof item === "number" && Number.isFinite(item)) { characters += String(item).length; }
    else if (typeof item === "string") {
      if (item.length > JSON_VALUE_LIMIT) throw new Error("preview-text-cap");
      characters += JSON.stringify(item).length;
    } else if (typeof item === "object" && item && !active.has(item)) {
      const prototype = Object.getPrototypeOf(item);
      if (Array.isArray(item) ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) throw new Error("preview-non-json-object");
      active.add(item);
      const keys = Reflect.ownKeys(item);
      if (keys.length > 4_096) throw new Error("preview-entry-cap");
      for (const key of keys) {
        if (typeof key !== "string" || key.length > JSON_VALUE_LIMIT) throw new Error("preview-key-cap");
        if (Array.isArray(item) && key === "length") continue;
        const descriptor = Object.getOwnPropertyDescriptor(item, key)!;
        if (!("value" in descriptor) || !descriptor.enumerable) throw new Error("preview-non-json-property");
        characters += JSON.stringify(key).length + 2;
        visit(descriptor.value, depth + 1);
      }
      active.delete(item);
    } else { throw new Error("preview-invalid-json"); }
    if (characters > JSON_VALUE_LIMIT) throw new Error("preview-text-cap");
  };
  try {
    visit(value, 0);
    const text = JSON.stringify(value, null, 2);
    return new TextEncoder().encode(text).byteLength <= JSON_VALUE_LIMIT ? text : null;
  } catch { return null; }
}

function JsonPreview({ value, c }: { value: unknown; c: Copy }) {
  const serialized = boundedJsonText(value);
  if (serialized === null) return <p className="text-xs text-cyber-text-dim">{c.jsonOverLimit}</p>;
  const truncated = serialized.length > JSON_PREVIEW_LIMIT;
  return <div><pre tabIndex={0} className={`${codeStyle} max-h-64 overflow-y-auto rounded-lg bg-cyber-dark p-3`}>{serialized.slice(0, JSON_PREVIEW_LIMIT)}{truncated ? "…" : ""}</pre>{truncated && <p className="mt-1 text-xs text-cyber-text-dim">{c.truncated}</p>}</div>;
}

function ReferencePreview({ ids, label, c }: { ids: string[]; label: string; c: Copy }) {
  const preview = ids.slice(0, REFERENCE_PREVIEW_LIMIT);
  return <div className="min-w-0 space-y-2" data-testid="research-reference-preview">
    <h4 className="text-sm font-semibold">{label} · {c.shown}: {preview.length} / {c.total}: {ids.length}</h4>
    {preview.length ? <ul className="space-y-1">{preview.map((id, index) => <li key={`${index}:${id}`} data-testid="research-reference"><code className={codeStyle}>{id}</code></li>)}</ul> : <p className="text-xs text-cyber-text-dim">{c.none}</p>}
  </div>;
}

function Provenance({ question, c }: { question?: ResearchQuestion; c: Copy }) {
  return (
    <dl className="grid min-w-0 gap-3 sm:grid-cols-2">
      <Field label={c.parent}>{question ? question.parentEpisodeId ?? c.root : c.missingQuestion}</Field>
      <Field label={c.sourceObservation}>{question?.observationId ?? c.none}</Field>
      <Field label={c.sourceTool}>{question?.toolId ?? c.none}</Field>
      <Field label={c.hypothesisId}>{question?.hypothesisId ?? c.none}</Field>
    </dl>
  );
}

function Episode({ episode, question, subject, c, language }: { episode: ResearchEpisode; question?: ResearchQuestion; subject?: ResearchOverview["subjects"][number]; c: Copy; language: Language }) {
  const preview = episode.observations.slice(0, OBSERVATION_PREVIEW_LIMIT);
  return (
    <Disclosure testId="research-episode" summary={<><span className="break-all">{episode.id}</span><span className="mt-1 block text-sm text-cyber-text-dim">{c.verdict}: <LabeledCode value={episode.verdict} language={language} /> · {c.observations}: {episode.observations.length}</span></>}>
      <dl className="grid min-w-0 gap-3 sm:grid-cols-2">
        <Field label={c.question}>{episode.questionId}</Field>
        <Field label={c.subject}>{episode.subjectId}</Field>
        <Field label={c.origin}>{subject ? <LabeledCode value={subject.origin} language={language} /> : c.none}</Field>
        <Field label={c.family}>{subject?.family ?? c.none}</Field>
        <Field label={c.kind}><LabeledCode value={episode.kind} language={language} /></Field>
        <Field label={c.calls}>{episode.calls}</Field>
        <Field label={c.selection}>{episode.selectionReason}</Field>
        <Field label={c.started}>{episode.startedAt}</Field>
        <Field label={c.completed}>{episode.completedAt}</Field>
        <Field label={c.digest}><code className={codeStyle}>{episode.digest}</code></Field>
        <Field label={c.previousDigest}><code className={codeStyle}>{episode.previousDigest}</code></Field>
        <Field label={c.inputDigest}><code className={codeStyle}>{episode.inputStateDigest}</code></Field>
        <Field label={c.followups}>{episode.generatedQuestionIds.join(", ") || c.none}</Field>
        <Field label={c.lessonIds}>{episode.lessonIds.join(", ") || c.none}</Field>
        {episode.hypothesis && <Field label={c.hypothesisId}>{episode.hypothesis.id}</Field>}
      </dl>
      <Provenance question={question} c={c} />
      <div data-testid="research-observation-preview" className="min-w-0 space-y-3">
        <h3 className="font-semibold">{c.preview} · {c.shown}: {preview.length} / {c.total}: {episode.observations.length}</h3>
        <p className="text-xs leading-relaxed text-cyber-text-dim">{c.previewNote}</p>
        {preview.length === 0 && <p className="text-sm text-cyber-text-dim">{c.noObservations}</p>}
        {preview.map((observation) => <article key={observation.id} data-testid="research-observation" className="min-w-0 space-y-3 rounded-xl border border-cyber-gray-light p-3">
          <h4 className="break-all text-sm font-semibold">{observation.id}</h4>
          <dl className="grid gap-3 sm:grid-cols-2">
            <Field label={c.subject}>{observation.subjectId} · {observation.subjectVersion}</Field>
            <Field label={c.partition}><LabeledCode value={observation.partition} language={language} /></Field>
            <Field label={c.holds}>{observation.measurement.holds ? c.yes : c.no}</Field>
            <Field label={c.measurementCode}>{observation.measurement.code}</Field>
            <Field label={c.digest}><code className={codeStyle}>{observation.inputDigest}</code></Field>
          </dl>
          <div><p className="mb-1 text-xs text-cyber-text-dim">{c.facts}</p><JsonPreview value={observation.measurement.facts} c={c} /></div>
          <Disclosure summary={c.input}><JsonPreview value={observation.input} c={c} /></Disclosure>
        </article>)}
      </div>
    </Disclosure>
  );
}

function Tool({ tool, subjects, c, language }: { tool: ResearchTool; subjects: ResearchOverview["subjects"]; c: Copy; language: Language }) {
  const trainingFamily = subjects.find((subject) => subject.id === tool.trainingSubjectId)?.family;
  const reuse = tool.reusedOnSubjectIds.map((id) => ({ id, family: subjects.find((subject) => subject.id === id)?.family }));
  const crossFamily = reuse.filter(({ family }) => family && trainingFamily && family !== trainingFamily).length;
  return (
    <Disclosure testId="research-tool" summary={<>{tool.id}<span className="mt-1 block text-sm text-cyber-text-dim"><LabeledCode value={tool.status} language={language} /> · {c.crossFamily}: {crossFamily}</span></>}>
      <dl className="grid gap-3 sm:grid-cols-2">
        <Field label={c.digest}><code className={codeStyle}>{tool.digest}</code></Field>
        <Field label={c.createdBy}>{tool.createdByEpisodeId}</Field>
        <Field label={c.training}>{tool.trainingSubjectId} · {trainingFamily ?? c.unknownFamily}</Field>
        <Field label={c.evaluation}>{tool.evaluation.code}</Field>
        <Field label={c.verifier}>{tool.evaluation.verifierVersion}</Field>
        <Field label={c.evaluatedDigest}><code className={codeStyle}>{tool.evaluation.programDigest}</code></Field>
        <Field label={c.accepted}>{tool.evaluation.accepted ? c.yes : c.no}</Field>
        <Field label={c.preserved}>{tool.evaluation.counterexamplePreserved ? c.yes : c.no}</Field>
        <Field label={c.control}>{tool.evaluation.controlRejected ? c.yes : c.no}</Field>
        <Field label={c.sizes}>{tool.evaluation.originalSize} / {tool.evaluation.reducedSize}</Field>
        <Field label={c.calls}>{tool.evaluation.calls}</Field>
      </dl>
      <div data-testid="research-reduced-input"><h3 className="mb-2 text-sm font-semibold">{c.reducedInput}</h3><JsonPreview value={tool.evaluation.reduced} c={c} /></div>
      <Disclosure summary={c.receiptLinks}>
        <dl className="grid gap-3 sm:grid-cols-2">
          <Field label={c.initialObservation}>{tool.evaluation.initialObservationId ?? c.none}</Field>
          <Field label={c.finalObservation}>{tool.evaluation.finalObservationId ?? c.none}</Field>
          <Field label={c.controlObservation}>{tool.evaluation.controlObservationId ?? c.none}</Field>
        </dl>
      </Disclosure>
      <div><h3 className="mb-2 text-sm font-semibold">{c.ast}</h3><pre className={`${codeStyle} rounded-lg bg-cyber-dark p-3`}>{JSON.stringify(tool.program, null, 2)}</pre></div>
      <div><h3 className="mb-2 text-sm font-semibold">{c.source}</h3><pre data-testid="research-tool-source" tabIndex={0} className={`${codeStyle} max-h-64 overflow-y-auto rounded-lg bg-cyber-dark p-3`}><code>{tool.source}</code></pre></div>
      <div><h3 className="mb-2 text-sm font-semibold">{c.reuse}</h3>
        {reuse.length ? <ul className="space-y-2 text-sm">{reuse.map(({ id, family }) => <li key={id} className="[overflow-wrap:anywhere]">{id} · {family ?? c.none} · {family && trainingFamily ? family === trainingFamily ? c.sameFamily : c.differentFamily : c.unknownFamily}</li>)}</ul> : <p className="text-sm text-cyber-text-dim">{c.noReuse}</p>}
      </div>
    </Disclosure>
  );
}

function knownSamplingProtocol(protocol: string): boolean {
  return protocol === "bounded-perturbation-v1" || protocol === "bounded-perturbation-v2";
}

function receiptMatches(hypothesis: ResearchHypothesis, receipt: ObservedHypothesisEvaluation): boolean {
  return receipt.hypothesisId === hypothesis.id
    && receipt.programDigest === hypothesis.programDigest && receipt.trainingDigest === hypothesis.trainingDigest
    && receipt.subjectId === hypothesis.subjectId && receipt.subjectVersion === hypothesis.subjectVersion;
}

function HypothesisCard({ hypothesis, receipts, c, language }: { hypothesis: ResearchHypothesis; receipts: ObservedHypothesisEvaluation[]; c: Copy; language: Language }) {
  const matching = receipts.filter((receipt) => receiptMatches(hypothesis, receipt));
  const latestF = matching.filter((receipt) => receipt.phase === "falsification").at(-1);
  const latestAudit = matching.filter((receipt) => receipt.phase === "audit").at(-1);
  const refuted = matching.filter((receipt) => receipt.status === "refuted").length;
  return <Disclosure testId="research-hypothesis" summary={<>{hypothesis.id}
    <span className="mt-1 block text-sm text-cyber-text-dim">{hypothesis.subjectId} · {hypothesis.subjectVersion}</span>
    <span data-testid="research-hypothesis-overall" className="mt-2 block text-sm font-semibold">{c.overallHypothesis}: {refuted > 0 ? c.stillRefuted : c.unprovenHypothesis}</span>
    {refuted > 0 && <span className="mt-1 block text-sm">{c.refutationPriority}</span>}
    <span data-testid="research-hypothesis-latest-f" className="mt-1 block text-sm text-cyber-text-dim">{c.latestFalsification}: {latestF ? <><LabeledCode value={latestF.status} language={language} /> · <code className="break-all text-xs">{latestF.samplingProtocol}</code></> : c.noHypothesisEvaluation}</span>
    <span data-testid="research-hypothesis-latest-audit" className="mt-1 block text-sm text-cyber-text-dim">{c.latestAudit}: {latestAudit ? <><LabeledCode value={latestAudit.status} language={language} /> · <code className="break-all text-xs">{latestAudit.samplingProtocol}</code></> : c.noHypothesisEvaluation}</span>
    {matching.some((receipt) => !knownSamplingProtocol(receipt.samplingProtocol)) && <span className="mt-1 block text-sm text-cyber-text-dim">{c.unknownSamplingProtocol}</span>}
    <span data-testid="research-hypothesis-refutations" className="mt-1 block text-sm">{c.historicalRefutations}: {refuted}</span>
  </>}>
    <dl className="grid gap-3 sm:grid-cols-2">
      <Field label={c.digest}><code className={codeStyle}>{hypothesis.programDigest}</code></Field>
      <Field label={c.trainingDigest}><code className={codeStyle}>{hypothesis.trainingDigest}</code></Field>
      <Field label={c.createdBy}>{hypothesis.createdByEpisodeId}</Field>
      <Field label={c.parentHypothesis}>{hypothesis.parentHypothesisId ?? c.noParentHypothesis}</Field>
      <Field label={c.expectedHolds}><code>{String(hypothesis.program.expectedHolds)}</code></Field>
    </dl>
    <p className="text-sm leading-relaxed text-cyber-text-dim">{c.predictionMeaning}</p>
    <div data-testid="research-hypothesis-ast"><h3 className="mb-2 text-sm font-semibold">{c.predicate}</h3><JsonPreview value={hypothesis.program.when} c={c} /></div>
    <ReferencePreview ids={hypothesis.trainingObservationIds} label={c.trainingReferences} c={c} />
    <p className="text-xs text-cyber-text-dim">{c.refsNote}</p>
    <p className="text-sm leading-relaxed text-cyber-text-dim">{c.lineageBoundary}</p>
  </Disclosure>;
}

function HypothesisReceipt({ receipt, matched, c, language }: { receipt: ObservedHypothesisEvaluation; matched: boolean; c: Copy; language: Language }) {
  return <Disclosure testId="research-hypothesis-receipt" summary={<><LabeledCode value={receipt.phase} language={language} /> · {receipt.hypothesisId}
    <span className="mt-1 block text-sm text-cyber-text-dim"><LabeledCode value={receipt.status} language={language} /> · {c.contradictions}: {receipt.counterexampleIds.length}</span>
    {!matched && <span className="mt-1 block text-sm text-cyber-text-dim">{c.unmatchedReceipt}</span>}
    {!knownSamplingProtocol(receipt.samplingProtocol) && <span data-testid="research-unknown-sampling-protocol" className="mt-1 block text-sm text-cyber-text-dim">{c.unknownSamplingProtocol} <code className="break-all text-xs">{receipt.samplingProtocol}</code></span>}
  </>}>
    <dl className="grid gap-3 sm:grid-cols-2">
      <Field label={c.hypothesisId}>{receipt.hypothesisId}</Field>
      <Field label={c.verifier}>{receipt.evaluatorVersion}</Field>
      <Field label={c.digest}><code className={codeStyle}>{receipt.programDigest}</code></Field>
      <Field label={c.trainingDigest}><code className={codeStyle}>{receipt.trainingDigest}</code></Field>
      <Field label={c.subject}>{receipt.subjectId} · {receipt.subjectVersion}</Field>
      <Field label={c.seed}>{receipt.seed}</Field>
      <Field label={c.reason}>{receipt.reason}</Field>
      <Field label={c.samplingProtocol}>{receipt.samplingProtocol}</Field>
      <Field label={c.inScope}>{receipt.inScope}</Field>
      <Field label={c.outOfScope}>{receipt.outOfScope}</Field>
      <Field label={c.contradictions}>{receipt.counterexampleIds.length}</Field>
      <Field label={c.calls}>{receipt.calls}</Field>
      <Field label={c.allowance}>{receipt.allowance}</Field>
      <Field label={c.attemptedCandidates}>{receipt.attemptedCandidates}</Field>
      <Field label={c.sampleKinds}>{receipt.sampleKinds.filter((kind) => kind === "exploration").length} / {receipt.sampleKinds.filter((kind) => kind === "boundary").length}</Field>
    </dl>
    <ReferencePreview ids={receipt.observationIds} label={c.observationReferences} c={c} />
    <ReferencePreview ids={receipt.counterexampleIds} label={c.contradictionReferences} c={c} />
    <ReferencePreview ids={receipt.excludedInputDigests} label={c.excludedInputs} c={c} />
    <p className="text-xs text-cyber-text-dim">{c.refsNote}</p>
    <p className="text-sm leading-relaxed text-cyber-text-dim">{c.receiptBoundary}</p>
    <p className="text-sm leading-relaxed text-cyber-text-dim">{c.samplingVersionBoundary}</p>
  </Disclosure>;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 4_096;
}
function references(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 20_000 && value.every(text);
}
function count(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function atom(value: unknown): boolean {
  return record(value) && Object.keys(value).length === 3
    && (value.op === "lte" || value.op === "gt") && text(value.feature) && value.feature.length <= 2_048
    && typeof value.threshold === "number" && Number.isFinite(value.threshold);
}
function isHypothesis(value: unknown): value is ResearchHypothesis {
  if (!record(value) || !record(value.program)) return false;
  const program = value.program;
  const predicate = program.when;
  return text(value.id) && text(value.subjectId) && text(value.subjectVersion)
    && text(value.programDigest) && text(value.trainingDigest) && text(value.createdByEpisodeId)
    && (value.parentHypothesisId === null || text(value.parentHypothesisId))
    && references(value.trainingObservationIds)
    && Object.keys(program).length === 3 && program.schemaVersion === "nexus.conditional-hypothesis.v1"
    && typeof program.expectedHolds === "boolean"
    && (atom(predicate) || (record(predicate) && Object.keys(predicate).length === 3
      && (predicate.op === "and" || predicate.op === "or") && atom(predicate.left) && atom(predicate.right)))
    && boundedJsonText(program) !== null;
}
function isHypothesisReceipt(value: unknown): value is ObservedHypothesisEvaluation {
  return record(value) && value.evaluatorVersion === "conditional-falsifier-v1"
    && ["hypothesisId", "programDigest", "trainingDigest", "subjectId", "subjectVersion", "seed", "reason"].every((key) => text(value[key]))
    && (value.phase === "falsification" || value.phase === "audit")
    && (value.status === "refuted" || value.status === "survived-budget" || value.status === "inconclusive")
    && text(value.samplingProtocol)
    && references(value.observationIds) && references(value.counterexampleIds) && references(value.excludedInputDigests)
    && Array.isArray(value.sampleKinds) && value.sampleKinds.length <= 20_000
    && value.sampleKinds.every((kind) => kind === "exploration" || kind === "boundary")
    && ["inScope", "outOfScope", "attemptedCandidates", "calls", "allowance"].every((key) => count(value[key]));
}

// These checks validate readable projection shapes, not scientific authority.
// Absent additive arrays are valid older v1 data; present malformed fields are not.
// Reject an absent/mismatched envelope instead of mistaking a failed response for an empty station.
function isOverview(value: unknown): value is ObservedOverview {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<ObservedOverview>;
  return data.schemaVersion === "nexus.research-station.v1"
    && typeof data.generatedAt === "string"
    && (data.backend === "memory" || data.backend === "postgres")
    && (data.runtime === undefined || (record(data.runtime)
      && (data.runtime.releaseRevision === null || text(data.runtime.releaseRevision))
      && (data.runtime.evidence === "deployment-env" || data.runtime.evidence === "local-unbound")
      && (data.runtime.lastEpisodeAt === null || text(data.runtime.lastEpisodeAt))))
    && Array.isArray(data.subjects)
    && data.boundary?.productionWrites === false
    && data.boundary.arbitraryCodeExecution === false
    && data.boundary.liveModelCalls === false
    && data.boundary.knownSeedsAreNotDiscoveries === true
    && data.boundary.evaluatorIsolation === "separate-module-not-hostile-process-isolation"
    && (data.station === null || Boolean(data.station
      && data.station.mode === "bounded-symbolic-research"
      && data.station.policy && data.station.budget
      && data.station.budget.externalModelCalls === 0
      && Array.isArray(data.station.questions)
      && Array.isArray(data.station.episodes)
      && Array.isArray(data.station.tools)
      && Array.isArray(data.station.lessons)
      && (data.station.hypotheses === undefined || (Array.isArray(data.station.hypotheses)
        && data.station.hypotheses.length <= 1_000 && data.station.hypotheses.every(isHypothesis)))
      && (data.station.hypothesisEvaluations === undefined || (Array.isArray(data.station.hypothesisEvaluations)
        && data.station.hypothesisEvaluations.length <= 1_000 && data.station.hypothesisEvaluations.every(isHypothesisReceipt)))));
}

export default function ResearchStation() {
  const { language } = useTranslation();
  const c = copy[language];
  const [overview, setOverview] = useState<ObservedOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lastSuccess, setLastSuccess] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(false);

  const refresh = useCallback(async () => {
    // A shared lock covers automatic, manual and visibility-triggered reads.
    // Even an aborted request holds it until its promise settles.
    if (!mounted.current || document.visibilityState !== "visible" || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError(false);
    try {
      const response = await fetch(ENDPOINT, { method: "GET", cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("research-read-failed");
      const payload: unknown = await response.json();
      if (!isOverview(payload)) throw new Error("research-contract-mismatch");
      if (!controller.signal.aborted && mounted.current) {
        setOverview(payload);
        // Transport read time only. Never used to date a claim or old evidence.
        setLastSuccess(new Date().toISOString());
      }
    } catch {
      if (!controller.signal.aborted && mounted.current) setError(true);
    } finally {
      if (request.current === controller) {
        request.current = null;
        if (mounted.current) setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    // A deferred initial read cancels the StrictMode probe before dispatch.
    const initial = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState !== "visible") request.current?.abort();
      else void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      mounted.current = false;
      window.clearTimeout(initial);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      request.current?.abort();
    };
  }, [refresh]);

  const station = overview?.station;
  const hypotheses = station?.hypotheses ?? [];
  const hypothesisReceipts = station?.hypothesisEvaluations ?? [];
  const newlyProposedHypotheses = new Set(hypotheses.map((hypothesis) => JSON.stringify([hypothesis.programDigest, hypothesis.subjectVersion]))).size;
  const negativeCount = station?.episodes.filter((episode) => ["not-reproduced", "tool-rejected", "no-change", "inconclusive", "hypothesis-refuted"].includes(episode.verdict)).length ?? 0;
  const transferQuestions = station?.questions.filter((question) => question.kind === "transfer") ?? [];
  // Count unique questions, not repeated attempts or tool reuse IDs. The
  // persisted episode order identifies the latest completed result per question.
  const latestTransferVerdicts = new Map(
    station?.episodes.filter((episode) => episode.kind === "transfer").map((episode) => [episode.questionId, episode.verdict]) ?? [],
  );
  const transferCounts = {
    total: transferQuestions.length,
    attempted: transferQuestions.filter((question) => question.attempts > 0).length,
    succeeded: transferQuestions.filter((question) => latestTransferVerdicts.get(question.id) === "transferred").length,
    rejected: transferQuestions.filter((question) => latestTransferVerdicts.get(question.id) === "tool-rejected").length,
    noGain: transferQuestions.filter((question) => latestTransferVerdicts.get(question.id) === "no-change").length,
    pending: transferQuestions.filter((question) => question.status === "pending" || question.status === "running").length,
    stopped: transferQuestions.filter((question) => question.status === "stopped").length,
  };

  return (
    <section data-testid="research-station" aria-labelledby="research-title" className="mx-auto min-w-0 max-w-7xl space-y-5 p-4 text-cyber-text [overflow-wrap:anywhere] sm:p-6">
      <header className={`${panel} observatory-hero space-y-4`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1 basis-64">
            <p className="mb-2 flex items-center gap-2 text-sm text-cyber-blue"><Microscope className="h-5 w-5 shrink-0" aria-hidden="true" />{language === "zh" ? "研究观测" : "Research observation"}</p>
            <h1 id="research-title" className="text-2xl font-semibold leading-tight sm:text-3xl">{c.title}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-cyber-text-dim">{c.intro}</p>
          </div>
          <button type="button" onClick={refresh} disabled={loading} className="flex min-h-11 items-center gap-2 rounded-lg border border-cyber-blue bg-cyber-darker px-4 py-2 text-sm font-semibold text-cyber-blue hover:bg-cyber-dark disabled:cursor-wait" aria-label={c.refresh}>
            <RefreshCw className="h-4 w-4 shrink-0" aria-hidden="true" />{c.refresh}
          </button>
        </div>
        <ResearchBriefing overview={overview} language={language} historicalRefutations={hypothesisReceipts.filter((receipt) => receipt.status === "refuted" && hypotheses.some((hypothesis) => receiptMatches(hypothesis, receipt))).length} />
        <p className="flex items-start gap-2 text-sm font-medium"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-cyber-green" aria-hidden="true" />{c.readOnly}</p>
        <p className="text-sm leading-relaxed text-cyber-text-dim">{c.novelty}</p>
        <div data-testid="research-claim-scope" className="space-y-3">
          {overview && <dl className="grid grid-cols-3 gap-3">
            <Field label={c.initialClaims}><span data-testid="research-initial-claims">{station ? new Set(station.subjectIds).size : c.none}</span></Field>
            <Field label={c.derivedQuestions}><span data-testid="research-derived-questions">{station ? station.questions.filter((question) => question.parentEpisodeId).length : c.none}</span></Field>
            <Field label={c.newClaims}><span data-testid="research-new-claims">{newlyProposedHypotheses}</span></Field>
          </dl>}
          <p className="text-sm leading-relaxed text-cyber-text-dim">{c.protocolBoundary}</p>
          {overview?.station === null && <p className="text-xs text-cyber-text-dim">{c.noRunCounts}</p>}
        </div>
        <Disclosure summary={c.boundary} testId="research-boundary"><p className="text-sm leading-relaxed">{c.isolation}</p><p className="text-sm leading-relaxed">{c.factsOnly}</p></Disclosure>
      </header>

      <div data-testid="research-freshness" className={`${panel} space-y-2 text-sm`}>
        <p role="status" aria-live="polite">{loading ? overview ? c.refreshing : c.loading : error ? c.error : c.ready}</p>
        {error && <p role="alert" className="font-medium text-cyber-red">{overview ? c.stale : c.error}</p>}
        <p className="text-cyber-text-dim">{c.lastSuccess}: {lastSuccess ? <time dateTime={lastSuccess}>{lastSuccess}</time> : c.notRead}</p>
        {overview && <p className="text-cyber-text-dim">{c.snapshotTime}: <time dateTime={overview.generatedAt}>{overview.generatedAt}</time> · {c.backend}: {overview.backend}</p>}
        <p className="text-cyber-text-dim">{c.polling}</p>
        <p className="text-cyber-text-dim">{c.clocks}</p>
        {overview && <div data-testid="research-runtime" className="space-y-2">
          {overview.runtime ? <>
            <p>{c.release}: <code>{overview.runtime.releaseRevision ?? c.none}</code></p>
            <p>{c.releaseEvidence}: {overview.runtime.evidence === "deployment-env" ? c.deploymentEnv : c.unbound} · <code>{overview.runtime.evidence}</code></p>
            <p>{c.lastEpisode}: {overview.runtime.lastEpisodeAt ? <time dateTime={overview.runtime.lastEpisodeAt}>{overview.runtime.lastEpisodeAt}</time> : c.none}</p>
          </> : <p>{c.missingRuntime}</p>}
        </div>}
      </div>

      {overview?.station === null && <section data-testid="research-empty" className={panel}><h2 className="text-lg font-semibold">{c.emptyTitle}</h2><p className="mt-2 text-sm leading-relaxed text-cyber-text-dim">{c.empty}</p></section>}

      {station && <>
        <section data-testid="research-state" className={`${panel} space-y-4`}>
          <h2 className="text-lg font-semibold">{c.state}</h2>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label={c.stationId}>{station.id}</Field>
            <Field label={c.revision}><span data-testid="research-revision">{station.revision}</span></Field>
            <Field label={c.ledgerStatus}><span data-testid="research-status"><LabeledCode value={station.status} language={language} /></span></Field>
            <Field label={c.seed}>{station.seed}</Field>
            <Field label={c.updated}>{station.updatedAt}</Field>
            <Field label={c.stop}><span data-testid="research-stop-reason">{station.stopReason ?? c.noStop}</span></Field>
          </dl>
          <div data-testid="research-budget" className="rounded-xl border border-cyber-gray-light bg-cyber-dark p-4">
            <h3 className="text-sm font-semibold">{c.budget}</h3>
            <dl className="mt-3 grid grid-cols-3 gap-3">
              <Field label={c.spent}><span data-testid="research-spent" className="text-xl font-semibold">{station.budget.spentCalls}</span></Field>
              <Field label={c.reserved}><span data-testid="research-reserved" className="text-xl font-semibold">{station.budget.reservedCalls}</span></Field>
              <Field label={c.cap}><span data-testid="research-cap" className="text-xl font-semibold">{station.policy.maxOracleCalls}</span></Field>
            </dl>
          </div>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label={c.abandoned}>{station.budget.abandonedReservations}</Field>
            <Field label={c.externalCalls}>{station.budget.externalModelCalls}</Field>
            <Field label={c.cost}>{station.budget.actualModelCostUsd}</Field>
            <Field label={c.episodeCap}>{station.policy.maxEpisodes}</Field>
            <Field label={c.callsPerEpisode}>{station.policy.maxCallsPerEpisode}</Field>
            <Field label={c.attemptsCap}>{station.policy.maxAttemptsPerQuestion}</Field>
          </dl>
          <div data-testid="research-transfer-denominator" className="space-y-3 rounded-lg border border-cyber-gray-light p-3">
            <h3 className="text-sm font-semibold">{c.transferCounts}</h3>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label={c.total}><span data-testid="research-transfer-total">{transferCounts.total}</span></Field>
              <Field label={c.transferAttempted}><span data-testid="research-transfer-attempted">{transferCounts.attempted}</span></Field>
              <Field label={c.transferSucceeded}><span data-testid="research-transfer-succeeded">{transferCounts.succeeded}</span></Field>
              <Field label={c.transferRejected}><span data-testid="research-transfer-rejected">{transferCounts.rejected}</span></Field>
              <Field label={c.transferPending}><span data-testid="research-transfer-pending">{transferCounts.pending}</span></Field>
              <Field label={c.transferNoGain}><span data-testid="research-transfer-no-gain">{transferCounts.noGain}</span></Field>
              <Field label={c.transferStopped}><span data-testid="research-transfer-stopped">{transferCounts.stopped}</span></Field>
            </dl>
            <p className="text-xs leading-relaxed text-cyber-text-dim">{c.transferNote}</p>
          </div>
          <div data-testid="research-negative-results" className="rounded-lg border border-cyber-gray-light p-3"><h3 className="text-sm font-semibold">{c.negative}: {negativeCount} / {station.episodes.length}</h3><p className="mt-1 text-xs leading-relaxed text-cyber-text-dim">{c.negativeNote}</p></div>
          <Disclosure summary={c.lease}>{station.lease ? <dl className="grid gap-3 sm:grid-cols-2"><Field label={c.owner}>{station.lease.owner}</Field><Field label={c.question}>{station.lease.questionId}</Field><Field label={c.episodes}>{station.lease.episodeId}</Field><Field label={c.reserved}>{station.lease.reservedCalls}</Field><Field label={c.expires}>{station.lease.expiresAt}</Field></dl> : <p className="text-sm text-cyber-text-dim">{c.noLease}</p>}</Disclosure>
        </section>
      </>}

      {overview && <section data-testid="research-subjects" className={panel}>
        <h2 className="mb-3 text-lg font-semibold">{c.subjects} ({overview.subjects.length})</h2>
        {!overview.subjects.length && <p className="text-sm text-cyber-text-dim">{c.noSubjects}</p>}
        {overview.subjects.map((subject) => <Disclosure key={subject.id} testId="research-subject" summary={<>{subject.title[language]}<span className="mt-1 block text-sm text-cyber-text-dim"><LabeledCode value={subject.origin} language={language} /></span></>}>
          <dl className="grid gap-3 sm:grid-cols-2"><Field label={c.subject}>{subject.id}</Field><Field label={c.version}>{subject.version}</Field><Field label={c.family}>{subject.family}</Field><Field label={c.interpretation}><LabeledCode value={subject.interpretation} language={language} /></Field><Field label={c.claim}>{subject.claim[language]}</Field></dl>
        </Disclosure>)}
      </section>}

      {station && overview && <>
        <section data-testid="research-hypotheses" className={panel}>
          <h2 className="text-lg font-semibold">{c.hypotheses} ({hypotheses.length})</h2>
          <p className="my-3 text-sm leading-relaxed text-cyber-text-dim">{c.hypothesisBoundary}</p>
          {!hypotheses.length && <p className="text-sm text-cyber-text-dim">{c.noHypotheses}</p>}
          {hypotheses.map((hypothesis) => <HypothesisCard key={hypothesis.id} hypothesis={hypothesis} receipts={hypothesisReceipts} c={c} language={language} />)}
        </section>
        <section data-testid="research-hypothesis-receipts" className={panel}>
          <h2 className="text-lg font-semibold">{c.hypothesisReceipts} ({hypothesisReceipts.length})</h2>
          <p className="my-3 text-sm leading-relaxed text-cyber-text-dim">{c.receiptBoundary}</p>
          {!hypothesisReceipts.length && <p className="text-sm text-cyber-text-dim">{c.noHypothesisReceipts}</p>}
          {hypothesisReceipts.map((receipt, index) => <HypothesisReceipt key={`${index}:${receipt.hypothesisId}:${receipt.phase}:${receipt.seed}`} receipt={receipt} matched={hypotheses.some((hypothesis) => receiptMatches(hypothesis, receipt))} c={c} language={language} />)}
        </section>
        <section id="research-questions" data-testid="research-questions" className={`${panel} scroll-mt-20`}>
          <h2 className="text-lg font-semibold">{c.queue} ({station.questions.length})</h2>
          <p className="my-3 text-sm text-cyber-text-dim">{c.questionsNote}</p>
          {!station.questions.length && <p className="text-sm text-cyber-text-dim">{c.noQuestions}</p>}
          {station.questions.map((question) => <Disclosure key={question.id} testId="research-question" summary={<>{question.title[language]}<span className="mt-1 block text-sm text-cyber-text-dim"><LabeledCode value={question.status} language={language} /> · <LabeledCode value={question.kind} language={language} /></span></>}>
            <dl className="grid gap-3 sm:grid-cols-2"><Field label={c.question}>{question.id}</Field><Field label={c.subject}>{question.subjectId}</Field><Field label={c.priority}>{question.priority}</Field><Field label={c.attempts}>{question.attempts}</Field><Field label={c.round}>{question.createdAtRound}</Field><Field label={c.reason}>{question.reasonCode}</Field></dl>
            <Provenance question={question} c={c} />
          </Disclosure>)}
        </section>
        <section id="research-episodes" data-testid="research-episodes" className={`${panel} scroll-mt-20`}>
          <h2 className="text-lg font-semibold">{c.episodes} ({station.episodes.length})</h2>
          <p className="my-3 text-sm leading-relaxed text-cyber-text-dim">{c.previewNote}</p>
          {!station.episodes.length && <p className="text-sm text-cyber-text-dim">{c.noEpisodes}</p>}
          {station.episodes.map((episode) => <Episode key={episode.id} episode={episode} question={station.questions.find((question) => question.id === episode.questionId)} subject={overview.subjects.find((subject) => subject.id === episode.subjectId)} c={c} language={language} />)}
        </section>
        <section data-testid="research-tools" className={panel}>
          <h2 className="text-lg font-semibold">{c.tools} ({station.tools.length})</h2>
          <p className="my-3 text-sm leading-relaxed text-cyber-text-dim">{c.toolBoundary}</p>
          {!station.tools.length && <p className="text-sm text-cyber-text-dim">{c.noTools}</p>}
          {station.tools.map((tool) => <Tool key={tool.id} tool={tool} subjects={overview.subjects} c={c} language={language} />)}
        </section>
        <section data-testid="research-lessons" className={panel}>
          <h2 className="mb-3 text-lg font-semibold">{c.lessons} ({station.lessons.length})</h2>
          <p className="mb-3 text-sm leading-relaxed text-cyber-text-dim">{c.lessonAuthority}</p>
          {!station.lessons.length && <p className="text-sm text-cyber-text-dim">{c.noLessons}</p>}
          {station.lessons.map((lesson) => <Disclosure key={lesson.id} testId="research-lesson" summary={<>
            <span data-testid="research-lesson-boundary" className="block text-sm font-semibold">{lesson.kind === "hypothesis" ? c.hypothesisNote : c.reportedNote}</span>
            <span className="mt-1 block">{lesson.statement[language]}</span>
            <span className="mt-1 block text-sm text-cyber-text-dim"><LabeledCode value={lesson.kind} language={language} /> · <span data-testid="research-lesson-status">{c.reportedStatus}: <code className="break-all text-xs">{lesson.status}</code></span></span>
          </>}>
            <dl className="grid gap-3 sm:grid-cols-2"><Field label={c.lessonIds}>{lesson.id}</Field><Field label={c.subject}>{lesson.subjectId}</Field><Field label={c.createdBy}>{lesson.episodeId}</Field><Field label={c.applicability}>{lesson.applicability}</Field><Field label={c.evidence}>{lesson.evidenceIds.join(", ") || c.none}</Field><Field label={c.supersedes}>{lesson.supersedes ?? c.none}</Field></dl>
          </Disclosure>)}
        </section>
      </>}
    </section>
  );
}
