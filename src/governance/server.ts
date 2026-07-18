import { getExperimentService } from "@/experiments/server";
import { GovernanceService } from "./service";

interface GovernanceGlobal {
  service?: GovernanceService;
  initializing?: Promise<GovernanceService>;
}

const governanceGlobal = globalThis as typeof globalThis & {
  __nexusGovernance?: GovernanceGlobal;
};

export async function getGovernanceService(): Promise<GovernanceService> {
  const state =
    governanceGlobal.__nexusGovernance ??
    (governanceGlobal.__nexusGovernance = {});
  if (state.service) {
    return state.service;
  }
  if (!state.initializing) {
    state.initializing = getExperimentService().then(async (experiments) => {
      const service = new GovernanceService(experiments.repository);
      await service.initialize();
      state.service = service;
      return service;
    });
  }
  return state.initializing;
}
