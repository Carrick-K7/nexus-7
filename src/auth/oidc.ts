import {
  createRemoteJWKSet,
  decodeJwt,
  jwtVerify,
  type JWTVerifyGetKey,
  type JWTPayload,
} from "jose";
import { ExperimentPermissionError } from "@/experiments/errors";
import type {
  ExperimentPrincipalType,
} from "@/experiments/types";
import type {
  AuthenticatedIdentity,
  OidcAuthenticationConfig,
} from "./types";

const ROLE_RANK = {
  viewer: 1,
  operator: 2,
  admin: 3,
} as const;

function claimAtPath(
  payload: JWTPayload,
  path: string,
): unknown {
  return path.split(".").reduce<unknown>((value, key) => {
    if (typeof value !== "object" || value === null) {
      return undefined;
    }
    return (value as Record<string, unknown>)[key];
  }, payload);
}

function externalRoles(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(/[,\s]+/)
      .map((role) => role.trim())
      .filter(Boolean);
  }
  if (Array.isArray(value)) {
    return value.filter((role): role is string => typeof role === "string");
  }
  return [];
}

function assertRequiredClaims(
  payload: JWTPayload,
  config: OidcAuthenticationConfig,
): void {
  for (const [path, expected] of Object.entries(
    config.requiredClaims ?? {},
  )) {
    const actual = claimAtPath(payload, path);
    const allowed = Array.isArray(expected) ? expected : [expected];
    if (typeof actual !== "string" || !allowed.includes(actual)) {
      throw new ExperimentPermissionError(
        `OIDC token claim ${path} is not allowed`,
      );
    }
  }
}

export function mapOidcRole(
  payload: JWTPayload,
  config: OidcAuthenticationConfig,
): AuthenticatedIdentity["role"] {
  const mapped = externalRoles(claimAtPath(payload, config.roleClaim))
    .map((role) => config.roleMap[role])
    .filter((role): role is AuthenticatedIdentity["role"] => Boolean(role))
    .sort((left, right) => ROLE_RANK[right] - ROLE_RANK[left]);
  return mapped[0] ?? "viewer";
}

export async function verifyOidcBearerToken(
  token: string,
  config: OidcAuthenticationConfig,
  keySet: JWTVerifyGetKey = createRemoteJWKSet(new URL(config.jwksUrl)),
): Promise<AuthenticatedIdentity> {
  try {
    const { payload } = await jwtVerify(token, keySet, {
      issuer: config.issuer,
      audience: config.audience,
      algorithms: ["RS256", "ES256"],
    });
    if (!payload.sub) {
      throw new ExperimentPermissionError(
        "OIDC token does not contain a subject",
      );
    }
    assertRequiredClaims(payload, config);
    const workspaceId =
      config.staticWorkspaceId ??
      claimAtPath(payload, config.workspaceClaim);
    if (typeof workspaceId !== "string" || !workspaceId.trim()) {
      throw new ExperimentPermissionError(
        `OIDC token does not contain ${config.workspaceClaim}`,
      );
    }
    const principalClaim =
      config.staticPrincipalType ??
      claimAtPath(payload, config.principalTypeClaim);
    const principalType: ExperimentPrincipalType =
      principalClaim === "service-account"
        ? "service-account"
        : "human";
    return {
      subject: payload.sub,
      role: mapOidcRole(payload, config),
      source: "oidc",
      issuer: payload.iss,
      workspaceId: workspaceId.trim().slice(0, 120),
      principalType,
    };
  } catch (error) {
    if (error instanceof ExperimentPermissionError) {
      throw error;
    }
    throw new ExperimentPermissionError(
      `OIDC token verification failed: ${
        error instanceof Error ? error.message : "invalid token"
      }`,
    );
  }
}

export async function verifyFederatedOidcBearerToken(
  token: string,
  configs: OidcAuthenticationConfig[],
  keySetForConfig: (
    config: OidcAuthenticationConfig,
  ) => JWTVerifyGetKey = (config) =>
    createRemoteJWKSet(new URL(config.jwksUrl)),
): Promise<AuthenticatedIdentity> {
  let issuer: string | undefined;
  try {
    issuer = decodeJwt(token).iss;
  } catch {
    throw new ExperimentPermissionError(
      "OIDC token could not be decoded for trusted issuer selection",
    );
  }
  const config = configs.find(
    (candidate) => candidate.issuer === issuer,
  );
  if (!config) {
    throw new ExperimentPermissionError(
      "OIDC token issuer is not configured as a trusted provider",
    );
  }
  return verifyOidcBearerToken(token, config, keySetForConfig(config));
}
