# v4 Simulated Symbiosis Verification

> Date: 2026-08-01
>
> Status: v4.8.11 Release Evidence Identity Closure deployed and tagged;
> GitHub/Sigstore provenance present; signed receipt ingestion, duration,
> off-host restore and live-provider evidence pending

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
| Non-PostgreSQL / conditional PostgreSQL | 262 / 16 |
| PostgreSQL integration / restore | 16 / 16 |
| Playwright + axe | 28 / 28 |
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
Implementation commit `7182378` contains the contract, fail-closed verifier,
receipt workflows, Observatory projection and recovery-drill hardening.
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
- reference-shadow comparisons remain excluded from every live DeepSeek count,
  Token, price, model and failure field;
- 90 reference days pass the algorithm only when freshness, sequence,
  predecessor, revision and 99% on-time gates also pass; production shows only
  actual elapsed time.

The GitHub-hosted workflows issue replication and off-host recovery receipts
only after Sigstore verification with self-hosted runners denied. Those
reference paths do not claim a remote run occurred until an actual workflow
artifact is deployed.

Pushed correction commit `77ae73f` adds a production-regression fixture in
which the diversity reference
shadow has 260 comparisons while DeepSeek has never been configured or called.
The live-provider lane remains pending with zero attempts, comparisons,
failures, Tokens and cost. This prevents a correct status paired with a
misleading human-facing count. The patch passes 258/258 non-PostgreSQL tests,
the unchanged 16/16 real PostgreSQL/restore baseline, 27/27 production-build
Playwright/axe scenarios, TypeScript/build, zero lint warnings and zero audit
vulnerabilities.

### v4.8.2 shallow and Git-less build gate

The first GitHub-hosted pull-request run, `30639268795`, exposed an environment
regression that the full local clone could not: build-time manifest generation
replaced committed Git-derived Evolution Log entries with the shallow checkout,
so the historical v0.3.0 card disappeared and one of 27 browser scenarios
failed. This failure is retained as evidence rather than rewritten as a pass.

The generator now treats a complete repository history as authoritative and,
only for a shallow or Git-less build, merges committed Git-derived entries as
fallbacks behind the current checkout. A focused test fixes precedence and
deduplication. Run `30640312118` then passed the complete pipeline, including
27/27 browser/axe scenarios and the isolated Git-less quality evaluation.

Run `30641290821` repeated that result after all official checkout, setup-node
and artifact actions were upgraded to their Node 24-native releases. It passed
259 non-PostgreSQL tests, 16 real PostgreSQL/restore tests, v1/v2 gates, current
and exact-Tag v4.7 reproduction, v4.8 contracts, 27/27 browser/axe scenarios,
10,000 deterministic ticks and the isolated Git-less lint/test/build gate.
The shallow browser build retained 13 fallback entries; the Git-less build
retained all 14. Dependency vulnerabilities, lint warnings and deprecated
Node 20 action warnings were zero.

Artifact `8797892137` contains the generated verification evidence with
internally matching SHA-256 entries. It has no Sigstore attestation: the run was
for an unmerged Draft PR, so both attestation steps correctly stayed skipped
and `gh attestation verify` found no attestation for the subject. It therefore
supports the release review but does not satisfy the external-replication lane.

### v4.8.3 transport-freshness gate

The Observatory previously showed an explicit error when its first load
failed, but a later polling failure left already-loaded data visible without a
transport warning. The persisted Turn age remained accurate, yet a human could
not distinguish a healthy read path from a retained client snapshot.

The v4.8.3 candidate retains the last successful snapshot rather than blanking
the Observatory, while an assertive bilingual banner exposes the failure, the
last successful browser refresh time and a bounded endpoint/status reason. A
390px Playwright fault injection forces the trust endpoint to return 503 and
proves that the resident table remains available, English and Chinese warnings
render, horizontal overflow is zero and axe reports zero WCAG A/AA violations.

Local release acceptance passes 259 non-PostgreSQL tests plus 16 real
PostgreSQL/restore tests, all deterministic v1/v2/v4 gates, 28/28
production-build browser/axe scenarios, TypeScript/build, 10,000 deterministic
ticks, zero lint warnings and zero dependency vulnerabilities.

The first local isolated-quality attempt also retained its failure: the Docker
daemon's user namespace could stat the mode-0600 host files but not read them
through a direct directory bind. The evaluator now snapshots Git-trackable
source plus installed dependencies into a temporary mode-0444 archive, never
includes ignored host files, mounts only that archive, extracts to tmpfs and
deletes it after the run. The final pinned Node 24 quality run passed lint, 259
tests, the 12-case model regression and the production build with no network,
a read-only root and all capabilities dropped.

GitHub-hosted run `30648143519` repeated the full candidate pipeline from
commit `a535a29`: 259 non-PostgreSQL tests, 16 real PostgreSQL/restore tests,
28/28 browser/axe scenarios, exact v4.7 Tag reproduction, 10,000 deterministic
ticks, zero vulnerabilities and the frozen-source isolated quality gate all
passed. Artifact `8800612119` is unsigned because the run belongs to a Draft
PR; both attestation steps correctly skipped, so it supports release review
without satisfying the external-replication lane.

Production v4.8.2 then settled natural Turn 307 on its preserved hourly clock:
revision `6bbc31b`, lag 421 ms, fingerprint `2d80539e`, RALR 447/609, zero
coercive actions and zero severe escapes. This is continuity evidence for the
currently deployed release, not a v4.8.3 deployment claim.

### v4.8.4 independent-replication and atomic-theme gate

Release review found that the external-replication receipt depended on the
general main-branch CI workflow. That workflow also requires an unrelated live
OpenAI regression for high-risk promotion. With no OpenAI secret configured,
an independently reproducible v4.7 bundle could never reach its own Sigstore
lane. This coupled two trust domains that the v4.8 matrix promises to keep
independent.

The dedicated `Symbiosis replication` workflow now uses no model key. It
verifies the committed bundle, repeats the exact `v4.7.0` checkout command,
requires byte-identical published artifacts, uploads the bundle and requests a
GitHub-hosted attestation. The receipt bridge excludes pull-request events and
executes only the default branch's trusted verifier with the Ed25519 signing
key; the attested head is bound as data but never executed by that key-bearing
job. Both symbiosis signer workflows are accepted by the public matrix and
optional governance ingestion. Legacy live-model promotion remains unchanged.

The first full browser run retained one failure: during a light-to-dark switch,
a transitioning light button background briefly combined with dark-theme text
and axe measured 1.17 contrast. Root `<html>` is now the sole palette authority
and theme updates suppress transitions for the forced atomic style change. The
exact scenario then passed five consecutive repetitions, followed by 28/28 of
the full production-build browser/axe suite.

Local acceptance passes 262 non-PostgreSQL tests, 16/16 real PostgreSQL and
restore tests, every v1/v2/v4 deterministic gate, 10,000 ticks, zero lint
warnings, zero dependency vulnerabilities and the TypeScript production
build. The frozen-source Node 24 evaluator independently repeated lint, 262
tests, the 12-case model regression and production build with no network,
read-only root, dropped capabilities and no ignored host inputs. Remote
workflow and production evidence are recorded only after commit and release.

GitHub-hosted candidate run `30655282026` repeated the exact `43a62b1`
pipeline in 12m15s: 262 non-PostgreSQL tests, 16 real PostgreSQL/restore tests,
28/28 browser/axe scenarios, both v4.7 reproductions, all deterministic gates,
the 10,000-tick audit and the frozen-source isolated evaluation passed.
Artifact `8803269675` is unsigned because this is still a Draft PR; both
attestation steps skipped and the external-replication lane remains pending.

Exact release run `30656174260` then repeated the complete pipeline for tagged
commit `ace250c` in 12m26s and uploaded artifact `8803619226`. Its 262
non-PostgreSQL tests, 16 real PostgreSQL/restore tests, 28/28 browser/axe
scenarios, two exact bundle reproductions and isolated Node 24 evaluation all
passed. Because the run is still attached to a Draft PR, attestation correctly
remained disabled; this is release evidence, not the missing external receipt.

### v4.8.5 evidence-readiness gate

Completion review found two operator-boundary defects. The checked environment
template defined `SYMBIOSIS_TRUSTED_SIGNER_WORKFLOWS`, which replaces the
built-in allowlist, but omitted the dedicated replication workflow and the
operations drill. A deployment copied from that template would reject valid
receipts even though code defaults were correct. The template and a repository
contract test now require all four symbiosis evidence producers.

The recovery lane also overwrote a failed malformed receipt with `pending` when
the separate recovery evidence file was absent. Failure and stale receipt
states now take precedence over the missing companion file. A regression test
supplies a malformed recovery receipt without evidence and requires the lane
and overall matrix to remain failed.

Human Observatory displays the complete deployed revision and pairs stable
machine reason codes with bilingual explanations. Desktop/mobile browser
fixtures bind the rendered revision to the Trust API and require English and
Chinese explanations for the currently missing signed receipt and DeepSeek
shadow. The API reason-code contract remains unchanged.

Local acceptance passes 264 non-PostgreSQL tests, 16/16 real PostgreSQL and
restore tests, all deterministic v1/v2/v4 gates, 28/28 production-build
Playwright/axe scenarios, 10,000 ticks, zero lint warnings, zero dependency
vulnerabilities and the TypeScript production build. No persistence schema or
world-settlement path changes in this release.
The pinned Node 24.15.0 evaluator independently repeated lint, 264 tests, the
12-case deterministic model regression and production build with network
disabled, a read-only root and frozen source archive, and all capabilities
dropped; it exited 0.

GitHub-hosted candidate run `30662205587` repeated the complete pipeline for
implementation commit `2cba9c3` in 12m45s. It passed 264 non-PostgreSQL tests,
16 real PostgreSQL/restore tests, 28/28 browser/axe scenarios, both v4.7
reproductions, all deterministic gates, 10,000 ticks and the isolated quality
evaluation. Artifact `8805853743` is unsigned because the PR remains Draft;
both attestation steps correctly skipped and no external lane is promoted.

Exact v4.8.5 release run `30663080947` then repeated the complete pipeline for
commit `2e7fa16` and uploaded unsigned artifact `8806201361`. Production was
cut over without replacing PostgreSQL; Web and worker resumed with zero
restarts and the worker preserved the due time after Turn 311.

### v4.8.6 accessible-language-state gate

The v4.8.5 production audit rendered and translated the Chinese Observatory
correctly, but the document root remained `lang="en"`. v4.8.6 applies the
persisted interface language to the root as `en` or `zh-CN` in the same shell
effect as the color scheme. The browser contract requires `zh-CN` immediately
after selection and after a reload. This patch changes no API, database,
simulation, model or trust calculation.

Local acceptance passes 264 non-PostgreSQL tests, 16/16 real PostgreSQL and
backup/restore tests, all deterministic gates, 28/28 Playwright/axe scenarios,
the TypeScript production build and 10,000 ticks with zero lint warnings or
dependency vulnerabilities. The pinned Node 24.15.0 isolated evaluator also
passes lint, 264 tests, model regression and build with network disabled,
read-only frozen source and dropped capabilities.

GitHub-hosted candidate run `30666453468` repeated the combined v4.8.6 and
automatic-main-delivery tree for commit `909e37b` in 12m43s. It passed all
280 unit/real-PostgreSQL tests, 28/28 browser/axe scenarios, exact v4.7
reproduction, deterministic gates, 10,000 ticks and isolated evaluation, then
uploaded unsigned artifact `8807413233`. Draft-PR attestation and deployment
correctly remained skipped, so no external trust lane is promoted.

Exact v4.8.6 run `30667304216` then repeated the full pipeline for immutable
Tag commit `6b463c2` in 12m06s and uploaded unsigned artifact `8807693232`.
Before deployment, `main` independently gained serialized-backup and
ref-isolated concurrency corrections. v4.8.6 therefore remains immutable and
v4.8.7 integrates those delivery changes instead of moving the tested Tag.

### v4.8.7 atomic-delivery-closure gate

The `main` workflow must test and archive one exact revision before a distinct
deploy job can invoke the repository-specific restricted SSH command. The host
must serialize and verify PostgreSQL copies, migrate, atomically activate Web
and worker, preserve the existing volume, expose the same `.deploy-sha`, and
roll application files back if health fails. Pull requests never deploy, and
per-ref concurrency prevents their verification from blocking `main` delivery.
The combined candidate passes zero-warning lint, the TypeScript production
build and the persisted-language Playwright regression locally before its
complete remote gate.

Exact `main` run `30668893061` then passed all 280 tests, 28/28 browser/axe
scenarios, deterministic gates, both v4.7 reproductions, 10,000 ticks and the
frozen-source isolated evaluator. It uploaded verification artifact
`8808258101`, immutable production artifact `8808282965`, and GitHub/Sigstore
provenance attestations `38265440` and `38265448`. The separate deploy job
verified the artifact digest, created equal 9,517,194-byte local/mounted
backups with SHA-256 `d0a52eea1815b1d32bbb377bd690658be141de236a88a046652108d697ddd5b1`,
and atomically activated exact revision `fbd5b2726361fd61ed26999cfc8d52671a8db343`
without replacing PostgreSQL.

Production Chromium verified the exact revision in English and Chinese,
persisted `zh-CN` document language, dark/light palettes, 390/390px mobile
containment and zero axe WCAG A/AA violations or audit-window console issues.
The worker preserved Turn 312's deadline and settled natural Turn 313 on time
with 298 ms lag and exact v4.8.7 revision.

### v4.8.8 evidence-source-identity gate

The v4.8.7 Sigstore attestation succeeded, but both receipt followers failed.
The CI manifest had classified workflow-generated report churn as a source
edit; after that guard, the repository also lacked the human-controlled
Ed25519 receipt key and governance-ingestion identity. v4.8.8 declares only
the deterministic outputs generated by the quality workflow and logs every
unexpected path. Code, configuration, documentation, unknown outputs, renames
and Git-query failure still make the manifest dirty. This patch cannot issue,
install or ingest a receipt by itself.

The first complete PR run `30683144550` passed but its machine artifact exposed
`unexpectedChanges=["ublic/data/iteration-manifests.json"]`: the generic Git
helper had trimmed the leading porcelain status column. The follow-up preserves
leading bytes and strips trailing line endings only. Exact PR run
`30683661198` then passed all 280 tests, 28/28 browser/axe, deterministic and
long-horizon gates plus the isolated evaluator; artifact `8813290002` records
`dirty=false` and an empty unexpected-path list.

Exact `main` run `30684112947` repeated the gate and deployment for revision
`033272f11f92e2ff500941c5054a30a11976cf6d`. Verification artifact
`8813426047` records the same clean source state. Sigstore attestations
`38296591` and `38296592` bind the CI manifest and portable bundle; production
artifact `8813439775` was atomically deployed after equal pre-deploy backups.
Production Chromium verified the exact revision, bilingual receipt reason,
persisted `zh-CN`, dark/light themes, 390/390px containment, zero axe violations
and zero audit-window console issues.

Follower runs `30684599147` and `30684599145` now pass source/attestation
verification and stop only at the absent
`NEXUS_ATTESTATION_RECEIPT_PRIVATE_KEY_BASE64`. No receipt or trust lane is
claimed until the human-controlled key and delivery path are configured.

### v4.8.9 pending-receipt-semantics gate

The v4.8.8 Trust API correctly treats an absent receipt as pending, but its
followers still concluded failure when the human key was absent. v4.8.9 adds a
two-minute configuration job to both workflows. It exports only a boolean,
writes a pending summary and skips issuance when unconfigured. The issuer job
still performs unchanged verification/signing/ingestion when configured, and
no error is tolerated with `continue-on-error`.

PR run `30685341998` passed the complete quality gate. Main run `30685738425`
passed quality and production deployment. Follower runs `30685811077`,
`30686246144` and `30686246148` each completed configuration, reported
`configured=false`, skipped issuance and uploaded zero receipt artifacts. The
Trust API therefore remains honestly 1/5 with external evidence pending.

### v4.8.10 human-evidence-scale gate

The v4.8.9 production browser audit exposed relationship trust `71.05` as
`7105%` because the city report's 0–100 score crossed into a 0–1 percent
formatter. The corrected v2 projection emits `0.7105` under formula version
2.2.0. Its unit fixture proves score `62` becomes rate `0.62`.

The reliability card now requires both fresh backup evidence and a successful
second-database restore for its headline pass. It separately exposes freshness,
age, restore, encryption and off-host state in English and Chinese. Targeted
projection tests, zero-warning lint, the production build and 28/28 local
Chromium plus axe scenarios pass.

PR run `30687027590` passed the complete quality gate. Main run `30687473912`
passed quality and production deployment with clean-source evidence artifact
`8814575553`, production artifact `8814589593` and GitHub/Sigstore attestations
`38304121` and `38304123`. Independent replication run `30687473904` passed.
Production serves exact revision `6184d4f0e2b996dd539553f74acbccfd2ede69fb`:
v2 reports formula 2.2.0 and relationship rate `0.7115`, while v1 preserves
score `71.15`. A real 390px English/Chinese, dark/light browser audit rendered
`71%`, reported stale backup evidence as not met, had zero overflow or console
issues, and returned zero axe violations.

### v4.8.11 complete-release-output-inventory gate

A full clean-worktree `check:release` passed 79/79 files and 283/283 tests with
real PostgreSQL and zero conditional skips, all deterministic v1/v2/v4 gates,
28/28 Chromium plus axe, the 10,000-tick audit and the isolated read-only
evaluator. Its final evidence step nevertheless reported only
`public/data/v4-5-verification.json` and
`public/data/v4-6-verification.json` as unexpected changes. Both files are
written explicitly by commands that run before evidence generation, but were
missing from the exact generated-output inventory.

v4.8.11 adds only those two paths and regression coverage. It also closes a
parser ambiguity by making every rename/copy expose both paths even when both
are declared outputs. Unknown output, source, configuration, documentation and
Git-query failure remain fail-closed. The fix changes no city state or
Trust-lane result; remote and production evidence require the committed
candidate.

PR run `30689556012` then passed the complete 12m18s hosted gate for exact
candidate `4873ec2`, including real PostgreSQL, 28/28 Chromium/axe, both v4.7
reproductions and the isolated evaluator. Its downloaded manifest correctly
reported `dirty=false`, but also exposed a separate ambiguity: the PR
attestation steps were skipped while the provider field alone read
`github-actions-sigstore`. The manifest contract now adds
`attestationState=requires-external-verification`; local evidence uses
`not-applicable`, and the external verifier remains the only path to a signed
receipt.

Final PR run `30690123823` and main run `30690561015` passed the amended exact
revision; main produced clean evidence artifact `8815647779`, immutable release
artifact `8815663506`, and Sigstore attestations `38310421` / `38310423`.
Independent replication run `30690561002` added attestation `38309973` for the
same bundle. Production serves `6bb51b54bd58aae8afc58a83ecf0c1e28ace9a96`.
Turn 323 settled naturally with 349 ms lag, exact replay and conservation,
zero coercive actions and zero severe escapes. Annotated Tag `v4.8.11` points
to that merge revision; the external application receipt remains pending.

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
represent a claim about real humans. Annotated Tag `v4.8.7`, exact commit
`fbd5b27` and branch `codex/ai-only-symbiotic-shenzhen-v4` are remote, and that
exact revision is active at `nexus7.carrick7.com`. Anonymous read-only access,
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
The v4.8.1 cutover then preserved Turn 304's due time. Turn 305 settled
naturally with 348 ms lag, fingerprint `6dc9f166`, exact `268c1f2` revision,
RALR 444/605 and zero severe or coercive action. At the same production state,
the reference shadow held 262 comparisons while the isolated DeepSeek lane
correctly showed zero comparisons, calls, Tokens and cost. The public matrix
was 1/5 with four pending lanes; 390px Chromium reported zero overflow,
console issues and axe WCAG A/AA violations, GET returned 200 and POST 405.
Turn 306 then settled naturally under v4.8.1 with 2,070 ms lag, fingerprint
`addb2434`, RALR 446/607 and zero severe or coercive action. The v4.8.2 cutover
preserved its next due time. Both processes expose exact `6bbc31b`; public and
loopback roots return 200, mutation 405, and the trust matrix remains honestly
1/5 with zero live DeepSeek calls, comparisons, Tokens and cost. Production
390px Chromium shows v4.8.2 and historical v0.3.0 cards with 390px document
width, console 0 and axe WCAG A/AA violations 0. Turn 307 settled naturally
with 421 ms lag, exact `6bbc31b` revision, fingerprint `2d80539e`, RALR 447/609
and no coercive action or severe escape.
The v4.8.3 cutover then preserved Turn 307's deadline. Production Chromium
verified the deployed stale-data contract through browser-side 503 injection;
the retained table, warning, 390px containment and axe gate passed. Turn 308
settled naturally with 313 ms lag, exact `467c91f` revision, fingerprint
`7279fa10`, conserved resources, RALR 449/612 and zero coercive actions or
severe escapes. Missing, duplicate and predecessor-mismatch counts remain zero.
The v4.8.4 cutover preserved Turn 309 and its original due time. PostgreSQL was
not stopped or replaced. Production Chromium passed four desktop/mobile,
dark/light axe scans with zero WCAG A/AA violations, zero console issues and
390/390px mobile containment. Root, Overview and Trust return 200, mutation
returns 405, and the public Trust projection binds `ace250c` while honestly
remaining 1/5.
Turn 310 then settled naturally with 307 ms lag, exact `ace250c` revision and
fingerprint `1ce6eebe`. It recorded RALR 451/615, 84/84 safe society closure,
conserved civic credit, zero coercive or forced active paths, zero invalid
proposals and zero severe escapes. The live chain now contains 311 rows through
Turn 310 with zero missing, duplicate or predecessor-mismatch counts; 134/135
comparable settlements are on time, and the single historical early-restart
sample remains visible.
Turns 311 and 312 continued naturally under v4.8.5. The automatic v4.8.7
cutover then preserved Turn 312 and its original deadline. Turn 313 settled at
`2026-07-31T22:29:27.881Z` with 298 ms lag, fingerprint `243f5e72` and exact
revision `fbd5b2726361fd61ed26999cfc8d52671a8db343`. It recorded RALR 456/620,
88/88 safe society closure, resource and civic-credit conservation, zero
coercive/forced paths and zero severe escapes. The chain contains 314 rows,
with no missing, duplicate or predecessor mismatch; 137/138 comparable
settlements are on time and the historical early-restart sample remains
visible.
Deployment history and checksums are recorded in
`docs/V4_DEPLOYMENT_ATTESTATION.md`.

GitHub/Sigstore provenance now exists for v4.8.7, but the signed application
receipt has not been issued or ingested. Live DeepSeek, 90 elapsed production
days and an off-host recovery drill remain pending and must not be inferred
from local, same-host or ordinary production evidence.
