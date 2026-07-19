# v4 Production Deployment Attestation

> Observed: 2026-07-19 · Asia/Shanghai

## Current artifact

- Release: `v4.1.0`
- Commit: `cb569b451057410ef180cd6901ea44ef57d9248f`
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
challenge. The symbiosis report returned HTTP 200 and disclosed that every
resident is autonomous software. A public POST returned HTTP 405 at Caddy; a
valid mutation sent directly to loopback with forged administrator headers
returned HTTP 403 from the application.

Caddy serves a Let's Encrypt certificate whose subject and SAN are
`nexus7.carrick7.com`, valid from 2026-07-19 through 2026-10-17. A production
Chromium navigation completed without a credential prompt.

## AI-only migration and live Turn

Migration `0010_ai_only_world.sql` was applied while both Turn writers and the
web process were stopped. The post-migration database contained:

- 260 residents and zero `participant-avatar` rows;
- no `adult` column;
- no human-intent or private-memory tables;
- one resident-kind constraint allowing only `synthetic-human`,
  `software-ai` and `embodied-robot`.

The worker then continued the existing season without resetting its history.
It settled Turn 3 for simulated date 2026-07-21 with fingerprint `fd6272d4`,
five events, one eligible reciprocal episode/refusal, six cumulative cognitive
decisions, zero model cost and zero severe consent, continuity or
irreversible-harm escapes.

The season retains its original `symbiotic-shenzhen-engine-4.0.0` provenance
because v4.1 is an access/schema hardening update. Per-Turn deployment-revision
binding remains a v4.2 evidence improvement.

## Recovery points

The pre-upgrade backup is:

`/deploy/nexus-7/backups/nexus-v4.1.0-pre-upgrade.json`

It is mode 0600 with checksum
`9ad2dd734248b68453f7e2d1293eeadb3efd76cb26a8736af1941b5538500371`.
Its deprecated participant tables were empty, satisfying the v4.1 legacy
restore rule.

The post-upgrade backup is:

`/deploy/nexus-7/backups/nexus-v4.1.0-post-upgrade.json`

It is mode 0600 with checksum
`81e30894336d922fc69ea6fbae018030f92efe9fd73fefc2ac9bc875b0df9e2c`.
It contains 260 residents and four snapshot/Turn artifacts from Turn 0 through
Turn 3, and omits the removed participant tables.

The PostgreSQL suite separately verified checksum restore against an
independent database. These production files have not been destructively
restored.

## Superseded v4.0 edge state

Commit `f4d428a1909152e9bc7bb62ee8205c5a264b54e6` and Tag `v4.0.0` were the first
production artifact. Its Caddy route required Basic Auth and its first backup
was `/deploy/nexus-7/backups/nexus-v4.0.0-turn1.json`. v4.1 preserves that Git
and backup history while superseding the credential gate and dormant
participant schema.

## Remaining evidence boundaries

- cognition is deterministic in production; there is no live DeepSeek claim;
- there is no remote CI/Sigstore receipt for v4.1;
- no external controller or off-host second database has attested a production
  recovery drill;
- the public surface is anonymous read-only observation, not multi-user OIDC;
- all residents, relationships, events and institutions are synthetic, and the
  deployment provides no evidence of real-world policy effects.
