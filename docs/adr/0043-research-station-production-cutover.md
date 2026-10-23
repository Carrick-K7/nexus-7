# ADR 0043 — Owner-authorized research-station cutover

Date: 2026-10-23. Status: authorized preparation; production completion requires measured postchecks.

## Authority and decision

The human project owner explicitly requested deployment of the new station, evaluation of the old city, and archival/retirement where continued operation is unnecessary. The owner then clarified that this is the OrangeVPS host and directed continuation using the local operating context. This is an interactive, project-specific authorization, not permission to alter unrelated services, remove databases/volumes, enable paid models or resume the paused shared backup-repair programme.

Retire the **continuous hourly city writer**, not its history or its scientific implementation. The old simulator remains a reproducible specimen: four research instruments use its code, and its frozen v4.7 reference must continue to reproduce. The v2 storage/governance kernel remains in use. The new default human entry is the research station; the old city's permanent entry is a clearly dated, read-only archive.

This owner decision ends the old continuous research programme. It is not a fabricated vote or consent by simulated residents, nor a declaration of an emergency. The old constitution and its continuity constraints remain archived unchanged; this new project-level exit decision explicitly supersedes the previous intention to run that programme indefinitely. State and identities are retained, not silently reset or erased. Any future resumption is a separate recorded operator decision, not an automatic consequence of rollback.

## Evidence and constraints

At the 2026-10-23 12:40 UTC read-only observation, the old public programme reported release `afed7d82c5a7b738b3cc780c9f8aa3b9e36f16da`, latest Turn 2316, 89.308/90 elapsed days, and an incomplete two-lane trust result. The exact retirement snapshot may be later and will be separately recorded. Reaching a shutdown decision does not turn a pending 90-day result into a pass; original status and subsequent retirement remain separate facts.

The continuous city currently supplies little new controlled causal evidence: it advances the same fixed mechanisms, while prior multi-year/multi-season experiments and known audit limitations already exist. Its retained value is historical/replay and operational evidence. A running process is not required for those uses.

A dedicated private pre-cutover logical backup is restored into a no-network disposable PostgreSQL instance before reliance. This is a scoped recovery check, not full-host/offsite recoverability and not a modification of the paused shared backup programme. A fresh final snapshot is taken after the writer stops. Private dumps and runtime credentials never enter the repository or public archive.

## Running model and authorization

The release manifest explicitly selects the research worker. The publisher stops both possible writers before migration/pointer change, starts only the selected worker, validates exact revision/PostgreSQL readiness and actual service activity, and must not restart a retired city writer during a later deployment or rollback. A root-owned retirement record plus a systemd condition preserves this intent across boot.

The research worker runs as a dedicated non-root OS identity with no Docker/sudo, no deployment/model credentials, read-only release access, one-core CPU and bounded memory. Only its database credential is delivered through systemd's private credential mechanism. It cannot consume operator permits or create human approvals.

Initial research starts once through a separate local root operator helper. Its closed permit binds the real human request's digest, the named approver and separate system executor, exact release SHA, existing workspace/organization, seed, instrument versions, complete bounded policy, nonce and expiry. It is explicitly operator-delegated—not OIDC, synthetic-human or third-party-signature evidence. Consumption and initial state/audit event are atomic; retries cannot reset budget or change scope. No public endpoint accepts this permit and worker startup never runs the authorizer.

The first production study retains the default 800 oracle-call / 40-operation ceiling, 96 calls per episode and two-attempt bound. It remains symbolic, without paid model dispatch, arbitrary source execution, city mutations or deployment control. Paused, idle and budget-exhausted are legitimate outcomes, not a reason to silently reset a study.

## Human entry and rollback

The new home explains current work, recorded evidence, changes of view, budget and unfinished boundaries in ordinary language. Reading time is distinct from the last experiment time; an eligible queue is not a proved OS worker heartbeat. Archived city data carry capture/stop time, final head/revision and original report hashes, not a fresh live timestamp.

Preserve the old exact source archive/tag and private recovery point. Application rollback does not restore or overwrite the database and does not erase newly spent research budget. A failed cutover first stops writers; if that cannot be proved, pointer rollback is refused. Restoring an older web release must not implicitly restart the retired city. Known host-wide trust and backup limitations remain explicit.

## Completion evidence

Before claiming production completion: full local/CI gates, root operator authorization/negative tests, actual PostgreSQL and recovery checks, real worker→API→browser/keyboard/axe, exact public revision, zero paid-model attempts, bounded quota, OS resource/access checks, a frozen old city head across observation, and scoped operational inventory/rollback evidence. Source preparation and fixture green are not live deployment evidence.
