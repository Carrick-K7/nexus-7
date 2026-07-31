# ADR 0008: Production Evidence Boundary

- Status: Accepted
- Date: 2026-07-16
- Target release: v1.1.0

## Context

v1 proved deterministic autonomy inside the application, but production trust
also depends on identity, model credentials, process lifetime, durable
recovery, build provenance, execution isolation, and deployment monitoring.

## Decision

NEXUS-7 separates those concerns into explicit boundaries:

- identity is verified by OIDC/JWKS or an HMAC-signed trusted proxy;
- external models are server-side, untrusted proposal providers with strict
  schema, budgets, policy validation, and deterministic fallback;
- the simulation clock runs as a leased PostgreSQL worker;
- backups are checksum-verified consistent logical snapshots;
- code quality runs inside a networkless, read-only, resource-limited container;
- CI emits a hash-bound evidence manifest and external Sigstore provenance;
- canaries compare against synchronized shadow baselines and auto-rollback on
  SLO breaches.

The browser and model provider cannot directly deploy code, change
authorization policy, or bypass promotion evidence.

## Consequences

- Local evidence is useful but cannot impersonate external CI evidence.
- Production operation requires PostgreSQL and a trusted identity boundary.
- Missing model credentials do not break deterministic mode.
- Recovery and rollback can be rehearsed without modifying the source run.
- External deployment adapters remain future work, but their evidence contract
  is now defined.
