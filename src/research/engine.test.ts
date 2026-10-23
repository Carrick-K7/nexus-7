// @vitest-environment node
import { describe, expect, it } from "vitest";
import { RESEARCH_SUBJECTS } from "./catalog";
import { createResearchRunner, nextResearchQuestion } from "./engine";
import { researchDigest } from "./integrity";
import { runReferenceResearch } from "./reference";
import { verifyResearchStation } from "./verification";
import type { Observation, OracleMeter, ResearchStation, ResearchSubject } from "./contracts";

function referenceMeter(subject: ResearchSubject, holds: boolean): OracleMeter {
  let used = 0;
  return {
    get used() { return used; }, limit: 96,
    async observe(target, input, partition) {
      if (target.id !== subject.id) throw new Error("Unexpected fixture instrument");
      used++;
      return { id: `fixture-observation-${used}`, subjectId: target.id, subjectVersion: target.version,
        input, inputDigest: researchDigest(input), partition, measurement: { holds, code: "explicit-test-feedback", facts: { holds } } };
    },
  };
}

describe("evidence-driven research episodes", () => {
  it("changes its follow-up when evidence changes, not when the round title changes", async () => {
    const { station } = await runReferenceResearch({ steps: 1 });
    const current = station.questions.find((question) => question.kind === "survey")!;
    const subject = RESEARCH_SUBJECTS.find((candidate) => candidate.id === current.subjectId)!;
    const before: ResearchStation = { ...station, episodes: [], lessons: [], tools: [], questions: station.questions.filter((question) => question.kind === "survey").map((question) => ({ ...question, status: question.id === current.id ? "answered" : "pending" })) };
    const runner = createResearchRunner(RESEARCH_SUBJECTS);
    const contradicted = await runner(before, current, "matched-fork", referenceMeter(subject, false));
    const unrefuted = await runner(before, { ...current, id: "renamed-question", title: { en: "Different title", zh: "不同标题" } }, "matched-fork", referenceMeter(subject, true));
    expect(contradicted.verdict).toBe("counterexample");
    expect(unrefuted.verdict).toBe("no-change");
    expect(contradicted.questions).toHaveLength(1);
    expect(unrefuted.questions).toHaveLength(0);
    expect(nextResearchQuestion({ ...before, questions: [...before.questions, ...contradicted.questions] })?.kind).toBe("replicate");
    expect(nextResearchQuestion({ ...before, questions: [...before.questions, ...unrefuted.questions] })?.kind).toBe("survey");
    const renamed = await runner(before, { ...current, id: "another-id" }, "matched-fork", referenceMeter(subject, false));
    expect(renamed.questions).toEqual(contradicted.questions);
  });

  it.each([[7, 2], [2, 7]])("separates exact witness %s from fresh-sample generalization %s", async (originalInput, freshInput) => {
    let generated = originalInput;
    const subject: ResearchSubject = {
      id: "conditional", version: "v1", family: "tiny", origin: "generated-challenge", interpretation: "declared-contract",
      title: { en: "Conditional", zh: "条件反例" }, claim: { en: "A test claim", zh: "测试声明" },
      generate: () => generated,
      valid: (input) => typeof input === "number" && Number.isInteger(input) && input >= 0 && input <= 10,
      measure: async (input) => ({ holds: input !== 7, code: "isolated-failure", facts: { input } }),
    };
    // Minimal pure-runner fixture, not a persisted study or a claim about live evidence.
    const station = { seed: "conditional-case", subjectIds: [subject.id], subjectVersions: { [subject.id]: subject.version },
      questions: [], episodes: [], lessons: [], tools: [] } as unknown as ResearchStation;
    const survey = { id: "survey", kind: "survey", subjectId: subject.id } as ResearchStation["questions"][number];
    const runner = createResearchRunner([subject]);
    // Explicit fake historical feedback lets the second case exercise an unreproducible witness.
    const discovery = await runner(station, survey, "first", referenceMeter(subject, false));
    const current = discovery.questions[0];
    station.questions = [current];
    station.episodes = [{ id: "first", observations: discovery.observations }] as ResearchStation["episodes"];
    station.lessons = discovery.lessons;
    generated = freshInput;
    let used = 0;
    const meter: OracleMeter = { get used() { return used; }, limit: 8,
      async observe(target, input, partition) { used++; return { id: `real-${used}`, subjectId: target.id, subjectVersion: target.version,
        input, inputDigest: researchDigest(input), partition, measurement: await target.measure(input) }; } };
    const result = await runner(station, current, "confirmation", meter);
    if (originalInput === 7) {
      expect(result.verdict).toBe("confirmed");
      expect(result.lessons.some((lesson) => lesson.kind === "refutation")).toBe(false);
      expect(result.lessons.some((lesson) => lesson.kind === "limit")).toBe(true);
      expect(result.questions[0].kind).toBe("minimize");
      expect(result.questions[0].observationId).toBe(result.observations[0].id);
    } else {
      expect(result.verdict).toBe("not-reproduced");
      expect(result.lessons.some((lesson) => lesson.kind === "counterexample" && lesson.status === "provisional")).toBe(true);
      expect(result.questions[0].kind).toBe("replicate");
      expect(result.questions[0].id).not.toBe(current.id);
      expect(result.questions[0].observationId).toBe(result.observations[1].id);
    }
  });

  it("does not let arbitrary queue hashes select different semantic actions", async () => {
    const { station } = await runReferenceResearch({ steps: 1 });
    const before = nextResearchQuestion(station)!;
    const renamed = structuredClone(station);
    renamed.questions = renamed.questions.reverse().map((question, index) => ({ ...question, id: `arbitrary-${100 - index}`, title: { en: "Renamed", zh: "改名" } }));
    const after = nextResearchQuestion(renamed)!;
    expect({ kind: after.kind, subject: after.subjectId }).toEqual({ kind: before.kind, subject: before.subjectId });
  });

  it("runs ten real rounds with synthesized tools, retained negative results and independent replay", async () => {
    const { station, service, actor } = await runReferenceResearch();
    expect(station.episodes).toHaveLength(10);
    expect(station.episodes.every((episode) => episode.calls > 0 && episode.observations.length > 0)).toBe(true);
    const verification = await verifyResearchStation(station, RESEARCH_SUBJECTS);
    expect(verification.gates).toEqual(expect.objectContaining({
      traceIntegrity: true, rawMeasurementsReexecuted: true, quotaConserved: true,
      generatedQuestionsLinked: true, toolArtifactsValid: true,
    }));
    expect(verification.counters.naturalNewDefects).toBe(0);
    expect(verification.limitations.some((item) => item.includes("not demonstrated"))).toBe(true);
    expect(station.tools.every((tool) => tool.program.operators.length <= 3)).toBe(true);
    expect(station.questions.some((question) => question.reasonCode === "structural-search-found-no-valid-edit" && question.status === "pending")).toBe(true);
    // The observation window is not an internal round==10 termination condition.
    expect(station.status).toBe("running");
    const next = await service.step({ ...actor, role: "operator", principalType: "system" }, "next-worker");
    expect(next?.episodes.length).toBe(11);
  }, 120_000);

  it("fails verification for altered raw observations even if an attacker rehashes an episode", async () => {
    const { station } = await runReferenceResearch({ steps: 1 });
    const changed = structuredClone(station);
    const observation: Observation = changed.episodes[0].observations[0];
    observation.measurement.holds = !observation.measurement.holds;
    const { digest: _digest, ...unsigned } = changed.episodes[0];
    void _digest;
    changed.episodes[0].digest = researchDigest(unsigned);
    const result = await verifyResearchStation(changed, RESEARCH_SUBJECTS, { minimumEpisodes: 1 });
    expect(result.gates.traceIntegrity).toBe(true);
    expect(result.gates.rawMeasurementsReexecuted).toBe(false);
    expect(result.passed).toBe(false);
  });
});
