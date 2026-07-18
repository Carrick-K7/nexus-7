import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  stableStringify,
} from "@/simulation";
import {
  STANDARD_RELEASE_GATES,
} from "./release-gates";

export interface CiEvidenceArtifact {
  path: string;
  sha256: string;
  bytes: number;
}

export interface CiEvidenceManifest {
  schemaVersion: 1;
  generatedAt: string;
  source: {
    repository: string;
    commitSha: string;
    ref: string;
    workflow: string;
    runId: string;
    runAttempt: string;
    actor: string;
    dirty: boolean;
  };
  runtime: {
    node: string;
    platform: string;
    architecture: string;
  };
  gates: Array<{
    name: string;
    command: string;
    status: "passed";
  }>;
  artifacts: CiEvidenceArtifact[];
  provenance: {
    trustLevel: "local" | "external-ci";
    provider: "local" | "github-actions-sigstore";
    attestationSubject: string;
    verificationCommand?: string;
  };
  fingerprint: string;
}

const GATE_COMMANDS: Record<string, string> = {
  "dependency-audit": "npm audit --audit-level=moderate",
  lint: "npm run lint -- --max-warnings=0",
  "unit-integration": "npm run test:run",
  "postgres-integration": "npm run test:integration",
  "model-regression": "npm run verify:model",
  "model-regression-live": "npm run verify:model:live",
  "deployment-conformance": "npm run verify:deployment-contract",
  "operational-acceptance": "npm run verify:operations",
  "city-model-acceptance": "npm run verify:city",
  "diagnosis-acceptance": "npm run verify:diagnosis",
  "planning-acceptance": "npm run verify:planning",
  "outcome-learning-acceptance": "npm run verify:outcomes",
  "participation-acceptance": "npm run verify:participation",
  "closed-loop-certification": "npm run verify:closure",
  "browser-accessibility": "npm run test:e2e",
  "long-horizon": "npm run verify:stress",
  "isolated-evaluation": "npm run evaluate:isolated -- quality",
};

function releaseGates(
  includeExternalPromotionGates: boolean,
): CiEvidenceManifest["gates"] {
  const names = includeExternalPromotionGates
    ? [
        ...STANDARD_RELEASE_GATES,
        "postgres-integration",
        "model-regression-live",
      ]
    : [...STANDARD_RELEASE_GATES];
  return names.map((name) => ({
    name,
    command: GATE_COMMANDS[name],
    status: "passed" as const,
  }));
}

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function hashEvidenceArtifact(
  root: string,
  artifactPath: string,
): CiEvidenceArtifact {
  const buffer = fs.readFileSync(path.resolve(root, artifactPath));
  return {
    path: artifactPath,
    sha256: sha256(buffer),
    bytes: buffer.byteLength,
  };
}

export function fingerprintCiEvidence(
  manifest: Omit<CiEvidenceManifest, "fingerprint">,
): string {
  return sha256(Buffer.from(stableStringify(manifest), "utf8"));
}

export function createCiEvidenceManifest(options: {
  root: string;
  generatedAt?: Date;
  source: CiEvidenceManifest["source"];
  artifactPaths: string[];
  externalCi?: boolean;
  includeExternalPromotionGates?: boolean;
}): CiEvidenceManifest {
  const externalCi = options.externalCi ?? false;
  const manifestWithoutFingerprint = {
    schemaVersion: 1 as const,
    generatedAt: (options.generatedAt ?? new Date()).toISOString(),
    source: options.source,
    runtime: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
    },
    gates: releaseGates(options.includeExternalPromotionGates ?? false),
    artifacts: options.artifactPaths.map((artifactPath) =>
      hashEvidenceArtifact(options.root, artifactPath),
    ),
    provenance: externalCi
      ? {
          trustLevel: "external-ci" as const,
          provider: "github-actions-sigstore" as const,
          attestationSubject: "public/data/ci-evidence.json",
          verificationCommand:
            "gh attestation verify public/data/ci-evidence.json --repo OWNER/REPO",
        }
      : {
          trustLevel: "local" as const,
          provider: "local" as const,
          attestationSubject: "public/data/ci-evidence.json",
        },
  };
  return {
    ...manifestWithoutFingerprint,
    fingerprint: fingerprintCiEvidence(manifestWithoutFingerprint),
  };
}
