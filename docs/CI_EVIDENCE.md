# CI Evidence and Isolated Evaluation

## Evidence manifest

`npm run evidence:generate` writes `public/data/ci-evidence.json`. Generation
requires a passing `.artifacts/isolated-evaluation.json` from the `quality`
profile. The manifest binds:

- repository, commit, ref, workflow, run, actor, and dirty status;
- every release-gate command;
- SHA-256 hashes and byte lengths for the lockfile, v1 readiness report,
  long-horizon report, and isolated-evaluation report;
- the versioned model-regression report and its exact prompt/provider SLOs;
- a real PostgreSQL 17 source/restore integration gate on external CI;
- runtime identity;
- a canonical SHA-256 manifest fingerprint.

A local manifest is explicitly marked `trustLevel: local`. It is useful for
diagnosis but cannot authorize a code or deployment promotion.
Clean-revision detection ignores only the named generated reports above;
source edits and every unknown untracked path still set `source.dirty=true`.

The closed-loop report is not hashed into this manifest because that report
binds the manifest fingerprint. Release automation runs certification once as
a gate, generates the manifest, then runs certification again to create the
final exact-manifest binding. Both files are uploaded together.

## External provenance

On pushes, GitHub Actions uses `actions/attest@v4` to create Sigstore build
provenance for the evidence manifest. GitHub's artifact attestations bind the
artifact digest to the repository, workflow, commit, and OIDC-backed build
identity. Verify it with:

```bash
gh attestation verify public/data/ci-evidence.json \
  --repo Carrick-K7/nexus-7
```

GitHub documents the required `id-token: write`, `contents: read`, and
`attestations: write` permissions and the `subject-path` flow here:

- <https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations>
- <https://docs.github.com/en/actions/concepts/security/artifact-attestations>

Attestation proves provenance and integrity, not that the software is safe.
Promotion policy must still inspect the quality gates and artifact contents.

`npm run evidence:verify` uses GitHub CLI with repository, signer-workflow,
source-digest, and hosted-runner constraints. It verifies the attested subject
digest and issues an Ed25519-signed receipt bound to the exact repository,
commit, manifest SHA-256, manifest fingerprint, workflow run, gates, and
expiry. The application has only the public key.

After a successful main-branch CI run,
`.github/workflows/promotion-receipt.yml` downloads that run's evidence
artifact, verifies its Sigstore provenance, signs a 24-hour receipt, and
retains it for one day. The workflow secret contains the private receipt key;
the application configuration contains only the matching public key.

The same trust conversion is generalized by
`npm run evidence:verify-remote -- <artifact> <kind> <receipt>`. It accepts CI,
live model, recovery, and deployment-drill artifacts only after exact GitHub
attestation verification, then creates a kind-specific short-lived receipt.
The evidence registry verifies that receipt on ingestion and applies freshness
SLOs independently of artifact retention.

## Isolated executor

Run:

```bash
npm run evaluate:isolated -- smoke
npm run evaluate:isolated -- quality
```

The evaluator accepts only the hard-coded `smoke` and `quality` profiles. It
uses a digest-pinned Node image with:

- no network;
- read-only root filesystem;
- read-only source mount;
- all Linux capabilities dropped;
- `no-new-privileges`;
- CPU, memory, PID, and tmpfs limits;
- a disposable in-memory workspace.

Dependencies are copied from the already locked and installed source tree. The
quality profile runs Lint, the standard test suite, and a production build. It
cannot modify the host repository and cannot download dependencies or exfiltrate
data over the network.

## Promotion policy

Policy-only simulation variants may use deterministic in-process evidence.
Code and deployment changes require:

1. passing isolated quality evidence;
2. deterministic and live model regression gates with no fallback;
3. an external provenance attestation for the exact manifest digest;
4. a clean source revision;
5. a valid, unexpired verifier receipt for every required gate;
6. human admin approval from a non-service-account principal;
7. deployment telemetry, progressive traffic, and rollback readiness.
8. an active signed organization release policy in production;
9. successful promotion of the same artifact through prerequisite environments.
