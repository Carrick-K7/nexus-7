import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { ExperimentPermissionError } from "@/experiments/errors";
import type {
  ExperimentPrincipalType,
  ExperimentRole,
} from "@/experiments/types";
import type {
  AuthenticatedIdentity,
  ProxyAuthenticationConfig,
} from "./types";

const ROLES: ExperimentRole[] = ["viewer", "operator", "admin"];
const SIGNATURE_VERSION = "v1";

interface ProxyIdentityHeaders {
  subject: string;
  role: ExperimentRole;
  workspaceId: string;
  principalType: ExperimentPrincipalType;
  timestamp: string;
}

function canonicalIdentity(
  request: Request,
  headers: ProxyIdentityHeaders,
): string {
  return [
    SIGNATURE_VERSION,
    request.method.toUpperCase(),
    new URL(request.url).pathname,
    headers.subject,
    headers.role,
    headers.workspaceId,
    headers.principalType,
    headers.timestamp,
  ].join("\n");
}

function signatureFor(
  request: Request,
  headers: ProxyIdentityHeaders,
  secret: string,
): string {
  return createHmac("sha256", secret)
    .update(canonicalIdentity(request, headers), "utf8")
    .digest("hex");
}

function requireHeader(request: Request, name: string): string {
  const value = request.headers.get(name)?.trim();
  if (!value) {
    throw new ExperimentPermissionError(
      `Trusted proxy authentication requires ${name}`,
    );
  }
  return value;
}

export function signProxyIdentity(
  request: Request,
  identity: {
    subject: string;
    role: ExperimentRole;
    workspaceId: string;
    principalType?: ExperimentPrincipalType;
    timestamp?: number;
  },
  secret: string,
): Record<string, string> {
  const headers: ProxyIdentityHeaders = {
    subject: identity.subject,
    role: identity.role,
    workspaceId: identity.workspaceId,
    principalType: identity.principalType ?? "human",
    timestamp: String(identity.timestamp ?? Date.now()),
  };
  return {
    "x-nexus-auth-subject": headers.subject,
    "x-nexus-auth-role": headers.role,
    "x-nexus-auth-workspace": headers.workspaceId,
    "x-nexus-auth-principal-type": headers.principalType,
    "x-nexus-auth-timestamp": headers.timestamp,
    "x-nexus-auth-signature": `${SIGNATURE_VERSION}=${signatureFor(
      request,
      headers,
      secret,
    )}`,
  };
}

export function verifyProxyIdentity(
  request: Request,
  config: ProxyAuthenticationConfig,
  now = Date.now(),
): AuthenticatedIdentity {
  const subject = requireHeader(request, "x-nexus-auth-subject").slice(0, 120);
  const roleValue = requireHeader(request, "x-nexus-auth-role");
  const timestamp = requireHeader(request, "x-nexus-auth-timestamp");
  const workspaceId = requireHeader(
    request,
    "x-nexus-auth-workspace",
  ).slice(0, 120);
  const principalTypeValue = requireHeader(
    request,
    "x-nexus-auth-principal-type",
  );
  const signature = requireHeader(request, "x-nexus-auth-signature");
  if (!ROLES.includes(roleValue as ExperimentRole)) {
    throw new ExperimentPermissionError(
      "Trusted proxy supplied an invalid role",
    );
  }
  const role = roleValue as ExperimentRole;
  if (
    principalTypeValue !== "human" &&
    principalTypeValue !== "service-account"
  ) {
    throw new ExperimentPermissionError(
      "Trusted proxy supplied an invalid principal type",
    );
  }
  const principalType = principalTypeValue as ExperimentPrincipalType;
  const timestampMs = Number(timestamp);
  if (
    !Number.isSafeInteger(timestampMs) ||
    Math.abs(now - timestampMs) > config.maxClockSkewSeconds * 1_000
  ) {
    throw new ExperimentPermissionError(
      "Trusted proxy identity timestamp is expired or invalid",
    );
  }
  const expected = `${SIGNATURE_VERSION}=${signatureFor(
    request,
    { subject, role, workspaceId, principalType, timestamp },
    config.secret,
  )}`;
  const actualBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    throw new ExperimentPermissionError(
      "Trusted proxy identity signature is invalid",
    );
  }
  return {
    subject,
    role,
    source: "proxy",
    issuer: config.issuer,
    workspaceId,
    principalType,
  };
}
