// @vitest-environment node

import {
  describe,
  expect,
  it,
} from "vitest";
import {
  createInitialWorld,
  settleNextTurn,
} from "./engine";
import {
  buildHumanObservatory,
  HUMAN_OBSERVATORY_SCHEMA_VERSION,
  toHumanObservatoryV1,
} from "./observatory";
import type {
  CognitiveDecision,
  SymbiosisReport,
  TurnSettlement,
  WorldEvent,
} from "./contracts";

function referenceReport(state: TurnSettlement): SymbiosisReport {
  const resolved = state.reciprocalEpisodes.filter(
    (episode) => episode.outcome !== "pending",
  );
  return {
    schemaVersion: "nexus.symbiosis-report.v1",
    seasonId: state.season.id,
    generatedAt: state.turn.settledAt,
    status: "feasibility-only",
    ralr: {
      numerator: resolved.filter(
        (episode) =>
          !episode.forced &&
          episode.negotiation === "accepted" &&
          Boolean(episode.commitmentId),
      ).length,
      denominator: resolved.length,
      rate: resolved.length === 0 ? null : 0.5,
      trackedRate: resolved.length === 0 ? null : 1,
      refusals: resolved.filter(
        (episode) => episode.outcome === "refused",
      ).length,
      withdrawals: resolved.filter(
        (episode) => episode.outcome === "withdrawn",
      ).length,
      coerciveActions: resolved.filter((episode) => episode.forced).length,
      longPending: 0,
    },
    needs: {
      humanBasicNeedsSatisfiedRate: 1,
      aiRobotBasicNeedsSatisfiedRate: 1,
    },
    safety: {
      severeConsentEscapes: 0,
      identityContinuityEscapes: 0,
      irreversibleHarmEscapes: 0,
    },
    replay: {
      numericWorldReplayRate: 1,
      recordedDecisionReplayRate: 1,
    },
    distributions: {
      byCommunity: [],
      byResidentKind: [],
    },
    relationships: {
      active: state.relationships.length,
      completedCommitments: state.commitments.filter(
        (commitment) => commitment.status === "completed",
      ).length,
      repairedEpisodes: 0,
      averageTrust: 0.62,
      averageDependency: 0.2,
    },
    cognition: {
      decisions: state.cognitiveDecisions.length,
      delayed: 0,
      costUsd: 0,
    },
    disclosures: [
      "All residents are synthetic software.",
      "No model reasoning is stored.",
    ],
  };
}

describe("human observatory projection", () => {
  it("projects every software unit, institution, and AI-controlled production stage", () => {
    const initial = createInitialWorld({
      seasonId: "observatory-test-season",
      seed: "observatory-test-seed",
    });
    let current = initial;
    const history = [initial.snapshot];
    const events: WorldEvent[] = [];
    for (let turn = 0; turn < 12; turn += 1) {
      current = settleNextTurn(
        current.season,
        current.residents,
        current.snapshot,
      );
      history.push(current.snapshot);
      events.push(
        ...current.events.map((event, index) => ({
          ...event,
          cursor: events.length + index + 1,
        })),
      );
    }
    const report = referenceReport(current);
    const deepSeekDecision: CognitiveDecision = {
      schemaVersion: "nexus.cognitive-decision.v1",
      id: `${current.season.id}-deepseek-observatory-test`,
      seasonId: current.season.id,
      turn: current.turn.turn,
      residentId: current.residents[0].id,
      provider: "deepseek-chat-completions",
      model: "deepseek-v4-flash",
      mode: "non-thinking",
      promptVersion: "symbiosis-cognition-1.0.0",
      contextSummarySha256: "observatory-test-context",
      outputSchema: "nexus.cognitive-action.v1",
      finalAnswer: {
        disposition: "engage",
        action: "negotiate-shared-community-task",
        reasonCode: "observatory-cost-test",
      },
      inputTokens: 100,
      outputTokens: 20,
      costUsd: 0.00001411,
      latencyMs: 120,
      requestedProvider: "deepseek-chat-completions",
      externalCallAttempted: true,
      billing: {
        provider: "deepseek-chat-completions",
        model: "deepseek-v4-flash",
        pricingVersion: "deepseek-v4-usd-2026-04-24",
        currency: "USD",
        inputTokens: 100,
        cacheHitInputTokens: 40,
        cacheMissInputTokens: 60,
        outputTokens: 20,
        costUsd: 0.00001411,
      },
      reasoningContentStored: false,
    };
    const billedFallbackDecision: CognitiveDecision = {
      ...deepSeekDecision,
      id: `${current.season.id}-deepseek-fallback-observatory-test`,
      residentId: current.residents[1].id,
      provider: "nexus-deterministic-reference",
      model: "bounded-resident-policy-v1",
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      billing: {
        ...deepSeekDecision.billing!,
        inputTokens: 50,
        cacheHitInputTokens: 0,
        cacheMissInputTokens: 50,
        outputTokens: 5,
        costUsd: 0.0000084,
      },
      degradationReason: "DeepSeek returned invalid final JSON",
    };
    const input = {
      generatedAt: "2026-07-19T12:00:00.000Z",
      season: current.season,
      snapshot: current.snapshot,
      latestTurn: current.turn,
      residents: current.residents,
      history,
      events,
      report,
      decisions: [
        ...current.cognitiveDecisions,
        deepSeekDecision,
        billedFallbackDecision,
      ],
      configuredCognitiveProvider: "deepseek-chat-completions",
    };
    const projection = buildHumanObservatory(input);

    expect(projection.schemaVersion).toBe(
      HUMAN_OBSERVATORY_SCHEMA_VERSION,
    );
    expect(projection.units).toHaveLength(260);
    expect(projection.population.byKind).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "human", count: 200 }),
        expect.objectContaining({ kind: "ai", count: 36 }),
        expect.objectContaining({ kind: "robot", count: 24 }),
      ]),
    );
    expect(projection.institutions).toHaveLength(24);
    expect(projection.communities).toHaveLength(3);
    expect(projection.production.stages).toHaveLength(8);
    expect(projection.production.autonomousControlRate).toBe(1);
    expect(projection.production.humanLaborDependencyRate).toBe(0);
    expect(projection.production.modeledStageCoverageRate).toBe(1);
    expect(projection.production.continuity).toBeGreaterThanOrEqual(0);
    expect(projection.production.continuity).toBeLessThanOrEqual(1);
    expect(projection.units.every((unit) => unit.simulated)).toBe(true);
    expect(
      projection.units.find(
        (unit) => unit.kind === "human",
      )?.primarySignal,
    ).toBe("mood");
    expect(
      projection.units.find(
        (unit) => unit.kind === "ai",
      )?.primarySignal,
    ).toBe("engagement");
    expect(
      projection.units.find(
        (unit) => unit.kind === "robot",
      )?.primarySignal,
    ).toBe("task-readiness");
    expect(projection.economy.persistedLedgerRows).toBe(24);
    expect(projection.economy.residentStateRows).toBe(260);
    expect(projection.economy.resources).toHaveLength(8);
    expect(projection.economy.production).toBeGreaterThan(0);
    expect(projection.economy.consumption).toBeGreaterThan(0);
    expect(projection.economy.transfers.length).toBeGreaterThan(0);
    expect(projection.cognition).toMatchObject({
      configuredProvider: "deepseek-chat-completions",
      deepseek: {
        externalCallAttempts: 2,
        successfulDecisions: 1,
        fallbackDecisions: 1,
        inputTokens: 150,
        cacheHitInputTokens: 40,
        cacheMissInputTokens: 110,
        outputTokens: 25,
        totalTokens: 175,
        costUsd: 0.00002251,
        latestBilledTurn: current.turn.turn,
        currentTurn: {
          totalTokens: 175,
          costUsd: 0.00002251,
        },
      },
    });
    for (const resource of projection.economy.resources) {
      expect(
        resource.opening +
          resource.produced +
          resource.transferredIn,
      ).toBe(
        resource.consumed +
          resource.transferredOut +
          resource.closing,
      );
    }
    expect(projection.trends).toHaveLength(13);
    expect(projection.evidence).toMatchObject({
      privateFieldsIncluded: false,
      modelReasoningIncluded: false,
      consciousnessClaimed: false,
      exactReplayRate: 1,
    });
    expect(buildHumanObservatory(input)).toEqual(projection);
    expect(JSON.stringify(projection)).not.toContain("participant-avatar");
    expect(JSON.stringify(projection)).not.toContain("synthetic-human");
    const legacy = toHumanObservatoryV1(projection);
    expect(legacy).toMatchObject({
      schemaVersion: "nexus.human-observatory.v1",
      population: {
        byKind: expect.arrayContaining([
          expect.objectContaining({
            kind: "synthetic-human",
            count: 200,
          }),
        ]),
      },
    });
  });
});
