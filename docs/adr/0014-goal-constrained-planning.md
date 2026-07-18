# ADR 0014: Goal-Constrained Intervention Planning

- Status: Accepted
- Date: 2026-07-18
- Target release: v1.7.0

## Context

v1.6 could produce an eligible, falsifiable diagnosis, but there was no safe
boundary between an explanation and an action. A model-shaped string could not
be allowed to become executable authority, and selecting one plausible action
without no-action, alternatives, paired controls, budgets, stopping rules, or
human review would make outcome claims uninterpretable.

## Decision

1. Planning accepts only a currently eligible diagnosis and freezes its
   fingerprint with objectives, guardrails, stakeholder impacts, policy, and
   source world.
2. The versioned Intervention DSL is declarative and capability-bounded. v1
   permits only metric adjustment; arbitrary code, shell, SQL, undeclared
   fields, invalid capabilities, unbounded values, and broken inverses fail
   closed.
3. Every normal portfolio retains no action plus at least two distinct valid
   candidates. Equivalent action sets merge provenance.
4. Candidate comparison preserves benefit, cost, risk, synthetic group impact,
   Pareto position, and explicit rejection reasons.
5. Experiments pair baseline and candidate on five seeds in isolated worlds.
   Objectives, guardrails, windows, sample points, stopping rules,
   Holm-Bonferroni correction, regression-to-mean control, and cycle control
   are immutable design evidence.
6. A protection breach stops at the first sample. Deterministic repeated
   fingerprints and budget/resource scheduling are required.
7. Approval is human-admin authority. High-risk or irreversible candidates
   require two distinct admins; service accounts cannot approve. Staging
   re-checks diagnosis trust, capability, budget, experiment, schedule, and
   approval gates.
8. Plans and decisions use append-only lifecycle events and the shared atomic
   memory/PostgreSQL contract. `staged` is a lab state, not a real-city
   deployment claim.

## Consequences

- A diagnosis cannot silently authorize its own remedy.
- No-action remains a first-class option and failed, queued, dominated, and
  rejected candidates remain inspectable.
- Statistical safeguards are design metadata and deterministic synthetic
  controls, not claims of real-world causal inference.
- Strict DSL validation intentionally limits expressiveness; future action
  kinds require a new schema version and conformance tests.
- v1.8 outcome evaluation must remain independent from the proposing Agents
  and compare observed delayed results with this frozen plan context.
