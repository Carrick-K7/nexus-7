"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "@/hooks/useTranslation";
import { hasCompletedCityArchive, parseCityArchive, type CityArchiveManifest } from "./city-archive-contract";

const ENDPOINT = "/data/city-archive.json";
const copy = {
  en: {
    title: "Historical city archive", intro: "The city is retained as historical evidence and a research baseline. This page only reads a static manifest; it never starts, advances or writes to the city.",
    loading: "Reading the static archive manifest…", unavailable: "Archive capture is not available. Completed retirement has not been verified here.",
    pending: "Archive capture / retirement is not complete. The decision to retire is not evidence that continuous operation has stopped.",
    archived: "The manifest records a stopped city and a captured historical snapshot. Check the original artifacts below; this page does not independently attest their authenticity.",
    state: "Manifest state", captured: "Snapshot captured at", stopped: "Continuous operation stopped at", revision: "Captured release revision", turn: "Final recorded Turn", date: "Recorded simulation date", fingerprint: "Recorded fingerprint", reason: "Recorded reason", none: "Not recorded",
    trust: "Historical 90-day observation", observed: "Observed days / required days", status: "Reported trust status", notPassed: "Retiring the old 90-day track does not mean it passed. Simulation time, local tests and archived reports do not substitute for 90 days of production observation.",
    artifacts: "Original artifacts", noArtifacts: "No captured artifacts have been supplied.", checksum: "Reported SHA-256 (not verified by this page)", clocks: "All dates below come from the archive manifest. Loading this page does not renew old evidence or date a new capture.", research: "Return to the research station", manifest: "Read the static manifest (JSON)", specimen: "Older city observation view · read-only compatibility", specimenNote: "The older view reads its compatibility API; it is not this immutable archive and does not certify that the city is still running.",
  },
  zh: {
    title: "历史城市档案", intro: "城市作为历史证据和研究基准保留。本页仅读取静态清单，不会启动、推进或写入城市。",
    loading: "正在读取静态档案清单…", unavailable: "尚无可用档案捕获，本页未核实已完成退役。",
    pending: "档案捕获 / 退役尚未完成。决定退役不代表连续运行已经停止。",
    archived: "清单记录了城市停机和已捕获的历史快照。请查看下方原始资料；本页不独立认证其真实性。",
    state: "清单状态", captured: "快照捕获时间", stopped: "连续运行停止时间", revision: "捕获的发布修订号", turn: "最后记录 Turn", date: "记录的模拟日期", fingerprint: "记录的指纹", reason: "记录的原因", none: "未记录",
    trust: "历史 90 天观察", observed: "已观察天数 / 要求天数", status: "报告的信任状态", notPassed: "退役旧 90 天轨道不等于通过。模拟时间、本地测试与历史报告不能替代 90 天生产观察。",
    artifacts: "原始资料", noArtifacts: "尚未提供捕获资料。", checksum: "报告的 SHA-256（本页未验证）", clocks: "下列日期全部来自档案清单。打开页面不会刷新旧证据，也不会生成新的捕获时间。", research: "返回研究站", manifest: "读取静态清单（JSON）", specimen: "旧城市观测页面 · 只读兼容入口", specimenNote: "旧页面读取兼容 API，不是此不可变档案，也不证明城市仍在运行。",
  },
};
const panel = "min-w-0 space-y-4 rounded-2xl border border-cyber-gray-light bg-cyber-darker p-4 sm:p-6";
const link = "inline-flex min-h-11 items-center rounded text-cyber-blue underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4";

export default function CityArchive() {
  const { language } = useTranslation();
  const c = copy[language];
  const [archive, setArchive] = useState<CityArchiveManifest | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    const initial = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(ENDPOINT, { method: "GET", cache: "no-store", signal: controller.signal });
          if (!response.ok) throw new Error("archive-unavailable");
          const parsed = parseCityArchive(await response.json());
          if (!controller.signal.aborted) setArchive(parsed);
        } catch { /* No fallback to a world service or newly generated snapshot. */ }
        finally { if (!controller.signal.aborted) setLoading(false); }
      })();
    }, 0);
    return () => { window.clearTimeout(initial); controller.abort(); };
  }, []);

  const complete = archive && hasCompletedCityArchive(archive);
  const fields = archive ? [
    [c.state, archive.state], [c.captured, archive.capturedAt], [c.stopped, archive.stoppedAt],
    [c.revision, archive.releaseRevision], [c.turn, archive.turn], [c.date, archive.simulationDate], [c.fingerprint, archive.fingerprint],
  ] as const : [];
  return <section data-testid="city-archive" className="mx-auto min-w-0 max-w-5xl space-y-5 p-4 text-cyber-text [overflow-wrap:anywhere] sm:p-6" aria-labelledby="city-archive-title">
    <header className={panel}>
      <h1 id="city-archive-title" className="text-2xl font-semibold sm:text-3xl">{c.title}</h1>
      <p className="text-sm leading-relaxed text-cyber-text-dim">{c.intro}</p>
      <p data-testid="city-archive-status" role="status" className="text-sm font-medium">{loading ? c.loading : !archive ? c.unavailable : complete ? c.archived : c.pending}</p>
      <p className="text-sm text-cyber-text-dim">{c.clocks}</p>
      <nav aria-label={c.title} className="flex flex-wrap gap-x-5"><a className={link} href="/research">{c.research}</a><a className={link} href={ENDPOINT}>{c.manifest}</a></nav>
    </header>
    {archive && <>
      <section className={panel} aria-label={c.state}>
        <dl className="grid gap-4 sm:grid-cols-2">{fields.map(([label, value]) => <div key={label}><dt className="text-xs text-cyber-text-dim">{label}</dt><dd className="mt-1 text-sm">{value ?? c.none}</dd></div>)}</dl>
        <h2 className="font-semibold">{c.reason}</h2><p className="text-sm">{archive.reason[language]}</p>
      </section>
      <section data-testid="city-archive-trust" className={panel}>
        <h2 className="text-lg font-semibold">{c.trust}</h2>
        <p className="text-sm">{c.observed}: {archive.trustSummary.observedDays ?? c.none} / {archive.trustSummary.requiredDays}</p>
        <p className="text-sm">{c.status}: <code>{archive.trustSummary.status}</code></p>
        <p className="text-sm leading-relaxed text-cyber-text-dim">{c.notPassed}</p>
      </section>
      <section className={panel}>
        <h2 className="text-lg font-semibold">{c.artifacts}</h2>
        {archive.artifacts.length ? <ul className="space-y-4">{archive.artifacts.map((artifact, index) => <li key={`${index}:${artifact.href}`} className="text-sm"><a className={link} href={artifact.href} rel="noreferrer">{artifact.label[language]}</a>{artifact.sha256 && <p className="text-xs text-cyber-text-dim">{c.checksum}: <code>{artifact.sha256}</code></p>}</li>)}</ul> : <p className="text-sm text-cyber-text-dim">{c.noArtifacts}</p>}
      </section>
    </>}
    <footer className={panel}><Link prefetch={false} className={link} href="/?view=symbiosis">{c.specimen}</Link><p className="text-sm text-cyber-text-dim">{c.specimenNote}</p><p className="text-sm text-cyber-text-dim">{!archive && c.notPassed}</p></footer>
  </section>;
}
