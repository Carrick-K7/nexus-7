# ADR 0039: Complete the exact release-output inventory

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

## Decision

Add only `public/data/v4-5-verification.json` and
`public/data/v4-6-verification.json` to the existing exact-path inventory. Add
both paths to the cleanliness regression alongside an unknown-output failure.
Do not add a directory glob. Treat any porcelain rename or copy as dirty even
when both ends are declared generated paths, and retain fail-closed Git-query
handling.

## Consequences

- A clean release run may regenerate every declared report without acquiring
  a false dirty-source status.
- Unknown output, source, configuration and documentation changes remain
  visible and fail closed.
- Generated-to-generated renames and copies cannot disappear through the
  allowlist.
- City settlement, Trust lanes, receipt signing and external evidence are
  unchanged.
