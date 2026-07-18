import {
  createPublicKey,
  type KeyLike,
} from "node:crypto";
import {
  getMetric,
  selectCityMetrics,
} from "@/simulation";
import {
  attestationPublicKeyFromEnvironment,
  EXTERNAL_PROMOTION_GATES,
  verifyExternalAttestationReceipt,
} from "@/evidence";
import type {
  ExternalAttestationReceipt,
} from "@/evidence";
import {
  getDeploymentAdapterFromEnvironment,
} from "@/deployment";
import type {
  DeploymentAdapter,
  DeploymentTelemetry,
} from "@/deployment";
import {
  defaultReleasePolicyPayload,
} from "@/governance/release-policy";
import type {
  ReleaseEnvironment,
} from "@/governance/types";
import type {
  CityMetricSnapshot,
  SimulationMetric,
} from "@/simulation";
import {
  ExperimentConflictError,
  ExperimentNotFoundError,
  ExperimentPermissionError,
  ExperimentValidationError,
} from "@/experiments/errors";
import type {
  ExperimentService,
} from "@/experiments/service";
import type {
  ExperimentActor,
  ExperimentRun,
} from "@/experiments/types";
import type {
  OperationalIntelligenceService,
} from "@/operations/intelligence-service";
import {
  actorPrincipalType,
  assertActorPermission,
  assertWorkspaceAccess,
} from "@/experiments/authorization";
import type {
  ImprovementAction,
  ImprovementProposal,
  ImprovementProposalOptions,
  IterationDecisionRecord,
  QualityGateEvidence,
  CanaryState,
  DeploymentReleaseState,
} from "./types";

interface IterationServiceOptions {
  now?: () => Date;
  id?: () => string;
  attestationPublicKey?: KeyLike;
  deploymentAdapter?: DeploymentAdapter;
  operationalIntelligence?: Pick<
    OperationalIntelligenceService,
    "recordSample"
  >;
}

interface Concern {
  metric: SimulationMetric;
  value: number;
  score: number;
  direction: "increase" | "decrease";
  actorId: "atlas" | "economica" | "civitas" | "spectre";
  delta: number;
}

const COMPARABLE_METRICS: Array<keyof CityMetricSnapshot> = [
  "gdp",
  "happiness",
  "pollution",
  "crime",
  "traffic",
  "energy",
  "water",
  "internet",
  "medical",
];

const LOWER_IS_BETTER = new Set<keyof CityMetricSnapshot>([
  "pollution",
  "crime",
  "traffic",
]);

function selectConcern(run: ExperimentRun): Concern {
  const city = selectCityMetrics(run.run.world);
  const concerns: Concern[] = [
    {
      metric: "crime",
      value: city.crime,
      score: city.crime / 100,
      direction: "decrease",
      actorId: "atlas",
      delta: -5,
    },
    {
      metric: "traffic",
      value: city.traffic,
      score: city.traffic / 100,
      direction: "decrease",
      actorId: "civitas",
      delta: -5,
    },
    {
      metric: "pollution",
      value: city.pollution,
      score: city.pollution / 100,
      direction: "decrease",
      actorId: "civitas",
      delta: -5,
    },
    {
      metric: "energy",
      value: city.energy,
      score: (100 - city.energy) / 100,
      direction: "increase",
      actorId: "civitas",
      delta: 5,
    },
    {
      metric: "happiness",
      value: city.happiness,
      score: (100 - city.happiness) / 100,
      direction: "increase",
      actorId: "economica",
      delta: 4,
    },
    {
      metric: "internet",
      value: city.internet,
      score: (100 - city.internet) / 100,
      direction: "increase",
      actorId: "spectre",
      delta: 4,
    },
  ];
  return concerns.sort((left, right) => right.score - left.score)[0];
}

function targetImprovement(
  metric: SimulationMetric,
  baseline: CityMetricSnapshot,
  candidate: CityMetricSnapshot,
): number {
  const key = metric as keyof CityMetricSnapshot;
  return LOWER_IS_BETTER.has(key)
    ? baseline[key] - candidate[key]
    : candidate[key] - baseline[key];
}

function maximumRegression(
  target: SimulationMetric,
  baseline: CityMetricSnapshot,
  candidate: CityMetricSnapshot,
): number {
  return Math.max(
    0,
    ...COMPARABLE_METRICS.filter((metric) => metric !== target).map(
      (metric) =>
        LOWER_IS_BETTER.has(metric)
          ? candidate[metric] - baseline[metric]
          : baseline[metric] - candidate[metric],
    ),
  );
}

function updateGate(
  gates: QualityGateEvidence[],
  gate: QualityGateEvidence["gate"],
  status: QualityGateEvidence["status"],
  detail: string,
  artifact?: string,
): QualityGateEvidence[] {
  return gates.map((evidence) =>
    evidence.gate === gate
      ? { ...evidence, status, detail, artifact }
      : evidence,
  );
}

export class ControlledIterationService {
  private readonly now: () => Date;
  private readonly id: () => string;
  private readonly attestationPublicKey?: KeyLike;
  private readonly deploymentAdapter?: DeploymentAdapter;
  private readonly operationalIntelligence?: Pick<
    OperationalIntelligenceService,
    "recordSample"
  >;

  constructor(
    private readonly experiments: ExperimentService,
    options: IterationServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.id = options.id ?? (() => crypto.randomUUID());
    this.attestationPublicKey = options.attestationPublicKey;
    this.deploymentAdapter = options.deploymentAdapter;
    this.operationalIntelligence = options.operationalIntelligence;
  }

  private decision(
    proposalId: string,
    actor: ExperimentActor,
    type: IterationDecisionRecord["type"],
    detail: Record<string, unknown>,
    createdAt: string,
  ): Omit<IterationDecisionRecord, "cursor"> {
    return {
      id: `decision-${this.id()}`,
      proposalId,
      type,
      actorId: actor.id,
      role: actor.role,
      detail: {
        ...detail,
        authentication: {
          source: actor.authSource ?? "system",
          issuer: actor.issuer,
        },
      },
      createdAt,
    };
  }

  private assertOperator(actor: ExperimentActor): void {
    assertActorPermission(actor, "iterations:propose");
  }

  private assertAdmin(actor: ExperimentActor): void {
    assertActorPermission(actor, "iterations:approve");
    if (actorPrincipalType(actor) !== "human") {
      throw new ExperimentPermissionError(
        "A human admin is required for promotion decisions",
      );
    }
  }

  private async resolveReleasePolicy(
    workspaceId: string,
    environment: ReleaseEnvironment,
  ): Promise<NonNullable<ImprovementProposal["releasePolicy"]>> {
    const active =
      await this.experiments.repository.getActiveReleasePolicy(
        workspaceId,
      );
    if (
      !active &&
      process.env.NEXUS_REQUIRE_SIGNED_RELEASE_POLICY === "true"
    ) {
      throw new ExperimentPermissionError(
        "A signed organization release policy is required",
      );
    }
    if (
      active &&
      Date.parse(active.bundle.payload.expiresAt) <= this.now().getTime()
    ) {
      throw new ExperimentPermissionError(
        "The active organization release policy has expired",
      );
    }
    const workspace =
      await this.experiments.repository.getGovernedWorkspace(workspaceId);
    const payload =
      active?.bundle.payload ??
      defaultReleasePolicyPayload(
        workspace?.organizationId ?? "organization-nexus-7",
        this.now(),
      );
    return {
      policyId: payload.policyId,
      version: payload.version,
      signed: Boolean(active),
      environment: structuredClone(payload.environments[environment]),
    };
  }

  private releasePolicyFor(
    proposal: ImprovementProposal,
  ): NonNullable<ImprovementProposal["releasePolicy"]> {
    if (proposal.releasePolicy) {
      return proposal.releasePolicy;
    }
    const environment = proposal.targetEnvironment ?? "development";
    const payload = defaultReleasePolicyPayload(
      "organization-nexus-7",
      new Date(proposal.createdAt),
    );
    return {
      policyId: payload.policyId,
      version: payload.version,
      signed: false,
      environment: payload.environments[environment],
    };
  }

  async list(actor?: ExperimentActor): Promise<ImprovementProposal[]> {
    const { workspace } = await this.experiments.overview(actor);
    return this.experiments.repository.listImprovements(workspace.id);
  }

  async get(
    proposalId: string,
    actor?: ExperimentActor,
  ): Promise<ImprovementProposal> {
    const proposal =
      await this.experiments.repository.getImprovement(proposalId);
    if (!proposal) {
      throw new ExperimentNotFoundError(
        `Improvement proposal ${proposalId} was not found`,
      );
    }
    if (actor) {
      assertWorkspaceAccess(actor, proposal.workspaceId);
    }
    return proposal;
  }

  async decisions(
    proposalId: string,
    actor?: ExperimentActor,
  ): Promise<IterationDecisionRecord[]> {
    await this.get(proposalId, actor);
    return this.experiments.repository.listIterationDecisions(proposalId);
  }

  async propose(
    sourceRunId: string,
    actor: ExperimentActor,
    options: ImprovementProposalOptions = {},
  ): Promise<ImprovementProposal> {
    this.assertOperator(actor);
    const source = await this.experiments.getRun(sourceRunId, actor);
    const concern = selectConcern(source);
    const timestamp = this.now().toISOString();
    const proposalId = `improvement-${this.id()}`;
    const evidenceEventIds = source.run.events
      .filter((event) => event.payload.metric === concern.metric)
      .slice(-5)
      .map((event) => event.id);
    const commandId = `cmd-${proposalId}`;
    const changeScope = options.changeScope ?? "policy";
    if (changeScope !== "policy" && !options.releaseArtifact) {
      throw new ExperimentValidationError(
        "Code and deployment proposals require a release artifact binding",
      );
    }
    const targetEnvironment =
      changeScope === "policy"
        ? undefined
        : options.targetEnvironment ?? "development";
    const releasePolicy = targetEnvironment
      ? await this.resolveReleasePolicy(
          source.workspaceId,
          targetEnvironment,
        )
      : undefined;
    const externalEvidenceRequired =
      releasePolicy?.environment.externalEvidenceRequired ?? false;
    const humanApprovalRequired =
      releasePolicy?.environment.humanApprovalRequired ?? false;
    const initialStatus: ImprovementProposal["status"] =
      changeScope === "policy" || externalEvidenceRequired
        ? "proposed"
        : humanApprovalRequired
          ? "pending-approval"
          : "approved";
    const proposal: ImprovementProposal = {
      id: proposalId,
      workspaceId: source.workspaceId,
      sourceRunId: source.id,
      revision: 1,
      status: initialStatus,
      riskTier: "medium",
      changeScope,
      title: `${concern.direction === "decrease" ? "Reduce" : "Improve"} ${concern.metric}`,
      hypothesis: `${concern.actorId.toUpperCase()} can ${concern.direction} ${concern.metric} without regressing another protected metric by more than 4 points.`,
      trigger: {
        tick: source.run.world.tick,
        metric: concern.metric,
        value: concern.value,
        score: concern.score,
        evidenceEventIds,
      },
      specification: {
        id: `spec-${proposalId}`,
        targetMetric: concern.metric,
        direction: concern.direction,
        actorId: concern.actorId,
        delta: concern.delta,
        horizonTicks: 5,
        minimumImprovement: 1,
        maximumRegression: 4,
        intervention: {
          id: commandId,
          tick: source.run.world.tick + 1,
          actorId: concern.actorId,
          type: "adjust-metric",
          payload: {
            metric: concern.metric,
            delta: concern.delta,
            reason: `Controlled iteration experiment for ${proposalId}`,
            task: `Evaluate ${concern.metric} policy variant`,
          },
          correlationId: `corr-${proposalId}`,
          causationId: proposalId,
          source: "policy",
        },
      },
      implementation: {
        branchName: `${changeScope}/${concern.metric}-${proposalId.slice(-8)}`,
        kind:
          changeScope === "policy"
            ? "policy-variant"
            : changeScope === "code"
              ? "code-branch"
              : "deployment-canary",
        summary:
          changeScope === "policy"
            ? `Isolated ${concern.actorId} intervention: ${concern.metric} ${concern.delta > 0 ? "+" : ""}${concern.delta}`
            : `${changeScope} release ${options.releaseArtifact?.name} bound to external evidence`,
        affectedArtifacts: [
          `agent:${concern.actorId}`,
          `metric:${concern.metric}`,
          "simulation-command-stream",
        ],
      },
      releaseArtifact: options.releaseArtifact,
      targetEnvironment,
      releasePolicy,
      qualityEvidence: [
        {
          gate: "schema",
          status: "passed",
          detail: "Experiment specification is structured and versioned.",
        },
        {
          gate: "capability",
          status: "passed",
          detail: `${concern.actorId} is authorized to modify ${concern.metric}.`,
        },
        {
          gate: "deterministic-replay",
          status:
            changeScope === "policy" ? "pending" : "not-applicable",
          detail:
            changeScope === "policy"
              ? "Baseline and candidate reports have not run."
              : "External releases use attested quality and deployment evidence.",
        },
        {
          gate: "invariants",
          status:
            changeScope === "policy" ? "pending" : "not-applicable",
          detail:
            changeScope === "policy"
              ? "Candidate horizon has not run."
              : "Simulation invariants are not the external release evaluator.",
        },
        {
          gate: "security",
          status: "passed",
          detail: "Delta stays within command guardrails and risk is medium.",
        },
        {
          gate: "unit-tests",
          status:
            changeScope === "policy" ||
            !externalEvidenceRequired
              ? "not-applicable"
              : "pending",
          detail:
            changeScope === "policy"
              ? "Policy-only variant does not change application code."
              : externalEvidenceRequired
                ? "External unit/integration evidence has not been attached."
                : "The active release policy exempts this environment.",
        },
        {
          gate: "build",
          status:
            changeScope === "policy" ||
            !externalEvidenceRequired
              ? "not-applicable"
              : "pending",
          detail:
            changeScope === "policy"
              ? "Policy-only variant does not change build artifacts."
              : externalEvidenceRequired
                ? "External build evidence has not been attached."
                : "The active release policy exempts this environment.",
        },
        {
          gate: "browser",
          status:
            changeScope === "policy" ||
            !externalEvidenceRequired
              ? "not-applicable"
              : "pending",
          detail:
            changeScope === "policy"
              ? "Policy-only variant does not change the user interface."
              : externalEvidenceRequired
                ? "External browser evidence has not been attached."
                : "The active release policy exempts this environment.",
        },
        {
          gate: "external-provenance",
          status:
            changeScope === "policy" ||
            !externalEvidenceRequired
              ? "not-applicable"
              : "pending",
          detail:
            changeScope === "policy"
              ? "Policy-only variants use deterministic in-process evidence."
              : externalEvidenceRequired
                ? "A verified external CI attestation receipt is required."
                : "The active release policy exempts this environment.",
        },
        {
          gate: "deployment-monitoring",
          status: "pending",
          detail: "Canary has not started.",
        },
      ],
      createdBy: actor.id,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    return this.experiments.repository.createImprovement(
      proposal,
      this.decision(
        proposal.id,
        actor,
        "proposal.created",
        {
          sourceRunId,
          metric: concern.metric,
          triggerValue: concern.value,
          branchName: proposal.implementation.branchName,
          targetEnvironment,
          releasePolicy: releasePolicy
            ? {
                policyId: releasePolicy.policyId,
                version: releasePolicy.version,
                signed: releasePolicy.signed,
              }
            : undefined,
        },
        timestamp,
      ),
    );
  }

  async act(
    proposalId: string,
    expectedRevision: number,
    action: ImprovementAction,
    actor: ExperimentActor,
  ): Promise<ImprovementProposal> {
    const proposal = await this.get(proposalId, actor);
    if (proposal.revision !== expectedRevision) {
      throw new ExperimentConflictError(
        `Improvement ${proposal.id} changed; expected revision ${expectedRevision}`,
      );
    }

    if (action.type === "run-experiment") {
      return this.runExperiment(proposal, actor);
    }
    if (action.type === "attach-external-evidence") {
      return this.attachExternalEvidence(proposal, action.receipt, actor);
    }
    if (action.type === "approve" || action.type === "reject") {
      return this.decide(proposal, action, actor);
    }
    if (action.type === "start-canary") {
      return this.startCanary(proposal, actor);
    }
    if (action.type === "drill-rollback") {
      return this.runRollbackDrill(proposal, actor);
    }
    return this.observeCanary(proposal, actor);
  }

  private async runExperiment(
    proposal: ImprovementProposal,
    actor: ExperimentActor,
  ): Promise<ImprovementProposal> {
    this.assertOperator(actor);
    if (proposal.status !== "proposed") {
      throw new ExperimentValidationError(
        "Only proposed improvements can start an experiment",
      );
    }
    if (proposal.changeScope !== "policy") {
      throw new ExperimentValidationError(
        "Code and deployment proposals require external attested evidence instead of in-process policy experiments",
      );
    }
    const startedAt = this.now().toISOString();
    const experimenting: ImprovementProposal = {
      ...proposal,
      revision: proposal.revision + 1,
      status: "experimenting",
      updatedAt: startedAt,
    };
    await this.experiments.repository.commitImprovement(
      experimenting,
      proposal.revision,
      this.decision(
        proposal.id,
        actor,
        "experiment.started",
        { specificationId: proposal.specification.id },
        startedAt,
      ),
    );

    try {
      const source = await this.experiments.getRun(proposal.sourceRunId);
      let baseline = await this.experiments.mutateRun(
        source.id,
        source.version,
        {
          type: "fork",
          tick: proposal.trigger.tick,
          name: `${proposal.title} baseline`,
        },
        actor,
      );
      let candidate = await this.experiments.mutateRun(
        source.id,
        source.version,
        {
          type: "fork",
          tick: proposal.trigger.tick,
          name: `${proposal.title} candidate`,
        },
        actor,
      );
      candidate = await this.experiments.queueCommand(
        candidate.id,
        candidate.version,
        {
          ...proposal.specification.intervention,
          tick: candidate.run.world.tick + 1,
        },
        actor,
      );

      for (
        let tick = 0;
        tick < proposal.specification.horizonTicks;
        tick += 1
      ) {
        baseline = await this.experiments.mutateRun(
          baseline.id,
          baseline.version,
          { type: "step" },
          actor,
        );
        candidate = await this.experiments.mutateRun(
          candidate.id,
          candidate.version,
          { type: "step" },
          actor,
        );
      }

      const [baselineReport, candidateReport] = await Promise.all([
        this.experiments.report(baseline.id),
        this.experiments.report(candidate.id),
      ]);
      const baselineMetrics = selectCityMetrics(baseline.run.world);
      const candidateMetrics = selectCityMetrics(candidate.run.world);
      const improvement = targetImprovement(
        proposal.specification.targetMetric,
        baselineMetrics,
        candidateMetrics,
      );
      const regression = maximumRegression(
        proposal.specification.targetMetric,
        baselineMetrics,
        candidateMetrics,
      );
      const replayVerified =
        baselineReport.verification.deterministicReplay &&
        candidateReport.verification.deterministicReplay;
      const reasons = [
        improvement >= proposal.specification.minimumImprovement
          ? `Target improved by ${improvement.toFixed(2)}`
          : `Target improvement ${improvement.toFixed(2)} missed ${proposal.specification.minimumImprovement.toFixed(2)}`,
        regression <= proposal.specification.maximumRegression
          ? `Maximum regression ${regression.toFixed(2)} stayed within limit`
          : `Maximum regression ${regression.toFixed(2)} exceeded limit`,
        replayVerified
          ? "Baseline and candidate replay verified"
          : "Replay verification failed",
      ];
      const accepted =
        improvement >= proposal.specification.minimumImprovement &&
        regression <= proposal.specification.maximumRegression &&
        replayVerified;
      const completedAt = this.now().toISOString();
      let qualityEvidence = updateGate(
        experimenting.qualityEvidence,
        "deterministic-replay",
        replayVerified ? "passed" : "failed",
        reasons[2],
        `report:${candidate.id}`,
      );
      qualityEvidence = updateGate(
        qualityEvidence,
        "invariants",
        "passed",
        `${proposal.specification.horizonTicks} candidate ticks completed without invariant failure.`,
        `run:${candidate.id}`,
      );
      const evaluated: ImprovementProposal = {
        ...experimenting,
        revision: experimenting.revision + 1,
        status: accepted ? "pending-approval" : "rejected",
        qualityEvidence,
        evaluation: {
          baselineRunId: baseline.id,
          candidateRunId: candidate.id,
          baselineMetrics,
          candidateMetrics,
          targetImprovement: improvement,
          maximumObservedRegression: regression,
          deterministicReplay: replayVerified,
          accepted,
          reasons,
          completedAt,
        },
        updatedAt: completedAt,
      };
      return this.experiments.repository.commitImprovement(
        evaluated,
        experimenting.revision,
        this.decision(
          proposal.id,
          actor,
          "experiment.completed",
          {
            accepted,
            baselineRunId: baseline.id,
            candidateRunId: candidate.id,
            targetImprovement: improvement,
            maximumRegression: regression,
          },
          completedAt,
        ),
      );
    } catch (error) {
      const failedAt = this.now().toISOString();
      const failed: ImprovementProposal = {
        ...experimenting,
        revision: experimenting.revision + 1,
        status: "failed",
        updatedAt: failedAt,
      };
      return this.experiments.repository.commitImprovement(
        failed,
        experimenting.revision,
        this.decision(
          proposal.id,
          actor,
          "workflow.failed",
          {
            stage: "experiment",
            error: error instanceof Error ? error.message : String(error),
          },
          failedAt,
        ),
      );
    }
  }

  private async decide(
    proposal: ImprovementProposal,
    action: Extract<ImprovementAction, { type: "approve" | "reject" }>,
    actor: ExperimentActor,
  ): Promise<ImprovementProposal> {
    this.assertAdmin(actor);
    if (proposal.status !== "pending-approval") {
      throw new ExperimentValidationError(
        "Only evaluated improvements can receive a promotion decision",
      );
    }
    if (
      proposal.changeScope !== "policy" &&
      !this.releasePolicyFor(proposal).environment.humanApprovalRequired
    ) {
      throw new ExperimentValidationError(
        "The active release policy does not require a human decision",
      );
    }
    if (
      proposal.changeScope !== "policy" &&
      this.releasePolicyFor(proposal).environment.externalEvidenceRequired
    ) {
      this.assertValidExternalEvidence(proposal);
    }
    const timestamp = this.now().toISOString();
    const approved = action.type === "approve";
    const next: ImprovementProposal = {
      ...proposal,
      revision: proposal.revision + 1,
      status: approved ? "approved" : "rejected",
      approval: {
        decision: approved ? "approved" : "rejected",
        actorId: actor.id,
        role: actor.role,
        rationale:
          action.rationale?.trim() ||
          (approved
            ? "Experiment evidence meets the promotion policy."
            : "Human reviewer rejected the candidate."),
        decidedAt: timestamp,
      },
      updatedAt: timestamp,
    };
    return this.experiments.repository.commitImprovement(
      next,
      proposal.revision,
      this.decision(
        proposal.id,
        actor,
        approved ? "approval.granted" : "approval.rejected",
        { rationale: next.approval?.rationale },
        timestamp,
      ),
    );
  }

  private receiptPublicKey(): KeyLike {
    return (
      this.attestationPublicKey ??
      createPublicKey(attestationPublicKeyFromEnvironment())
    );
  }

  private assertValidExternalEvidence(proposal: ImprovementProposal): void {
    if (!proposal.releaseArtifact || !proposal.externalEvidence) {
      throw new ExperimentPermissionError(
        "Code and deployment promotion requires verified external evidence",
      );
    }
    const result = verifyExternalAttestationReceipt(
      proposal.externalEvidence.receipt,
      this.receiptPublicKey(),
      {
        repository: proposal.releaseArtifact.repository,
        sourceCommitSha: proposal.releaseArtifact.commitSha,
        subjectSha256:
          proposal.releaseArtifact.evidenceManifestSha256,
        manifestFingerprint:
          proposal.releaseArtifact.evidenceManifestFingerprint,
        requiredGates: [...EXTERNAL_PROMOTION_GATES],
      },
      this.now(),
    );
    if (!result.valid) {
      throw new ExperimentPermissionError(
        `External evidence rejected: ${result.reasons.join("; ")}`,
      );
    }
  }

  private async attachExternalEvidence(
    proposal: ImprovementProposal,
    receipt: ExternalAttestationReceipt,
    actor: ExperimentActor,
  ): Promise<ImprovementProposal> {
    assertActorPermission(actor, "evidence:attach");
    if (
      proposal.changeScope === "policy" ||
      proposal.status !== "proposed" ||
      !proposal.releaseArtifact
    ) {
      throw new ExperimentValidationError(
        "External evidence can only be attached to a proposed code or deployment release",
      );
    }
    const candidate: ImprovementProposal = {
      ...proposal,
      externalEvidence: {
        receipt,
        attachedBy: actor.id,
        attachedAt: this.now().toISOString(),
      },
    };
    this.assertValidExternalEvidence(candidate);
    const timestamp = this.now().toISOString();
    const releasePolicy = this.releasePolicyFor(candidate);
    let qualityEvidence = updateGate(
      candidate.qualityEvidence,
      "external-provenance",
      "passed",
      `GitHub Sigstore evidence verified for ${receipt.payload.sourceCommitSha.slice(0, 12)}.`,
      `attestation:${receipt.payload.subjectSha256}`,
    );
    for (const gate of ["unit-tests", "build", "browser"] as const) {
      qualityEvidence = updateGate(
        qualityEvidence,
        gate,
        "passed",
        `Satisfied by external CI run ${receipt.payload.runId}.`,
        `attestation:${receipt.payload.subjectSha256}`,
      );
    }
    const next: ImprovementProposal = {
      ...candidate,
      revision: proposal.revision + 1,
      status: releasePolicy.environment.humanApprovalRequired
        ? "pending-approval"
        : "approved",
      qualityEvidence,
      updatedAt: timestamp,
    };
    return this.experiments.repository.commitImprovement(
      next,
      proposal.revision,
      this.decision(
        proposal.id,
        actor,
        "external-evidence.attached",
        {
          repository: receipt.payload.repository,
          sourceCommitSha: receipt.payload.sourceCommitSha,
          subjectSha256: receipt.payload.subjectSha256,
          manifestFingerprint: receipt.payload.manifestFingerprint,
          workflow: receipt.payload.workflow,
          runId: receipt.payload.runId,
          expiresAt: receipt.payload.expiresAt,
        },
        timestamp,
      ),
    );
  }

  private async startCanary(
    proposal: ImprovementProposal,
    actor: ExperimentActor,
  ): Promise<ImprovementProposal> {
    if (proposal.status !== "approved") {
      throw new ExperimentValidationError(
        "Only approved improvements can start a canary",
      );
    }
    if (proposal.changeScope !== "policy") {
      return this.startDeploymentCanary(proposal, actor);
    }
    this.assertAdmin(actor);
    const source = await this.experiments.getRun(proposal.sourceRunId);
    const baselineRun = await this.experiments.mutateRun(
      source.id,
      source.version,
      {
        type: "fork",
        tick: source.run.world.tick,
        name: `${proposal.title} canary baseline`,
      },
      actor,
    );
    let canaryRun = await this.experiments.mutateRun(
      source.id,
      source.version,
      {
        type: "fork",
        tick: source.run.world.tick,
        name: `${proposal.title} canary`,
      },
      actor,
    );
    canaryRun = await this.experiments.queueCommand(
      canaryRun.id,
      canaryRun.version,
      {
        ...proposal.specification.intervention,
        id: `${proposal.specification.intervention.id}-canary`,
        tick: canaryRun.run.world.tick + 1,
        correlationId: `${proposal.specification.intervention.correlationId}-canary`,
      },
      actor,
    );
    const timestamp = this.now().toISOString();
    const startingMetric = getMetric(
      canaryRun.run.world,
      proposal.specification.targetMetric,
    );
    const startingMetrics = selectCityMetrics(canaryRun.run.world);
    const next: ImprovementProposal = {
      ...proposal,
      revision: proposal.revision + 1,
      status: "canary",
      canary: {
        runId: canaryRun.id,
        baselineRunId: baselineRun.id,
        status: "ready",
        startedAt: timestamp,
        startTick: canaryRun.run.world.tick,
        observedTicks: 0,
        observationWindow: 5,
        startingMetric,
        latestMetric: startingMetric,
        rollbackThreshold: 3,
        startingMetrics,
        slo: {
          policy: {
            minimumVerifiedAutonomyLoopRate: 90,
            maximumInvariantViolations: 0,
            maximumWrongDirectionDelta: 3,
            maximumProtectedMetricRegression:
              proposal.specification.maximumRegression,
            requireDeterministicReplay: true,
          },
        },
        alerts: [],
      },
      updatedAt: timestamp,
    };
    return this.experiments.repository.commitImprovement(
      next,
      proposal.revision,
      this.decision(
        proposal.id,
        actor,
        "canary.started",
        {
          canaryRunId: canaryRun.id,
          baselineRunId: baselineRun.id,
          startingMetric,
          observationWindow: 5,
        },
        timestamp,
      ),
    );
  }

  private deploymentAdapterForRelease(): DeploymentAdapter {
    return (
      this.deploymentAdapter ??
      getDeploymentAdapterFromEnvironment()
    );
  }

  private async startDeploymentCanary(
    proposal: ImprovementProposal,
    actor: ExperimentActor,
  ): Promise<ImprovementProposal> {
    assertActorPermission(actor, "deployment:control");
    const releasePolicy = this.releasePolicyFor(proposal);
    if (releasePolicy.environment.externalEvidenceRequired) {
      this.assertValidExternalEvidence(proposal);
    }
    if (!proposal.releaseArtifact) {
      throw new ExperimentValidationError(
        "External release artifact is missing",
      );
    }
    const prerequisite = releasePolicy.environment.prerequisite;
    if (prerequisite) {
      const releases =
        await this.experiments.repository.listImprovements(
          proposal.workspaceId,
        );
      const satisfied = releases.some(
        (candidate) =>
          candidate.id !== proposal.id &&
          candidate.status === "promoted" &&
          candidate.targetEnvironment === prerequisite &&
          candidate.releaseArtifact?.repository ===
            proposal.releaseArtifact?.repository &&
          candidate.releaseArtifact?.commitSha ===
            proposal.releaseArtifact?.commitSha &&
          candidate.deployment?.status === "healthy",
      );
      if (!satisfied) {
        throw new ExperimentPermissionError(
          `${releasePolicy.environment.environment} promotion requires the same artifact to pass ${prerequisite}`,
        );
      }
    }
    const adapter = this.deploymentAdapterForRelease();
    const trafficStages = [
      ...releasePolicy.environment.trafficStages,
    ];
    const handle = await adapter.startCanary({
      workspaceId: proposal.workspaceId,
      proposalId: proposal.id,
      artifact: proposal.releaseArtifact,
      environment: releasePolicy.environment.environment,
      initialTrafficPercent: trafficStages[0],
    });
    const timestamp = this.now().toISOString();
    const next: ImprovementProposal = {
      ...proposal,
      revision: proposal.revision + 1,
      status: "canary",
      deployment: {
        adapterId: adapter.id,
        deploymentId: handle.deploymentId,
        baselineRevision: handle.baselineRevision,
        candidateRevision: handle.candidateRevision,
        environment: releasePolicy.environment.environment,
        policyId: releasePolicy.policyId,
        policyVersion: releasePolicy.version,
        trafficStages,
        status: "monitoring",
        trafficPercent: handle.trafficPercent,
        observationCount: 0,
        observationWindow: Math.max(1, trafficStages.length - 1),
        startedAt: timestamp,
        slo: {
          policy: {
            minimumRequestCount:
              releasePolicy.environment.minimumRequestCount,
            maximumErrorRatePercent:
              releasePolicy.environment.maximumErrorRatePercent,
            maximumP95LatencyMs:
              releasePolicy.environment.maximumP95LatencyMs,
            minimumAvailabilityPercent:
              releasePolicy.environment.minimumAvailabilityPercent,
          },
          samples: [],
        },
        alerts: [],
      },
      updatedAt: timestamp,
    };
    return this.experiments.repository.commitImprovement(
      next,
      proposal.revision,
      this.decision(
        proposal.id,
        actor,
        "canary.started",
        {
          deploymentId: handle.deploymentId,
          adapterId: adapter.id,
          baselineRevision: handle.baselineRevision,
          candidateRevision: handle.candidateRevision,
          trafficPercent: handle.trafficPercent,
          environment: releasePolicy.environment.environment,
          policyId: releasePolicy.policyId,
          policyVersion: releasePolicy.version,
          observationWindow: Math.max(1, trafficStages.length - 1),
        },
        timestamp,
      ),
    );
  }

  private async runRollbackDrill(
    proposal: ImprovementProposal,
    actor: ExperimentActor,
  ): Promise<ImprovementProposal> {
    if (proposal.changeScope !== "policy") {
      return this.runDeploymentRollbackDrill(proposal, actor);
    }
    this.assertAdmin(actor);
    if (proposal.status !== "canary" || !proposal.canary) {
      throw new ExperimentValidationError(
        "Rollback drills require an active canary",
      );
    }
    const canaryRun = await this.experiments.getRun(proposal.canary.runId);
    const faultDelta =
      proposal.specification.direction === "decrease" ? 20 : -20;
    await this.experiments.queueCommand(
      canaryRun.id,
      canaryRun.version,
      {
        id: `rollback-drill-${proposal.id}-${canaryRun.run.world.tick + 1}`,
        tick: canaryRun.run.world.tick + 1,
        actorId: "operator",
        type: "adjust-metric",
        payload: {
          metric: proposal.specification.targetMetric,
          delta: faultDelta,
          reason: `Controlled rollback drill for ${proposal.id}`,
          task: "Inject a bounded canary SLO fault",
        },
        correlationId: `corr-rollback-drill-${proposal.id}`,
        causationId: proposal.id,
        source: "operator",
      },
      actor,
    );
    const timestamp = this.now().toISOString();
    const armed: ImprovementProposal = {
      ...proposal,
      revision: proposal.revision + 1,
      canary: {
        ...proposal.canary,
        status: "monitoring",
      },
      updatedAt: timestamp,
    };
    const committed = await this.experiments.repository.commitImprovement(
      armed,
      proposal.revision,
      this.decision(
        proposal.id,
        actor,
        "rollback.drill.started",
        {
          canaryRunId: canaryRun.id,
          metric: proposal.specification.targetMetric,
          injectedDelta: faultDelta,
          expectedAutomaticAction: "discard-canary",
        },
        timestamp,
      ),
    );
    return this.observeCanary(committed, actor);
  }

  private async runDeploymentRollbackDrill(
    proposal: ImprovementProposal,
    actor: ExperimentActor,
  ): Promise<ImprovementProposal> {
    assertActorPermission(actor, "deployment:control");
    if (proposal.status !== "canary" || !proposal.deployment) {
      throw new ExperimentValidationError(
        "Deployment rollback drills require an active deployment canary",
      );
    }
    const adapter = this.deploymentAdapterForRelease();
    if (!adapter.injectRollbackDrill) {
      throw new ExperimentValidationError(
        "Configured deployment adapter does not support rollback drills",
      );
    }
    await adapter.injectRollbackDrill(proposal.deployment.deploymentId);
    const timestamp = this.now().toISOString();
    const armed: ImprovementProposal = {
      ...proposal,
      revision: proposal.revision + 1,
      updatedAt: timestamp,
    };
    const committed = await this.experiments.repository.commitImprovement(
      armed,
      proposal.revision,
      this.decision(
        proposal.id,
        actor,
        "rollback.drill.started",
        {
          deploymentId: proposal.deployment.deploymentId,
          adapterId: adapter.id,
          expectedAutomaticAction: "platform-rollback",
        },
        timestamp,
      ),
    );
    return this.observeCanary(committed, actor);
  }

  private async evaluateCanarySlo(
    proposal: ImprovementProposal,
    run: ExperimentRun,
    baselineRun: ExperimentRun,
  ): Promise<{
    observation: NonNullable<CanaryState["slo"]["observation"]>;
    alertInputs: Array<{
      code: CanaryState["alerts"][number]["code"];
      message: string;
    }>;
  }> {
    const canary = proposal.canary;
    if (!canary) {
      throw new ExperimentValidationError("Canary state is missing");
    }
    const latestMetrics = selectCityMetrics(run.run.world);
    const baselineMetrics = selectCityMetrics(baselineRun.run.world);
    const latestMetric = getMetric(
      run.run.world,
      proposal.specification.targetMetric,
    );
    const baselineMetric = getMetric(
      baselineRun.run.world,
      proposal.specification.targetMetric,
    );
    const targetDirectionDelta =
      proposal.specification.direction === "decrease"
        ? baselineMetric - latestMetric
        : latestMetric - baselineMetric;
    const protectedRegression = maximumRegression(
      proposal.specification.targetMetric,
      baselineMetrics,
      latestMetrics,
    );
    const report = await this.experiments.report(run.id);
    const alertInputs: Array<{
      code: CanaryState["alerts"][number]["code"];
      message: string;
    }> = [];
    if (
      -targetDirectionDelta >
      canary.slo.policy.maximumWrongDirectionDelta
    ) {
      alertInputs.push({
        code: "wrong-direction",
        message: `Target moved ${(-targetDirectionDelta).toFixed(2)} points in the wrong direction`,
      });
    }
    if (
      protectedRegression >
      canary.slo.policy.maximumProtectedMetricRegression
    ) {
      alertInputs.push({
        code: "protected-regression",
        message: `Protected metric regression ${protectedRegression.toFixed(2)} exceeded ${canary.slo.policy.maximumProtectedMetricRegression.toFixed(2)}`,
      });
    }
    if (
      canary.slo.policy.requireDeterministicReplay &&
      !report.verification.deterministicReplay
    ) {
      alertInputs.push({
        code: "replay-failure",
        message: "Canary deterministic replay verification failed",
      });
    }
    if (
      report.verification.invariantViolations.length >
      canary.slo.policy.maximumInvariantViolations
    ) {
      alertInputs.push({
        code: "invariant-violation",
        message: `${report.verification.invariantViolations.length} invariant violations detected`,
      });
    }
    if (
      report.verification.verifiedAutonomyLoopRate <
      canary.slo.policy.minimumVerifiedAutonomyLoopRate
    ) {
      alertInputs.push({
        code: "verified-loop",
        message: `Verified autonomy loop rate ${report.verification.verifiedAutonomyLoopRate.toFixed(2)}% fell below ${canary.slo.policy.minimumVerifiedAutonomyLoopRate}%`,
      });
    }
    return {
      observation: {
        observedAt: this.now().toISOString(),
        targetDirectionDelta,
        maximumProtectedMetricRegression: protectedRegression,
        verifiedAutonomyLoopRate:
          report.verification.verifiedAutonomyLoopRate,
        deterministicReplay: report.verification.deterministicReplay,
        invariantViolations: report.verification.invariantViolations,
        breaches: alertInputs.map((alert) => alert.message),
      },
      alertInputs,
    };
  }

  private async observeCanary(
    proposal: ImprovementProposal,
    actor: ExperimentActor,
  ): Promise<ImprovementProposal> {
    if (proposal.changeScope !== "policy") {
      return this.observeDeploymentCanary(proposal, actor);
    }
    this.assertAdmin(actor);
    if (proposal.status !== "canary" || !proposal.canary) {
      throw new ExperimentValidationError(
        "Only an active canary can be observed",
      );
    }
    let run = await this.experiments.getRun(proposal.canary.runId);
    let baselineRun: ExperimentRun;
    if (proposal.canary.baselineRunId) {
      baselineRun = await this.experiments.getRun(
        proposal.canary.baselineRunId,
      );
    } else {
      const source = await this.experiments.getRun(proposal.sourceRunId);
      baselineRun = await this.experiments.mutateRun(
        source.id,
        source.version,
        {
          type: "fork",
          tick: proposal.canary.startTick,
          name: `${proposal.title} recovered canary baseline`,
        },
        actor,
      );
      for (
        let index = 0;
        index < proposal.canary.observedTicks;
        index += 1
      ) {
        baselineRun = await this.experiments.mutateRun(
          baselineRun.id,
          baselineRun.version,
          { type: "step" },
          actor,
        );
      }
    }
    let observedTicks = proposal.canary.observedTicks;
    let observation: NonNullable<CanaryState["slo"]["observation"]> | undefined;
    let alertInputs: Array<{
      code: CanaryState["alerts"][number]["code"];
      message: string;
    }> = [];
    for (
      let index = proposal.canary.observedTicks;
      index < proposal.canary.observationWindow;
      index += 1
    ) {
      run = await this.experiments.mutateRun(
        run.id,
        run.version,
        { type: "step" },
        actor,
      );
      baselineRun = await this.experiments.mutateRun(
        baselineRun.id,
        baselineRun.version,
        { type: "step" },
        actor,
      );
      observedTicks = index + 1;
      const evaluated = await this.evaluateCanarySlo(
        proposal,
        run,
        baselineRun,
      );
      observation = evaluated.observation;
      alertInputs = evaluated.alertInputs;
      if (alertInputs.length > 0) {
        break;
      }
    }
    const latestMetric = getMetric(
      run.run.world,
      proposal.specification.targetMetric,
    );
    if (!observation) {
      throw new ExperimentValidationError(
        "Canary observation window produced no SLO samples",
      );
    }
    const rollback = alertInputs.length > 0;
    const timestamp = this.now().toISOString();
    const alerts: CanaryState["alerts"] = alertInputs.map((alert) => ({
      id: `alert-${this.id()}`,
      severity: "critical",
      code: alert.code,
      message: alert.message,
      triggeredAt: timestamp,
      automaticAction: "discard-canary",
    }));
    const qualityEvidence = updateGate(
      proposal.qualityEvidence,
      "deployment-monitoring",
      rollback ? "failed" : "passed",
      rollback
        ? `Automatic rollback triggered by ${alerts.map((alert) => alert.code).join(", ")}.`
        : `${observedTicks} canary ticks met replay, invariant, verified-loop, target-direction, and protected-metric SLOs.`,
      `report:${run.id}`,
    );
    const next: ImprovementProposal = {
      ...proposal,
      revision: proposal.revision + 1,
      status: rollback ? "rolled-back" : "promoted",
      qualityEvidence,
      canary: {
        ...proposal.canary,
        baselineRunId: baselineRun.id,
        status: rollback ? "rollback-triggered" : "healthy",
        observedTicks,
        latestMetric,
        slo: {
          ...proposal.canary.slo,
          observation,
        },
        alerts: [...proposal.canary.alerts, ...alerts],
        rollbackReason: rollback
          ? alerts.map((alert) => alert.message).join("; ")
          : undefined,
      },
      updatedAt: timestamp,
    };
    return this.experiments.repository.commitImprovement(
      next,
      proposal.revision,
      this.decision(
        proposal.id,
        actor,
        rollback ? "rollback.triggered" : "promotion.completed",
        {
          canaryRunId: run.id,
          baselineRunId: baselineRun.id,
          latestMetric,
          observedTicks,
          slo: observation,
          alerts,
          automaticAction: rollback ? "discard-canary" : undefined,
        },
        timestamp,
      ),
    );
  }

  private evaluateDeploymentSlo(
    state: DeploymentReleaseState,
    telemetry: DeploymentTelemetry,
  ): {
    sample: DeploymentReleaseState["slo"]["samples"][number];
    alertInputs: Array<{
      code: DeploymentReleaseState["alerts"][number]["code"];
      message: string;
    }>;
  } {
    const alertInputs: Array<{
      code: DeploymentReleaseState["alerts"][number]["code"];
      message: string;
    }> = [];
    if (
      telemetry.requestCount <
      state.slo.policy.minimumRequestCount
    ) {
      alertInputs.push({
        code: "insufficient-traffic",
        message: `Only ${telemetry.requestCount} requests observed; ${state.slo.policy.minimumRequestCount} required`,
      });
    }
    if (
      telemetry.errorRatePercent >
      state.slo.policy.maximumErrorRatePercent
    ) {
      alertInputs.push({
        code: "error-rate",
        message: `Error rate ${telemetry.errorRatePercent.toFixed(2)}% exceeded ${state.slo.policy.maximumErrorRatePercent.toFixed(2)}%`,
      });
    }
    if (
      telemetry.p95LatencyMs >
      state.slo.policy.maximumP95LatencyMs
    ) {
      alertInputs.push({
        code: "latency",
        message: `p95 latency ${telemetry.p95LatencyMs.toFixed(0)}ms exceeded ${state.slo.policy.maximumP95LatencyMs.toFixed(0)}ms`,
      });
    }
    if (
      telemetry.availabilityPercent <
      state.slo.policy.minimumAvailabilityPercent
    ) {
      alertInputs.push({
        code: "availability",
        message: `Availability ${telemetry.availabilityPercent.toFixed(3)}% fell below ${state.slo.policy.minimumAvailabilityPercent.toFixed(3)}%`,
      });
    }
    if (!telemetry.healthy) {
      alertInputs.push({
        code: "platform-health",
        message: "Deployment platform marked the candidate unhealthy",
      });
    }
    return {
      sample: {
        ...telemetry,
        breaches: alertInputs.map((alert) => alert.message),
      },
      alertInputs,
    };
  }

  private async observeDeploymentCanary(
    proposal: ImprovementProposal,
    actor: ExperimentActor,
  ): Promise<ImprovementProposal> {
    assertActorPermission(actor, "deployment:control");
    if (proposal.status !== "canary" || !proposal.deployment) {
      throw new ExperimentValidationError(
        "Only an active deployment canary can be observed",
      );
    }
    const adapter = this.deploymentAdapterForRelease();
    const telemetry = await adapter.observe(
      proposal.deployment.deploymentId,
    );
    const evaluated = this.evaluateDeploymentSlo(
      proposal.deployment,
      telemetry,
    );
    const timestamp = this.now().toISOString();
    const alerts: DeploymentReleaseState["alerts"] =
      evaluated.alertInputs.map((alert) => ({
        id: `alert-${this.id()}`,
        severity: "critical",
        code: alert.code,
        message: alert.message,
        triggeredAt: timestamp,
        automaticAction: "platform-rollback",
      }));
    const observationCount =
      proposal.deployment.observationCount + 1;
    const rollback = alerts.length > 0;
    const promote =
      !rollback &&
      observationCount >= proposal.deployment.observationWindow;
    let handle;
    if (rollback) {
      handle = await adapter.rollback(
        proposal.deployment.deploymentId,
        alerts.map((alert) => alert.message).join("; "),
      );
    } else if (promote) {
      handle = await adapter.promote(
        proposal.deployment.deploymentId,
      );
    } else {
      handle = await adapter.shiftTraffic(
        proposal.deployment.deploymentId,
        proposal.deployment.trafficStages[
          Math.min(
            observationCount,
            proposal.deployment.trafficStages.length - 1,
          )
        ],
      );
    }
    const telemetryRecordError = await this.recordDeploymentTelemetry(
      proposal,
      telemetry,
      actor,
    );
    const qualityEvidence = updateGate(
      proposal.qualityEvidence,
      "deployment-monitoring",
      rollback ? "failed" : promote ? "passed" : "pending",
      rollback
        ? `Platform rollback triggered by ${alerts.map((alert) => alert.code).join(", ")}.`
        : promote
          ? `${observationCount} deployment samples met all SLOs and reached 100% traffic.`
          : `Deployment sample ${observationCount}/${proposal.deployment.observationWindow} passed; traffic advanced to ${handle.trafficPercent}%.`,
      `deployment:${proposal.deployment.deploymentId}`,
    );
    const next: ImprovementProposal = {
      ...proposal,
      revision: proposal.revision + 1,
      status: rollback
        ? "rolled-back"
        : promote
          ? "promoted"
          : "canary",
      qualityEvidence,
      deployment: {
        ...proposal.deployment,
        status: rollback
          ? "rollback-triggered"
          : promote
            ? "healthy"
            : "monitoring",
        trafficPercent: handle.trafficPercent,
        observationCount,
        slo: {
          ...proposal.deployment.slo,
          samples: [
            ...proposal.deployment.slo.samples,
            evaluated.sample,
          ],
        },
        alerts: [...proposal.deployment.alerts, ...alerts],
        rollbackReason: rollback
          ? alerts.map((alert) => alert.message).join("; ")
          : undefined,
      },
      updatedAt: timestamp,
    };
    return this.experiments.repository.commitImprovement(
      next,
      proposal.revision,
      this.decision(
        proposal.id,
        actor,
        rollback
          ? "rollback.triggered"
          : promote
            ? "promotion.completed"
            : "canary.observed",
        {
          deploymentId: proposal.deployment.deploymentId,
          adapterId: adapter.id,
          trafficPercent: handle.trafficPercent,
          observationCount,
          environment: proposal.deployment.environment,
          policyId: proposal.deployment.policyId,
          policyVersion: proposal.deployment.policyVersion,
          telemetry,
          telemetryRecordError,
          alerts,
          automaticAction: rollback ? "platform-rollback" : undefined,
        },
        timestamp,
      ),
    );
  }

  private async recordDeploymentTelemetry(
    proposal: ImprovementProposal,
    telemetry: DeploymentTelemetry,
    actor: ExperimentActor,
  ): Promise<string | undefined> {
    if (!this.operationalIntelligence || !proposal.deployment) {
      return undefined;
    }
    const policy = proposal.deployment.slo.policy;
    const dimensions = {
      environment: proposal.deployment.environment,
      artifact: proposal.releaseArtifact
        ? `${proposal.releaseArtifact.repository}@${proposal.releaseArtifact.commitSha}`
        : "unknown",
      deploymentId: proposal.deployment.deploymentId,
      adapter: proposal.deployment.adapterId,
      policyId: proposal.deployment.policyId,
      policyVersion: proposal.deployment.policyVersion,
    };
    try {
      await Promise.all([
        this.operationalIntelligence.recordSample(
          {
            source: "deployment",
            metric: "error-rate-percent",
            value: telemetry.errorRatePercent,
            unit: "percent",
            status:
              telemetry.errorRatePercent <=
              policy.maximumErrorRatePercent
                ? "healthy"
                : "breaching",
            dimensions,
            observedAt: telemetry.observedAt,
          },
          actor,
        ),
        this.operationalIntelligence.recordSample(
          {
            source: "deployment",
            metric: "p95-latency-ms",
            value: telemetry.p95LatencyMs,
            unit: "milliseconds",
            status:
              telemetry.p95LatencyMs <= policy.maximumP95LatencyMs
                ? "healthy"
                : "breaching",
            dimensions,
            observedAt: telemetry.observedAt,
          },
          actor,
        ),
        this.operationalIntelligence.recordSample(
          {
            source: "deployment",
            metric: "availability-percent",
            value: telemetry.availabilityPercent,
            unit: "percent",
            status:
              telemetry.availabilityPercent >=
              policy.minimumAvailabilityPercent
                ? "healthy"
                : "breaching",
            dimensions,
            observedAt: telemetry.observedAt,
          },
          actor,
        ),
        this.operationalIntelligence.recordSample(
          {
            source: "deployment",
            metric: "request-count",
            value: telemetry.requestCount,
            unit: "count",
            status:
              telemetry.requestCount >= policy.minimumRequestCount
                ? "healthy"
                : "breaching",
            dimensions,
            observedAt: telemetry.observedAt,
          },
          actor,
        ),
      ]);
      return undefined;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }
}
