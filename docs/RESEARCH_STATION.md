# Research Station / 反例驱动研究站

> Development slice, 2026-10-20. Not deployed. Production authority and paid model calls remain disabled.

## Purpose

The city is a research subject, not the project's immutable identity. The research station asks whether claims survive controlled counterexamples, creates bounded executable tools when useful, and changes its agenda in response to evidence.

The current researcher is **bounded symbolic program synthesis and conditional induction**. It is not a live LLM, a general source-code author, or evidence of consciousness. Its finite instrument catalog and finite grammars are public. It can now derive a new conditional prediction from recorded input/outcome contrasts, freeze it, try to refute it, and revise it in response to actual counterexamples. A ten-episode run is an observation window, not ten scripted outcomes or an internal stop condition.

中文：研究站独立于城市运行。它可以否证假设、综合有界反例缩减程序并检验跨题复用；不能改城市、生产、权限、数据库配置或主分支。已知审计问题、受控挑战和自然新发现分开统计；本切片不声称已经发现未知的真实项目缺陷。

## What actually executes

1. A human-authorized policy fixes the instrument catalog, seed and finite budget.
2. A persistent agenda chooses a pending question by evidence-derived priority, age and semantic target. Arbitrary question hashes/display titles are not tie-breaking intelligence.
3. Registered instruments execute original pure/in-memory NEXUS functions or explicitly labeled generated controls. They never construct a production server, call a real provider, or advance the active city.
4. A counterexample produces a confirmation question. Confirmation uses the original witness and a newly generated input. Failure to confirm records refutation rather than promotion.
5. Program synthesis searches a uniform grammar of 85 one-to-three-operator compositions. Operators edit JSON trees: remove entries/chunks, halve/decrement numbers and shorten strings. No defect name or target-specific patch appears in the grammar.
6. A trusted evaluator executes the frozen AST on a fresh input, checks strict independently measured reduction, rechecks that the counterexample survives, and rejects a healthy control. A candidate's self-reported `passed` is not an instrument.
7. The same program digest is tried on other subject families. A bounded, zero-oracle domain compatibility search guides priority but does not remove incompatible-looking questions or guarantee successful transfer.
8. Failures, no gain, confirmation, rejected tools and reuse become persistent lessons and new questions. Empty frontier or budget exhaustion is a valid stopping outcome.

Generated reducer source is a portable ESM **data module** exporting the closed AST. It requires the validating interpreter. It is not arbitrary JavaScript evaluated with host permissions. The interpreter supports up to five operators, while the current synthesizer searches compositions only up to three; these limits are not hidden.

## Data-derived conditions, feedback and one-shot audit

The second grammar expresses `P(input) => measurement.holds === expected`, using at most two numeric/array-feature comparisons. Its learner uses the complete eligible history for one exact instrument version; output facts, identity strings, seeds and hashes are not predictive features. Exact input/label duplicates are collapsed without discarding conflicting labels. Single-label data, insufficient unique-vector support, unsupported grammar or capacity overflow cause explicit abstention, not invented findings. Thresholds come from observed numeric cuts; information gain/MDL ranks candidates but is not proof.

A kernel post-episode planner sees **all actual observations**, including private tool evaluations, before deciding the frontier is empty. A newly sufficient dataset can therefore create an induction question even when the last ordinary question has just completed. A candidate cannot hide an inconvenient observation by omitting it from its result.

A proposal is persisted before evaluation. The kernel then claims and persists its phase, random sampling seed, protocol/evaluator versions and allowance before any call. Feedback F is limited to 24 calls; final audit T to 32, both still constrained by the station's existing reservation and 800-call default total. Only the matching private F/T evaluator can sample in these phases. Every input is valid, new relative to the same instrument's recorded history, and metered. At least half the sampling is input exploration; boundary targeting is explicit and does not establish unbiased population coverage.

A true in-scope contradiction refutes the condition immediately. Otherwise at least eight fresh measurements, four in-scope and four out-of-scope, are needed even to say **survived-budget**, never proved. A feedback counterexample can generate a child proposal using the enlarged history; the old program and refutation remain immutable. There is at most one root lineage per instrument version, three revisions, and sixteen total hypotheses per station. An audit attempt consumes its slot even if it crashes or is abandoned. Audit data do not enter training, and an audit attempted anywhere in the lineage prevents further revisions of that lineage. No redraw-until-green path is authorized.

Sampling v2 uses seed-driven strata across generic perturbations and generated roots, plus separate atom/side boundary queues. It replaces an empirically identified v1 blind spot; v1's diagnostic survival record remains retained and cannot be reinterpreted as a v2 exact replay. New attempts bind their exact protocol. Known historical versions can be read semantically, but unsupported historical sampling is not re-executed with a newer sampler and called identical.

Hypothesis lessons are kernel-rendered from the actual proposal/receipt. They are never `confirmed`: new and sample-surviving conditions remain provisional, and a real counterexample is refuted. Candidate-authored universal-law text or relabeling the lesson kind cannot bypass this boundary. Historical refutation takes precedence in the UI even if a later finite sample has no contradiction.

Inputs and measured facts use canonical JSON values before execution and persistence. In particular, JavaScript negative zero is normalized to JSON zero **before** the instrument sees it; memory results must match the PostgreSQL wire representation, not merely have equal hashes.

## State and authority

The state machine, quota reservation, active fenced lease, queue, observations, tools and lessons live in one bounded `research-station` lifecycle aggregate. Existing memory and PostgreSQL repositories provide atomic record+event CAS. The existing lifecycle tables and checksum backup/restore cover these records; there is no new physical table or empty migration.

- Public control starting/pausing/resuming requires an explicit authenticated human with `runs:write`. A separate, local root-only operator CLI can consume one real human-delegated deployment permit for **start only**; it does not forge a human/OIDC actor, grant worker control, resume or refill quota.
- Workers use system/operator identity and can only step an already-authorized station. They cannot impersonate a human or increase budgets.
- Workspace scope applies even to system principals.
- Calls are reserved before dispatch; each invocation rechecks persisted authorization, fencing and cancellation. Errors count. Expired/crashed reservations are conservatively charged in full.
- Failed, interrupted and superseded attempts remain in the ledger. Retry limits, episode limits and pending questions are visible.
- Pause prevents the next instrument call and stale result commit. Already-dispatched JavaScript cannot be forcibly killed by a Promise; this is not hostile-process isolation.
- There is no deployment controller, shell, SQL input, filesystem path or external-provider capability in the data DSL.

The public projection hides no failed experiment and does not create a study as a side effect of GET. It is not a complete security audit of every legacy module.

## Interfaces

```text
GET  /api/research/v1/overview
GET  /api/research/v1/human       concise facts for the human-facing page; never starts work
GET  /api/research/v1/health      service/PG/exact-release readiness, not worker heartbeat
POST /api/research/v1/control     authenticated operator plane only
```

Overview writes return 405. Public-observer control writes return 405 independently of the public proxy. Control accepts only `start`, `pause`, `resume`; there is no public or arbitrary execute command. Start is idempotent for the same frozen configuration and conflicts with a different one. No user message, resident identity, private diary or model reasoning enters the city.

The default `/` and shareable `/human` page are a separate, Chinese-first plain-language reading path. They explain what the programme is and is not, whether work has stopped, one evidence-bound attempt/counterexample/revision story, practical limits and the difference between local tests and paid model calls. The concise human API is a pure projection: it reuses actual records and validates their bindings, but never calls an instrument or runs new research. Unknown sources, missing references and malformed data do not become a fabricated story. See [the human reading contract](<HUMAN_READING.md>).

The detailed **Research Station / 研究站** remains at `/research`. It is anonymous/read-only in public-observer mode. Ordinary-language briefing connects current questions, why they were queued, actual outcomes, budgets and remaining uncertainty to the underlying records. Visible pages refresh with non-overlapping GET every 30 seconds; failures retain the last real snapshot. Reading time, server projection time and last experiment time are distinct; `running` is a ledger state, never a proved daemon heartbeat. The page displays actual persisted data and an honest unauthorized/empty state, not a fixture. It does not reuse Evolution Log commits as research evidence.

`/archive/city` reads only a static retirement manifest and raw public snapshots. The old city is not the default product, but its exact source and records remain research specimens. Missing/incomplete archive data never becomes a fabricated successful retirement. Legacy query-selected views remain available explicitly; research/archive observation does not advance the client-side legacy simulation.

## Local reference study

Requirements: the existing project toolchain. If the shell defaults to omitting dev dependencies, explicitly include them:

```sh
npm ci --include=dev
npm run research:study
npm run research:discover
```

The baseline creates a new in-memory reference fixture and observes up to ten scheduler steps. Discovery observes up to 24 scheduler steps with the same station budget, not 24 statistically independent experiments. Both pre-register a minimum of ten actual research operations; discovery additionally requires a real data-bound proposal and a completed factual F/T evaluation (a genuine refutation is a valid scientific result). Empty steps, retries and empty no-action induction cannot inflate the completed-operation count. The verifier independently re-executes recorded measurements, frozen tool programs and current-version hypothesis receipts with their original allowance. The actor is explicitly a development fixture, never a production approval. A controlled fixture clock is labeled as such; execution wall time is separate metadata and is not a 90-day claim.

Outputs: a latest local study plus immutable per-execution reports under `.artifacts`. Failed studies are retained as well. Source revision, uncommitted status, selected source hashes and trace hashes are recorded. Source files are checked for changes during execution; an unstable source invalidates the verification. These are local evidence, not deployment/remote attestation.

```sh
npm run verify:research
npm run test:run -- src/research src/workers/research.test.ts src/test/ResearchStation.test.tsx
```

The study has separate Boolean gates: actual episode window, target diversity, causal/hash integrity, reexecuted observations, quota conservation, retained negative outcomes, evidence-linked new questions, genuine tool artifacts and cross-family reuse. A failed gate must not be changed simply to make the study green. Natural novelty remains a separate not-demonstrated dimension; known seeds and injected/generated challenges cannot fill it.

Identical versioned pure inputs may share one independent replay during report verification; every receipt is still compared. Tool evaluation physically re-executes the interpreter. Verification has a separate explicit oracle-call budget, not unrecorded research spending.

## Durable worker

A separately authenticated operator authorizes a station once. Then:

```sh
NEXUS_RESEARCH_ENABLED=true npm run worker:research
NEXUS_RESEARCH_ENABLED=true npm run worker:research -- --once
```

The worker requires PostgreSQL and explicit enablement. It does not auto-create human approval, connect to a different database as fallback, or reset a quota. A standalone memory worker cannot share state with Next.js and is rejected. Optional worker settings select the scoped workspace, worker identity and a validated interval. SIGINT/SIGTERM request cooperative stop; the next oracle dispatch and old completion are fenced.

Installing application code alone never authorizes a study. The owner-authorized v5 cutover is governed by [ADR 0043](<adr/0043-research-station-production-cutover.md>): a separate restricted systemd identity receives only a private database credential, with no Docker/sudo/model/publisher credentials and bounded CPU/memory. The app-specific native installer and publisher are owned by Ops; shared backup remediation stays paused. The worker waits until a legitimate station exists and never consumes the operator permit at startup.

The local root operator helper validates a closed, owner-only permit bound to the human request digest, separate approver/executor, exact release, workspace/organization, complete policy, source versions, nonce and expiry. A non-JSON-forgeable verified capability reaches the service's private creation path. Station creation and globally unique nonce audit event are atomic; identical retries cannot reset spent quota or resume a paused study. The public ledger includes only minimal provenance, not the original permit. This is explicitly local-root/operator-delegated authority, not OIDC or third-party-signature evidence. It assumes the host operator and application modules are trusted; it does not claim to resist arbitrary malicious JS or a raw SQL holder of the application database credentials.

## Browser and PostgreSQL verification

Real PG tests use only `TEST_DATABASE_URL` and `TEST_RESTORE_DATABASE_URL`, never production fallbacks. They cover fresh-process reopening, competing connections, transactional rollback, abandoned reservations and checksum restore with resumed writes/cursors.

Browser tests start a dedicated loopback server. Playwright merges its parent environment by default, so a dedicated launcher passes a small explicit environment to Next.js and omits production secrets and provider configuration. Optional populated browser testing requires the explicitly named isolated loopback database `nexus_research_e2e`; the known production PG port is refused. No default production database is inherited.

Successful browser projections use actual API responses. Only labeled failure/transport tests intercept responses. Unit component fixtures are reference fakes, not live worker evidence. A populated cross-process worker→API→UI test requires the isolated PG backend.

## Blue-team criteria and limitations

- Matching evidence forks must produce different useful follow-ups when the evidence differs, not when only names/IDs change.
- A tool that cannot structurally act on a target is a low-value candidate, not a reason to hide that target or call it solved.
- Exact AST/digest identity is retained across transfer. Same function with a new seed is not a new family.
- Hash validity is not truth: original measurements and tool behavior must be reexecuted.
- A false exploratory relation is a hypothesis refutation, not automatically a bug.
- Trusted-module evaluation is not an independent hosting/security boundary. Candidate DSL has no arbitrary code access; future source engineering needs a stronger sandbox.
- Fresh deterministic samples are not secret/author-blind inputs. This work does not claim third-party certification.
- The original NEXUS audit defects remain research subjects; this slice has not silently repaired them, rewritten old results or deployed new city rules.

The broader objective—self-directed open-ended engineering and naturally novel findings—remains separate from validating this bounded kernel. Never describe the latter as completing the former.
