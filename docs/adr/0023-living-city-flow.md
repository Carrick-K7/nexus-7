# ADR-0023: Make the city flow, not merely score

## Context

The v4.2 Observatory was backed by durable Turn state, but its primary
presentation emphasized derived percentages, projected institutions and eight
conceptual production stages. It hid the persisted production, consumption,
transfer and inventory fields. A human observer could reasonably conclude
that the dashboard was mock data.

The public resident taxonomy also exposed implementation labels that made
humans appear to be a fourth species.

## Decision

1. The domain and PostgreSQL resident kinds are exactly `human`, `ai` and
   `robot`. Migration 0011 rewrites legacy columns and resident JSON
   atomically. Observatory v1 maps back only for read compatibility.
2. Every Turn settles local production and consumption, then deterministically
   balances reserve pressure between communities.
3. Transfer lanes are recorded in both conserved resource ledgers and
   `shared.resource-transfer` events.
4. Observatory v2 exposes eight aggregated resource flows and every transfer
   lane directly from the committed Turn.
5. The default page adds a city information layer inspired by city simulators:
   persistent HUD facts, community topology, selectable resource layers,
   exact flow rows and resident drill-down. It remains read-only.

## Consequences

- A displayed resource number has a ledger equation and evidence reference.
- The map is a topology view of the modeled communities, not geographic proof
  or a Shenzhen digital twin.
- Human mood is a simulated human state; AI engagement and robot readiness do
  not imply consciousness.
- Replay fingerprints change under the new engine, so v4.3 requires a fresh
  exact-replay gate and upgrade backup.
- Old checksum-valid backups remain restorable because restore normalization
  migrates legacy resident labels after verifying the original checksum.
