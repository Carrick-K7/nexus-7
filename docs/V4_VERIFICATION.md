# v4 All-Synthetic Symbiosis Verification

> Date: 2026-07-19
>
> Status: local implementation complete / external evidence pending

## Reference gate

`npm run verify:symbiosis` executes two independent 365-Turn reciprocal worlds
and a 3-regime × 3-seed × 90-Turn study. It fails unless world fingerprints are
exact, every resource ledger conserves balances, relationship traces are
complete, the reciprocal regime is unforced, hierarchy coercion is detected,
and segregation keeps an honest null denominator.

| Gate | Local result |
|---|---:|
| Foreground residents | 260 autonomous synthetic residents |
| Resident mix | 200 synthetic human / 36 software AI / 24 robot |
| Exact 365-Turn replay | pass |
| Resource conservation | pass |
| Resolved reciprocal episodes | 725 |
| RALR | 76.97% |
| Relationship trace completeness | 100% |
| Active-regime coercive actions | 0 |
| Severe consent / continuity / irreversible harm escapes | 0 / 0 / 0 |
| 3×3×90 control separation | pass |
| Model reasoning persisted | no |
| Unit / conditional skip | 227 / 16 |
| PostgreSQL integration / restore | 16 / 16 |
| Playwright + axe | 24 / 24 |
| lint / audit / build | 0 warning / 0 vulnerability / pass |

The multi-season reference reports reciprocal RALR 73.33% across 525 resolved
episodes, zero reciprocal coercion, 139 detected hierarchy coercions with RALR
0, and `null` RALR for the segregated zero-denominator control.

## Provider and persistence gates

The cognitive contract tests validate DeepSeek Chat Completions JSON output,
discard returned reasoning content, reject invalid actions, and use an explicit
deterministic fallback for 5xx failures and the monthly budget cap.

Memory and PostgreSQL share season, resident, relationship, commitment,
reciprocal-episode, decision, Turn and event contracts. PostgreSQL writes a
Turn, snapshot, needs, resource ledgers, social state and model decisions in one
transaction guarded by the expected head Turn.

`TEST_DATABASE_URL` enables the real PostgreSQL repository suite.
`TEST_RESTORE_DATABASE_URL` additionally enables destructive checksum
backup/restore verification. Skipped environment gates are not passes.

## Browser gate

The production-built Playwright/axe suite must verify:

- City Lens renders in English and Chinese;
- MapLibre failure never removes the accessible community table/report;
- snapshot, event, resident, report and multi-season APIs exclude private data;
- mobile navigation, keyboard focus and reduced motion remain usable;
- every legacy v1/v2 view and certification panel still renders.

## Trust boundary

These values are generated from the local working tree. They do not represent a
remote commit, CI/Sigstore receipt, live DeepSeek result, production recovery
drill or claim about real humans. A deployment may be called live only after
its exact commit, database, service health, TLS route and observation APIs are
checked independently.
