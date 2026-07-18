import { ExperimentPermissionError } from "@/experiments/errors";
import type {
  ExperimentActor,
  ExperimentRole,
} from "@/experiments/types";
import {
  verifyFederatedOidcBearerToken,
} from "./oidc";
import {
  verifyProxyIdentity,
} from "./proxy";
import type {
  AuthenticationMode,
  OidcAuthenticationConfig,
  ProxyAuthenticationConfig,
} from "./types";

const ROLES: ExperimentRole[] = ["viewer", "operator", "admin"];
const DEFAULT_ROLE_MAP: Record<string, ExperimentRole> = {
  viewer: "viewer",
  operator: "operator",
  admin: "admin",
};

function authenticationMode(): AuthenticationMode {
  const configured = process.env.NEXUS_AUTH_MODE;
  if (
    configured === "oidc" ||
    configured === "proxy" ||
    configured === "development"
  ) {
    return configured;
  }
  return process.env.NODE_ENV === "production" ? "oidc" : "development";
}

function parseRoleMap(value: string | undefined): Record<string, ExperimentRole> {
  if (!value) {
    return DEFAULT_ROLE_MAP;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("role map must be an object");
    }
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, ExperimentRole] =>
          typeof entry[1] === "string" &&
          ROLES.includes(entry[1] as ExperimentRole),
      ),
    );
  } catch (error) {
    throw new ExperimentPermissionError(
      `NEXUS_OIDC_ROLE_MAP is invalid: ${
        error instanceof Error ? error.message : "invalid JSON"
      }`,
    );
  }
}

export function oidcConfigFromEnvironment(): OidcAuthenticationConfig {
  const issuer = process.env.NEXUS_OIDC_ISSUER;
  const audience = process.env.NEXUS_OIDC_AUDIENCE;
  const jwksUrl = process.env.NEXUS_OIDC_JWKS_URL;
  if (!issuer || !audience || !jwksUrl) {
    throw new ExperimentPermissionError(
      "OIDC authentication requires NEXUS_OIDC_ISSUER, NEXUS_OIDC_AUDIENCE, and NEXUS_OIDC_JWKS_URL",
    );
  }
  return {
    issuer,
    audience,
    jwksUrl,
    roleClaim: process.env.NEXUS_OIDC_ROLE_CLAIM ?? "roles",
    roleMap: parseRoleMap(process.env.NEXUS_OIDC_ROLE_MAP),
    workspaceClaim:
      process.env.NEXUS_OIDC_WORKSPACE_CLAIM ?? "workspace_id",
    principalTypeClaim:
      process.env.NEXUS_OIDC_PRINCIPAL_TYPE_CLAIM ?? "principal_type",
  };
}

function parseOidcProvider(
  value: unknown,
  index: number,
): OidcAuthenticationConfig {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ExperimentPermissionError(
      `OIDC provider ${index} must be an object`,
    );
  }
  const provider = value as Record<string, unknown>;
  for (const field of ["issuer", "audience", "jwksUrl"] as const) {
    if (typeof provider[field] !== "string" || !provider[field].trim()) {
      throw new ExperimentPermissionError(
        `OIDC provider ${index} requires ${field}`,
      );
    }
  }
  const staticPrincipalType =
    provider.staticPrincipalType === "human" ||
    provider.staticPrincipalType === "service-account"
      ? provider.staticPrincipalType
      : undefined;
  const requiredClaims =
    typeof provider.requiredClaims === "object" &&
    provider.requiredClaims !== null &&
    !Array.isArray(provider.requiredClaims)
      ? Object.fromEntries(
          Object.entries(provider.requiredClaims).filter(
            (entry): entry is [string, string | string[]] =>
              typeof entry[1] === "string" ||
              (Array.isArray(entry[1]) &&
                entry[1].every((item) => typeof item === "string")),
          ),
        )
      : undefined;
  const roleMap =
    typeof provider.roleMap === "object" &&
    provider.roleMap !== null &&
    !Array.isArray(provider.roleMap)
      ? Object.fromEntries(
          Object.entries(provider.roleMap).filter(
            (entry): entry is [string, ExperimentRole] =>
              typeof entry[1] === "string" &&
              ROLES.includes(entry[1] as ExperimentRole),
          ),
        )
      : {};
  return {
    issuer: provider.issuer as string,
    audience: provider.audience as string,
    jwksUrl: provider.jwksUrl as string,
    roleClaim:
      typeof provider.roleClaim === "string"
        ? provider.roleClaim
        : "roles",
    roleMap,
    workspaceClaim:
      typeof provider.workspaceClaim === "string"
        ? provider.workspaceClaim
        : "workspace_id",
    principalTypeClaim:
      typeof provider.principalTypeClaim === "string"
        ? provider.principalTypeClaim
        : "principal_type",
    staticWorkspaceId:
      typeof provider.staticWorkspaceId === "string"
        ? provider.staticWorkspaceId
        : undefined,
    staticPrincipalType,
    requiredClaims,
  };
}

export function oidcConfigsFromEnvironment(): OidcAuthenticationConfig[] {
  const configured = process.env.NEXUS_OIDC_PROVIDERS_JSON;
  if (!configured) {
    return [oidcConfigFromEnvironment()];
  }
  try {
    const providers: unknown = JSON.parse(configured);
    if (!Array.isArray(providers) || providers.length === 0) {
      throw new Error("provider list must be a non-empty array");
    }
    return providers.map(parseOidcProvider);
  } catch (error) {
    if (error instanceof ExperimentPermissionError) {
      throw error;
    }
    throw new ExperimentPermissionError(
      `NEXUS_OIDC_PROVIDERS_JSON is invalid: ${
        error instanceof Error ? error.message : "invalid JSON"
      }`,
    );
  }
}

export function proxyConfigFromEnvironment(): ProxyAuthenticationConfig {
  const secret = process.env.NEXUS_PROXY_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new ExperimentPermissionError(
      "Trusted proxy authentication requires NEXUS_PROXY_AUTH_SECRET with at least 32 characters",
    );
  }
  const configuredSkew = Number(process.env.NEXUS_PROXY_MAX_SKEW_SECONDS);
  return {
    secret,
    issuer: process.env.NEXUS_PROXY_ISSUER ?? "nexus-identity-proxy",
    maxClockSkewSeconds:
      Number.isFinite(configuredSkew) &&
      configuredSkew > 0 &&
      configuredSkew <= 300
        ? configuredSkew
        : 30,
  };
}

function developmentActor(request: Request): ExperimentActor {
  const roleHeader = request.headers.get("x-nexus-role");
  const role = ROLES.includes(roleHeader as ExperimentRole)
    ? (roleHeader as ExperimentRole)
    : "operator";
  return {
    id: request.headers.get("x-nexus-actor")?.slice(0, 80) || "local-operator",
    role,
    authSource: "development",
    workspaceId:
      request.headers.get("x-nexus-workspace")?.slice(0, 120) ||
      "workspace-neo-angeles",
    principalType:
      request.headers.get("x-nexus-principal-type") === "service-account"
        ? "service-account"
        : "human",
  };
}

export async function authenticateRequest(
  request: Request,
): Promise<ExperimentActor> {
  const mode = authenticationMode();
  if (mode === "development") {
    return developmentActor(request);
  }
  if (mode === "proxy") {
    const identity = verifyProxyIdentity(
      request,
      proxyConfigFromEnvironment(),
    );
    return {
      id: identity.subject,
      role: identity.role,
      authSource: identity.source,
      issuer: identity.issuer,
      workspaceId: identity.workspaceId,
      principalType: identity.principalType,
    };
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new ExperimentPermissionError("Bearer authentication is required");
  }
  const identity = await verifyFederatedOidcBearerToken(
    authorization.slice("Bearer ".length),
    oidcConfigsFromEnvironment(),
  );
  return {
    id: identity.subject.slice(0, 120),
    role: identity.role,
    authSource: identity.source,
    issuer: identity.issuer,
    workspaceId: identity.workspaceId,
    principalType: identity.principalType,
  };
}
