# ADR-0032: Independent replication workflow

**Status:** Accepted for v4.8.4 on 2026-08-01.

## Context

The five-lane v4.8 matrix treats external replication and live-provider
evidence as independent claims. The original receipt path consumed the general
`CI` workflow, whose push-to-main release manifest also requires a live OpenAI
promotion regression. Without that unrelated credential, CI cannot finish and
GitHub cannot attest an otherwise reproducible symbiosis bundle.

The receipt workflow would also attempt to process successful pull-request CI
runs even though those runs deliberately create no signed external evidence.
It checked out the attested head before executing the verifier with access to
the receipt-signing key, so a manually triggered branch could expose that key
to code which had not entered the default branch.
Finally, the governance registry did not include the two symbiosis workflows
in its default signer allowlist, so optional federated ingestion would reject
the receipts produced by its own workflows.

## Decision

1. Add a dedicated GitHub-hosted `Symbiosis replication` workflow for pushes
   to `main` and governed manual runs.
2. Run the committed v4.7 verification, repeat it from exact tag `v4.7.0`, and
   require the two portable bundles to be byte-identical before upload.
3. Attest the bundle with GitHub Sigstore without any live-model credential.
4. Let the remote receipt bridge verify this dedicated signer, exact source
   revision and subject digest; never issue receipts for pull-request runs.
5. Execute receipt verification only from the repository default branch. The
   attested head remains data bound by Sigstore and the signed receipt; it is
   never the code that receives the signing key.
6. Add the dedicated replication and off-host recovery workflows to both the
   public trust projection and governance-ingestion allowlists.
7. Keep the existing live-model promotion gate unchanged. This decision
   separates evidence domains; it does not reduce release assurance.

## Consequences

- An absent OpenAI promotion secret no longer blocks external scientific
  replication.
- A receipt still needs the human-governed Ed25519 key and must bind the exact
  deployed revision, so local or PR runs cannot promote themselves.
- Candidate code never receives the Ed25519 receipt-signing key.
- External replication can fail, expire or recover independently of live
  provider, off-host recovery and elapsed-production evidence.
- The workflow contract is covered by unit tests in addition to remote runs.
