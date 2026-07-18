export const STANDARD_RELEASE_GATES = [
  "dependency-audit",
  "lint",
  "unit-integration",
  "model-regression",
  "deployment-conformance",
  "operational-acceptance",
  "city-model-acceptance",
  "diagnosis-acceptance",
  "planning-acceptance",
  "outcome-learning-acceptance",
  "participation-acceptance",
  "closed-loop-certification",
  "browser-accessibility",
  "long-horizon",
  "isolated-evaluation",
] as const;

export const EXTERNAL_PROMOTION_GATES = [
  ...STANDARD_RELEASE_GATES,
  "postgres-integration",
  "model-regression-live",
] as const;
