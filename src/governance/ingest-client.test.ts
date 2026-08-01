// @vitest-environment node
/**
 * Contract tests for the remote-evidence ingestion client.
 *
 * The client is executed as a script by the remote evidence receipt
 * workflow. These tests run the real client as a subprocess against a
 * reference fake governance server (real HTTP, ephemeral port) and assert
 * the success path, OIDC failure, governance rejection and malformed-receipt
 * failure. Server-side idempotency and receipt verification are covered by
 * evidence-service.test.ts.
 */

import {
  generateKeyPairSync,
} from "node:crypto";
import {
  execFile,
} from "node:child_process";
import {
  createServer,
  type Server,
} from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import {
  describe,
  expect,
  it,
} from "vitest";
import {
  createRemoteEvidenceReceipt,
} from "@/evidence";
import type {
  RemoteEvidenceReceipt,
} from "@/evidence";

const ROOT = path.resolve(__dirname, "..", "..");
const TSX_CLI = path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const CLIENT_SCRIPT = path.join(ROOT, "scripts", "ingest-remote-evidence.ts");

interface GovernanceBehavior {
  oidcStatus?: number;
  oidcBody?: Record<string, unknown>;
  governanceStatus?: number;
  governanceBody?: Record<string, unknown>;
  capturePostBody?: (body: string) => void;
}

async function startReferenceGovernanceServer(
  behavior: GovernanceBehavior,
): Promise<{ server: Server; baseUrl: string; stop: () => Promise<void> }> {
  const server = createServer((request, response) => {
    if (request.url?.includes("/oidc/token")) {
      response.writeHead(behavior.oidcStatus ?? 200, {
        "content-type": "application/json",
      });
      response.end(JSON.stringify(behavior.oidcBody ?? { value: "oidc-token-value" }));
      return;
    }
    if (request.url?.endsWith("/api/governance/evidence")) {
      let body = "";
      request.on("data", (chunk) => {
        body += chunk;
      });
      request.on("end", () => {
        behavior.capturePostBody?.(body);
        response.writeHead(behavior.governanceStatus ?? 201, {
          "content-type": "application/json",
        });
        response.end(
          JSON.stringify(behavior.governanceBody ?? { id: "evidence-1" }),
        );
      });
      return;
    }
    response.writeHead(404);
    response.end("not found");
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("reference server did not bind");
  }
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
    stop: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

async function runClient(
  receiptPath: string,
  baseUrl: string,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const result = await new Promise<{
    code: number | null;
    stdout: string;
    stderr: string;
  }>((resolve) => {
    execFile(
      process.execPath,
      [TSX_CLI, CLIENT_SCRIPT, receiptPath],
      {
        cwd: ROOT,
        env: {
          ...process.env,
          ACTIONS_ID_TOKEN_REQUEST_URL: `${baseUrl}/oidc/token`,
          ACTIONS_ID_TOKEN_REQUEST_TOKEN: "oidc-request-token",
          NEXUS_GOVERNANCE_BASE_URL: baseUrl,
          NEXUS_OIDC_AUDIENCE: "nexus-7",
        },
        timeout: 30_000,
      },
      (error, stdout, stderr) => {
        resolve({
          code: error === null ? 0 : typeof error.code === "number" ? error.code : 1,
          stdout: String(stdout),
          stderr: String(stderr),
        });
      },
    );
  });
  return result;
}

async function writeReceipt(receipt: RemoteEvidenceReceipt): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nexus-ingest-"));
  const file = path.join(dir, "drill-receipt.json");
  await fs.writeFile(file, JSON.stringify(receipt), {
    encoding: "utf8",
    mode: 0o600,
  });
  return file;
}

describe("remote evidence ingestion client", () => {
  const { privateKey } = generateKeyPairSync("ed25519");

  function drillReceipt(): RemoteEvidenceReceipt {
    return createRemoteEvidenceReceipt(
      {
        schemaVersion: 1,
        provider: "github-actions-sigstore",
        kind: "symbiosis-replication",
        repository: "Carrick-K7/nexus-7",
        sourceCommitSha: "a".repeat(40),
        signerWorkflow:
          "Carrick-K7/nexus-7/.github/workflows/symbiosis-replication.yml",
        runId: "drill-run-1",
        subjectPath: "public/data/v4-7-replication-bundle.json",
        subjectSha256: "b".repeat(64),
        passed: true,
        generatedAt: "2026-08-01T10:00:00.000Z",
        verifiedAt: "2026-08-01T11:00:00.000Z",
        expiresAt: "2026-08-08T11:00:00.000Z",
        summary: { runCount: 12 },
      },
      privateKey,
    );
  }

  it("posts a verified receipt with an OIDC bearer token and succeeds", async () => {
    let postedBody: string | null = null;
    const fake = await startReferenceGovernanceServer({
      capturePostBody: (body) => {
        postedBody = body;
      },
    });
    try {
      const receiptPath = await writeReceipt(drillReceipt());
      const result = await runClient(receiptPath, fake.baseUrl);
      expect(result.code).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("remote-evidence.ingested");
      expect(result.stdout).toContain('"recordId":"evidence-1"');
      expect(postedBody).not.toBeNull();
      const request = JSON.parse(postedBody!) as {
        receipt: RemoteEvidenceReceipt;
      };
      expect(request.receipt.payload.runId).toBe("drill-run-1");
      expect(request.receipt.signature).toMatch(/^[A-Za-z0-9_-]+$/);
    } finally {
      await fake.stop();
    }
  });

  it("fails closed when the governance registry rejects the receipt", async () => {
    const fake = await startReferenceGovernanceServer({
      governanceStatus: 403,
      governanceBody: { error: "Evidence repository is not trusted" },
    });
    try {
      const receiptPath = await writeReceipt(drillReceipt());
      const result = await runClient(receiptPath, fake.baseUrl);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain(
        "Evidence repository is not trusted",
      );
    } finally {
      await fake.stop();
    }
  });

  it("fails closed when the OIDC token request fails", async () => {
    const fake = await startReferenceGovernanceServer({
      oidcStatus: 401,
      oidcBody: { message: "denied" },
    });
    try {
      const receiptPath = await writeReceipt(drillReceipt());
      const result = await runClient(receiptPath, fake.baseUrl);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain("denied");
    } finally {
      await fake.stop();
    }
  });

  it("fails closed on a malformed receipt file", async () => {
    const fake = await startReferenceGovernanceServer({});
    try {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nexus-ingest-"));
      const receiptPath = path.join(dir, "bad-receipt.json");
      await fs.writeFile(receiptPath, '{"payload":{}}', {
        encoding: "utf8",
      });
      const result = await runClient(receiptPath, fake.baseUrl);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain("not a valid remote evidence envelope");
    } finally {
      await fake.stop();
    }
  });
});
