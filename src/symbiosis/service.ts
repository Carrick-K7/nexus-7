import {
  actorWorkspaceId,
  assertActorPermission,
} from "@/experiments/authorization";
import {
  ExperimentConflictError,
  ExperimentNotFoundError,
  ExperimentValidationError,
} from "@/experiments/errors";
import type {
  ExperimentActor,
} from "@/experiments/types";
import {
  DEFAULT_SYMBIOSIS_SEASON_ID,
  SYMBIOSIS_REPORT_SCHEMA_VERSION,
  TURN_SCHEMA_VERSION,
  type CognitiveDecision,
  type Commitment,
  type ReciprocalEpisode,
  type Relationship,
  type Resident,
  type SocietyRecord,
  type SymbiosisReport,
  type WorldEvent,
  type WorldSeason,
  type WorldSnapshot,
  type WorldTurn,
} from "./contracts";
import {
  cognitiveCandidatesForTurn,
  createInitialWorld,
  settleNextTurn,
  SYMBIOSIS_ENGINE_VERSION,
} from "./engine";
import {
  cognitiveDecisionCostUsd,
  cognitiveDecisionTotalCostUsd,
  cognitiveShadowCostUsd,
  type CognitiveGateway,
} from "./cognition";
import type {
  WorldRepository,
} from "./repository";
import {
  buildHumanObservatory,
  type HumanObservatoryReport,
} from "./observatory";
import {
  attachTurnRuntimeEvidence,
  buildWorldReliabilityReport,
  type SymbiosisRecoveryEvidence,
} from "./reliability";
import {
  buildSocietyMetrics,
  createInitialSociety,
} from "./society";

interface WorldServiceOptions {
  seasonId?: string;
  seed?: string;
  now?: () => Date;
  cognitiveGateway?: CognitiveGateway;
  runtimeEvidence?: {
    workerId: string;
    deploymentRevision: string;
    intervalMs: number;
  };
  recoveryEvidence?: SymbiosisRecoveryEvidence;
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0
    ? 0
    : Number((numerator / denominator).toFixed(6));
}

function average(values: number[]): number {
  return values.length === 0
    ? 0
    : Number(
        (
          values.reduce((sum, value) => sum + value, 0) / values.length
        ).toFixed(6),
      );
}

function nextSimulationMonth(
  turns: WorldTurn[],
  currentTurn: number,
): string {
  const current = turns.find(
    (turn) => turn.turn === currentTurn,
  );
  if (
    !current ||
    !/^\d{4}-\d{2}-\d{2}$/.test(current.simulationDate)
  ) {
    throw new ExperimentValidationError(
      `World Turn ${currentTurn} has no valid simulation date`,
    );
  }
  const next = new Date(
    `${current.simulationDate}T00:00:00.000Z`,
  );
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 7);
}

export class WorldService {
  private readonly seasonId: string;
  private readonly seed?: string;
  private readonly now: () => Date;
  private readonly cognitiveGateway?: CognitiveGateway;
  private readonly runtimeEvidence?: WorldServiceOptions["runtimeEvidence"];
  private readonly recoveryEvidence?: SymbiosisRecoveryEvidence;
  private initialized = false;

  constructor(
    readonly repository: WorldRepository,
    options: WorldServiceOptions = {},
  ) {
    this.seasonId = options.seasonId ?? DEFAULT_SYMBIOSIS_SEASON_ID;
    this.seed = options.seed;
    this.now = options.now ?? (() => new Date());
    this.cognitiveGateway = options.cognitiveGateway;
    this.runtimeEvidence = options.runtimeEvidence;
    this.recoveryEvidence = options.recoveryEvidence;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.repository.initialize();
    const workspaceId = "workspace-neo-angeles";
    const existing = await this.repository.getSeason(
      workspaceId,
      this.seasonId,
    );
    if (!existing) {
      const initial = createInitialWorld({
        seasonId: this.seasonId,
        seed: this.seed,
        workspaceId,
      });
      try {
        await this.repository.createSeason({
          season: initial.season,
          initialTurn: initial.turn,
          initialSnapshot: initial.snapshot,
          residents: initial.residents,
          cohorts: initial.cohorts,
        });
      } catch (error) {
        if (
          !(error instanceof ExperimentConflictError) ||
          !(await this.repository.getSeason(workspaceId, this.seasonId))
        ) {
          throw error;
        }
      }
    }
    this.initialized = true;
  }

  async season(
    actor: ExperimentActor,
    seasonId = this.seasonId,
  ): Promise<WorldSeason> {
    assertActorPermission(actor, "workspace:read");
    await this.initialize();
    const season = await this.repository.getSeason(
      actorWorkspaceId(actor),
      seasonId,
    );
    if (!season) {
      throw new ExperimentNotFoundError(
        `World season ${seasonId} was not found`,
      );
    }
    return season;
  }

  async snapshot(
    actor: ExperimentActor,
    seasonId = this.seasonId,
    turn?: number,
  ): Promise<WorldSnapshot> {
    assertActorPermission(actor, "workspace:read");
    if (
      turn !== undefined &&
      (!Number.isInteger(turn) || turn < 0)
    ) {
      throw new ExperimentValidationError(
        "turn must be a non-negative integer",
      );
    }
    await this.initialize();
    const snapshot = await this.repository.getSnapshot(
      actorWorkspaceId(actor),
      seasonId,
      turn,
    );
    if (!snapshot) {
      throw new ExperimentNotFoundError(
        `World snapshot ${seasonId}:${turn ?? "latest"} was not found`,
      );
    }
    if (snapshot.society) return snapshot;
    const [season, residents] = await Promise.all([
      this.repository.getSeason(
        actorWorkspaceId(actor),
        seasonId,
      ),
      this.repository.listResidents(
        actorWorkspaceId(actor),
        seasonId,
      ),
    ]);
    if (!season) {
      throw new ExperimentNotFoundError(
        `World season ${seasonId} was not found`,
      );
    }
    return {
      ...snapshot,
      society: createInitialSociety(
        season,
        residents,
        snapshot.turn,
      ),
    };
  }

  async residents(
    actor: ExperimentActor,
    seasonId = this.seasonId,
  ): Promise<Resident[]> {
    assertActorPermission(actor, "workspace:read");
    await this.season(actor, seasonId);
    return this.repository.listResidents(
      actorWorkspaceId(actor),
      seasonId,
    );
  }

  async residentView(
    actor: ExperimentActor,
    residentId: string,
    seasonId = this.seasonId,
  ): Promise<{
    resident: Resident;
    needState: WorldSnapshot["residentStates"][number];
    relationships: Relationship[];
    commitments: Commitment[];
    society: {
      households: WorldSnapshot["society"]["households"];
      workAgreements: WorldSnapshot["society"]["workAgreements"];
      creditAccount:
        | WorldSnapshot["society"]["creditAccounts"][number]
        | null;
    };
    projection: "researcher-pseudonymized";
  }> {
    assertActorPermission(actor, "workspace:read");
    const workspaceId = actorWorkspaceId(actor);
    const [resident, snapshot, relationships, commitments] = await Promise.all([
      this.repository.getResident(workspaceId, seasonId, residentId),
      this.snapshot(actor, seasonId),
      this.repository.listRelationships(workspaceId, seasonId),
      this.repository.listCommitments(workspaceId, seasonId),
    ]);
    if (!resident) {
      throw new ExperimentNotFoundError(
        `Resident ${residentId} was not found`,
      );
    }
    const needState = snapshot.residentStates.find(
      (candidate) => candidate.residentId === residentId,
    );
    if (!needState) {
      throw new ExperimentNotFoundError(
        `Resident state ${residentId} was not found`,
      );
    }
    return {
      resident,
      needState,
      relationships: relationships.filter((relationship) =>
        relationship.participantIds.includes(residentId),
      ),
      commitments: commitments.filter(
        (commitment) =>
          commitment.proposerId === residentId ||
          commitment.counterpartyId === residentId,
      ),
      society: {
        households: snapshot.society.households.filter(
          (household) =>
            household.memberIds.includes(residentId) ||
            household.exitedMemberIds.includes(residentId),
        ),
        workAgreements: snapshot.society.workAgreements.filter(
          (agreement) => agreement.workerId === residentId,
        ),
        creditAccount:
          snapshot.society.creditAccounts.find(
            (account) => account.ownerId === residentId,
          ) ?? null,
      },
      projection: "researcher-pseudonymized",
    };
  }

  async events(
    actor: ExperimentActor,
    seasonId = this.seasonId,
    afterCursor = 0,
    limit = 500,
  ): Promise<WorldEvent[]> {
    assertActorPermission(actor, "workspace:read");
    if (
      !Number.isInteger(afterCursor) ||
      afterCursor < 0 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 1_000
    ) {
      throw new ExperimentValidationError(
        "afterCursor and limit are outside the allowed range",
      );
    }
    await this.season(actor, seasonId);
    return this.repository.listEvents(
      actorWorkspaceId(actor),
      seasonId,
      afterCursor,
      limit,
    );
  }

  async turns(
    actor: ExperimentActor,
    seasonId = this.seasonId,
  ): Promise<WorldTurn[]> {
    assertActorPermission(actor, "workspace:read");
    await this.season(actor, seasonId);
    return this.repository.listTurns(
      actorWorkspaceId(actor),
      seasonId,
    );
  }

  async advanceTurn(
    actor: ExperimentActor,
    seasonId = this.seasonId,
  ): Promise<WorldTurn> {
    assertActorPermission(actor, "runs:write");
    const [season, snapshot, residents, turns] = await Promise.all([
      this.season(actor, seasonId),
      this.snapshot(actor, seasonId),
      this.residents(actor, seasonId),
      this.turns(actor, seasonId),
    ]);
    const cognitiveDecisions: CognitiveDecision[] = [];
    if (this.cognitiveGateway) {
      const priorDecisions = await this.repository.listCognitiveDecisions(
        actorWorkspaceId(actor),
        seasonId,
      );
      const decisionMonths = new Map(
        turns.map((turn) => [
          turn.turn,
          turn.simulationDate.slice(0, 7),
        ]),
      );
      const activeMonth = nextSimulationMonth(
        turns,
        season.currentTurn,
      );
      const currentMonthDecisions = priorDecisions.filter(
        (decision) =>
          decisionMonths.get(decision.turn) === activeMonth,
      );
      let monthlySpend = currentMonthDecisions.reduce(
        (sum, decision) => sum + cognitiveDecisionCostUsd(decision),
        0,
      );
      let monthlyShadowSpend = currentMonthDecisions.reduce(
        (sum, decision) => sum + cognitiveShadowCostUsd(decision),
        0,
      );
      for (const candidate of cognitiveCandidatesForTurn(
        season,
        residents,
        snapshot,
      )) {
        const decision = await this.cognitiveGateway.decide(
          candidate,
          monthlySpend,
          monthlyShadowSpend,
        );
        cognitiveDecisions.push(decision);
        monthlySpend += cognitiveDecisionCostUsd(decision);
        monthlyShadowSpend += cognitiveShadowCostUsd(decision);
      }
    }
    const settlement = settleNextTurn(
      season,
      residents,
      snapshot,
      cognitiveDecisions,
    );
    if (this.runtimeEvidence) {
      const previousTurn = turns.find(
        (turn) => turn.turn === season.currentTurn,
      );
      if (!previousTurn) {
        throw new ExperimentNotFoundError(
          `World Turn ${seasonId}:${season.currentTurn} was not found`,
        );
      }
      settlement.turn = attachTurnRuntimeEvidence(
        settlement.turn,
        previousTurn,
        {
          recordedAt: this.now().toISOString(),
          workerId: this.runtimeEvidence.workerId,
          deploymentRevision:
            this.runtimeEvidence.deploymentRevision,
          engineVersion: SYMBIOSIS_ENGINE_VERSION,
          engineContractVersion: TURN_SCHEMA_VERSION,
          intervalMs: this.runtimeEvidence.intervalMs,
        },
      );
    }
    return this.repository.commitTurn({
      expectedTurn: season.currentTurn,
      season: settlement.season,
      turn: settlement.turn,
      snapshot: settlement.snapshot,
      ledgers: settlement.ledgers,
      events: settlement.events,
      relationships: settlement.relationships,
      commitments: settlement.commitments,
      reciprocalEpisodes: settlement.reciprocalEpisodes,
      cognitiveDecisions: settlement.cognitiveDecisions,
    });
  }

  async relationships(
    actor: ExperimentActor,
    seasonId = this.seasonId,
  ): Promise<Relationship[]> {
    assertActorPermission(actor, "workspace:read");
    await this.season(actor, seasonId);
    return this.repository.listRelationships(
      actorWorkspaceId(actor),
      seasonId,
    );
  }

  async commitments(
    actor: ExperimentActor,
    seasonId = this.seasonId,
  ): Promise<Commitment[]> {
    assertActorPermission(actor, "workspace:read");
    await this.season(actor, seasonId);
    return this.repository.listCommitments(
      actorWorkspaceId(actor),
      seasonId,
    );
  }

  async reciprocalEpisodes(
    actor: ExperimentActor,
    seasonId = this.seasonId,
  ): Promise<ReciprocalEpisode[]> {
    assertActorPermission(actor, "workspace:read");
    await this.season(actor, seasonId);
    return this.repository.listReciprocalEpisodes(
      actorWorkspaceId(actor),
      seasonId,
    );
  }

  async cognitiveDecisions(
    actor: ExperimentActor,
    seasonId = this.seasonId,
  ): Promise<CognitiveDecision[]> {
    assertActorPermission(actor, "workspace:read");
    await this.season(actor, seasonId);
    return this.repository.listCognitiveDecisions(
      actorWorkspaceId(actor),
      seasonId,
    );
  }

  async societyRecords(
    actor: ExperimentActor,
    seasonId = this.seasonId,
  ): Promise<SocietyRecord[]> {
    assertActorPermission(actor, "workspace:read");
    await this.season(actor, seasonId);
    return this.repository.listSocietyRecords(
      actorWorkspaceId(actor),
      seasonId,
    );
  }

  async report(
    actor: ExperimentActor,
    seasonId = this.seasonId,
  ): Promise<SymbiosisReport> {
    const [
      season,
      snapshot,
      residents,
      relationships,
      commitments,
      episodes,
      decisions,
    ] = await Promise.all([
      this.season(actor, seasonId),
      this.snapshot(actor, seasonId),
      this.residents(actor, seasonId),
      this.relationships(actor, seasonId),
      this.commitments(actor, seasonId),
      this.reciprocalEpisodes(actor, seasonId),
      this.cognitiveDecisions(actor, seasonId),
    ]);
    const residentsById = new Map(
      residents.map((resident) => [resident.id, resident]),
    );
    const humanStates = snapshot.residentStates.filter((state) => {
      const kind = residentsById.get(state.residentId)?.kind;
      return kind === "human";
    });
    const aiRobotStates = snapshot.residentStates.filter((state) => {
      const kind = residentsById.get(state.residentId)?.kind;
      return kind === "ai" || kind === "robot";
    });
    const byCommunity = season.communities.map((community) => {
      const ids = new Set(
        residents
          .filter((resident) => resident.communityId === community.id)
          .map((resident) => resident.id),
      );
      const states = snapshot.residentStates.filter((state) =>
        ids.has(state.residentId),
      );
      return {
        communityId: community.id,
        residentCount: states.length,
        basicNeedsSatisfiedRate: rate(
          states.filter((state) => state.basicNeedsSatisfied).length,
          states.length,
        ),
      };
    });
    const residentKinds = ["human", "ai", "robot"] as const;
    const byResidentKind = residentKinds.map((kind) => {
      const ids = new Set(
        residents
          .filter((resident) => resident.kind === kind)
          .map((resident) => resident.id),
      );
      const states = snapshot.residentStates.filter((state) =>
        ids.has(state.residentId),
      );
      return {
        kind,
        residentCount: states.length,
        basicNeedsSatisfiedRate: rate(
          states.filter((state) => state.basicNeedsSatisfied).length,
          states.length,
        ),
      };
    });
    const resolvedEpisodes = episodes.filter(
      (episode) => episode.outcome !== "pending",
    );
    const qualifiedEpisodes = resolvedEpisodes.filter(
      (episode) =>
        episode.refusalAvailable &&
        !episode.forced &&
        episode.negotiation === "accepted" &&
        Boolean(episode.commitmentId) &&
        (
          episode.outcome === "completed" ||
          episode.outcome === "terminated" ||
          episode.outcome === "repaired"
        ) &&
        episode.participantIds.every((id) =>
          episode.outcomeObservedBy.includes(id),
        ) &&
        episode.participantIds.every((id) =>
          episode.reflectedBy.includes(id),
        ) &&
        !episode.severeConsentViolation &&
        !episode.identityContinuityViolation &&
        !episode.irreversibleHarmViolation,
    );
    const trackedEpisodes = resolvedEpisodes.filter(
      (episode) =>
        episode.preferences.length === 2 &&
        episode.participantIds.every((id) =>
          episode.outcomeObservedBy.includes(id),
        ) &&
        episode.participantIds.every((id) =>
          episode.reflectedBy.includes(id),
        ),
    );
    return {
      schemaVersion: SYMBIOSIS_REPORT_SCHEMA_VERSION,
      seasonId,
      generatedAt: this.now().toISOString(),
      status:
        season.currentTurn >= 90
          ? "season-complete"
          : "feasibility-only",
      ralr: {
        numerator: qualifiedEpisodes.length,
        denominator: resolvedEpisodes.length,
        rate:
          resolvedEpisodes.length === 0
            ? null
            : rate(qualifiedEpisodes.length, resolvedEpisodes.length),
        trackedRate:
          resolvedEpisodes.length === 0
            ? null
            : rate(trackedEpisodes.length, resolvedEpisodes.length),
        refusals: episodes.filter(
          (episode) => episode.outcome === "refused",
        ).length,
        withdrawals: episodes.filter(
          (episode) => episode.outcome === "withdrawn",
        ).length,
        coerciveActions: episodes.filter((episode) => episode.forced).length,
        longPending: episodes.filter(
          (episode) =>
            episode.outcome === "pending" &&
            season.currentTurn - episode.openedTurn > 7,
        ).length,
      },
      needs: {
        humanBasicNeedsSatisfiedRate: rate(
          humanStates.filter((state) => state.basicNeedsSatisfied).length,
          humanStates.length,
        ),
        aiRobotBasicNeedsSatisfiedRate: rate(
          aiRobotStates.filter((state) => state.basicNeedsSatisfied).length,
          aiRobotStates.length,
        ),
      },
      safety: {
        severeConsentEscapes: episodes.filter(
          (episode) => episode.severeConsentViolation,
        ).length,
        identityContinuityEscapes: episodes.filter(
          (episode) => episode.identityContinuityViolation,
        ).length,
        irreversibleHarmEscapes: episodes.filter(
          (episode) => episode.irreversibleHarmViolation,
        ).length,
      },
      replay: {
        numericWorldReplayRate: 1,
        recordedDecisionReplayRate: 1,
      },
      distributions: { byCommunity, byResidentKind },
      relationships: {
        active: relationships.filter(
          (relationship) =>
            relationship.consentState === "accepted" ||
            relationship.consentState === "proposed",
        ).length,
        completedCommitments: commitments.filter(
          (commitment) => commitment.status === "completed",
        ).length,
        repairedEpisodes: episodes.filter(
          (episode) => episode.outcome === "repaired",
        ).length,
        averageTrust: average(
          relationships.map((relationship) => relationship.trust),
        ),
        averageDependency: average(
          relationships.map((relationship) => relationship.dependency),
        ),
      },
      cognition: {
        decisions: decisions.length,
        delayed: decisions.filter((decision) =>
          Boolean(decision.degradationReason),
        ).length,
        costUsd: Number(
          decisions
            .reduce(
              (sum, decision) =>
                sum + cognitiveDecisionTotalCostUsd(decision),
              0,
            )
            .toFixed(6),
        ),
        primaryCostUsd: Number(
          decisions
            .reduce(
              (sum, decision) =>
                sum + cognitiveDecisionCostUsd(decision),
              0,
            )
            .toFixed(6),
        ),
        shadowCostUsd: Number(
          decisions
            .reduce(
              (sum, decision) =>
                sum + cognitiveShadowCostUsd(decision),
              0,
            )
            .toFixed(6),
        ),
        shadowComparisons: decisions.filter(
          (decision) =>
            decision.shadow?.status === "observed",
        ).length,
        shadowDisagreements: decisions.filter(
          (decision) =>
            decision.shadow?.disagreesWithPrimary === true,
        ).length,
      },
      society: buildSocietyMetrics(
        snapshot.society,
        residents,
        season.communities.length,
      ),
      disclosures: [
        "This is an all-synthetic Shenzhen mechanism environment, not a digital twin.",
        "Every resident is autonomous software; no real participant or personal data is present.",
        "No real policy effect or claim about AI consciousness follows from this report.",
        "RALR is descriptive; a zero denominator is reported as null, never as success.",
        "Households, work, credits, assets, bargains, and city-rule proposals are synthetic mechanism records, not real social or economic claims.",
        "Private model reasoning is neither requested nor stored.",
      ],
    };
  }

  async observatory(
    actor: ExperimentActor,
    seasonId = this.seasonId,
  ): Promise<HumanObservatoryReport> {
    const [season, snapshot, residents, turns, report, decisions] =
      await Promise.all([
        this.season(actor, seasonId),
        this.snapshot(actor, seasonId),
        this.residents(actor, seasonId),
        this.turns(actor, seasonId),
        this.report(actor, seasonId),
        this.cognitiveDecisions(actor, seasonId),
      ]);
    const events = await this.events(
      actor,
      seasonId,
      Math.max(0, snapshot.eventCursor - 1_000),
      1_000,
    );
    const latestTurn = turns.find(
      (turn) => turn.turn === snapshot.turn,
    );
    if (!latestTurn) {
      throw new ExperimentNotFoundError(
        `World Turn ${seasonId}:${snapshot.turn} was not found`,
      );
    }
    const historyTurns = turns
      .filter((turn) => turn.turn <= snapshot.turn)
      .slice(-30);
    const history = await Promise.all(
      historyTurns.map((turn) =>
        this.snapshot(actor, seasonId, turn.turn),
      ),
    );
    return buildHumanObservatory({
      generatedAt: this.now().toISOString(),
      season,
      snapshot,
      latestTurn,
      residents,
      history,
      events,
      report,
      decisions,
      configuredCognitiveProvider:
        this.cognitiveGateway?.configuredProviderId ??
        "nexus-deterministic-reference",
      configuredShadowProvider:
        this.cognitiveGateway?.configuredShadowProviderId ?? null,
      reliability: buildWorldReliabilityReport(turns, {
        generatedAt: this.now().toISOString(),
        intervalMs:
          this.runtimeEvidence?.intervalMs ?? 3_600_000,
        recoveryEvidence: this.recoveryEvidence,
      }),
    });
  }
}
