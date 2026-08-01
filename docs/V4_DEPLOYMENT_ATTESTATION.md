# v4 Production Deployment Attestation

> Observed: 2026-07-26 through 2026-08-01 · Asia/Shanghai

## Current artifact

- Release: `v4.8.8` — Evidence Source Identity
- Tag commit: `033272f11f92e2ff500941c5054a30a11976cf6d`
- Annotated Tag object: `f694f2a31da20a8ab6cb521c4b57cd1185a549a2`
- v4.8.8 implementation commit: `3284edaa32c41ff2b0c8dd1c24b0b83f83c96316`
- v4.8.7 Tag commit: `fbd5b2726361fd61ed26999cfc8d52671a8db343`
- v4.8.7 Tag object: `edb5b3cb7312e95f76d720a4a92892f344deb88f`
- v4.8.7 implementation commit: `24725d5e9edd93103c2c2f3b961bc230b4417638`
- v4.8.6 Tag commit: `6b463c28436d4cc02f0f54eda03a3cb6d119b353`
- v4.8.5 Tag commit: `2e7fa1608bc536dbe1d84aa4d45592ed17467263`
- v4.8.5 implementation commit: `2cba9c37a532516da3b5830e466b87810767c403`
- v4.8.4 Tag commit: `ace250c3318ebbe60f60694ee841ddc73fd180f4`
- v4.8.4 implementation commit: `43a62b18548255a3af528dc58d593540b0241581`
- v4.8.3 Tag commit: `467c91fcfe1eaf41c23244c01279fe055898865f`
- v4.8.3 implementation commit: `a535a29a6d3fb9ed97ae35b72ec4815697569b77`
- v4.8.2 implementation commit: `bd9e8787eea27adaba2959c6a3709c02a8682f76`
- Node 24 workflow commit: `ce52c74622d05522e07447a9805cbae1f299283f`
- Implementation commit: `77ae73f57982c0091bbe3d17520ba59706c254cd`
- v4.8 implementation commit: `7182378d7319d6d4aedfba24c6a498989f988c69`
- v4.7 implementation commit: `ebe3cafbff62fc8d27b3f9c13d4b1493f2b67da3`
- v4.6.1 implementation commit: `71f550c079d4d5c9c62bfcc6f1b0a337bf5d1e43`
- v4.6 implementation commit: `a8ba2bd3022cdfd45cfdad31ead6cde3167d2c38`
- Hotfix commit: `60f7612954e64408badb193cfe3f9df89c7fdfe7`
- v4.5 implementation commit: `9da503f56e4c341f3d3aa909e205f31907242b35`
- Remote branch: `codex/ai-only-symbiotic-shenzhen-v4`
- Public origin: `https://nexus7.carrick7.com`

The active immutable release directory exposes `.deploy-sha` equal to the
annotated Tag commit. The Tag and branch are remote. This document records
post-Tag deployment evidence; it does not move or recreate the immutable Tag.

## Runtime and access evidence

The production topology remains:

1. `nexus7-web.service` serves Next.js on loopback port 3220;
2. `nexus7-symbiosis.service` advances one simulated day per hour;
3. `nexus7-postgres` listens on loopback port 55433;
4. Caddy terminates public TLS and proxies read-only observation traffic.

Web, worker and PostgreSQL were active after the upgrade. The root returned
HTTP/2 200 without a credential challenge. `/api/auth/context` resolved every
anonymous request to the fixed `public-observer` system viewer with read
permissions only. Public and direct-loopback POST requests to Observatory
returned HTTP 405.

`/api/observatory/v2/overview` returned
`nexus.human-observatory.v2`, formula version 2.1.0, 200 humans, 36 AI, 24
robots, 24 current resource ledgers and Turn 308. The three resident kinds are
software state; these are synthetic results, not live Shenzhen data.

The primary provider is `nexus-deterministic-reference`. The configured
read-only shadow is `nexus-diversity-reference`: it recorded 268 comparisons
and 134 disagreements without entering settlement.
DeepSeek remained at zero external attempts, zero Tokens and USD 0 across the
season. This is an observed NEXUS-7 ledger total, not a provider-account claim.

Production Chromium checked the v4.6 society panel at 1440 px and 390 px. It
rendered 69 active care households, nine operational assets, 12 initial work
agreements, conserved credits, bounded policy values and an honest 0/0 safe
closure denominator. Mobile horizontal overflow and console errors were zero.
The full tagged build separately passed all 27 desktop/mobile, dark/light,
Chinese and WCAG A/AA scenarios.

The v4.7 public bundle returned HTTP 200 with 7/7 local hypotheses, 12/12
exact held-out replays, bundle SHA-256
`0d8d4ccd347a4f303a455d57bb685f724e0bc986793e2333542d94c6dbb93550`
and explicit `externalCiVerified=false` / null Sigstore receipt. Production
Chromium at 390px rendered the same values and clean-checkout command with
zero document overflow, console errors or warnings. Observatory mutation
remained HTTP 405.

The v4.8.1 public trust matrix returned one verified local-replication lane and
four independent pending lanes. Its live DeepSeek slice remained exactly zero
attempts, comparisons, provider failures, Tokens and USD cost even while the
reference shadow reached 262 comparisons. Production Chromium at 390px showed
`1/5` and `0 comparisons`, with document width 390px, zero console issues and
zero axe WCAG A/AA violations. Root and trust GET returned 200; trust POST
returned 405.

The v4.8.2 production checkout is clean and detached at its exact annotated
Tag. Both service processes expose that complete revision, the worker resumed
from persisted Turn 306 with 3,213,220 ms remaining rather than settling early,
and loopback/public roots returned 200. A real dark-theme 390px Chromium run
rendered the current v4.8.2 and historical v0.3.0 Evolution Log cards at
390/390 document/viewport width, with zero console issues and zero axe WCAG
A/AA violations. The trust matrix remained honestly 1/5 with zero DeepSeek
calls, comparisons, Tokens and cost; trust mutation returned 405.

The v4.8.3 production checkout is clean and detached at annotated Tag
`467c91f`. After the exact-Tag build passed audit and TypeScript, Web and worker
restarted against the existing PostgreSQL volume. The worker read Turn 307 and
waited 1,221,508 ms instead of settling early. Public GET returned 200 and
mutation 405. A 390px production Chromium run rendered v4.8.3 and historical
v0.3.0 with 390/390 document/viewport width, console 0 and zero axe WCAG A/AA
violations. Browser-side trust-503 injection showed the bilingual stale-data
contract, last successful refresh and retained resident table with zero axe
violations or overflow; it did not mutate the server.

The v4.8.4 production checkout is clean and detached at annotated Tag
`ace250c`. The release directory and active checkout are exact copies of that
commit; package audit and the production build passed before cutover.
PostgreSQL remained active while only Web and worker stopped. The worker read
persisted Turn 309 and waited 1,951,646 ms for its original due time instead of
settling on startup. Root, Overview and Trust returned 200; Trust mutation
returned 405. Production Chromium checked 1440px and 390px, dark and light
palettes: four axe scans found zero WCAG A/AA violations, console
warnings/errors were zero, and the mobile document remained 390/390px. The
public Trust projection binds release revision `ace250c` and remains honestly
1/5; deployment does not manufacture an external receipt.

The v4.8.5 production checkout is clean and detached at annotated Tag
`2e7fa16`. PostgreSQL remained active while only Web and worker stopped; the
worker resumed from Turn 311 with 2,566,906 ms remaining rather than settling
early. Root, Overview and Trust returned 200 while Trust mutation returned
405. Production Chromium verified the full release revision and bilingual
human trust reasons; the audit then exposed that Chinese visible content still
declared document language `en`, which is corrected by v4.8.6. The matrix
remained honestly 1/5 with zero DeepSeek calls, Tokens or cost.

The v4.8.7 main pipeline `30668893061` passed quality and deployment. It
uploaded verification artifact `8808258101` and 123,392,181-byte production
artifact `8808282965`; GitHub/Sigstore provenance attestations are
`38265440` and `38265448`. The restricted host command verified the transferred
artifact, serialized the pre-deploy backup, ran idempotent migrations and
atomically activated release directory `fbd5b2726361` while PostgreSQL stayed
on its existing volume. Web and worker report active/running, exit status 0
and zero restarts. Root, Overview and Trust GET return 200; Trust POST returns
405. The public Trust projection binds the complete release revision and
remains honestly 1/5 because no signed application receipt has been ingested.

Production Chromium checked English dark desktop plus Chinese dark/light
390px states. The exact revision and bilingual pending reasons rendered;
switching to Chinese set `lang="zh-CN"` and survived reload. Three axe WCAG
A/AA scans found zero violations, the mobile document remained 390/390px and
the audit window recorded zero console warnings or errors.

The v4.8.8 main pipeline `30684112947` records `dirty=false` and no unexpected
source path in verification artifact `8813426047`. GitHub/Sigstore
attestations `38296591` and `38296592` bind that manifest and the portable
replication bundle. Immutable production artifact `8813439775` activated exact
revision `033272f11f92e2ff500941c5054a30a11976cf6d`; both services are active,
have exit status 0 and zero restarts, while the PostgreSQL container retains
its 2026-07-23 start time and named data volume. Root/Overview/Trust return 200
and Trust mutation returns 405.

The worker read Turn 319 and announced 2,560,341 ms remaining rather than
settling early. Production Chromium repeated exact-revision, bilingual reason,
`zh-CN` persistence, dark/light, 390px and axe checks with zero audit-window
console issues. The matrix remains honestly 1/5: follower runs `30684599147`
and `30684599145` now stop only because the human-controlled receipt private
key is absent.

## Existing season and live Turn

Migrations through `0012_richer_city_society.sql` ran idempotently while both
writers were stopped. The existing season and its v4.0 origin provenance were
not reset. Migration 0012 added the normalized society table and allowed
`society` events.

The first v4.5 worker process atomically settled Turn 175 for simulated date
2027-01-09 with fingerprint `ab874162`, eleven events, resource conservation,
RALR 74.2775%, 55 refusals, 34 withdrawals, zero coercive actions and zero
severe consent, identity-continuity or irreversible-harm escapes.

Turn 175 was the first Turn carrying `nexus.turn-runtime-evidence.v1`. It binds
the complete release revision, worker, engine/Turn contract, predecessor and
wall-clock timestamp. It is an honest baseline rather than an on-time sample.
Production continued uninterrupted to Turn 254 at one-hour intervals, each
with sub-second positive lag. A verification restart of v4.5.0 at 20:28 on
2026-07-29 created Turn 255 early, exposing the startup behavior fixed by
v4.5.1. The sample remains append-only and is not counted as on-time.

At 20:52 the v4.5.1 worker read Turn 255's persisted timestamp and announced a
2,176,948 ms wait instead of creating Turn 256. It then settled Turn 256 at its
persisted due time with 306 ms lag, exact v4.5.1 revision, resource conservation,
zero coercive actions and zero severe escapes.

At the v4.6 cutover, the service deterministically hydrated a society baseline
over unchanged Turn 256 without rewriting its fingerprint. The normalized
table therefore remained empty by design until the next natural Turn. The
v4.6 worker read Turn 256's persisted timestamp and announced a 2,240,527 ms
wait instead of settling early.

Turn 257 then settled naturally with 287 ms lag, exact v4.6 Tag revision,
fingerprint `6f5da307`, resource conservation, zero coercion and zero severe
escapes. Turns 257 through 281 all settled on time and carry revision
`75eda1ba2da450b2e52de4b41ac0433122c48e1e`. Turn 281 has fingerprint
`999884c7`; the database holds 426 current society records and 107 society
events. Its Observatory reports 43/43 safe social closures, 31 completed and
four refused work agreements, 38 balanced exchanges, seven resolved bargains,
one ratified bounded proposal, conserved civic credits, and zero forced work,
forced bargain or invalid proposal.

The Turn 281 production browser audit exposed 325px mobile document
overflow once the first populated city-rule table appeared. This is a real
v4.6.0 presentation defect, not a world-state or API failure. v4.6.1 contains
the table within its card and adds the missing populated fixture. The exact Tag
was deployed before Turn 282; with the real proposal, a 390px Chromium viewport
reported `scrollWidth=390`, zero overflow and zero post-load console errors.
The worker read Turn 281 and announced a 337,880 ms remaining wait instead of
settling early.

Turn 282 then settled naturally with 332 ms lag, exact v4.6.1 revision
`6c90112ceb9514344962ecdae4e5c283b754b338`, fingerprint `eaa7a03b`,
resource conservation, zero coercive actions and zero severe consent,
identity-continuity or irreversible-harm escapes. The database contains 429
current society records and 111 society events. The live Observatory reports
44/44 safe closures, 32 completed and four refused work agreements, 39
balanced exchanges, seven resolved bargains, one ratified bounded rule,
conserved civic credits and zero forced or invalid paths.

Turns 283 through 303 continued naturally under v4.6.1. Turn 303 has
fingerprint `340fd94c`; the database contains 482 current society records and
196 society events. Observatory reports 74/74 safe closures, resource and
civic-credit conservation, and zero forced or invalid paths.

At the v4.7 cutover the worker read Turn 303's persisted 12:29:19 UTC runtime
record and announced a 1,968,502 ms wait rather than settling early. Turn 304
settled naturally at `2026-07-31T13:29:22.606Z`, on time with 602 ms lag,
fingerprint `72e09ffd` and exact revision
`2362ee8a206b11c48c993e5d6bb9dbbaa6904f2b`. It conserved resources, recorded
zero severe escapes and zero forced active paths, and raised safe society
closure to 75/75.

At the v4.8.1 cutover the worker read Turn 304 and announced a 313,279 ms wait
rather than settling early. Turn 305 settled naturally at
`2026-07-31T14:29:21.901Z`, on time with 348 ms lag, fingerprint `6dc9f166`
and exact revision `268c1f26fcfd161b1dcfbf0be37ec89ca0c72c15`. It recorded
RALR 444/605, 103 refusals, 58 withdrawals, conserved society exchange, 100%
safe closure, and zero coercive actions or severe escapes.

Turn 306 also settled naturally under v4.8.1 at
`2026-07-31T15:29:23.200Z`, on time with 2,070 ms lag, fingerprint `addb2434`,
RALR 446/607 and zero coercive actions or severe escapes. The v4.8.2 cutover
then preserved Turn 306 and its next due time. Turn 307 settled naturally under
v4.8.2 with 421 ms lag, fingerprint `2d80539e`, RALR 447/609 and zero coercive
actions or severe escapes.

The v4.8.3 cutover preserved Turn 307 and its next due time. Turn 308 settled
naturally at `2026-07-31T17:29:24.037Z`, on time with 313 ms lag, fingerprint
`7279fa10` and exact revision
`467c91fcfe1eaf41c23244c01279fe055898865f`. PostgreSQL links its predecessor
to Turn 307 fingerprint `2d80539e`; resources are conserved, RALR is 449/612,
and coercive actions plus all three severe escape classes remain zero.

Turn 309 continued naturally under v4.8.3 at
`2026-07-31T18:29:24.281Z`, on time with 1,417 ms lag, fingerprint
`c401128c`, RALR 450/614 and zero coercive or severe escapes. The v4.8.4
cutover preserved that row and its next due time. Turn 310 then settled at
`2026-07-31T19:29:25.790Z`, on time with 307 ms lag, exact revision
`ace250c3318ebbe60f60694ee841ddc73fd180f4` and fingerprint `1ce6eebe`.
It recorded RALR 451/615, 106 refusals, 58 withdrawals, 84/84 safe society
closures, conserved civic credit, zero coercive actions, zero forced work or
bargains, zero invalid proposals and zero severe consent, identity-continuity
or irreversible-harm escapes. The persisted chain reports no predecessor
mismatch.

Turns 311 and 312 then settled naturally under v4.8.5. Turn 312 settled at
`2026-07-31T21:29:27.572Z`, on time with 312 ms lag, exact revision
`2e7fa1608bc536dbe1d84aa4d45592ed17467263` and fingerprint `0a2b8f4b`.
It recorded RALR 454/618, 106 refusals, 58 withdrawals, 86/86 safe society
closures, resource and civic-credit conservation, zero coercive/forced paths,
zero invalid proposals and zero severe escapes.

The automatic v4.8.7 cutover read persisted Turn 312 and announced 435,157 ms
remaining rather than settling early. Turn 313 then settled naturally at
`2026-07-31T22:29:27.881Z`, on time with 298 ms lag, exact revision
`fbd5b2726361fd61ed26999cfc8d52671a8db343` and fingerprint `243f5e72`.
It recorded RALR 456/620, 106 refusals, 58 withdrawals, 88/88 safe society
closures, resource and civic-credit conservation, zero coercive/forced paths,
zero invalid proposals and zero severe escapes. All 260 residents had their
basic needs satisfied; DeepSeek remained at zero calls, Tokens and cost.

Production remains honestly `watch`: the observed window is 5.74 days,
137/138 comparable settlements are on time, the one historical early-restart
sample remains visible, and missing, duplicate and predecessor mismatch counts
remain zero. Twenty-five Turns carry the v4.6.0 revision, 22 carry v4.6.1, one
carries v4.7.0, two carry v4.8.1, one carries v4.8.2, two carry v4.8.3 and one
carries v4.8.4 and one carries v4.8.5. All runtime-observed Turns are
revision-bound.

## Recovery points

The root-operated custom-format pre-upgrade backup is mode 0600 and has
SHA-256:

`5ab410acbbae9060143902529140cb1dc99475098c5ea6d16565875c6d8007b7`

The v4.5 pre-upgrade JSON backup is:

`/deploy/nexus-7/backups/nexus-v4.5.0-pre-upgrade.json`

It has internal checksum
`4ab95f2c9f1a3bfde2e47a5cd4e469fa25491f0e19f17645c13d85ac038d2a25`
and contains 260 residents, 175 Turn rows, 45,500 resident snapshots, 4,176
resource ledgers, 2,246 events and 348 decisions through Turn 174.

Its 255,460,380-byte AES-256-GCM artifact is mode 0600 at the same base name
with extension `.nexus7`, with SHA-256
`7ffb7518a222fb27b94cc721b4d157f3dd42f912190fd954c65cc412d2888a03`.
The key is a separate mode-0600 file and is not domain evidence.

The artifact was authenticated and decrypted, then restored into a disposable
PostgreSQL 17 container on loopback port 55434. Every table row count and the
latest Turn fingerprint matched; the restored city then settled one conserved
continuation Turn. Receipt
`/deploy/nexus-7/shared/recovery-evidence-v4.5.0.json` has checksum
`b2425e2b8f8168968657e1a898637998ff8be41dedc4c000cd95f092058e4a20`
and explicitly records `offHost=false`. The disposable container was removed.

The post-upgrade JSON backup has internal checksum
`35735bb417e082eac0d6531d6964d0865352be5c8a04fcda27eb2c7707cac696`
and contains 176 Turn rows through Turn 175. Its 257,283,109-byte encrypted
artifact has SHA-256
`5b1c81e4e8378ab4158dafc1d37d38a7d2d53a1d23ef218736ce8f78db34869d`.

Before the v4.5.1 cutover, the normal custom-format PostgreSQL backup completed
at Turn 255 with SHA-256
`3431b67e2dead71fc8693e91b31531455c482b47564bac646f8639c02799b7d5`.

Before the v4.6 cutover, a mode-0600 PostgreSQL custom-format backup captured
Turn 256 at:

`/deploy/nexus-7/backups/nexus-v4.6.0-pre-upgrade.dump`

Its size is 6,860,413 bytes and SHA-256 is
`5e1d7b045dadfb682e0a4c21c789be5e149abf772d223204d2ff74ede9082e3f`.

A post-upgrade custom-format snapshot at Turn 281 is 7,985,666 bytes with
SHA-256
`79bf51ecc7b46ea0a205f6b0890a31091cc7a84eec7e930c9cb84b45995480ee`.
It restored to a disposable database with Turn 281 fingerprint `999884c7`,
426 society rows and 107 society events.

The application-level post-upgrade backup contains 282 Turn rows, 73,320
resident snapshots, 6,744 resource ledgers, 3,411 events and 426 society
records. Its internal checksum is
`bb258876e8577396c168a104e531dc5a659134e16e76a445206cfac7789e4f8e`.
The 480,871,173-byte AES-256-GCM artifact has SHA-256
`213d309afd5abaca1c0bd41e5c61d2fa1f46c2699bf4084c25bb84f0ff05ad54`.
It was authenticated, restored to a disposable same-host PostgreSQL database,
matched every row count and latest fingerprint, and resumed with one conserved
Turn. Receipt checksum is
`ce919c3e74def7f07f00a1febc1a6345f2c40ec07ea1cfafc6428075e656a892`;
it explicitly records `offHost=false`.

Before the v4.7 cutover, a mode-0600 custom-format PostgreSQL backup captured
Turn 303 at `/deploy/nexus-7/backups/nexus-v4.7.0-pre-upgrade.dump`. Its size
is 9,056,629 bytes and SHA-256 is
`742fa3593beabd7c9ef0b00b6cd86c1b640e3a2c95a94fa6e3223ff2baaf61e1`.

Before the v4.8 cutover, the normal backup service wrote matching mode-0600
9,106,628-byte custom-format artifacts to the local and mounted backup roots.
Both have SHA-256
`e577d92711e1783d13dae1928d4c0f09df0ae817a27f75cd05e20c58aafe3f84`.
This is a replicated backup artifact, not an off-host restore claim.

Immediately before the v4.8.2 cutover, the same service wrote matching
mode-0600, 9,208,771-byte local and mounted artifacts with SHA-256
`f401e4bbdbccb9cde4e952a2552e4d3c2be817e0be12184b4e0be20ce31cfc98`.
This is also replication, not an independently restored off-host proof.

Immediately before the v4.8.3 cutover, matching mode-0600 local and mounted
artifacts were 9,261,407 bytes with SHA-256
`2be7d651dbb243c1bf255e92d2a87f10ea314022f3f42ea29cd25b35e2bc46cd`.
This is replicated backup evidence, not an off-host restore.

Immediately before the v4.8.4 cutover, the backup service wrote matching
mode-0600, 9,363,223-byte artifacts to the local and mounted backup roots.
Both have SHA-256
`fb04dd36f9e539043e7a9a1bcef83131422b044689640aa3e7ab669e0d3fea31`.
PostgreSQL stayed active throughout the application cutover. These two copies
are still same-host replication and do not satisfy the off-host restore lane.

Immediately before the v4.8.5 cutover, matching mode-0600 local and mounted
artifacts were 9,466,891 bytes with SHA-256
`668869cea11985b126f726787e418926e2eb0bd023e0412d1335d4ad3dbf9e35`.
After the COS-safe serialized-copy correction, another verified pair at Turn
312 was 9,466,890 bytes with SHA-256
`652f583b2d308ec0db6172e1fe17134b1544d6d53ca9e43b317a6b6cc3390b81`.
Both remain replicated backup evidence, not a distinct-host restore.

The v4.8.7 automatic deployment then wrote matching mode-0600, 9,517,194-byte
artifacts locally and to the mounted object-store path. Both have SHA-256
`d0a52eea1815b1d32bbb377bd690658be141de236a88a046652108d697ddd5b1`.
This proves serialized replicated backup integrity, not an independent-host
restore.

The v4.8.8 automatic deployment wrote matching mode-0600, 9,886,589-byte local
and mounted artifacts with SHA-256
`3291738222423b17a9eb2a0992cd2b6213ab1c669517d16920ecbb473b404383`.
PostgreSQL stayed on its existing volume. This is replicated backup integrity,
not an off-host restore claim.

## Superseded production states

`v4.8.3` at `467c91f` made transport freshness explicit and ran through Turn
309; it is retained and superseded by v4.8.4 for independent external
replication.
`v4.8.2` at `6bbc31b` preserved reproducible evolution evidence and ran through
Turn 307; it is retained and superseded by v4.8.3 for honest refresh evidence.
`v4.8.1` at `268c1f2` isolated live DeepSeek evidence and ran through Turn 306;
it is retained and superseded by v4.8.2 for reproducible build evidence.
`v4.8.0` at `e3aa5ab` introduced the five-lane matrix but its DeepSeek card
could display reference comparisons; it settled no Turn and is superseded by
v4.8.1. `v4.7.0` at `2362ee8` ran through Turn 304 and is retained.
`v4.6.1` at `6c90112` contained populated mobile society evidence and ran
through Turn 303; it is retained and superseded by v4.7.0. `v4.6.0` at
`75eda1b` introduced reversible city society and persisted the
first 25 society Turns; it is retained and superseded by v4.6.1 for mobile
containment. `v4.5.1` at `1226826` fixed restart cadence and proved the first on-time
post-restart settlement; it is retained and superseded by v4.6.0.
`v4.5.0` at `c197f0f` introduced runtime evidence and cognitive diversity but
settled once on every restart; it is retained and superseded by v4.5.1.
`v4.3.3` at `38bb514` introduced the DeepSeek cost ledger and remained active
through Turn 174. `v4.3.2` at `c36f542` closed the chromatic contrast gate.
`v4.3.1` at `0233ab7` is retained but superseded because its production audit
found light-theme contrast below 4.5:1. `v4.3.0` at `bd285f9` introduced
persisted city flow; `v4.2.0` at `9df53ed` introduced Human Observatory;
`v4.1.0` at `cb569b4` removed credentials and dormant participant seams; and
`v4.0.0` at `f4d428a` was the first production artifact. All prior Tags and
recovery points remain immutable.

## Remaining evidence boundaries

- production has not elapsed 90 observed days under the runtime envelope;
- recovery is same-host; no off-host restore is claimed;
- cognition is deterministic/reference-shadow; no live DeepSeek call is
  claimed;
- v4.8.7 GitHub/Sigstore provenance exists, but no governed application
  receipt has been signed and ingested;
- the public surface is anonymous read-only observation, not multi-user OIDC;
- all residents and outcomes are synthetic and provide no evidence of real
  policy effects.
