# ADR 0040: Remove the External-Attestation Requirement

- Status: accepted (2026-08-01, constitutional decision by the human
  governor)
- Applies to: v4.9.0 and later

## Context

The v4.8 independent-trust design required five independently verified lanes:
local replication, external CI + Sigstore receipt, distinct-host recovery,
live DeepSeek shadow and 90 elapsed production days. Three of those lanes
depend on human-held credentials or paid provider access (receipt signing
key, backup URL provisioning, DeepSeek API key). The human governor
explicitly stated the laboratory is autonomous and they only observe
results; they did not intend to perform operator credential workflows.

## Decision

External attestation is no longer a requirement. The trust matrix becomes the
autonomous two-lane evidence matrix:

1. local byte-exact replication of the committed bundle;
2. 90 elapsed production days with intact runtime integrity.

The receipt issuance/ingestion machinery, off-host recovery workflow and
provider-shadow support remain in the repository, dormant, fail-closed and
tested, so the capability can be re-enabled by a future decision without
archaeology. Nothing in this decision admits real-person participation,
private input, denominator manipulation or real-world policy claims.

## Consequences

- `/api/observatory/v2/trust` contract becomes
  `nexus.symbiosis-trust-matrix.v2` with two lanes and
  `externalAttestationNotRequired: true`.
- The Human Observatory shows two autonomous gates and no longer reports
  `1/5` or external-lane pending states.
- The roadmap is freed from operator-credential waiting; the science program
  (hypothesis campaigns, long-horizon studies) becomes the next objective.
- The 90-day lane still completes on its own and remains the only timed gate.
- Archived receipt code must not be presented as live attestation.
