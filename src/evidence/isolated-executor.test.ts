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

  it("uses only the existing root-owned scratch for real root-file tests", () => {
    for (const profile of ["smoke", "quality"] as const) {
      const args = isolatedEvaluationArguments("/trusted/source.tar", profile);
      expect(args).toContain("/workspace:rw,exec,nosuid,nodev,size=3g,mode=0755");
      expect(args).not.toContain("/workspace:rw,exec,nosuid,nodev,size=3g,mode=1777");
      const environment = args.flatMap((value, index) => value === "--env" ? [args[index + 1]] : []);
      expect(environment).toEqual(["CI=1", "HOME=/tmp", "NEXUS_OPERATOR_TEST_PARENT=/workspace", "NEXT_TELEMETRY_DISABLED=1"]);
      expect(args.filter((value) => value === "--mount")).toHaveLength(1);
      expect(args.filter((value) => value === "--tmpfs")).toHaveLength(2);
      expect(args[args.indexOf("--network") + 1]).toBe("none");
      expect(args[args.indexOf("--cap-drop") + 1]).toBe("ALL");
      expect(args).toContain("--read-only");
      expect(args).toContain("no-new-privileges");
      expect(args).not.toContain("--privileged");
    }
  });
});
