"use client";

import { useLayoutEffect, useState } from "react";
import { parseHumanOverview, type HumanOverview } from "@/research/human-contracts";
import HumanStory from "./HumanStory";
import { copy } from "./copy";
import { count, humanTime, type HumanLanguage } from "./format";
import { useReadOnlySnapshot } from "./useReadOnlySnapshot";
import styles from "./HumanHome.module.css";

function studyStatus(study: NonNullable<HumanOverview["study"]>, language: HumanLanguage) {
  const c = copy[language];
  const progress = language === "zh" ? `已完成 ${count(study.steps, language)} / ${count(study.stepLimit, language)} 步`
    : `${count(study.steps, language)} / ${count(study.stepLimit, language)} steps completed`;
  if (study.state === "unknown" || study.stopReason === "unknown") return { title: c.unknown, note: c.unknownNote, progress };
  if (study.state === "paused") return { title: c.paused, note: c.pauseNote, progress };
  if (study.state === "running") return { title: c.running, note: c.runningNote, progress };
  if (study.state === "budget-exhausted" && study.stopReason === "episode-cap") return {
    title: c.capped, note: c.capNote, progress: language === "zh"
      ? `已做 ${count(study.steps, language)} / ${count(study.stepLimit, language)} 步，按预先上限结束。`
      : `${count(study.steps, language)} / ${count(study.stepLimit, language)} steps completed; the preset limit was reached.`,
  };
  if (study.state === "budget-exhausted" && study.stopReason === "oracle-budget") return {
    title: c.capped, note: c.measurementCapNote, progress: language === "zh"
      ? `已做 ${count(study.measurements, language)} / ${count(study.measurementLimit, language)} 次本地计算，按预先上限结束。`
      : `${count(study.measurements, language)} / ${count(study.measurementLimit, language)} local computations; the preset limit was reached.`,
  };
  if (study.stopReason === "agenda-empty") return { title: c.ended, note: c.endedNote, progress };
  return { title: c.idle, note: c.idleNote, progress };
}

export default function HumanHome() {
  const [language, setLanguage] = useState<HumanLanguage>("zh");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [technicalOpen, setTechnicalOpen] = useState(false);
  const { snapshot, error, reading, refresh } = useReadOnlySnapshot(parseHumanOverview);
  const c = copy[language];
  const study = snapshot?.study;
  const status = study ? studyStatus(study, language) : snapshot ? { title: c.empty, note: c.emptyNote, progress: "" }
    : { title: error ? c.unknown : c.reading, note: "", progress: "" };

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
        <div className={styles.brand}><strong>Nexus</strong><span>{c.forPeople}</span></div>
        <nav className={styles.navigation} aria-label={c.navigation}>
          <a href="/research">{c.technical}</a><a href="/archive/city">{c.archive}</a>
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
      <p className={styles.intro} data-testid="human-intro">{c.intro}</p>
      {snapshot?.story && !error && <a className={styles.storyJump} data-testid="human-story-jump" href="#human-story-heading">{c.seeExample}</a>}
      <section className={styles.status} data-testid="human-status" aria-labelledby="human-status-heading">
        <p className={styles.eyebrow}>{error && snapshot ? language === "zh" ? "上次读到的状态" : "Last recorded state" : c.now}</p>
        <h1 id="human-status-heading">{status.title}</h1>
        {study && <p className={styles.progress} data-testid="human-progress">{status.progress}</p>}
        {status.note && <p>{status.note}</p>}
        {study && study.pendingQuestions > 0 && <p>{language === "zh"
          ? `还有 ${count(study.pendingQuestions, language)} 个待办。待办不代表还会运行。`
          : `${count(study.pendingQuestions, language)} questions remain. Pending work does not mean it will run.`}</p>}
        <div className={styles.freshness} data-testid="human-freshness">
          {study && <p>{c.lastExperiment}：{study.lastActivityAt
            ? <time dateTime={study.lastActivityAt} data-testid="human-last-experiment">{humanTime(study.lastActivityAt, language)}</time> : c.noneExperiment}</p>}
          {snapshot && <p>{error ? c.previousRead : c.readAt}：<time dateTime={snapshot.readAt} data-testid="human-read-time">{humanTime(snapshot.readAt, language)}</time></p>}
        </div>
        {error && <div className={styles.alert} role="alert" data-testid="human-error">
          {snapshot && <p>{c.stale}</p>}
          <p>{error === "unauthorized" ? c.unauthorized : error === "invalid" ? c.invalid : c.unavailable}</p>
        </div>}
        <div className={styles.refreshRow}>
          <button type="button" className={styles.refresh} disabled={reading} aria-label={c.refresh} onClick={() => void refresh()}>{reading ? c.refreshing : c.refresh}</button>
          <span className={styles.muted}>{c.readOnly}</span>
        </div>
      </section>

      <HumanStory snapshot={snapshot} language={language} />

      <section className={styles.section} aria-labelledby="human-use-heading">
        <h2 id="human-use-heading">{c.useTitle}</h2><p>{c.useNote}</p><p>{c.useLimit}</p>
      </section>

      <section className={styles.section} data-testid="human-roles" aria-labelledby="human-roles-heading">
        <h2 id="human-roles-heading">{c.rolesTitle}</h2>
        <dl className={styles.roles}>
          <div><dt>{c.cityRole}</dt><dd>{c.cityNote} <a href="/archive/city">{c.archive}</a></dd></div>
          <div><dt>{c.assistantRole}</dt><dd>{c.assistantNote}</dd></div>
          <div><dt>{c.executorRole}</dt><dd>{c.executorNote}</dd></div>
        </dl>
      </section>

      <section className={styles.section} data-testid="human-usage" aria-labelledby="human-usage-heading">
        <h2 id="human-usage-heading">{c.usageTitle}</h2>
        {study ? <dl className={styles.usage}>
          <div><dt>{c.localCalls}</dt><dd data-testid="human-measurements">{count(study.measurements, language)} {language === "zh" ? "次" : "calls"}</dd></div>
          <div><dt>{c.modelCalls}</dt><dd data-testid="human-model-calls">{count(study.modelCalls, language)} {language === "zh" ? "次" : "calls"}</dd></div>
          <div><dt>{c.modelCost}</dt><dd data-testid="human-model-cost">{language === "zh" ? `${String(study.modelCostUsd)} 美元` : `USD ${String(study.modelCostUsd)}`}</dd></div>
        </dl> : <p>{c.usageUnknown}</p>}
        <p className={styles.usageNote}>{c.localNote}</p><p className={styles.muted}>{c.costNote}</p><p className={styles.muted}>{c.resources}</p>
      </section>

      <section className={styles.section} aria-label={c.more}>
        <details className={styles.details} data-testid="human-technical" onToggle={(event) => setTechnicalOpen(event.currentTarget.open)}>
          <summary>{c.more}</summary>
          {technicalOpen && <div className={styles.detailBody}>
            <p>{c.moreNote}</p><p>{c.sourceNote}</p><p>{c.refreshHelp}</p>
            {snapshot && <>
              {snapshot.source.releaseEvidence === "local-unbound" && <p>{c.unbound}</p>}
              <h2>{c.statusDetails}</h2>
              <pre className={styles.exact}>{JSON.stringify({ source: snapshot.source, study: snapshot.study, storyAvailability: snapshot.storyAvailability }, null, 2)}</pre>
            </>}
            <nav className={styles.evidenceLinks} aria-label={c.technical}>
              <a href="/research">{c.technical}</a><a href="/api/research/v1/human">{c.rawData}</a><a href="/api/research/v1/overview">{c.rawEvidence}</a>
            </nav>
          </div>}
        </details>
      </section>
      <p className={styles.footer}>{c.footer}</p>
    </main>
  </div>;
}
