import {
  describe,
  expect,
  it,
} from "vitest";
import {
  hasSourceChanges,
} from "./source-revision";

describe("source revision cleanliness", () => {
  it("ignores only declared generated release outputs", () => {
    expect(hasSourceChanges("")).toBe(false);
    expect(
      hasSourceChanges(
        [
          "?? public/data/ci-evidence.json",
          " M public/data/iteration-manifests.json",
          "?? public/data/v1-readiness.json",
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
});
