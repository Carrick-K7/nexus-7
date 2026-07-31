import {
  getExperimentService,
} from "@/experiments/server";
import {
  getCityModelService,
} from "@/city/model-server";
import {
  DiagnosisService,
} from "./service";

interface DiagnosisGlobal {
  service?: DiagnosisService;
  initializing?: Promise<DiagnosisService>;
}

const diagnosisGlobal = globalThis as typeof globalThis & {
  __nexusDiagnosis?: DiagnosisGlobal;
};

export async function getDiagnosisService(): Promise<DiagnosisService> {
  const state =
    diagnosisGlobal.__nexusDiagnosis ??
    (diagnosisGlobal.__nexusDiagnosis = {});
  if (state.service) {
    return state.service;
  }
  if (!state.initializing) {
    state.initializing = Promise.all([
      getExperimentService(),
      getCityModelService(),
    ]).then(async ([experiments, city]) => {
      const service = new DiagnosisService(
        experiments.repository,
        city,
      );
      await service.initialize();
      state.service = service;
      return service;
    });
  }
  return state.initializing;
}
