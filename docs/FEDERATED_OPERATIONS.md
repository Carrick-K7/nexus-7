# Federated Operations

NEXUS-7 v1.3 makes organization identity, workload authority, remote evidence,
and environment promotion durable governance domains.

## Authoritative identity

OIDC or proxy authentication proves a subject and issuer. It no longer grants
the asserted role directly. Every request resolves that identity against an
active workspace membership or registered service account in PostgreSQL.

Development mode may bootstrap local identities for browser tests. OIDC and
proxy modes deny unknown or suspended identities. A production installation
can seed its first administrator with:

```text
NEXUS_BOOTSTRAP_ADMIN_SUBJECT=identity-provider-subject
NEXUS_BOOTSTRAP_ADMIN_ISSUER=https://identity.example.com/
NEXUS_BOOTSTRAP_ADMIN_WORKSPACE=workspace-neo-angeles
```

After bootstrap, use `/api/governance/access` to manage memberships and
service-account lifecycle. Service accounts are bound to exact workspace,
issuer, and subject. Rotation increments a credential version; suspension
blocks use immediately; revocation is terminal.

## Workload federation

`NEXUS_OIDC_PROVIDERS_JSON` configures multiple exact trusted issuers. Each
provider has its own audience, JWKS URL, optional static workspace/principal
type, and exact required claims. The unverified token issuer is used only to
select a configured provider; signature, audience, expiry, and required claims
are then verified before repository lookup.

Registered workload kinds receive fixed maximum permissions:

| Workload | Permissions |
|---|---|
| `ci` | read governance, attach/ingest evidence, run model proposal gates |
| `worker` | read workspace and advance runs |
| `deployment-controller` | read governance and control approved deployments |

Role permissions and workload permissions are intersected. A service account
cannot administer membership, activate policy, or grant human approval even
when its external token claims an admin role.

## Remote evidence registry

The live model and operations workflows attest their reports with GitHub
Sigstore. `.github/workflows/evidence-receipts.yml` downloads completed
artifacts, runs `gh attestation verify` with repository, signer-workflow,
source-digest, and hosted-runner constraints, and signs a short-lived generic
receipt with the independent Ed25519 verifier key.

`POST /api/governance/evidence` verifies that receipt again before storing it.
The registry is idempotent on workspace, evidence kind, workflow run, and
subject digest. It tracks:

- CI evidence, maximum age 30 hours;
- live model regression, maximum age 36 hours;
- database recovery drill, maximum age 8 days;
- deployment rollback drill, maximum age 8 days.

Records become `expiring` near their age or receipt boundary, `stale` after
expiry/SLO breach, and `missing` when no verified record exists. The
Verification Center shows the current state and retained history.

When the GitHub repository variable `NEXUS_GOVERNANCE_BASE_URL` is set, the
receipt workflow requests a short-lived GitHub OIDC token and posts every
receipt automatically. The target application must register that exact GitHub
issuer/subject as a `ci` workload. No long-lived ingestion API token is used.

## Signed release policy

`POST /api/governance/policies` accepts only an Ed25519-signed policy bundle for
the caller's organization. Activation is human-admin only and transactionally
supersedes the previous active version.

Each proposal freezes the active policy version and target environment.
Environment policy defines traffic stages and request/error/P95/availability
SLOs. Staging requires a healthy promoted development release of the exact
repository and commit; production requires the same artifact to pass staging.

Set `NEXUS_REQUIRE_SIGNED_RELEASE_POLICY=true` to reject new external release
proposals when no active signed policy exists. Without it, local development
uses the documented built-in progressive-delivery template.

## Recovery

Organizations, workspace governance, memberships, service accounts,
governance audit, evidence history, and release-policy versions are included in
checksum-bound PostgreSQL backup/restore and the scheduled recovery drill.
