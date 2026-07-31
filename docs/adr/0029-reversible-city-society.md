# ADR 0029: Reversible city society

- Status: Accepted
- Date: 2026-07-29
- Scope: v4.6 synthetic social institutions

## Context

Resources, needs and reciprocal relationships made the city run, but residents
did not yet form durable care units, maintain owned infrastructure, exchange
value, bargain over scarcity or propose reversible operating rules. Adding
those concepts only as dashboard labels would create narrative mock data.
Allowing a model to invent institutions or executable rules would break exact
replay and project governance.

## Decision

Add a deterministic society state to each fingerprinted Turn:

- voluntary care households;
- reversible work agreements;
- fictional community energy, compute and repair assets;
- conserved double-entry civic-credit exchanges;
- resource bargains with refusal, counteroffer, mediation and withdrawal;
- AI-resident city-rule proposals over three bounded parameters.

Every object has an explicit state machine, revision and Turn coordinate.
Memory and PostgreSQL implement the same repository contract. PostgreSQL
normalizes current records in the same expected-head transaction as the
snapshot, events and ledgers. Backup/restore includes the additive table.

AI proposals cannot execute code or alter software/project governance. They
require recorded cross-type quorum in the reciprocal regime, expire after 20
Turns and automatically restore the prior value. Hierarchy and segregation
remain isolated counterfactual regimes.

Safe Social Closure Rate is a supporting metric with a visible denominator.
It does not replace RALR, VBCR, replay, conservation or harm gates.

## Consequences

- social outcomes become replayable data rather than prose;
- maintenance condition has a bounded effect on production;
- refusal, exit, mediation, accounting failure and rule reversion are
  observable;
- existing seasons hydrate a deterministic baseline without rewriting
  historical fingerprints;
- society snapshots are larger and long-horizon verification is slower;
- no result can be interpreted as evidence about real families, work,
  economics, governance or AI consciousness.
