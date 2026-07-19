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
SYMBIOSIS_COGNITIVE_PROVIDER=deterministic
SYMBIOSIS_MONTHLY_BUDGET_USD=300
```

`public-observer` ignores asserted identity headers and grants only fixed
viewer permissions. The public reverse proxy must independently reject every
method except GET, HEAD and OPTIONS. Use OIDC or signed proxy mode in a
separate operator deployment if remote mutations are ever required.

Optional live cognition:

```dotenv
SYMBIOSIS_COGNITIVE_PROVIDER=deepseek
DEEPSEEK_API_KEY=...
DEEPSEEK_BASE_URL=https://api.deepseek.com
SYMBIOSIS_MODEL_TIMEOUT_MS=12000
```

The API key is server-side only. Without it, deterministic resident cognition
is the supported production default; the city remains fully operational.

## Observation

Human observer entry points:

- `/` → **City Lens** in the sidebar;
- `/api/world/v3/snapshot` → current world and resident projection;
- `/api/world/v3/events?afterCursor=0` → append-only event river;
- `/api/reports/symbiosis` → current RALR, safety, needs, relationships and cost;
- `/api/reports/symbiosis/study?turns=90` → v4 control comparison.

Operational checks:

```bash
systemctl status nexus7-web nexus7-symbiosis
journalctl -u nexus7-symbiosis -n 50 --no-pager
curl -fsS http://127.0.0.1:3220/api/reports/symbiosis
```

Each worker log line is JSON and includes Turn, simulation date, fingerprint,
event count, cognition status, RALR, safety and accumulated model cost.

Alert if no Turn arrives within twice the configured interval, any severe
escape is nonzero, `resourceConservationPassed` is false, `longPending` grows,
or monthly cognition cost reaches 70%, 90% or 100% of budget.

## Backup, recovery and upgrade

Use the existing checksum backup and restore commands. A release must build and
test from a clean commit, migrate a staging/restore database, stop the worker,
deploy the exact artifact, start web then worker, and compare the first
post-upgrade fingerprint/report. Never repair continuity by deleting the
season or silently resetting residents.

If the worker fails, leave the last committed Turn untouched, fix or roll back
the process, and restart. If the provider fails, do not roll back the city:
the decision envelope records deterministic degradation automatically.
