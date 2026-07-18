# Operational Intelligence Runbook

> Contract: `nexus.operational-acceptance.v1`
> Release: v1.4.0

## Scope

The operations plane persists six health sources: `model`, `deployment`,
`recovery`, `worker`, `evidence`, and `policy`. Records are isolated by
organization/workspace and expose stable IDs, dimensions, timestamps, actor
identity, raw evidence links and canonical aggregation.

The Operations Center is available from **Operations**. Operators can filter
source, metric, environment, artifact/version and time, inspect hour/day
trends, acknowledge or resolve incidents, audit deliveries and receipts,
review access risks, inspect drills, and export raw JSON or spreadsheet-safe
CSV.

## Processes

Start the PostgreSQL-backed collector and notification worker:

```bash
DATABASE_URL=postgresql://... npm run worker:operations
```

Only one worker holding the `operational-intelligence` lease performs a cycle.
Each cycle collects current subsystem telemetry, enforces access expiry,
processes due deliveries and deletes raw samples older than the configured
retention. Standby workers are fenced out.

Configuration:

- `NEXUS_OPERATIONS_INTERVAL_MS`: cycle interval, minimum 10 seconds;
- `NEXUS_OPERATIONS_WORKER_ID`: stable operator-visible worker identity;
- `NEXUS_SLO_RAW_RETENTION_DAYS`: 30–3650 days, default 90;
- webhook secrets are referenced by each channel's `secretEnvName`; secret
  values are never returned by the API or written to audit payloads.

## Alert lifecycle

```text
sample → rule evaluation → suppression/budget check
       → open or update incident → signed delivery
       → retry/backoff → delivered + receipt | dead-letter
       → acknowledge → resolve → later breach reopens
```

An occurrence is suppressed when an active maintenance window, explicit
suppression or per-rule storm budget matches it. Suppression is recorded rather
than discarded. Escalation deliveries are cancelled if the incident is no
longer open when their delay expires.

Operators should:

1. inspect the linked raw sample and affected dimensions;
2. acknowledge only after ownership is explicit;
3. resolve with a concrete outcome, not “fixed”;
4. inspect delivery receipts or the dead-letter reason;
5. create a bounded suppression only when the underlying risk is understood.

## Access recovery

Delegated duties are fixed packages:

- `identity-manager`: membership and service-account lifecycle;
- `access-reviewer`: review campaigns and revocation;
- `operations-admin`: alerts, incidents and notification configuration.

Identity management and access review cannot be delegated to the same subject.
Overdue pending review items are automatically revoked.

Break-glass flow:

1. an active human member declares purpose, exact permissions and a 5–60 minute
   TTL;
2. two distinct human administrators approve; the requester cannot approve;
3. permissions are computed dynamically and disappear at expiry;
4. the worker persists expiry and a required post-event review;
5. an independent administrator closes the review as appropriate or a policy
   violation.

## Deployment controller certification

Run the versioned reference conformance suite:

```bash
npm run verify:deployment-contract
```

The report covers success, duplicate request idempotency, 503 retry, timeout,
invalid/partial payload, out-of-order telemetry, lost rollback acknowledgement,
rollback idempotency and injected failure recovery. The canonical report is
written to `.artifacts/deployment-controller-conformance.json`.

A real controller must return its own externally retained and attested report;
the reference fixture does not certify a production endpoint.

## v1.4 acceptance

Run:

```bash
npm run verify:operations
```

The deterministic acceptance creates 31 days (744 hours) of raw telemetry and
proves:

- 744 hourly and 31 daily aggregates;
- every raw sample appears in exactly its hour and day buckets and remains
  retrievable by ID;
- repeated breaches deduplicate into one incident;
- an injected webhook outage reaches one visible dead letter after five tries;
- dual-approved break-glass expires and loses authority automatically;
- all deployment-controller chaos checks pass.

Output is schema-versioned and fingerprinted at
`.artifacts/operational-acceptance.json`.

## Failure handling

- **Worker lease stale:** inspect the `worker.lease-age` incident, stop the old
  worker if necessary, then start one replacement. Do not run unleased manual
  loops.
- **Notification dead letter:** verify endpoint ownership, certificate,
  secret version and receiver receipt; repair the channel, then create a new
  incident event rather than rewriting delivery history.
- **Alert storm:** identify the root dimensions, use a short explicit
  suppression or maintenance window, and preserve suppressed occurrences.
- **Access review overdue:** the safe outcome is revocation. Restore access
  through a new reviewed grant, not by editing the campaign.
- **Controller conformance failure:** keep the adapter in sandbox and do not
  promote production traffic.

## Evidence boundary

Unit, PostgreSQL, browser, reference-controller and 31-day synthetic reports
prove implementation behavior. They do not prove delivery to a real on-call
system, a live deployment controller, a production OIDC issuer or remote
attestation. Those claims require exact external receipts bound to the release
artifact.
