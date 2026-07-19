# NEXUS-7 Product Roadmap

## v4.0.0 — All-Synthetic Symbiotic Shenzhen ✅ local implementation

v4 keeps v2 as the safety kernel and runs 200 synthetic-human, 36 software-AI
and 24 robot residents without real participants. Deterministic resources and
needs now feed relationship preference, refusal, commitment, result and
reflection loops; a bounded DeepSeek-compatible gateway degrades to a zero-cost
reference policy. City Lens and a 3-regime × 3-seed study expose RALR,
coercion, needs, safety, event provenance and model cost.

Local gate: 365-Turn exact replay, 725 resolved episodes, RALR 76.97%, trace
completeness 100%, resource conservation pass and zero severe active-regime
escapes. This is synthetic mechanism evidence only; external deployment and
attestation remain pending.

## Product north star

NEXUS-7 will become an observable, reproducible, and constrained multi-agent
autonomy lab. A human observer should be able to determine why an action
happened, what it changed, whether it helped, and how to replay or reverse it.

## North-star metric

**Verified autonomy loop rate**

The percentage of agent actions that include:

- the triggering observation;
- policy/model version;
- structured proposal and validated command;
- before/after metrics;
- guardrail result;
- causal trace;
- deterministic replay data;
- rollback information.

The v1.0 target is at least 90%, with 99% deterministic replay success and 100%
causal trace completeness for accepted actions.

This remains the v1 compatibility metric. The v2 product north star is
**Verified Beneficial Closure Rate (VBCR)**: the percentage of eligible
incidents that complete detection, diagnosis, controlled experimentation,
authorization, staged intervention, independent outcome evaluation, and
governed learning with no guardrail breach. The target is at least 80%, paired
with at least 95% detection coverage and zero severe guardrail escapes so the
metric cannot be improved by ignoring difficult incidents.

The complete closed-loop definition, feature inventory, exit gates, risks, and
implementation order are in [CLOSED_LOOP_PLAN.md](CLOSED_LOOP_PLAN.md).

## Releases

### v0.3.1 — Trustworthy Baseline ✅

- Eliminate known runtime crashes and lint warnings.
- Establish responsive navigation and layouts.
- Add browser, accessibility, and CI regression gates.
- Correct version, documentation, and EvolutionLog inconsistencies.
- Record the deterministic simulation architecture decision.

### v0.4.0 — Deterministic Simulation Core ✅

- Framework-independent simulation engine.
- Seeded randomness, scenario fixtures, invariants, pause/step/replay.
- One authoritative simulation clock and world state.
- Validated JSON run import/export with deterministic tamper checks.

### v0.5.0 — Causal Observation ✅

- Structured observations, proposals, commands, events, and evaluations.
- Action Trace, Observer Dashboard, and replay comparison.
- EvolutionLog backed by iteration manifests rather than commit messages alone.
- Shared deterministic projections for Weather, Resource, Trading, Emergency,
  and Analytics.

### v0.6.0 — Agent Runtime ✅

- Formal observe/propose/evaluate agent interface.
- Capabilities, budgets, cooldowns, scheduling, conflict resolution, and
  command validation.
- ARIA becomes the coordinator and human interface.

### v0.7.0 — Human-in-the-loop AI ✅

- Optional model providers with structured output.
- Prompt/policy versioning, cost budgets, timeouts, and deterministic mock mode.
- Risk-tiered approvals and forbidden-action policies.

### v0.8.0 — Persistent Experiment Platform ✅

- Server-authoritative runs, PostgreSQL event storage, snapshots, and streaming.
- Experiment sessions, workspaces, permissions, and report export.

### v0.9.0 — Controlled Self-iteration ✅

- AI-generated improvement proposals and experiment specifications.
- Isolated implementation branches, automated evaluation, human approval,
  deployment monitoring, and rollback.

### v1.0.0 — Verified Autonomy Lab ✅

- Meets the north-star thresholds.
- Reproducible public scenarios and documented extension contracts.
- Stable desktop/mobile observer experience.

### v1.1.0 — Production Evidence ✅

- OIDC/JWKS and signed identity-proxy authentication.
- Real OpenAI Responses provider behind strict structured output and fallback.
- Independent PostgreSQL-leased clock worker.
- Checksum-verified backup/restore and 10,000-tick stability evidence.
- Network-isolated, read-only, resource-limited quality executor.
- GitHub Actions evidence manifest and Sigstore provenance workflow.
- Shadow-baseline canary SLOs, critical alerts, and automatic rollback drills.
- v1 verification thresholds and public artifacts remain backward compatible.

### v1.2.0 — Governed Deployment ✅

- Multi-tenant workspace authorization, principal types, and least privilege.
- Live-provider regression corpus, spend SLOs, and prompt release gates.
- Production telemetry ingestion and deployment-environment canary adapters.
- Require externally verified provenance before code/deployment promotion.
- Scheduled disaster-recovery and rollback drills with retained evidence.
- Preserve the v1 verification and v1.1 production-evidence contracts.

### v1.3.0 — Federated Operations ✅

- Durable organization/workspace membership and service-account administration.
- Workload-identity federation for CI, workers, and deployment controllers.
- Remote evidence ingestion, expiry alerts, and drill-history dashboards.
- Multi-environment promotion orchestration and environment-specific policy.
- Signed policy bundles and organization-level release templates.

### v1.4.0 — Operational Intelligence ✅

- Persisted model, deployment, recovery, and evidence SLO time-series.
- Notification delivery and escalation for stale evidence and policy expiry.
- Organization delegation, break-glass recovery, and access-review reports.
- External deployment-controller conformance fixtures and contract versioning.
- Operations Center with incident deduplication, acknowledgement, dead letters,
  audit drill-down, and accessible trend views.

### v1.5.0 — Coherent City & Incident Model ✅

- One versioned city ontology for population, infrastructure, economy, safety,
  environment, and digital networks.
- Cross-domain causal events instead of component-owned random state.
- Persisted incident lifecycle, scenario truth, impact scope, objectives, and
  guardrails.
- At least 20 reproducible scenarios across five incident families.

### v1.6.0 — Causal Diagnosis ✅

- Evidence-backed hypothesis graphs with alternatives and counter-evidence.
- Frozen-snapshot counterfactual diagnosis and confidence calibration.
- Drift detection and deterministic fallback when diagnostic trust falls.
- Causal Explorer that distinguishes fact, inference, prediction, and judgment.

### v1.7.0 — Goal-Constrained Planning ✅

- Declarative, capability-bounded intervention contract.
- Candidate portfolios including the no-action baseline.
- Multi-seed experiment design, stopping rules, budgets, and Pareto comparison.
- Human review showing selected and rejected alternatives.

### v1.8.0 — Outcome Learning ✅

- Independent short-, medium-, and long-horizon outcome evaluation.
- Versioned lesson registry and context-checked response playbooks.
- Learning can propose policy, prompt, scenario, or test changes but cannot
  bypass the existing release-governance chain.
- Learning observability, invalidation, and deterministic memory rebuild.

### v1.9.0 — Participatory Governance ✅

- Stakeholder impact decomposition and protected-group guardrails.
- Human goal deliberation, dissent, feedback, correction, and appeal.
- Fact-grounded public explanations and machine-readable evidence bundles.
- Governance red-team scenarios for collusion, goal gaming, forged evidence,
  automation bias, and minority harm.

### v2.0.0 — Closed-Loop Autonomy Lab ✅ local implementation

- One durable incident-to-learning orchestrator with idempotent compensation.
- End-to-end public certification corpus covering success, rollback, no-action,
  inconclusive outcomes, late harm, and governance failure.
- v2 machine-readable verification contract bound to the exact release
  artifact and external evidence.
- Versioned conformance suites for every extension boundary.
- Unified Observer path from city state to incident, hypothesis, experiment,
  decision, deployment, outcome, and lesson.
- Completion requires VBCR ≥80%, detection coverage ≥95%, deterministic replay
  ≥99.9%, 100% rollback coverage for injected faults, and zero severe guardrail
  escapes.

The fixed local/reference certification currently meets every threshold:
VBCR 80%, detection 100%, replay 100%, causal/evidence/corpus coverage 100%,
injected rollback 100%, and zero severe escapes. The working tree is not a
clean externally attested release, so the precise status is
`implementation complete / external evidence pending`, not production
verification.

## Product rule

Until the existing modules share one world model and causal event system, new
panels and mini-games are lower priority than depth, correctness, and
observability.

After v2.0 meets every closed-loop exit criterion, the default priority changes
to stability, external reproduction, and evidence quality—not automatic scope
expansion.

## Gated v3 direction — Symbiotic Shenzhen

The local direction branch extends, rather than replaces, v2. Its north star is
Reciprocal Agency Loop Rate (RALR), always paired with refusals, withdrawals,
coercion, unresolved age, basic-needs satisfaction, dependency and group
distributions. The complete scope and gates are in
[SYMBIOTIC_SHENZHEN_PLAN.md](SYMBIOTIC_SHENZHEN_PLAN.md).

- Phase 0: constitution, threat/data/ethics boundaries and direction anchors.
  The draft exists; recorded human constitutional approval remains pending.
- v3.0: frozen Shenzhen aggregate calibration plus deterministic daily Turn,
  resource, event and replay kernel. A first vertical slice is implemented.
- v3.1: complete 260-resident lifecycle and long-horizon need stability.
- v3.2: relationship, continuous consent, commitment, exit and repair.
- v3.3: independent Chat Completions cognitive provider, cost ledger and
  deterministic degradation.
- v3.4: private adult participant invitations, intent, withdrawal, export and
  unlinking.
- v3.5: bilingual accessible City Lens and daily/weekly/seasonal reports.
- v3.6: 365-Turn stress, operations shadow, 14-day pilot and private 90-day
  season.
- v4.0: 60+ participants, multiple seasons, second provider and preregistered
  constitutional comparisons.

v3 cannot replace `main`, activate real participants, or claim certification
until its applicable phase gates and the retained v1/v2 gates all pass.
