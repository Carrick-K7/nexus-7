# ADR-0025: Derive cognitive cost from persisted provider usage

## Context

Human observers could see a report-level cognition cost, but not the DeepSeek
tokens, price evidence, current-Turn usage or whether the value came from a
real external call. A zero-cost deterministic decision and an unobserved
provider expense were therefore too easy to confuse.

DeepSeek returns billable token usage rather than an invoice line. Input
cache-hit, input cache-miss and output tokens have different prices. A response
can consume tokens and then fail the bounded action schema, after which NEXUS-7
must fall back without losing the incurred expense.

## Decision

1. Persist an optional billing record inside each cognitive-decision envelope:
   provider, model, actual returned token counts, USD price version and
   calculated cost.
2. Mark the requested provider and whether an external call was attempted,
   independently from the provider that supplied the final bounded decision.
3. Preserve billing when a completed provider response fails validation and
   the deterministic provider supplies the final action.
4. Aggregate only exact `deepseek-chat-completions` records for the active
   season into the Human Observatory v2 additive contract.
5. Show zero when no DeepSeek call exists. Never infer usage from resident
   count, Turn count or the human owner's other account activity.
6. Prefer `DEEPSEEK_API_KEY_FILE`; never expose credentials or reasoning in
   decisions, APIs, exports or UI.

## Consequences

- Memory and PostgreSQL retain identical billing semantics without a new table
  because both already persist the versioned decision JSON atomically.
- Monthly budget enforcement includes billed schema-failure attempts.
- The displayed expense is reproducible from call-time usage and pinned
  official pricing, but is scoped to NEXUS-7 and is not an account invoice.
- Historical decisions without a billing extension remain readable; an old
  successful DeepSeek decision uses its recorded top-level token/cost fields.
