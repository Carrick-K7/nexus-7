# NEXUS-7

NEXUS-7 is a cyberpunk city-simulation and multi-agent autonomy experiment. It
uses a browser-based city loop to make system behavior, agent actions, and the
project's iteration history observable from one control center.

The current safety kernel is **v2.0.0 — Closed-Loop Autonomy Lab**. The active
direction release is **v4.0.0 — All-Synthetic Symbiotic Shenzhen**. Its local
reference implementation is complete; production verification remains pending
fresh external evidence for an exact clean commit.

**Symbiotic Shenzhen v4** keeps v2 as the safety kernel and adds a long-running
synthetic world for studying reciprocal agency among 200 synthetic-human
residents, 36 software-AI residents, and 24 embodied robots. Every resident is
autonomous software; there are no participant seats, real identities, private
journals, or claims about real human behavior.

The v4 reference includes three fictional communities, deterministic daily
Turns, resources and distinct material needs, seeded events, relationships,
revocable commitments, outcome/reflection traces, a bounded DeepSeek-compatible
cognitive gateway with deterministic fallback, memory/PostgreSQL persistence,
the bilingual City Lens, and a three-regime multi-season mechanism study.

This is not a Shenzhen digital twin and does not support claims about real
policy effects, AI consciousness, or legal personhood. The
[Symbiosis Constitution](docs/SYMBIOSIS_CONSTITUTION.md) still requires
recorded human approval before any future real-participant work. See the
[evolution plan](docs/SYMBIOTIC_SHENZHEN_PLAN.md) and
[world architecture](docs/V3_WORLD_ARCHITECTURE.md).

The current local v4 gate replays 365 Turns exactly, conserves every resource
ledger, resolves 725 reciprocal episodes at 76.97% RALR with 100% trace
completeness and zero severe escapes, and separates reciprocal, hierarchy, and
segregation controls across 3 seeds × 90 Turns. These are synthetic mechanism
results, not production attestation.

## What it is today

- A Next.js application with 28 primary views and server-side experiment and
  controlled-iteration APIs.
- A framework-independent, seeded city simulation whose snapshots are projected
  into Zustand for the interface.
- Four domain agents—ATLAS, ECONOMICA, CIVITAS, and SPECTRE—plus ARIA as the
  central assistant.
- Validated agent commands, causal domain events, city thresholds,
  notifications, metric history, and an EvolutionLog generated from Git
  history.
- Pause, single-step, deterministic replay verification, and JSON run
  import/export controls on the Dashboard.
- An Observer Dashboard with five-stage Action Traces, north-star metrics,
  historical tick reconstruction, and counterfactual seed comparison.
- Four independent domain policies coordinated by an Agent Runtime with
  capabilities, budgets, cooldowns, priorities, risk ceilings, and conflict
  resolution.
- A pluggable model-provider boundary with deterministic mock mode, structured
  proposal validation, prompt/policy versioning, token/cost/timeout budgets,
  fallback reasons, and capability checks.
- A server-side OpenAI Responses provider with strict structured output,
  usage/cost accounting, and deterministic fallback. API keys never enter the
  browser.
- A human approval queue that auto-accepts low-risk proposals, requires explicit
  approval for medium/high risk, forbids critical actions, and records approved
  model actions in the deterministic causal trace.
- Server-authoritative experiment runs with optimistic concurrency, pause,
  resume, clock-driven stepping, historical forks, incremental SSE events,
  periodic snapshots, workspace roles, mutation audit records, and verified
  report bundles.
- A PostgreSQL JSONB repository and migration, plus a zero-configuration
  in-memory adapter for local development and tests.
- OIDC/JWKS authentication and a method/path/time-bound HMAC identity-proxy
  mode; development headers are accepted only in explicit development mode.
- Workspace-bound human, service-account, and system identities with
  least-privilege permissions; service accounts cannot approve promotions.
- Persisted organization membership and service-account lifecycle with exact
  issuer/subject binding, suspension, terminal revocation, rotation versions,
  and governance audit history.
- Multi-provider OIDC federation plus fixed CI, worker, and
  deployment-controller permission profiles.
- An independent leased clock worker, checksum-verified PostgreSQL backup and
  restore, and a 10,000-tick long-horizon stability audit.
- A controlled iteration lab that generates evidence-backed policy proposals,
  runs isolated baseline/candidate forks, evaluates acceptance thresholds,
  requires admin promotion, monitors a canary against a synchronized shadow
  baseline, raises SLO alerts, and automatically discards faulty candidates.
- Code and deployment proposals bound to exact repository/commit/evidence
  digests, independently signed external-attestation receipts, and human-admin
  promotion.
- A versioned 12-case model regression corpus with strict schema/capability,
  fallback, risk, latency, token, and spend release gates.
- HTTP deployment-control integration with 5% → 25% → 50% → 100% traffic
  progression, production telemetry, critical alerts, and platform rollback.
- Scheduled database-recovery and deployment-rollback drills with explicit
  RPO/RTO checks, 90-day evidence retention, and Sigstore attestations.
- A persistent remote-evidence registry with signed receipt ingestion,
  idempotent history, expiry checks, and freshness alerts for CI, model,
  recovery, and deployment evidence.
- Ed25519-signed organization release-policy bundles and ordered
  development → staging → production promotion for the exact same artifact.
- A pinned, network-isolated Docker quality executor plus GitHub Actions
  evidence manifests and Sigstore provenance attestation.
- A public three-scenario verification suite and machine-readable readiness API
  that gate verified loop rate, deterministic replay, causal completeness,
  rollback coverage, and invariants.
- ARIA coordination records plus deterministic explanations of the latest
  scheduling decision, model provenance and usage, and human pause/resume
  control.
- Weather, Resource, Trading, Emergency, and Analytics projections sourced from
  the shared deterministic world instead of independent random timers.
- A versioned nine-domain city ontology with 22 traceable direct and derived
  metrics, explicit units/ranges/formulas/owners, and one fingerprinted shared
  world snapshot.
- Five deterministic cross-domain mechanisms that emit causal events instead
  of letting interface components invent business state.
- Twenty synthetic truth-labelled scenarios across five incident families,
  with reproducible precision, recall, detection-delay, and replay evidence.
- Durable objectives, guardrails, scenario truth, and deduplicated city
  incidents through atomic memory/PostgreSQL lifecycle repositories.
- Observer drill-down from ontology and objective versions to incident root
  truth and affected synthetic groups; narrative mini-games are explicitly
  isolated sandboxes.
- Durable hypothesis graphs with alternatives, counterevidence, four
  independently preserved Agent submissions, and ARIA aggregation that cannot
  erase provenance.
- Frozen-snapshot candidate-removal tests with symptom resolution, effect
  size, labelled sensitivity intervals, and exact repeated fingerprints.
- A 45-sample synthetic calibration report, drift-driven read-only and
  deterministic-fallback modes, and a hard low-confidence experiment gate.
- An accessible Causal Explorer that separates fact, inference, prediction,
  human judgment, and known unknowns without claiming hidden model reasoning.
- A capability-bounded declarative Intervention DSL with exact inverses,
  explicit irreversibility, resource claims, costs, delays, and preconditions;
  arbitrary code, shell, SQL, and undeclared fields fail closed.
- Durable intervention portfolios that always compare no action with at least
  two valid candidates, preserve rule/model/human provenance, expose Pareto
  trade-offs, and freeze objectives, guardrails, stakeholder impacts, and
  diagnostic evidence.
- Paired five-seed experiments with isolated worlds, first-sample guardrail
  stops, budgets, conflict-aware scheduling, Holm-Bonferroni correction,
  deterministic replay, human evidence requests/rejection, and dual approval
  for high-risk or irreversible candidates.
- An accessible Planning Workbench that explains the selected candidate,
  rejected alternatives, experiment controls, queue reasons, approval state,
  and the boundary between synthetic staging and real deployment.
- An independent delayed Outcome Evaluator with short, medium, and long
  windows, frozen/historical/seasonal comparisons, attributable guardrails,
  deterministic replay, late-evidence revision, and incident reopening.
- A lineage-preserving Lesson Registry that retains success, failure,
  rollback, and inconclusive results; invalidation propagates to response
  playbooks and harmful memory is never positively retrieved.
- A bilingual Learning Observatory for prediction error, lesson provenance,
  context-gated playbooks, human attribution review, and declarative learning
  proposals that remain inside the controlled release chain.
- Versioned synthetic stakeholder groups, deterministic group-impact
  simulation, dissent-preserving goal deliberation, and separately
  authenticated human approvals that block severe minority harm.
- SLA-bound correction and appeal workflows whose overturned resolutions
  really reopen incidents, invalidate lessons/playbooks, or request planning
  evidence through the owning services.
- Structured decision, incident, and outcome explanations plus a fixed
  seven-attack governance red-team report in the accessible Participation
  Center.
- A ten-stage durable closed-loop orchestrator that links a real synthetic city
  incident to diagnosis, bounded alternatives, experiment, authenticated
  approval, development-to-production canary, independent outcome, lesson,
  governed next proposal, and formal closure.
- Digest-bound idempotency, optimistic concurrency, stage owners/deadlines,
  evidence expiry and superseding revalidation, pause/resume/cancel/rollback/
  emergency-stop/reopen controls, and compensation after timeouts or faults.
- A frozen 25-case v2 certification corpus with an honest 16/20 beneficial
  denominator, retained rollback/no-action/inconclusive/governance-denied
  outcomes, anti-Goodhart metrics, sabotage tests, and exact artifact binding.
- Seven versioned extension conformance profiles for agents, model providers,
  scenarios, repositories, notifications, deployment controllers, and outcome
  evaluators.
- A bilingual Closed-Loop Workbench and v2 Verification panel that expose the
  unified evidence trace, artifact trust, unresolved age, vetoes, rollbacks,
  protected-group effects, corpus results, and external-evidence boundary.
- English and Chinese navigation and core interface coverage.

The product is a verified autonomy laboratory, not a claim of general
intelligence. A real model provider is optional and remains an untrusted
proposal source behind budgets, schema checks, policy gates, and human
approval. The web process does not execute arbitrary source edits or
deployments.

## Observation model

| Dimension | What to observe | Entry point |
|---|---|---|
| System behavior | Seeded city metrics and threshold events | Dashboard |
| Agent autonomy | Observation, proposal, command, action, evaluation | Observer / AI Agents |
| System evolution | Manifested trigger, change, evidence, and artifacts | Evolution Log |

## Technology

- Next.js 16.2 with App Router and Turbopack
- React 19.2 and TypeScript 5
- Tailwind CSS 4 plus custom cyberpunk design tokens
- Zustand 5 with selected localStorage persistence
- PostgreSQL 17-compatible experiment persistence through `pg`
- Framer Motion 12
- Recharts 3
- Vitest and Testing Library
- Playwright and axe-core

## Run locally

Requirements:

- Node.js 22 recommended
- npm 11 or a lockfile-compatible npm release

```bash
npm ci
npm run dev
```

Open <http://localhost:3000>.

Without a database URL, experiment APIs use process-local memory. For durable
storage, copy `.env.example`, set `DATABASE_URL`, and apply the migration:

```bash
npm run db:migrate
npm run dev
```

For production, run the database-backed clock independently from the web
process:

```bash
npm run worker:clock
```

It uses a PostgreSQL lease so only one replica advances running experiments.
`POST /api/experiments/tick` remains available as a protected scheduler
integration seam.

Run the all-synthetic city clock separately:

```bash
SYMBIOSIS_TURN_INTERVAL_MS=3600000 npm run worker:symbiosis
```

One Turn represents one simulated day. The wall-clock interval is configurable
because no real participant deadline is involved; production defaults to one
simulated day per hour. The worker writes a JSON summary containing the Turn
fingerprint, RALR, safety counts, cognitive status, and accumulated model cost.

Open **City Lens** in the sidebar to observe community need satisfaction,
resource pressure, relationships, commitments, event flow, cognition cost, and
the v4 multi-season controls. The same data is available at:

- `/api/world/v3/snapshot`
- `/api/world/v3/events`
- `/api/reports/symbiosis`
- `/api/reports/symbiosis/study?turns=90`

The default cognitive provider is deterministic and costs nothing. To enable
DeepSeek for bounded preference decisions:

```bash
SYMBIOSIS_COGNITIVE_PROVIDER=deepseek \
DEEPSEEK_API_KEY=... \
SYMBIOSIS_MONTHLY_BUDGET_USD=300 \
npm run worker:symbiosis
```

Provider failure or budget exhaustion falls back explicitly and never stops
the city. Model reasoning is ignored and never persisted.

## Quality checks

```bash
npm run lint -- --max-warnings=0
npm run test:run
npm run verify:model
npm run verify:closure
npm run verify:symbiosis
npm run build
npx playwright install chromium
npm run test:e2e
npm run verify:stress
npm run evaluate:isolated -- quality
```

Run the complete gate with:

```bash
npm run check
```

Run the release evidence gate, including the isolated executor, evidence
manifest, and final exact-manifest closure binding, with:

```bash
npm run check:release
```

The real-provider prompt gate is intentionally separate because it consumes
external capacity and requires a server-side key:

```bash
NEXUS_MODEL_PROVIDER=openai OPENAI_API_KEY=... \
  npm run verify:model:live
```

`npm run test:e2e` creates a production build, starts it on
`http://127.0.0.1:4174`, and runs browser and accessibility regression tests.

## Project structure

```text
src/
├── app/                 Next.js application shell
├── components/          Feature and layout components
├── data/                Agent task configuration
├── hooks/               Simulation and translation hooks
├── i18n/                English and Chinese dictionaries
├── simulation/          Pure engine, agents, model boundary, replay, invariants
├── city/                Ontology, cross-domain mechanisms, truth and incidents
├── diagnosis/           Hypotheses, counterfactuals, calibration and trust
├── planning/            Bounded interventions, experiments and decisions
├── outcomes/            Delayed evaluation, lessons, playbooks and proposals
├── participation/       Stakeholders, deliberation, feedback and appeals
├── symbiosis/           v4 residents, resources, relationships and studies
├── closure/             Durable orchestration, corpus and v2 certification
├── lifecycle/           Generic atomic aggregate/event persistence contract
├── experiments/         Server run service and memory/PostgreSQL repositories
├── governance/          Identity, remote evidence, and signed release policy
├── iteration/           Controlled proposal, experiment, approval, canary flow
├── stores/              Zustand application state
├── test/                Vitest component and store tests
└── types/               Shared TypeScript contracts

e2e/                     Playwright and axe browser tests
docs/
├── CLOSED_LOOP_PLAN.md  North star, complete feature plan and stop conditions
├── V2_VERIFICATION.md   v2 metrics, corpus and trust semantics
├── PRODUCTION.md        Deployment, recovery and closed-loop runbook
└── adr/                 Architecture decisions
scripts/                 Build-time EvolutionLog generation
migrations/              PostgreSQL experiment schema
```

## Deterministic run controls

The Dashboard exposes the current seed, policy version, tick, recent causal
events, pause/resume, single-step, reset, replay verification, and JSON
import/export. The same initial state, seed, policy, configuration, and commands
produce byte-for-byte equivalent state and event logs.

Core guarantees are covered by Node-environment tests, including a 1,000-tick
replay, invariant enforcement, capability guardrails, causal links, and
tamper-resistant import validation.

## Persistent experiment controls

The Experiments view creates server-owned runs and exposes storage backend,
workspace/session, role, version, tick, live event stream, and persisted
evidence. Mutations require the current run version, so concurrent writers
receive an explicit conflict instead of silently overwriting one another.

Every run begins with a snapshot, adds another every five ticks, stores domain
events append-only, records actor/role mutation audits, can fork any retained
historical tick, and exports a report containing replay verification, causal
metrics, events, snapshots, and audit records.

The PostgreSQL adapter is integration-tested against a real PostgreSQL
container. Set `TEST_DATABASE_URL` to include repository/worker tests and
`TEST_RESTORE_DATABASE_URL` to include the destructive restore drill.

Create and restore checksum-verified logical backups with:

```bash
npm run db:backup -- backups/nexus.json
DATABASE_URL=postgresql://restore-target \
  npm run db:restore -- backups/nexus.json --force
```

## Controlled iteration

The Iteration Lab supports policy, code, and deployment scopes. Policy
proposals are tested on isolated baseline and candidate forks with the same
source tick, seed, and horizon. Target improvement, protected-metric
regression, deterministic replay, invariants, capability, and security
evidence decide whether they can reach human approval.

Approval never mutates the source run. It creates synchronized canary and
shadow-baseline forks. Replay, invariants, verified-loop rate, target direction,
and protected-metric regression are checked every tick. A breach creates a
critical alert and automatically discards the canary; every transition is
stored in a monotonic decision log.

Code and deployment proposals cannot use in-process evidence. They identify an
exact release artifact and wait for a short-lived signed receipt produced only
after GitHub Sigstore verification. The receipt must contain every promotion
gate, including live model regression. A human admin then approves, and the
deployment adapter performs progressive traffic shifting against real
telemetry or automatically rolls back.

Every external proposal also selects development, staging, or production and
freezes the active organization policy version. Staging requires the same
repository/commit to have completed development; production requires staging.
Environment policy supplies its traffic stages and request/error/P95/
availability SLOs.

## v1 verification

The Verification view and `GET /api/verification` run three public scenarios for
250 ticks each and publish a canonical readiness report. v1 requires at least
90% verified autonomy loop rate, at least 99% deterministic replay success,
100% accepted-action causal trace completeness, 100% rollback coverage, and
zero invariant violations.

Accepted actions include replay seed/tick/policy/command coordinates plus an
inverse rollback delta and restore value. See the verification, scenario, and
extension contract documents for the exact release boundary.

The final release artifact records 145/145 verified actions, 100% deterministic
replay across all three scenarios, 100% causal and rollback coverage, and zero
invariant violations.

## Production evidence

Production mutations can authenticate through verified OIDC bearer tokens or a
same-origin identity-aware proxy that strips incoming identity headers and
injects HMAC-signed subject/role claims. See `.env.example` and the production
operations guide.

The CI workflow reruns the complete gate, deterministic and live model
regressions, the 10,000-tick audit, and the network-isolated quality executor.
It uploads a hash-bound evidence manifest and, on pushes, requests a GitHub
Sigstore provenance attestation. An independent verifier converts a verified
attestation into an exact, expiring application receipt; local evidence cannot
authorize code or deployment promotion.

## Direction

The roadmap has reached its explicit v2.0 closure point. v1.9 completed stakeholder
impact review, goal deliberation, authenticated approval, feedback, appeal,
public explanation, and governance red-team evidence. v2.0 integrates the
existing domains behind one durable problem state machine, certification
corpus, verification contract, extension conformance boundary, and unified
Observer path.

The v2 north star is **Verified Beneficial Closure Rate**: eligible incidents
that complete the entire evidence-backed path from detection through durable
learning without violating protected metrics. This supplements, rather than
replaces, the v1 verified-autonomy compatibility contract.

See:

- [Product roadmap](docs/ROADMAP.md)
- [Closed-loop product and feature plan](docs/CLOSED_LOOP_PLAN.md)
- [Closed-loop orchestration](docs/CLOSED_LOOP_ORCHESTRATION.md)
- [v2 verification contract](docs/V2_VERIFICATION.md)
- [Security threat model](docs/THREAT_MODEL.md)
- [Deterministic simulation ADR](docs/adr/0001-deterministic-simulation-core.md)
- [Causal observation ADR](docs/adr/0002-causal-observation-model.md)
- [Agent runtime ADR](docs/adr/0003-agent-runtime-and-coordination.md)
- [Human-in-the-loop model ADR](docs/adr/0004-human-in-the-loop-model-boundary.md)
- [Persistent experiment platform ADR](docs/adr/0005-persistent-experiment-platform.md)
- [Controlled self-iteration ADR](docs/adr/0006-controlled-self-iteration.md)
- [Verified autonomy ADR](docs/adr/0007-verified-autonomy-contract.md)
- [Verification contract](docs/VERIFICATION.md)
- [Public scenarios](docs/SCENARIOS.md)
- [Extension contracts](docs/EXTENSIONS.md)
- [Experiment operations guide](docs/EXPERIMENTS.md)
- [Production operations guide](docs/PRODUCTION.md)
- [CI evidence and isolated execution](docs/CI_EVIDENCE.md)
- [Canary SLO and rollback](docs/CANARY_SLO.md)
- [Governed release policy](docs/GOVERNANCE.md)
- [Model regression gate](docs/MODEL_REGRESSION.md)
- [Scheduled operations drills](docs/OPERATIONS_DRILLS.md)
- [Federated operations](docs/FEDERATED_OPERATIONS.md)
- [Operational intelligence runbook](docs/OPERATIONAL_INTELLIGENCE.md)
- [Outcome learning](docs/OUTCOME_LEARNING.md)
- [Participatory governance](docs/PARTICIPATORY_GOVERNANCE.md)
- [Coherent city and incident model](docs/COHERENT_CITY_MODEL.md)
- [Causal diagnosis and Causal Explorer](docs/CAUSAL_DIAGNOSIS.md)
- [Goal-constrained planning](docs/GOAL_CONSTRAINED_PLANNING.md)
- [Governed deployment ADR](docs/adr/0009-governed-deployment.md)
- [Federated operations ADR](docs/adr/0010-federated-operations.md)
- [Operational intelligence ADR](docs/adr/0011-operational-intelligence.md)
- [Coherent city and incident ADR](docs/adr/0012-coherent-city-and-incident-model.md)
- [Causal diagnosis ADR](docs/adr/0013-causal-diagnosis.md)
- [Goal-constrained planning ADR](docs/adr/0014-goal-constrained-planning.md)
- [AI iteration log](AGENTS.md)

## License

MIT
