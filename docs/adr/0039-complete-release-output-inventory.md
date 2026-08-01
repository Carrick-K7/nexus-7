# ADR 0039: Close release-evidence source and attestation identity

- Status: accepted
- Date: 2026-08-01
- Release: v4.8.11

## Context

A clean local `check:release` passed every implementation gate, including the
real PostgreSQL suite, but its evidence generator reported two unexpected
changes. `verify:v45` and `verify:v46` intentionally rewrite their versioned
deterministic reports before evidence generation. The source-cleanliness
inventory declared the other generated release outputs but omitted these two.

Treating the reports as source edits is a false failure. Ignoring all of
`public/data`, however, would hide unrecognized or malicious files.

The resulting PR artifact exposed a second ambiguity. Attestation steps were
correctly skipped for pull requests, but the manifest named
`github-actions-sigstore` without a machine field saying verification was
still required. The receipt path did verify Sigstore independently, so this
was not an authorization bypass, but the artifact could be misread.

## Decision

Add only `public/data/v4-5-verification.json` and
`public/data/v4-6-verification.json` to the existing exact-path inventory. Add
both paths to the cleanliness regression alongside an unknown-output failure.
Do not add a directory glob. Treat any porcelain rename or copy as dirty even
when both ends are declared generated paths, and retain fail-closed Git-query
handling.

Every newly generated GitHub-hosted manifest records
`attestationState=requires-external-verification`; local manifests record
`not-applicable`. The existing provider field identifies the verification
mechanism only. Receipt issuance continues to require an independent GitHub
CLI verification of the exact subject digest, signer workflow and source
commit. Legacy manifests without the additive field remain verifiable for
compatibility.

## Consequences

- A clean release run may regenerate every declared report without acquiring
  a false dirty-source status.
- Unknown output, source, configuration and documentation changes remain
  visible and fail closed.
- Generated-to-generated renames and copies cannot disappear through the
  allowlist.
- An unsigned PR manifest cannot imply that its expected Sigstore mechanism
  already verified the artifact.
- City settlement, Trust lanes, receipt signing and external evidence are
  unchanged.
