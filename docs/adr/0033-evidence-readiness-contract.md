# ADR-0033: Evidence readiness contract

**Status:** Accepted for v4.8.5 on 2026-08-01.

## Context

v4.8.4 added a dedicated external replication workflow and included it in the
application defaults. The checked `.env.example` still defined an explicit
`SYMBIOSIS_TRUSTED_SIGNER_WORKFLOWS` override that omitted that workflow and
the operations drill. Because a non-empty override replaces the defaults, an
operator following the template would reject legitimate evidence.

The off-host lane also started from the receipt result and then unconditionally
changed the lane to pending whenever the recovery evidence file was absent. A
supplied malformed receipt could therefore become less severe after another
artifact was removed. Human Observatory exposed the stable machine reason but
not a bilingual explanation or the exact deployed revision used for receipt
matching.

## Decision

1. Treat the explicit signer setting as a complete replacement allowlist and
   keep the checked template aligned with every accepted symbiosis evidence
   producer.
2. Test the template as part of the workflow contract so a later signer cannot
   be added only to application defaults.
3. Preserve failed or stale receipt status when companion recovery evidence is
   absent. Missing evidence remains pending only when no stronger supplied
   evidence state exists.
4. Display the full deployed release revision in Human Observatory.
5. Pair each trust reason with English and Chinese human text while retaining
   the stable machine code in the UI and unchanged API contract.

## Consequences

- Following `.env.example` no longer disables the independent replication
  receipt path.
- Removing a companion file cannot downgrade supplied bad evidence from failed
  to pending.
- Humans can connect a receipt mismatch to the running revision and understand
  the next missing proof without decoding internal identifiers.
- No external lane is claimed complete: keys, independent infrastructure,
  provider calls and elapsed time remain external facts.
