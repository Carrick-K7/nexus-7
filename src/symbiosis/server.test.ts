// @vitest-environment node

import {
  describe,
  expect,
  it,
} from "vitest";
import {
  primaryProviderName,
  shadowProviderName,
} from "./server";

describe("symbiosis provider configuration", () => {
  it("accepts only explicit primary and shadow provider names", () => {
    expect(primaryProviderName(undefined)).toBe("deterministic");
    expect(primaryProviderName("deepseek")).toBe("deepseek");
    expect(shadowProviderName(undefined)).toBe("none");
    expect(shadowProviderName("reference")).toBe("reference");
    expect(shadowProviderName("deepseek")).toBe("deepseek");
    expect(() => primaryProviderName("deepseak")).toThrow(
      "Unsupported SYMBIOSIS_COGNITIVE_PROVIDER",
    );
    expect(() => shadowProviderName("deterministic")).toThrow(
      "Unsupported SYMBIOSIS_SHADOW_PROVIDER",
    );
  });
});
