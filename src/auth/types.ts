import type {
  ExperimentPrincipalType,
  ExperimentRole,
} from "@/experiments/types";

export type AuthenticationMode = "oidc" | "proxy" | "development";

export interface AuthenticatedIdentity {
  subject: string;
  role: ExperimentRole;
  source: AuthenticationMode | "system";
  issuer?: string;
  workspaceId: string;
  principalType: ExperimentPrincipalType;
}

export interface OidcAuthenticationConfig {
  issuer: string;
  audience: string;
  jwksUrl: string;
  roleClaim: string;
  roleMap: Record<string, ExperimentRole>;
  workspaceClaim: string;
  principalTypeClaim: string;
  staticWorkspaceId?: string;
  staticPrincipalType?: ExperimentPrincipalType;
  requiredClaims?: Record<string, string | string[]>;
}

export interface ProxyAuthenticationConfig {
  secret: string;
  issuer: string;
  maxClockSkewSeconds: number;
}
