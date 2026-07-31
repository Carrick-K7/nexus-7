# v3 Direction Verification

> Scope: first Symbiotic Shenzhen world vertical slice
>
> Status: local implementation evidence only; external evidence pending
>
> Date: 2026-07-18

## Verified locally

`npm run verify:symbiosis` runs two independent 365-Turn worlds from the same
frozen inputs and fails unless their final settlements are byte-equivalent,
all final resource ledgers conserve integer balances, and the foreground
resident count is exactly 260.

Current local result:

| Gate | Result |
|---|---:|
| Turns | 365 |
| Final simulation date | 2027-07-18 |
| Foreground residents | 260 |
| Background population calibration | 18,248,500 |
| Exact numeric replay | pass |
| Final resource conservation | pass |
| Model provider required | no |
| Model reasoning stored | no |

The unit suite checks the locked resident mix, adult/pseudonymous boundary,
five safe-routine-only participant seats, ten topology/cohort cells, background
cohort total, stale-head rejection, privacy projection, historical snapshots,
null RALR at zero denominator, runtime/migration SQL equality, and the frozen
data-manifest SHA-256.

The browser suite calls the production-built APIs through Chromium and checks
the 260-resident snapshot, participant-avatar offline boundary, private-memory
exclusion, event projection and null RALR denominator.

## Compatibility evidence

After the v3 slice:

- all 224 enabled unit tests pass; 16 environment-dependent tests skip;
- Chromium/axe passes 22/22;
- lint has zero warnings and the production build passes;
- dependency audit reports zero vulnerabilities;
- v2 certification remains VBCR 80%, detection 100%, replay 100%, causal
  completeness 100%, injected rollback 100% and zero severe escapes;
- v1 10,000-tick replay and invariant stability still pass;
- city, diagnosis, planning, outcome, participation, deployment, operations
  and deterministic model-provider acceptance commands still pass.

## Conditional evidence

The new PostgreSQL integration test uses `TEST_DATABASE_URL`. The expanded
checksum backup/restore test additionally uses `TEST_RESTORE_DATABASE_URL`.
Neither variable was present in this local run, so those tests remain
condition-skipped. Runtime/migration SQL parity and TypeScript contract checks
passed, but that is not a substitute for a real PostgreSQL execution.

No remote commit, CI receipt, Sigstore attestation, live provider, privacy
review, constitutional approval or human-pilot evidence exists for this
working tree. v3 must not be called certified or production-ready.
