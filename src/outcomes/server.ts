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
  OutcomeLearningService,
} from "./service";

interface OutcomeLearningGlobal {
  service?: OutcomeLearningService;
  initializing?: Promise<OutcomeLearningService>;
}

const outcomeLearningGlobal = globalThis as typeof globalThis & {
  __nexusOutcomeLearning?: OutcomeLearningGlobal;
};

export async function getOutcomeLearningService(): Promise<OutcomeLearningService> {
  const state =
    outcomeLearningGlobal.__nexusOutcomeLearning ??
    (outcomeLearningGlobal.__nexusOutcomeLearning = {});
  if (state.service) {
    return state.service;
  }
  if (!state.initializing) {
    state.initializing = Promise.all([
      getExperimentService(),
      getCityModelService(),
      getDiagnosisService(),
    ]).then(([experiments, city, diagnosis]) => {
      const service = new OutcomeLearningService(
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
