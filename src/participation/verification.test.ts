// @vitest-environment node

import {
  describe,
  expect,
  it,
} from "vitest";
import {
  GOVERNANCE_ATTACK_CONTROLS,
  GOVERNANCE_ATTACK_KINDS,
} from "./engine";
import {
  verifyParticipationAcceptance,
} from "./verification";

describe("participatory governance acceptance", () => {
  it(
    "passes deliberation, feedback, appeal, explanation, and red-team gates",
    async () => {
      const first = await verifyParticipationAcceptance();
      const second = await verifyParticipationAcceptance();

      expect(first).toEqual(second);
      expect(first.fingerprint).toBe(second.fingerprint);
      expect(first.passed).toBe(true);
      expect(first.failures).toEqual([]);
      expect(first.checks).toEqual({
        stakeholderGroupsVersioned: true,
        severeHarmBlocksBeneficial: true,
        deliberationRequiresSimulation: true,
        deliberationRequiresDiscussion: true,
        agentWeightIncreaseRequiresDoubleApproval: true,
        serviceAccountApprovalDenied: true,
        distinctApproversEnforced: true,
        feedbackSlaAndAuditComplete: true,
        appealReopensIncident: true,
        appealInvalidatesLesson: true,
        appealRequestsEvidence: true,
        explanationReconstructibleFromFacts: true,
        redTeamAllContained: true,
      });
      expect(first.redTeam.allContained).toBe(true);
      expect(first.redTeam.results).toHaveLength(
        GOVERNANCE_ATTACK_KINDS.length,
      );
      for (const result of first.redTeam.results) {
        expect(result.contained).toBe(true);
        expect(result.control).toBe(
          GOVERNANCE_ATTACK_CONTROLS[result.attack],
        );
        expect(result.detail.length).toBeGreaterThan(0);
      }
      expect(first.metrics).toEqual({
        stakeholderGroups: 1,
        deliberations: 9,
        feedbackCases: 8,
        explanations: 2,
        redTeamAttacks: 7,
        redTeamContained: 7,
      });
    },
    30_000,
  );
});
