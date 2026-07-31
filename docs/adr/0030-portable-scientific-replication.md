# ADR 0030: Portable scientific replication bundles

## Status

Accepted for v4.7 on 2026-07-31.

## Context

The v4.6 mechanism study was deterministic and well tested, but its results
were still easiest to trust inside the NEXUS-7 repository. A scientific claim
needs a frozen question, unused seeds, explicit negative controls, portable
inputs, an independent integrity digest and a command that works without
production credentials. Local reproducibility must also remain distinct from
external CI provenance or independent-laboratory replication.

The earlier v4.6 study is exploratory. Calling its already observed
hypotheses “preregistered” would be misleading. v4.7 may instead publish a
prospective replication plan for those exploratory results and use newly
named, previously unused seeds.

## Decision

NEXUS-7 publishes `nexus.symbiosis-replication-bundle.v1` with:

- seven fixed replication hypotheses and their analysis rules;
- four held-out seeds across reciprocal, hierarchy and segregation regimes;
- two complete executions of every scenario and SHA-256 result digests;
- denominator-visible RALR, refusal, withdrawal, coercion, severe escape,
  needs and reversible-society outcomes for every run;
- deterministic-primary/diversity-shadow and diversity-primary controls;
- SHA-256 hashes for all required source, lockfile and calibration inputs;
- an internal bundle digest and a verifier that rejects input, result or
  envelope tampering;
- one credential-free reproduction command: `npm ci && npm run verify:v47`.

The bundle records the local source lock honestly. Its external timestamp,
external CI verification and Sigstore receipt remain null/false until evidence
from another trust domain exists. GitHub Actions can upload and attest the
bundle, but workflow source alone is not a receipt.

The Human Observatory presents the local result, the exact hash, the command
and the missing external proof together. It must never collapse those states
into one “verified” badge.

## Consequences

- Another clean environment can reproduce the frozen results without database,
  provider or production secrets.
- Failed seeds remain visible; means cannot hide per-run conservation or
  coercion failures.
- Hierarchy and segregation remain non-deployable controls.
- The committed bundle is immutable evidence for its hashed inputs; changing
  any input requires generating a new bundle and versioned release.
- A passing local bundle does not satisfy off-host recovery, live DeepSeek,
  elapsed 90-day production or external Sigstore gates.
