# v4 Production Deployment Attestation

> Observed: 2026-07-19 · Asia/Shanghai

## Current artifact

- Release: `v4.2.0`
- Commit: `9df53ed79237b1b2db37126aef074704ebccf1d6`
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

The versioned `/api/observatory/v1/overview` endpoint returned HTTP 200 with
contract `nexus.human-observatory.v1`, 260 foreground software units, 24
projected institutions and eight modeled production stages. It separately
reported 100% autonomous control coverage and 0% real-human labor dependency;
these fixed scope facts are not the dynamic production-continuity score.

Caddy serves a Let's Encrypt certificate whose subject and SAN are
`nexus7.carrick7.com`, valid from 2026-07-19 through 2026-10-17. A production
Chromium navigation completed without a credential prompt. Desktop and 390 px
mobile Chromium runs opened a unit detail, produced no runtime errors or
horizontal overflow, and returned zero WCAG A/AA violations. The Chinese
Observatory and its production/unit explanations were visible.

## AI-only world and live Turn

Migrations through `0010_ai_only_world.sql` were run idempotently while the Turn
writer and web process were stopped. The post-upgrade database contained:

- 260 residents and zero `participant-avatar` rows;
- no `adult` column;
- no human-intent or private-memory tables;
- one resident-kind constraint allowing only `synthetic-human`,
  `software-ai` and `embodied-robot`.

The worker then continued the existing season without resetting its history.
It settled Turn 8 for simulated date 2026-07-26 with fingerprint `a04f8b55`,
seven events, twelve cumulative eligible reciprocal episodes, RALR 58.33%,
four refusals, one withdrawal, zero model cost and zero severe consent,
continuity or irreversible-harm escapes.

The season retains its original `symbiotic-shenzhen-engine-4.0.0` provenance
because v4.1 and v4.2 are access, schema and observation updates. The exact
deployment artifact is attested here, but per-Turn deployment-revision binding
remains a future evidence improvement.

## Recovery points

The pre-upgrade backup is:

`/deploy/nexus-7/backups/nexus-v4.2.0-pre-upgrade.json`

It is mode 0600 with checksum
`03dcaf4af770e706290d91e04fd5336f1abc66366bce0208a2b92e6af7bafd2e`.
It contains 260 residents and 2,080 resident snapshots across Turn 0 through
Turn 7.

The post-upgrade backup is:

`/deploy/nexus-7/backups/nexus-v4.2.0-post-upgrade.json`

It is mode 0600 with checksum
`5abb42b48c745a82075f289112c940e5921291fafab8a402dcf6654a70c686e5`.
It contains 260 residents, nine Turn rows, 2,340 resident snapshots and 42
events from Turn 0 through Turn 8.

The PostgreSQL suite separately verified checksum restore against an
independent database. These production files have not been destructively
restored.

## Superseded production states

Tag `v4.1.0` at `cb569b451057410ef180cd6901ea44ef57d9248f` removed
the credential gate and dormant participant schema; its pre/post-upgrade
backups remain available. Tag `v4.0.0` at
`f4d428a1909152e9bc7bb62ee8205c5a264b54e6` was the first production artifact,
and its Caddy route required Basic Auth. v4.2 preserves both Git and recovery
histories while replacing the default legacy dashboard with the read-only
Human Observatory.

## Remaining evidence boundaries

- cognition is deterministic in production; there is no live DeepSeek claim;
- there is no remote CI/Sigstore receipt for v4.2;
- no external controller or off-host second database has attested a production
  recovery drill;
- the public surface is anonymous read-only observation, not multi-user OIDC;
- all residents, relationships, events and institutions are synthetic, and the
  deployment provides no evidence of real-world policy effects.
