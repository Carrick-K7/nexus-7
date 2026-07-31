// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  ISOLATED_EVALUATION_IMAGE,
  isolatedEvaluationArguments,
} from "./isolated-executor";

describe("isolated evaluator", () => {
  it("fences code with no network, read-only root, dropped capabilities, and limits", () => {
    const argumentsList = isolatedEvaluationArguments(
      "/trusted/source.tar",
      "quality",
    );
    const command = argumentsList.at(-1);

    expect(argumentsList).toContain("none");
    expect(argumentsList).toContain("--read-only");
    expect(argumentsList).toContain("ALL");
    expect(argumentsList).toContain("no-new-privileges");
    expect(argumentsList).toContain("4g");
    expect(argumentsList).toContain(
      "type=bind,source=/trusted/source.tar,target=/input/source.tar,readonly",
    );
    expect(argumentsList).toContain(ISOLATED_EVALUATION_IMAGE);
    expect(command).toContain("npm run test:run");
    expect(command).toContain("npm run verify:model");
    expect(command).toContain("npm run build");
    expect(command).toContain("/input/source.tar");
    expect(command).not.toContain("npm install");
  });
});
