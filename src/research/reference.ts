import { InMemoryExperimentRepository } from "@/experiments/memory-repository";
import { ExperimentService } from "@/experiments/service";
import { GovernanceService } from "@/governance/service";
import type { ExperimentActor } from "@/experiments/types";
import { RESEARCH_SUBJECTS } from "./catalog";
import type { ResearchStation } from "./contracts";
import { createResearchRunner } from "./engine";
import { ResearchService } from "./service";

/** Explicit reference fixture; this actor is never an authentication path or a live approval. */
export async function runReferenceResearch(options: { steps?: number; seed?: string } = {}): Promise<{
  station: ResearchStation;
  service: ResearchService;
  actor: ExperimentActor;
}> {
  const steps = options.steps ?? 10;
  if (!Number.isSafeInteger(steps) || steps < 1 || steps > 40) throw new Error("Reference observation window must be 1–40 steps");
  const repository = new InMemoryExperimentRepository();
  await new ExperimentService(repository).initialize();
  await new GovernanceService(repository).initialize();
  let sequence = 0;
  let clock = Date.parse("2026-10-20T00:00:00.000Z");
  const service = new ResearchService(repository, [...RESEARCH_SUBJECTS], createResearchRunner(RESEARCH_SUBJECTS), {
    now: () => new Date(clock), id: () => `reference-${++sequence}`, autoInduction: true,
  });
  const actor: ExperimentActor = {
    id: "research-reference-authorizer", role: "admin", principalType: "human",
    authSource: "development", workspaceId: "workspace-neo-angeles",
  };
  await service.start(actor, { seed: options.seed ?? "research-reference-2026-10", subjectIds: RESEARCH_SUBJECTS.map((subject) => subject.id) });
  for (let step = 0; step < steps; step++) {
    clock += 1_000;
    const station = await service.step({ ...actor, id: "reference-worker", role: "operator", principalType: "system", authSource: "system" }, "reference-worker");
    if (station?.status !== "running") break;
  }
  const station = await service.get(actor);
  if (!station) throw new Error("Reference station was not persisted");
  return { station, service, actor };
}
