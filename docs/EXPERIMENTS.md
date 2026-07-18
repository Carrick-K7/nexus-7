# Experiment Platform Operations

## Storage modes

If neither `DATABASE_URL` nor `POSTGRES_URL` exists, NEXUS-7 uses an in-memory
repository. This mode is useful for local exploration but is reset with the
server process.

For durable storage:

```bash
cp .env.example .env.local
npm run db:migrate
npm run dev
```

The schema is in `migrations/0001_experiment_platform.sql`. The application also
applies the idempotent schema during repository initialization.

## Independent server clock

`resume` marks a run as eligible for advancement. The authoritative clock driver
is:

```text
POST /api/experiments/tick
Authorization: Bearer <NEXUS_CRON_SECRET>
```

For production, prefer:

```bash
npm run worker:clock
```

The worker talks directly to PostgreSQL and renews a distributed lease. Multiple
replicas may run, but only the lease holder advances experiments. The HTTP
driver remains available for managed scheduler integrations. Optimistic version
checks isolate concurrent scheduler or operator writes.

## Run API

- `GET /api/experiments` — backend, default workspace/session, and runs.
- `POST /api/experiments` — create a paused run.
- `GET /api/experiments/runs/:id` — fetch one run.
- `POST /api/experiments/runs/:id/actions` — pause, resume, step, or fork.
- `GET /api/experiments/runs/:id/events?after=<cursor>` — incremental events.
- `GET /api/experiments/runs/:id/stream?after=<cursor>` — SSE event stream.
- `GET /api/experiments/runs/:id/report?download=1` — verified report bundle.

Development mode can simulate roles with:

```text
X-Nexus-Actor: operator-id
X-Nexus-Role: viewer | operator | admin
```

Production mode never trusts those headers. Configure either verified OIDC
Bearer tokens or the signed proxy protocol documented in `docs/PRODUCTION.md`.

## PostgreSQL verification

The integration suite is opt-in so the default quality gate remains
zero-configuration:

```bash
TEST_DATABASE_URL=postgresql://... \
  npx vitest run src/experiments/postgres-repository.test.ts
```

The test verifies migration compatibility, run persistence, append-only events,
periodic snapshots, audit records, deterministic report replay, and stale-write
conflicts against a real PostgreSQL server.

The backup/restore drill additionally uses:

```bash
TEST_DATABASE_URL=postgresql://source \
TEST_RESTORE_DATABASE_URL=postgresql://empty-restore-target \
  npx vitest run src/operations/postgres-backup.test.ts
```
