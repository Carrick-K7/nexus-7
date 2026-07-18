import {
  getExperimentService,
} from "@/experiments/server";
import {
  getCityModelService,
} from "@/city/model-server";
import {
  getDiagnosisService,
} from "@/diagnosis/server";
import {
  PlanningService,
} from "./service";

interface PlanningGlobal {
  service?: PlanningService;
  initializing?: Promise<PlanningService>;
}

const planningGlobal = globalThis as typeof globalThis & {
  __nexusPlanning?: PlanningGlobal;
};

export async function getPlanningService(): Promise<PlanningService> {
  const state =
    planningGlobal.__nexusPlanning ??
    (planningGlobal.__nexusPlanning = {});
  if (state.service) {
    return state.service;
  }
  if (!state.initializing) {
    state.initializing = Promise.all([
      getExperimentService(),
      getCityModelService(),
      getDiagnosisService(),
    ]).then(([experiments, city, diagnosis]) => {
      const service = new PlanningService(
        experiments.repository,
        city,
        diagnosis,
      );
      state.service = service;
      return service;
    });
  }
  return state.initializing;
}
