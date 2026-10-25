"use client";

import { useRef, useState, type RefObject } from "react";
import type { HumanHypothesis, HumanOverview, HumanStory as Story } from "@/research/human-contracts";
import { copy } from "./copy";
import { count, measuredPair, type HumanLanguage } from "./format";
import { compactRule } from "./rules";
import styles from "./HumanHome.module.css";

function conclusion(hypothesis: HumanHypothesis, language: HumanLanguage) {
  const c = copy[language];
  // Preserve negative history even if a later finite test found no counterexample.
  if (hypothesis.status === "refuted" || hypothesis.evaluations.some((item) => item.status === "refuted")) return c.refuted;
  if (hypothesis.status === "survived-budget") return c.survived;
  if (hypothesis.status === "inconclusive") return c.inconclusive;
  return c.pending;
}

function StoryDetails({ story, language, detailsRef }: { story: Story; language: HumanLanguage; detailsRef: RefObject<HTMLDetailsElement | null> }) {
  const c = copy[language];
  const [open, setOpen] = useState(false);
  return <details ref={detailsRef} className={styles.details} data-testid="human-story-details" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>{c.exact}</summary>
    {open && <div className={styles.detailBody}>
      <div><h3>{c.inputs}</h3><pre className={styles.exact} data-testid="human-exact-input">{JSON.stringify(story.counterexample.input, null, 2)}</pre></div>
      <div><h3>{c.exactResults}</h3><dl className={styles.metadata}>
        <div><dt>{c.firstSum}</dt><dd data-testid="human-exact-original">{String(story.counterexample.original)}</dd></div>
        <div><dt>{c.secondSum}</dt><dd data-testid="human-exact-reordered">{String(story.counterexample.reordered)}</dd></div>
      </dl></div>
      {([['initial', c.originalIdea], ['revised', c.revisedIdea]] as const).map(([key, label]) => <section key={key} aria-label={`${label} · ${c.evaluations}`}>
        <h3>{label}</h3>
        {story[key].evaluations.length ? story[key].evaluations.map((evaluation) => <div className={styles.evaluation} key={evaluation.phase}>
          <div className={styles.evaluationTitle}>
            <h4>{evaluation.phase === "audit" ? c.audit : c.feedback}</h4>
            <span>{evaluation.status === "refuted" ? c.refuted : evaluation.status === "survived-budget" ? c.survived : c.inconclusive}</span>
          </div>
          <dl className={styles.evaluationNumbers}>
            <div><dt>{c.calls}</dt><dd>{count(evaluation.calls, language)}</dd></div>
            <div><dt>{c.inScope}</dt><dd>{count(evaluation.inScope, language)}</dd></div>
            <div><dt>{c.outOfScope}</dt><dd>{count(evaluation.outOfScope, language)}</dd></div>
            <div><dt>{c.allowance}</dt><dd>{count(evaluation.allowance, language)}</dd></div>
          </dl>
        </div>) : <p>{c.evaluationNone}</p>}
      </section>)}
      <div><h3>{c.storyEvidence}</h3><pre className={styles.exact}>{JSON.stringify(story, null, 2)}</pre></div>
      <nav className={styles.evidenceLinks} aria-label={c.sourceEvidence}>
        <a href="/api/research/v1/human">{c.rawData}</a><a href="/api/research/v1/overview">{c.rawEvidence}</a>
      </nav>
    </div>}
  </details>;
}

export default function HumanStory({ snapshot, language }: { snapshot: HumanOverview | null; language: HumanLanguage }) {
  const c = copy[language];
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const story = snapshot?.story;
  if (!story) return <section className={styles.resultCard} data-testid="human-story" aria-labelledby="human-story-heading">
    <h2 id="human-story-heading">{c.missingStory}</h2>
    <p className={styles.muted}>{!snapshot ? c.unreadStory : snapshot.storyAvailability.reason === "no-study" ? c.noStudyStory
      : snapshot.storyAvailability.status === "pending" ? c.awaitingStory : c.unreliableStory}</p>
  </section>;

  const [first, second] = measuredPair(story.counterexample.original, story.counterexample.reordered, language);
  const compactNumbers = !Number.isFinite(Number(first)) || !Number.isFinite(Number(second));
  return <section className={styles.resultCard} data-testid="human-story" aria-labelledby="human-story-heading">
    <div className={styles.resultHeading}><h2 id="human-story-heading">{c.storyTopic}</h2><span className={styles.muted}>{c.counterexample} · {c.differentResults}</span></div>
    <div className={styles.comparison}>
      <dl className={styles.calculation}><dt>{c.firstSum}</dt><dd data-testid="human-result-original">{first}</dd></dl>
      <dl className={styles.calculation}><dt>{c.secondSum}</dt><dd data-testid="human-result-reordered">{second}</dd></dl>
    </div>
    {compactNumbers && <div className={styles.compactNumbers} data-testid="human-compact-numbers">
      <button type="button" className={styles.refresh} onClick={() => {
        if (detailsRef.current) {
          detailsRef.current.open = true;
          detailsRef.current.querySelector("summary")?.focus();
        }
      }}>{c.fullValues}</button>
    </div>}
    <div className={styles.hypotheses}>
      {([['initial', c.originalIdea, 'human-original-idea'], ['revised', c.revisedIdea, 'human-revised-idea']] as const).map(([key, label, testId]) => <section key={key} className={styles.hypothesis} aria-label={label}>
        <div className={styles.hypothesisHeading}><h3>{label}</h3><span className={styles.badge} data-tone={story[key].status === "refuted" ? "negative" : "neutral"} data-testid={key === "revised" ? "human-story-conclusion" : "human-original-conclusion"}>{conclusion(story[key], language)}</span></div>
        <p data-testid={testId}>{compactRule(story[key].rule, language)}</p>
      </section>)}
    </div>
    <StoryDetails story={story} language={language} detailsRef={detailsRef} />
  </section>;
}
