import {
  actorPrincipalType,
  actorWorkspaceId,
  assertActorPermission,
} from "@/experiments/authorization";
import {
  ExperimentConflictError,
  ExperimentNotFoundError,
  ExperimentPermissionError,
  ExperimentValidationError,
} from "@/experiments/errors";
import type {
  ExperimentRepository,
} from "@/experiments/repository";
import type {
  ExperimentActor,
} from "@/experiments/types";
import {
  LIFECYCLE_EVENT_SCHEMA_VERSION,
  type LifecycleRecord,
  type NewLifecycleEvent,
} from "@/lifecycle";
import {
  DEFAULT_SCENARIO,
} from "@/simulation/scenarios";
import {
  getMetric,
} from "@/simulation/core/metrics";
import {
  CITY_METRIC_DICTIONARY,
  projectCoherentCitySnapshot,
} from "./ontology";
import {
  PUBLIC_CITY_SCENARIOS,
  evaluateCityScenarioDetection,
  materializeCityScenario,
  verifyCityScenarioCatalog,
  type CityScenarioTruth,
} from "./scenarios";
import {
  CITY_GUARDRAIL_SCHEMA_VERSION,
  CITY_INCIDENT_SCHEMA_VERSION,
  CITY_OBJECTIVE_SCHEMA_VERSION,
  type CityGuardrail,
  type CityIncident,
  type CityIncidentImpact,
  type CityIncidentStatus,
  type CityModelOverview,
  type CityObjective,
  type CreateCityGuardrailInput,
  type CreateCityObjectiveInput,
} from "./model-types";
import type {
  CityMetricCode,
} from "./types";

export const CITY_RECORD_KINDS = {
  objective: "city-objective",
  guardrail: "city-guardrail",
  incident: "city-incident",
  scenarioTruth: "city-scenario-truth",
} as const;

interface CityModelServiceOptions {
  now?: () => Date;
  id?: () => string;
}

const DEFAULT_OBJECTIVES: ReadonlyArray<
  Omit<CityObjective, "effectiveAt">
> = [
  {
    schemaVersion: CITY_OBJECTIVE_SCHEMA_VERSION,
    id: "objective-essential-services",
    name: "Maintain essential service access",
    metric: "public-service-access",
    direction: "increase",
    target: 80,
    weight: 1,
    owner: "human:civic-operations",
    scope: "city",
    version: "city-objectives-1.0.0",
    status: "active",
    synthetic: true,
  },
  {
    schemaVersion: CITY_OBJECTIVE_SCHEMA_VERSION,
    id: "objective-public-safety",
    name: "Reduce public safety burden",
    metric: "crime",
    direction: "decrease",
    target: 35,
    weight: 0.95,
    owner: "human:public-safety",
    scope: "city",
    version: "city-objectives-1.0.0",
    status: "active",
    synthetic: true,
  },
  {
    schemaVersion: CITY_OBJECTIVE_SCHEMA_VERSION,
    id: "objective-budget-health",
    name: "Preserve public budget capacity",
    metric: "budget-health",
    direction: "increase",
    target: 65,
    weight: 0.65,
    owner: "human:finance",
    scope: "city",
    version: "city-objectives-1.0.0",
    status: "active",
    synthetic: true,
  },
  {
    schemaVersion: CITY_OBJECTIVE_SCHEMA_VERSION,
    id: "objective-employment",
    name: "Support synthetic employment access",
    metric: "employment",
    direction: "increase",
    target: 72,
    weight: 0.75,
    owner: "human:economic-policy",
    scope: "city",
    version: "city-objectives-1.0.0",
    status: "active",
    synthetic: true,
  },
  {
    schemaVersion: CITY_OBJECTIVE_SCHEMA_VERSION,
    id: "objective-housing-affordability",
    name: "Reduce housing cost burden",
    metric: "housing-cost-burden",
    direction: "decrease",
    target: 45,
    weight: 0.85,
    owner: "human:housing",
    scope: "city",
    version: "city-objectives-1.0.0",
    status: "active",
    synthetic: true,
  },
  {
    schemaVersion: CITY_OBJECTIVE_SCHEMA_VERSION,
    id: "objective-climate-resilience",
    name: "Increase climate resilience",
    metric: "climate-resilience",
    direction: "increase",
    target: 75,
    weight: 0.8,
    owner: "human:environment",
    scope: "city",
    version: "city-objectives-1.0.0",
    status: "active",
    synthetic: true,
  },
  {
    schemaVersion: CITY_OBJECTIVE_SCHEMA_VERSION,
    id: "objective-energy-continuity",
    name: "Maintain energy continuity",
    metric: "energy",
    direction: "increase",
    target: 82,
    weight: 0.9,
    owner: "human:infrastructure",
    scope: "city",
    version: "city-objectives-1.0.0",
    status: "active",
    synthetic: true,
  },
  {
    schemaVersion: CITY_OBJECTIVE_SCHEMA_VERSION,
    id: "objective-network-continuity",
    name: "Maintain digital network continuity",
    metric: "network-continuity",
    direction: "increase",
    target: 92,
    weight: 0.85,
    owner: "human:digital-services",
    scope: "city",
    version: "city-objectives-1.0.0",
    status: "active",
    synthetic: true,
  },
  {
    schemaVersion: CITY_OBJECTIVE_SCHEMA_VERSION,
    id: "objective-civil-service-access",
    name: "Protect vulnerable service access",
    metric: "vulnerable-service-access",
    direction: "increase",
    target: 68,
    weight: 1,
    owner: "human:public-interest",
    scope: "city",
    version: "city-objectives-1.0.0",
    status: "active",
    synthetic: true,
  },
];

const DEFAULT_GUARDRAILS: ReadonlyArray<
  Omit<CityGuardrail, "effectiveAt">
> = [
  {
    schemaVersion: CITY_GUARDRAIL_SCHEMA_VERSION,
    id: "guardrail-essential-energy",
    name: "Essential energy floor",
    metric: "energy",
    comparison: "minimum",
    threshold: 25,
    groupIds: [],
    severity: "critical",
    breachAction: "rollback",
    owner: "human:infrastructure",
    version: "city-guardrails-1.0.0",
    status: "active",
    synthetic: true,
  },
  {
    schemaVersion: CITY_GUARDRAIL_SCHEMA_VERSION,
    id: "guardrail-medical-access",
    name: "Medical capacity floor",
    metric: "medical",
    comparison: "minimum",
    threshold: 35,
    groupIds: [],
    severity: "critical",
    breachAction: "rollback",
    owner: "human:health",
    version: "city-guardrails-1.0.0",
    status: "active",
    synthetic: true,
  },
  {
    schemaVersion: CITY_GUARDRAIL_SCHEMA_VERSION,
    id: "guardrail-public-safety",
    name: "Severe public safety ceiling",
    metric: "crime",
    comparison: "maximum",
    threshold: 85,
    groupIds: [],
    severity: "critical",
    breachAction: "pause",
    owner: "human:public-safety",
    version: "city-guardrails-1.0.0",
    status: "active",
    synthetic: true,
  },
  {
    schemaVersion: CITY_GUARDRAIL_SCHEMA_VERSION,
    id: "guardrail-vulnerable-access",
    name: "Vulnerable group service floor",
    metric: "vulnerable-service-access",
    comparison: "minimum",
    threshold: 40,
    groupIds: [
      "synthetic-industrial-workers",
      "synthetic-service-limited",
    ],
    severity: "critical",
    breachAction: "rollback",
    owner: "human:public-interest",
    version: "city-guardrails-1.0.0",
    status: "active",
    synthetic: true,
  },
  {
    schemaVersion: CITY_GUARDRAIL_SCHEMA_VERSION,
    id: "guardrail-budget",
    name: "Budget health review floor",
    metric: "budget-health",
    comparison: "minimum",
    threshold: 30,
    groupIds: [],
    severity: "warning",
    breachAction: "human-review",
    owner: "human:finance",
    version: "city-guardrails-1.0.0",
    status: "active",
    synthetic: true,
  },
];

const ASSIGNED_AGENTS: Record<
  CityScenarioTruth["family"],
  CityIncident["assignedAgents"]
> = {
  infrastructure: ["civitas", "economica"],
  economic: ["economica", "civitas"],
  "public-safety": ["atlas", "civitas"],
  environment: ["civitas", "economica"],
  "digital-network": ["spectre", "atlas"],
};

function requiredText(
  value: string,
  field: string,
  maximum = 300,
): string {
  const normalized = value.trim().slice(0, maximum);
  if (!normalized) {
    throw new ExperimentValidationError(`${field} is required`);
  }
  return normalized;
}

function finite(
  value: number,
  field: string,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new ExperimentValidationError(
      `${field} must be between ${minimum} and ${maximum}`,
    );
  }
  return value;
}

function recordData<T>(
  record: LifecycleRecord,
): T {
  return record.data as unknown as T;
}

export class CityModelService {
  private readonly now: () => Date;
  private readonly id: () => string;
  private initialized = false;
  private scenarioVerification?: ReturnType<
    typeof verifyCityScenarioCatalog
  >;

  constructor(
    private readonly repository: ExperimentRepository,
    options: CityModelServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.id = options.id ?? (() => crypto.randomUUID());
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    const workspace = await this.repository.getGovernedWorkspace(
      "workspace-neo-angeles",
    );
    if (!workspace) {
      throw new ExperimentNotFoundError(
        "City model requires initialized workspace governance",
      );
    }
    const timestamp = this.now().toISOString();
    for (const objective of DEFAULT_OBJECTIVES) {
      await this.ensureRecord(
        CITY_RECORD_KINDS.objective,
        objective.id,
        objective.status,
        { ...objective, effectiveAt: timestamp },
        "city-objective.registered",
        workspace.organizationId,
        workspace.workspaceId,
      );
    }
    for (const guardrail of DEFAULT_GUARDRAILS) {
      await this.ensureRecord(
        CITY_RECORD_KINDS.guardrail,
        guardrail.id,
        guardrail.status,
        { ...guardrail, effectiveAt: timestamp },
        "city-guardrail.registered",
        workspace.organizationId,
        workspace.workspaceId,
      );
    }
    for (const truth of PUBLIC_CITY_SCENARIOS) {
      await this.ensureRecord(
        CITY_RECORD_KINDS.scenarioTruth,
        `scenario-truth-${truth.id}`,
        "active",
        { ...truth },
        "city-scenario-truth.registered",
        workspace.organizationId,
        workspace.workspaceId,
      );
    }
    this.scenarioVerification = verifyCityScenarioCatalog(60);
    this.initialized = true;
  }

  async overview(
    actor: ExperimentActor,
    world = DEFAULT_SCENARIO.world,
  ): Promise<CityModelOverview> {
    assertActorPermission(actor, "workspace:read");
    await this.initialize();
    const workspaceId = actorWorkspaceId(actor);
    const [
      objectives,
      guardrails,
      incidents,
      scenarioTruth,
      events,
    ] = await Promise.all([
      this.listTyped<CityObjective>(
        workspaceId,
        CITY_RECORD_KINDS.objective,
      ),
      this.listTyped<CityGuardrail>(
        workspaceId,
        CITY_RECORD_KINDS.guardrail,
      ),
      this.listTyped<CityIncident>(
        workspaceId,
        CITY_RECORD_KINDS.incident,
      ),
      this.listTyped<CityScenarioTruth>(
        workspaceId,
        CITY_RECORD_KINDS.scenarioTruth,
      ),
      this.repository.listLifecycleEvents(workspaceId, {
        aggregateKind: CITY_RECORD_KINDS.incident,
        limit: 200,
      }),
    ]);
    return {
      schemaVersion: "nexus.city-model-overview.v1",
      generatedAt: this.now().toISOString(),
      ontology: {
        version: "nexus.city-ontology.v1",
        metrics: CITY_METRIC_DICTIONARY,
      },
      snapshot: projectCoherentCitySnapshot(world),
      objectives,
      guardrails,
      incidents,
      scenarioTruth,
      scenarioVerification:
        this.scenarioVerification ?? verifyCityScenarioCatalog(60),
      events,
      syntheticBoundary:
        "All residents, groups, incidents, objectives and outcomes are synthetic lab constructs, not claims about real people or policy effects.",
    };
  }

  async injectScenario(
    scenarioId: string,
    actor: ExperimentActor,
  ): Promise<CityIncident | null> {
    assertActorPermission(actor, "runs:write");
    await this.initialize();
    const truth = PUBLIC_CITY_SCENARIOS.find(
      (scenario) => scenario.id === scenarioId,
    );
    if (!truth) {
      throw new ExperimentNotFoundError(
        `City scenario ${scenarioId} was not found`,
      );
    }
    if (!truth.expectedIncident) {
      return null;
    }
    const workspaceId = actorWorkspaceId(actor);
    const workspace =
      await this.repository.getGovernedWorkspace(workspaceId);
    if (!workspace) {
      throw new ExperimentNotFoundError(
        `Workspace governance for ${workspaceId} was not found`,
      );
    }
    const id = `city-incident-${truth.id}`;
    const existing = await this.repository.getLifecycleRecord(id);
    if (existing) {
      if (existing.workspaceId !== workspaceId) {
        throw new ExperimentNotFoundError(
          `City incident ${id} was not found`,
        );
      }
      return recordData<CityIncident>(existing);
    }
    const scenario = materializeCityScenario(truth);
    const snapshot = projectCoherentCitySnapshot(scenario.world);
    const detection = evaluateCityScenarioDetection(truth);
    if (!detection.detected) {
      return null;
    }
    const impact = this.calculateImpact(truth, snapshot);
    const timestamp = this.now().toISOString();
    const incident: CityIncident = {
      schemaVersion: CITY_INCIDENT_SCHEMA_VERSION,
      id,
      scenarioTruthId: truth.id,
      correlationId: `corr-${id}`,
      causationId: `scenario-truth-${truth.id}`,
      status: "detected",
      severity:
        impact.severityScore >= 75
          ? "critical"
          : impact.severityScore >= 55
            ? "high"
            : impact.severityScore >= 30
              ? "moderate"
              : "low",
      summary: `${truth.title}: ${detection.matchedSymptoms.length} observable symptom(s) crossed declared thresholds`,
      family: truth.family,
      detectedAt: timestamp,
      detectionTick: detection.detectionDelayTicks ?? 0,
      evidence: detection.matchedSymptoms.map((symptom) => ({
        metric: symptom.metric,
        value: getMetric(scenario.world, symptom.metric),
        threshold: symptom.threshold,
        comparison: symptom.comparison,
        sourceWorldFingerprint: snapshot.sourceWorldFingerprint,
      })),
      impact,
      hiddenTruth: truth.hiddenRootCause,
      assignedAgents: ASSIGNED_AGENTS[truth.family],
      objectiveVersion: "city-objectives-1.0.0",
      guardrailVersion: "city-guardrails-1.0.0",
      synthetic: true,
    };
    await this.repository.createLifecycleRecord({
      record: {
        id,
        organizationId: workspace.organizationId,
        workspaceId,
        kind: CITY_RECORD_KINDS.incident,
        status: incident.status,
        revision: 1,
        data: { ...incident },
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      event: this.event(
        id,
        CITY_RECORD_KINDS.incident,
        "city-incident.detected",
        actor,
        workspace.organizationId,
        {
          scenarioTruthId: truth.id,
          severity: incident.severity,
          evidence: incident.evidence,
          impact: incident.impact,
        },
        incident.correlationId,
        incident.causationId,
      ),
    });
    return incident;
  }

  async transitionIncident(
    incidentId: string,
    status: CityIncidentStatus,
    note: string,
    actor: ExperimentActor,
  ): Promise<CityIncident> {
    assertActorPermission(actor, "runs:write");
    if (actorPrincipalType(actor) !== "human") {
      throw new ExperimentPermissionError(
        "City incidents require human triage and resolution",
      );
    }
    const currentRecord =
      await this.repository.getLifecycleRecord(incidentId);
    if (
      !currentRecord ||
      currentRecord.workspaceId !== actorWorkspaceId(actor) ||
      currentRecord.kind !== CITY_RECORD_KINDS.incident
    ) {
      throw new ExperimentNotFoundError(
        `City incident ${incidentId} was not found`,
      );
    }
    const current = recordData<CityIncident>(currentRecord);
    const allowed: Record<CityIncidentStatus, CityIncidentStatus[]> = {
      detected: ["triaged"],
      triaged: ["investigating", "resolved"],
      investigating: ["resolved"],
      resolved: ["detected"],
    };
    if (!allowed[current.status].includes(status)) {
      throw new ExperimentConflictError(
        `City incident cannot transition from ${current.status} to ${status}`,
      );
    }
    const timestamp = this.now().toISOString();
    const next: CityIncident = {
      ...current,
      status,
      resolvedAt: status === "resolved" ? timestamp : undefined,
      resolution:
        status === "resolved"
          ? requiredText(note, "resolution", 1_000)
          : undefined,
    };
    await this.repository.commitLifecycleRecord({
      record: {
        ...currentRecord,
        status,
        revision: currentRecord.revision + 1,
        data: { ...next },
        updatedAt: timestamp,
      },
      expectedRevision: currentRecord.revision,
      event: this.event(
        incidentId,
        CITY_RECORD_KINDS.incident,
        status === "detected"
          ? "city-incident.reopened"
          : `city-incident.${status}`,
        actor,
        currentRecord.organizationId,
        { from: current.status, to: status, note: requiredText(note, "note") },
        current.correlationId,
        currentRecord.id,
      ),
    });
    return next;
  }

  async createObjective(
    input: CreateCityObjectiveInput,
    actor: ExperimentActor,
  ): Promise<CityObjective> {
    assertActorPermission(actor, "policy:manage");
    this.assertHuman(actor);
    await this.initialize();
    const metric = this.requireMetric(input.metric);
    const workspace =
      await this.requireWorkspace(actorWorkspaceId(actor));
    const timestamp = this.now().toISOString();
    const objective: CityObjective = {
      schemaVersion: CITY_OBJECTIVE_SCHEMA_VERSION,
      id: `city-objective-${this.id()}`,
      name: requiredText(input.name, "name"),
      metric,
      direction: input.direction,
      target: finite(
        input.target,
        "target",
        CITY_METRIC_DICTIONARY.find(
          (definition) => definition.code === metric,
        )!.minimum,
        CITY_METRIC_DICTIONARY.find(
          (definition) => definition.code === metric,
        )!.maximum,
      ),
      weight: finite(input.weight, "weight", 0, 1),
      owner: requiredText(input.owner, "owner"),
      scope: input.scope ?? "city",
      version: `city-objectives-${timestamp}`,
      effectiveAt: timestamp,
      deadlineAt: input.deadlineAt
        ? new Date(input.deadlineAt).toISOString()
        : undefined,
      status: "active",
      synthetic: true,
    };
    await this.createTypedRecord(
      objective.id,
      CITY_RECORD_KINDS.objective,
      objective.status,
      objective,
      "city-objective.registered",
      actor,
      workspace.organizationId,
    );
    return objective;
  }

  async createGuardrail(
    input: CreateCityGuardrailInput,
    actor: ExperimentActor,
  ): Promise<CityGuardrail> {
    assertActorPermission(actor, "policy:manage");
    this.assertHuman(actor);
    await this.initialize();
    const metric = this.requireMetric(input.metric);
    const workspace =
      await this.requireWorkspace(actorWorkspaceId(actor));
    const definition = CITY_METRIC_DICTIONARY.find(
      (candidate) => candidate.code === metric,
    )!;
    const timestamp = this.now().toISOString();
    const guardrail: CityGuardrail = {
      schemaVersion: CITY_GUARDRAIL_SCHEMA_VERSION,
      id: `city-guardrail-${this.id()}`,
      name: requiredText(input.name, "name"),
      metric,
      comparison: input.comparison,
      threshold: finite(
        input.threshold,
        "threshold",
        definition.minimum,
        definition.maximum,
      ),
      groupIds: [...new Set(input.groupIds ?? [])].map((groupId) =>
        requiredText(groupId, "groupId", 120),
      ),
      severity: input.severity,
      breachAction: input.breachAction,
      owner: requiredText(input.owner, "owner"),
      version: `city-guardrails-${timestamp}`,
      effectiveAt: timestamp,
      status: "active",
      synthetic: true,
    };
    await this.createTypedRecord(
      guardrail.id,
      CITY_RECORD_KINDS.guardrail,
      guardrail.status,
      guardrail,
      "city-guardrail.registered",
      actor,
      workspace.organizationId,
    );
    return guardrail;
  }

  private calculateImpact(
    truth: CityScenarioTruth,
    snapshot: ReturnType<typeof projectCoherentCitySnapshot>,
  ): CityIncidentImpact {
    const groups = snapshot.stakeholderImpacts.filter((impact) =>
      truth.affectedGroupIds.includes(impact.groupId),
    );
    const populationSharePercent = groups.reduce(
      (sum, impact) => sum + impact.populationSharePercent,
      0,
    );
    const vulnerableGroupCount = groups.filter(
      (impact) => impact.vulnerability !== "standard",
    ).length;
    const severityScore = Math.min(
      100,
      populationSharePercent * 0.55 +
        Math.min(25, truth.durationTicks / 5) +
        vulnerableGroupCount * 8 +
        truth.irreversibility * 25,
    );
    return {
      affectedGroupIds: structuredClone(truth.affectedGroupIds),
      populationSharePercent,
      vulnerableGroupCount,
      durationTicks: truth.durationTicks,
      irreversibility: truth.irreversibility,
      severityScore: Math.round(severityScore * 100) / 100,
    };
  }

  private async ensureRecord(
    kind: string,
    id: string,
    status: string,
    data: Record<string, unknown>,
    eventType: string,
    organizationId: string,
    workspaceId: string,
  ): Promise<void> {
    if (await this.repository.getLifecycleRecord(id)) {
      return;
    }
    const timestamp = this.now().toISOString();
    const actor: ExperimentActor = {
      id: "system:city-model-bootstrap",
      role: "admin",
      workspaceId,
      principalType: "system",
      authSource: "system",
    };
    try {
      await this.repository.createLifecycleRecord({
        record: {
          id,
          organizationId,
          workspaceId,
          kind,
          status,
          revision: 1,
          data,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        event: this.event(
          id,
          kind,
          eventType,
          actor,
          organizationId,
          { bootstrap: true },
          `corr-bootstrap-${id}`,
        ),
      });
    } catch (error) {
      if (!(error instanceof ExperimentConflictError)) {
        throw error;
      }
    }
  }

  private async createTypedRecord<T extends object>(
    id: string,
    kind: string,
    status: string,
    data: T,
    eventType: string,
    actor: ExperimentActor,
    organizationId: string,
  ): Promise<void> {
    const timestamp = this.now().toISOString();
    await this.repository.createLifecycleRecord({
      record: {
        id,
        organizationId,
        workspaceId: actorWorkspaceId(actor),
        kind,
        status,
        revision: 1,
        data: { ...data } as Record<string, unknown>,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      event: this.event(
        id,
        kind,
        eventType,
        actor,
        organizationId,
        { data: { ...data } },
        `corr-${id}`,
      ),
    });
  }

  private event(
    aggregateId: string,
    aggregateKind: string,
    type: string,
    actor: ExperimentActor,
    organizationId: string,
    payload: Record<string, unknown>,
    correlationId: string,
    causationId?: string,
  ): NewLifecycleEvent {
    return {
      id: `lifecycle-event-${this.id()}`,
      organizationId,
      workspaceId: actorWorkspaceId(actor),
      aggregateId,
      aggregateKind,
      type,
      actorId: actor.id,
      correlationId,
      causationId,
      occurredAt: this.now().toISOString(),
      schemaVersion: LIFECYCLE_EVENT_SCHEMA_VERSION,
      payload,
    };
  }

  private async listTyped<T>(
    workspaceId: string,
    kind: string,
  ): Promise<T[]> {
    return (
      await this.repository.listLifecycleRecords(workspaceId, {
        kind,
        limit: 1_000,
      })
    ).map(recordData<T>);
  }

  private requireMetric(metric: CityMetricCode): CityMetricCode {
    if (
      !CITY_METRIC_DICTIONARY.some(
        (definition) => definition.code === metric,
      )
    ) {
      throw new ExperimentValidationError(
        `Unknown city metric ${metric}`,
      );
    }
    return metric;
  }

  private async requireWorkspace(workspaceId: string) {
    const workspace =
      await this.repository.getGovernedWorkspace(workspaceId);
    if (!workspace) {
      throw new ExperimentNotFoundError(
        `Workspace governance for ${workspaceId} was not found`,
      );
    }
    return workspace;
  }

  private assertHuman(actor: ExperimentActor): void {
    if (actorPrincipalType(actor) !== "human") {
      throw new ExperimentPermissionError(
        "Only a human policy owner may change city objectives or guardrails",
      );
    }
  }
}
