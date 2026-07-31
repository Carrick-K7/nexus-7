# Causal Diagnosis and Causal Explorer

> Contracts: `nexus.causal-diagnosis.v1`,
> `nexus.diagnostic-calibration.v1`, `nexus.diagnostic-trust.v1`
> Release: v1.6.0

## Purpose

Causal diagnosis sits between a detected synthetic city incident and any
intervention experiment. It answers four bounded questions:

1. Which candidate causes are compatible with the observed facts?
2. What evidence contradicts each candidate?
3. Does removing a candidate from the frozen snapshot resolve symptoms?
4. Is confidence and calibration sufficient to permit the next automated
   stage?

It records inspectable evidence and test results. It never exposes or invents
a model's private chain-of-thought.

## Diagnosis record

Each durable record contains:

- incident, scenario, policy, objective/guardrail context, correlation, and
  causation IDs;
- the exact `nexus.city-snapshot.v1` source and fingerprint;
- evidence classified as `fact`, `inference`, `prediction`, or
  `human-judgment`;
- ranked leading, alternative, rejected, or unknown hypotheses;
- evidence stance and weight for every hypothesis;
- a falsification test and “what would change the conclusion” statement;
- all four independent Agent submissions and ARIA's non-destructive
  aggregation record;
- frozen-snapshot counterfactual results;
- calibration/drift state and the experiment-eligibility decision;
- known unknowns and an explicit synthetic boundary.

Diagnosis IDs include the trust/confidence context. Repeating the same request
is idempotent; reassessing after a trust-policy change creates another
append-only record instead of rewriting history.

## Counterfactual protocol

For every candidate:

1. reconstruct the incident's injected deterministic world;
2. freeze its source fingerprint;
3. remove only the candidate cause;
4. count declared symptoms before and after;
5. compute normalized effect size and side-effect metrics;
6. repeat the same removal and compare fingerprints;
7. support the candidate only when at least half the symptoms resolve.

The reported interval is a deterministic sensitivity band, not a statistical
claim about a sampled real population.

## Calibration and drift

The release corpus evaluates all 15 non-normal city scenarios. Three
hypotheses per scenario produce 45 probability/outcome samples. Reports include
Brier score, expected calibration error, Top-3 root-cause hit rate, per-Agent
breakdown, and per-family breakdown.

Trust modes:

| Mode | Trigger | Automation |
|---|---|---|
| `active` | calibration and drift within policy | diagnosis may pass onward |
| `read-only` | environment or policy-effect shift ≥ 0.35 | blocked |
| `deterministic-fallback` | calibration failure or model-output shift ≥ 0.35 | model diagnosis disabled |

Independent from drift, leading confidence below 0.65 or a failed
counterfactual blocks experiment eligibility.

## Persistence and API

Diagnosis, calibration, and trust records reuse the atomic lifecycle repository
introduced in v1.5. Memory and PostgreSQL adapters persist an aggregate revision
and append-only event together. Migration `0007` and checksum backup/restore
already cover these record kinds.

`GET /api/diagnosis` returns the workspace overview. Authenticated
`POST /api/diagnosis` supports:

- `diagnose-scenario`;
- `diagnose-incident`;
- `assess-drift` (human policy owner only);
- `record-human-judgment` (human only).

Normal scenarios cannot be diagnosed as incidents. Invalid scores, unknown
records, cross-workspace access, stale revisions, and non-human trust/judgment
mutations fail closed.

## Observer workflow

Open **Observer → Causal Explorer**. The observer density shows the conclusion,
alternatives, contradiction summaries, evidence classes, known unknowns, and
frozen counterfactual table. Audit density additionally shows exact evidence
sources and every independent Agent submission.

Use **Diagnose cascade scenario** to create or retrieve the reference
infrastructure diagnosis. The displayed `eligible` status means only that the
diagnostic gate passed; it does not authorize or execute an intervention.

## Acceptance

Run:

```bash
npm run verify:diagnosis
```

`.artifacts/diagnosis-acceptance.json` verifies:

- Top-3 root-cause retrieval across all incident scenarios;
- alternatives and counterevidence on every diagnosis;
- exact repeated counterfactual fingerprints;
- successful leading-candidate falsification;
- zero low-confidence automation attempts;
- four evidence classifications and four independent Agent sources;
- known ontology entities and executable tests only;
- read-only and deterministic fallback under injected drift;
- the visible no-hidden-reasoning boundary.

These are deterministic synthetic results. They do not establish causal
validity, calibration, fairness, or safety in a real city.
