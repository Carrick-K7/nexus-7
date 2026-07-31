import { getExperimentService } from "@/experiments/server";
import {
  getOperationalIntelligenceService,
} from "@/operations/intelligence-server";
import { ReleasePolicyService } from "./policy-service";

let service: ReleasePolicyService | undefined;

export async function getReleasePolicyService(): Promise<ReleasePolicyService> {
  if (!service) {
    const [experiments, operationalIntelligence] = await Promise.all([
      getExperimentService(),
      getOperationalIntelligenceService(),
    ]);
    service = new ReleasePolicyService(experiments.repository, {
      operationalIntelligence,
    });
  }
  return service;
}
