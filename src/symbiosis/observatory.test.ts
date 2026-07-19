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
    const input = {
      generatedAt: "2026-07-19T12:00:00.000Z",
      season: current.season,
      snapshot: current.snapshot,
      latestTurn: current.turn,
      residents: current.residents,
      history,
      events,
      report,
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
