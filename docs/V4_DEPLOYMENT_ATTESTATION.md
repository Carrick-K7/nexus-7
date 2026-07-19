# v4.0.0 Production Deployment Attestation

> Observed: 2026-07-19 · Asia/Shanghai

## Bound artifact

- Release: `v4.0.0`
- Commit: `f4d428a1909152e9bc7bb62ee8205c5a264b54e6`
- Remote branch: `direction/symbiotic-shenzhen-v3`
- Public origin: `https://nexus7.carrick7.com`
- Address observed through system and public DNS: `43.160.217.167`

The deployment checkout was detached at the exact release commit and clean
after the production build. This attestation records deployment evidence; it
does not move or recreate the release Tag.

## Runtime evidence

The production topology is:

1. `nexus7-web.service` serving the Next.js application on loopback port 3220;
2. `nexus7-symbiosis.service` atomically advancing one simulated day per hour;
3. `nexus7-postgres` on loopback port 55433 with restart policy
   `unless-stopped`;
4. Caddy terminating public TLS, enforcing Basic Auth, removing untrusted
   `x-nexus-*` headers and proxying to the web process.

Both application units were active and enabled. The initial durable state
contained Turn 0 and settled Turn 1, 260 residents, 60 relationships, two
reciprocal episodes, two cognitive decisions and three public events.

The Turn 1 worker record reported fingerprint `001fa198`, complete cognition,
zero model cost and zero severe consent, continuity or irreversible-harm
escapes.

## Public edge evidence

Public and system resolvers returned `43.160.217.167`. Caddy completed the
TLS-ALPN challenge and obtained a Let's Encrypt certificate whose subject and
SAN are `nexus7.carrick7.com`, valid from 2026-07-19 through 2026-10-17.

An unauthenticated HTTPS request returned HTTP 401 with a Basic challenge,
confirming that TLS and the intended access-control route are active. The
production root page, snapshot, event river, symbiosis report and multi-season
study returned HTTP 200 from the protected upstream application.

## Recovery point

The first production backup is:

`/deploy/nexus-7/backups/nexus-v4.0.0-turn1.json`

It is mode 0600 and carries application checksum
`18e1297a6212f0e3fb0e0f34c469558c296284672f96af03c4ddfc57c69a92f3`.
The previously completed PostgreSQL suite verified checksum backup/restore
against an independent restore database; this production file itself has not
been destructively restored.

## Remaining evidence boundaries

- cognition is intentionally deterministic; there is no live DeepSeek claim;
- there is no remote CI/Sigstore receipt for this revision;
- no external controller or second production database has attested a recovery
  drill;
- Basic Auth protects the public observer surface; this is not a multi-user
  OIDC deployment;
- all city residents, relationships, events and institutions are synthetic,
  and the deployment provides no evidence of real-world policy effects.
