// @vitest-environment node

import {
  generateKeyPairSync,
} from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  ExperimentConflictError,
  ExperimentPermissionError,
  ExperimentService,
  InMemoryExperimentRepository,
} from "@/experiments";
import type {
  ExperimentActor,
} from "@/experiments";
import { ControlledIterationService } from "@/iteration";
import {
  createExternalAttestationReceipt,
  EXTERNAL_PROMOTION_GATES,
} from "@/evidence";
import {
  InMemoryDeploymentAdapter,
} from "@/deployment";

describe("controlled self-iteration workflow", () => {
  let repository: InMemoryExperimentRepository;
  let experiments: ExperimentService;
  let iterations: ControlledIterationService;
  let sourceRunId: string;
  let sequence: number;
  let privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"];
  let deploymentAdapter: InMemoryDeploymentAdapter;

  const operator = { id: "iteration-operator", role: "operator" as const };
  const admin = { id: "iteration-admin", role: "admin" as const };
  const deploymentController: ExperimentActor = {
    id: "deployment-controller",
    role: "admin" as const,
    principalType: "service-account" as const,
    workloadKind: "deployment-controller" as const,
    permissionGrants: [
      "workspace:read",
      "governance:read",
      "deployment:control",
    ],
  };

  beforeEach(async () => {
    repository = new InMemoryExperimentRepository();
    sequence = 0;
    const keyPair = generateKeyPairSync("ed25519");
    privateKey = keyPair.privateKey;
    deploymentAdapter = new InMemoryDeploymentAdapter();
    const options = {
      now: () => new Date("2026-07-16T14:00:00.000Z"),
      id: () => `iteration-test-${++sequence}`,
      attestationPublicKey: keyPair.publicKey,
      deploymentAdapter,
    };
    experiments = new ExperimentService(repository, options);
    await experiments.initialize();
    iterations = new ControlledIterationService(experiments, options);
    sourceRunId = (
      await experiments.createRun({ name: "Iteration source" }, operator)
    ).id;
  });

  it("generates an evidence-backed executable policy proposal", async () => {
    const proposal = await iterations.propose(sourceRunId, operator);

    expect(proposal.status).toBe("proposed");
    expect(proposal.trigger.metric).toBe("traffic");
    expect(proposal.specification.intervention.payload.metric).toBe("traffic");
    expect(proposal.specification.intervention.payload.delta).toBeLessThan(0);
    expect(proposal.implementation.branchName).toContain("policy/traffic");
    expect(proposal.qualityEvidence.find((gate) => gate.gate === "schema"))
      .toMatchObject({ status: "passed" });
  });

  it("runs isolated baseline and candidate forks before human approval", async () => {
    const proposal = await iterations.propose(sourceRunId, operator);
    const evaluated = await iterations.act(
      proposal.id,
      proposal.revision,
      { type: "run-experiment" },
      operator,
    );

    expect(evaluated.status).toBe("pending-approval");
    expect(evaluated.evaluation?.accepted).toBe(true);
    expect(evaluated.evaluation?.targetImprovement).toBeGreaterThanOrEqual(1);
    expect(evaluated.evaluation?.deterministicReplay).toBe(true);
    expect(evaluated.evaluation?.baselineRunId).not.toBe(
      evaluated.evaluation?.candidateRunId,
    );
    expect(
      evaluated.qualityEvidence.find(
        (gate) => gate.gate === "deterministic-replay",
      )?.status,
    ).toBe("passed");
  });

  it("requires an admin and the current revision for promotion", async () => {
    const proposal = await iterations.propose(sourceRunId, operator);
    const evaluated = await iterations.act(
      proposal.id,
      proposal.revision,
      { type: "run-experiment" },
      operator,
    );

    await expect(
      iterations.act(
        evaluated.id,
        evaluated.revision,
        { type: "approve" },
        operator,
      ),
    ).rejects.toBeInstanceOf(ExperimentPermissionError);
    await expect(
      iterations.act(
        evaluated.id,
        evaluated.revision - 1,
        { type: "approve" },
        admin,
      ),
    ).rejects.toBeInstanceOf(ExperimentConflictError);
  });

  it("promotes a healthy canary and records an immutable decision chain", async () => {
    const proposal = await iterations.propose(sourceRunId, operator);
    const evaluated = await iterations.act(
      proposal.id,
      proposal.revision,
      { type: "run-experiment" },
      operator,
    );
    const approved = await iterations.act(
      evaluated.id,
      evaluated.revision,
      { type: "approve", rationale: "Metrics and replay satisfy policy." },
      admin,
    );
    const canary = await iterations.act(
      approved.id,
      approved.revision,
      { type: "start-canary" },
      admin,
    );
    const promoted = await iterations.act(
      canary.id,
      canary.revision,
      { type: "observe-canary" },
      admin,
    );
    const decisions = await iterations.decisions(promoted.id);

    expect(promoted.status).toBe("promoted");
    expect(promoted.canary?.status).toBe("healthy");
    expect(promoted.canary?.slo.observation).toMatchObject({
      deterministicReplay: true,
      invariantViolations: [],
      breaches: [],
    });
    expect(promoted.canary?.alerts).toEqual([]);
    expect(
      promoted.qualityEvidence.find(
        (gate) => gate.gate === "deployment-monitoring",
      )?.status,
    ).toBe("passed");
    expect(decisions.map((decision) => decision.type)).toEqual([
      "proposal.created",
      "experiment.started",
      "experiment.completed",
      "approval.granted",
      "canary.started",
      "promotion.completed",
    ]);
    expect(decisions.map((decision) => decision.cursor)).toEqual(
      [...decisions.map((decision) => decision.cursor)].sort((a, b) => a - b),
    );
  });

  it("raises a critical SLO alert and automatically discards a faulty canary", async () => {
    const proposal = await iterations.propose(sourceRunId, operator);
    const evaluated = await iterations.act(
      proposal.id,
      proposal.revision,
      { type: "run-experiment" },
      operator,
    );
    const approved = await iterations.act(
      evaluated.id,
      evaluated.revision,
      { type: "approve", rationale: "Run the rollback drill." },
      admin,
    );
    const canary = await iterations.act(
      approved.id,
      approved.revision,
      { type: "start-canary" },
      admin,
    );
    const rolledBack = await iterations.act(
      canary.id,
      canary.revision,
      { type: "drill-rollback" },
      admin,
    );
    const decisions = await iterations.decisions(rolledBack.id);

    expect(rolledBack.status).toBe("rolled-back");
    expect(rolledBack.canary?.status).toBe("rollback-triggered");
    expect(rolledBack.canary?.observedTicks).toBeLessThan(
      rolledBack.canary?.observationWindow ?? 0,
    );
    expect(rolledBack.canary?.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "critical",
          code: "wrong-direction",
          automaticAction: "discard-canary",
        }),
      ]),
    );
    expect(
      rolledBack.qualityEvidence.find(
        (gate) => gate.gate === "deployment-monitoring",
      )?.status,
    ).toBe("failed");
    expect(decisions.map((decision) => decision.type)).toContain(
      "rollback.drill.started",
    );
    expect(decisions.at(-1)?.type).toBe("rollback.triggered");
  });

  it("does not let viewers create improvement proposals", async () => {
    await expect(
      iterations.propose(sourceRunId, { id: "viewer", role: "viewer" }),
    ).rejects.toBeInstanceOf(ExperimentPermissionError);
  });

  it("requires exact external provenance and a human admin for code promotion", async () => {
    const artifact = {
      name: "nexus-web",
      repository: "Carrick-K7/nexus-7",
      commitSha: "a".repeat(40),
      evidenceManifestSha256: "b".repeat(64),
      evidenceManifestFingerprint: "c".repeat(64),
    };
    const proposal = await iterations.propose(
      sourceRunId,
      operator,
      {
        changeScope: "code",
        releaseArtifact: artifact,
      },
    );
    await expect(
      iterations.act(
        proposal.id,
        proposal.revision,
        { type: "run-experiment" },
        operator,
      ),
    ).rejects.toThrow("external attested evidence");

    const receipt = createExternalAttestationReceipt(
      {
        schemaVersion: 1,
        provider: "github-actions-sigstore",
        repository: artifact.repository,
        sourceCommitSha: artifact.commitSha,
        subjectPath: "public/data/ci-evidence.json",
        subjectSha256: artifact.evidenceManifestSha256,
        manifestFingerprint: artifact.evidenceManifestFingerprint,
        workflow: "CI",
        signerWorkflow:
          "Carrick-K7/nexus-7/.github/workflows/ci.yml",
        runId: "governed-run",
        gates: [...EXTERNAL_PROMOTION_GATES],
        verifiedAt: "2026-07-16T13:00:00.000Z",
        expiresAt: "2026-07-17T13:00:00.000Z",
      },
      privateKey,
    );
    const attached = await iterations.act(
      proposal.id,
      proposal.revision,
      { type: "attach-external-evidence", receipt },
      operator,
    );

    expect(attached.status).toBe("pending-approval");
    expect(
      attached.qualityEvidence.find(
        (gate) => gate.gate === "external-provenance",
      )?.status,
    ).toBe("passed");
    await expect(
      iterations.act(
        attached.id,
        attached.revision,
        { type: "approve" },
        {
          id: "release-bot",
          role: "admin",
          principalType: "service-account",
        },
      ),
    ).rejects.toThrow("service-account admin cannot perform");

    const approved = await iterations.act(
      attached.id,
      attached.revision,
      { type: "approve" },
      admin,
    );
    expect(approved.status).toBe("approved");
    expect((await iterations.decisions(approved.id)).at(-2)?.type).toBe(
      "external-evidence.attached",
    );

    const canary = await iterations.act(
      approved.id,
      approved.revision,
      { type: "start-canary" },
      deploymentController,
    );
    expect(canary.deployment?.trafficPercent).toBe(5);
    const sampleOne = await iterations.act(
      canary.id,
      canary.revision,
      { type: "observe-canary" },
      deploymentController,
    );
    const sampleTwo = await iterations.act(
      sampleOne.id,
      sampleOne.revision,
      { type: "observe-canary" },
      deploymentController,
    );
    const promoted = await iterations.act(
      sampleTwo.id,
      sampleTwo.revision,
      { type: "observe-canary" },
      deploymentController,
    );
    expect(promoted.status).toBe("promoted");
    expect(promoted.deployment).toMatchObject({
      status: "healthy",
      trafficPercent: 100,
      observationCount: 3,
    });
    expect(promoted.deployment?.alerts).toEqual([]);
  });

  it("uses deployment telemetry to trigger a platform rollback drill", async () => {
    const artifact = {
      name: "nexus-deployment",
      repository: "Carrick-K7/nexus-7",
      commitSha: "1".repeat(40),
      evidenceManifestSha256: "2".repeat(64),
      evidenceManifestFingerprint: "3".repeat(64),
    };
    const proposal = await iterations.propose(
      sourceRunId,
      operator,
      {
        changeScope: "deployment",
        releaseArtifact: artifact,
      },
    );
    const receipt = createExternalAttestationReceipt(
      {
        schemaVersion: 1,
        provider: "github-actions-sigstore",
        repository: artifact.repository,
        sourceCommitSha: artifact.commitSha,
        subjectPath: "public/data/ci-evidence.json",
        subjectSha256: artifact.evidenceManifestSha256,
        manifestFingerprint: artifact.evidenceManifestFingerprint,
        workflow: "CI",
        signerWorkflow:
          "Carrick-K7/nexus-7/.github/workflows/ci.yml",
        runId: "deployment-drill",
        gates: [...EXTERNAL_PROMOTION_GATES],
        verifiedAt: "2026-07-16T13:00:00.000Z",
        expiresAt: "2026-07-17T13:00:00.000Z",
      },
      privateKey,
    );
    const attached = await iterations.act(
      proposal.id,
      proposal.revision,
      { type: "attach-external-evidence", receipt },
      operator,
    );
    const approved = await iterations.act(
      attached.id,
      attached.revision,
      { type: "approve" },
      admin,
    );
    const canary = await iterations.act(
      approved.id,
      approved.revision,
      { type: "start-canary" },
      deploymentController,
    );
    const rolledBack = await iterations.act(
      canary.id,
      canary.revision,
      { type: "drill-rollback" },
      deploymentController,
    );

    expect(rolledBack.status).toBe("rolled-back");
    expect(rolledBack.deployment).toMatchObject({
      status: "rollback-triggered",
      trafficPercent: 0,
      observationCount: 1,
    });
    expect(rolledBack.deployment?.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "critical",
          code: "error-rate",
          automaticAction: "platform-rollback",
        }),
      ]),
    );
  });

  it("enforces development to staging to production artifact promotion order", async () => {
    const artifact = {
      name: "nexus-environment-chain",
      repository: "Carrick-K7/nexus-7",
      commitSha: "9".repeat(40),
      evidenceManifestSha256: "8".repeat(64),
      evidenceManifestFingerprint: "7".repeat(64),
    };
    const receiptFor = (runId: string) =>
      createExternalAttestationReceipt(
        {
          schemaVersion: 1,
          provider: "github-actions-sigstore",
          repository: artifact.repository,
          sourceCommitSha: artifact.commitSha,
          subjectPath: "public/data/ci-evidence.json",
          subjectSha256: artifact.evidenceManifestSha256,
          manifestFingerprint: artifact.evidenceManifestFingerprint,
          workflow: "CI",
          signerWorkflow:
            "Carrick-K7/nexus-7/.github/workflows/ci.yml",
          runId,
          gates: [...EXTERNAL_PROMOTION_GATES],
          verifiedAt: "2026-07-16T13:00:00.000Z",
          expiresAt: "2026-07-17T13:00:00.000Z",
        },
        privateKey,
      );
    const prepare = async (
      environment: "development" | "staging" | "production",
    ) => {
      const proposal = await iterations.propose(
        sourceRunId,
        operator,
        {
          changeScope: "deployment",
          releaseArtifact: artifact,
          targetEnvironment: environment,
        },
      );
      const attached = await iterations.act(
        proposal.id,
        proposal.revision,
        {
          type: "attach-external-evidence",
          receipt: receiptFor(`environment-${environment}`),
        },
        operator,
      );
      return iterations.act(
        attached.id,
        attached.revision,
        { type: "approve" },
        admin,
      );
    };
    const staging = await prepare("staging");
    await expect(
      iterations.act(
        staging.id,
        staging.revision,
        { type: "start-canary" },
        deploymentController,
      ),
    ).rejects.toThrow("requires the same artifact to pass development");

    const development = await prepare("development");
    let developmentCanary = await iterations.act(
      development.id,
      development.revision,
      { type: "start-canary" },
      deploymentController,
    );
    expect(developmentCanary.deployment).toMatchObject({
      environment: "development",
      trafficStages: [5, 25, 50, 100],
    });
    for (let index = 0; index < 3; index += 1) {
      developmentCanary = await iterations.act(
        developmentCanary.id,
        developmentCanary.revision,
        { type: "observe-canary" },
        deploymentController,
      );
    }
    expect(developmentCanary.status).toBe("promoted");

    let stagingCanary = await iterations.act(
      staging.id,
      staging.revision,
      { type: "start-canary" },
      deploymentController,
    );
    expect(stagingCanary.deployment).toMatchObject({
      environment: "staging",
      trafficStages: [10, 50, 100],
    });

    const production = await prepare("production");
    await expect(
      iterations.act(
        production.id,
        production.revision,
        { type: "start-canary" },
        deploymentController,
      ),
    ).rejects.toThrow("requires the same artifact to pass staging");

    for (let index = 0; index < 2; index += 1) {
      stagingCanary = await iterations.act(
        stagingCanary.id,
        stagingCanary.revision,
        { type: "observe-canary" },
        deploymentController,
      );
    }
    expect(stagingCanary.status).toBe("promoted");
    const productionCanary = await iterations.act(
      production.id,
      production.revision,
      { type: "start-canary" },
      deploymentController,
    );
    expect(productionCanary.deployment).toMatchObject({
      environment: "production",
      trafficStages: [5, 25, 50, 100],
    });
  });

  it("rejects an attestation receipt whose signed artifact binding was altered", async () => {
    const artifact = {
      name: "nexus-deployment",
      repository: "Carrick-K7/nexus-7",
      commitSha: "d".repeat(40),
      evidenceManifestSha256: "e".repeat(64),
      evidenceManifestFingerprint: "f".repeat(64),
    };
    const proposal = await iterations.propose(
      sourceRunId,
      operator,
      {
        changeScope: "deployment",
        releaseArtifact: artifact,
      },
    );
    const receipt = createExternalAttestationReceipt(
      {
        schemaVersion: 1,
        provider: "github-actions-sigstore",
        repository: artifact.repository,
        sourceCommitSha: artifact.commitSha,
        subjectPath: "public/data/ci-evidence.json",
        subjectSha256: artifact.evidenceManifestSha256,
        manifestFingerprint: artifact.evidenceManifestFingerprint,
        workflow: "CI",
        signerWorkflow:
          "Carrick-K7/nexus-7/.github/workflows/ci.yml",
        runId: "tamper-test",
        gates: [...EXTERNAL_PROMOTION_GATES],
        verifiedAt: "2026-07-16T13:00:00.000Z",
        expiresAt: "2026-07-17T13:00:00.000Z",
      },
      privateKey,
    );
    receipt.payload.sourceCommitSha = "0".repeat(40);

    await expect(
      iterations.act(
        proposal.id,
        proposal.revision,
        { type: "attach-external-evidence", receipt },
        operator,
      ),
    ).rejects.toBeInstanceOf(ExperimentPermissionError);
  });
});
