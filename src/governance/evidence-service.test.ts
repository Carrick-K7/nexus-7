// @vitest-environment node

import {
  generateKeyPairSync,
} from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  ExperimentPermissionError,
  ExperimentService,
  InMemoryExperimentRepository,
} from "@/experiments";
import type {
  ExperimentActor,
} from "@/experiments";
import {
  createRemoteEvidenceReceipt,
} from "@/evidence";
import type {
  RemoteEvidenceReceiptPayload,
} from "@/evidence";
import {
  GovernanceService,
} from "./service";
import {
  EvidenceRegistryService,
} from "./evidence-service";

describe("remote governance evidence registry", () => {
  const now = new Date("2026-07-16T14:00:00.000Z");
  const repositoryName = "Carrick-K7/nexus-7";
  const signerWorkflow =
    "Carrick-K7/nexus-7/.github/workflows/operations-drills.yml";
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  let registry: EvidenceRegistryService;
  let repository: InMemoryExperimentRepository;
  let actor: ExperimentActor;
  let sequence: number;

  function payload(
    overrides: Partial<RemoteEvidenceReceiptPayload> = {},
  ): RemoteEvidenceReceiptPayload {
    return {
      schemaVersion: 1,
      provider: "github-actions-sigstore",
      kind: "recovery-drill",
      repository: repositoryName,
      sourceCommitSha: "a".repeat(40),
      signerWorkflow,
      runId: "operations-42",
      subjectPath: "recovery-drill.json",
      subjectSha256: "b".repeat(64),
      passed: true,
      generatedAt: "2026-07-16T12:00:00.000Z",
      verifiedAt: "2026-07-16T13:00:00.000Z",
      expiresAt: "2026-07-23T13:00:00.000Z",
      summary: {
        observedRecoveryPointMs: 42,
        observedRecoveryTimeMs: 500,
      },
      ...overrides,
    };
  }

  beforeEach(async () => {
    repository = new InMemoryExperimentRepository();
    sequence = 0;
    const experiments = new ExperimentService(repository, {
      now: () => now,
      id: () => `experiment-${++sequence}`,
    });
    await experiments.initialize();
    const governance = new GovernanceService(repository, {
      now: () => now,
      id: () => `governance-${++sequence}`,
    });
    await governance.initialize();
    registry = new EvidenceRegistryService(repository, {
      now: () => now,
      id: () => `registry-${++sequence}`,
      publicKey,
      repository: repositoryName,
      signerWorkflows: [signerWorkflow],
    });
    actor = {
      id: "operations-evidence-ingestor",
      role: "operator",
      workspaceId: "workspace-neo-angeles",
      principalType: "service-account",
      workloadKind: "ci",
      permissionGrants: [
        "workspace:read",
        "governance:read",
        "evidence:ingest",
      ],
    };
  });

  it("stores signed remote evidence idempotently and reports freshness alerts", async () => {
    const receipt = createRemoteEvidenceReceipt(payload(), privateKey);
    const first = await registry.ingest(receipt, actor);
    const duplicate = await registry.ingest(receipt, actor);
    const overview = await registry.overview(actor);

    expect(duplicate.id).toBe(first.id);
    expect(overview.records).toHaveLength(1);
    expect(
      overview.freshness.find(
        (entry) => entry.kind === "recovery-drill",
      ),
    ).toMatchObject({
      status: "current",
      recordId: first.id,
    });
    expect(
      overview.alerts.map((entry) => entry.kind),
    ).toEqual(
      expect.arrayContaining([
        "ci-evidence",
        "model-regression-live",
        "deployment-drill",
      ]),
    );
  });

  it("accepts the dedicated symbiosis workflows in the default trust set", async () => {
    const defaultRegistry = new EvidenceRegistryService(repository, {
      now: () => now,
      id: () => `default-registry-${++sequence}`,
      publicKey,
      repository: repositoryName,
    });
    const workflows = [
      "symbiosis-replication.yml",
      "symbiosis-offhost-recovery.yml",
    ];

    for (const [index, workflow] of workflows.entries()) {
      const kind = index === 0
        ? "symbiosis-replication"
        : "symbiosis-off-host-recovery";
      await expect(
        defaultRegistry.ingest(
          createRemoteEvidenceReceipt(
            payload({
              kind,
              signerWorkflow:
                `${repositoryName}/.github/workflows/${workflow}`,
              runId: `symbiosis-${index}`,
            }),
            privateKey,
          ),
          actor,
        ),
      ).resolves.toMatchObject({ kind });
    }
  });

  it("marks old-but-still-signed drill evidence stale", async () => {
    const receipt = createRemoteEvidenceReceipt(
      payload({
        generatedAt: "2026-07-07T12:00:00.000Z",
      }),
      privateKey,
    );
    await registry.ingest(receipt, actor);

    expect(
      (await registry.overview(actor)).freshness.find(
        (entry) => entry.kind === "recovery-drill",
      ),
    ).toMatchObject({
      status: "stale",
    });
  });

  it("rejects tampering, untrusted workflows, and callers without ingestion permission", async () => {
    const receipt = createRemoteEvidenceReceipt(payload(), privateKey);
    receipt.payload.runId = "tampered";
    await expect(registry.ingest(receipt, actor)).rejects.toBeInstanceOf(
      ExperimentPermissionError,
    );

    const untrusted = createRemoteEvidenceReceipt(
      payload({ signerWorkflow: "attacker/workflow.yml" }),
      privateKey,
    );
    await expect(registry.ingest(untrusted, actor)).rejects.toThrow(
      "not trusted",
    );

    await expect(
      registry.ingest(
        createRemoteEvidenceReceipt(payload(), privateKey),
        {
          id: "read-only",
          role: "viewer",
          workspaceId: "workspace-neo-angeles",
        },
      ),
    ).rejects.toBeInstanceOf(ExperimentPermissionError);
  });
});
