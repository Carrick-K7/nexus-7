# v4 Autonomous Evidence Matrix

> Updated 2026-08-01 · v4.9.0 · external-attestation requirement removed

## Definition

The evidence matrix is a projection of the two gates the laboratory can
verify by itself:

1. **Local replication** — the committed v4.7 replication bundle verifies
   byte-exactly at read time: 7/7 hypotheses, 12/12 held-out runs, exact
   double replay, matching bundle and results SHA-256.
2. **Elapsed production** — the persisted wall-clock runtime envelope shows
   90 elapsed production days with on-time settlement, exact revision
   coverage, and zero missing, duplicate or predecessor-mismatched Turns.

The two lanes are independent: a passing bundle can never satisfy the
elapsed-time lane, and simulated Turns can never count as production days.
Missing evidence stays visible with stable machine reason codes; it does not
stop the synthetic city.

## Contract

`GET /api/observatory/v2/trust` returns
`nexus.symbiosis-trust-matrix.v2` with policy
`nexus-v4.9-autonomous-trust-policy-1.0.0`:

```json
{
  "schemaVersion": "nexus.symbiosis-trust-matrix.v2",
  "policyVersion": "nexus-v4.9-autonomous-trust-policy-1.0.0",
  "summary": { "required": 2 },
  "lanes": { "localReplication": {}, "elapsedProduction": {} },
  "boundary": {
    "lanesAreIndependent": true,
    "simulatedTurnsCannotSatisfyElapsedTimeLane": true,
    "externalAttestationNotRequired": true
  }
}
```

Lane statuses are `verified | pending | failed | stale`. The matrix is
`verified` only when both lanes are; any failed or stale lane fails the whole
matrix. Reason codes are stable machine identifiers; the Human Observatory
pairs them with bilingual explanations.

## Reading the matrix

- `localReplication.status = verified` requires the committed bundle to pass
  `verifySymbiosisReplicationBundle` (structural checks, integrity hashes,
  exact replay counts, hypothesis counts). A missing or corrupted bundle is
  `failed`, never hidden.
- `elapsedProduction` requires a fresh reliability report with no missing,
  duplicate or predecessor-mismatched Turns, 100% revision coverage of the
  observed runtime, on-time rate ≥ 0.99, and
  `observationWindowDays ≥ requiredObservationDays (90)`. Until 90 real days
  elapse it is honestly `pending` with
  `ninety-days-not-yet-observed`.

## v4.9.0 constitution decision: external attestation removed

The human governor decided the laboratory does not require independent
external attestation to be considered complete. Consequences:

- signed receipt ingestion (governed Ed25519 key + OIDC governance route),
  distinct-host recovery proof and a live DeepSeek shadow are **no longer
  requirements** and no longer appear as matrix lanes;
- the receipt issuance and ingestion machinery remains in the repository,
  dormant and tested (`npm run ops:receipt-drill`, the governance evidence
  registry and its reference-fake contract suite) so it can be re-enabled
  later without archaeology;
- the DeepSeek shadow observation remains in the cognitive-diversity panel:
  any future provider usage still records attempts, Tokens, models, pricing
  versions and USD cost without ever settling the world;
- backup/restore and recovery drills remain operational controls: they keep
  proving that the production PostgreSQL volume can be backed up, encrypted,
  restored and replayed, but they are not gates on the evidence matrix.

Nothing in this decision weakens the scientific boundary: results remain
synthetic, RALR still shows its denominator, refusals, withdrawals, coercion
and long-pending episodes, and no real person or private input participates.

## Boundaries

- The matrix is evidence about this software experiment.
- Synthetic results cannot establish real human behavior, policy effects, AI
  consciousness or legal personhood.
- Archived receipt code is not a live attestation; re-enabling it requires a
  fresh constitutional decision and operator configuration.
