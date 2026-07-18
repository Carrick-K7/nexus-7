import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import type {
  NotificationChannel,
  NotificationDelivery,
} from "./intelligence-types";

export interface NotificationAttemptResult {
  delivered: boolean;
  responseStatus?: number;
  error?: string;
}

export interface NotificationTransport {
  send(
    channel: NotificationChannel,
    delivery: NotificationDelivery,
  ): Promise<NotificationAttemptResult>;
}

export function signWebhookPayload(
  body: string,
  timestamp: string,
  secret: string,
): string {
  return `v1=${createHmac("sha256", secret)
    .update(`v1\n${timestamp}\n${body}`, "utf8")
    .digest("hex")}`;
}

export function verifyWebhookSignature(
  body: string,
  timestamp: string,
  signature: string,
  secret: string,
): boolean {
  const expected = signWebhookPayload(body, timestamp, secret);
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(signature);
  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

interface SignedWebhookTransportOptions {
  fetchImplementation?: typeof fetch;
  secretResolver?: (environmentName: string) => string | undefined;
  timeoutMs?: number;
}

export class SignedWebhookTransport implements NotificationTransport {
  private readonly fetchImplementation: typeof fetch;
  private readonly secretResolver: (
    environmentName: string,
  ) => string | undefined;
  private readonly timeoutMs: number;

  constructor(options: SignedWebhookTransportOptions = {}) {
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.secretResolver =
      options.secretResolver ?? ((name) => process.env[name]);
    this.timeoutMs = options.timeoutMs ?? 5_000;
  }

  async send(
    channel: NotificationChannel,
    delivery: NotificationDelivery,
  ): Promise<NotificationAttemptResult> {
    const secret = this.secretResolver(channel.secretEnvName);
    if (!secret || secret.length < 32) {
      return {
        delivered: false,
        error: `Webhook secret ${channel.secretEnvName} is missing or too short`,
      };
    }
    const body = JSON.stringify(delivery.payload);
    const timestamp = new Date().toISOString();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImplementation(channel.endpointUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Nexus-Delivery": delivery.id,
          "X-Nexus-Event": delivery.event,
          "X-Nexus-Timestamp": timestamp,
          "X-Nexus-Signature": signWebhookPayload(
            body,
            timestamp,
            secret,
          ),
        },
        body,
        signal: controller.signal,
      });
      return response.ok
        ? {
            delivered: true,
            responseStatus: response.status,
          }
        : {
            delivered: false,
            responseStatus: response.status,
            error: `Webhook returned HTTP ${response.status}`,
          };
    } catch (error) {
      return {
        delivered: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
