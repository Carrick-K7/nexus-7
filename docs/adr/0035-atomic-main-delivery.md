# ADR-0035: Atomic delivery from main

**Status:** Accepted for v4.8.7 on 2026-08-01.

## Context

NEXUS-7 was validated in GitHub Actions but deployed through a separate manual
checkout path. That split made the reviewed artifact, deployed files and
runtime revision harder to prove identical. The first automatic deployment
attempt also exposed that concurrent or immediate COS/FUSE backup copies need
serialization and cannot depend on a rename becoming visible synchronously.

## Decision

1. A push to `main` runs the complete quality gate, builds one immutable
   production archive and passes it to a repository-specific restricted SSH
   command with the exact 40-character revision.
2. The host verifies the archive, serializes and verifies local/offsite
   PostgreSQL backups, migrates, atomically switches the release pointer,
   restarts Web and worker, and restores the previous pointer on failed health.
3. The release writes `.deploy-sha`; Web, worker and the Trust API use that
   same revision.
4. Actions concurrency is isolated by ref so branch verification cannot block
   a reviewed `main` delivery. Deploy remains exclusive to `main` pushes.
5. Database containers, volumes, shared Caddy and host units remain outside
   application artifacts and under `Carrick-K7/carrick-ops` ownership.

## Consequences

- Production consumes the exact artifact that passed the `main` quality job.
- Failed backup, migration or health checks stop activation or roll application
  files back without replacing the PostgreSQL volume.
- Draft PRs never deploy and their unsigned artifacts cannot satisfy external
  trust lanes.
- The first failed backup-copy attempt remains evidence; the corrected
  serialized backup path must pass before v4.8.7 activation.
