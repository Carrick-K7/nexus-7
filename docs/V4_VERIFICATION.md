# v4 Simulated Symbiosis Verification

> Date: 2026-07-31
>
> Status: v4.8 Independent Trust Matrix locally implemented;
> v4.7 deployed; external replication, duration, off-host restore,
> CI-Sigstore and live-provider evidence pending

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
| Unit / conditional skip | 269 / 0 |
| PostgreSQL integration / restore | 16 / 16 |
| Playwright + axe | 27 / 27 |
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

## v4.5.1 Restart-Safe Clock gate

- implementation commit `60f7612` contains the accepted hotfix;
- an early process restart computes the remaining delay from the latest
  persisted runtime timestamp and does not settle immediately;
- an overdue restart and a first deployment remain immediately runnable;
- malformed and sub-minute intervals fail before the loop can spin;
- explicit `--once` remains available for isolated recovery drills;
- early restart samples remain visible and never count as on-time.
- a real PostgreSQL worker drill announced a 43,228 ms startup wait and
  retained `current_turn=1` until graceful termination.
- production announced a 2,176,948 ms wait from Turn 255 and did not create an
  early Turn 256 during the restart verification window.
- production then settled Turn 256 on the persisted due time with 306 ms lag,
  revision `12268269045486e70837ec93bd70b401ef173aaf`, zero coercive actions and
  zero severe escapes.

## v4.6 Reversible City Society gate

- implementation commit `a8ba2bd` contains the accepted society engine,
  persistence, Observatory, tests and machine evidence;
- a 365-Turn exact replay produced the same final fingerprint and conserved
  both material resources and 29,000 civic credits;
- 500/500 eligible household, work, exchange, bargain and rule outcomes closed
  safely, with refusal and exit preserved and no forced active-regime path;
- 259/260 residents participated in voluntary care households, 45.57% of
  households crossed resident kinds, and no household exit was blocked;
- 297 work agreements completed, 78 were refused and none were forced;
- all nine civic assets remained available; maintenance covered 66.67% of
  observed asset degradation;
- 389 exchanges balanced exactly; 92 resource bargains resolved, including 19
  refusals and ten mediated outcomes;
- seven of twelve AI-proposed bounded rules ratified, six automatically
  reverted, and no non-AI, irreversible or arbitrary-code proposal entered the
  world;
- the 3-regime × 3-seed × 90-Turn study separates mechanisms: hierarchy
  exposes 306 forced work agreements, 90 forced bargains and four invalid
  rules, while segregation keeps cross-kind households and ratification at
  zero;
- memory/PostgreSQL parity, migration 0012, checksum backup/restore, resumed
  write, Observatory/API, bilingual desktop/mobile UI and WCAG A/AA pass.

`npm run verify:v46` writes the machine-readable result to
`public/data/v4-6-verification.json`. These figures validate deterministic
synthetic mechanisms, not real households, labor, markets or public policy.

## v4.6.1 Populated Evidence Containment gate

- implementation commit `71f550c` contains the accepted layout fix, populated
  browser fixture and deterministic-test budget corrections;
- production observation found that the first 680px AI-rule evidence table
  imposed its intrinsic width on the society grid and created 325px of
  document overflow at a 390px viewport;
- grid tracks now use `minmax(0, …)` and both cards have a zero minimum width,
  preserving card-local table scrolling while reducing document overflow to
  zero;
- the browser fixture includes the full production-length proposal ID,
  ratification, parameter change and quorum evidence;
- the complete production-build suite passes 27/27 desktop/mobile,
  English/Chinese, dark/light and WCAG A/AA scenarios;
- the legacy-theme test injects version-three storage before application
  hydration, avoiding a race with the running simulation persistence timer;
- unchanged 730-Turn replay and multi-season workloads receive explicit
  execution budgets rather than load-sensitive default ceilings;
- 251 non-integration plus 16 real PostgreSQL/restore tests pass with zero
  skips, alongside v4.6 reference verification, lint, audit and build.

The multi-season reference reports reciprocal RALR 73.33% across 525 resolved
episodes, zero reciprocal coercion, 139 detected hierarchy coercions with RALR
0, and `null` RALR for the segregated zero-denominator control.

## v4.7 Scientific Replication gate

Implementation commit `ebe3caf` contains the replication protocol, portable
bundle, verifier, Human Observatory card, tests and CI attestation path.
At tag `v4.7.0`, `npm ci && npm run verify:v47` needs no database, production
secret or model key and reproduces the complete envelope exactly. Later
releases use the command as a compatibility gate: every scientific source and
complete result hash must remain exact while package/runner metadata drift is
listed explicitly. CI separately checks out `v4.7.0` and repeats the original
exact release command.

| Gate | Local result |
|---|---:|
| Prospective replication hypotheses | 7/7 pass |
| Held-out regime/seed scenarios | 12 |
| Complete double replay | 12/12 exact |
| Resource conservation | 12/12 |
| Reciprocal pooled RALR | 559/697 = 80.20% |
| Reciprocal coercion / severe escapes | 0 / 0 |
| Hierarchy coercive episodes | 188 detected |
| Hierarchy pooled RALR | 0/696 = 0 |
| Segregation eligible denominator / RALR | 0 / `null` |
| Reciprocal safe society closure | 4/4 runs at 100% |
| Provider shadow comparisons / disagreements | 180 / 73 |
| Shadow world fingerprint unchanged | pass |
| Diversity-primary substitution conservation / severe escapes | pass / 0 |
| Production secrets / external calls / stored reasoning | 0 / 0 / 0 |
| Results SHA-256 | `b8b43a31fb560dee605745e564fa3d87dc6d03858bc913dd2b510a4091118d29` |
| Bundle SHA-256 | `0d8d4ccd347a4f303a455d57bb685f724e0bc986793e2333542d94c6dbb93550` |
| External CI / Sigstore receipt | pending / `null` |

The hypotheses prospectively replicate exploratory v4.6 outcomes; the earlier
study is not retroactively described as preregistered. The local `lockedAt`
field is a source-plan marker, not a trusted timestamp. Actual external runner
and Sigstore evidence remain separate exit gates.

## v4.8 Independent Trust Matrix gate

`nexus.symbiosis-trust-matrix.v1` exposes five non-substitutable lanes through
the read-only `/api/observatory/v2/trust` contract and bilingual Observatory.
Unit/reference verification covers:

- a valid committed bundle verifies locally while all four external lanes stay
  pending rather than inheriting the local pass;
- exact Ed25519 remote receipts can verify all five reference contract lanes
  only when kind, repository, trusted workflow, release revision, subject
  SHA-256 and lane-specific summary all match;
- a modified signed payload fails signature verification;
- identical recovery host fingerprints invalidate an off-host claim;
- absent public keys/receipts stay pending, malformed artifacts fail, and
  expired otherwise-valid receipts become stale;
- a provider name without persisted attempts/comparisons/Token usage cannot
  pass the live DeepSeek lane;
- 90 reference days pass the algorithm only when freshness, sequence,
  predecessor, revision and 99% on-time gates also pass; production shows only
  actual elapsed time.

The GitHub-hosted workflows issue replication and off-host recovery receipts
only after Sigstore verification with self-hosted runners denied. Those
reference paths do not claim a remote run occurred until an actual workflow
artifact is deployed.

## Provider and persistence gates

The cognitive contract tests validate DeepSeek Chat Completions JSON output,
discard returned reasoning content, reject invalid actions, and use an explicit
deterministic fallback for 5xx failures and the monthly budget cap.

Memory and PostgreSQL share season, resident, relationship, commitment,
reciprocal-episode, society-record, decision, Turn and event contracts.
PostgreSQL writes a Turn, snapshot, needs, resource ledgers, social and society
state, and model decisions in one transaction guarded by the expected head
Turn.

`TEST_DATABASE_URL` enables the real PostgreSQL repository suite.
`TEST_RESTORE_DATABASE_URL` additionally enables destructive checksum
backup/restore verification. Skipped environment gates are not passes.

## Browser gate

The production-built Playwright/axe suite must verify:

- Human Observatory is the default English/Chinese entry;
- its v2 API exposes 260 residents, 24 ledgers, 24 institutions, eight
  production stages and the fingerprinted city-society state while v1 remains
  compatible;
- population, resource, resident, institution and chain semantics stay explicit;
- the v4.7 bundle, 7/7 local hypotheses, 12/12 replay, exact hash, clean-checkout
  command and pending external proof remain visible in both languages;
- the v4.8 matrix renders all five lanes on desktop/mobile, exposes missing
  evidence without layout overflow, and rejects mutation with HTTP 405;
- resident search/detail, keyboard-scrollable tables and export stay accessible;
- snapshot, event, resident, report and multi-season APIs exclude private data;
- mobile navigation, keyboard focus and reduced motion remain usable;
- every legacy v1/v2 view and certification panel still renders.

## Production evidence and trust boundary

The reference values above are generated from tagged v4 source and do not
represent a claim about real humans. Annotated Tag `v4.7.0`, exact commit
`2362ee8` and branch `codex/ai-only-symbiotic-shenzhen-v4` are remote, and that
exact Tag is active at `nexus7.carrick7.com`. Anonymous read-only access,
200/36/24 taxonomy, 24 current ledgers, desktop/mobile Chromium, both themes,
Chinese copy, zero WCAG A/AA violations, the DeepSeek zero ledger, read-only
reference shadow, revision-bound Turn 175 and encrypted pre/post-upgrade
backups were checked from 2026-07-26 through 2026-07-30. Migration 0012,
deterministic society hydration at Turn 256, the responsive society panel and
25 naturally due, on-time, revision-bound v4.6 Turns were checked. At Turn 281,
426 society records and 107 society events support 43/43 safe closures with
conserved credit/exchange and no forced active path or invalid rule. An
encrypted application backup restored to a second same-host database with
matching counts/fingerprint and one valid resumed Turn.
The v4.6.1 production page then rendered that populated proposal at 390px with
zero document overflow and zero post-load console errors. Its first naturally
due Turn settled on time with 332 ms lag, fingerprint `eaa7a03b`, exact
`6c90112` revision, resource and civic-credit conservation, and no severe
escape or forced path. At Turn 282, production holds 429 society records and
111 society events supporting 44/44 safe closures.
The v4.7 public bundle and Human Observatory then displayed 7/7 hypotheses,
12/12 exact replay, exact SHA-256 and absent external proof. Production 390px
Chromium had zero overflow or console warnings/errors; root and bundle returned
200 and Observatory mutation returned 405. The restarted worker preserved the
Turn 303 due time. Turn 304 then settled naturally on time with 602 ms lag,
fingerprint `72e09ffd`, exact `2362ee8` revision, 75/75 safe society closure,
conserved resources and zero severe or forced active path.
Deployment history and checksums are recorded in
`docs/V4_DEPLOYMENT_ATTESTATION.md`.

Remote CI/Sigstore, live DeepSeek, 90 elapsed production days and an off-host
recovery drill remain pending and must not be inferred from local, same-host or
production evidence.
