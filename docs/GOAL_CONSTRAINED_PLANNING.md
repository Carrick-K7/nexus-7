# Goal-Constrained Planning

> Contracts: `nexus.intervention.v1`,
> `nexus.intervention-experiment.v1`, `nexus.intervention-plan.v1`
> Release: v1.7.0

## Purpose

Planning converts an eligible causal diagnosis into a bounded portfolio of
synthetic interventions. It does not execute model text, deploy to a real city,
or treat an attractive forecast as authorization.

Every plan must answer:

1. What happens if the system takes no action?
2. Which distinct interventions are valid under Agent capabilities?
3. Which frozen objectives and guardrails judge the comparison?
4. What resources, cost, delay, risk, and group impacts does each option claim?
5. Why was one option selected and every other option rejected?

## Intervention contract

The v1 DSL has one executable primitive: `adjust-city-metric`. An action names
its owning Agent, exact `metric:*` capability, bounded delta, cost, expected
delay, preconditions, resource claims, and either an exact inverse or an
explicit irreversibility justification.

Validation rejects:

- undeclared fields or schema versions;
- arbitrary action kinds, source code, shell, or SQL;
- Agent/metric capability mismatches;
- non-finite or unbounded values;
- invalid resource claims;
- a reversible action without an exact inverse;
- duplicate action sets disguised with different candidate IDs.

Candidate provenance is append-only and distinguishes no-action,
deterministic-rule, validated-model-proposal, and human sources. Equivalent
actions merge provenance rather than multiplying apparent choice.

## Portfolio and experiment design

Every ordinary plan contains a no-action baseline and at least two valid
interventions. Candidates expose expected benefit, cost, risk, synthetic group
effects, Pareto status, dominators, validation failures, and rejection reasons.

The experiment design freezes:

- the eligible diagnosis fingerprint;
- objectives, guardrails, and synthetic stakeholder impacts;
- five paired seeds and a 60-tick window;
- sample ticks 1, 15, 30, and 60;
- guardrail, budget, benefit, and futility stopping rules;
- Holm-Bonferroni multiple-comparison control;
- paired frozen-baseline regression-to-mean control;
- same-seed/same-window natural-cycle control.

Candidate and baseline runs use the same seed and source world. Candidate runs
are repeated and fingerprinted. A guardrail breach stops at the first sample;
it cannot wait for the final window.

## Scheduling and decisions

Each candidate receives its own isolated world ID. The scheduler ranks
severity, expected information gain, benefit, risk, and cost while enforcing
the plan budget and resolving exclusive or capacity-limited resource claims.
Queued and rejected candidates retain a machine-readable reason.

Only a human admin can approve or stage. A candidate must be valid, passing,
scheduled, inside budget, capability-correct, and supported by a currently
active diagnosis trust assessment. High-risk or irreversible candidates need
two distinct human-admin approvals. Service accounts cannot approve.

Approval, evidence request, rejection, and staging are append-only lifecycle
events. `staged` means authorized for the synthetic lab workflow; it does not
mean deployed to a real city.

## Persistence and API

Plans use the generic atomic lifecycle repository and therefore share the
memory and PostgreSQL contracts, optimistic revisions, workspace isolation,
migration `0007`, and checksum backup/restore path.

`GET /api/planning` returns a workspace overview. Authenticated
`POST /api/planning` supports:

- `create-plan`;
- `approve-plan`;
- `request-evidence`;
- `reject-plan`;
- `stage-plan`.

Unknown fields inside supplied actions fail closed at the service boundary.
Repeated creation with the same diagnosis, budget, and candidate actions is
idempotent.

## Observer workflow

Open **Observer → Planning Workbench**. Create the reference cascade portfolio,
then compare no action and both interventions. The table shows provenance,
risk, cost, expected group impacts, Pareto status, paired results, replay
status, schedule reasons, and the frozen statistical controls.

The decision panel explains the selection and rejected alternatives. Approval
and staging controls represent human governance gates, not autonomous
execution.

## Acceptance

Run:

```bash
npm run verify:planning
```

`.artifacts/planning-acceptance.json` verifies 15 incident plans, 15 no-action
baselines, 30 valid interventions, 75 paired seeds, 225 experiment runs, exact
replay, first-sample guardrail stops, bounded DSL enforcement, provenance and
deduplication, Pareto comparison, isolated scheduling, stage gates, dual
approval declarations, and the review surface.

These are deterministic synthetic experiment results. They do not establish
that an intervention would benefit a real city or population.
