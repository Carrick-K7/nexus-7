import {
  InMemoryExperimentRepository,
} from "./memory-repository";
import {
  PostgresExperimentRepository,
} from "./postgres-repository";
import { ExperimentService } from "./service";

interface ExperimentGlobal {
  service?: ExperimentService;
  initializing?: Promise<ExperimentService>;
}

const experimentGlobal = globalThis as typeof globalThis & {
  __nexusExperiments?: ExperimentGlobal;
};

function createService(): ExperimentService {
  const databaseUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  const repository = databaseUrl
    ? new PostgresExperimentRepository(databaseUrl)
    : new InMemoryExperimentRepository();
  return new ExperimentService(repository);
}

export async function getExperimentService(): Promise<ExperimentService> {
  const state =
    experimentGlobal.__nexusExperiments ??
    (experimentGlobal.__nexusExperiments = {});

  if (state.service) {
    return state.service;
  }
  if (!state.initializing) {
    const service = createService();
    state.initializing = service.initialize().then(() => {
      state.service = service;
      return service;
    });
  }
  return state.initializing;
}
