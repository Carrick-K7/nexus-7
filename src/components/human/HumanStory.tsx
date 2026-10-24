"use client";

import { useRef, useState, type RefObject } from "react";
import type { HumanHypothesis, HumanOverview, HumanStory as Story } from "@/research/human-contracts";
import { copy } from "./copy";
import { count, measuredPair, type HumanLanguage } from "./format";
import { briefRule, conceptualRule, conditionText, originalIdea } from "./rules";
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
  const ids = (hypothesis: HumanHypothesis) => ({
    id: hypothesis.id,
    creationEpisodeId: hypothesis.evidence.creationEpisodeId,
    programDigest: hypothesis.evidence.programDigest,
    trainingDigest: hypothesis.evidence.trainingDigest,
    trainingObservationCount: hypothesis.evidence.trainingObservationIds.length,
  });
  return <details ref={detailsRef} className={styles.details} data-testid="human-story-details" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>{c.exact}</summary>
    {open && <div className={styles.detailBody}>
      <p>{c.exactNote}</p>
      <div><h3>{c.inputs}</h3><pre className={styles.exact} data-testid="human-exact-input">{JSON.stringify(story.counterexample.input, null, 2)}</pre></div>
      <div><h3>{c.exactResults}</h3><dl className={styles.usage}>
        <div><dt>{c.firstSum}</dt><dd data-testid="human-exact-original">{String(story.counterexample.original)}</dd></div>
        <div><dt>{c.secondSum}</dt><dd data-testid="human-exact-reordered">{String(story.counterexample.reordered)}</dd></div>
      </dl></div>
      {([['initial', c.originalRule], ['revised', c.revisedRule]] as const).map(([key, label]) => <div key={key}>
        <h3>{label}</h3><p>{conditionText(story[key].rule.condition, language)}</p>
        <p>{story[key].rule.expectedEqual ? c.samePrediction : c.differentPrediction} {c.conditionScope}</p>
        <pre className={styles.exact}>{JSON.stringify(story[key].rule, null, 2)}</pre>
      </div>)}
      <div><h3>{c.evaluations}</h3>
        {story.revised.evaluations.length ? story.revised.evaluations.map((evaluation) => <p key={evaluation.phase}>
          {evaluation.phase === "audit" ? c.audit : c.feedback}：{language === "zh"
            ? `${count(evaluation.calls, language)} 次计算，其中 ${count(evaluation.inScope, language)} 次符合条件，${count(evaluation.outOfScope, language)} 次在条件外。`
            : `${count(evaluation.calls, language)} computations: ${count(evaluation.inScope, language)} met the conditions and ${count(evaluation.outOfScope, language)} were outside them. `}
          {evaluation.status === "refuted" ? c.refuted : evaluation.status === "survived-budget" ? c.survived : c.inconclusive}
        </p>) : <p>{c.evaluationNone}</p>}
      </div>
      <div><h3>{c.storyEvidence}</h3><pre className={styles.exact}>{JSON.stringify({
        subject: story.subject, counterexampleObservationId: story.counterexample.observationId,
        initial: ids(story.initial), revised: ids(story.revised),
      }, null, 2)}</pre></div>
      <nav className={styles.evidenceLinks} aria-label={c.sourceEvidence}>
        <a href="/api/research/v1/human">{c.rawData}</a>
        <a href="/api/research/v1/overview">{c.rawEvidence}</a>
      </nav>
    </div>}
  </details>;
}

export default function HumanStory({ snapshot, language }: { snapshot: HumanOverview | null; language: HumanLanguage }) {
  const c = copy[language];
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const story = snapshot?.story;
  if (!story) return <section className={styles.section} data-testid="human-story" aria-labelledby="human-story-heading">
    <h2 id="human-story-heading" tabIndex={-1}>{c.story}</h2>
    <p>{c.missingStory}</p>
    <p className={styles.muted}>{!snapshot ? c.unknownNote : snapshot.storyAvailability.reason === "no-study" ? c.noStudyStory
      : snapshot.storyAvailability.status === "pending" ? c.awaitingStory : c.unreliableStory}</p>
  </section>;

  const [first, second] = measuredPair(story.counterexample.original, story.counterexample.reordered, language);
  const compactNumbers = !Number.isFinite(Number(first)) || !Number.isFinite(Number(second));
  const initial = originalIdea(story.initial.rule, language);
  const revision = briefRule(story.revised.rule, language) ?? conceptualRule(story.revised.rule, language);
  return <section className={styles.section} data-testid="human-story" aria-labelledby="human-story-heading">
    <div className={styles.storyHeading}><p>{c.story}</p><h2 id="human-story-heading" tabIndex={-1}>{c.storyTopic}</h2><p>{c.storyIntro}</p></div>
    <ol className={styles.steps}>
      <li className={styles.step}><span className={styles.stepNumber} aria-hidden="true">1</span>
        <h3>{c.try}</h3><p>{c.tryNote}</p>
        <p className={styles.muted}>{language === "zh" ? `这次用了 ${story.counterexample.input.length} 个数，完整数字可以在下方展开。`
          : `This attempt used ${story.counterexample.input.length} numbers. Expand below to see them in full.`}</p>
      </li>
      <li className={styles.step}><span className={styles.stepNumber} aria-hidden="true">2</span>
        <h3>{c.originalIdea}</h3><p data-testid="human-original-idea">{initial ?? c.initialNote}</p>
      </li>
      <li className={styles.step}><span className={styles.stepNumber} aria-hidden="true">3</span>
        <h3>{c.found}</h3>
        <div className={styles.comparison}>
          <dl className={styles.calculation}><dt>{c.firstSum}</dt><dd data-testid="human-result-original">{first}</dd></dl>
          <dl className={styles.calculation}><dt>{c.secondSum}</dt><dd data-testid="human-result-reordered">{second}</dd></dl>
        </div>
        {compactNumbers && <div data-testid="human-compact-numbers">
          <p>{c.compactNumbers}</p>
          <button type="button" className={styles.refresh} onClick={() => {
            if (detailsRef.current) {
              detailsRef.current.open = true;
              detailsRef.current.querySelector("summary")?.focus();
            }
          }}>{c.fullValues}</button>
        </div>}
        <p>{c.counterNote}</p><p className={styles.muted}>{c.finiteNote}</p>
      </li>
      <li className={styles.step}><span className={styles.stepNumber} aria-hidden="true">4</span>
        <h3>{c.revisedIdea}</h3><p>{c.revisedNote}</p>
        <p data-testid="human-revised-idea">{revision ?? c.unexplainedRule}</p>
        <p className={styles.muted}>{c.revisionBoundary}</p>
      </li>
      <li className={styles.step}><span className={styles.stepNumber} aria-hidden="true">5</span>
        <h3>{c.conclusion}</h3><div className={styles.verdict} data-testid="human-story-conclusion"><p>{conclusion(story.revised, language)}</p><p>{c.retained}</p></div>
      </li>
    </ol>
    <StoryDetails story={story} language={language} detailsRef={detailsRef} />
  </section>;
}
