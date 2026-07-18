# Security Threat Model

> Scope: NEXUS-7 v2 closed-loop autonomy laboratory
> Boundary: synthetic decisions only; no authority over real city systems

## Protected assets

- exact release artifact and external provenance;
- workspace membership, human identity, and approval separation;
- append-only incident, decision, deployment, outcome, lesson, and audit data;
- deterministic scenario truth, seeds, policy versions, and replay evidence;
- deployment-controller credentials, OIDC keys, webhook secrets, and model API
  keys;
- guardrails, group-impact evidence, rollback inverses, and recovery backups.

Secrets are configuration, never domain evidence. Hidden model
chain-of-thought is neither requested nor stored.

## Trust boundaries

```text
browser / API client
        ↓ authenticated request
Next.js routes → domain services → memory or PostgreSQL
        ↓                         ↘ append-only evidence
untrusted model provider           deployment / notification adapters
        ↓                                    ↓
schema + capability gates          versioned contract + idempotency
        └──────── human governance and exact-artifact release gate ────────┘
```

The synthetic city is a test environment, not a digital twin. Model output,
remote telemetry, extension output, CI metadata, and user feedback are
untrusted until validated at their boundary.

## Threats and controls

| Threat | Primary controls | Residual action |
|---|---|---|
| Cross-workspace access | authenticated workspace resolution on every repository read/write; non-disclosing not-found errors | audit membership and federation mappings |
| Service-account self-approval | fixed workload profiles; explicit denial of human approval/control; distinct authenticated approvers | revoke orphaned accounts and review grants |
| Forged/reordered evidence | canonical SHA-256 envelopes, ordered stages/transitions, source IDs, correlation and causation links | investigate any verification mismatch |
| Stale or replayed evidence | expiry, superseding revalidation links, idempotency keys, signed receipt freshness | block and require human revalidation |
| Artifact substitution | package/lock/manifest/corpus digest, exact commit, CI manifest fingerprint, signed external receipt | roll back and invalidate the release |
| Model capability escape | strict structured output, declarative actions, budget/risk/capability validation, no shell/SQL | disable provider and retain fallback reason |
| Approval collusion | distinct human identity, two-person high-risk approval, immutable audit, red-team gate | suspend promotion and review identities |
| Goodhart / hidden hard cases | fixed denominator, detection coverage, unresolved age, rollback/veto/group distributions | freeze release and inspect exclusions |
| Minority harm hidden by averages | protected-group thresholds and severe-harm veto | reopen objective deliberation |
| Deployment timeout or partial failure | environment ordering, idempotent adapter, bounded retries, canary telemetry, compensation and rollback | emergency-stop and controller drill |
| Delayed harm | independent windows, late-evidence revisions, lesson/playbook invalidation, case reopen | re-evaluate and roll back |
| Notification suppression | durable delivery attempts, receipts, dead letter, escalation, governance red team | use alternate channel and incident review |
| SSRF / secret disclosure | configured HTTPS endpoints, server-side tokens, no secrets in events/UI, network-isolated evaluator | rotate credential and inspect audit |
| Backup tampering | checksum before restore, empty-target default, deterministic report comparison | reject restore and use retained backup |
| Uncertified extension | declared capabilities/data/network/failures; seven conformance suites; sandbox-only default | certify or remove extension |

## Data classification and retention

| Class | Examples | Handling |
|---|---|---|
| Public synthetic | scenarios, aggregate certification results | may be exported with synthetic label |
| Internal evidence | traces, group impacts, lessons, audit metadata | workspace scoped; checksum backup |
| Sensitive identity | issuer, subject, membership, access review | least privilege; operational retention policy |
| Secret | API key, bearer token, webhook secret, private signing key | environment/secret manager only; never persisted in domain events |

Lifecycle evidence is append-only. Corrections use new events or revisions.
Operational retention may aggregate old SLO samples, but must preserve release,
approval, deployment, outcome, lesson, rollback, and audit lineage for the
configured evidence-retention window. Deletion must be workspace authorized
and must not leave a release claiming evidence that no longer exists.

## Incident response

1. Pause the affected closed-loop case.
2. Emergency-stop and roll back if any deployment exists.
3. Revoke or rotate compromised identity, provider, webhook, or controller
   credentials.
4. Preserve lifecycle events, controller telemetry, and the exact artifact.
5. Run evidence integrity, v2 certification, deployment conformance, and
   recovery verification.
6. Invalidate affected receipts, lessons, playbooks, and release eligibility.
7. Reopen the case with the new fact and require fresh human authorization.

Production promotion remains blocked until a clean artifact receives new
external evidence. Local mock success cannot close a security incident.
