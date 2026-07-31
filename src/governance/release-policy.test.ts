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
  GovernanceService,
} from "./service";
import {
  ReleasePolicyService,
} from "./policy-service";
import {
  createSignedReleasePolicyBundle,
  defaultReleasePolicyPayload,
  verifySignedReleasePolicyBundle,
} from "./release-policy";

describe("signed organization release policies", () => {
  const now = new Date("2026-07-16T14:00:00.000Z");
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  let repository: InMemoryExperimentRepository;
  let service: ReleasePolicyService;
  let sequence: number;
  const admin: ExperimentActor = {
    id: "policy-admin",
    role: "admin",
    workspaceId: "workspace-neo-angeles",
    principalType: "human",
  };

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
    service = new ReleasePolicyService(repository, {
      now: () => now,
      id: () => `policy-${++sequence}`,
      publicKey,
    });
  });

  it("verifies, activates, and supersedes signed policy versions", async () => {
    const firstPayload = defaultReleasePolicyPayload(
      "organization-nexus-7",
      now,
    );
    const first = createSignedReleasePolicyBundle(
      firstPayload,
      privateKey,
    );
    expect(
      verifySignedReleasePolicyBundle(
        first,
        publicKey,
        "organization-nexus-7",
        now,
      ),
    ).toEqual({ valid: true, reasons: [] });
    const activated = await service.activate(first, admin);
    expect(activated.status).toBe("active");

    const second = createSignedReleasePolicyBundle(
      {
        ...firstPayload,
        version: "1.1.0",
        environments: {
          ...firstPayload.environments,
          staging: {
            ...firstPayload.environments.staging,
            trafficStages: [5, 20, 50, 100],
          },
        },
      },
      privateKey,
    );
    await service.activate(second, admin);
    const policies = await service.list(admin);

    expect(policies).toHaveLength(2);
    expect(
      policies.find(
        (record) => record.bundle.payload.version === "1.1.0",
      )?.status,
    ).toBe("active");
    expect(
      policies.find(
        (record) => record.bundle.payload.version === "1.0.0",
      )?.status,
    ).toBe("superseded");
  });

  it("rejects tampering and service-account policy activation", async () => {
    const bundle = createSignedReleasePolicyBundle(
      defaultReleasePolicyPayload("organization-nexus-7", now),
      privateKey,
    );
    bundle.payload.environments.production.maximumErrorRatePercent = 50;
    await expect(service.activate(bundle, admin)).rejects.toBeInstanceOf(
      ExperimentPermissionError,
    );

    const valid = createSignedReleasePolicyBundle(
      defaultReleasePolicyPayload("organization-nexus-7", now),
      privateKey,
    );
    await expect(
      service.activate(valid, {
        id: "policy-bot",
        role: "admin",
        workspaceId: "workspace-neo-angeles",
        principalType: "service-account",
      }),
    ).rejects.toBeInstanceOf(ExperimentPermissionError);
  });
});
