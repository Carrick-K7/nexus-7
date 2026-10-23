"use client";

import type { Language } from "@/i18n/translations";
import type { EpisodeVerdict, ResearchOverview, ResearchStation } from "@/research/contracts";

type BriefingOverview = Omit<ResearchOverview, "station"> & { station: Omit<ResearchStation, "hypothesisEvaluations"> | null };
const words = {
  en: {
    title: "Understand the research", now: "What is being studied?", latest: "What was found or refuted?", next: "Why this next step?", budget: "Budget & stopping reasons",
    unread: "No successful snapshot yet. No research activity is implied.", empty: "No station has been recorded; the catalogue is not a finding.",
    reserved: "Reserved question · ledger only", pending: "Pending question · not a promised next selection", previous: "Last completed topic · not current work", noQuestion: "No active or pending question is recorded.",
    claim: "Claim under test, not an established conclusion", reason: "Recorded reason", parent: "Parent episode", root: "Root question; no parent episode recorded", noNext: "No pending next step is recorded. The page does not create work.",
    ledger: "The persisted state is not an OS worker heartbeat. A running ledger, reservation or recent read does not prove a worker is alive.",
    noEpisode: "No completed episode is recorded. No discovery or refutation is implied.", completed: "Last episode completed", calls: "Calls spent / cap", reservedCalls: "Reserved calls", episodes: "Completed episodes / cap", stop: "Recorded stop reason", noStop: "No stop reason recorded", reached: "A finite limit has been reached. More work must not be inferred; exhaustion is not a scientific proof.",
    limited: "Work is bounded by this recorded policy. Pending questions are not a promise of continued execution.",
    refuted: "Historical matching refutation receipts retained", refutedNote: "Later budget-limited survival cannot erase those counterexamples.",
    boundary: "Known audit seeds and controlled challenges are not natural new discoveries. A recorded verdict applies only to its instrument and evidence.",
    share: "Share research page", evidence: "Read raw evidence (JSON)", detail: "Inspect episodes & evidence", queue: "Inspect question provenance", archive: "Historical city archive",
  },
  zh: {
    title: "理解这项研究", now: "现在研究什么？", latest: "最近发现或反驳什么？", next: "为什么选择下一步？", budget: "预算与停止原因",
    unread: "尚未成功读取快照，不意味着已有研究活动。", empty: "尚无研究站记录；对象目录不是研究发现。",
    reserved: "已预留问题 · 仅账本记录", pending: "待处理问题 · 不承诺下一步选择", previous: "最近完成的主题 · 不是当前工作", noQuestion: "未记录当前或待处理问题。",
    claim: "待检验声明，不是已成立的结论", reason: "已记录原因", parent: "父回合", root: "根问题；未记录父回合", noNext: "未记录待执行的下一步。页面不会创建研究任务。",
    ledger: "持久化状态不是操作系统 worker 心跳。账本 running、预留或最近读取都不能证明 worker 存活。",
    noEpisode: "尚无已完成回合记录，不意味着已有发现或否证。", completed: "最近回合完成时间", calls: "已花费调用 / 上限", reservedCalls: "已预留调用", episodes: "已完成回合 / 上限", stop: "已记录停止原因", noStop: "未记录停止原因", reached: "已触及有限上限，不能据此推断还有后续运行；耗尽预算不构成科学证明。",
    limited: "研究受此记录策略的有限预算约束。待处理问题不承诺继续执行。",
    refuted: "保留的历史匹配否证回执数", refutedNote: "后来在有限预算内未被推翻，也不能抹去这些反例。",
    boundary: "已知审计种子与受控挑战不算自然新发现。记录判定仅限于其仪器和证据。",
    share: "分享研究页面", evidence: "读取原始证据（JSON）", detail: "查看回合与证据", queue: "查看问题来源", archive: "历史城市档案",
  },
};
const verdicts: Record<EpisodeVerdict, { en: string; zh: string }> = {
  counterexample: { en: "Instrument counterexample recorded", zh: "记录了仪器反例" },
  "not-reproduced": { en: "Not reproduced", zh: "未复现" },
  confirmed: { en: "Replication confirmed for this episode", zh: "此回合复现获得确认" },
  "tool-certified": { en: "Reducer evaluation accepted", zh: "归约工具评估已接受" },
  "tool-rejected": { en: "Reducer evaluation rejected", zh: "归约工具评估已拒绝" },
  transferred: { en: "Tool transfer recorded", zh: "记录了工具迁移" },
  "no-change": { en: "No change / no gain", zh: "无变化 / 无收益" },
  inconclusive: { en: "Inconclusive", zh: "无结论" },
  "hypothesis-proposed": { en: "Conditional hypothesis proposed, not proved", zh: "提出条件命题，尚未证明" },
  "hypothesis-refuted": { en: "Conditional hypothesis refuted", zh: "条件命题已被否证" },
  "hypothesis-survived": { en: "Not refuted within budget, not proved", zh: "预算内未被推翻，并非证明" },
};
const linkStyle = "inline-flex min-h-11 items-center rounded text-sm text-cyber-blue underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4";

/** Plain-language projection, never a second scheduler or a scientific verdict generator. */
export default function ResearchBriefing({ overview, language, historicalRefutations }: { overview: BriefingOverview | null; language: Language; historicalRefutations: number }) {
  const c = words[language];
  const station = overview?.station;
  const lastEpisode = station?.episodes.at(-1);
  const reserved = station?.questions.find((question) => question.id === station.lease?.questionId);
  // Preserve persisted queue order. This is explicitly not a prediction of the scheduler.
  const pending = station?.questions.find((question) => question.status === "pending");
  const next = reserved ?? pending;
  const topic = next ?? station?.questions.find((question) => question.id === lastEpisode?.questionId);
  const subject = overview?.subjects.find((item) => item.id === (topic?.subjectId ?? lastEpisode?.subjectId));
  const atLimit = station && (station.budget.spentCalls >= station.policy.maxOracleCalls || station.episodes.length >= station.policy.maxEpisodes || station.status === "budget-exhausted");
  const unknown = overview ? c.empty : c.unread;

  return <section data-testid="research-briefing" aria-labelledby="research-briefing-title" className="space-y-4">
    <h2 id="research-briefing-title" className="text-lg font-semibold">{c.title}</h2>
    <div className="grid min-w-0 gap-4 md:grid-cols-2">
      <article data-testid="research-briefing-now" className="min-w-0 space-y-2 rounded-xl border border-cyber-gray-light p-4">
        <h3 className="font-semibold">{c.now}</h3>
        {!station ? <p className="text-sm">{unknown}</p> : <>
          <p className="text-xs text-cyber-text-dim">{reserved ? c.reserved : pending ? c.pending : topic ? c.previous : c.noQuestion}</p>
          {topic && <p className="text-sm">{topic.title[language]}</p>}
          {subject && <><p className="text-sm">{subject.title[language]} · <code>{subject.version}</code></p><p className="text-sm text-cyber-text-dim">{c.claim}: {subject.claim[language]}</p><code className="text-xs">{subject.origin}</code></>}
        </>}
      </article>
      <article data-testid="research-briefing-latest" className="min-w-0 space-y-2 rounded-xl border border-cyber-gray-light p-4">
        <h3 className="font-semibold">{c.latest}</h3>
        {lastEpisode ? <><p className="text-sm">{verdicts[lastEpisode.verdict]?.[language] ?? lastEpisode.verdict} · <code>{lastEpisode.verdict}</code></p><p className="text-xs">{lastEpisode.id} · {lastEpisode.subjectId}</p><p className="text-xs text-cyber-text-dim">{c.completed}: <time dateTime={lastEpisode.completedAt}>{lastEpisode.completedAt}</time></p></> : <p className="text-sm">{overview ? c.noEpisode : c.unread}</p>}
        {historicalRefutations > 0 && <p className="text-sm">{c.refuted}: {historicalRefutations}. {c.refutedNote}</p>}
        <p className="text-xs leading-relaxed text-cyber-text-dim">{c.boundary}</p>
      </article>
      <article data-testid="research-briefing-next" className="min-w-0 space-y-2 rounded-xl border border-cyber-gray-light p-4">
        <h3 className="font-semibold">{c.next}</h3>
        {next ? <><p className="text-sm">{next.title[language]}</p><p className="text-xs">{c.reason}: <code>{next.reasonCode}</code></p><p className="text-xs">{next.parentEpisodeId ? `${c.parent}: ${next.parentEpisodeId}` : c.root}</p>{next.observationId && <p className="text-xs">{next.observationId}</p>}<p className="text-xs text-cyber-text-dim">{reserved ? c.reserved : c.pending}</p></> : <p className="text-sm">{overview ? c.noNext : c.unread}</p>}
        {station && <a className={linkStyle} href="#research-questions">{c.queue}</a>}
      </article>
      <article data-testid="research-briefing-budget" className="min-w-0 space-y-2 rounded-xl border border-cyber-gray-light p-4">
        <h3 className="font-semibold">{c.budget}</h3>
        {station ? <><p className="text-sm">{c.calls}: {station.budget.spentCalls} / {station.policy.maxOracleCalls}</p><p className="text-sm">{c.reservedCalls}: {station.budget.reservedCalls}</p><p className="text-sm">{c.episodes}: {station.episodes.length} / {station.policy.maxEpisodes}</p><p className="text-sm">{c.stop}: <code>{station.stopReason ?? c.noStop}</code></p><p className="text-xs leading-relaxed text-cyber-text-dim">{atLimit ? c.reached : c.limited}</p></> : <p className="text-sm">{unknown}</p>}
      </article>
    </div>
    <p data-testid="research-worker-boundary" className="text-sm leading-relaxed text-cyber-text-dim">{c.ledger}</p>
    <nav aria-label={c.title} className="flex flex-wrap gap-x-5 gap-y-1">
      <a className={linkStyle} href="/research">{c.share}</a>
      <a className={linkStyle} href="/api/research/v1/overview">{c.evidence}</a>
      {station && <a className={linkStyle} href="#research-episodes">{c.detail}</a>}
      <a className={linkStyle} href="/archive/city">{c.archive}</a>
    </nav>
  </section>;
}
