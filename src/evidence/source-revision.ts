const GENERATED_RELEASE_OUTPUTS = new Set([
  "public/data/ci-evidence.json",
  "public/data/iteration-manifests.json",
  "public/data/model-regression.json",
  "public/data/v1-1-stress.json",
  "public/data/v1-readiness.json",
]);

function normalizePorcelainPath(value: string): string {
  const path = value.trim();
  if (path.startsWith('"') && path.endsWith('"')) {
    return path.slice(1, -1);
  }
  return path;
}

export function hasSourceChanges(
  porcelainStatus: string,
): boolean {
  if (porcelainStatus === "dirty") {
    return true;
  }
  return porcelainStatus
    .split("\n")
    .filter(Boolean)
    .some((line) => {
      const paths = line
        .slice(3)
        .split(" -> ")
        .map(normalizePorcelainPath);
      return paths.some(
        (path) => !GENERATED_RELEASE_OUTPUTS.has(path),
      );
    });
}
