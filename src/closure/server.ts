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
  getPlanningService,
} from "@/planning/server";
import {
  getOutcomeLearningService,
} from "@/outcomes/server";
import {
  getDeploymentAdapterFromEnvironment,
} from "@/deployment/server";
import {
  InMemoryDeploymentAdapter,
} from "@/deployment/memory-adapter";
import {
  ClosedLoopService,
} from "./service";
import {
  resolveClosedLoopReleaseArtifact,
} from "./release";

interface ClosedLoopGlobal {
  service?: ClosedLoopService;
  initializing?: Promise<ClosedLoopService>;
  syntheticDeployment?: InMemoryDeploymentAdapter;
}

const closedLoopGlobal = globalThis as typeof globalThis & {
  __nexusClosedLoop?: ClosedLoopGlobal;
};

export async function getClosedLoopService(): Promise<ClosedLoopService> {
  const state =
    closedLoopGlobal.__nexusClosedLoop ??
    (closedLoopGlobal.__nexusClosedLoop = {});
  if (state.service) {
    return state.service;
  }
  if (!state.initializing) {
    state.initializing = Promise.all([
      getExperimentService(),
      getCityModelService(),
      getDiagnosisService(),
      getPlanningService(),
      getOutcomeLearningService(),
      resolveClosedLoopReleaseArtifact(),
    ]).then(
      ([
        experiments,
        city,
        diagnosis,
        planning,
        outcomes,
        releaseArtifact,
      ]) => {
        const deployment =
          process.env.NEXUS_DEPLOYMENT_ADAPTER
            ? getDeploymentAdapterFromEnvironment()
            : (
                state.syntheticDeployment ??=
                  new InMemoryDeploymentAdapter()
              );
        const service = new ClosedLoopService(
          experiments.repository,
          city,
          diagnosis,
          planning,
          outcomes,
          deployment,
          { releaseArtifact },
        );
        state.service = service;
        return service;
      },
    );
  }
  return state.initializing;
}
