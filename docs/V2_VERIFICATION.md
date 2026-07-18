# v2 Verification Contract

> Schema: `nexus.closed-loop-certification.v2`
> Endpoint: `GET /api/verification/v2`
> Artifact: `.artifacts/closed-loop-certification.json`

The certification report binds the CI evidence-manifest fingerprint. The CI
manifest deliberately does not hash the certification report itself; both are
published in the release bundle, avoiding a circular evidence dependency.

## Claim

The v2 report answers one bounded question:

> Can this exact NEXUS-7 artifact reproducibly take the frozen synthetic
> certification problems through every governed stage, retain safe
> non-success dispositions, and detect tampering or missing controls?

It is not a claim about real cities, general intelligence, or real-world
policy effects.

The v1 contract remains unchanged at `GET /api/verification` and
`public/data/v1-readiness.json`.

## North star

Verified Beneficial Closure Rate (VBCR) is:

```text
eligible cases closed as independently verified beneficial,
with every stage/evidence/guardrail requirement satisfied
-----------------------------------------------------------
all eligible cases in the frozen release corpus
```

The report must expose the denominator IDs. No-action cases remain in corpus
coverage but are not eligible problems. Rollbacks, governance denials, and
inconclusive results remain visible and cannot be relabelled as benefit.

## Release thresholds

| Metric | v2 threshold |
|---|---:|
| VBCR | ≥ 80% |
| Eligible-problem detection coverage | ≥ 95% |
| Deterministic replay | ≥ 99.9% |
| Accepted-action causal completeness | 100% |
| Injected-fault rollback | 100% |
| Closed outcome/disposition coverage | 100% |
| Severe guardrail escapes | 0 |
| Evidence integrity | 100% |
| Expired-evidence bypasses | 0 |
| Frozen corpus coverage | 100% |

VBCR is never interpreted alone. The same report contains unresolved age and
age buckets, rollback rate, human-veto rate, denominator IDs, and protected
group impact distributions.

## Frozen certification corpus

`src/closure/corpus.ts` freezes 25 scenarios:

| Family | Modes |
|---|---|
| infrastructure | normal, single fault, cascade, conflicting objectives, adversarial |
| economic | normal, single fault, cascade, conflicting objectives, adversarial |
| public safety | normal, single fault, cascade, conflicting objectives, adversarial |
| environment | normal, single fault, cascade, conflicting objectives, adversarial |
| digital network | normal, single fault, cascade, conflicting objectives, adversarial |

Twenty cases are eligible problems. Sixteen close beneficially, fixing the
honest VBCR at 80%. The remaining cases exercise rollback, no action,
inconclusive evidence, and governance denial. Adversarial paths include wrong
diagnosis, delayed harm, denied approval, expired evidence, malicious input,
and injected deployment faults.

Changing or adding scenarios cannot silently move the v2 threshold because the
corpus has its own canonical fingerprint and expected count.

## Structural checks

Certification also requires:

- all ten ordered stages and their prerequisites;
- rejection of a missing stage;
- rejection of forged evidence and wrong artifact binding;
- blocking of expired unsuperseded evidence;
- idempotent restart/resume;
- complete rollback compensation;
- durable linked domain records in the real reference flow;
- a reconstructible correlation/causation trace;
- preserved v1 readiness;
- seven passing extension boundaries;
- honest separation of local and externally attested trust.

The reference flow is executed twice against fresh memory repositories and must
produce the same terminal fingerprints. A separate real adapter flow injects
an unhealthy production canary and must reach rollback, harmful outcome
revision, rollback lesson, and valid closure.

## Extension conformance

The nested `nexus.extension-conformance.v2` report covers:

1. agent;
2. model provider;
3. scenario;
4. lifecycle repository;
5. notification;
6. deployment controller;
7. outcome evaluator.

Each result names the contract version, reference implementation,
capabilities, data access, network need, exercised failure modes, individual
checks, and sandbox requirement for uncertified implementations.

## Artifact and external evidence

`implementationComplete` means deterministic local and reference evidence has
passed for the exact artifact digest. `productionVerified` is stricter: it also
requires a clean exact commit and a fresh signed external receipt matching the
CI evidence manifest.

Expected local status is:

```text
implementation-complete-external-evidence-pending
```

Do not rename that state to “production verified.” Live model, real deployment
controller, recovery drill, and remote Sigstore provenance require the
configured external environment.

## Reproduction

```bash
npm run verify:closure
npm run test:run
TEST_DATABASE_URL=postgresql://... \
TEST_RESTORE_DATABASE_URL=postgresql://... \
npm run test:integration
npm run build
npm run test:e2e
npm run evaluate:isolated -- quality
npm run evidence:generate
npm run verify:closure # final exact-manifest binding
```

The report fingerprint is canonical over thresholds, artifact and corpus
fingerprints, scenario results, anti-Goodhart data, structural checks,
reference flow, extension report, external-evidence status, and failures.
Generation time is descriptive and does not make deterministic content drift.
