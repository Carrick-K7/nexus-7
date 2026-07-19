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
  type CognitiveDecision,
  type Commitment,
  type ReciprocalEpisode,
  type Relationship,
  type Resident,
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
} from "./engine";
import type {
  CognitiveGateway,
} from "./cognition";
import type {
  WorldRepository,
} from "./repository";

interface WorldServiceOptions {
  seasonId?: string;
  seed?: string;
  now?: () => Date;
  cognitiveGateway?: CognitiveGateway;
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

export class WorldService {
  private readonly seasonId: string;
  private readonly seed?: string;
  private readonly now: () => Date;
  private readonly cognitiveGateway?: CognitiveGateway;
  private initialized = false;

  constructor(
    readonly repository: WorldRepository,
    options: WorldServiceOptions = {},
  ) {
    this.seasonId = options.seasonId ?? DEFAULT_SYMBIOSIS_SEASON_ID;
    this.seed = options.seed;
    this.now = options.now ?? (() => new Date());
    this.cognitiveGateway = options.cognitiveGateway;
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
    return snapshot;
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
    projection: "researcher-pseudonymized";
    privateMemoryIncluded: false;
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
      projection: "researcher-pseudonymized",
      privateMemoryIncluded: false,
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
    const [season, snapshot, residents] = await Promise.all([
      this.season(actor, seasonId),
      this.snapshot(actor, seasonId),
      this.residents(actor, seasonId),
    ]);
    const cognitiveDecisions: CognitiveDecision[] = [];
    if (this.cognitiveGateway) {
      const priorDecisions = await this.repository.listCognitiveDecisions(
        actorWorkspaceId(actor),
        seasonId,
      );
      let monthlySpend = priorDecisions.reduce(
        (sum, decision) => sum + decision.costUsd,
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
        );
        cognitiveDecisions.push(decision);
        monthlySpend += decision.costUsd;
      }
    }
    const settlement = settleNextTurn(
      season,
      residents,
      snapshot,
      cognitiveDecisions,
    );
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
      return kind === "synthetic-human";
    });
    const aiRobotStates = snapshot.residentStates.filter((state) => {
      const kind = residentsById.get(state.residentId)?.kind;
      return kind === "software-ai" || kind === "embodied-robot";
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
    const residentKinds = [
      "synthetic-human",
      "software-ai",
      "embodied-robot",
    ] as const;
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
            .reduce((sum, decision) => sum + decision.costUsd, 0)
            .toFixed(6),
        ),
      },
      disclosures: [
        "This is an all-synthetic Shenzhen mechanism environment, not a digital twin.",
        "Every resident is autonomous software; no real participant or personal data is present.",
        "No real policy effect or claim about AI consciousness follows from this report.",
        "RALR is descriptive; a zero denominator is reported as null, never as success.",
        "Private model reasoning is neither requested nor stored.",
      ],
    };
  }
}
