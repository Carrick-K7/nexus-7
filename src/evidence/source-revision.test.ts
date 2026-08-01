import {
  describe,
  expect,
  it,
} from "vitest";
import {
  hasSourceChanges,
  normalizeGitPorcelainOutput,
  unexpectedSourceChanges,
} from "./source-revision";

describe("source revision cleanliness", () => {
  it("preserves the leading porcelain status column", () => {
    expect(
      normalizeGitPorcelainOutput(
        " M public/data/iteration-manifests.json\n",
      ),
    ).toBe(" M public/data/iteration-manifests.json");
    expect(normalizeGitPorcelainOutput("?? new-file.ts\r\n")).toBe(
      "?? new-file.ts",
    );
  });

  it("ignores only declared generated release outputs", () => {
    expect(hasSourceChanges("")).toBe(false);
    expect(
      hasSourceChanges(
        [
          "?? public/data/ci-evidence.json",
          " M public/data/iteration-manifests.json",
          " M public/data/society-study.json",
          " M public/data/symbiosis-study.json",
          "?? public/data/v1-readiness.json",
          " M public/data/v4-5-verification.json",
          " M public/data/v4-6-verification.json",
          " M public/data/v4-7-replication-bundle.json",
        ].join("\n"),
      ),
    ).toBe(false);
  });

  it("rejects source edits, unknown outputs, and source renames", () => {
    expect(hasSourceChanges(" M src/closure/service.ts")).toBe(
      true,
    );
    expect(hasSourceChanges("?? public/data/unbound.json")).toBe(
      true,
    );
    expect(
      hasSourceChanges(
        "R  src/old.ts -> public/data/ci-evidence.json",
      ),
    ).toBe(true);
    expect(hasSourceChanges("dirty")).toBe(true);
  });

  it("rejects renames and copies even when both paths are generated", () => {
    expect(
      unexpectedSourceChanges(
        "R  public/data/v4-5-verification.json -> public/data/v4-6-verification.json",
      ),
    ).toEqual([
      "public/data/v4-5-verification.json",
      "public/data/v4-6-verification.json",
    ]);
    expect(
      hasSourceChanges(
        "C  public/data/v4-5-verification.json -> public/data/v4-6-verification.json",
      ),
    ).toBe(true);
  });

  it("reports unexpected paths without exposing generated output churn", () => {
    expect(
      unexpectedSourceChanges(
        [
          " M public/data/model-regression.json",
          " M public/data/v4-5-verification.json",
          " M public/data/v4-6-verification.json",
          " M src/evidence/source-revision.ts",
          "R  docs/old.md -> docs/new.md",
          "?? scripts/untracked.ts",
        ].join("\n"),
      ),
    ).toEqual([
      "src/evidence/source-revision.ts",
      "docs/old.md",
      "docs/new.md",
      "scripts/untracked.ts",
    ]);
    expect(unexpectedSourceChanges("dirty")).toEqual([
      "<git-status-unavailable>",
    ]);
  });
});
