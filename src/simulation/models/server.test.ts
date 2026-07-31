// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";
import {
  getServerModelConfiguration,
} from "./server";

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
});

describe("server model configuration", () => {
  it("uses the deterministic provider unless OpenAI is explicitly enabled", () => {
    delete process.env.NEXUS_MODEL_PROVIDER;
    delete process.env.OPENAI_API_KEY;

    const configuration = getServerModelConfiguration();
    expect(configuration.configuredProvider).toBe("deterministic-mock");
    expect(configuration.provider.id).toBe("deterministic-mock");
  });

  it("requires a server-side key when OpenAI is enabled", () => {
    process.env.NEXUS_MODEL_PROVIDER = "openai";
    delete process.env.OPENAI_API_KEY;

    expect(() => getServerModelConfiguration()).toThrow("OPENAI_API_KEY");
  });

  it("builds the real provider with environment-controlled model and budgets", () => {
    process.env.NEXUS_MODEL_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "server-only-test-key";
    process.env.OPENAI_MODEL = "gpt-test";
    process.env.NEXUS_MODEL_MAX_TOKENS = "321";
    process.env.NEXUS_MODEL_MAX_COST_USD = "0.02";
    process.env.NEXUS_MODEL_TIMEOUT_MS = "4567";

    const configuration = getServerModelConfiguration();
    expect(configuration.configuredProvider).toBe("openai");
    expect(configuration.provider.id).toBe("openai-responses");
    expect(configuration.provider.model).toBe("gpt-test");
    expect(configuration.budgets).toEqual({
      maxTokensPerProposal: 321,
      maxCostUsdPerProposal: 0.02,
      timeoutMs: 4567,
    });
  });
});
