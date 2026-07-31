# v4.8 Independent Trust Matrix

## Purpose

v4.8 makes the remaining scientific and operational uncertainty visible in one
human-facing contract. It does not turn missing external evidence into a local
score. The public read-only endpoint is:

```text
GET /api/observatory/v2/trust
```

`POST` is rejected with 405. The Human Observatory renders the same contract
and preserves every missing, failed, stale, or verified lane.

## Five independent lanes

1. **Local replication** verifies the committed v4.7 bundle, all input/result/
   envelope hashes, 7/7 hypotheses and 12/12 exact runs.
2. **External replication** requires a GitHub-hosted clean CI run, Sigstore
   provenance for the exact bundle bytes, and a fresh Ed25519 receipt bound to
   the deployed commit, digest, hypotheses and run count.
3. **Off-host recovery** requires a checksum-valid encrypted backup, distinct
   source and target host fingerprints, restored row/fingerprint equality, a
   resumed Turn, GitHub-hosted provenance and a fresh signed receipt.
4. **Live DeepSeek shadow** requires DeepSeek to be the configured read-only
   shadow, at least one external attempt, successful comparable persisted
   output, and nonzero returned Token usage. Shadow output never settles the
   city.
5. **Elapsed production** requires 90 real wall-clock days, fresh reports,
   complete Turn lineage, 100% release-revision coverage and at least 99%
   on-time settlement. Accelerated or reference Turns cannot satisfy it.

The overall state is verified only when all five are verified. A malformed or
tampered artifact fails its lane. An absent artifact is pending. An expired
otherwise-valid receipt is stale. Provider failure or a reliability invariant
violation is failed. None of these states stops the deterministic city clock.

## External replication receipt

The normal `CI` workflow checks out tag `v4.7.0` in an isolated directory,
executes its exact reproduction command, then uploads and attests the unchanged
`public/data/v4-7-replication-bundle.json`. After a successful push to `main`,
`Remote evidence receipts` downloads that exact artifact, verifies its GitHub
attestation with self-hosted runners denied, recomputes the internal hashes and
issues `symbiosis-replication-receipt.json`.

The repository must provide:

```text
NEXUS_ATTESTATION_RECEIPT_PRIVATE_KEY_BASE64  # GitHub Actions secret
NEXUS_ATTESTATION_RECEIPT_PUBLIC_KEY_BASE64   # web-process environment
```

Download the receipt artifact to a mode-0600 server file and configure:

```text
SYMBIOSIS_REPLICATION_RECEIPT_FILE=/run/nexus7/symbiosis-replication-receipt.json
```

Receipts expire after seven days. Refreshing a receipt verifies current
availability and provenance; it does not alter historical experiment results.

## Off-host PostgreSQL drill

The manual `Symbiosis off-host recovery` workflow runs on a GitHub-hosted
runner, restores a production backup into PostgreSQL 17 and advances the
restored season by one Turn. Configure these repository secrets before running
it:

```text
SYMBIOSIS_BACKUP_MANIFEST_URL
SYMBIOSIS_ENCRYPTED_BACKUP_URL
NEXUS7_BACKUP_ENCRYPTION_KEY_HEX
SYMBIOSIS_BACKUP_SOURCE_HOST_FINGERPRINT
NEXUS_ATTESTATION_RECEIPT_PRIVATE_KEY_BASE64
```

The two URLs must be short-lived HTTPS download URLs for the matching plaintext
backup manifest and encrypted artifact. The source fingerprint is SHA-256 of a
stable, non-secret production-host identity. The workflow derives a different
target fingerprint from its repository/run/runner identity, deletes temporary
backup material, uploads only the evidence envelope and attests it.

The receipt workflow then verifies that attestation and issues
`symbiosis-off-host-recovery-receipt.json`. Deploy both the recovery envelope
and receipt as mode-0600 files:

```text
SYMBIOSIS_RECOVERY_EVIDENCE_FILE=/run/nexus7/symbiosis-offhost-recovery.json
SYMBIOSIS_OFFHOST_RECOVERY_RECEIPT_FILE=/run/nexus7/symbiosis-off-host-recovery-receipt.json
```

The dashboard rejects identical host fingerprints, a changed evidence
checksum, a subject-digest mismatch, an untrusted workflow, the wrong release
commit, an invalid signature or an expired receipt.

## DeepSeek shadow drill

Keep the deterministic provider as the world-settling primary and start with a
small independent shadow cap:

```text
SYMBIOSIS_COGNITIVE_PROVIDER=deterministic
SYMBIOSIS_SHADOW_PROVIDER=deepseek
SYMBIOSIS_SHADOW_MONTHLY_BUDGET_USD=1
DEEPSEEK_API_KEY_FILE=/run/secrets/deepseek-api-key
```

Restart web and worker normally; do not use `--once`. On the next naturally due
Turn, the gateway records attempts, provider failures or successful usage,
returned Token counts, pinned price version and USD cost. A missing key or
provider outage leaves the gate pending/failed and the city continues through
the deterministic primary.

## Boundary

The matrix is evidence about this software experiment. It is not evidence that
real Shenzhen residents would behave similarly, that a real policy works, or
that AI systems are conscious. Signed receipts establish artifact provenance,
not truth beyond the measured contract.
