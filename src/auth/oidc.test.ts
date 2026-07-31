// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";
import {
  exportJWK,
  generateKeyPair,
  SignJWT,
} from "jose";
import {
  authenticateRequest,
  mapOidcRole,
  oidcConfigsFromEnvironment,
  signProxyIdentity,
  verifyFederatedOidcBearerToken,
  verifyOidcBearerToken,
} from "@/auth";
import {
  actorPermissions,
  ExperimentPermissionError,
} from "@/experiments";

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
});

describe("OIDC authentication", () => {
  it("verifies issuer, audience, signature, subject, and highest mapped role", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const publicJwk = await exportJWK(publicKey);
    const issuer = "https://identity.test/";
    const audience = "nexus-test";
    const token = await new SignJWT({
      roles: ["nexus-viewer", "nexus-admin"],
      workspace_id: "workspace-health",
      principal_type: "human",
    })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setSubject("human-42")
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);

    const identity = await verifyOidcBearerToken(
      token,
      {
        issuer,
        audience,
        jwksUrl: "https://unused.test/jwks",
        roleClaim: "roles",
        roleMap: {
          "nexus-viewer": "viewer",
          "nexus-admin": "admin",
        },
        workspaceClaim: "workspace_id",
        principalTypeClaim: "principal_type",
      },
      async (protectedHeader) => {
        expect(protectedHeader.kid).toBe("test-key");
        return publicKey;
      },
    );

    expect(publicJwk.kty).toBe("RSA");
    expect(identity).toEqual({
      subject: "human-42",
      role: "admin",
      source: "oidc",
      issuer,
      workspaceId: "workspace-health",
      principalType: "human",
    });
  });

  it("defaults an authenticated but unmapped identity to viewer", () => {
    expect(
      mapOidcRole(
        { roles: ["unknown-role"] },
        {
          issuer: "issuer",
          audience: "audience",
          jwksUrl: "https://example.test/jwks",
          roleClaim: "roles",
          roleMap: {},
          workspaceClaim: "workspace_id",
          principalTypeClaim: "principal_type",
        },
      ),
    ).toBe("viewer");
  });

  it("federates a GitHub workload only through an explicitly trusted provider", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const issuer = "https://token.actions.githubusercontent.com";
    const token = await new SignJWT({
      repository: "Carrick-K7/nexus-7",
      job_workflow_ref:
        "Carrick-K7/nexus-7/.github/workflows/ci.yml@refs/heads/main",
    })
      .setProtectedHeader({ alg: "RS256", kid: "github-test" })
      .setSubject("repo:Carrick-K7/nexus-7:ref:refs/heads/main")
      .setIssuer(issuer)
      .setAudience("nexus-7")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
    const config = {
      issuer,
      audience: "nexus-7",
      jwksUrl: "https://token.actions.githubusercontent.com/.well-known/jwks",
      roleClaim: "roles",
      roleMap: {},
      workspaceClaim: "workspace_id",
      principalTypeClaim: "principal_type",
      staticWorkspaceId: "workspace-neo-angeles",
      staticPrincipalType: "service-account" as const,
      requiredClaims: {
        repository: "Carrick-K7/nexus-7",
        job_workflow_ref:
          "Carrick-K7/nexus-7/.github/workflows/ci.yml@refs/heads/main",
      },
    };

    const identity = await verifyFederatedOidcBearerToken(
      token,
      [config],
      () => async () => publicKey,
    );
    expect(identity).toMatchObject({
      subject: "repo:Carrick-K7/nexus-7:ref:refs/heads/main",
      issuer,
      workspaceId: "workspace-neo-angeles",
      principalType: "service-account",
      role: "viewer",
    });

    await expect(
      verifyFederatedOidcBearerToken(
        token,
        [{ ...config, issuer: "https://identity.example" }],
        () => async () => publicKey,
      ),
    ).rejects.toThrow("issuer is not configured");
  });

  it("loads multiple trusted OIDC providers from validated JSON", () => {
    process.env.NEXUS_OIDC_PROVIDERS_JSON = JSON.stringify([
      {
        issuer: "https://token.actions.githubusercontent.com",
        audience: "nexus-7",
        jwksUrl:
          "https://token.actions.githubusercontent.com/.well-known/jwks",
        staticWorkspaceId: "workspace-neo-angeles",
        staticPrincipalType: "service-account",
        requiredClaims: {
          repository: "Carrick-K7/nexus-7",
        },
      },
      {
        issuer: "https://identity.example",
        audience: "nexus-7",
        jwksUrl: "https://identity.example/jwks",
      },
    ]);

    expect(oidcConfigsFromEnvironment()).toHaveLength(2);
    expect(oidcConfigsFromEnvironment()[0]).toMatchObject({
      staticPrincipalType: "service-account",
      requiredClaims: {
        repository: "Carrick-K7/nexus-7",
      },
    });
  });

  it("rejects missing bearer credentials in OIDC mode", async () => {
    process.env.NEXUS_AUTH_MODE = "oidc";
    process.env.NEXUS_OIDC_ISSUER = "https://identity.test/";
    process.env.NEXUS_OIDC_AUDIENCE = "nexus";
    process.env.NEXUS_OIDC_JWKS_URL = "https://identity.test/jwks";

    await expect(
      authenticateRequest(new Request("https://nexus.test/api/experiments")),
    ).rejects.toBeInstanceOf(ExperimentPermissionError);
  });

  it("allows explicit development headers only in development mode", async () => {
    process.env.NEXUS_AUTH_MODE = "development";
    const actor = await authenticateRequest(
      new Request("https://nexus.test/api/experiments", {
        headers: {
          "x-nexus-actor": "browser-test",
          "x-nexus-role": "admin",
        },
      }),
    );

    expect(actor).toEqual({
      id: "browser-test",
      role: "admin",
      authSource: "development",
      workspaceId: "workspace-neo-angeles",
      principalType: "human",
    });
  });

  it("ignores asserted identities in anonymous read-only observer mode", async () => {
    process.env.NEXUS_AUTH_MODE = "public-observer";
    const actor = await authenticateRequest(
      new Request("https://nexus.test/api/world/v3/snapshot", {
        headers: {
          "x-nexus-actor": "attacker",
          "x-nexus-role": "admin",
          authorization: "Bearer untrusted",
        },
      }),
    );

    expect(actor).toEqual({
      id: "public-observer",
      role: "viewer",
      authSource: "public-observer",
      workspaceId: "workspace-neo-angeles",
      principalType: "system",
    });
    expect(actorPermissions(actor)).toEqual([
      "workspace:read",
      "governance:read",
      "operations:read",
      "participation:read",
      "closure:read",
    ]);
  });

  it("accepts only fresh, method-and-path-bound trusted proxy identities", async () => {
    process.env.NEXUS_AUTH_MODE = "proxy";
    process.env.NEXUS_PROXY_AUTH_SECRET =
      "test-proxy-secret-with-at-least-thirty-two-characters";
    process.env.NEXUS_PROXY_ISSUER = "identity-aware-proxy";
    const unsigned = new Request(
      "https://nexus.test/api/experiments/run-1/actions",
      { method: "POST" },
    );
    const signedHeaders = signProxyIdentity(
      unsigned,
      {
        subject: "human-through-proxy",
        role: "admin",
        workspaceId: "workspace-proxy",
      },
      process.env.NEXUS_PROXY_AUTH_SECRET,
    );
    const actor = await authenticateRequest(
      new Request(unsigned.url, {
        method: unsigned.method,
        headers: signedHeaders,
      }),
    );

    expect(actor).toEqual({
      id: "human-through-proxy",
      role: "admin",
      authSource: "proxy",
      issuer: "identity-aware-proxy",
      workspaceId: "workspace-proxy",
      principalType: "human",
    });

    await expect(
      authenticateRequest(
        new Request("https://nexus.test/api/iterations/proposal/actions", {
          method: "POST",
          headers: signedHeaders,
        }),
      ),
    ).rejects.toBeInstanceOf(ExperimentPermissionError);
  });

  it("rejects expired and tampered trusted proxy identities", async () => {
    process.env.NEXUS_AUTH_MODE = "proxy";
    process.env.NEXUS_PROXY_AUTH_SECRET =
      "test-proxy-secret-with-at-least-thirty-two-characters";
    process.env.NEXUS_PROXY_MAX_SKEW_SECONDS = "30";
    const request = new Request("https://nexus.test/api/experiments", {
      method: "POST",
    });
    const expiredHeaders = signProxyIdentity(
      request,
      {
        subject: "expired-human",
        role: "operator",
        workspaceId: "workspace-proxy",
        timestamp: Date.now() - 31_000,
      },
      process.env.NEXUS_PROXY_AUTH_SECRET,
    );

    await expect(
      authenticateRequest(
        new Request(request.url, {
          method: request.method,
          headers: expiredHeaders,
        }),
      ),
    ).rejects.toBeInstanceOf(ExperimentPermissionError);

    const tamperedHeaders = new Headers(
      signProxyIdentity(
        request,
        {
          subject: "real-human",
          role: "operator",
          workspaceId: "workspace-proxy",
        },
        process.env.NEXUS_PROXY_AUTH_SECRET,
      ),
    );
    tamperedHeaders.set("x-nexus-auth-role", "admin");
    await expect(
      authenticateRequest(
        new Request(request.url, {
          method: request.method,
          headers: tamperedHeaders,
        }),
      ),
    ).rejects.toBeInstanceOf(ExperimentPermissionError);
  });
});
