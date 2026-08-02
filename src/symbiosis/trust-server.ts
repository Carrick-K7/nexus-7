import {
  createHash,
} from "node:crypto";
import {
  readFileSync,
} from "node:fs";
import path from "node:path";
import type {
  HumanObservatoryReport,
} from "./observatory";
import {
  buildSymbiosisTrustMatrix,
  type SymbiosisTrustMatrix,
} from "./trust";

interface JsonArtifact {
  value: unknown;
  sha256?: string;
}

function readJsonArtifact(
  filePath: string | undefined,
  required: boolean,
): JsonArtifact {
  if (!filePath) {
    return { value: required ? { loadError: "path-missing" } : undefined };
  }
  try {
    const content = readFileSync(filePath);
    return {
      value: JSON.parse(content.toString("utf8")) as unknown,
      sha256: createHash("sha256").update(content).digest("hex"),
    };
  } catch {
    return { value: { loadError: "artifact-unreadable" } };
  }
}

export function configuredSymbiosisTrustMatrix(
  observatory: Pick<
    HumanObservatoryReport,
    "reliability"
  >,
  now = new Date(),
): SymbiosisTrustMatrix {
  const root = process.cwd();
  const bundle = readJsonArtifact(
    path.join(root, "public/data/v4-7-replication-bundle.json"),
    true,
  );
  return buildSymbiosisTrustMatrix({
    generatedAt: now.toISOString(),
    releaseRevision:
      process.env.NEXUS_RELEASE_REVISION?.trim() ||
      "unbound-development",
    replicationBundle: bundle.value,
    replicationArtifactSha256: bundle.sha256,
    observatory,
  });
}
