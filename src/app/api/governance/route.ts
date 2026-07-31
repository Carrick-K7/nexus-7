import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  actorFromRequest,
  experimentErrorResponse,
} from "@/experiments/http";
import {
  actorPermissions,
  actorPrincipalType,
  actorWorkspaceId,
} from "@/experiments";
import {
  EXTERNAL_PROMOTION_GATES,
} from "@/evidence";
import {
  getEvidenceRegistryService,
} from "@/governance/evidence-server";
import {
  getReleasePolicyService,
} from "@/governance/policy-server";
import {
  getGovernanceService,
} from "@/governance/server";
import ciEvidenceData from "../../../../public/data/ci-evidence.json";
import modelRegressionData from "../../../../public/data/model-regression.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readOptionalArtifact<T>(
  fileName: string,
): Promise<T | null> {
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

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await actorFromRequest(request);
    const [
      recoveryDrill,
      deploymentDrill,
      evidenceRegistry,
      releasePolicies,
      access,
    ] =
      await Promise.all([
        readOptionalArtifact<{
          completedAt: string;
          observedRecoveryPointMs: number;
          observedRecoveryTimeMs: number;
          passed: boolean;
        }>("recovery-drill.json"),
        readOptionalArtifact<{
          completedAt: string;
          adapterId: string;
          observedRollbackTimeMs: number;
          passed: boolean;
        }>("deployment-rollback-drill.json"),
        (await getEvidenceRegistryService()).overview(actor),
        (await getReleasePolicyService()).list(actor),
        (await getGovernanceService()).overview(actor),
      ]);

    return NextResponse.json({
      identity: {
        actorId: actor.id,
        role: actor.role,
        organizationId: actor.organizationId,
        workspaceId: actorWorkspaceId(actor),
        serviceAccountId: actor.serviceAccountId,
        workloadKind: actor.workloadKind,
        principalType: actorPrincipalType(actor),
        authSource: actor.authSource ?? "unknown",
        permissions: actorPermissions(actor),
      },
      releasePolicy: {
        requiredExternalGates: [...EXTERNAL_PROMOTION_GATES],
        humanApprovalRequired: true,
        serviceAccountsMayApprove: false,
        maximumReceiptLifetimeDays: 7,
      },
      ciEvidence: ciEvidenceData,
      modelRegression: modelRegressionData,
      operations: {
        recoveryDrill,
        deploymentDrill,
        schedule: "weekly",
        retentionDays: 90,
      },
      evidenceRegistry,
      releasePolicies: {
        active:
          releasePolicies.find((policy) => policy.status === "active") ??
          null,
        history: releasePolicies,
      },
      access: {
        organization: access.organization,
        memberships: {
          total: access.memberships.length,
          active: access.memberships.filter(
            (membership) => membership.status === "active",
          ).length,
          suspended: access.memberships.filter(
            (membership) => membership.status === "suspended",
          ).length,
        },
        serviceAccounts: {
          total: access.serviceAccounts.length,
          active: access.serviceAccounts.filter(
            (account) => account.status === "active",
          ).length,
          suspended: access.serviceAccounts.filter(
            (account) => account.status === "suspended",
          ).length,
          revoked: access.serviceAccounts.filter(
            (account) => account.status === "revoked",
          ).length,
          workloads: Object.fromEntries(
            ["ci", "worker", "deployment-controller"].map((kind) => [
              kind,
              access.serviceAccounts.filter(
                (account) => account.workloadKind === kind,
              ).length,
            ]),
          ),
        },
        recentAudit: access.audit.slice(0, 10),
      },
      deployment: {
        adapter:
          process.env.NEXUS_DEPLOYMENT_ADAPTER === "http"
            ? "http"
            : "memory-development",
        externalConfigured: Boolean(
          process.env.NEXUS_DEPLOYMENT_BASE_URL &&
            process.env.NEXUS_DEPLOYMENT_TOKEN,
        ),
      },
    });
  } catch (error) {
    return experimentErrorResponse(error);
  }
}
