import {
  getExperimentService,
} from "@/experiments/server";
import {
  OperationalIntelligenceService,
} from "./intelligence-service";

interface OperationalIntelligenceGlobal {
  service?: OperationalIntelligenceService;
  initializing?: Promise<OperationalIntelligenceService>;
}

const operationalGlobal = globalThis as typeof globalThis & {
  __nexusOperationalIntelligence?: OperationalIntelligenceGlobal;
};

export async function getOperationalIntelligenceService(): Promise<OperationalIntelligenceService> {
  const state =
    operationalGlobal.__nexusOperationalIntelligence ??
    (operationalGlobal.__nexusOperationalIntelligence = {});
  if (state.service) {
    return state.service;
  }
  if (!state.initializing) {
    state.initializing = getExperimentService().then((experiments) => {
      const configuredRetention = Number(
        process.env.NEXUS_SLO_RAW_RETENTION_DAYS,
      );
      const service = new OperationalIntelligenceService(
        experiments.repository,
        {
          rawRetentionDays: Number.isFinite(configuredRetention)
            ? configuredRetention
            : undefined,
        },
      );
      state.service = service;
      return service;
    });
  }
  return state.initializing;
}
