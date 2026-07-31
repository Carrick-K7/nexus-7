# ADR-0031: Independent trust-domain matrix

**Status:** Accepted for v4.8 on 2026-07-31.

## Context

v4.7 made local scientific replication portable, but four materially different
claims were still easy to collapse in prose: an external runner executed the
bundle, a backup restored on another host, a live DeepSeek shadow actually ran,
and production remained continuous for 90 elapsed days. Local tests cannot
prove any of those facts.

The prior recovery artifact also allowed an operator to add `--off-host`
without recording distinct source and target identities. That scope disclosure
was useful but not sufficient for a public trust gate.

## Decision

1. Publish `nexus.symbiosis-trust-matrix.v1` as a read-only projection with five
   independent lanes and no weighted aggregate score.
2. Model lane states as verified, pending, failed or stale. Only five verified
   lanes produce an overall verified state.
3. Verify local bundle hashes at read time. External proof additionally
   requires a fresh signed remote-evidence receipt for the exact deployed
   revision and artifact bytes.
4. Add dedicated remote evidence kinds for symbiosis replication and off-host
   recovery. Receipt issuance first verifies GitHub Sigstore provenance and
   denies self-hosted runners.
5. Require distinct SHA-256 source/target host fingerprints whenever recovery
   claims off-host scope. The signed recovery envelope must also prove checksum,
   row counts, latest fingerprint and resumed write.
6. Derive live-provider status only from persisted DeepSeek shadow attempts,
   comparable results and returned Token usage. A configured provider string is
   not evidence by itself.
7. Derive elapsed-time status only from restart-safe runtime envelopes and
   sequence/revision/freshness gates. Reference clocks cannot satisfy it.
8. Keep all lanes observational. Their state never enters deterministic world
   settlement and missing external systems never halt the city.

## Consequences

- Human observers can see exactly which trust domain remains unproven.
- CI and off-host drills have executable receipt paths, but credentials,
  infrastructure and 90 elapsed days remain real external dependencies.
- A same-host restore remains useful evidence without being promoted to an
  off-host pass.
- Short-lived receipts must be renewed and can visibly become stale.
- No new city persistence table is required because the matrix projects
  existing Turn/provider records and immutable external artifacts.
