# ADR 0009: Governed Deployment

- Status: Accepted
- Date: 2026-07-16
- Target release: v1.2.0

## Context

v1.1 established production evidence primitives, but the application could not
yet prove that a code/deployment candidate matched externally verified CI,
isolate tenants, gate prompt changes against a live provider, or exercise a
real deployment control plane.

## Decision

NEXUS-7 adopts a governed release boundary:

- every identity is scoped to a workspace and principal type;
- service accounts cannot approve promotion;
- code/deployment proposals bind an exact artifact and require a short-lived,
  independently signed receipt for GitHub Sigstore evidence;
- the receipt must include deterministic and live model regression gates;
- prompt releases use a versioned 12-case corpus with schema, capability,
  fallback, risk, latency, and spend SLOs;
- deployment canaries run through an adapter with progressive traffic,
  production telemetry, critical alerts, and platform rollback;
- database recovery and deployment rollback are scheduled, retained, and
  attested as operational evidence.

Policy-only simulation variants retain the faster deterministic experiment
path, but still require human approval before canary execution.

## Consequences

- Local green tests cannot authorize an external release.
- Runtime model fallback improves availability but fails a release gate.
- A compromised service account cannot self-approve.
- Promotion receipts expire, preventing indefinite reuse of stale evidence.
- Production deployment and live-provider workflows require external secrets
  and endpoints; absence is an explicit failed gate, not a silent skip.
- v1 replay, causal, rollback, and invariant thresholds remain unchanged.
