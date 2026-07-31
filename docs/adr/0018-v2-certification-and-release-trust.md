# ADR 0018: v2 Certification and Release Trust

- Status: Accepted
- Date: 2026-07-18
- Target release: v2.0.0

## Context

A completion claim based only on one happy-path demo would reward hidden
exclusions, fixed-output fixtures, and local mocks. v2 needs a stable
denominator, adversarial failure paths, extension compatibility, exact
artifact binding, and an honest distinction between implemented locally and
verified in an external production-like environment.

## Decision

1. Introduce `nexus.closed-loop-certification.v2` without changing the v1
   readiness endpoint or report.
2. Freeze a fingerprinted 25-case corpus across five incident families and
   five modes. Twenty cases are eligible; sixteen beneficial closures set an
   explicit 80% VBCR rather than an all-green fiction.
3. Gate VBCR together with detection, replay, causal completeness, injected
   rollback, outcome disposition, severe escapes, evidence integrity, expiry,
   corpus coverage, unresolved age, veto, rollback, and group impacts.
4. Run a real durable reference flow twice and a real injected deployment
   rollback through outcome and lesson closure. Fixed corpus records supplement
   these flows; they do not replace them.
5. Sabotage stage order, evidence digest, artifact binding, and evidence
   freshness. Any accepted sabotage fails the release.
6. Publish one conformance report for agent, model provider, scenario,
   repository, notification, deployment controller, and outcome evaluator.
   Uncertified extensions are sandbox-only.
7. Bind reports to package, lockfile, v2 manifest, corpus, repository, commit,
   dirty state, and CI-evidence fingerprint.
8. Reserve `productionVerified=true` for a clean exact commit with a fresh
   verified external receipt. Otherwise a passing build reports
   `implementation-complete-external-evidence-pending`.

## Consequences

- A dirty working tree can prove local implementation but cannot claim
  production provenance.
- The corpus denominator and anti-Goodhart fields make difficult and denied
  cases visible.
- External CI, live model, deployment, recovery, and attestation remain
  operational release responsibilities rather than mockable unit assertions.
- Adding or removing a v2 corpus case changes its fingerprint and therefore the
  bound release artifact.
