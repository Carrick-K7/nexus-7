# ADR 0006: Controlled Self-iteration

- Status: Implemented
- Date: 2026-07-16
- Target release: v0.9.0

## Context

An EvolutionLog can describe changes after they happen, but it does not make
self-improvement safe. A system that jumps from an observation to source or
deployment mutation cannot prove that a candidate helped, cannot isolate
regressions, and cannot offer a reliable human promotion or rollback point.

## Decision

Self-iteration is a persisted workflow, not permission to edit the primary
system.

The workflow is:

```text
observation → improvement proposal → executable specification
→ isolated baseline/candidate forks → threshold evaluation
→ admin approval → canary fork → monitor → promote or rollback
```

Generated proposals currently use `changeScope=policy`. They produce a
structured, capability-valid command and an isolated policy branch identifier.
Baseline and candidate runs start from the same source tick and seed, advance
for the same horizon, and must satisfy:

- minimum target improvement;
- maximum protected-metric regression;
- deterministic replay for both runs;
- invariant and security guardrails.

Medium-risk promotion requires an admin decision. An approved candidate is not
applied to the source run; it enters a separate canary fork with a finite
observation window and rollback threshold. Every transition appends an
immutable actor/role decision record.

## Code and deployment boundary

The data model supports policy, code, and deployment scopes plus unit, build,
browser, security, and deployment evidence. NEXUS-7 does not execute arbitrary
source edits or deployments from the web process. Code/deployment proposals
must receive evidence from an isolated external worker/CI system and remain
human-gated.

## Consequences

- “Self-improvement” now means proposing and testing a falsifiable hypothesis.
- Failed or rejected candidates remain evidence instead of disappearing.
- Healthy canaries can be promoted; unsafe ones produce an explicit rollback
  record.
- EvolutionLog can show the live runtime workflow alongside release manifests.
