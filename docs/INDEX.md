# Documentation Index

This index separates current authority, retained safety-kernel contracts,
historical decisions and generated evidence.

## Current v4 authority

- `SYMBIOSIS_CONSTITUTION.md` — permanent autonomous experiment constitution;
- `SYMBIOTIC_SHENZHEN_PLAN.md` — product boundary and post-v4 priorities;
- `V4_ARCHITECTURE.md` — runtime, cognition and persistence boundaries;
- `HUMAN_OBSERVATORY.md` — public reading order and metric semantics;
- `V4_DATA_GOVERNANCE.md` — allowed data and prohibited ingress;
- `V4_VERIFICATION.md` — reference verification;
- `V4_REPLICATION.md` — portable scientific-replication protocol;
- `V4_OPERATIONS.md` — deployment and observation;
- `V4_DEPLOYMENT_ATTESTATION.md` — bound production evidence.

## Retained v2 safety kernel

`CLOSED_LOOP_PLAN.md`, `CLOSED_LOOP_ORCHESTRATION.md`,
`V2_VERIFICATION.md`, `PRODUCTION.md`, `THREAT_MODEL.md`,
`GOVERNANCE.md`, `EXTENSIONS.md` and the domain-specific v1.x documents
define release governance, rollback, recovery and compatibility. Human
administrators in these documents are outside the simulated city.

## Historical record

- `adr/` contains immutable architectural decisions;
- `archive/v3-prototype/` contains superseded prototype documentation;
- `iterations/` contains one source manifest per release or development
  milestone. Historical rejected directions remain visible as history.

## Generated evidence

`scripts/inject-git-log.js` generates only
`public/data/iteration-manifests.json` from `iterations/` and Git history.
Verification scripts own the other tracked `public/data/*.json` artifacts.
The generated files are projections, never sources of truth.

`.artifacts/`, `backups/`, `test-results/`, `.next/` and
`tsconfig.tsbuildinfo` are ignored local outputs and must not be committed.
