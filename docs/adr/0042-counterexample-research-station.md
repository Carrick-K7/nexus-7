# ADR 0042 — Counterexample-driven research station

Date: 2026-10-20. Status: implementation in progress; not a production authorization.

## Decision

Build a separate `research` bounded context. The existing city is one research subject, not an authority that can approve code, tools or releases. Preserve existing city data, source-bound replication and public compatibility. Do not wire the research worker to world advancement, deployment or shared operations.

The first executable researcher is bounded symbolic program synthesis, not a pretend live LLM. It discovers counterexamples through registered, bounded, pure/in-memory instruments; responds to evidence by requesting confirmation; synthesizes a compositional JSON-AST counterexample reducer; independently re-executes the frozen program on fresh input and a healthy control; tests the same artifact against another subject family. Primitive edits are generic, not named defect recipes. Generated modules export a data DSL, not arbitrary JavaScript with host access.

This is an initial scientific/engineering substrate, not proof of open-ended autonomous software development. A future model adapter must preserve the distinction between candidate generation and evaluation, provide explicit real-use/budget evidence and never receive production authority by configuring a key.

## Authority and persistence

Use the existing memory/PostgreSQL lifecycle repository. One bounded aggregate atomically holds the queue, active lease/fencing token, quota reservation, observations, episodes, tools and lessons. Every transition commits the record and audit event together. Existing lifecycle tables and checksum backup/restore already cover the data: no empty migration or second persistence implementation is justified.

Before an experiment, reserve its maximum call allowance through CAS. Every instrument invocation checks the current persisted lease/status before calling the registered implementation. Errors count as attempts. An abandoned reservation is conservatively charged, not reset after a crash. Completion checks the same fence and stores actual observations and consumption, never candidate-reported usage. There are no paid or live model calls in this mode.

Public APIs only project data; they do not start studies or fabricate populated results. A separate, explicitly enabled worker uses durable state. Memory mode is one-process reference only and cannot claim cross-process worker/API continuity. A user pause or stop cannot be circumvented by a stale worker.

## Frozen evaluation principles

- Ten rounds are an observation window, not a sequence of ten authored outcomes or a condition inside the planner.
- Preserve known audit seed, generated challenge and repository observation origins. All findings in the October 19 audit and subsequent architecture review are exposed knowledge, not blind discoveries.
- A false exploratory hypothesis is not automatically a software defect; a defect claim additionally needs an independently justified contract and valid input domain.
- A useful reducer must preserve a real counterexample, strictly lower independently computed complexity, and not claim reduction on a healthy input.
- Tool generation means a newly searched composition with recorded evidence, not a renamed prebuilt tool. Transfer keeps the exact AST digest across different target families.
- Independent evaluation means a trusted fixed module re-executes the artifact; the first version does **not** claim hostile-process isolation or independent third-party attestation.
- Search limits and fresh deterministic samples are explicit. Feedback-exposed validation inputs are not called secret/held-out. Failure, no gain and exhaustion remain visible.
- No test may require an undiscovered natural defect to appear by round ten. If it does not appear, natural novelty remains not demonstrated.

## Required acceptance before claiming a complete local slice

Unit/contract failures, CAS concurrency, pause during work, lease loss, crash accounting, explicit zero-call quota, unknown schemas, no network/model dispatch, real PostgreSQL reopening and backup restore, read-only API, populated worker/API/UI continuity, bilingual mobile/keyboard/axe browser checks, and independent blue-team review. Separately test evidence-driven agenda changes and cross-family reuse against controls. Preserve v1/v2/v4 regression.

## Addendum — bounded condition induction (2026-10-21)

The initial four protocol operations could generate useful follow-ups but not new propositions. Extend the data DSL with a conditional predicate (one or two comparisons over permitted numeric/array features). It is fitted to a complete single-instrument/version observation snapshot, never to a candidate-selected subset, identifiers, output facts or audit labels. Single-label and unsupported evidence abstain. The fixed learner was frozen before an independent controlled 68-case assessment; that is evidence of bounded inference, not natural defect novelty or general AI.

New stages are `induce`, `falsify` and one-shot `audit-hypothesis`. The candidate is stored before a kernel-owned sampling seed, protocol and bounded reservation are claimed. Actual private observations determine the receipt. F counterexamples can cause at most three new program revisions; an audit attempt burns the lineage's final-audit slot even on failure or loss. A budget-surviving condition remains unproven. The station can keep researching other questions rather than manufacturing a successful law.

The v1 sampler's input-prefix/minimum-distance bias missed counterexamples that already existed in its finite generic pool. Preserve that diagnostic; the revised v2 sampler stratifies generic operations/roots and alternates atom sides without consulting outcome labels. No budget or success threshold was relaxed. Historical protocols are not reinterpreted as current-version exact replay.

Issue induction opportunities from the complete post-episode kernel state, including private observations, before deciding the agenda is empty. Kernel-generated hypothesis lessons cannot acquire a candidate-supplied `confirmed` badge or universal-law caption. Canonical JSON normalization happens before the instrument sees input, not merely when PostgreSQL serializes it; otherwise JavaScript negative zero can invalidate memory/PG equivalence.

The baseline gate remains at least ten effective research operations. The discovery observation window is at most 24 scheduler steps with the same frozen station budget, plus a genuine data-derived proposal and a completed factual evaluation. It does not claim 24 independent experiments or require a favorable hypothesis outcome. A real refutation is a valid scientific result; retries and empty no-action induction do not pad progress.

## Deliberately not included in this decision

Production deployment, new host privileges, real model spending, shared backup remediation, arbitrary source execution, granting service accounts human approval, city season rotation, replacing the city constitution, or claiming foundation-model self-improvement. Those are distinct decisions with distinct evidence.
