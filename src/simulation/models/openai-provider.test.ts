// @vitest-environment node

import {
  createServer,
  type IncomingMessage,
} from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import {
  OpenAIResponsesModelProvider,
} from "@/simulation/models/openai-provider";
import type {
  ModelRequest,
} from "@/simulation";

const servers: Array<ReturnType<typeof createServer>> = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
});

function requestFixture(): ModelRequest {
  return {
    requestId: "openai-provider-test",
    tick: 8,
    seed: "provider-seed",
    agentId: "atlas",
    promptVersion: "prompt-test",
    policyVersion: "policy-test",
    city: {
      population: 1_000_000,
      gdp: 2000,
      happiness: 70,
      pollution: 40,
      crime: 75,
      traffic: 50,
      energy: 80,
      water: 90,
      internet: 95,
      medical: 85,
    },
  };
}

async function listen(
  handler: (
    request: IncomingMessage,
    body: Record<string, unknown>,
  ) => {
    status?: number;
    body: unknown;
    headers?: Record<string, string>;
  },
): Promise<string> {
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<
        string,
        unknown
      >;
      const result = handler(request, body);
      response.writeHead(result.status ?? 200, {
        "Content-Type": "application/json",
        ...(result.headers ?? {}),
      });
      response.end(JSON.stringify(result.body));
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", resolve),
  );
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server did not expose a TCP port");
  }
  return `http://127.0.0.1:${address.port}/v1`;
}

describe("OpenAI Responses model provider", () => {
  it("uses bearer auth, strict structured output, usage, and configurable cost", async () => {
    const baseUrl = await listen((request, body) => {
      expect(request.url).toBe("/v1/responses");
      expect(request.headers.authorization).toBe("Bearer server-secret");
      expect(body.model).toBe("gpt-test");
      expect(body.store).toBe(false);
      expect(body.text).toMatchObject({
        format: {
          type: "json_schema",
          strict: true,
          schema: {
            additionalProperties: false,
            properties: {
              agentId: { const: "atlas" },
              metric: { enum: ["crime"] },
            },
          },
        },
      });
      return {
        headers: { "x-request-id": "req_test" },
        body: {
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    agentId: "atlas",
                    metric: "crime",
                    delta: -4,
                    rationale: "Bounded real-provider security response",
                    confidence: 0.84,
                  }),
                },
              ],
            },
          ],
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            total_tokens: 150,
          },
        },
      };
    });
    const provider = new OpenAIResponsesModelProvider({
      apiKey: "server-secret",
      model: "gpt-test",
      baseUrl,
      inputCostPerMillion: 2,
      outputCostPerMillion: 10,
    });

    const result = await provider.generate(requestFixture());
    expect(result.providerId).toBe("openai-responses");
    expect(result.output).toMatchObject({
      agentId: "atlas",
      metric: "crime",
      delta: -4,
    });
    expect(result.usage.tokenCount).toBe(150);
    expect(result.usage.costUsd).toBeCloseTo(0.0007, 8);
    expect(result.usage.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("surfaces API errors without exposing the API key", async () => {
    const baseUrl = await listen(() => ({
      status: 429,
      headers: { "x-request-id": "req_rate_limit" },
      body: { error: { message: "Rate limit reached" } },
    }));
    const provider = new OpenAIResponsesModelProvider({
      apiKey: "never-print-this-secret",
      baseUrl,
    });

    await expect(provider.generate(requestFixture())).rejects.toThrow(
      "429, request req_rate_limit",
    );
    await expect(provider.generate(requestFixture())).rejects.not.toThrow(
      "never-print-this-secret",
    );
  });

  it("treats model refusal as a provider failure", async () => {
    const baseUrl = await listen(() => ({
      body: {
        output: [
          {
            type: "message",
            content: [
              {
                type: "refusal",
                refusal: "Cannot provide a safe proposal",
              },
            ],
          },
        ],
        usage: { total_tokens: 12 },
      },
    }));
    const provider = new OpenAIResponsesModelProvider({
      apiKey: "server-secret",
      baseUrl,
    });

    await expect(provider.generate(requestFixture())).rejects.toThrow(
      "refused",
    );
  });
});
