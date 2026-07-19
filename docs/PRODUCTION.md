# Production Operations

> Symbiotic Shenzhen v4 runtime details, City Lens probes and worker alerts are
> maintained in [`V4_OPERATIONS.md`](V4_OPERATIONS.md). v4 is all-synthetic and
> requires a separate `worker:symbiosis` process; it does not require a live
> model provider.

## Identity

NEXUS-7 has four explicit authentication modes:

| Mode | Intended use | Trust boundary |
|---|---|---|
| `development` | Local development and browser tests | `X-Nexus-Actor` / `X-Nexus-Role` |
| `public-observer` | Anonymous AI-city observation | Fixed viewer; asserted identity headers ignored; no mutation permission |
| `oidc` | API clients and browser sessions that can send a Bearer token | Issuer, audience, expiry, signature, and subject verified against JWKS |
| `proxy` | Same-origin browser deployment behind an identity-aware proxy | HMAC-signed subject and role bound to method, path, and timestamp |

Production defaults to `oidc` when `NEXUS_AUTH_MODE` is unset. Development
headers are ignored in every non-development mode.

`public-observer` is the production mode for the standalone AI city. The
reverse proxy must additionally reject methods other than GET, HEAD and
OPTIONS. Use OIDC or signed proxy mode for a separate operator control plane;
never expose `development` mode without an authentication boundary.

Authentication claims are not authorization records. After cryptographic
verification, the exact issuer/subject must resolve to an active persisted
workspace membership or service account. Configure the first durable
administrator with the `NEXUS_BOOTSTRAP_ADMIN_*` variables, then manage
lifecycle through `/api/governance/access`.

For OIDC, configure:

```text
NEXUS_AUTH_MODE=oidc
NEXUS_OIDC_ISSUER=https://identity.example.com/
NEXUS_OIDC_AUDIENCE=nexus-7
NEXUS_OIDC_JWKS_URL=https://identity.example.com/.well-known/jwks.json
NEXUS_OIDC_ROLE_CLAIM=roles
NEXUS_OIDC_WORKSPACE_CLAIM=workspace_id
NEXUS_OIDC_PRINCIPAL_TYPE_CLAIM=principal_type
NEXUS_OIDC_ROLE_MAP={"nexus-viewer":"viewer","nexus-operator":"operator","nexus-admin":"admin"}
```

For federated human and workload providers, set
`NEXUS_OIDC_PROVIDERS_JSON`. Each entry has an exact issuer, audience, JWKS URL,
optional static workspace/principal type, and exact required claims. GitHub
Actions should use `staticPrincipalType=service-account` plus repository and
workflow claim restrictions. The persisted service account adds the final
exact issuer/subject and workload-kind binding.

For proxy mode, the proxy must remove every inbound `x-nexus-auth-*` header,
authenticate the user, and inject:

```text
x-nexus-auth-subject
x-nexus-auth-role
x-nexus-auth-workspace
x-nexus-auth-principal-type
x-nexus-auth-timestamp
x-nexus-auth-signature
```

The signature is `v1=<hex HMAC-SHA256>` over:

```text
v1
UPPERCASE_METHOD
/request/path
subject
role
workspace
principal_type
unix_timestamp_milliseconds
```

Use a random secret of at least 32 characters and do not expose the Next.js
origin directly around the proxy.

Every repository read and mutation enforces the authenticated workspace.
Service accounts use fixed CI, worker, or deployment-controller permission
profiles intersected with role permissions. They cannot administer workspaces,
activate policy, or approve a promotion.

## Model provider

`NEXUS_MODEL_PROVIDER=deterministic-mock` is the reproducible default.
`NEXUS_MODEL_PROVIDER=openai` enables the server-side OpenAI Responses provider.
The provider:

- keeps `OPENAI_API_KEY` on the server;
- requests strict JSON-schema Structured Outputs through `text.format`;
- validates capability, risk, token, cost, and timeout budgets after receipt;
- records model, prompt/policy version, usage, latency, and fallback reason;
- falls back to the deterministic mock when the provider fails policy or
  runtime checks.

OpenAI documents Structured Outputs for the Responses API under `text.format`
and recommends keeping API keys out of client code:

- <https://developers.openai.com/api/docs/guides/structured-outputs>
- <https://developers.openai.com/api/docs/guides/production-best-practices>

Review model availability and pricing before every production release. The
input/output rates are configurable because provider pricing is operational
data, not a simulation constant.

Run `npm run verify:model` on every change. Main-branch release evidence also
requires `npm run verify:model:live`: all 12 cases must pass with no fallback,
provider error, capability violation, or forbidden proposal, while remaining
inside recorded latency and spend SLOs. See `docs/MODEL_REGRESSION.md`.

## Independent clock

The production clock is a separate process:

```bash
DATABASE_URL=postgresql://... npm run worker:clock
```

Each cycle atomically acquires or renews `nexus_worker_leases`. A standby worker
does no work until the lease expires or is released. The run mutations still
use optimistic versions, so an operator racing the clock receives an explicit
conflict instead of silent overwrite.

Recommended process settings:

- at least two worker replicas;
- `NEXUS_CLOCK_INTERVAL_MS` aligned with the desired simulation cadence;
- a stable `NEXUS_CLOCK_WORKER_ID` containing the instance identity;
- termination grace longer than one tick;
- alert when `heartbeat_at` is older than the lease TTL.

## Backup and restore

Create a consistent `REPEATABLE READ` snapshot:

```bash
DATABASE_URL=postgresql://source \
  npm run db:backup -- backups/nexus.json
```

The JSON contains deterministic table ordering, row counts, and a SHA-256
checksum. Files are created with owner-only permissions and atomically renamed.

Restore into an empty database:

```bash
DATABASE_URL=postgresql://restore-target \
  npm run db:restore -- backups/nexus.json
```

Use `--force` only when intentionally replacing existing data. Restore verifies
the checksum before opening the transaction, truncates persistent tables,
restores foreign-key order, resets serial sequences, and clears worker leases.
Always run deterministic reports against restored runs before promoting the
database.

The weekly recovery workflow automates the source-to-second-database drill,
checks exact table equality, replay/report equality, lease clearing, sequence
recovery, and configured RPO/RTO. Evidence is retained and attested for 90 days.

## Deployment control

Production external canaries require:

```text
NEXUS_DEPLOYMENT_ADAPTER=http
NEXUS_DEPLOYMENT_BASE_URL=https://deployment-control.example.com/v1
NEXUS_DEPLOYMENT_TOKEN=...
```

The controller contract starts canaries, shifts traffic, returns telemetry,
promotes, rolls back, and injects scheduled drill failures. NEXUS-7 evaluates
request count, error rate, P95 latency, availability, and platform health
before each traffic increase. The first breach calls the platform rollback
endpoint and records critical evidence.

Every start request includes `development`, `staging`, or `production`.
Environment policy supplies traffic stages and SLOs. Staging requires a healthy
development promotion for the same repository/commit, and production requires
staging.

## Signed release policy

Provide `NEXUS_RELEASE_POLICY_PUBLIC_KEY_BASE64` and activate signed bundles
through `/api/governance/policies`. Set
`NEXUS_REQUIRE_SIGNED_RELEASE_POLICY=true` in production so new external
release proposals fail closed when no active signed policy exists.

## Closed-loop operations

v2 adds `closed-loop-case` and `deployment-record` aggregates to the existing
atomic lifecycle repository. Apply `0008_closed_loop_indexes.sql` before
enabling the API. The migration is additive and the v1 report, lifecycle
schema, and old backups remain readable.

The operating roles are:

| Permission | Intended principal |
|---|---|
| `closure:read` | viewer, operator, admin |
| `closure:operate` | operator or admin |
| `closure:control` | authenticated human admin only |

Service accounts are explicitly denied `closure:control`, even if a submitted
grant contains it. High-risk plan approval is independently checked by
Planning, so orchestrator access never becomes self-approval.

For each open case, alert on:

- stage deadline inside one hour or already expired;
- `blocked`, `emergency-stopped`, or required rollback without completion;
- unsuperseded expired approval or artifact evidence;
- severe guardrail escape count above zero;
- unresolved age outside the workspace SLO;
- deployment and case artifact fingerprints that differ.

Lifecycle optimistic revisions serialize concurrent commands. The deployment
contract makes repeated start, promote, and rollback requests idempotent after
a lost acknowledgement. The application adds per-process actor/workspace fixed
windows (default 120 reads and 30 mutations/minute, configurable through
`NEXUS_CLOSURE_READ_RATE_LIMIT` and
`NEXUS_CLOSURE_MUTATION_RATE_LIMIT`) and returns `429` plus reset/retry headers.
Also apply shared quotas at the ingress proxy: a multi-replica deployment must
not rely on process-local counters. The domain layer remains the final
protection against duplicate external actions and stale writes.

Closed-loop, approval, deployment, outcome, lesson, rollback, and release
evidence must remain available for at least the release-evidence retention
window (90 days by default). Do not prune a source record while a retained
release receipt, active lesson, appeal, or open case references it. SLO samples
may use the configured raw/aggregate retention policy.

### Operator runbook

1. Inspect the stage owner, deadline, prerequisites, linked source records, and
   exact artifact.
2. `pause` when evidence or ownership is uncertain.
3. If a deadline expired before deployment, inspect the recorded resource
   compensation; resume only with a reason, which renews the stage deadline.
4. If evidence expired, revalidate its real source. Resume appends a
   superseding envelope; history is never deleted.
5. Use `rollback` for a staged/monitoring case with a recoverable candidate.
6. Use `emergency-stop` for active harm, identity compromise, or unknown
   controller state. It rolls back when a deployment exists.
7. Confirm every environment is at baseline traffic and compensation is
   complete.
8. Require independent outcome disposition and a retained rollback lesson
   before closing. Reopen when delayed harm or corrected evidence arrives.

The default memory deployment adapter is a synthetic local laboratory. It must
never be exposed as a real production deployment. Production requires the HTTP
adapter, contract conformance, fresh controller evidence, signed policy, and a
human promotion.

### Recovery

After web-process or worker loss, restart against PostgreSQL and issue the same
idempotency key. The durable case revision identifies the committed transition;
the adapter returns the same external operation. If the external operation
succeeded but the aggregate commit did not, retry reconstructs or compensates
it rather than starting a second canary.

After database recovery:

1. verify the backup checksum before restore;
2. restore into a second database and compare table contents;
3. reconstruct the v1 report and representative closed-loop fingerprints;
4. confirm leases are cleared and sequences accept new writes;
5. run `npm run verify:closure`;
6. keep production promotion blocked until fresh external evidence binds the
   restored exact artifact.

See [CLOSED_LOOP_ORCHESTRATION.md](CLOSED_LOOP_ORCHESTRATION.md),
[V2_VERIFICATION.md](V2_VERIFICATION.md), and
[THREAT_MODEL.md](THREAT_MODEL.md).

## Symbiotic Shenzhen v4 AI-only runtime

Migration `0009_symbiotic_shenzhen_world.sql` defines normalized AI-only world
tables and season-hash partitions. Migration `0010_ai_only_world.sql` removes
the abandoned participant intent/private-memory tables and rejects any
database that still contains participant-avatar rows.

The dedicated `worker:symbiosis` process advances one atomic Turn per interval.
Do not expose `WorldService.advanceTurn` as an HTTP route or attach it to the
v2 experiment clock.

The public APIs are anonymous read-only projections. The city has no identity
vault, private text, participant input or resident authentication.

## Release checklist

1. Apply migrations.
2. Run PostgreSQL repository and backup/restore integration tests.
3. Run `npm run check`, including `npm run verify:closure`, and
   `npm run verify:stress`.
4. Run `npm run evaluate:isolated -- quality`.
5. Run the live model regression against the release prompt/model.
6. Generate the evidence manifest, then rerun `npm run verify:closure` so the
   final certification binds that exact manifest fingerprint.
7. Verify the external CI provenance attestation and issue an expiring receipt.
8. Verify current remote evidence freshness and active signed policy.
9. Attach the receipt and obtain human-admin approval.
10. Confirm v2 reports `implementationComplete=true`; do not claim
    `productionVerified=true` until its fresh external receipt matches.
11. Promote the same artifact through development, staging, and production.
12. Perform a deployment canary and rollback drill.
13. Verify the most recent database recovery drill is inside RPO/RTO.
14. Start redundant clock workers and verify lease ownership.
