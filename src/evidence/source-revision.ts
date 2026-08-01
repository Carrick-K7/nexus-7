const GENERATED_RELEASE_OUTPUTS = new Set([
  "public/data/ci-evidence.json",
  "public/data/iteration-manifests.json",
  "public/data/model-regression.json",
  "public/data/society-study.json",
  "public/data/symbiosis-study.json",
  "public/data/v1-1-stress.json",
  "public/data/v1-readiness.json",
  "public/data/v4-7-replication-bundle.json",
]);

function normalizePorcelainPath(value: string): string {
  const path = value.trim();
  if (path.startsWith('"') && path.endsWith('"')) {
    return path.slice(1, -1);
  }
  return path;
}

export function normalizeGitPorcelainOutput(
  output: string,
): string {
  return output.replace(/(?:\r?\n)+$/, "");
}

export function hasSourceChanges(
  porcelainStatus: string,
): boolean {
  return unexpectedSourceChanges(porcelainStatus).length > 0;
}

export function unexpectedSourceChanges(
  porcelainStatus: string,
): string[] {
  if (porcelainStatus === "dirty") {
    return ["<git-status-unavailable>"];
  }
  return [
    ...new Set(
      porcelainStatus
        .split("\n")
        .filter(Boolean)
        .flatMap((line) =>
          line
            .slice(3)
            .split(" -> ")
            .map(normalizePorcelainPath),
        )
        .filter(
          (path) => !GENERATED_RELEASE_OUTPUTS.has(path),
        ),
    ),
  ];
}
