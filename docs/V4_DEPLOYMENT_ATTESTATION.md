# v4 Production Deployment Attestation

> Observed: 2026-07-26 through 2026-07-30 · Asia/Shanghai

## Current artifact

- Release: `v4.6.0` — Reversible City Society
- Tag commit: `75eda1ba2da450b2e52de4b41ac0433122c48e1e`
- Implementation commit: `a8ba2bd3022cdfd45cfdad31ead6cde3167d2c38`
- Hotfix commit: `60f7612954e64408badb193cfe3f9df89c7fdfe7`
- v4.5 implementation commit: `9da503f56e4c341f3d3aa909e205f31907242b35`
- Remote branch: `codex/ai-only-symbiotic-shenzhen-v4`
- Public origin: `https://nexus7.carrick7.com`

The production checkout is clean and detached at the exact annotated Tag. The
Tag and branch are remote. This document records post-Tag deployment evidence;
it does not move or recreate the immutable release Tag.

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
robots, 24 current resource ledgers and Turn 281. The three resident kinds are
software state; these are synthetic results, not live Shenzhen data.

The primary provider is `nexus-deterministic-reference`. The configured
read-only shadow is `nexus-diversity-reference`: it recorded two comparisons
and one disagreement on the first v4.5 Turn without entering settlement.
DeepSeek remained at zero external attempts, zero Tokens and USD 0 across the
season. This is an observed NEXUS-7 ledger total, not a provider-account claim.

Production Chromium checked the v4.6 society panel at 1440 px and 390 px. It
rendered 69 active care households, nine operational assets, 12 initial work
agreements, conserved credits, bounded policy values and an honest 0/0 safe
closure denominator. Mobile horizontal overflow and console errors were zero.
The full tagged build separately passed all 26 desktop/mobile, dark/light,
Chinese and WCAG A/AA scenarios.

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

Production remains honestly `watch`: the observed window is 4.407 days,
105/106 comparable settlements are on time, the one historical early-restart
sample remains visible, and missing, duplicate and predecessor mismatch counts
remain zero. Twenty-five production Turns carry the v4.6 revision.

The Turn 281 production browser audit also exposed 325px mobile document
overflow once the first populated city-rule table appeared. This is a real
v4.6.0 presentation defect, not a world-state or API failure. The v4.6.1 source
candidate contains the table within its card and adds the missing populated
fixture; no production-fix claim is made before that patch Tag is deployed.

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

## Superseded production states

`v4.5.1` at `1226826` fixed restart cadence and proved the first on-time
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
- no remote CI/Sigstore receipt exists for v4.6.0;
- the public surface is anonymous read-only observation, not multi-user OIDC;
- all residents and outcomes are synthetic and provide no evidence of real
  policy effects.
