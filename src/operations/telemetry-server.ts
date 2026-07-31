import fs from "node:fs/promises";
import path from "node:path";
import type {
  ExperimentActor,
} from "@/experiments/types";
import {
  actorWorkspaceId,
} from "@/experiments/authorization";
import {
  getExperimentService,
} from "@/experiments/server";
import {
  getEvidenceRegistryService,
} from "@/governance/evidence-server";
import {
  getGovernanceService,
} from "@/governance/server";
import {
  getReleasePolicyService,
} from "@/governance/policy-server";
import modelRegressionData from "../../public/data/model-regression.json";
import {
  getOperationalIntelligenceService,
} from "./intelligence-server";
import {
  OperationalTelemetryCollector,
  type DeploymentOperationalEvidence,
  type ModelOperationalEvidence,
  type OperationalCollectionResult,
  type RecoveryOperationalEvidence,
} from "./telemetry-collector";

async function readOptionalArtifact<T>(fileName: string): Promise<T | null> {
  try {
    return JSON.parse(
      await fs.readFile(
        path.join(process.cwd(), ".artifacts", fileName),
        "utf8",
      ),
    ) as T;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }
    throw error;
  }
}

export async function collectCurrentOperationalTelemetry(
  actor: ExperimentActor,
): Promise<OperationalCollectionResult> {
  const governance = await getGovernanceService();
  const accessEnforcement =
    await governance.enforceAccessGovernance({
      id: "system:operational-access-enforcement",
      role: "admin",
      workspaceId: actorWorkspaceId(actor),
      principalType: "system",
      authSource: "system",
      issuer: "nexus-operational-intelligence",
    });
  const [
    experiments,
    evidence,
    releasePolicies,
    recovery,
    deployment,
    operations,
  ] = await Promise.all([
    getExperimentService(),
    (await getEvidenceRegistryService()).overview(actor),
    (await getReleasePolicyService()).list(actor),
    readOptionalArtifact<RecoveryOperationalEvidence>(
      "recovery-drill.json",
    ),
    readOptionalArtifact<DeploymentOperationalEvidence>(
      "deployment-rollback-drill.json",
    ),
    getOperationalIntelligenceService(),
  ]);
  const workerLease = await experiments.repository.getWorkerLease(
    "experiment-clock",
  );
  const collector = new OperationalTelemetryCollector(operations);
  const result = await collector.collect(
    {
      model: modelRegressionData as ModelOperationalEvidence,
      recovery,
      deployment,
      evidence,
      releasePolicies,
      workerLease,
    },
    actor,
  );
  return {
    ...result,
    accessGovernance: {
      expiredDelegations:
        accessEnforcement.expiredDelegations.length,
      expiredBreakGlass:
        accessEnforcement.expiredBreakGlass.length,
      autoRevokedItems:
        accessEnforcement.autoRevokedItems.length,
    },
  };
}
