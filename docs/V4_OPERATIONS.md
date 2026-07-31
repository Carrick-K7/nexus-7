# v4 Symbiotic Shenzhen Operations

## Runtime topology

Production uses one PostgreSQL database and two application processes:

1. `npm run start` serves Next.js and read-only research projections;
2. `npm run worker:symbiosis` advances one atomic Turn per configured interval.

Run `npm run db:migrate` before starting either process. Multiple web replicas
are safe; only one symbiosis worker should normally run. An expected-head
transaction rejects accidental concurrent settlements.

Recommended environment:

```dotenv
NODE_ENV=production
PORT=3220
HOSTNAME=127.0.0.1
DATABASE_URL=postgresql://...
NEXUS_AUTH_MODE=public-observer
SYMBIOSIS_TURN_INTERVAL_MS=3600000
SYMBIOSIS_WORKER_ID=nexus7-symbiosis-1
NEXUS_RELEASE_REVISION=<exact-40-character-release-commit>
SYMBIOSIS_COGNITIVE_PROVIDER=deterministic
SYMBIOSIS_MONTHLY_BUDGET_USD=300
SYMBIOSIS_SHADOW_PROVIDER=reference
SYMBIOSIS_SHADOW_MONTHLY_BUDGET_USD=30
SYMBIOSIS_RECOVERY_EVIDENCE_FILE=/run/nexus7/recovery-evidence.json
```

`public-observer` ignores asserted identity headers and grants only fixed
viewer permissions. The public reverse proxy must independently reject every
method except GET, HEAD and OPTIONS. Use OIDC or signed proxy mode in a
separate operator deployment if remote mutations are ever required.

Optional live cognition:

```dotenv
SYMBIOSIS_COGNITIVE_PROVIDER=deepseek
DEEPSEEK_API_KEY_FILE=/run/secrets/nexus7-deepseek-api-key
DEEPSEEK_BASE_URL=https://api.deepseek.com
SYMBIOSIS_MODEL_TIMEOUT_MS=12000
```

Run a provider as shadow first:

```dotenv
SYMBIOSIS_COGNITIVE_PROVIDER=deterministic
SYMBIOSIS_SHADOW_PROVIDER=deepseek
SYMBIOSIS_SHADOW_MONTHLY_BUDGET_USD=30
```

The API key is server-side only; direct `DEEPSEEK_API_KEY` is also supported.
The file should be mode 0600 and readable by both web and worker services.
Without it, deterministic resident cognition is the supported production
default; the city remains fully operational.

## Observation

Human observer entry points:

- `/` → default **Human Observatory**;
- `/api/observatory/v2/overview` → human/AI/robot population, every resident,
  persisted resource flows, institutions, production chain, DeepSeek
  token/cost ledger, shadow diversity, Turn reliability, households, work,
  assets, exchange balance, bargains, city rules and evidence;
- `/api/observatory/v1/overview` → deprecated label-compatible projection;
- `/api/world/v3/snapshot` → current world and resident projection;
- `/api/world/v3/events?afterCursor=0` → append-only event river;
- `/api/reports/symbiosis` → current RALR, safety, needs, relationships and cost;
- `/api/reports/symbiosis/study?turns=90` → v4 control comparison.

Operational checks:

```bash
systemctl status nexus7-web nexus7-symbiosis
journalctl -u nexus7-symbiosis -n 50 --no-pager
curl -fsS http://127.0.0.1:3220/api/reports/symbiosis
curl -fsS http://127.0.0.1:3220/api/observatory/v2/overview
```

Each worker log line is JSON and includes Turn, simulation date, fingerprint,
event count, deployment revision/timing/lag, cognition and shadow status,
RALR, safety and accumulated model cost.

On normal startup the worker reads the latest persisted runtime envelope and
waits until its configured next due time. Restarts therefore do not create
extra simulated days. `--once` is an explicit drill override and settles
immediately. A non-numeric or sub-minute interval fails startup.

Alert if no Turn arrives within twice the configured interval, any severe
escape is nonzero, `resourceConservationPassed` is false, `longPending` grows,
city credit conservation fails, a production rule is invalid, forced society
actions appear in the reciprocal regime, or monthly cognition cost reaches
70%, 90% or 100% of budget.

## Backup, recovery and upgrade

Use the existing checksum backup and restore commands. To produce an encrypted
envelope and a same-host second-database receipt:

```bash
npm run db:backup -- backups/nexus.json
NEXUS7_BACKUP_ENCRYPTION_KEY_FILE=/run/secrets/nexus7-backup.key \
  npm run backup:crypt -- encrypt backups/nexus.json backups/nexus.json.nexus7
DATABASE_URL="$RESTORE_DATABASE_URL" \
  npm run db:restore -- backups/nexus.json --force
RESTORE_DATABASE_URL="$RESTORE_DATABASE_URL" \
NEXUS7_BACKUP_ENCRYPTION_KEY_FILE=/run/secrets/nexus7-backup.key \
  npm run recovery:evidence -- \
  backups/nexus.json backups/nexus.json.nexus7 \
  /run/nexus7/recovery-evidence.json
```

The key file must contain 32 random bytes encoded as 64 hexadecimal characters
and be mode 0600. The receipt command authenticates and decrypts the encrypted
artifact, binds its SHA-256 and embedded backup checksum, verifies every
restored row count and latest fingerprint, then advances the disposable
restore database by one Turn. `--off-host` additionally requires distinct
`SYMBIOSIS_BACKUP_SOURCE_HOST_FINGERPRINT` and
`SYMBIOSIS_RESTORE_TARGET_HOST_FINGERPRINT` SHA-256 values. The public v4.8
gate still requires the resulting envelope to be independently attested and
bound by a fresh signed receipt; a flag or host claim alone cannot pass.
See [V4_TRUST_MATRIX.md](V4_TRUST_MATRIX.md) for the GitHub-hosted drill.

A release must build and
test from a clean commit, migrate a staging/restore database, stop the worker,
deploy the exact artifact, start web then worker, and compare the first
post-upgrade fingerprint/report. Never repair continuity by deleting the
season or silently resetting residents.

v4.6 migration `0012_richer_city_society.sql` is additive. Existing seasons
remain readable before their first v4.6 Turn; the service hydrates a
deterministic society baseline at the existing head without rewriting its
fingerprint. The next due Turn persists normalized society records and
`society` events atomically. Do not use `--once` merely to force that upgrade.

If the worker fails, leave the last committed Turn untouched, fix or roll back
the process, and restart. If the provider fails, do not roll back the city:
the decision envelope records deterministic degradation automatically.
