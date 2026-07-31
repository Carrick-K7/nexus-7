import {
  NextResponse,
} from "next/server";
import {
  ExperimentValidationError,
} from "@/experiments";
import {
  actorFromRequest,
  experimentErrorResponse,
  readJsonObject,
} from "@/experiments/http";
import {
  getOperationalIntelligenceService,
} from "@/operations/intelligence-server";
import {
  collectCurrentOperationalTelemetry,
} from "@/operations/telemetry-server";
import type {
  AlertComparison,
  AlertSeverity,
  NotificationEvent,
  OperationalSource,
  SloMetricUnit,
  SloSampleStatus,
} from "@/operations/intelligence-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCES: OperationalSource[] = [
  "model",
  "deployment",
  "recovery",
  "worker",
  "evidence",
  "policy",
];
const UNITS: SloMetricUnit[] = [
  "milliseconds",
  "percent",
  "count",
  "hours",
  "usd",
  "boolean",
];
const SAMPLE_STATUSES: SloSampleStatus[] = [
  "healthy",
  "warning",
  "breaching",
  "missing",
];
const COMPARISONS: AlertComparison[] = [
  "greater-than",
  "greater-than-or-equal",
  "less-than",
  "less-than-or-equal",
  "equal",
];
const SEVERITIES: AlertSeverity[] = ["info", "warning", "critical"];
const NOTIFICATION_EVENTS: NotificationEvent[] = [
  "incident.opened",
  "incident.reopened",
  "incident.acknowledged",
  "incident.resolved",
];

function requiredString(
  body: Record<string, unknown>,
  field: string,
): string {
  const value = body[field];
  if (typeof value !== "string" || !value.trim()) {
    throw new ExperimentValidationError(`${field} is required`);
  }
  return value;
}

function finiteNumber(
  body: Record<string, unknown>,
  field: string,
): number {
  const value = Number(body[field]);
  if (!Number.isFinite(value)) {
    throw new ExperimentValidationError(`${field} must be finite`);
  }
  return value;
}

function enumValue<T extends string>(
  body: Record<string, unknown>,
  field: string,
  values: readonly T[],
): T {
  const value = body[field];
  if (typeof value !== "string" || !values.includes(value as T)) {
    throw new ExperimentValidationError(`${field} is invalid`);
  }
  return value as T;
}

function stringRecord(value: unknown): Record<string, string> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.values(value).some((entry) => typeof entry !== "string")
  ) {
    throw new ExperimentValidationError(
      "dimensions must be a string-to-string object",
    );
  }
  return value as Record<string, string>;
}

function stringArray(
  value: unknown,
  field: string,
): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string")
  ) {
    throw new ExperimentValidationError(`${field} must be a string array`);
  }
  return value;
}

function optionalString(
  body: Record<string, unknown>,
  field: string,
): string | undefined {
  const value = body[field];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || !value.trim()) {
    throw new ExperimentValidationError(
      `${field} must be a non-empty string`,
    );
  }
  return value;
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await actorFromRequest(request);
    const overview = await (
      await getOperationalIntelligenceService()
    ).overview(actor);
    return NextResponse.json({
      ...overview,
      channels: overview.channels.map((channel) => ({
        ...channel,
        secretEnvName: undefined,
        secretConfigured: Boolean(process.env[channel.secretEnvName]),
      })),
    });
  } catch (error) {
    return experimentErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await readJsonObject(request);
    const actor = await actorFromRequest(request);
    const service = await getOperationalIntelligenceService();
    if (body.action === "record-sample") {
      const status =
        body.status === undefined
          ? undefined
          : enumValue(body, "status", SAMPLE_STATUSES);
      return NextResponse.json(
        await service.recordSample(
          {
            source: enumValue(body, "source", SOURCES),
            metric: requiredString(body, "metric"),
            value: finiteNumber(body, "value"),
            unit: enumValue(body, "unit", UNITS),
            status,
            dimensions: stringRecord(body.dimensions),
            evidenceId:
              typeof body.evidenceId === "string"
                ? body.evidenceId
                : undefined,
            observedAt:
              typeof body.observedAt === "string"
                ? body.observedAt
                : undefined,
          },
          actor,
        ),
        { status: 201 },
      );
    }
    if (body.action === "create-rule") {
      return NextResponse.json(
        await service.createRule(
          {
            code: requiredString(body, "code"),
            name: requiredString(body, "name"),
            source: enumValue(body, "source", SOURCES),
            metric: requiredString(body, "metric"),
            comparison: enumValue(body, "comparison", COMPARISONS),
            threshold: finiteNumber(body, "threshold"),
            severity: enumValue(body, "severity", SEVERITIES),
            groupBy: stringArray(body.groupBy, "groupBy"),
            autoResolve:
              typeof body.autoResolve === "boolean"
                ? body.autoResolve
                : undefined,
            occurrenceBudget:
              typeof body.occurrenceBudget === "object" &&
              body.occurrenceBudget !== null &&
              !Array.isArray(body.occurrenceBudget)
                ? {
                    maximum: finiteNumber(
                      body.occurrenceBudget as Record<string, unknown>,
                      "maximum",
                    ),
                    windowMinutes: finiteNumber(
                      body.occurrenceBudget as Record<string, unknown>,
                      "windowMinutes",
                    ),
                  }
                : undefined,
            escalationPolicyId: optionalString(
              body,
              "escalationPolicyId",
            ),
            notificationChannelIds: stringArray(
              body.notificationChannelIds,
              "notificationChannelIds",
            ),
          },
          actor,
        ),
        { status: 201 },
      );
    }
    if (body.action === "create-channel") {
      const events = stringArray(body.events, "events");
      const severities = stringArray(body.severities, "severities");
      if (
        events?.some(
          (event) =>
            !NOTIFICATION_EVENTS.includes(event as NotificationEvent),
        )
      ) {
        throw new ExperimentValidationError(
          "events contains an invalid notification event",
        );
      }
      if (
        severities?.some(
          (severity) =>
            !SEVERITIES.includes(severity as AlertSeverity),
        )
      ) {
        throw new ExperimentValidationError(
          "severities contains an invalid alert severity",
        );
      }
      return NextResponse.json(
        await service.createChannel(
          {
            name: requiredString(body, "name"),
            endpointUrl: requiredString(body, "endpointUrl"),
            secretEnvName: requiredString(body, "secretEnvName"),
            events: events as NotificationEvent[] | undefined,
            severities: severities as AlertSeverity[] | undefined,
            environments: stringArray(
              body.environments,
              "environments",
            ),
            dryRun:
              typeof body.dryRun === "boolean"
                ? body.dryRun
                : undefined,
          },
          actor,
        ),
        { status: 201 },
      );
    }
    if (body.action === "create-maintenance-window") {
      return NextResponse.json(
        await service.createMaintenanceWindow(
          {
            name: requiredString(body, "name"),
            startsAt: requiredString(body, "startsAt"),
            endsAt: requiredString(body, "endsAt"),
            ruleIds: stringArray(body.ruleIds, "ruleIds"),
            environments: stringArray(
              body.environments,
              "environments",
            ),
            reason: requiredString(body, "reason"),
          },
          actor,
        ),
        { status: 201 },
      );
    }
    if (body.action === "create-suppression") {
      return NextResponse.json(
        await service.createSuppression(
          {
            ruleId: optionalString(body, "ruleId"),
            dedupeKey: optionalString(body, "dedupeKey"),
            dimensions: stringRecord(body.dimensions),
            reason: requiredString(body, "reason"),
            startsAt: optionalString(body, "startsAt"),
            endsAt: requiredString(body, "endsAt"),
          },
          actor,
        ),
        { status: 201 },
      );
    }
    if (body.action === "create-escalation-policy") {
      if (
        !Array.isArray(body.steps) ||
        body.steps.some(
          (step) =>
            typeof step !== "object" ||
            step === null ||
            Array.isArray(step),
        )
      ) {
        throw new ExperimentValidationError(
          "steps must be an array of escalation steps",
        );
      }
      return NextResponse.json(
        await service.createEscalationPolicy(
          {
            name: requiredString(body, "name"),
            minimumSeverity: enumValue(
              body,
              "minimumSeverity",
              SEVERITIES,
            ),
            steps: body.steps.map((entry) => {
              const step = entry as Record<string, unknown>;
              return {
                afterMinutes: finiteNumber(step, "afterMinutes"),
                channelIds:
                  stringArray(step.channelIds, "channelIds") ?? [],
              };
            }),
          },
          actor,
        ),
        { status: 201 },
      );
    }
    if (body.action === "cancel-maintenance-window") {
      return NextResponse.json(
        await service.cancelMaintenanceWindow(
          requiredString(body, "windowId"),
          finiteNumber(body, "expectedRevision"),
          actor,
        ),
      );
    }
    if (body.action === "cancel-suppression") {
      return NextResponse.json(
        await service.cancelSuppression(
          requiredString(body, "suppressionId"),
          finiteNumber(body, "expectedRevision"),
          actor,
        ),
      );
    }
    if (body.action === "record-delivery-receipt") {
      return NextResponse.json(
        await service.recordDeliveryReceipt(
          {
            deliveryId: requiredString(body, "deliveryId"),
            status: enumValue(
              body,
              "status",
              ["accepted", "rejected"] as const,
            ),
            externalId: optionalString(body, "externalId"),
            detail: optionalString(body, "detail"),
          },
          actor,
        ),
        { status: 201 },
      );
    }
    if (body.action === "acknowledge-incident") {
      return NextResponse.json(
        await service.acknowledgeIncident(
          requiredString(body, "incidentId"),
          actor,
        ),
      );
    }
    if (body.action === "resolve-incident") {
      return NextResponse.json(
        await service.resolveIncident(
          requiredString(body, "incidentId"),
          requiredString(body, "resolution"),
          actor,
        ),
      );
    }
    if (body.action === "set-rule-status") {
      return NextResponse.json(
        await service.setRuleStatus(
          requiredString(body, "ruleId"),
          enumValue(body, "status", ["active", "disabled"] as const),
          finiteNumber(body, "expectedRevision"),
          actor,
        ),
      );
    }
    if (body.action === "set-channel-status") {
      return NextResponse.json(
        await service.setChannelStatus(
          requiredString(body, "channelId"),
          enumValue(body, "status", ["active", "disabled"] as const),
          finiteNumber(body, "expectedRevision"),
          actor,
        ),
      );
    }
    if (body.action === "process-deliveries") {
      return NextResponse.json(
        await service.processDueDeliveries(
          actor,
          body.limit === undefined
            ? 50
            : finiteNumber(body, "limit"),
        ),
      );
    }
    if (body.action === "collect-telemetry") {
      return NextResponse.json(
        await collectCurrentOperationalTelemetry(actor),
      );
    }
    throw new ExperimentValidationError("Unknown operations action");
  } catch (error) {
    return experimentErrorResponse(error);
  }
}
