import {
  sign,
  verify,
  type KeyLike,
} from "node:crypto";
import {
  stableStringify,
} from "@/simulation";
import type {
  ReleaseEnvironment,
  ReleaseEnvironmentPolicy,
  ReleasePolicyBundlePayload,
  SignedReleasePolicyBundle,
} from "./types";

const ENVIRONMENTS: ReleaseEnvironment[] = [
  "development",
  "staging",
  "production",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEnvironmentPolicy(
  value: unknown,
  environment: ReleaseEnvironment,
): value is ReleaseEnvironmentPolicy {
  if (!isRecord(value)) {
    return false;
  }
  return (
    value.environment === environment &&
    (value.prerequisite === undefined ||
      ENVIRONMENTS.includes(value.prerequisite as ReleaseEnvironment)) &&
    Array.isArray(value.trafficStages) &&
    value.trafficStages.every(
      (stage) => typeof stage === "number" && Number.isFinite(stage),
    ) &&
    typeof value.humanApprovalRequired === "boolean" &&
    typeof value.externalEvidenceRequired === "boolean" &&
    typeof value.minimumRequestCount === "number" &&
    typeof value.maximumErrorRatePercent === "number" &&
    typeof value.maximumP95LatencyMs === "number" &&
    typeof value.minimumAvailabilityPercent === "number"
  );
}

export function isSignedReleasePolicyBundle(
  value: unknown,
): value is SignedReleasePolicyBundle {
  if (
    !isRecord(value) ||
    !isRecord(value.payload) ||
    !isRecord(value.payload.environments)
  ) {
    return false;
  }
  const payload = value.payload;
  const environments = payload.environments as Record<string, unknown>;
  return (
    typeof value.signature === "string" &&
    value.signature.length > 0 &&
    payload.schemaVersion === 1 &&
    ["policyId", "version", "organizationId", "issuedAt", "expiresAt"].every(
      (field) =>
        typeof payload[field] === "string" &&
        (payload[field] as string).length > 0,
    ) &&
    ENVIRONMENTS.every((environment) =>
      isEnvironmentPolicy(
        environments[environment],
        environment,
      ),
    )
  );
}

function payloadBytes(payload: ReleasePolicyBundlePayload): Buffer {
  return Buffer.from(stableStringify(payload), "utf8");
}

export function createSignedReleasePolicyBundle(
  payload: ReleasePolicyBundlePayload,
  privateKey: KeyLike,
): SignedReleasePolicyBundle {
  return {
    payload: structuredClone(payload),
    signature: sign(null, payloadBytes(payload), privateKey).toString(
      "base64url",
    ),
  };
}

function validateEnvironmentPolicy(
  policy: ReleaseEnvironmentPolicy,
): string[] {
  const reasons: string[] = [];
  const stages = policy.trafficStages;
  if (
    stages.length < 2 ||
    stages.length > 5 ||
    stages.at(-1) !== 100 ||
    stages.some(
      (stage, index) =>
        stage <= 0 ||
        stage > 100 ||
        (index > 0 && stage <= stages[index - 1]),
    )
  ) {
    reasons.push(
      `${policy.environment} traffic stages must increase to 100%`,
    );
  }
  if (
    policy.minimumRequestCount < 1 ||
    policy.maximumErrorRatePercent < 0 ||
    policy.maximumP95LatencyMs < 1 ||
    policy.minimumAvailabilityPercent <= 0 ||
    policy.minimumAvailabilityPercent > 100
  ) {
    reasons.push(`${policy.environment} SLO policy is invalid`);
  }
  return reasons;
}

export function verifySignedReleasePolicyBundle(
  bundle: SignedReleasePolicyBundle,
  publicKey: KeyLike,
  expectedOrganizationId: string,
  now = new Date(),
): {
  valid: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  let signatureValid = false;
  try {
    signatureValid = verify(
      null,
      payloadBytes(bundle.payload),
      publicKey,
      Buffer.from(bundle.signature, "base64url"),
    );
  } catch {
    signatureValid = false;
  }
  if (!signatureValid) {
    reasons.push("Release policy signature is invalid");
  }
  if (bundle.payload.organizationId !== expectedOrganizationId) {
    reasons.push("Release policy organization does not match");
  }
  const issuedAt = Date.parse(bundle.payload.issuedAt);
  const expiresAt = Date.parse(bundle.payload.expiresAt);
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) {
    reasons.push("Release policy timestamps are invalid");
  } else {
    if (issuedAt > now.getTime() + 60_000) {
      reasons.push("Release policy issue time is in the future");
    }
    if (expiresAt <= now.getTime()) {
      reasons.push("Release policy has expired");
    }
    if (expiresAt - issuedAt > 366 * 24 * 60 * 60 * 1_000) {
      reasons.push("Release policy lifetime exceeds 366 days");
    }
  }
  if (bundle.payload.environments.development.prerequisite) {
    reasons.push("Development cannot have an environment prerequisite");
  }
  if (
    bundle.payload.environments.staging.prerequisite !== "development"
  ) {
    reasons.push("Staging must require development promotion");
  }
  if (
    bundle.payload.environments.production.prerequisite !== "staging"
  ) {
    reasons.push("Production must require staging promotion");
  }
  for (const environment of ENVIRONMENTS) {
    reasons.push(
      ...validateEnvironmentPolicy(
        bundle.payload.environments[environment],
      ),
    );
  }
  return {
    valid: reasons.length === 0,
    reasons,
  };
}

export function defaultReleasePolicyPayload(
  organizationId: string,
  now = new Date(),
): ReleasePolicyBundlePayload {
  return {
    schemaVersion: 1,
    policyId: "nexus-default-progressive-delivery",
    version: "1.0.0",
    organizationId,
    issuedAt: now.toISOString(),
    expiresAt: new Date(
      now.getTime() + 366 * 24 * 60 * 60 * 1_000,
    ).toISOString(),
    environments: {
      development: {
        environment: "development",
        trafficStages: [5, 25, 50, 100],
        humanApprovalRequired: true,
        externalEvidenceRequired: true,
        minimumRequestCount: 100,
        maximumErrorRatePercent: 1,
        maximumP95LatencyMs: 750,
        minimumAvailabilityPercent: 99.9,
      },
      staging: {
        environment: "staging",
        prerequisite: "development",
        trafficStages: [10, 50, 100],
        humanApprovalRequired: true,
        externalEvidenceRequired: true,
        minimumRequestCount: 100,
        maximumErrorRatePercent: 2,
        maximumP95LatencyMs: 1_000,
        minimumAvailabilityPercent: 99,
      },
      production: {
        environment: "production",
        prerequisite: "staging",
        trafficStages: [5, 25, 50, 100],
        humanApprovalRequired: true,
        externalEvidenceRequired: true,
        minimumRequestCount: 500,
        maximumErrorRatePercent: 1,
        maximumP95LatencyMs: 750,
        minimumAvailabilityPercent: 99.9,
      },
    },
  };
}

export function policyPublicKeyFromEnvironment(): string {
  const encoded =
    process.env.NEXUS_RELEASE_POLICY_PUBLIC_KEY_BASE64 ??
    process.env.NEXUS_ATTESTATION_RECEIPT_PUBLIC_KEY_BASE64;
  if (!encoded) {
    throw new Error(
      "NEXUS_RELEASE_POLICY_PUBLIC_KEY_BASE64 is required to activate signed release policy bundles",
    );
  }
  return Buffer.from(encoded, "base64").toString("utf8");
}
