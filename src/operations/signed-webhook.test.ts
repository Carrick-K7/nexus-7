// @vitest-environment node

import {
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type {
  NotificationChannel,
  NotificationDelivery,
} from "./intelligence-types";
import {
  SignedWebhookTransport,
  signWebhookPayload,
  verifyWebhookSignature,
} from "./signed-webhook";

const channel: NotificationChannel = {
  id: "channel-1",
  organizationId: "organization-1",
  workspaceId: "workspace-1",
  name: "Security test",
  kind: "signed-webhook",
  endpointUrl: "https://operations.example.test/events",
  secretEnvName: "NEXUS_WEBHOOK_TEST_SECRET",
  events: ["incident.opened"],
  severities: ["critical"],
  environments: ["production"],
  dryRun: false,
  status: "active",
  revision: 1,
  createdBy: "admin",
  createdAt: "2026-07-18T08:00:00.000Z",
  updatedAt: "2026-07-18T08:00:00.000Z",
};

const delivery: NotificationDelivery = {
  id: "delivery-1",
  organizationId: "organization-1",
  workspaceId: "workspace-1",
  channelId: channel.id,
  incidentId: "incident-1",
  event: "incident.opened",
  idempotencyKey: "idempotency-1",
  payload: { event: "incident.opened", incidentId: "incident-1" },
  payloadSha256: "payload-sha",
  status: "pending",
  attemptCount: 0,
  maximumAttempts: 5,
  nextAttemptAt: "2026-07-18T08:00:00.000Z",
  dryRun: false,
  escalationStep: 0,
  createdAt: "2026-07-18T08:00:00.000Z",
  updatedAt: "2026-07-18T08:00:00.000Z",
};

describe("signed webhook transport", () => {
  it("authenticates the exact timestamp and body and rejects tampering", () => {
    const secret = "s".repeat(32);
    const body = JSON.stringify(delivery.payload);
    const timestamp = "2026-07-18T08:00:00.000Z";
    const signature = signWebhookPayload(body, timestamp, secret);

    expect(
      verifyWebhookSignature(body, timestamp, signature, secret),
    ).toBe(true);
    expect(
      verifyWebhookSignature(
        `${body} `,
        timestamp,
        signature,
        secret,
      ),
    ).toBe(false);
    expect(
      verifyWebhookSignature(
        body,
        "2026-07-18T08:01:00.000Z",
        signature,
        secret,
      ),
    ).toBe(false);
  });

  it("sends stable event identifiers with a verifiable signature", async () => {
    const secret = "v".repeat(32);
    const fetchImplementation = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        const body = String(init?.body);
        expect(headers.get("X-Nexus-Delivery")).toBe(delivery.id);
        expect(headers.get("X-Nexus-Event")).toBe(delivery.event);
        expect(
          verifyWebhookSignature(
            body,
            headers.get("X-Nexus-Timestamp") ?? "",
            headers.get("X-Nexus-Signature") ?? "",
            secret,
          ),
        ).toBe(true);
        expect(JSON.parse(body)).toEqual(delivery.payload);
        return new Response(null, { status: 202 });
      },
    );
    const transport = new SignedWebhookTransport({
      fetchImplementation,
      secretResolver: () => secret,
    });

    await expect(transport.send(channel, delivery)).resolves.toEqual({
      delivered: true,
      responseStatus: 202,
    });
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it("fails closed when the secret is absent without making a request", async () => {
    const fetchImplementation = vi.fn<typeof fetch>();
    const transport = new SignedWebhookTransport({
      fetchImplementation,
      secretResolver: () => undefined,
    });

    await expect(transport.send(channel, delivery)).resolves.toMatchObject({
      delivered: false,
      error:
        "Webhook secret NEXUS_WEBHOOK_TEST_SECRET is missing or too short",
    });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});
