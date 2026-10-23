import { getExperimentService } from "@/experiments/server";
import { RESEARCH_SUBJECTS } from "./catalog";
import { createResearchRunner } from "./engine";
import { ResearchService } from "./service";
import { persistentResearchRequired } from "./runtime";

const state = globalThis as typeof globalThis & {
  __nexusResearchService?: Promise<ResearchService>;
};

/** Construction does not start an episode or grant a research budget. */
export function getResearchService(): Promise<ResearchService> {
  if (!state.__nexusResearchService) {
    if (persistentResearchRequired() && !process.env.DATABASE_URL) {
      return Promise.reject(new Error("Production research requires persistent storage"));
    }
    state.__nexusResearchService = getExperimentService().then((experiments) => {
      if (persistentResearchRequired() && experiments.repository.backend !== "postgres") throw new Error("Production research requires persistent storage");
      return new ResearchService(experiments.repository, [...RESEARCH_SUBJECTS], createResearchRunner(RESEARCH_SUBJECTS), { autoInduction: true });
    }).catch((error: unknown) => {
      state.__nexusResearchService = undefined;
      throw error;
    });
  }
  return state.__nexusResearchService;
}
