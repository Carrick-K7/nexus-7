import {
  createPublicKey,
  type KeyLike,
} from "node:crypto";
import {
  actorPrincipalType,
  actorWorkspaceId,
  assertActorPermission,
} from "@/experiments/authorization";
import {
  ExperimentNotFoundError,
  ExperimentPermissionError,
} from "@/experiments/errors";
import type {
  ExperimentActor,
} from "@/experiments/types";
import type {
  ExperimentRepository,
} from "@/experiments/repository";
import type {
  OperationalIntelligenceService,
} from "@/operations/intelligence-service";
import {
  policyPublicKeyFromEnvironment,
  verifySignedReleasePolicyBundle,
} from "./release-policy";
import type {
  ReleasePolicyRecord,
  SignedReleasePolicyBundle,
} from "./types";

interface ReleasePolicyServiceOptions {
  now?: () => Date;
  id?: () => string;
  publicKey?: KeyLike;
  operationalIntelligence?: Pick<
    OperationalIntelligenceService,
    "recordSample"
  >;
}

export class ReleasePolicyService {
  private readonly now: () => Date;
  private readonly id: () => string;
  private readonly publicKey?: KeyLike;
  private readonly operationalIntelligence?: Pick<
    OperationalIntelligenceService,
    "recordSample"
  >;

  constructor(
    private readonly repository: ExperimentRepository,
    options: ReleasePolicyServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.id = options.id ?? (() => crypto.randomUUID());
    this.publicKey = options.publicKey;
    this.operationalIntelligence = options.operationalIntelligence;
  }

  private verificationKey(): KeyLike {
    return (
      this.publicKey ??
      createPublicKey(policyPublicKeyFromEnvironment())
    );
  }

  async activate(
    bundle: SignedReleasePolicyBundle,
    actor: ExperimentActor,
  ): Promise<ReleasePolicyRecord> {
    assertActorPermission(actor, "policy:manage");
    if (actorPrincipalType(actor) !== "human") {
      throw new ExperimentPermissionError(
        "Only a human administrator may activate release policy",
      );
    }
    const workspaceId = actorWorkspaceId(actor);
    const workspace =
      await this.repository.getGovernedWorkspace(workspaceId);
    if (!workspace) {
      throw new ExperimentNotFoundError(
        `Workspace governance for ${workspaceId} was not found`,
      );
    }
    const verification = verifySignedReleasePolicyBundle(
      bundle,
      this.verificationKey(),
      workspace.organizationId,
      this.now(),
    );
    if (!verification.valid) {
      throw new ExperimentPermissionError(
        `Release policy rejected: ${verification.reasons.join("; ")}`,
      );
    }
    const activatedAt = this.now().toISOString();
    const record = await this.repository.activateReleasePolicy({
      id: `release-policy-${this.id()}`,
      organizationId: workspace.organizationId,
      workspaceId,
      status: "active",
      bundle: structuredClone(bundle),
      activatedBy: actor.id,
      activatedAt,
    });
    const remainingHours =
      (Date.parse(record.bundle.payload.expiresAt) -
        Date.parse(activatedAt)) /
      (60 * 60 * 1_000);
    await this.operationalIntelligence?.recordSample(
      {
        source: "policy",
        metric: "expiry-remaining-hours",
        value: remainingHours,
        unit: "hours",
        status:
          remainingHours <= 0
            ? "breaching"
            : remainingHours <= 168
              ? "warning"
              : "healthy",
        dimensions: {
          policyId: record.bundle.payload.policyId,
          version: record.bundle.payload.version,
        },
        evidenceId: record.id,
        observedAt: activatedAt,
      },
      actor,
    );
    return record;
  }

  async list(actor: ExperimentActor): Promise<ReleasePolicyRecord[]> {
    assertActorPermission(actor, "governance:read");
    return this.repository.listReleasePolicies(actorWorkspaceId(actor));
  }
}
