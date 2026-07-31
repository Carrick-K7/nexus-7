import {
  AGENT_DEFINITIONS,
} from "../agents";
import type {
  ModelProvider,
  ModelProviderResult,
  ModelRequest,
} from "./types";
import {
  CITY_POLICY_INSTRUCTIONS,
} from "./prompts";

interface OpenAIResponsesProviderOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  inputCostPerMillion?: number;
  outputCostPerMillion?: number;
  fetchImplementation?: typeof fetch;
}

interface OpenAIResponseBody {
  id?: string;
  error?: {
    message?: string;
  };
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
      refusal?: string;
    }>;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
}

function extractOutputText(response: OpenAIResponseBody): string {
  if (typeof response.output_text === "string" && response.output_text) {
    return response.output_text;
  }
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "refusal" && content.refusal) {
        throw new Error(`OpenAI model refused the proposal: ${content.refusal}`);
      }
      if (content.type === "output_text" && content.text) {
        return content.text;
      }
    }
  }
  throw new Error("OpenAI response did not contain structured output text");
}

function proposalSchema(agentId: ModelRequest["agentId"]) {
  return {
    type: "object",
    properties: {
      agentId: {
        type: "string",
        const: agentId,
      },
      metric: {
        type: "string",
        enum: AGENT_DEFINITIONS[agentId].capabilities,
      },
      delta: {
        type: "number",
        minimum: -10,
        maximum: 10,
      },
      rationale: {
        type: "string",
        minLength: 1,
        maxLength: 500,
      },
      confidence: {
        type: "number",
        minimum: 0,
        maximum: 1,
      },
    },
    required: ["agentId", "metric", "delta", "rationale", "confidence"],
    additionalProperties: false,
  };
}

export class OpenAIResponsesModelProvider implements ModelProvider {
  readonly id = "openai-responses";
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly inputCostPerMillion: number;
  private readonly outputCostPerMillion: number;
  private readonly fetchImplementation: typeof fetch;

  constructor(options: OpenAIResponsesProviderOptions) {
    if (!options.apiKey.trim()) {
      throw new Error("OpenAI API key is required");
    }
    this.apiKey = options.apiKey;
    this.model = options.model ?? "gpt-5.6-luna";
    this.baseUrl = (options.baseUrl ?? "https://api.openai.com/v1").replace(
      /\/$/,
      "",
    );
    this.inputCostPerMillion = options.inputCostPerMillion ?? 1;
    this.outputCostPerMillion = options.outputCostPerMillion ?? 6;
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  async generate(
    request: ModelRequest,
    signal?: AbortSignal,
  ): Promise<ModelProviderResult> {
    const startedAt = performance.now();
    const response = await this.fetchImplementation(
      `${this.baseUrl}/responses`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          store: false,
          max_output_tokens: 256,
          instructions: CITY_POLICY_INSTRUCTIONS,
          input: JSON.stringify({
            requestId: request.requestId,
            tick: request.tick,
            agentId: request.agentId,
            promptVersion: request.promptVersion,
            policyVersion: request.policyVersion,
            city: request.city,
          }),
          text: {
            format: {
              type: "json_schema",
              name: "nexus_city_policy_proposal",
              strict: true,
              schema: proposalSchema(request.agentId),
            },
          },
        }),
        signal,
      },
    );
    const requestId = response.headers.get("x-request-id");
    const body = (await response.json()) as OpenAIResponseBody;
    if (!response.ok) {
      throw new Error(
        `OpenAI Responses API failed (${response.status}${
          requestId ? `, request ${requestId}` : ""
        }): ${body.error?.message ?? response.statusText}`,
      );
    }

    const output = JSON.parse(extractOutputText(body)) as unknown;
    const inputTokens = body.usage?.input_tokens ?? 0;
    const outputTokens = body.usage?.output_tokens ?? 0;
    const tokenCount =
      body.usage?.total_tokens ?? inputTokens + outputTokens;
    const costUsd =
      (inputTokens * this.inputCostPerMillion +
        outputTokens * this.outputCostPerMillion) /
      1_000_000;

    return {
      providerId: this.id,
      model: this.model,
      output,
      usage: {
        tokenCount,
        costUsd,
        latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
      },
    };
  }
}
