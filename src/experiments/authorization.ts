import { ExperimentPermissionError } from "./errors";
import type {
  ExperimentActor,
  ExperimentPermission,
} from "./types";

export const DEFAULT_WORKSPACE_ID = "workspace-neo-angeles";

const ROLE_PERMISSIONS: Record<
  ExperimentActor["role"],
  ReadonlySet<ExperimentPermission>
> = {
  viewer: new Set([
    "workspace:read",
    "governance:read",
    "operations:read",
    "participation:read",
    "participation:contribute",
    "closure:read",
  ]),
  operator: new Set([
    "workspace:read",
    "governance:read",
    "operations:read",
    "operations:write",
    "incidents:manage",
    "runs:write",
    "iterations:propose",
    "evidence:attach",
    "evidence:ingest",
    "models:propose",
    "participation:read",
    "participation:contribute",
    "participation:moderate",
    "closure:read",
    "closure:operate",
  ]),
  admin: new Set([
    "workspace:read",
    "workspace:admin",
    "governance:read",
    "memberships:manage",
    "service-accounts:manage",
    "policy:manage",
    "operations:read",
    "operations:write",
    "alerts:manage",
    "incidents:manage",
    "notifications:manage",
    "access-reviews:manage",
    "break-glass:manage",
    "runs:write",
    "iterations:propose",
    "iterations:approve",
    "evidence:attach",
    "evidence:ingest",
    "models:propose",
    "deployment:control",
    "participation:read",
    "participation:contribute",
    "participation:moderate",
    "participation:approve",
    "closure:read",
    "closure:operate",
    "closure:control",
  ]),
};

const SERVICE_ACCOUNT_DENY = new Set<ExperimentPermission>([
  "iterations:approve",
  "workspace:admin",
  "memberships:manage",
  "service-accounts:manage",
  "policy:manage",
  "alerts:manage",
  "incidents:manage",
  "notifications:manage",
  "access-reviews:manage",
  "break-glass:manage",
  "participation:approve",
  "closure:control",
]);

const PUBLIC_OBSERVER_PERMISSIONS = new Set<ExperimentPermission>([
  "workspace:read",
  "governance:read",
  "operations:read",
  "participation:read",
  "closure:read",
]);

export function actorWorkspaceId(actor?: ExperimentActor): string {
  return actor?.workspaceId?.trim().slice(0, 120) || DEFAULT_WORKSPACE_ID;
}

export function actorPrincipalType(
  actor: ExperimentActor,
): NonNullable<ExperimentActor["principalType"]> {
  return actor.principalType ?? "human";
}

export function actorPermissions(
  actor: ExperimentActor,
): ExperimentPermission[] {
  const principalType = actorPrincipalType(actor);
  if (actor.authSource === "public-observer") {
    return [...ROLE_PERMISSIONS.viewer].filter((permission) =>
      PUBLIC_OBSERVER_PERMISSIONS.has(permission),
    );
  }
  const rolePermissions = [...ROLE_PERMISSIONS[actor.role]].filter(
    (permission) =>
      principalType !== "service-account" ||
      !SERVICE_ACCOUNT_DENY.has(permission),
  );
  if (
    principalType === "service-account" &&
    actor.permissionGrants
  ) {
    const grants = new Set(actor.permissionGrants);
    return rolePermissions.filter((permission) => grants.has(permission));
  }
  if (principalType === "human" && actor.delegatedPermissions) {
    return [
      ...new Set([
        ...rolePermissions,
        ...actor.delegatedPermissions,
      ]),
    ];
  }
  return rolePermissions;
}

export function assertActorPermission(
  actor: ExperimentActor,
  permission: ExperimentPermission,
): void {
  if (!actorPermissions(actor).includes(permission)) {
    throw new ExperimentPermissionError(
      `${actorPrincipalType(actor)} ${actor.role} cannot perform ${permission}`,
    );
  }
}

export function assertWorkspaceAccess(
  actor: ExperimentActor,
  workspaceId: string,
): void {
  assertActorPermission(actor, "workspace:read");
  if (actorPrincipalType(actor) === "system") {
    return;
  }
  if (actorWorkspaceId(actor) !== workspaceId) {
    throw new ExperimentPermissionError(
      `Identity is scoped to ${actorWorkspaceId(actor)}, not ${workspaceId}`,
    );
  }
}
