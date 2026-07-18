import {
  getExperimentService,
} from "@/experiments/server";
import {
  CityModelService,
} from "./model-service";

interface CityModelGlobal {
  service?: CityModelService;
  initializing?: Promise<CityModelService>;
}

const cityModelGlobal = globalThis as typeof globalThis & {
  __nexusCityModel?: CityModelGlobal;
};

export async function getCityModelService(): Promise<CityModelService> {
  const state =
    cityModelGlobal.__nexusCityModel ??
    (cityModelGlobal.__nexusCityModel = {});
  if (state.service) {
    return state.service;
  }
  if (!state.initializing) {
    state.initializing = getExperimentService().then(async (experiments) => {
      const service = new CityModelService(experiments.repository);
      await service.initialize();
      state.service = service;
      return service;
    });
  }
  return state.initializing;
}
