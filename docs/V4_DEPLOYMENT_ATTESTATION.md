# v4 Production Deployment Attestation

> Observed: 2026-07-19 · Asia/Shanghai

## Current artifact

- Release: `v4.3.2` — Chromatic City Shell
- Commit: `c36f54259ad2d5dc2a89c8a2989e1f7b740bb534`
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
current-Turn projection contained 24 persisted resource ledgers, 260 resident
states, eight active resource flows, 16 transfer lanes and 14 settled events.
It reported 194,535 produced, 193,140 consumed and 4,247 transferred modeled
units. These are internally settled simulation values, not live Shenzhen data.
The v1 endpoint remains HTTP 200 as a deprecated read-compatibility adapter.

Caddy serves a Let's Encrypt certificate whose subject and SAN are
`nexus7.carrick7.com`, valid from 2026-07-19 through 2026-10-17. A production
Chromium navigation completed without a credential prompt. Desktop and 390 px
mobile runs checked Human Observatory and Dashboard in both light and dark
modes. All eight states produced zero runtime/console errors, zero horizontal
overflow and zero WCAG A/AA violations. English and Chinese rendered
correctly; the removed deployment-mode labels did not reappear.

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
The v4.3.2 process settled Turn 15 for simulated date 2026-08-02 with
fingerprint `a92d8bc7`, fourteen events, 24 cumulative eligible reciprocal
episodes, RALR 62.50%, five refusals, four withdrawals, zero coercive actions,
zero model cost and zero severe consent, continuity or irreversible-harm
escapes. Resource conservation passed.

The season retains its original `symbiotic-shenzhen-engine-4.0.0` origin
provenance. The exact deployment artifact and its first v4.3.2 Turn are
attested here, but durable per-Turn deployment-revision binding remains a future
evidence improvement.

## Recovery points

The pre-upgrade backup is:

`/deploy/nexus-7/backups/nexus-v4.3.2-pre-upgrade.json`

It is mode 0600 with checksum
`8688f30a2200d5f0feb4083abddee140250cf473503e388f894f1d6fc905817c`.
It contains 260 residents, fifteen Turn rows, 3,900 resident snapshots, 336
resource ledgers and 99 events through Turn 14.

The post-upgrade backup is:

`/deploy/nexus-7/backups/nexus-v4.3.2-post-upgrade.json`

It is mode 0600 with checksum
`17ded45f6fedc61456fb0be84621ce05b33b0825c424d9c23d0da95b2dbf7051`.
It contains 260 residents, sixteen Turn rows, 4,160 resident snapshots, 360
resource ledgers and 113 events through Turn 15.

The PostgreSQL suite separately verified checksum restore against an
independent database. These production files have not been destructively
restored.

## Superseded production states

Tag `v4.3.1` at `0233ab777b4406ab6e6e557a122300beb8aaff32`
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
and its Caddy route required Basic Auth. v4.3.2 preserves all Git and recovery
history.

## Remaining evidence boundaries

- cognition is deterministic in production; there is no live DeepSeek claim;
- there is no remote CI/Sigstore receipt for v4.3.2;
- no external controller or off-host second database has attested a production
  recovery drill;
- the public surface is anonymous read-only observation, not multi-user OIDC;
- all residents, relationships, events and institutions are synthetic, and the
  deployment provides no evidence of real-world policy effects.
