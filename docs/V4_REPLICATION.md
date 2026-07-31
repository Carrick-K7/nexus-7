# v4.7 Scientific Replication

## Purpose

v4.7 asks whether another clean environment can reproduce NEXUS-7's synthetic
mechanism results without production data, a database, a model key or a hidden
analysis choice. It does not claim that a second organization has already done
so.

The v4.6 results were exploratory. v4.7 freezes a prospective replication plan
for those results and uses four newly named seeds across the reciprocal,
hierarchy and segregation regimes.

## Reproduce

From a clean checkout of the matching release:

```bash
npm ci
npm run verify:v47
```

On releases after v4.7, that command verifies that every frozen scientific
source and complete result hash remains compatible while explicitly listing
package/runner metadata drift. CI additionally checks out tag `v4.7.0` into an
isolated directory and runs the original exact command there. Only that tagged
checkout is described as exact v4.7 environment reproduction.

The command hashes every required input, executes every scenario twice,
recomputes the analysis and compares the complete bundle hash with
`public/data/v4-7-replication-bundle.json`. It exits non-zero for a changed
source/calibration input, altered result, failed hypothesis, non-exact replay,
resource violation or tampered envelope.

`npm run bundle:v47` is the release-author operation that intentionally writes
a new bundle. It must not be used to make an unexpected verification mismatch
disappear; changed inputs require review and a new version.

## Fixed design

- 3 regimes: reciprocal agency, hierarchy positive control and segregation
  zero-denominator control;
- 4 held-out seeds per regime;
- 90 Turns per scenario;
- 2 complete executions per scenario;
- 7 hypotheses with fixed, denominator-preserving analysis rules;
- deterministic-primary/diversity-shadow and diversity-primary controls;
- zero external provider calls and zero secret inputs.

Every scenario exposes its seed, final world fingerprint, complete-result
SHA-256, RALR numerator/denominator, refusals, withdrawals, coercion, severe
escapes, needs and society invariants. Failed seeds cannot be removed or hidden
behind a mean.

## Trust levels

The Observatory deliberately shows four different facts:

1. local reproduction passed;
2. the portable bundle's exact SHA-256;
3. external CI verification status;
4. Sigstore receipt presence.

Only the first two are currently present. Workflow code capable of uploading
and attesting the bundle exists, but code is not a receipt. A GitHub or other
independent run must complete and its provenance must be verified before the
last two states can change.

v4.8 keeps the immutable bundle unchanged and projects any later receipt
through `/api/observatory/v2/trust`. The receipt must match the bundle file
digest, internal bundle hash, hypothesis/run summary, deployed revision and a
trusted GitHub workflow. The committed bundle's original `externalCiVerified`
field remains false because external proof cannot rewrite the artifact it
attests.

This milestone does not close the live DeepSeek, 90 elapsed production days or
off-host PostgreSQL restore gates.
