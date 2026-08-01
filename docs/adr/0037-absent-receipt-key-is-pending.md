# ADR 0037: An absent receipt key is pending, not a failed receipt

- Status: accepted
- Date: 2026-08-01
- Release: v4.8.9

## Context

v4.8.8 proved clean GitHub/Sigstore provenance and removed the source-dirty
false positive. The two follower workflows then failed because the
human-controlled Ed25519 receipt key was intentionally absent. The Trust API
correctly classified the same condition as `pending`. Repeated red workflow
runs therefore represented missing configuration as a verifier failure and
created operational noise.

## Decision

Both receipt followers start with a minimal configuration job. It reveals only
the boolean presence of the GitHub secret, never the key or its length. When
the key is absent, the job summary says receipt issuance is pending and the
issuer job is skipped. When present, the complete artifact download,
attestation verification, signature, upload and optional OIDC ingestion path
runs unchanged.

No verification or signing error uses `continue-on-error`. Bad evidence, a bad
signature, an untrusted workflow, an expired subject or an ingestion failure
still fails the workflow and the applicable trust lane.

## Consequences

- Missing human configuration is visible without manufacturing a red evidence
  failure or a green trust lane.
- Successful configuration preflight is not evidence; only the signed receipt
  can change the Trust API.
- Follower workflow health becomes actionable: red means configured issuance
  failed, while skipped issuance means no key was supplied.
