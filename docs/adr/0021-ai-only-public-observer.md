# ADR 0021: AI-Only Public Observer Boundary

- Status: Accepted
- Date: 2026-07-19
- Target release: v4.1.0

## Context

v4.0 ran an all-synthetic population, but its inherited database still allowed
a participant-avatar kind and created unused human-intent/private-memory
tables. Production observation also depended on shared Basic Auth while the
upstream application used development identity headers. Removing the password
without changing the application would have exposed operator mutations.

Repository documentation mixed current v4 authority, a superseded v3
participant prototype and two identical generated Evolution Log projections.

## Decision

1. Add `public-observer` authentication mode. It ignores caller identity,
   resolves a fixed viewer and has read permissions only.
2. Require the public reverse proxy to allow only GET, HEAD and OPTIONS.
   Operator mutations require a separate OIDC or signed-proxy control plane.
3. Restrict resident kinds to synthetic-human, software-AI and embodied-robot.
   Remove the adult field and the unused human-intent/private-memory tables.
4. Refuse migration when participant-avatar rows exist. Accept old backups
   only when their deprecated participant tables are empty.
5. Keep v2 human release governance as a separate safety bounded context; it
   cannot inject city residents or Turn input.
6. Archive v3 prototype documents, publish current v4 architecture/data
   authority, and generate one Evolution Log projection.

## Consequences

- Public City Lens needs no username or password and cannot mutate the system.
- There is no latent database path for real-person residency or private input.
- A database containing participant-avatar rows requires explicit quarantine;
  migration will not silently delete them.
- Existing empty v4.0 backups remain readable; backups with participant data
  fail verification.
- Historical documents and manifests remain auditable but cannot be mistaken
  for the current roadmap.
