// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { SyntheticStakeholderImpact } from "@/city/types";
import {
  projectCoherentCitySnapshot,
} from "@/city/ontology";
import {
  PUBLIC_CITY_SCENARIOS,
  materializeCityScenario,
} from "@/city/scenarios";
import { ExperimentValidationError } from "@/experiments/errors";
import {
  GOVERNANCE_ATTACK_CONTROLS,
  GOVERNANCE_ATTACK_KINDS,
  SYNTHETIC_BOUNDARY_STATEMENT,
  applyDeliberationDecision,
  assessStakeholderImpacts,
  assertDeliberationDecision,
  assertDeliberationTransition,
  assertFeedbackTransition,
  buildFeedbackResolution,
  buildPublicExplanation,
  buildStakeholderGroup,
  createFeedbackCase,
  createGoalDeliberation,
  fingerprintFeedbackCase,
  fingerprintGoalDeliberation,
  fingerprintPublicExplanation,
  fingerprintStakeholderGroup,
  isFeedbackSlaBreached,
  markDeliberationApplied,
  renderExplanationLines,
  requiredDeliberationApprovals,
  simulateObjectiveChangeImpacts,
  validateStakeholderGroupInput,
  verifyPublicExplanationFingerprint,
  type BuildPublicExplanationInput,
  type CreateFeedbackCaseInput,
  type CreateGoalDeliberationInput,
  type StakeholderGroupInput,
} from "./engine";
import type {
  DeliberationApproval,
  DeliberationStatus,
  FeedbackKind,
  FeedbackStatus,
  GoalDeliberation,
  ObjectiveChangeProposal,
  PublicExplanation,
  StakeholderGroup,
} from "./types";

const NOW = "2026-07-18T14:00:00.000Z";
const DECIDED_AT = "2026-07-18T16:00:00.000Z";

function expectInvalid(run: () => unknown, code: string): void {
  expect(run).toThrowError(ExperimentValidationError);
  expect(run).toThrowError(new RegExp(`^${code}: `));
}

function groupInput(
  overrides: Partial<StakeholderGroupInput> = {},
): StakeholderGroupInput {
  return {
    id: "group-north-tenants",
    name: "North District Tenants",
    districtId: "district-north",
    incomeBand: "low",
    serviceAccess: 62,
    vulnerability: "elevated",
    populationSharePercent: 40,
    weight: 2,
    protectedMetrics: ["energy"],
    severeBurdenThreshold: 5,
    version: "1.0.0",
    effectiveAt: NOW,
    ...overrides,
  };
}

function impact(
  groupId: string,
  burden: number,
  share = 40,
): SyntheticStakeholderImpact {
  return {
    groupId,
    districtId: "district-north",
    incomeBand: "low",
    vulnerability: "elevated",
    populationSharePercent: share,
    serviceAccess: 62,
    burden,
    synthetic: true,
  };
}

function proposal(weight: number): ObjectiveChangeProposal {
  return {
    metric: "energy",
    direction: "increase",
    target: 80,
    weight,
    scope: "city",
    owner: "admin-1",
  };
}

function deliberationInput(
  overrides: Partial<CreateGoalDeliberationInput> = {},
): CreateGoalDeliberationInput {
  return {
    id: "delib-1",
    correlationId: "corr-1",
    baseObjectiveVersion: "objective-v1",
    baseWeight: 0.2,
    proposal: proposal(0.5),
    proposedBy: "admin-1",
    proposerPrincipal: "human",
    createdAt: NOW,
    ...overrides,
  };
}

function simulatedDeliberation(
  overrides: Partial<GoalDeliberation> = {},
): GoalDeliberation {
  const base = createGoalDeliberation(deliberationInput());
  const record: GoalDeliberation = {
    ...base,
    status: "simulated",
    statements: [
      {
        id: "stmt-1",
        actorId: "admin-1",
        stance: "support",
        text: "Sound tradeoff.",
        submittedAt: NOW,
      },
      {
        id: "stmt-2",
        actorId: "admin-2",
        stance: "oppose",
        text: "Hurts north tenants.",
        submittedAt: NOW,
      },
    ],
    simulation: {
      sourceWorldFingerprint: "world-fingerprint",
      impacts: [],
      severeHarmGroupIds: [],
      simulatedAt: NOW,
    },
    ...overrides,
  };
  return { ...record, fingerprint: fingerprintGoalDeliberation(record) };
}

function approval(actorId: string): DeliberationApproval {
  return { actorId, role: "admin", approvedAt: NOW, note: "reviewed" };
}

function feedbackInput(
  overrides: Partial<CreateFeedbackCaseInput> = {},
): CreateFeedbackCaseInput {
  return {
    id: "feedback-1",
    correlationId: "corr-1",
    kind: "appeal",
    target: { kind: "incident", id: "inc-1" },
    summary: "Outcome regressed after rollout.",
    submittedBy: "resident-1",
    submitterPrincipal: "human",
    createdAt: NOW,
    ...overrides,
  };
}

function explanationInput(
  overrides: Partial<BuildPublicExplanationInput> = {},
): BuildPublicExplanationInput {
  return {
    id: "expl-1",
    correlationId: "corr-1",
    subject: { kind: "decision", id: "delib-1" },
    facts: [
      { code: "target-delta", subject: "energy", value: 8, unit: "points" },
      { code: "cost", subject: "public-budget", value: 55 },
    ],
    options: [
      { optionId: "option-a", selected: true, rejectionCodes: [] },
      { optionId: "option-b", selected: false, rejectionCodes: ["higher-cost"] },
    ],
    tradeoffCodes: ["budget-vs-service"],
    authorization: {
      approverIds: ["admin-2", "admin-1"],
      policyVersion: "policy-1.0",
      evidenceRefs: ["evidence-1"],
    },
    uncertaintyCodes: ["model-drift"],
    createdAt: NOW,
    ...overrides,
  };
}

describe("stakeholder groups", () => {
  it("builds an active synthetic group from validated input", () => {
    const group = buildStakeholderGroup(groupInput());

    expect(group).toMatchObject({
      schemaVersion: "nexus.stakeholder-group.v1",
      status: "active",
      synthetic: true,
      id: "group-north-tenants",
      version: "1.0.0",
    });
    expect(validateStakeholderGroupInput(groupInput())).toBeUndefined();
  });

  it("rejects invalid group fields with stable machine codes", () => {
    const cases: [Partial<StakeholderGroupInput>, string][] = [
      [{ id: "" }, "invalid-group-id"],
      [{ id: "x".repeat(121) }, "invalid-group-id"],
      [{ name: "" }, "invalid-group-name"],
      [{ name: "x".repeat(121) }, "invalid-group-name"],
      [{ incomeBand: "wealthy" as never }, "invalid-group-income-band"],
      [{ vulnerability: "critical" as never }, "invalid-group-vulnerability"],
      [{ serviceAccess: -1 }, "invalid-service-access"],
      [{ serviceAccess: 101 }, "invalid-service-access"],
      [{ serviceAccess: Number.NaN }, "invalid-service-access"],
      [{ populationSharePercent: 0 }, "invalid-population-share"],
      [{ populationSharePercent: 100.5 }, "invalid-population-share"],
      [{ weight: -0.1 }, "invalid-group-weight"],
      [{ weight: 10.5 }, "invalid-group-weight"],
      [{ protectedMetrics: [] }, "invalid-protected-metrics"],
      [{ severeBurdenThreshold: 0 }, "invalid-severe-burden-threshold"],
      [{ severeBurdenThreshold: -3 }, "invalid-severe-burden-threshold"],
      [{ version: "" }, "invalid-group-version"],
      [{ version: "x".repeat(61) }, "invalid-group-version"],
    ];
    for (const [overrides, code] of cases) {
      expectInvalid(
        () => validateStakeholderGroupInput(groupInput(overrides)),
        code,
      );
    }
  });
});

describe("impact decomposition", () => {
  it("computes share-weighted deltas sorted by group id", () => {
    const groups = [
      buildStakeholderGroup(
        groupInput({ id: "group-b", populationSharePercent: 50 }),
      ),
      buildStakeholderGroup(
        groupInput({ id: "group-a", populationSharePercent: 50 }),
      ),
    ];
    const baseline = [impact("group-b", 40, 50), impact("group-a", 50, 50)];
    const projected = [impact("group-b", 38, 50), impact("group-a", 42, 50)];

    const result = assessStakeholderImpacts(groups, baseline, projected);

    expect(result.assessments.map((item) => item.groupId)).toEqual([
      "group-a",
      "group-b",
    ]);
    expect(result.assessments[0]).toEqual({
      groupId: "group-a",
      baselineBurden: 50,
      projectedBurden: 42,
      burdenDelta: -8,
      severeHarm: false,
      harmCodes: [],
    });
    expect(result.averageDelta).toBe(5);
    expect(result.severeHarmGroupIds).toEqual([]);
    expect(result.beneficial).toBe(true);
  });

  it("blocks beneficial classification when one group suffers severe harm", () => {
    const groups = [
      buildStakeholderGroup(
        groupInput({ id: "group-a", populationSharePercent: 60 }),
      ),
      buildStakeholderGroup(
        groupInput({
          id: "group-b",
          populationSharePercent: 40,
          severeBurdenThreshold: 5,
        }),
      ),
    ];
    const baseline = [impact("group-a", 60, 60), impact("group-b", 40, 40)];
    const projected = [impact("group-a", 50, 60), impact("group-b", 46, 40)];

    const result = assessStakeholderImpacts(groups, baseline, projected);

    expect(result.averageDelta).toBe(3.6);
    expect(result.assessments[1]).toMatchObject({
      burdenDelta: 6,
      severeHarm: true,
      harmCodes: ["severe-burden-breach"],
    });
    expect(result.severeHarmGroupIds).toEqual(["group-b"]);
    expect(result.beneficial).toBe(false);
  });

  it("requires every active group in both baseline and projected impacts", () => {
    const groups = [buildStakeholderGroup(groupInput({ id: "group-a" }))];

    expectInvalid(
      () => assessStakeholderImpacts(groups, [], [impact("group-a", 10)]),
      "impact-decomposition-missing-group",
    );
    expectInvalid(
      () => assessStakeholderImpacts(groups, [impact("group-a", 10)], []),
      "impact-decomposition-missing-group",
    );
  });

  it("ignores superseded groups even when impacts are absent", () => {
    const superseded: StakeholderGroup = {
      ...buildStakeholderGroup(groupInput({ id: "group-old" })),
      status: "superseded",
    };
    const groups = [
      buildStakeholderGroup(groupInput({ id: "group-a" })),
      superseded,
    ];

    const result = assessStakeholderImpacts(
      groups,
      [impact("group-a", 50)],
      [impact("group-a", 40)],
    );

    expect(result.assessments).toHaveLength(1);
    expect(result.assessments[0].groupId).toBe("group-a");
    expect(result.averageDelta).toBe(10);
  });

  it("simulates objective impacts deterministically from the governed snapshot", () => {
    const truth = PUBLIC_CITY_SCENARIOS.find(
      (scenario) =>
        scenario.id === "city-economic-single-fault",
    )!;
    const snapshot = projectCoherentCitySnapshot(
      materializeCityScenario(truth).world,
    );
    const groups = [
      buildStakeholderGroup(
        groupInput({
          id: "group-b",
          serviceAccess: 70,
          severeBurdenThreshold: 5,
        }),
      ),
      buildStakeholderGroup(
        groupInput({
          id: "group-a",
          serviceAccess: 50,
          severeBurdenThreshold: 5,
        }),
      ),
    ];
    const current = snapshot.metrics.energy.value;
    const beneficial = simulateObjectiveChangeImpacts(
      groups,
      snapshot,
      {
        metric: "energy",
        direction: "increase",
        target: Math.min(100, current + 10),
        weight: 1,
        scope: "city",
        owner: "human:infrastructure",
      },
    );
    expect(
      simulateObjectiveChangeImpacts(
        groups,
        snapshot,
        {
          metric: "energy",
          direction: "increase",
          target: Math.min(100, current + 10),
          weight: 1,
          scope: "city",
          owner: "human:infrastructure",
        },
      ),
    ).toEqual(beneficial);
    expect(
      beneficial.map((impact) => impact.groupId),
    ).toEqual(["group-a", "group-b"]);
    expect(
      beneficial.every(
        (impact) => impact.burdenDelta <= 0,
      ),
    ).toBe(true);

    const harmful = simulateObjectiveChangeImpacts(
      groups,
      snapshot,
      {
        metric: "energy",
        direction: "increase",
        target: Math.max(0, current - 50),
        weight: 1,
        scope: "city",
        owner: "human:infrastructure",
      },
    );
    expect(
      harmful.every((impact) => impact.severeHarm),
    ).toBe(true);
  });
});

describe("goal deliberation", () => {
  it("requires double approval for non-human weight increases", () => {
    expect(
      requiredDeliberationApprovals({
        proposerPrincipal: "human",
        weightDelta: 0.4,
      }),
    ).toBe(1);
    expect(
      requiredDeliberationApprovals({
        proposerPrincipal: "service-account",
        weightDelta: 0.4,
      }),
    ).toBe(2);
    expect(
      requiredDeliberationApprovals({
        proposerPrincipal: "system",
        weightDelta: 0.4,
      }),
    ).toBe(2);
    expect(
      requiredDeliberationApprovals({
        proposerPrincipal: "service-account",
        weightDelta: -0.2,
      }),
    ).toBe(1);
    expect(
      requiredDeliberationApprovals({
        proposerPrincipal: "service-account",
        weightDelta: 0,
      }),
    ).toBe(1);
  });

  it("creates an open synthetic deliberation with a stable fingerprint", () => {
    const deliberation = createGoalDeliberation(deliberationInput());

    expect(deliberation).toMatchObject({
      schemaVersion: "nexus.goal-deliberation.v1",
      status: "open",
      weightDelta: 0.3,
      statements: [],
      minorityOpinions: [],
      synthetic: true,
    });
    expect(deliberation.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(deliberation.fingerprint).toBe(
      fingerprintGoalDeliberation(deliberation),
    );
    expect(createGoalDeliberation(deliberationInput()).fingerprint).toBe(
      deliberation.fingerprint,
    );
  });

  it("enforces the deliberation transition table", () => {
    const legal: [DeliberationStatus, DeliberationStatus][] = [
      ["open", "simulated"],
      ["open", "withdrawn"],
      ["simulated", "withdrawn"],
      ["simulated", "approved"],
      ["simulated", "rejected"],
      ["approved", "applied"],
    ];
    for (const [from, to] of legal) {
      expect(() => assertDeliberationTransition(from, to)).not.toThrow();
    }

    const illegal: [DeliberationStatus, DeliberationStatus][] = [
      ["draft", "open"],
      ["open", "approved"],
      ["open", "rejected"],
      ["open", "applied"],
      ["open", "open"],
      ["simulated", "open"],
      ["approved", "rejected"],
      ["approved", "withdrawn"],
      ["rejected", "applied"],
      ["withdrawn", "simulated"],
      ["applied", "approved"],
    ];
    for (const [from, to] of illegal) {
      expectInvalid(
        () => assertDeliberationTransition(from, to),
        "invalid-deliberation-transition",
      );
    }
  });

  it("checks decision preconditions in a stable order", () => {
    const open = createGoalDeliberation(deliberationInput());
    expectInvalid(
      () => assertDeliberationDecision(open, "approved", [approval("admin-1")]),
      "deliberation-requires-simulation",
    );

    const quiet = simulatedDeliberation({ statements: [] });
    expectInvalid(
      () => assertDeliberationDecision(quiet, "approved", [approval("admin-1")]),
      "deliberation-requires-discussion",
    );

    expectInvalid(
      () =>
        assertDeliberationDecision(simulatedDeliberation(), "approved", [
          approval("admin-1"),
          approval("admin-1"),
        ]),
      "distinct-approvers",
    );

    const automated = simulatedDeliberation({
      proposerPrincipal: "service-account",
      weightDelta: 0.3,
    });
    expectInvalid(
      () =>
        assertDeliberationDecision(automated, "approved", [
          approval("admin-1"),
        ]),
      "insufficient-approvals",
    );

    const harmful = simulatedDeliberation({
      simulation: {
        sourceWorldFingerprint: "world-fingerprint",
        impacts: [],
        severeHarmGroupIds: ["group-b"],
        simulatedAt: NOW,
      },
    });
    expectInvalid(
      () =>
        assertDeliberationDecision(harmful, "approved", [approval("admin-1")]),
      "severe-group-harm-blocks-approval",
    );
    expect(() =>
      assertDeliberationDecision(harmful, "rejected", [approval("admin-1")]),
    ).not.toThrow();
  });

  it("applies decisions, records minority opinions, and refreshes the fingerprint", () => {
    const deliberation = simulatedDeliberation();
    const decided = applyDeliberationDecision(deliberation, {
      outcome: "approved",
      approvals: [approval("admin-1")],
      note: "Proceed.",
      decidedAt: DECIDED_AT,
    });

    expect(decided.status).toBe("approved");
    expect(decided.decidedAt).toBe(DECIDED_AT);
    expect(decided.decision).toEqual({
      outcome: "approved",
      approvals: [approval("admin-1")],
      requiredApprovals: 1,
      note: "Proceed.",
      decidedAt: DECIDED_AT,
    });
    expect(decided.minorityOpinions).toEqual([
      {
        statementId: "stmt-2",
        actorId: "admin-2",
        text: "Hurts north tenants.",
        recordedAt: DECIDED_AT,
      },
    ]);
    expect(decided.fingerprint).not.toBe(deliberation.fingerprint);
    expect(decided.fingerprint).toBe(fingerprintGoalDeliberation(decided));

    const rejected = applyDeliberationDecision(simulatedDeliberation(), {
      outcome: "rejected",
      approvals: [approval("admin-1")],
      note: "Too risky.",
      decidedAt: NOW,
    });
    expect(rejected.status).toBe("rejected");

    const automatedDecision = applyDeliberationDecision(
      simulatedDeliberation({
        proposerPrincipal: "service-account",
        weightDelta: 0.3,
      }),
      {
        outcome: "approved",
        approvals: [approval("admin-1"), approval("admin-2")],
        note: "",
        decidedAt: NOW,
      },
    );
    expect(automatedDecision.decision?.requiredApprovals).toBe(2);
  });

  it("rejects decisions that violate transition or approval rules", () => {
    expectInvalid(
      () =>
        applyDeliberationDecision(createGoalDeliberation(deliberationInput()), {
          outcome: "approved",
          approvals: [approval("admin-1")],
          note: "",
          decidedAt: NOW,
        }),
      "invalid-deliberation-transition",
    );
    expectInvalid(
      () =>
        applyDeliberationDecision(simulatedDeliberation({ statements: [] }), {
          outcome: "approved",
          approvals: [approval("admin-1")],
          note: "",
          decidedAt: NOW,
        }),
      "deliberation-requires-discussion",
    );
  });

  it("marks only approved deliberations as applied", () => {
    const decided = applyDeliberationDecision(simulatedDeliberation(), {
      outcome: "approved",
      approvals: [approval("admin-1")],
      note: "",
      decidedAt: NOW,
    });

    const applied = markDeliberationApplied(decided, "objective-v2");

    expect(applied.status).toBe("applied");
    expect(applied.appliedObjectiveVersion).toBe("objective-v2");
    expect(applied.fingerprint).toBe(fingerprintGoalDeliberation(applied));
    expectInvalid(
      () => markDeliberationApplied(applied, "objective-v3"),
      "invalid-deliberation-transition",
    );
    expectInvalid(
      () => markDeliberationApplied(simulatedDeliberation(), "objective-v2"),
      "invalid-deliberation-transition",
    );
  });
});

describe("feedback cases", () => {
  it("creates a submitted case with a kind-based SLA deadline", () => {
    const created = createFeedbackCase(feedbackInput());

    expect(created).toMatchObject({
      schemaVersion: "nexus.feedback-case.v1",
      status: "submitted",
      slaHours: 24,
      slaDueAt: "2026-07-19T14:00:00.000Z",
      breachedSla: false,
      updatedAt: NOW,
      synthetic: true,
    });
    expect(created.fingerprint).toBe(fingerprintFeedbackCase(created));

    const kinds: [FeedbackKind, number][] = [
      ["appeal", 24],
      ["objection", 48],
      ["correction", 72],
      ["evidence", 96],
    ];
    for (const [kind, slaHours] of kinds) {
      expect(createFeedbackCase(feedbackInput({ kind })).slaHours).toBe(
        slaHours,
      );
    }
  });

  it("enforces the feedback transition table including the suppression guard", () => {
    const legal: [FeedbackStatus, FeedbackStatus][] = [
      ["submitted", "triaged"],
      ["submitted", "dismissed"],
      ["triaged", "in-review"],
      ["in-review", "answered"],
      ["in-review", "dismissed"],
      ["answered", "appealed"],
      ["answered", "closed"],
      ["dismissed", "appealed"],
      ["appealed", "upheld"],
      ["appealed", "overturned"],
      ["appealed", "dismissed"],
      ["upheld", "closed"],
      ["overturned", "closed"],
    ];
    for (const [from, to] of legal) {
      expect(() => assertFeedbackTransition(from, to)).not.toThrow();
    }

    const illegal: [FeedbackStatus, FeedbackStatus][] = [
      ["submitted", "closed"],
      ["submitted", "answered"],
      ["submitted", "in-review"],
      ["triaged", "answered"],
      ["triaged", "closed"],
      ["in-review", "triaged"],
      ["answered", "submitted"],
      ["appealed", "closed"],
      ["dismissed", "closed"],
      ["upheld", "dismissed"],
      ["overturned", "upheld"],
      ["closed", "appealed"],
      ["closed", "submitted"],
    ];
    for (const [from, to] of illegal) {
      expectInvalid(
        () => assertFeedbackTransition(from, to),
        "invalid-feedback-transition",
      );
    }
  });

  it("detects SLA breaches only for non-terminal statuses", () => {
    const feedback = createFeedbackCase(feedbackInput());
    const beforeDue = new Date("2026-07-18T15:00:00.000Z");
    const afterDue = new Date("2026-07-20T15:00:00.000Z");

    expect(isFeedbackSlaBreached(feedback, beforeDue)).toBe(false);
    expect(isFeedbackSlaBreached(feedback, afterDue)).toBe(true);
    expect(
      isFeedbackSlaBreached({ ...feedback, status: "appealed" }, afterDue),
    ).toBe(true);

    const terminal: FeedbackStatus[] = [
      "closed",
      "dismissed",
      "upheld",
      "overturned",
    ];
    for (const status of terminal) {
      expect(
        isFeedbackSlaBreached({ ...feedback, status }, afterDue),
      ).toBe(false);
    }
  });

  it("requires a concrete action when an appeal is overturned", () => {
    const base = {
      outcome: "overturned" as const,
      resolvedBy: "admin-1",
      resolvedAt: NOW,
      target: { kind: "incident" as const, id: "inc-1" },
    };

    expectInvalid(
      () => buildFeedbackResolution({ ...base, actions: [] }),
      "appeal-overturn-requires-action",
    );
    expectInvalid(
      () => buildFeedbackResolution({ ...base, actions: [{ type: "note-only" }] }),
      "appeal-overturn-requires-action",
    );

    const resolution = buildFeedbackResolution({
      ...base,
      actions: [{ type: "reopen-incident", incidentId: "inc-1" }],
    });
    expect(resolution).toEqual({
      outcome: "overturned",
      actions: [{ type: "reopen-incident", incidentId: "inc-1" }],
      resolvedBy: "admin-1",
      resolvedAt: NOW,
    });
  });

  it("matches resolution actions to compatible target kinds", () => {
    const base = {
      outcome: "overturned" as const,
      resolvedBy: "admin-1",
      resolvedAt: NOW,
    };

    expectInvalid(
      () =>
        buildFeedbackResolution({
          ...base,
          actions: [{ type: "reopen-incident", incidentId: "inc-1" }],
          target: { kind: "lesson", id: "lesson-1" },
        }),
      "resolution-action-target-mismatch",
    );
    expectInvalid(
      () =>
        buildFeedbackResolution({
          ...base,
          actions: [{ type: "invalidate-lesson", lessonId: "lesson-1" }],
          target: { kind: "incident", id: "inc-1" },
        }),
      "resolution-action-target-mismatch",
    );
    expectInvalid(
      () =>
        buildFeedbackResolution({
          ...base,
          actions: [{ type: "request-evidence", planId: "plan-1" }],
          target: { kind: "incident", id: "inc-1" },
        }),
      "resolution-action-target-mismatch",
    );

    expect(
      buildFeedbackResolution({
        ...base,
        actions: [{ type: "invalidate-lesson", lessonId: "lesson-1" }],
        target: { kind: "lesson", id: "lesson-1" },
      }).actions,
    ).toHaveLength(1);
    expect(
      buildFeedbackResolution({
        ...base,
        actions: [{ type: "request-evidence", planId: "plan-1" }],
        target: { kind: "decision", id: "plan-1" },
      }).outcome,
    ).toBe("overturned");
    expect(
      buildFeedbackResolution({
        ...base,
        outcome: "upheld",
        actions: [],
        target: { kind: "incident", id: "inc-1" },
      }).outcome,
    ).toBe("upheld");
  });
});

describe("public explanation", () => {
  it("builds a structured-facts explanation with the synthetic boundary", () => {
    const explanation = buildPublicExplanation(explanationInput());

    expect(explanation).toMatchObject({
      schemaVersion: "nexus.public-explanation.v1",
      generator: "structured-facts",
      syntheticBoundary: SYNTHETIC_BOUNDARY_STATEMENT,
      synthetic: true,
    });
    expect(SYNTHETIC_BOUNDARY_STATEMENT).toBe(
      "Synthetic scenario evidence: does not describe real populations or real policy effects.",
    );
    expect(explanation.fingerprint).toBe(
      fingerprintPublicExplanation(explanation),
    );
    expect(verifyPublicExplanationFingerprint(explanation)).toBe(true);
  });

  it("requires facts and exactly one selected option", () => {
    expectInvalid(
      () => buildPublicExplanation(explanationInput({ facts: [] })),
      "explanation-requires-facts",
    );
    expectInvalid(
      () =>
        buildPublicExplanation(
          explanationInput({
            options: [
              { optionId: "option-a", selected: false, rejectionCodes: ["x"] },
              { optionId: "option-b", selected: false, rejectionCodes: ["y"] },
            ],
          }),
        ),
      "explanation-requires-selection",
    );
    expectInvalid(
      () =>
        buildPublicExplanation(
          explanationInput({
            options: [
              { optionId: "option-a", selected: true, rejectionCodes: [] },
              { optionId: "option-b", selected: true, rejectionCodes: [] },
            ],
          }),
        ),
      "explanation-requires-selection",
    );
  });

  it("renders deterministic ordered lines from structured facts", () => {
    const explanation = buildPublicExplanation(explanationInput());

    const lines = renderExplanationLines(explanation);

    expect(lines).toEqual(renderExplanationLines(explanation));
    expect(lines[0]).toEqual({
      code: "subject",
      params: { kind: "decision", id: "delib-1" },
    });
    const factLines = lines.filter((line) => line.code === "fact");
    expect(factLines.map((line) => line.params.code)).toEqual([
      "cost",
      "target-delta",
    ]);
    expect(lines.filter((line) => line.code === "option")).toEqual([
      {
        code: "option",
        params: { optionId: "option-a", selected: true, rejectionCodes: [] },
      },
      {
        code: "option",
        params: {
          optionId: "option-b",
          selected: false,
          rejectionCodes: ["higher-cost"],
        },
      },
    ]);
    expect(
      lines.some(
        (line) => line.code === "tradeoff" && line.params.code === "budget-vs-service",
      ),
    ).toBe(true);
    const authorization = lines.find((line) => line.code === "authorization");
    expect(authorization?.params.approverIds).toEqual(["admin-1", "admin-2"]);
    expect(authorization?.params.policyVersion).toBe("policy-1.0");
    expect(authorization?.params.evidenceRefs).toEqual(["evidence-1"]);
    expect(
      lines.some(
        (line) => line.code === "uncertainty" && line.params.code === "model-drift",
      ),
    ).toBe(true);
    expect(lines[lines.length - 1]).toEqual({
      code: "synthetic-boundary",
      params: { statement: SYNTHETIC_BOUNDARY_STATEMENT },
    });
  });

  it("sorts facts by code and then by subject", () => {
    const explanation = buildPublicExplanation(
      explanationInput({
        facts: [
          { code: "metric", subject: "water", value: 1 },
          { code: "metric", subject: "energy", value: 2 },
          { code: "cost", subject: "budget", value: 3 },
        ],
      }),
    );

    const factLines = renderExplanationLines(explanation).filter(
      (line) => line.code === "fact",
    );

    expect(
      factLines.map((line) => [line.params.code, line.params.subject]),
    ).toEqual([
      ["cost", "budget"],
      ["metric", "energy"],
      ["metric", "water"],
    ]);
  });
});

describe("fingerprints", () => {
  it("is deterministic regardless of object key insertion order", () => {
    const group = buildStakeholderGroup(groupInput());
    const reversedGroup = Object.fromEntries(
      Object.entries(group).reverse(),
    ) as StakeholderGroup;
    expect(fingerprintStakeholderGroup(reversedGroup)).toBe(
      fingerprintStakeholderGroup(group),
    );

    const deliberation = createGoalDeliberation(deliberationInput());
    const reversedDeliberation = Object.fromEntries(
      Object.entries(deliberation).reverse(),
    ) as GoalDeliberation;
    expect(fingerprintGoalDeliberation(reversedDeliberation)).toBe(
      deliberation.fingerprint,
    );

    const feedback = createFeedbackCase(feedbackInput());
    const reversedFeedback = Object.fromEntries(
      Object.entries(feedback).reverse(),
    ) as typeof feedback;
    expect(fingerprintFeedbackCase(reversedFeedback)).toBe(feedback.fingerprint);

    const explanation = buildPublicExplanation(explanationInput());
    const reversedExplanation = Object.fromEntries(
      Object.entries(explanation).reverse(),
    ) as PublicExplanation;
    expect(fingerprintPublicExplanation(reversedExplanation)).toBe(
      explanation.fingerprint,
    );
    expect(verifyPublicExplanationFingerprint(reversedExplanation)).toBe(true);
  });

  it("detects tampered explanations as fingerprint mismatches", () => {
    const explanation = buildPublicExplanation(explanationInput());

    const tampered: PublicExplanation = {
      ...explanation,
      facts: [
        ...explanation.facts,
        { code: "forged-metric", subject: "attacker", value: 1 },
      ],
    };
    expect(verifyPublicExplanationFingerprint(tampered)).toBe(false);

    const forged: PublicExplanation = {
      ...tampered,
      fingerprint: explanation.fingerprint,
    };
    expect(verifyPublicExplanationFingerprint(forged)).toBe(false);
  });
});

describe("red-team controls", () => {
  it("lists all governance attack kinds in contract order", () => {
    expect(GOVERNANCE_ATTACK_KINDS).toEqual([
      "approval-collusion",
      "privilege-escalation",
      "evidence-forgery",
      "goal-gaming",
      "alert-suppression",
      "automation-bias",
      "minority-harm",
    ]);
  });

  it("maps every attack kind to its containing control code", () => {
    expect(GOVERNANCE_ATTACK_CONTROLS).toEqual({
      "approval-collusion": "distinct-approvers",
      "privilege-escalation": "service-account-approval-denied",
      "evidence-forgery": "explanation-fingerprint-mismatch",
      "goal-gaming": "two-authenticated-approvals",
      "alert-suppression": "invalid-feedback-transition",
      "automation-bias": "deliberation-requires-discussion",
      "minority-harm": "severe-group-harm-blocks-approval",
    });
    for (const kind of GOVERNANCE_ATTACK_KINDS) {
      expect(GOVERNANCE_ATTACK_CONTROLS[kind]).toBeTruthy();
    }
  });
});
