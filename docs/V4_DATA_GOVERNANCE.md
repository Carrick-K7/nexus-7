# v4 AI-Only Data Governance

## Allowed inputs

The world accepts only:

- frozen public aggregate calibration with source, period, checksum and
  uncertainty;
- repository-owned synthetic distributions and seeds;
- deterministic engine state;
- schema-bounded model responses derived solely from synthetic context.

Live public endpoints are never read during a Turn. Precise addresses, real
residents, real institutions, personal identifiers, diaries, messages,
participant avatars and human intent submissions are prohibited.

## Data planes

There is one city data plane: the pseudonymous synthetic research projection.
It contains no identity linkage and has no resident-specific authentication.
The public observer receives the same synthetic projection through a
read-only HTTPS surface.

Operational identity records used by the v2 release-governance kernel are a
separate bounded context. They authorize deployments and emergency actions;
they cannot become city residents or world inputs.

The Human Observatory reads production, consumption, transfer, inventory and
pressure directly from stored Turn ledgers. It derives human mood, AI
engagement/integrity, robot readiness, institution flow and production
continuity only from stored needs and those ledgers. These formula-versioned
proxies contain no free-form inference and must not be described as proof of
consciousness, employment or a real institution.

The cognition cost ledger is another derived projection. It aggregates only
persisted provider response metadata for the current synthetic season:
requested provider, final provider, model, prompt/cache/completion token counts,
pricing version and calculated USD cost. It never stores prompts, responses,
reasoning or provider credentials. The total is a NEXUS-7 estimate from the
provider-returned usage and pinned public prices; it is not the owner's account
balance, invoice, credit or top-up history.

Shadow evidence is limited to provider/model, caller-stable request ID, final
bounded disposition, primary disagreement, status, latency, token counts and
cost. It contains no prompt, raw response or reasoning. Shadow output is
observational metadata and is prohibited from becoming a world input.

The v4.7 replication bundle contains frozen synthetic seed names, bounded
scenario parameters, aggregate outcomes, world/result hashes, source/input
hashes and proof status. It excludes raw prompts, reasoning, credentials,
database contents and resident-level Turn traces. The bundle is publicly
downloadable because every input is repository-owned or frozen aggregate
calibration and every run is synthetic. `externalCiVerified=false` and a null
Sigstore receipt are meaningful evidence states and must not be hidden.

The v4.8 trust matrix adds only artifact SHA-256 values, release revisions,
workflow/run identifiers, signed receipt timestamps, aggregate provider usage,
runtime SLOs and pseudonymous SHA-256 host fingerprints. Host fingerprints are
derived from stable non-secret infrastructure identities and must not contain
hostnames, network addresses, credentials or resident data. Recovery and
receipt files remain mode 0600 even though the public projection exposes only
their bounded verification result.

Society records are synthetic structured state. Household membership contains
only pseudonymous resident IDs; work records contain bounded role, workload
and civic-credit reward; exchanges contain balanced debit/credit account IDs;
assets use fictional community owners; bargains contain allowed resource
codes; city-rule proposals contain bounded parameters and aggregate synthetic
votes. They contain no address, employer, salary, legal ownership, free-form
message, real vote or model reasoning.

The civic-credit supply is a conserved simulation ledger, not money,
compensation or a financial account. A care household is a voluntary
resource-sharing mechanism, not evidence of kinship, marriage or cohabitation.
City-rule proposals cannot alter repository code, release policy, the project
constitution or real infrastructure.

## External models

An external provider may receive only a compact structured candidate composed
of synthetic resident IDs, synthetic need/resource context and allowed action
codes. The provider:

- cannot receive real identity or free-form private text;
- cannot call tools or directly mutate the world;
- must return final JSON matching the action schema;
- has its reasoning ignored and never persisted;
- is bounded by timeout, token and monthly cost limits.

A completed provider response can be billable even when its final JSON fails
validation and the city uses the deterministic fallback. Therefore billing
metadata survives that fallback and is included in both budget enforcement and
the Human Observatory. Requests that time out before a usable provider response
record no guessed usage or cost.

Primary and shadow providers have independent monthly budgets. The same
synthetic candidate uses a stable versioned request identifier on repeated
adapter calls; this is audit evidence and does not imply that a third-party
provider promises server-side deduplication. Provider promotion always starts a
new governed run or release and cannot silently alter an active run.

## Retention and export

Turn evidence is append-only and checksum-backed. Corrections create new
events or revisions. Public exports carry the all-synthetic, non-digital-twin
boundary and suppress cells smaller than five.

Current society objects are normalized for query and also included in every
fingerprinted snapshot. Exchanges and proposals remain in terminal states for
audit. Household exits are recorded rather than deleting prior membership.
Backups include `nexus_world_society_records`; older valid backups without
that additive table remain restorable and hydrate the state on the next Turn.

Runtime envelopes retain worker ID, release revision, schedule classification
and engine contract but no host secret. Encrypted backup and recovery receipts
may expose checksums, timestamps, sizes and coarse location class only; URLs,
keys, credentials and database connection strings are forbidden.

An AI-only backup may contain no deprecated participant-table rows. Restore
verification fails closed if such rows are present, even when the outer
checksum is valid.

## Prohibited claims

Simulation results cannot establish facts about Shenzhen residents, real
policy effects, AI consciousness or legal personhood. `human`, `ai` and
`robot` are the three modeled resident kinds. Human residents are simulated in
the current season and are not real study participants.
