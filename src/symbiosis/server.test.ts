// @vitest-environment node

import {
  describe,
  expect,
  it,
} from "vitest";
import {
  primaryProviderName,
  shadowProviderName,
  symbiosisTurnIntervalMs,
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

  it("rejects a malformed or unsafe Turn interval instead of spinning", () => {
    expect(symbiosisTurnIntervalMs(undefined)).toBe(3_600_000);
    expect(symbiosisTurnIntervalMs("60000")).toBe(60_000);
    expect(() => symbiosisTurnIntervalMs("not-a-number")).toThrow(
      "SYMBIOSIS_TURN_INTERVAL_MS",
    );
    expect(() => symbiosisTurnIntervalMs("59999")).toThrow(
      "SYMBIOSIS_TURN_INTERVAL_MS",
    );
  });
});
