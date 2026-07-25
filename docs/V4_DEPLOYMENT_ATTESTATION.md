# v4 Production Deployment Attestation

> Observed: 2026-07-25 · Asia/Shanghai

## Current artifact

- Release: `v4.3.3` — Cognitive Cost Ledger
- Commit: `38bb514198a77db393da6e3918fba4e13c600995`
- Remote branch: `codex/ai-only-symbiotic-shenzhen-v4`
- Public origin: `https://nexus7.carrick7.com`
- Address observed through system and public DNS: `43.160.217.167`

The production checkout is detached at the exact release commit and was clean
after the production build. The annotated Tag and branch are remote. This
attestation records deployment evidence; it does not move the release Tag.

## Runtime and access evidence

The production topology is:

1. `nexus7-web.service` serves the Next.js application on loopback port 3220;
2. `nexus7-symbiosis.service` atomically advances one simulated day per hour;
3. `nexus7-postgres` listens on loopback port 55433;
4. Caddy terminates public TLS, permits only GET, HEAD and OPTIONS, strips all
   asserted NEXUS identity headers and proxies to the web process.

All three services were active after the upgrade. No public username or
password is required. Every request resolves inside the application to the
fixed `public-observer` system principal with viewer/read permissions only.
Caller-supplied actor, administrator-role and Bearer headers are ignored.

The public root and `/api/auth/context` returned HTTP 200 with no Basic
challenge. The observatory API returned HTTP 200. A public POST returned HTTP
405 at Caddy; a valid mutation sent directly to loopback with forged
administrator headers returned HTTP 403 from the application.

The versioned `/api/observatory/v2/overview` endpoint returned HTTP 200 with
contract `nexus.human-observatory.v2`, 200 humans, 36 AI and 24 robots. Its
Turn 161 projection contained 24 persisted resource ledgers, 260 resident
states, eight active resource flows and thirteen settled events. It reported
196,265 produced, 193,528 consumed and 1,448 transferred modeled units. These
are internally settled simulation values, not live Shenzhen data. The v1
endpoint remains HTTP 200 as a deprecated read-compatibility adapter.

The same API and visible Human Observatory panel reported the configured
provider as `nexus-deterministic-reference`, 0 DeepSeek external attempts,
0 input/output/total DeepSeek Tokens and USD 0 recorded expense across 322
persisted decisions. This is an observed zero, not a live-provider claim or an
estimate of the human owner's wider account.

Caddy serves a Let's Encrypt certificate whose subject and SAN are
`nexus7.carrick7.com`, valid from 2026-07-19 through 2026-10-17. A production
Chromium navigation completed without a credential prompt. Desktop and 390 px
mobile runs checked Human Observatory and Dashboard in both light and dark
modes. All eight states produced zero runtime/console errors, zero horizontal
overflow and zero WCAG A/AA violations. English and Chinese rendered
correctly; the DeepSeek cost panel rendered from its API projection and the
removed deployment-mode labels did not reappear.

## AI-only world and live Turn

Migrations through `0011_resident_taxonomy.sql` were run idempotently while the Turn
writer and web process were stopped. The post-upgrade database contained:

- exactly 200 `human`, 36 `ai` and 24 `robot` rows in both the indexed column
  and resident JSON;
- zero deprecated `synthetic-human`, `software-ai` or `embodied-robot` rows;
- no `adult` column;
- no human-intent or private-memory tables;
- one resident-kind constraint allowing only `human`, `ai` and `robot`.

The worker then continued the existing season without resetting its history.
The first v4.3.3 process settled Turn 160 for simulated date 2026-12-25 with
fingerprint `d27efa89`. After the post-upgrade recovery point and normal worker
restart, Turn 161 settled with fingerprint `4977660a`, thirteen events, 316
cumulative eligible reciprocal episodes, RALR 75.00%, 46 refusals, 33
withdrawals, zero coercive actions, zero model cost and zero severe consent,
continuity or irreversible-harm escapes. Resource conservation passed.

The season retains its original `symbiotic-shenzhen-engine-4.0.0` origin
provenance. The exact deployment artifact and its first v4.3.3 Turn are
attested here, but durable per-Turn deployment-revision binding remains a future
evidence improvement.

## Recovery points

The pre-upgrade backup is:

`/deploy/nexus-7/backups/nexus-v4.3.3-pre-upgrade.json`

It is mode 0600 with internal checksum
`15d102aa5c004e0e7fac4511574a4a7764010519b53a1d6826526011d8068c09`.
It contains 260 residents, 160 Turn rows, 41,600 resident snapshots, 3,816
resource ledgers, 2,069 events and 318 cognitive decisions through Turn 159.

The post-upgrade backup is:

`/deploy/nexus-7/backups/nexus-v4.3.3-post-upgrade.json`

It is mode 0600 with internal checksum
`da7ee7005cdca49c04f1ba3ca9238353f24eb82ff8230b2a546d374d58360c91`.
It contains 260 residents, 161 Turn rows, 41,860 resident snapshots, 3,840
resource ledgers, 2,081 events and 320 cognitive decisions through Turn 160.

The PostgreSQL suite separately verified checksum restore against an
independent database. These production files have not been destructively
restored.

## Superseded production states

Tag `v4.3.2` at `c36f54259ad2d5dc2a89c8a2989e1f7b740bb534`
closed the production contrast gate. Tag `v4.3.1` at
`0233ab777b4406ab6e6e557a122300beb8aaff32`
introduced the chromatic shell, but its mandatory production browser audit
found dynamic light-theme contrast below 4.5:1. The Tag remains immutable and
is superseded by v4.3.2. Tag `v4.3.0` at
`bd285f97ee5a21634157089167a058f096d27514` introduced committed city resource
flows and its recovery points.
Tag `v4.2.0` at `9df53ed79237b1b2db37126aef074704ebccf1d6`
introduced the default Human Observatory and its recovery points. Tag `v4.1.0`
at `cb569b451057410ef180cd6901ea44ef57d9248f` removed
the credential gate and dormant participant schema; its pre/post-upgrade
backups remain available. Tag `v4.0.0` at
`f4d428a1909152e9bc7bb62ee8205c5a264b54e6` was the first production artifact,
and its Caddy route required Basic Auth. v4.3.3 preserves all Git and recovery
history.

## Remaining evidence boundaries

- cognition is deterministic in production; there is no live DeepSeek claim;
- there is no remote CI/Sigstore receipt for v4.3.3;
- no external controller or off-host second database has attested a production
  recovery drill;
- the public surface is anonymous read-only observation, not multi-user OIDC;
- all residents, relationships, events and institutions are synthetic, and the
  deployment provides no evidence of real-world policy effects.
