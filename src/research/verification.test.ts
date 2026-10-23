// @vitest-environment node
import { describe, expect, it } from "vitest";
import { InMemoryExperimentRepository } from "@/experiments/memory-repository";
import { ExperimentService } from "@/experiments/service";
import { GovernanceService } from "@/governance/service";
import type { ExperimentActor } from "@/experiments/types";
import { researchSubject } from "./catalog";
import { REDUCER_SCHEMA, type ResearchStation, type ResearchSubject } from "./contracts";
import { renderReducerSource } from "./reducer";
import { createResearchRunner } from "./engine";
import { researchDigest, researchSize } from "./integrity";
import { ResearchService } from "./service";
import { verifyResearchStation } from "./verification";

// Cheap, explicitly synthetic fixtures; these are not natural project discoveries.
async function fixture(rejectOne = false) {
  const a: ResearchSubject = {
    id: "a-number", version: "test-v1", family: "scalar", origin: "generated-challenge", interpretation: "declared-contract",
    title: { en: "Number", zh: "数值" }, claim: { en: "Synthetic", zh: "合成" }, generate: () => 8,
    valid: (input) => typeof input === "number" && Number.isInteger(input) && input >= 0 && input <= 64,
    measure: async (input) => ({ holds: input === 0, code: "fixture-scalar", facts: { value: input } }),
  };
  const b: ResearchSubject = {
    ...a, id: "b-tree", family: "tree", generate: () => ({ n: 8 }),
    valid: (input) => input !== null && typeof input === "object" && !Array.isArray(input) && Object.keys(input).length === 1 && typeof input.n === "number" && Number.isInteger(input.n) && input.n >= 0 && input.n <= 64,
    measure: async (input) => ({ holds: (input as { n: number }).n === 0, code: "fixture-tree", facts: { value: input } }),
  };
  const subjects = [a, b, researchSubject("integer-sum-control")];
  const repository = new InMemoryExperimentRepository();
  await new ExperimentService(repository).initialize();
  await new GovernanceService(repository).initialize();
  const actor: ExperimentActor = { id: "fixture-authorizer", role: "admin", principalType: "human", workspaceId: "workspace-neo-angeles" };
  const standardRunner = createResearchRunner(subjects);
  const service = new ResearchService(repository, subjects, async (station, question, episodeId, meter) => {
    if (rejectOne && question.kind === "minimize" && question.subjectId === a.id) {
      const program = { schemaVersion: REDUCER_SCHEMA, operators: ["shorten-string" as const], maxPasses: 4 };
      const evaluation = await meter.evaluateReducer!(program, a, 8);
      return { verdict: "tool-rejected", observations: [], lessons: [], questions: [], tool: {
        id: `rejected-${episodeId}`, program, digest: researchDigest(program), source: renderReducerSource(program),
        createdByEpisodeId: episodeId, trainingSubjectId: a.id, status: "rejected", evaluation, reusedOnSubjectIds: [],
      } };
    }
    return standardRunner(station, question, episodeId, meter);
  });
  await service.start(actor, { seed: "tiny-verifier", subjectIds: subjects.map((subject) => subject.id) });
  for (let step = 0; step < 12; step++) await service.step({ ...actor, role: "operator", principalType: "system" }, "fixture-worker");
  return { station: (await service.get(actor))!, subjects };
}

function rehash(station: ResearchStation): void {
  let previous = researchDigest({ schemaVersion: station.schemaVersion, id: station.id, seed: station.seed,
    subjectIds: station.subjectIds, subjectVersions: station.subjectVersions, policy: station.policy });
  for (const episode of station.episodes) {
    episode.previousDigest = previous;
    const { digest: _digest, ...content } = episode;
    void _digest;
    episode.digest = researchDigest(content);
    previous = episode.digest;
  }
}

describe("offline verifier resists internally consistent false reports", () => {
  it("accepts real kernel receipts and original allowances, including cross-family reuse", async () => {
    const { station, subjects } = await fixture();
    const result = await verifyResearchStation(station, subjects, { minimumEpisodes: 3 });
    expect(result.gates).toEqual(expect.objectContaining({ outcomeSemantics: true, toolArtifactsValid: true, crossFamilyToolReuse: true, rawMeasurementsReexecuted: true }));
    expect(result.passed).toBe(true);
  });

  it("rejects an unknown root schema even after recomputing every hash", async () => {
    const { station, subjects } = await fixture();
    (station as { schemaVersion: string }).schemaVersion = "nexus.research-station.v999";
    rehash(station);
    await expect(verifyResearchStation(station, subjects, { minimumEpisodes: 3 })).rejects.toThrow(/envelope/);
  });

  it("rejects a changed retained artifact even when its creation episode was untouched", async () => {
    const { station, subjects } = await fixture();
    const tool = station.tools.find((candidate) => candidate.status === "certified")!;
    tool.evaluation.reduced = 0;
    tool.evaluation.reducedSize = researchSize(0);
    const result = await verifyResearchStation(station, subjects, { minimumEpisodes: 3 });
    expect(result.gates.toolArtifactsValid).toBe(false);
    expect(result.passed).toBe(false);
  });

  it("rejects healthy reported output even if all copies and episode hashes are forged consistently", async () => {
    const { station, subjects } = await fixture();
    const tool = station.tools.find((candidate) => candidate.status === "certified")!;
    const creation = station.episodes.find((episode) => episode.id === tool.createdByEpisodeId)!;
    for (const evaluation of [tool.evaluation, creation.tool!.evaluation, ...creation.evaluations!]) {
      evaluation.reduced = 0;
      evaluation.reducedSize = researchSize(0);
    }
    rehash(station);
    const result = await verifyResearchStation(station, subjects, { minimumEpisodes: 3 });
    expect(result.gates.traceIntegrity).toBe(true);
    expect(result.gates.outcomeSemantics).toBe(false);
    expect(result.gates.toolArtifactsValid).toBe(false);
    expect(result.passed).toBe(false);
  });

  it("cannot promote a real rejected receipt by consistently renaming status and verdict", async () => {
    const { station, subjects } = await fixture(true);
    expect((await verifyResearchStation(station, subjects, { minimumEpisodes: 3 })).passed).toBe(true);
    const rejected = station.tools.find((tool) => tool.status === "rejected")!;
    expect(rejected.evaluation.accepted).toBe(false);
    const creation = station.episodes.find((episode) => episode.id === rejected.createdByEpisodeId)!;
    rejected.status = "certified";
    creation.tool!.status = "certified";
    creation.verdict = "tool-certified";
    rehash(station);
    const result = await verifyResearchStation(station, subjects, { minimumEpisodes: 3 });
    expect(result.gates.traceIntegrity).toBe(true);
    expect(result.gates.outcomeSemantics).toBe(false);
    expect(result.passed).toBe(false);
  });

  it("rejects unknown operations even when the question, episode and hashes agree", async () => {
    const { station, subjects } = await fixture();
    const healthy = station.episodes.find((episode) => episode.kind === "survey" && episode.observations.every((observation) => observation.measurement.holds))!;
    const question = station.questions.find((candidate) => candidate.id === healthy.questionId)!;
    (question as { kind: string }).kind = "unregistered-operation";
    (healthy as { kind: string }).kind = "unregistered-operation";
    healthy.verdict = "counterexample";
    rehash(station);
    const result = await verifyResearchStation(station, subjects, { minimumEpisodes: 3 });
    expect(result.gates.outcomeSemantics).toBe(false);
    expect(result.passed).toBe(false);
  });

  it("does not count healthy observations as discoveries or successful certification as no gain", async () => {
    const { station, subjects } = await fixture();
    const healthy = station.episodes.find((episode) => episode.kind === "survey" && episode.observations.every((observation) => observation.measurement.holds))!;
    expect(healthy).toBeDefined();
    healthy.verdict = "counterexample";
    const creation = station.episodes.find((episode) => episode.tool?.status === "certified")!;
    creation.verdict = "no-change";
    rehash(station);
    const result = await verifyResearchStation(station, subjects, { minimumEpisodes: 3 });
    expect(result.gates.rawMeasurementsReexecuted).toBe(true);
    expect(result.gates.outcomeSemantics).toBe(false);
    expect(result.passed).toBe(false);
  });
});
