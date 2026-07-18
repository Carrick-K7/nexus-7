# Outcome Learning

> Contracts: `nexus.outcome.v1`, `nexus.lesson.v1`,
> `nexus.response-playbook.v1`, `nexus.learning-proposal.v1`
> Release: v1.8.0

## Purpose

Outcome Learning turns a staged synthetic intervention into delayed,
independently evaluated evidence and versioned organizational memory. It does
not let the proposing Agent grade itself, treat a short-term metric change as
lasting benefit, or convert a learned result directly into production policy.

All records retain their synthetic boundary. They are evidence about the
repeatable NEXUS-7 laboratory, not claims about real people or policies.

## Independent outcome evaluation

`independent-outcome-evaluator-v1` evaluates the selected intervention against
the exact staged-plan fingerprint and source world. Every outcome contains:

- short, medium, and long windows at 15, 60, and 180 ticks;
- the frozen no-action counterfactual, historical source value, and same-seed
  seasonal comparison;
- expected and observed effects plus prediction error;
- group-level synthetic effects and attributable guardrail observations;
- a repeated observed fingerprint proving deterministic replay;
- one of `beneficial`, `harmful`, `neutral`, or `inconclusive`.

A guardrail already outside its threshold in the frozen baseline is not
misattributed to the intervention. A new or materially worsened breach is
attributable; a critical attributable breach produces a harmful rollback
lesson.

Human-admin late evidence is bounded, typed as fact or human judgment,
append-only, and idempotent by source, metric, tick, and delta. It creates a new
outcome revision, invalidates superseded memory, and can reopen a resolved
synthetic city incident. A human can also flag attribution, placing the outcome
under review rather than silently rewriting the conclusion.

## Lesson Registry

Every completed outcome receives a disposition. The registry retains:

- success, failure, rollback, and inconclusive lessons;
- applicability and invalidation conditions;
- effect, prediction error, confidence, and exact evidence sources;
- `draft`, `validated`, `deprecated`, and `invalidated` lifecycle states;
- immutable lineage to the source outcome revision and replacement lesson.

Only a validated success lesson may be positively retrieved. Failure,
rollback, inconclusive, deprecated, and invalidated records remain observable
but cannot become positive recommendations. Rebuilding the registry from the
same outcome history produces identical lesson fingerprints and states.

## Playbooks and governed changes

A response playbook is derived only from a validated directional lesson. Before
reuse it rechecks:

- lesson validity and scenario context;
- policy, objective, and guardrail versions;
- current diagnostic trust;
- capabilities and budget reservation;
- passing experiment evidence;
- human approval.

Invalidating its source lesson invalidates the playbook. Drift or a context
mismatch makes it inapplicable; it never weakens an existing planning gate.

Learning may propose only a declarative `policy`, `prompt`, `scenario`, or
`test` change. Every proposal is routed to
`existing-controlled-iteration` with regression, public-scenario, isolated
evaluation, human-approval, and staged-release gates. `bypassAllowed` is
structurally `false`.

## Persistence and API

Outcomes, lessons, playbooks, and learning proposals use the shared atomic
lifecycle repository. The same service contract runs against the memory
reference adapter and PostgreSQL, with workspace isolation, optimistic
revisions, append-only events, checksum backup, and restore coverage. No new
table is required because the versioned lifecycle aggregate schema stores each
record kind.

`GET /api/outcomes` returns the workspace learning overview. Authenticated
`POST /api/outcomes` supports:

- `evaluate-plan`;
- `record-late-evidence`;
- `flag-attribution`;
- `close-incident`;
- `invalidate-lesson` and `deprecate-lesson`;
- `propose-change`;
- `assess-playbook`.

Evaluation requires a staged plan. Late evidence, attribution review, incident
closure, and lesson lifecycle mutations require a human admin.

## Observer workflow

Open **Observer → Learning Observatory**. Prepare the sustained-outcome
portfolio, approve and stage it in Planning Workbench, then evaluate it. The
surface exposes window-by-window prediction error, counterfactual values,
guardrail attribution, late evidence, lesson provenance, playbook status,
contradictions, and governed proposals. It never exposes model hidden
chain-of-thought.

## Acceptance

Run:

```bash
npm run verify:outcomes
```

`.artifacts/outcome-learning-acceptance.json` covers all four verdicts and all
four lesson kinds/lifecycle states, three delayed windows, deterministic
rebuild, late-harm reopening, human attribution review, invalidation
propagation, context-gated playbooks, closure disposition, and release-chain
non-bypass. PostgreSQL integration separately round-trips outcomes, lessons,
playbooks, proposals, and revision lineage.
