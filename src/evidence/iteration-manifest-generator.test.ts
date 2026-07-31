// @vitest-environment node

import { createRequire } from "node:module";
import {
  describe,
  expect,
  it,
} from "vitest";

interface GitEntry {
  id: string;
  version: string;
  triggerReason: string;
}

const require = createRequire(import.meta.url);
const {
  mergeGitEntries,
} = require("../../scripts/iteration-manifest-utils.cjs") as {
  mergeGitEntries: (
    current: GitEntry[],
    fallback: GitEntry[],
  ) => GitEntry[];
};

describe("iteration manifest generator", () => {
  it("keeps committed history in a shallow build without overriding current entries", () => {
    const current = [
      {
        id: "current-head",
        version: "4.8.2",
        triggerReason: "current shallow checkout",
      },
    ];
    const committedFallback = [
      {
        id: "current-head",
        version: "4.8.1",
        triggerReason: "stale committed head",
      },
      {
        id: "d0d1484d",
        version: "0.3.0",
        triggerReason: "Feedback loop",
      },
    ];

    expect(mergeGitEntries(current, committedFallback)).toEqual([
      current[0],
      committedFallback[1],
    ]);
  });
});
