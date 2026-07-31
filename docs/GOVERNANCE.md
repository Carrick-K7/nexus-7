# Governed Release Policy

NEXUS-7 separates simulation evidence from authority to release software.
Policy experiments may run entirely inside the deterministic laboratory.
Code and deployment changes may not.

## Identity boundary

Every experiment and iteration request resolves to:

- a workspace;
- a human, service-account, or system principal;
- a viewer, operator, or admin role;
- an explicit permission set.

OIDC and trusted-proxy authentication proves issuer and subject. Persisted
workspace membership or service-account state is authoritative for role,
workspace, lifecycle, workload kind, and effective permission grants.
Repositories enforce the workspace boundary on reads and writes. System
principals may run the internal clock, but service accounts cannot administer a
workspace, activate release policy, or approve a promotion. Final approval is
human-admin only.

CI, worker, and deployment-controller identities use separate permission
templates. Multiple exact OIDC providers can be configured with provider-level
audience, static workload scope, and required signed claims.

`GET /api/auth/context` exposes the effective identity and permissions to the
current caller. The Iteration Lab and Verification Center render the same
boundary for human inspection.

## Code and deployment promotion

A non-policy proposal must identify the exact repository, commit, evidence
manifest digest, and manifest fingerprint. It remains in `proposed` until an
external verifier attaches a signed receipt.

The receipt is accepted only when:

1. its Ed25519 signature is valid;
2. repository, commit, manifest SHA-256, and fingerprint match exactly;
3. GitHub CLI verified the Sigstore attestation from the allowed workflow;
4. every required release gate is present, including PostgreSQL recovery and
   live model regression;
5. verification is recent and the receipt expires within seven days.

The application receives only the public receipt key. The independent verifier
worker receives the private key after running `gh attestation verify`.
The repository's `Promotion receipt` workflow performs this automatically
after a successful main-branch CI run and publishes the receipt for one day,
matching its 24-hour validity.

After evidence attachment, a human admin must approve. Deployment releases then
use the environment policy's progressive traffic stages. Every observation
records request volume, error rate, P95 latency, availability, platform health,
alerts, and automatic rollback actions. The exact artifact must pass
development before staging and staging before production.

Remote CI, model, recovery, and rollback evidence is stored in the governance
registry only after GitHub attestation verification and Ed25519 receipt
verification. Missing, expiring, stale, and current states are calculated
against evidence-kind freshness SLOs.

Organization release policy is an Ed25519-signed, versioned bundle. Activation
is human-admin only and transactionally supersedes the prior active policy.
Each proposal freezes the active policy version, environment traffic stages,
and SLO thresholds.

## Least privilege

| Principal | Read | Experiment/propose | Attach evidence | Approve | Deploy |
|---|---:|---:|---:|---:|---:|
| Viewer | Yes | No | No | No | No |
| Human operator | Yes | Yes | Yes | No | No |
| Human admin | Yes | Yes | Yes | Yes | Yes |
| CI workload | Governance | Model/evidence only | Yes | No | No |
| Worker workload | Runs | Advance only | No | No | No |
| Deployment controller | Governance | Approved release only | No | No | Yes |
| System | Internal | Clock only | No | No | No |

Deployment credentials, OpenAI keys, receipt private keys, and proxy signing
secrets remain server-side.
