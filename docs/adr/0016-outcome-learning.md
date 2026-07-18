# ADR 0016: Independent Outcome Learning

- Status: Accepted
- Date: 2026-07-18
- Target release: v1.8.0

## Context

v1.7 could select and stage a bounded intervention using controlled
experiments, but staging was still the end of the product story. A proposing
Agent could not be trusted to grade its own action, a short-term gain could not
stand in for delayed benefit, and a successful-looking run could not safely
become reusable policy without invalidation, context checks, and the existing
release chain.

## Decision

1. A deterministic evaluator identified separately from every proposing Agent
   evaluates short, medium, and long windows.
2. Every window compares the observed candidate with the frozen no-action
   counterfactual, historical source value, and same-seed seasonal value. It
   records prediction error, group effects, guardrails, and repeated replay
   fingerprints.
3. Outcomes use the explicit verdict vocabulary `beneficial`, `harmful`,
   `neutral`, and `inconclusive`. Pre-existing baseline violations are not
   attributed to an intervention.
4. Late evidence creates a new outcome revision. It can invalidate prior
   lessons and playbooks and reopen a resolved city incident; it never mutates
   historical evidence in place.
5. Success, failure, rollback, and inconclusive lessons are all retained.
   Positive retrieval requires a currently validated success lesson.
6. Playbook applicability is a fresh gate evaluation over context, drift,
   diagnostic trust, capabilities, budget, experiment evidence, and human
   approval. It is not stored authorization.
7. Learned changes are declarative requests for policy, prompt, scenario, or
   test scope and must enter the existing controlled-iteration release chain.
   They cannot execute or approve themselves.
8. Outcomes, lessons, playbooks, and proposals use the shared lifecycle
   memory/PostgreSQL contract with workspace isolation and append-only events.

## Consequences

- A staged action is no longer synonymous with a successful action.
- Delayed harm and disputed attribution remain visible and reversible.
- The registry can honestly retain failure and uncertainty without turning
  either into a recommendation.
- Deterministic synthetic evaluation supports reproducibility but is not
  evidence of real-world policy benefit.
- v1.9 may challenge outcomes and lessons through appeals, but cross-domain
  correction must invoke these services under their own permissions and
  invariants rather than editing records directly.
