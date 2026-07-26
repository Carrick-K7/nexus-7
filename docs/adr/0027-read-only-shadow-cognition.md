# ADR-0027: Compare cognition through a read-only shadow path

## Context

A single Provider can create policy homogeneity, while silently changing the
active Provider would destroy within-run comparability and may alter residents'
relationships. A second external call can also fail or incur cost even if its
answer is never accepted. Provider diversity therefore needs evidence without
granting a second model authority over the world.

## Decision

1. The primary and shadow Providers implement
   `nexus.cognitive-provider.v1` and receive caller-stable request IDs.
2. Only the primary bounded disposition may be supplied to world settlement.
   Shadow output is persisted inside the decision envelope and has no engine
   input field or fallback role.
3. Shadow uses an independent monthly budget and records observed,
   provider-failed, budget-skipped or billed-invalid status.
4. Persist final bounded disposition, disagreement, primary-fallback flag,
   latency, Token/cost and pricing evidence; never persist prompt, response or
   reasoning.
5. Keep `nexus-deterministic-reference` as primary control and
   `nexus-diversity-reference` as a permanent zero-cost shadow control.
   DeepSeek may run as shadow before a separately governed promotion.
6. Accept Provider substitution only if resource, consent, continuity and harm
   invariants pass. A different world fingerprint is expected; hidden
   invariant failure is not.

## Consequences

- Human observers can see homogeneity, disagreement and fallback bias without
  turning model consensus into authority.
- Shadow outages or budget exhaustion do not degrade or pause the city.
- DeepSeek shadow usage contributes to the same actual Token/cost ledger.
- Request IDs provide repeatable caller evidence; they do not claim that a
  third-party API guarantees server-side deduplication.
