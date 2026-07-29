# v4 Simulated Symbiosis Verification

> Date: 2026-07-26
>
> Status: v4.5.0 Reliable Cognitive Diversity locally and production verified /
> external duration, off-host restore, CI-Sigstore and live-provider evidence
> pending

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
| Unit / conditional skip | 259 / 0 |
| PostgreSQL integration / restore | 16 / 16 |
| Playwright + axe | 26 / 26 |
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

## v4.3.3 Cognitive Cost Ledger gate

- implementation commit `af7b288` contains the additive ledger and UI;
- Observatory v2 aggregates only persisted DeepSeek decision usage;
- cache-hit, cache-miss, output Token and pinned USD pricing remain distinct;
- billed invalid output survives deterministic fallback and budget accounting;
- deterministic mode reports exact zero rather than hypothetical consumption;
- totals are scoped to the active NEXUS-7 season, not the provider account;
- API keys support a server-only mode-0600 file and never enter evidence.
- Next.js 16.2.11, sharp 0.35.3 and patched brace expansion restore a zero-
  vulnerability dependency gate without disabling lint.
- 246 tests, 26 Playwright/axe scenarios, lint, audit and build pass.

## v4.4 Long-running Reliability gate

- implementation commit `9da503f` contains the accepted v4.4/v4.5 code;
- each new Turn atomically persists wall-clock time, schedule lag, worker,
  release revision, engine contract and predecessor evidence;
- the runtime envelope does not change deterministic world fingerprints;
- the SLO projection exposes missing, duplicate, late and lineage failures,
  latest age, revision coverage, backup age and restore status;
- 2,161 hourly reference records cover exactly 90 days with 100% on-time
  settlement and zero missing, duplicate or predecessor failures;
- AES-256-GCM backup round-trip and unsafe-key rejection pass;
- recovery receipts are checksum-backed and cannot label same-host evidence as
  off-host unless explicitly attested by the operator;
- a 14.1 MB local backup restored to an independent PostgreSQL database with
  exact row counts and latest fingerprint, then resumed with one valid Turn.

This reference validates the algorithm, not 90 elapsed production days.

## v4.5 Cognitive Diversity gate

- primary and shadow Providers use the same versioned bounded contract and
  caller-stable request ID but have separate monthly budgets;
- shadow output has no path into settlement and never becomes an implicit
  fallback;
- failure, budget skip, billed-invalid, disagreement, homogeneity, fallback
  bias, Token and cost evidence persist in memory/PostgreSQL decision JSON;
- a 365-Turn control produced 730 shadow comparisons and 356 disagreements
  (48.77%) with zero failures, cost or stored reasoning;
- the shadow world's final fingerprint exactly matches the non-shadow control;
- promoting the diversity policy changes behavior while resource conservation
  and all severe consent/continuity/harm invariants remain intact;
- desktop/mobile English/Chinese Observatory projections and WCAG A/AA checks
  cover reliability and cognitive-diversity panels.

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

The reference values above are generated from tagged source and do not
represent a claim about real humans. Annotated Tag `v4.5.0`, exact commit
`c197f0f` and branch `codex/ai-only-symbiotic-shenzhen-v4` are remote, and the
exact Tag is active at `nexus7.carrick7.com`. Anonymous read-only access,
200/36/24 taxonomy, 24 current ledgers, desktop/mobile Chromium, both themes,
Chinese copy, zero WCAG A/AA violations, the DeepSeek zero ledger, read-only
reference shadow, revision-bound Turn 175 and encrypted pre/post-upgrade
backups were checked on 2026-07-26.
Deployment history and checksums are recorded in
`docs/V4_DEPLOYMENT_ATTESTATION.md`.

Remote CI/Sigstore, live DeepSeek, 90 elapsed production days and an off-host
recovery drill remain pending and must not be inferred from local, same-host or
production evidence.
