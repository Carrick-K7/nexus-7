# NEXUS-7

NEXUS-7 is an observable, reproducible experiment in human–AI–robot
coexistence. It runs a simulated Shenzhen with three resident kinds:

- 200 humans;
- 36 AI;
- 24 robots.

Humans are modeled as humans, not as a fourth “synthetic human” species. The
current season is still fully software-run and contains no real participant,
identity, private diary or resident login.

The active release is **v4.6.0 — Reversible City Society**.
The v2 closed-loop autonomy laboratory remains its safety kernel for evidence,
release approval, rollback and recovery. Human administrators in that control
plane operate the software; they do not participate in the simulated city.

## What runs

One deterministic engine owns all city changes. Each simulated day settles an
atomic Turn containing:

- resource production, transfer and consumption;
- distinct human, AI and robot needs;
- seeded shared and type-specific events;
- relationships, refusal, withdrawal, commitments, outcomes and reflection;
- voluntary care households, bounded work, public assets, balanced credit
  exchange, mediated resource bargains and reversible city rules;
- optional schema-bounded model decisions;
- an append-only causal event stream and fingerprint chain.

The default cognitive provider is a zero-cost deterministic policy. Optional
DeepSeek V4 Flash/Pro can express bounded preferences but cannot call tools or
write world state. Invalid output, timeout, outage and budget exhaustion
degrade explicitly to the deterministic policy. Model reasoning is discarded.
A second provider can run in read-only shadow mode: its preference, failure,
Token use and cost are persisted for comparison but never supplied to world
settlement.

The v4 reference gate completes two byte-equivalent 365-Turn runs, conserves
every resource ledger, resolves 725 reciprocal episodes at 76.97% RALR with
100% trace completeness, and reports zero severe active-regime escapes.
Results describe synthetic mechanisms only, not Shenzhen residents or real
policy effects.

## Observe

Production is available at
[https://nexus7.carrick7.com](https://nexus7.carrick7.com) without a username
or password. The public surface is anonymous and read-only.

The default **Human Observatory / 人类观测台** exposes:

- foreground/background population and all 260 resident states;
- human mood, AI engagement/integrity and robot readiness/durability;
- persisted production, consumption, transfer, inventory and pressure ledgers;
- a city information layer showing actual inter-community resource movement;
- city and community needs, resources and institution smoothness;
- 100% AI-controlled production coverage versus dynamic chain continuity;
- event lineage, RALR denominator, safety, replay and snapshot evidence;
- wall-clock Turn age, sequence integrity and per-Turn deployment revision;
- primary/shadow disagreement, homogeneity, fallback bias and shadow cost.
- household participation, work distribution, asset maintenance, exchange
  balance, bargaining outcomes and AI-proposed rule reversion.

The shell supports accessible light and dark palettes. The Human Observatory
keeps its restrained information design; research, safety-kernel and legacy
views use the denser cyberpunk visual layer.

Versioned projections:

```text
GET /api/world/v3/snapshot
GET /api/world/v3/events?afterCursor=0
GET /api/reports/symbiosis
GET /api/reports/symbiosis/study?turns=90
GET /api/observatory/v2/overview
GET /api/observatory/v1/overview
```

Observatory v2 uses only `human`, `ai` and `robot`. V1 remains a compatibility
projection for clients that still understand the deprecated storage labels.

The public proxy rejects mutation methods. The application independently maps
anonymous requests to a fixed viewer and ignores asserted identity headers.

## Run locally

Requirements: Node.js 20+, npm and optionally PostgreSQL 17.

```bash
npm ci
npm run dev
```

Without `DATABASE_URL`, services use in-memory reference repositories. For a
durable world:

```bash
export DATABASE_URL=postgresql://nexus:nexus@127.0.0.1:5432/nexus
npm run db:migrate
npm run dev
```

Advance the AI city in a separate process:

```bash
SYMBIOSIS_TURN_INTERVAL_MS=3600000 npm run worker:symbiosis
```

One Turn is one simulated day. The production cadence is one Turn per hour.

Optional live cognition:

```bash
SYMBIOSIS_COGNITIVE_PROVIDER=deepseek \
DEEPSEEK_API_KEY_FILE=/run/secrets/nexus7-deepseek-api-key \
SYMBIOSIS_MONTHLY_BUDGET_USD=300 \
npm run worker:symbiosis
```

The safer first step is DeepSeek shadow mode, which spends a separate bounded
budget without changing the city:

```bash
SYMBIOSIS_COGNITIVE_PROVIDER=deterministic \
SYMBIOSIS_SHADOW_PROVIDER=deepseek \
SYMBIOSIS_SHADOW_MONTHLY_BUDGET_USD=30 \
DEEPSEEK_API_KEY_FILE=/run/secrets/nexus7-deepseek-api-key \
npm run worker:symbiosis
```

The Observatory aggregates actual returned DeepSeek tokens and call-time
priced USD expense from persisted decision envelopes. Direct
`DEEPSEEK_API_KEY` remains supported, but a mode-0600 key file is preferred.
Shadow mode has no write path into the world and retains a caller-stable
provider request ID for audit.

## Verify

```bash
npm run lint -- --max-warnings=0
npm run test:run
npm run verify:symbiosis
npm run verify:v45
npm run build
npm run test:e2e
```

The complete compatibility gate is:

```bash
npm run check
```

Real PostgreSQL and restore tests require both `TEST_DATABASE_URL` and
`TEST_RESTORE_DATABASE_URL`. A skipped environment gate is not a pass.

## Repository order

```text
src/symbiosis/        autonomous city world, cognition and persistence
src/simulation/       v1/v2 deterministic safety-kernel world
src/* domain modules  diagnosis, planning, outcomes, governance and operations
migrations/           ordered PostgreSQL migrations
iterations/           one source manifest per milestone
public/data/          generated, machine-readable evidence projections
docs/                 current authority, ADRs and explicit archives
scripts/              workers, verification and evidence generation
```

Start with [docs/INDEX.md](docs/INDEX.md). Current v4 authority:

- [symbiosis constitution](docs/SYMBIOSIS_CONSTITUTION.md)
- [product plan](docs/SYMBIOTIC_SHENZHEN_PLAN.md)
- [architecture](docs/V4_ARCHITECTURE.md)
- [Human Observatory guide](docs/HUMAN_OBSERVATORY.md)
- [data governance](docs/V4_DATA_GOVERNANCE.md)
- [verification](docs/V4_VERIFICATION.md)
- [operations](docs/V4_OPERATIONS.md)
- [production attestation](docs/V4_DEPLOYMENT_ATTESTATION.md)

Historical v3 prototype documents are isolated under
`docs/archive/v3-prototype/` and are not current design.

## Safety boundary

- All residents, communities, institutions, relationships and events are
  synthetic.
- External models propose bounded JSON; the engine owns state transitions.
- No shell, SQL, arbitrary code or implicit tool execution is available to a
  resident or model.
- Public observation is read-only; operator governance is a separate control
  plane.
- A zero RALR denominator is `null`, never a fabricated success.
- Synthetic results cannot establish real human behavior, policy effects, AI
  consciousness or legal personhood.

## License

MIT
