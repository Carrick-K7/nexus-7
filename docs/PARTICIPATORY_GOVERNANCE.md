# Participatory Governance

> Contracts: `nexus.stakeholder-group.v1`,
> `nexus.goal-deliberation.v1`, `nexus.feedback-case.v1`,
> `nexus.public-explanation.v1`, `nexus.governance-red-team.v1`
> Release: v1.9.0

## Purpose

Participatory Governance extends human control beyond a final admin button.
It makes synthetic stakeholder definitions, objective changes, minority
impacts, dissent, correction, appeal, and public explanation durable parts of
the laboratory evidence chain.

Stakeholder groups are scenario roles only. Their names, weights, and impacts
must never be presented as measurements of real communities or proof of real
policy effects.

## Stakeholder and impact contract

Each stakeholder group records:

- district, income band, service access, and vulnerability;
- synthetic population share and representation weight;
- protected city metrics and a severe-burden threshold;
- explicit version, effective time, and active/superseded state.

The deterministic reference simulation derives each active group's baseline
and projected burden from the governed city snapshot, the objective proposal,
service access, income band, vulnerability, and weight. A caller cannot supply
an arbitrary second approver through the HTTP API. Average improvement never
classifies an objective change as beneficial while any protected group crosses
its severe-harm threshold.

## Goal deliberation

The lifecycle is:

```text
open → simulated → approved | rejected
                         approved → applied
```

Decision requires a structured proposal, at least one discussion statement,
and a deterministic group-impact simulation. Opposing statements become
retained minority opinions.

Each approval request contributes exactly the current authenticated human
admin. An API caller cannot claim another person's identity in a payload.
A non-human proposer that raises an objective weight needs two separate,
distinct human-admin requests. The first is persisted as pending evidence and
cannot apply the objective. Service accounts cannot approve or apply under any
role or delegated grant.

Applying an approved deliberation creates a real versioned city objective
through `CityModelService`; the participation record stores the resulting
objective version.

## Feedback, correction, and appeal

Feedback kinds are correction, objection, evidence, and appeal. Every case
stores its target, submitter, owner, SLA deadline, response, status, resolution,
and append-only lifecycle events.

An appeal can be created only from a case that reached an appealable state. An
overturn must name exactly one concrete action matching both the target kind
and target ID:

- reopen the referenced city incident;
- invalidate the referenced lesson and its dependent playbooks;
- request additional evidence for the referenced plan.

These are not inert audit strings. Participation invokes the owning City,
Outcome Learning, or Planning service, which rechecks its own workspace,
permission, state, and revision invariants before the appeal is committed.
Upheld or dismissed appeals cannot execute a state-changing action.

## Public explanations

Decision, incident, and outcome explanations are reconstructed from structured
facts and stable codes. They include considered options, selected/rejected
states, authorization, policy/evidence references, result linkage,
uncertainty, the synthetic boundary, and a canonical fingerprint. Outcome
explanations name the independent evaluator and delayed windows.

No free-form model prose or hidden chain-of-thought is stored. The bilingual UI
renders the same structured evidence for ordinary observers and auditors.
v2 deployment explanations read the durable `deployment-record` aggregate and
its exact artifact, environment progression, telemetry, and rollback state.
They still fail closed for missing or malformed records instead of inventing
deployment facts.

## Governance red team

The fixed acceptance suite runs against the real service and covers:

- approval collusion;
- service-account privilege escalation;
- explanation/evidence forgery;
- objective-weight gaming;
- alert/feedback suppression;
- automation bias;
- severe minority harm.

The API surface caches and exposes the fingerprinted report in Participation
Center. Any uncontained attack fails `npm run verify:participation`.

## Persistence, API, and UI

Stakeholder groups, deliberations, feedback cases, explanations, and their
events use the shared atomic lifecycle memory/PostgreSQL contract. Workspace
isolation, optimistic revisions, checksum backup/restore, and retention apply
without a new table.

`GET /api/participation` returns the complete workspace projection.
Authenticated `POST /api/participation` supports group versioning,
deliberation/discussion/simulation/decision/application, feedback lifecycle,
appeal resolution, and structured explanation publication.

Participation Center is bilingual, responsive, keyboard reachable, and exposes
the synthetic boundary, live SLA counts, pending authenticated approvals,
minority-harm blocks, real appeal outcomes, public evidence, and every red-team
control.

## Acceptance

Run:

```bash
npm run verify:participation
```

The report verifies versioning, impact decomposition, discussion and
simulation prerequisites, separately authenticated double approval, permission
denial, feedback SLA/audit, real incident reopening, real lesson/playbook
invalidation, real evidence-request state, reconstructible explanations, and
all seven governance attacks. PostgreSQL and browser/axe suites verify durable
round trips and the human-operable path.

Local deterministic and reference-provider evidence is not a production
attestation. External identity, deployment, and Sigstore evidence remains
pending until run in the configured environment.
