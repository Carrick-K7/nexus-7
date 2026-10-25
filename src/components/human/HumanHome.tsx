"use client";

import { useLayoutEffect, useState } from "react";
import Link from "next/link";
import { parseHumanOverview, type HumanOverview } from "@/research/human-contracts";
import HumanStory from "./HumanStory";
import { copy } from "./copy";
import { count, humanTime, type HumanLanguage } from "./format";
import { useReadOnlySnapshot } from "./useReadOnlySnapshot";
import styles from "./HumanHome.module.css";

function studyStatus(study: NonNullable<HumanOverview["study"]>, language: HumanLanguage) {
  const c = copy[language];
  if (study.state === "unknown" || study.stopReason === "unknown") return { title: c.unknown, note: "" };
  if (study.state === "paused") return { title: c.paused, note: c.pauseNote };
  if (study.state === "running") return { title: c.running, note: "" };
  if (study.state === "budget-exhausted") return {
    title: c.capped, note: study.stopReason === "episode-cap" ? c.capNote : c.measurementCapNote,
  };
  return { title: c.idle, note: study.stopReason === "agenda-empty" ? c.endedNote : "" };
}

export default function HumanHome() {
  const [language, setLanguage] = useState<HumanLanguage>("zh");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [technicalOpen, setTechnicalOpen] = useState(false);
  const { snapshot, error, reading, refresh } = useReadOnlySnapshot(parseHumanOverview);
  const c = copy[language];
  const study = snapshot?.study;
  const status = study ? studyStatus(study, language) : { title: !snapshot && reading && !error ? c.reading : c.unknown, note: snapshot ? c.empty : "" };
  const errorText = error === "unauthorized" ? c.unauthorized : error === "invalid" ? c.invalid : c.unavailable;

  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = { lang: root.lang, theme: root.dataset.theme, colorScheme: root.style.colorScheme };
    root.lang = language === "zh" ? "zh-CN" : "en";
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    return () => {
      root.lang = previous.lang;
      if (previous.theme === undefined) delete root.dataset.theme;
      else root.dataset.theme = previous.theme;
      root.style.colorScheme = previous.colorScheme;
    };
  }, [language, theme]);

  return <div className={styles.home} data-testid="human-home" data-theme={theme} lang={language === "zh" ? "zh-CN" : "en"}>
    <a className={styles.skip} href="#human-main">{c.skip}</a>
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link className={styles.brand} href="/" prefetch={false}>NEXUS-7</Link>
        <nav className={styles.navigation} aria-label={c.navigation}>
          <Link href="/" aria-current="page" prefetch={false}>{c.overview}</Link><a href="/research">{c.technical}</a><a href="/archive/city">{c.archive}</a>
        </nav>
        <div className={styles.preferences}>
          <div className={styles.controlGroup} role="group" aria-label={c.language}>
            <button type="button" lang="zh-CN" aria-pressed={language === "zh"} onClick={() => setLanguage("zh")}>中文</button>
            <button type="button" lang="en" aria-pressed={language === "en"} onClick={() => setLanguage("en")}>EN</button>
          </div>
          <div className={styles.controlGroup} role="group" aria-label={c.theme}>
            <button type="button" aria-pressed={theme === "light"} onClick={() => setTheme("light")}>{c.light}</button>
            <button type="button" aria-pressed={theme === "dark"} onClick={() => setTheme("dark")}>{c.dark}</button>
          </div>
        </div>
      </div>
    </header>

    <main id="human-main" tabIndex={-1} className={styles.main}>
      <section className={styles.status} data-testid="human-status" aria-labelledby="human-status-heading">
        <div className={styles.titleRow}>
          <h1 id="human-status-heading">{c.title}</h1>
          <span className={styles.badge} data-testid="human-state">{status.title}</span>
        </div>
        {status.note && <p className={styles.muted}>{status.note}</p>}
        {error && <p className={styles.alert} role="alert" data-testid="human-error">{errorText}{snapshot && ` ${c.stale}`}</p>}
      </section>

      <dl className={styles.metrics} data-testid="human-metrics">
        <div><dt>{c.steps}</dt><dd data-testid={study ? "human-progress" : undefined}>{study ? <>{count(study.steps, language)} <span>/ {count(study.stepLimit, language)}</span></> : c.noneExperiment}</dd></div>
        <div><dt>{c.localCalls}</dt><dd data-testid={study ? "human-measurements" : undefined}>{study ? count(study.measurements, language) : c.noneExperiment}</dd></div>
        <div><dt>{c.tools}</dt><dd data-testid={study ? "human-tools" : undefined}>{study ? count(study.counts.tools, language) : c.noneExperiment}</dd></div>
        <div><dt>{c.hypotheses}</dt><dd data-testid={study ? "human-hypotheses" : undefined}>{study ? count(study.counts.hypotheses, language) : c.noneExperiment}</dd></div>
      </dl>

      <HumanStory snapshot={snapshot} language={language} />

      <section className={styles.resourceSection} data-testid="human-usage" aria-label={c.usageTitle}>
        {study ? <dl className={styles.resources}>
          <div><dt>{c.modelCalls}</dt><dd data-testid="human-model-calls">{count(study.modelCalls, language)} {language === "zh" ? "次" : "calls"}</dd></div>
          <div><dt>{c.modelCost}</dt><dd data-testid="human-model-cost">{language === "zh" ? `${String(study.modelCostUsd)} 美元` : `USD ${String(study.modelCostUsd)}`}</dd></div>
        </dl> : <p className={styles.muted}>{c.usageUnknown}</p>}
        <div className={styles.freshness} data-testid="human-freshness">
          {study && <p>{c.lastExperiment}：{study.lastActivityAt
            ? <time dateTime={study.lastActivityAt} data-testid="human-last-experiment">{humanTime(study.lastActivityAt, language)}</time> : c.noneExperiment}</p>}
          {snapshot && <p>{error ? c.previousRead : c.readAt}：<time dateTime={snapshot.readAt} data-testid="human-read-time">{humanTime(snapshot.readAt, language)}</time></p>}
          <button type="button" className={styles.refresh} disabled={reading} aria-label={c.refresh} onClick={() => void refresh()}>{reading ? c.refreshing : c.refreshLabel}</button>
        </div>
      </section>

      <details className={styles.details} data-testid="human-technical" onToggle={(event) => setTechnicalOpen(event.currentTarget.open)}>
        <summary>{c.more}</summary>
        {technicalOpen && <div className={styles.detailBody}>
          <dl className={styles.metadata}>
            {study && <>
              <div><dt>{c.localCalls}</dt><dd data-testid="human-measurement-budget">{count(study.measurements, language)} · {c.reserved} {count(study.reserved, language)} · {c.limit} {count(study.measurementLimit, language)}</dd></div>
              <div><dt>{c.pendingQuestions}</dt><dd>{count(study.pendingQuestions, language)}</dd></div>
            </>}
            {snapshot && <>
              <div><dt>{c.backend}</dt><dd>{snapshot.source.backend}</dd></div>
              <div><dt>{c.stationRevision}</dt><dd>{snapshot.source.stationRevision === null ? c.noneExperiment : count(snapshot.source.stationRevision, language)}</dd></div>
              <div><dt>{c.release}</dt><dd>{snapshot.source.releaseRevision ?? c.unbound}</dd></div>
            </>}
          </dl>
          {snapshot && <div><h2>{c.statusDetails}</h2><pre className={styles.exact}>{JSON.stringify({ source: snapshot.source, study: snapshot.study, storyAvailability: snapshot.storyAvailability }, null, 2)}</pre></div>}
          <nav className={styles.evidenceLinks} aria-label={c.source}>
            <a href="/research">{c.technical}</a><a href="/api/research/v1/human">{c.rawData}</a><a href="/api/research/v1/overview">{c.rawEvidence}</a>
          </nav>
        </div>}
      </details>
    </main>
  </div>;
}
