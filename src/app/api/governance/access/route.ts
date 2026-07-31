import { NextResponse } from "next/server";
import {
  ExperimentValidationError,
} from "@/experiments";
import {
  actorFromRequest,
  experimentErrorResponse,
  readJsonObject,
} from "@/experiments/http";
import type {
  ExperimentPermission,
  ExperimentRole,
  WorkloadIdentityKind,
} from "@/experiments";
import {
  getGovernanceService,
} from "@/governance/server";
import type {
  DelegatedAdministrationDuty,
  ServiceAccountStatus,
  WorkspaceMembershipStatus,
} from "@/governance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES: ExperimentRole[] = ["viewer", "operator", "admin"];
const MEMBERSHIP_STATUSES: WorkspaceMembershipStatus[] = [
  "active",
  "suspended",
];
const SERVICE_ACCOUNT_STATUSES: ServiceAccountStatus[] = [
  "active",
  "suspended",
  "revoked",
];
const WORKLOAD_KINDS: Array<
  Exclude<WorkloadIdentityKind, "development">
> = ["ci", "worker", "deployment-controller"];
const DELEGATED_DUTIES: DelegatedAdministrationDuty[] = [
  "identity-manager",
  "access-reviewer",
  "operations-admin",
];
const BREAK_GLASS_PERMISSIONS: ExperimentPermission[] = [
  "memberships:manage",
  "service-accounts:manage",
  "policy:manage",
  "alerts:manage",
  "incidents:manage",
  "notifications:manage",
  "deployment:control",
];

function requiredString(
  body: Record<string, unknown>,
  field: string,
): string {
  const value = body[field];
  if (typeof value !== "string" || !value.trim()) {
    throw new ExperimentValidationError(`${field} is required`);
  }
  return value;
}

function requiredRole(body: Record<string, unknown>): ExperimentRole {
  if (
    typeof body.role !== "string" ||
    !ROLES.includes(body.role as ExperimentRole)
  ) {
    throw new ExperimentValidationError("role is invalid");
  }
  return body.role as ExperimentRole;
}

function requiredRevision(
  body: Record<string, unknown>,
): number {
  const revision = Number(body.expectedRevision);
  if (!Number.isInteger(revision) || revision < 1) {
    throw new ExperimentValidationError(
      "expectedRevision must be a positive integer",
    );
  }
  return revision;
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await actorFromRequest(request);
    return NextResponse.json(
      await (await getGovernanceService()).overview(actor),
    );
  } catch (error) {
    return experimentErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await readJsonObject(request);
    const actor = await actorFromRequest(request);
    const service = await getGovernanceService();
    if (body.action === "upsert-membership") {
      const status =
        typeof body.status === "string" &&
        MEMBERSHIP_STATUSES.includes(
          body.status as WorkspaceMembershipStatus,
        )
          ? (body.status as WorkspaceMembershipStatus)
          : undefined;
      return NextResponse.json(
        await service.upsertMembership(
          {
            issuer: requiredString(body, "issuer"),
            subject: requiredString(body, "subject"),
            role: requiredRole(body),
            status,
          },
          actor,
        ),
      );
    }
    if (body.action === "create-service-account") {
      if (
        typeof body.workloadKind !== "string" ||
        !WORKLOAD_KINDS.includes(
          body.workloadKind as Exclude<
            WorkloadIdentityKind,
            "development"
          >,
        )
      ) {
        throw new ExperimentValidationError("workloadKind is invalid");
      }
      return NextResponse.json(
        await service.createServiceAccount(
          {
            name: requiredString(body, "name"),
            issuer: requiredString(body, "issuer"),
            subject: requiredString(body, "subject"),
            role: requiredRole(body),
            workloadKind:
              body.workloadKind as Exclude<
                WorkloadIdentityKind,
                "development"
              >,
            expiresAt:
              typeof body.expiresAt === "string"
                ? body.expiresAt
                : undefined,
          },
          actor,
        ),
        { status: 201 },
      );
    }
    if (body.action === "rotate-service-account") {
      return NextResponse.json(
        await service.rotateServiceAccount(
          requiredString(body, "accountId"),
          requiredRevision(body),
          actor,
        ),
      );
    }
    if (body.action === "set-service-account-status") {
      if (
        typeof body.status !== "string" ||
        !SERVICE_ACCOUNT_STATUSES.includes(
          body.status as ServiceAccountStatus,
        )
      ) {
        throw new ExperimentValidationError(
          "service account status is invalid",
        );
      }
      return NextResponse.json(
        await service.setServiceAccountStatus(
          requiredString(body, "accountId"),
          body.status as ServiceAccountStatus,
          requiredRevision(body),
          actor,
        ),
      );
    }
    if (body.action === "create-delegation") {
      if (
        typeof body.duty !== "string" ||
        !DELEGATED_DUTIES.includes(
          body.duty as DelegatedAdministrationDuty,
        )
      ) {
        throw new ExperimentValidationError("duty is invalid");
      }
      return NextResponse.json(
        await service.createDelegation(
          {
            issuer: requiredString(body, "issuer"),
            subject: requiredString(body, "subject"),
            duty: body.duty as DelegatedAdministrationDuty,
            expiresAt:
              typeof body.expiresAt === "string"
                ? body.expiresAt
                : undefined,
          },
          actor,
        ),
        { status: 201 },
      );
    }
    if (body.action === "revoke-delegation") {
      return NextResponse.json(
        await service.revokeDelegation(
          requiredString(body, "grantId"),
          requiredRevision(body),
          actor,
        ),
      );
    }
    if (body.action === "create-access-review") {
      return NextResponse.json(
        await service.createAccessReviewCampaign(
          {
            name: requiredString(body, "name"),
            dueAt: requiredString(body, "dueAt"),
          },
          actor,
        ),
        { status: 201 },
      );
    }
    if (body.action === "review-access-item") {
      if (
        body.decision !== "retain" &&
        body.decision !== "revoke"
      ) {
        throw new ExperimentValidationError(
          "decision must be retain or revoke",
        );
      }
      return NextResponse.json(
        await service.reviewAccessItem(
          requiredString(body, "itemId"),
          requiredRevision(body),
          {
            decision: body.decision,
            justification: requiredString(body, "justification"),
          },
          actor,
        ),
      );
    }
    if (body.action === "request-break-glass") {
      if (
        !Array.isArray(body.permissionGrants) ||
        body.permissionGrants.some(
          (permission) =>
            typeof permission !== "string" ||
            !BREAK_GLASS_PERMISSIONS.includes(
              permission as ExperimentPermission,
            ),
        )
      ) {
        throw new ExperimentValidationError(
          "permissionGrants contains an unsupported permission",
        );
      }
      return NextResponse.json(
        await service.requestBreakGlass(
          {
            purpose: requiredString(body, "purpose"),
            permissionGrants:
              body.permissionGrants as ExperimentPermission[],
            ttlMinutes: Number(body.ttlMinutes),
          },
          actor,
        ),
        { status: 201 },
      );
    }
    if (body.action === "approve-break-glass") {
      return NextResponse.json(
        await service.approveBreakGlass(
          requiredString(body, "requestId"),
          requiredRevision(body),
          actor,
        ),
      );
    }
    if (body.action === "revoke-break-glass") {
      return NextResponse.json(
        await service.revokeBreakGlass(
          requiredString(body, "requestId"),
          requiredRevision(body),
          actor,
        ),
      );
    }
    if (body.action === "review-break-glass") {
      if (
        body.outcome !== "appropriate" &&
        body.outcome !== "policy-violation"
      ) {
        throw new ExperimentValidationError(
          "outcome must be appropriate or policy-violation",
        );
      }
      return NextResponse.json(
        await service.reviewBreakGlass(
          requiredString(body, "requestId"),
          requiredRevision(body),
          body.outcome,
          requiredString(body, "note"),
          actor,
        ),
      );
    }
    if (body.action === "enforce-access-governance") {
      return NextResponse.json(
        await service.enforceAccessGovernance(actor),
      );
    }
    throw new ExperimentValidationError("Unknown governance action");
  } catch (error) {
    return experimentErrorResponse(error);
  }
}
