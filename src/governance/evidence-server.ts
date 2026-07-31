import { getExperimentService } from "@/experiments/server";
import {
  getOperationalIntelligenceService,
} from "@/operations/intelligence-server";
import { EvidenceRegistryService } from "./evidence-service";

interface EvidenceRegistryGlobal {
  service?: EvidenceRegistryService;
}

const evidenceGlobal = globalThis as typeof globalThis & {
  __nexusEvidenceRegistry?: EvidenceRegistryGlobal;
};

export async function getEvidenceRegistryService(): Promise<EvidenceRegistryService> {
  const state =
    evidenceGlobal.__nexusEvidenceRegistry ??
    (evidenceGlobal.__nexusEvidenceRegistry = {});
  if (!state.service) {
    const [experiments, operationalIntelligence] = await Promise.all([
      getExperimentService(),
      getOperationalIntelligenceService(),
    ]);
    state.service = new EvidenceRegistryService(experiments.repository, {
      operationalIntelligence,
    });
  }
  return state.service;
}
