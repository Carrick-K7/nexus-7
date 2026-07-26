# Security Threat Model

> Scope: NEXUS-7 v2 closed-loop safety kernel and v4 AI-only synthetic
> Shenzhen
> Boundary: synthetic decisions only; no authority over real city systems

## Protected assets

- exact release artifact and external provenance;
- workspace membership, human identity, and approval separation;
- append-only incident, decision, deployment, outcome, lesson, and audit data;
- deterministic scenario truth, seeds, policy versions, and replay evidence;
- deployment-controller credentials, OIDC keys, webhook secrets, and model API
  keys;
- guardrails, group-impact evidence, rollback inverses, recovery backups and
  encrypted recovery receipts;
- v4 resident pseudonyms, consent/commitment state, AI continuity snapshots,
  Turn seeds and resource ledgers.

Secrets are configuration, never domain evidence. Hidden model
chain-of-thought is neither requested nor stored.

## Trust boundaries

```text
browser / API client
        ↓ anonymous read-only or authenticated operator request
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
| Shadow-to-primary privilege creep | distinct provider objects and budgets; shadow result is evidence only and has no settlement or fallback path | stop shadow calls, verify control fingerprint and require a governed release for promotion |
| Provider retry double billing | stable caller request ID and contract header; persisted attempts and actual billing; no claim that the remote provider deduplicates | reconcile provider invoice and stop calls at the hard budget |
| Homogeneous cognition hidden | comparison denominator, disagreement, homogeneity, fallback-bias, failure and budget-skip projections | retain deterministic/diversity controls and investigate missing comparisons |
| Approval collusion | distinct human identity, two-person high-risk approval, immutable audit, red-team gate | suspend promotion and review identities |
| Goodhart / hidden hard cases | fixed denominator, detection coverage, unresolved age, rollback/veto/group distributions | freeze release and inspect exclusions |
| Minority harm hidden by averages | protected-group thresholds and severe-harm veto | reopen objective deliberation |
| Deployment timeout or partial failure | environment ordering, idempotent adapter, bounded retries, canary telemetry, compensation and rollback | emergency-stop and controller drill |
| Delayed harm | independent windows, late-evidence revisions, lesson/playbook invalidation, case reopen | re-evaluate and roll back |
| Notification suppression | durable delivery attempts, receipts, dead letter, escalation, governance red team | use alternate channel and incident review |
| SSRF / secret disclosure | configured HTTPS endpoints, server-side tokens, no secrets in events/UI, network-isolated evaluator | rotate credential and inspect audit |
| Backup theft or tampering | mode-0600 AES-256-GCM key, authenticated encrypted artifact, checksum before restore, empty-target default, deterministic report comparison | reject restore, rotate key and use a retained clean artifact |
| Misstated recovery locality | checksum-backed receipt records restore database identity and explicit same/off-host scope | never promote same-host evidence to off-host without an operator-attested drill |
| Uncertified extension | declared capabilities/data/network/failures; seven conformance suites; sandbox-only default | certify or remove extension |
| Real-data contamination | allowlisted frozen aggregates; `containsPersonalData=false`; no identity/input tables; restore rejects deprecated participant rows | stop Turns, quarantine bundle/backup and rebuild from a clean seed |
| Synthetic context exfiltration | structured allowlisted provider payload; no free-form private text; reasoning discarded; server-side keys | stop provider, rotate key and audit decision envelopes |
| Relationship coercion | continuous versioned consent; refusal without penalty; withdrawal/exit; dependency and exit-cost metrics | pause relationship mechanisms and debrief |
| AI continuity destruction | consent for copy/merge/rewrite/delete/non-emergency stop; redundant snapshots; appeal and event lineage | emergency pause, restore without silent identity reset |
| Species-fixed triage | irreversible-harm-first ordering with urgency and substitutability; retained distribution evidence | human review and counterfactual replay |
| Resident prompt injection | messages are untrusted data; schema-only candidate actions; capability/world gates; no shell/SQL | delay cognition and use deterministic routine |
| Cost/provider outage | daily quotas, monthly hard breaker, pinned decision envelopes, deterministic city fallback | stop external calls without stopping Turns |
| Geographic misrepresentation | frozen official aggregate catalog; coarse topology; fictional communities; no precise addresses | withdraw dataset and correct all reports |

## Data classification and retention

| Class | Examples | Handling |
|---|---|---|
| Public synthetic | scenarios, aggregate certification results | may be exported with synthetic label |
| Internal evidence | traces, group impacts, lessons, audit metadata | workspace scoped; checksum backup |
| Sensitive identity | issuer, subject, membership, access review | least privilege; operational retention policy |
| Secret | API key, bearer token, webhook secret, private signing key | environment/secret manager only; never persisted in domain events |
| v4 research | pseudonymous needs, consent, commitment, Turn and resource evidence | read-only public projection; small-group suppression; checksum backup |

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
