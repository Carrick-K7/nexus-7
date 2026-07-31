# Scheduled Operations Drills

NEXUS-7 rehearses database recovery and deployment rollback independently of
ordinary unit tests.

## Database recovery

`npm run ops:recovery-drill` requires separate source and restore databases.
It:

1. creates and advances a durable fixture run;
2. acquires a worker lease;
3. captures a repeatable-read, checksum-bound backup;
4. force-restores only the designated recovery database;
5. compares the complete persistent table snapshot;
6. verifies deterministic replay and report equality;
7. proves worker leases were cleared;
8. advances the restored run to prove sequence and write recovery;
9. evaluates the configured RPO and RTO.

Defaults are a 60-second RPO and a 120-second RTO.

## Deployment rollback

`npm run ops:deployment-drill` uses the configured deployment adapter. It:

1. starts a 5% canary;
2. shifts to 25%;
3. asks the platform to inject a bounded drill failure;
4. reads deployment telemetry;
5. verifies the fault crossed an SLO;
6. calls the platform rollback endpoint;
7. verifies candidate traffic returned to 0%;
8. evaluates the 60-second rollback-time objective.

Production drills require the HTTP adapter and server-side deployment token.
The in-memory adapter is only a deterministic contract implementation for
development and tests.

## Retention

`.github/workflows/operations-drills.yml` runs weekly. Recovery and rollback
reports are retained as GitHub Actions artifacts for 90 days and independently
attested with Sigstore. After the workflow completes,
`.github/workflows/evidence-receipts.yml` downloads each report, verifies
repository/workflow/commit/subject provenance with GitHub CLI, and signs a
seven-day application receipt. `POST /api/governance/evidence` verifies and
stores that receipt. When `NEXUS_GOVERNANCE_BASE_URL` is configured as a
repository variable, the workflow uses GitHub OIDC to ingest receipts
automatically without a long-lived API key. The Verification Center renders retained history and
marks drill evidence current, expiring, stale, or missing.

Raw operational SLO samples use `NEXUS_SLO_RAW_RETENTION_DAYS` (90 days by
default, never less than 30). The leased operations worker enforces deletion;
hour/day buckets returned by the API list their contributing raw sample IDs.
The deterministic 31-day aggregation and chaos gate is
`npm run verify:operations`. See `OPERATIONAL_INTELLIGENCE.md`.
