# Closed-Loop Orchestration

> Contracts: `nexus.closed-loop-case.v2`,
> `nexus.closed-loop-evidence.v2`, `nexus.deployment-record.v2`
> Release: v2.0.0
> Status: implementation complete / external evidence pending

## Purpose

The v2 orchestrator turns the existing city, diagnosis, planning, deployment,
outcome, learning, and governance domains into one durable incident-to-learning
case. It coordinates those services; it does not duplicate their rules or edit
their records directly.

The city and every impact in this path are deterministic synthetic laboratory
data. A beneficial closure proves that the configured test case passed. It
does not prove that a similar intervention would benefit real people.

## Durable case contract

Every case has one workspace, owner, correlation chain, exact release artifact,
ten ordered stages, evidence envelopes, transitions, idempotency receipts,
compensations, guardrails, group impacts, and replay coordinates.

```text
detection → triage → diagnosis → planning → experiment
  → authorization → deployment → outcome → learning → closure
```

The corresponding lifecycle is:

```text
detected → triaged → diagnosing → diagnosed → planned → experimenting
  → awaiting-approval → staged → monitoring
  → verified-beneficial | rolled-back | inconclusive
  → learned → closed
```

`paused`, `blocked`, `cancelled`, `emergency-stopped`, and `reopened` are
explicit states. New evidence can reopen a closed case. No-action scenarios
close with an explicit `no-action` disposition and evidence at every skipped
stage; they do not disappear from the denominator silently.

Each stage declares:

- a human or system owner;
- an activation-relative deadline;
- required evidence kinds;
- source record IDs and evidence IDs;
- start, completion, skip, failure, or compensation state.

Removing or reordering a stage, skipping without a safe disposition, or
closing with an incomplete stage makes verification fail.

## Evidence and artifact integrity

Evidence is an immutable SHA-256 envelope over its stage, kind, source,
correlation and causation IDs, payload digest, creation time, expiry, trust
level, and exact release-artifact fingerprint.

Expired critical evidence blocks progress. A human resume may append a fresh
revalidation envelope linked by `supersedesEvidenceId`; it never rewrites or
deletes the expired history. A forged digest, wrong artifact, duplicate ID,
broken transition chain, expired unsuperseded prerequisite, or severe
guardrail escape fails closed.

The release binding covers:

- `package.json` and `package-lock.json`;
- the v2 iteration manifest;
- the frozen certification-corpus fingerprint;
- repository, commit, dirty state, and CI-evidence fingerprint.

Trust is one of `local-uncommitted`, `local-committed`, or
`external-attested`. Only a clean exact commit with a fresh verified signed
receipt can become `external-attested`. Local fixtures never satisfy the
production evidence boundary.

## Orchestration behavior

`ClosedLoopService` calls the owning services in order:

1. `CityModelService` injects truth-labelled symptoms and owns the incident.
2. `DiagnosisService` persists alternatives, counterevidence, and frozen
   counterfactuals.
3. `PlanningService` produces no-action plus bounded interventions, experiments,
   a decision, authenticated approval, and a staged plan.
4. `DeploymentAdapter` promotes the same artifact through development,
   staging, and a production canary.
5. `OutcomeLearningService` independently evaluates delayed windows, derives a
   lesson, and optionally creates a governed next-change proposal.
6. The outcome service resolves the city incident before the orchestrator
   records final closure.

Every linked object remains a first-class lifecycle record. The unified trace
therefore reaches real `city-incident`, `causal-diagnosis`,
`intervention-plan`, `deployment-record`, `outcome-record`, `lesson`, and
`learning-proposal` aggregates rather than embedding decorative copies in the
case.

## Idempotency, concurrency, and compensation

Every command carries an idempotency key bound to a command digest. Repeating
the same command returns its durable result; reusing the key for different
input is rejected. Lifecycle commits use optimistic revisions, so concurrent
advances cannot both commit. External canary starts and rollbacks are also
idempotent.

Failure behavior is explicit:

- a pre-deployment deadline releases reserved synthetic resources and blocks
  the case for human review;
- a post-deployment deadline or emergency stop rolls back before further
  analysis;
- an unhealthy production canary rolls back all three recorded environments;
- a human can pause, resume, cancel, roll back, reopen, or emergency-stop;
- a service account can observe and perform its fixed operating profile but
  cannot exercise human control or approval;
- a rolled-back deployment receives an outcome disposition and a retained
  rollback lesson before closure;
- harmful delayed evidence can revise an early benefit and reopen the case.

Human resume renews an expired stage deadline only after recording the reason.
An emergency stop before any external action remains stopped until a human
reopens it; the system does not invent a rollback that never happened.

## Persistence, API, and UI

Cases and deployments use the shared atomic lifecycle contract, so the same
service runs against memory and PostgreSQL with workspace isolation,
append-only events, optimistic revisions, checksum backup, and restore.
`0008_closed_loop_indexes.sql` adds workspace/status and correlation indexes
without changing v1 record formats.

`GET /api/closure` returns the workspace overview. `POST /api/closure`
supports:

- `start`;
- `run-reference`;
- `advance`, `pause`, `resume`, `cancel`, `rollback`,
  `emergency-stop`, and `reopen`.

Permissions are `closure:read`, `closure:operate`, and `closure:control`.
Human control and high-risk planning approval are independently enforced even
when a caller reaches the route.

Observer contains the bilingual Closed-Loop Workbench. It exposes live
anti-Goodhart indicators, stage owners/deadlines/evidence, control actions,
artifact trust, and one trace from incident through the next governed
proposal. The interface is responsive, keyboard reachable, and covered by axe.

## Acceptance

Run:

```bash
npm run verify:closure
```

The machine report is written to
`.artifacts/closed-loop-certification.json` and exposed at
`GET /api/verification/v2`. The gate executes the frozen 25-scenario corpus,
the real durable reference flow twice, a real injected canary rollback through
outcome and lesson closure, evidence sabotage, v1 compatibility, and all seven
extension conformance suites.

See [V2_VERIFICATION.md](V2_VERIFICATION.md) for metric semantics and
[PRODUCTION.md](PRODUCTION.md) for operating and recovery procedures.
