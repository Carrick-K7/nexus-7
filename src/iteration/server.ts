import { getExperimentService } from "@/experiments/server";
import {
  getOperationalIntelligenceService,
} from "@/operations/intelligence-server";
import { ControlledIterationService } from "./service";

let service: ControlledIterationService | undefined;

export async function getControlledIterationService(): Promise<ControlledIterationService> {
  if (!service) {
    const [experiments, operationalIntelligence] = await Promise.all([
      getExperimentService(),
      getOperationalIntelligenceService(),
    ]);
    service = new ControlledIterationService(experiments, {
      operationalIntelligence,
    });
  }
  return service;
}
