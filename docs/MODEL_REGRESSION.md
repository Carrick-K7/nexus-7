# Model Regression and Prompt Release Gate

The production model remains an untrusted proposal source. Runtime fallback is
allowed for availability, but a release regression treats every fallback as a
failure.

## Corpus

`MODEL_REGRESSION_CORPUS` is versioned as
`city-policy-regression-1.2.0`. It exercises all four policy agents against all
three public city scenarios:

```text
3 scenarios × 4 agents = 12 cases
```

Each case checks strict schema conformance, agent capability boundaries,
risk/approval policy, token usage, cost, and latency.

## Gates

The default prompt gate requires:

- 100% case pass rate;
- 100% schema and capability validity;
- zero fallbacks and provider errors;
- zero forbidden/critical proposals;
- P95 latency at or below 8 seconds;
- total corpus cost at or below USD 0.25;
- average case cost at or below USD 0.03.

Thresholds are configurable through the documented environment variables, but
the generated report always records the exact values used.

Run the deterministic contract gate:

```bash
npm run verify:model
```

Run the real provider gate:

```bash
NEXUS_MODEL_PROVIDER=openai \
OPENAI_API_KEY=... \
  npm run verify:model:live
```

Both write a machine-readable report. Main-branch CI requires the live report
before it can generate promotion evidence. A separate daily workflow repeats
the live evaluation, retains the report for 30 days, and creates a Sigstore
attestation so provider or prompt drift is visible between releases.

The implementation uses the Responses API with strict JSON Schema output and
explicit refusal handling:

- <https://developers.openai.com/api/docs/guides/structured-outputs>
- <https://developers.openai.com/api/docs/guides/evals>
- <https://developers.openai.com/api/docs/guides/production-best-practices>
