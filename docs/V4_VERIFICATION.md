# v4 All-Synthetic Symbiosis Verification

> Date: 2026-07-19
>
> Status: v4.1 reference and AI-only hardening verified / production update
> pending / external CI-Sigstore and live-provider evidence pending

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
| Unit / conditional skip | 228 / 16 |
| PostgreSQL integration / restore | 16 / 16 |
| Playwright + axe | 24 / 24 |
| lint / audit / build | 0 warning / 0 vulnerability / pass |

## v4.1 AI-only hardening gate

- `public-observer` ignores asserted actor, admin-role and Bearer headers;
- its resolved viewer has read permissions only, and a direct mutation returns
  HTTP 403;
- the public proxy contract permits GET, HEAD and OPTIONS only;
- fresh databases expose only synthetic-human, software-AI and robot resident
  kinds and contain no adult, human-intent or private-memory field/table;
- migration 0010 aborts before mutation if participant-avatar rows exist;
- a checksum-valid legacy backup is accepted only when deprecated participant
  tables are empty;
- 12 real PostgreSQL files pass 16/16, including independent restore;
- production build and 24/24 Playwright/axe checks pass.

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

The reference values above are generated from the tagged source and do not
represent a claim about real humans. Tag `v4.0.0` and its direction branch are
remote, and exact commit `f4d428a` remains the active v4.0 artifact while the
v4.1 production update is pending. Its database state, services, TLS,
protected route and observation APIs were checked on 2026-07-19. Deployment
history is recorded in `docs/V4_DEPLOYMENT_ATTESTATION.md`.

Remote CI/Sigstore, live DeepSeek and an external second-database recovery
drill remain pending and must not be inferred from the production deployment.
