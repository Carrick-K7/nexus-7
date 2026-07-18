# ADR 0015: Participatory Governance

- Status: Accepted
- Date: 2026-07-18
- Target release: v1.9.0

## Context

Human governance so far is a single admin approval button. The closed-loop
plan requires governance to extend to goal setting, impact review, feedback,
objection, and appeal, while synthetic stakeholder groups must never be
presented as real populations. The system also needs proof that its own
governance controls resist collusion, escalation, forgery, goal gaming,
alert suppression, automation bias, and minority harm.

## Decision

1. Add a `src/participation` module with four persisted aggregates, all
   stored as generic lifecycle records: versioned `StakeholderGroup`,
   `GoalDeliberation`, `FeedbackCase`, and `PublicExplanation`.
2. Stakeholder groups carry explicit version, weight, protected metrics,
   and a severe-burden threshold. Impact decomposition is population
   weighted, and a positive average never classifies as beneficial while
   any protected group suffers severe harm.
3. Objective changes go through a deliberation state machine
   (draft → open → simulated → approved/rejected → applied). Approval
   requires a prior group-impact simulation, at least one discussion
   statement, and distinct human admin approvers. Each request can contribute
   only its currently authenticated actor; a non-human proposer raising an
   objective weight requires two separately authenticated requests.
4. Feedback, objection, evidence, and appeal share one `FeedbackCase`
   state machine with per-kind SLA deadlines, an owner, a response, and a
   resolution. Overturned appeals execute exactly one target-ID-matched action
   through the owning city, outcome, or planning service (reopen incident,
   invalidate lesson/playbooks, request evidence), and every transition is an
   immutable lifecycle event.
5. Public explanations are assembled from structured facts, stable codes,
   and authorization references only. No free-form model text is stored;
   bilingual prose is rendered by the UI from those facts, so decision,
   incident, and outcome explanations can always be rebuilt deterministically.
6. A fixed governance red-team suite exercises approval collusion,
   privilege escalation, evidence forgery, goal gaming, alert
   suppression, automation bias, and minority harm against the real
   service. Its report is part of the v1.9 acceptance gate and blocks
   release when any attack is not contained.
7. Permissions extend the existing role matrix: `participation:read`
   (viewer+), `participation:contribute` (all principals),
   `participation:moderate` (operator+), and `participation:approve`
   (human admin only, denied to service accounts).

## Consequences

- No new PostgreSQL tables are required; all aggregates reuse
  `nexus_lifecycle_records`, so backup, restore, and retention coverage
  come from the existing operational intelligence domain.
- Cross-module effects use stable IDs and invoke the owning service before the
  appeal transition commits. Idempotent city/outcome effects and v2
  orchestration provide the recovery boundary; participation never edits
  another aggregate directly.
- The red-team suite runs against the real service with the memory
  backend, so attack coverage cannot drift away from production rules.
- v1.8 outcome/lesson references remain stable IDs, while an injected
  capability interface applies invalidation under Outcome Learning's own
  permissions, workspace checks, revisions, and playbook propagation.
