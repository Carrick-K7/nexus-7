# v4 Simulated Symbiosis Verification

> Date: 2026-07-19
>
> Status: v4.3.2 Chromatic City Shell locally verified / production pending /
> external CI-Sigstore and live-provider evidence pending

## Reference gate

`npm run verify:symbiosis` executes two independent 365-Turn reciprocal worlds
and a 3-regime × 3-seed × 90-Turn study. It fails unless world fingerprints are
exact, every resource ledger conserves balances, relationship traces are
complete, the reciprocal regime is unforced, hierarchy coercion is detected,
and segregation keeps an honest null denominator.

| Gate | Local result |
|---|---:|
| Foreground residents | 260 software-simulated residents |
| Resident mix | 200 human / 36 AI / 24 robot |
| Exact 365-Turn replay | pass |
| Resource conservation | pass |
| Resolved reciprocal episodes | 725 |
| RALR | 76.97% |
| Relationship trace completeness | 100% |
| Active-regime coercive actions | 0 |
| Severe consent / continuity / irreversible harm escapes | 0 / 0 / 0 |
| 3×3×90 control separation | pass |
| Model reasoning persisted | no |
| Unit / conditional skip | 229 / 16 |
| PostgreSQL integration / restore | 16 / 16 |
| Playwright + axe | 25 / 25 |
| lint / audit / build | 0 warning / 0 vulnerability / pass |

## v4.1 AI-only hardening gate

- `public-observer` ignores asserted actor, admin-role and Bearer headers;
- its resolved viewer has read permissions only, and a direct mutation returns
  HTTP 403;
- the public proxy contract permits GET, HEAD and OPTIONS only;
- fresh current databases expose only human, AI and robot resident kinds and
  contain no adult, human-intent or private-memory field/table;
- migration 0010 aborts before mutation if participant-avatar rows exist;
- a checksum-valid legacy backup is accepted only when deprecated participant
  tables are empty;
- 12 real PostgreSQL files pass 16/16, including independent restore;
- production build and 24/24 Playwright/axe checks pass.

## v4.2 Human Observatory gate

- the default page explains purpose, boundary, Turn and reading order;
- `nexus.human-observatory.v1` projects exactly 260 units, 24 institutions and
  eight production stages from the shared world state;
- software-control coverage is 100%, real-human labor dependency is 0%, and
  dynamic continuity remains separate;
- all mood, engagement, integrity and institution formulas are versioned and
  disclaim emotion/consciousness claims;
- desktop, mobile, Chinese, unit drill-down and WCAG A/AA checks pass;
- 229 unit, 16 real PostgreSQL/restore and 25 browser checks pass.

## v4.3 Living City Flow gate

- domain, PostgreSQL and Observatory v2 expose only `human`, `ai` and `robot`;
- migration 0011 rewrites legacy rows/JSON and rejects any fourth kind;
- checksum-valid legacy backups restore through an explicit taxonomy adapter;
- every Turn persists 24 production/consumption/transfer/inventory ledgers;
- inter-community transfer lanes conserve both endpoints and emit events;
- closing inventory never exceeds capacity;
- Observatory v2 shows exact flow rows and map lanes while v1 remains readable;
- desktop/mobile/Chinese, resource-layer and WCAG A/AA checks pass.

## v4.3.2 Chromatic City Shell gate

- rendered UI contains no observer-mode or software-run status badges;
- persisted `matrix` and `hacker` theme values migrate to `dark`;
- light and dark use distinct multicolor semantic palettes;
- Human Observatory stays information-first and excludes ambient effects;
- every other view receives the shared cyberpunk visual layer;
- desktop/mobile light and dark runs have no horizontal overflow;
- 245 tests, 26 Playwright/axe scenarios, lint, audit and build pass.

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

- Human Observatory is the default English/Chinese entry;
- its v2 API exposes 260 residents, 24 ledgers, 24 institutions and eight
  production stages while v1 remains compatible;
- population, resource, resident, institution and chain semantics stay explicit;
- resident search/detail, keyboard-scrollable tables and export stay accessible;
- snapshot, event, resident, report and multi-season APIs exclude private data;
- mobile navigation, keyboard focus and reduced motion remain usable;
- every legacy v1/v2 view and certification panel still renders.

## Production evidence and trust boundary

The reference values above are generated from the tagged source and do not
represent a claim about real humans. Annotated Tag `v4.3.0`, exact commit
`bd285f9` and branch `codex/ai-only-symbiotic-shenzhen-v4` are remote and the
exact Tag is active at `nexus7.carrick7.com`. Anonymous read-only identity,
edge and application mutation denial, 200/36/24 taxonomy migration, 24 current
resource ledgers, eight active flows, sixteen transfer lanes, desktop/mobile
Chromium, Chinese copy, zero WCAG A/AA violations, Turn 12 settlement, TLS and
v4.3 pre/post-upgrade backups were checked on 2026-07-19. Deployment history
and checksums are recorded in
`docs/V4_DEPLOYMENT_ATTESTATION.md`.

Remote CI/Sigstore, live DeepSeek and an external second-database recovery
drill remain pending and must not be inferred from the production deployment.
