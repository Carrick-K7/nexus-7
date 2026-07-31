# ADR 0013: Falsifiable Causal Diagnosis

- Status: Accepted
- Date: 2026-07-18
- Target release: v1.6.0

## Context

v1.5 made city state and synthetic incident truth coherent, but a detected
symptom still led directly toward action. The system had no durable
alternatives, counterevidence, frozen-snapshot falsification, calibrated
confidence, or explicit mechanism for refusing automation when diagnostic
trust degraded.

## Decision

1. A diagnosis is a versioned lifecycle aggregate linked to one city incident,
   scenario truth ID, frozen city snapshot, policy version, trust assessment,
   correlation ID, and causation ID.
2. Evidence is classified as fact, inference, prediction, or human judgment.
   The classes remain distinct in storage and UI; an inference or judgment
   cannot be presented as a measured fact.
3. ATLAS, ECONOMICA, CIVITAS, and SPECTRE submit independently. ARIA records
   disagreements and ranks structured hypotheses but preserves every source
   submission.
4. Every diagnosis retains at least one alternative hypothesis, explicit
   counterevidence, a falsification test, and a statement of what new evidence
   would change the conclusion. Rejected candidates remain visible.
5. Candidate removal runs against the exact frozen source snapshot. The result
   records symptom resolution, effect size, a labelled deterministic
   sensitivity interval, side effects, and two matching fingerprints.
6. Hidden scenario truth is used only by the synthetic calibration and release
   verifier. It is not copied into diagnostic evidence.
7. Calibration is reported by Agent and incident family. Distribution,
   policy-effect, and model-output drift can place diagnosis in active,
   read-only, or deterministic-fallback mode.
8. Confidence below 0.65, failed falsification, or non-active trust makes a
   diagnosis ineligible for automatic experimentation.
9. The Causal Explorer exposes structured records at observer and audit
   densities. It explicitly does not display or claim to reconstruct hidden
   model chain-of-thought.

## Consequences

- A plausible narrative is insufficient: a diagnosis must be falsifiable,
  replayable, provenance-preserving, and uncertainty-aware.
- Multiple assessments of the same incident can coexist when trust or
  confidence context changes; repeated requests in the same context remain
  idempotent.
- Human judgment is append-only evidence and does not silently rewrite measured
  confidence.
- The reference corpus achieves 100% Top-3 root-cause retrieval, but that is
  synthetic implementation evidence, not proof of real-world diagnostic
  validity.
- v1.7 planning must consume only an eligible diagnosis and re-check the
  current trust state rather than trusting a stale UI label.
