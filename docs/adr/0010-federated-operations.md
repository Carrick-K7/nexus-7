# ADR 0010: Federated Operations

- Status: Accepted
- Date: 2026-07-16
- Target release: v1.3.0

## Context

v1.2 separated quality evidence from release authority, but role claims were
still transient, automation identities shared broad role semantics, remote
drill artifacts were not application history, deployment had one implicit
environment, and release policy was not independently signed.

## Decision

1. Authentication proves issuer and subject; persisted workspace membership or
   service-account state is authoritative for role and lifecycle.
2. Multiple exact OIDC providers may federate human and workload identities.
   Provider-level audiences and required claims are verified before an exact
   issuer/subject repository lookup.
3. CI, worker, and deployment-controller identities receive disjoint permission
   templates intersected with role permissions.
4. GitHub-attested operational artifacts are converted into short-lived
   Ed25519 receipts, verified on ingestion, retained in PostgreSQL, and
   evaluated against evidence-age SLOs.
5. Organization release policy is an Ed25519-signed, versioned bundle.
   Activation is human-admin only and supersedes the prior active version.
6. External release proposals freeze policy and target environment. The same
   artifact must promote through development, staging, and production in order.
7. Governance data participates in checksum backup, exact restore, and recovery
   drills.

## Consequences

- External identity-provider roles cannot silently escalate workspace access.
- Revocation and suspension take effect without changing an IdP token.
- Automation can perform its assigned task but cannot approve itself or alter
  its authority.
- Missing, stale, or expiring evidence is visible before a release decision.
- Production cannot be reached by creating a new proposal that skips earlier
  environment evidence.
- Policy changes are attributable, signed, versioned, and recoverable.
- Initial production bootstrap and policy-key custody become explicit operator
  responsibilities.
