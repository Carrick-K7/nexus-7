import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import OperationsCenter from "@/components/operations/OperationsCenter";
import type {
  OperationsOverview,
} from "@/operations";
import type {
  WorkspaceAccessOverview,
} from "@/governance";

const operations: OperationsOverview = {
  generatedAt: "2026-07-18T08:00:00.000Z",
  retention: {
    rawDays: 90,
    cutoff: "2026-04-19T08:00:00.000Z",
  },
  samples: [
    {
      id: "sample-1",
      organizationId: "organization-nexus-7",
      workspaceId: "workspace-neo-angeles",
      source: "deployment",
      metric: "error-rate-percent",
      value: 4,
      unit: "percent",
      status: "breaching",
      dimensions: {
        environment: "production",
        artifact: "nexus@abc",
      },
      observedAt: "2026-07-18T08:00:00.000Z",
      ingestedAt: "2026-07-18T08:00:00.000Z",
      ingestedBy: "worker",
    },
  ],
  series: [],
  rules: [],
  incidents: [
    {
      id: "incident-1",
      organizationId: "organization-nexus-7",
      workspaceId: "workspace-neo-angeles",
      ruleId: "rule-1",
      code: "deployment.error-rate",
      severity: "critical",
      status: "open",
      summary: "Deployment error rate exceeded",
      source: "deployment",
      metric: "error-rate-percent",
      dedupeKey: "dedupe",
      dimensions: { environment: "production" },
      occurrenceCount: 1,
      latestSampleId: "sample-1",
      latestValue: 4,
      threshold: 1,
      firstObservedAt: "2026-07-18T08:00:00.000Z",
      lastObservedAt: "2026-07-18T08:00:00.000Z",
      revision: 1,
      createdAt: "2026-07-18T08:00:00.000Z",
      updatedAt: "2026-07-18T08:00:00.000Z",
    },
  ],
  occurrences: [],
  channels: [],
  deliveries: [],
  maintenanceWindows: [],
  suppressions: [],
  escalationPolicies: [],
  receipts: [],
  summary: {
    openIncidents: 1,
    criticalIncidents: 1,
    breachingSamples: 1,
    pendingDeliveries: 0,
    deadLetters: 0,
    activeSuppressions: 0,
    scheduledMaintenance: 0,
  },
};

const access: WorkspaceAccessOverview = {
  organization: {
    id: "organization-nexus-7",
    name: "NEXUS-7 Autonomy Lab",
    createdAt: "2026-07-18T08:00:00.000Z",
    updatedAt: "2026-07-18T08:00:00.000Z",
  },
  workspace: {
    organizationId: "organization-nexus-7",
    workspaceId: "workspace-neo-angeles",
    createdAt: "2026-07-18T08:00:00.000Z",
    updatedAt: "2026-07-18T08:00:00.000Z",
  },
  memberships: [],
  serviceAccounts: [],
  delegations: [],
  accessReviewCampaigns: [],
  accessReviewItems: [],
  breakGlassRequests: [],
  riskReport: {
    orphanedServiceAccountIds: [],
    expiredServiceAccountIds: [],
    credentialsDueForRotationIds: [],
    overdueAccessReviewItemIds: [],
    breakGlassReviewRequiredIds: [],
  },
  audit: [],
};

function response(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OperationsCenter", () => {
  it("renders operational evidence and sends incident actions through the API", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === "POST") {
          return response({ status: "acknowledged" });
        }
        return url.endsWith("/api/operations")
          ? response(operations)
          : response(access);
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<OperationsCenter />);

    expect(
      await screen.findByRole("heading", {
        name: "OPERATIONS CENTER",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Deployment error rate exceeded")).toBeVisible();
    expect(screen.getByText("NEXUS-7 Autonomy Lab · workspace-neo-angeles"))
      .toBeVisible();
    expect(screen.getByLabelText("Telemetry source")).toHaveValue(
      "deployment",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Acknowledge" }),
    );
    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([, init]) => init?.method === "POST",
      );
      expect(post).toBeDefined();
      expect(JSON.parse(String(post?.[1]?.body))).toEqual({
        action: "acknowledge-incident",
        incidentId: "incident-1",
      });
    });
  });
});
