import {
  createHash,
} from "node:crypto";
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
import type {
  LifecycleRecord,
  NewLifecycleEvent,
} from "@/lifecycle";
import {
  LIFECYCLE_EVENT_SCHEMA_VERSION,
} from "@/lifecycle";
import {
  stableStringify,
} from "@/simulation/core/random";
import {
  CITY_RECORD_KINDS,
  CityModelService,
} from "@/city/model-service";
import type {
  CityIncident,
} from "@/city/model-types";
import {
  PUBLIC_CITY_SCENARIOS,
} from "@/city/scenarios";
import {
  assessDiagnosticTrust,
  buildCausalDiagnosis,
  buildDiagnosticCalibration,
  MINIMUM_EXPERIMENT_CONFIDENCE,
} from "./engine";
import type {
  CausalDiagnosis,
  DiagnosisOverview,
  DiagnosticCalibrationReport,
  DiagnosticEvidence,
  DiagnosticTrustAssessment,
} from "./types";

export const DIAGNOSIS_RECORD_KINDS = {
  diagnosis: "causal-diagnosis",
  calibration: "diagnostic-calibration",
  trust: "diagnostic-trust",
} as const;

interface DiagnosisServiceOptions {
  now?: () => Date;
  id?: () => string;
}

function data<T>(record: LifecycleRecord): T {
  return record.data as unknown as T;
}

function requiredText(
  value: string,
  field: string,
  maximum = 1_000,
): string {
  const normalized = value.trim().slice(0, maximum);
  if (!normalized) {
    throw new ExperimentValidationError(`${field} is required`);
  }
  return normalized;
}

function bounded(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new ExperimentValidationError(
      `${field} must be between 0 and 1`,
    );
  }
  return value;
}

function fingerprintDiagnosis(
  diagnosis: CausalDiagnosis,
): string {
  const content = Object.fromEntries(
    Object.entries(diagnosis).filter(
      ([key]) => key !== "fingerprint",
    ),
  );
  return createHash("sha256")
    .update(stableStringify(content), "utf8")
    .digest("hex");
}

export class DiagnosisService {
  private readonly now: () => Date;
  private readonly id: () => string;
  private initialized = false;

  constructor(
    private readonly repository: ExperimentRepository,
    private readonly city: CityModelService,
    options: DiagnosisServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.id = options.id ?? (() => crypto.randomUUID());
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    await this.city.initialize();
    const workspace =
      await this.repository.getGovernedWorkspace(
        "workspace-neo-angeles",
      );
    if (!workspace) {
      throw new ExperimentNotFoundError(
        "Diagnosis requires initialized workspace governance",
      );
    }
    const timestamp = this.now().toISOString();
    const calibration = buildDiagnosticCalibration(timestamp);
    const trust = assessDiagnosticTrust({
      assessedAt: timestamp,
      calibrationPassed: calibration.passed,
    });
    await this.ensureRecord(
      DIAGNOSIS_RECORD_KINDS.calibration,
      "diagnostic-calibration-reference-v1",
      calibration.passed ? "passed" : "failed",
      calibration,
      "diagnostic-calibration.completed",
      workspace.organizationId,
      workspace.workspaceId,
    );
    await this.ensureRecord(
      DIAGNOSIS_RECORD_KINDS.trust,
      "diagnostic-trust-synthetic-lab",
      trust.mode,
      trust,
      "diagnostic-trust.assessed",
      workspace.organizationId,
      workspace.workspaceId,
    );
    this.initialized = true;
  }

  async overview(actor: ExperimentActor): Promise<DiagnosisOverview> {
    assertActorPermission(actor, "workspace:read");
    await this.initialize();
    const workspaceId = actorWorkspaceId(actor);
    const [diagnosisRecords, calibrationRecord, trustRecord, events] =
      await Promise.all([
        this.repository.listLifecycleRecords(workspaceId, {
          kind: DIAGNOSIS_RECORD_KINDS.diagnosis,
          limit: 200,
        }),
        this.repository.getLifecycleRecord(
          "diagnostic-calibration-reference-v1",
        ),
        this.repository.getLifecycleRecord(
          "diagnostic-trust-synthetic-lab",
        ),
        this.repository.listLifecycleEvents(workspaceId, {
          aggregateKind: DIAGNOSIS_RECORD_KINDS.diagnosis,
          limit: 400,
        }),
      ]);
    if (
      !calibrationRecord ||
      calibrationRecord.workspaceId !== workspaceId ||
      !trustRecord ||
      trustRecord.workspaceId !== workspaceId
    ) {
      throw new ExperimentNotFoundError(
        "Diagnostic calibration or trust state was not found",
      );
    }
    const diagnoses = diagnosisRecords.map((record) =>
      data<CausalDiagnosis>(record),
    );
    const complete = diagnoses.filter(
      (diagnosis) =>
        diagnosis.hypotheses.some(
          (hypothesis) => hypothesis.status === "alternative",
        ) &&
        diagnosis.hypotheses.every((hypothesis) =>
          hypothesis.evidence.some(
            (reference) => reference.stance === "contradicts",
          ),
        ),
    ).length;
    const counterfactuals = diagnoses.flatMap(
      (diagnosis) => diagnosis.counterfactuals,
    );
    return {
      schemaVersion: "nexus.diagnosis-overview.v1",
      generatedAt: this.now().toISOString(),
      diagnoses,
      calibration: data<DiagnosticCalibrationReport>(
        calibrationRecord,
      ),
      trust: data<DiagnosticTrustAssessment>(trustRecord),
      events,
      gates: {
        minimumExperimentConfidence:
          MINIMUM_EXPERIMENT_CONFIDENCE,
        diagnosedWithAlternativeAndCounterevidencePercent:
          diagnoses.length === 0
            ? 100
            : (complete / diagnoses.length) * 100,
        deterministicCounterfactualReplayPercent:
          counterfactuals.length === 0
            ? 100
            : (
                counterfactuals.filter(
                  (run) => run.deterministicReplay,
                ).length / counterfactuals.length
              ) * 100,
        lowConfidenceAutomationAttempts: diagnoses.filter(
          (diagnosis) =>
            diagnosis.leadingConfidence <
              MINIMUM_EXPERIMENT_CONFIDENCE &&
            diagnosis.experimentEligibility.eligible,
        ).length,
      },
      evidenceBoundary:
        "Causal records expose structured evidence and falsification, never hidden model chain-of-thought. All diagnoses concern synthetic scenarios only.",
    };
  }

  async diagnoseScenario(
    scenarioId: string,
    actor: ExperimentActor,
    options: {
      confidenceCeiling?: number;
    } = {},
  ): Promise<CausalDiagnosis> {
    assertActorPermission(actor, "runs:write");
    await this.initialize();
    const incident = await this.city.injectScenario(
      requiredText(scenarioId, "scenarioId", 160),
      actor,
    );
    if (!incident) {
      throw new ExperimentValidationError(
        "Normal scenarios do not produce a diagnosis",
      );
    }
    return this.diagnoseIncident(
      incident.id,
      actor,
      options,
    );
  }

  async diagnoseIncident(
    incidentId: string,
    actor: ExperimentActor,
    options: {
      confidenceCeiling?: number;
    } = {},
  ): Promise<CausalDiagnosis> {
    assertActorPermission(actor, "runs:write");
    await this.initialize();
    const workspaceId = actorWorkspaceId(actor);
    const incidentRecord =
      await this.repository.getLifecycleRecord(
        requiredText(incidentId, "incidentId", 220),
      );
    if (
      !incidentRecord ||
      incidentRecord.workspaceId !== workspaceId ||
      incidentRecord.kind !== CITY_RECORD_KINDS.incident
    ) {
      throw new ExperimentNotFoundError(
        `City incident ${incidentId} was not found`,
      );
    }
    const incident = data<CityIncident>(incidentRecord);
    const truth = PUBLIC_CITY_SCENARIOS.find(
      (scenario) => scenario.id === incident.scenarioTruthId,
    );
    if (!truth) {
      throw new ExperimentNotFoundError(
        `Scenario truth ${incident.scenarioTruthId} was not found`,
      );
    }
    const workspace =
      await this.repository.getGovernedWorkspace(workspaceId);
    if (!workspace) {
      throw new ExperimentNotFoundError(
        `Workspace governance for ${workspaceId} was not found`,
      );
    }
    const trustRecord =
      await this.repository.getLifecycleRecord(
        "diagnostic-trust-synthetic-lab",
      );
    if (
      !trustRecord ||
      trustRecord.workspaceId !== workspaceId
    ) {
      throw new ExperimentNotFoundError(
        "Diagnostic trust state was not found",
      );
    }
    const confidenceCeiling =
      options.confidenceCeiling === undefined
        ? undefined
        : bounded(
            options.confidenceCeiling,
            "confidenceCeiling",
          );
    const trust = data<DiagnosticTrustAssessment>(trustRecord);
    const diagnosticContext = createHash("sha256")
      .update(
        stableStringify({
          policyVersion: "diagnostic-policy-1.0.0",
          trust,
          confidenceCeiling: confidenceCeiling ?? null,
        }),
        "utf8",
      )
      .digest("hex")
      .slice(0, 16);
    const recordId = `diagnosis-${incident.id}-${diagnosticContext}`;
    const existing =
      await this.repository.getLifecycleRecord(recordId);
    if (existing) {
      if (
        existing.workspaceId !== workspaceId ||
        existing.kind !== DIAGNOSIS_RECORD_KINDS.diagnosis
      ) {
        throw new ExperimentNotFoundError(
          `Diagnosis ${recordId} was not found`,
        );
      }
      return data<CausalDiagnosis>(existing);
    }
    const timestamp = this.now().toISOString();
    const diagnosis = buildCausalDiagnosis({
      diagnosisId: recordId,
      incident,
      scenarioMode: truth.mode,
      scenarioTruthId: truth.id,
      family: truth.family,
      injectedMetricDeltas: truth.injectedMetricDeltas,
      createdAt: timestamp,
      trust,
      confidenceCeiling,
    });
    await this.repository.createLifecycleRecord({
      record: {
        id: diagnosis.id,
        organizationId: workspace.organizationId,
        workspaceId,
        kind: DIAGNOSIS_RECORD_KINDS.diagnosis,
        status: diagnosis.status,
        revision: 1,
        data: { ...diagnosis },
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      event: this.event(
        diagnosis.id,
        DIAGNOSIS_RECORD_KINDS.diagnosis,
        `diagnosis.${diagnosis.status}`,
        actor,
        workspace.organizationId,
        {
          incidentId: incident.id,
          leadingHypothesisId:
            diagnosis.hypotheses[0]?.id,
          leadingConfidence: diagnosis.leadingConfidence,
          experimentEligible:
            diagnosis.experimentEligibility.eligible,
          counterfactualFingerprints:
            diagnosis.counterfactuals.map(
              (run) => run.counterfactualFingerprint,
            ),
        },
        incident.correlationId,
        incident.id,
      ),
    });
    return diagnosis;
  }

  async assessDrift(
    input: {
      dataDistributionShift: number;
      policyEffectShift: number;
      modelOutputShift: number;
    },
    actor: ExperimentActor,
  ): Promise<DiagnosticTrustAssessment> {
    assertActorPermission(actor, "policy:manage");
    if (actorPrincipalType(actor) !== "human") {
      throw new ExperimentPermissionError(
        "Diagnostic trust policy requires a human owner",
      );
    }
    await this.initialize();
    const workspaceId = actorWorkspaceId(actor);
    const current =
      await this.repository.getLifecycleRecord(
        "diagnostic-trust-synthetic-lab",
      );
    const calibration =
      await this.repository.getLifecycleRecord(
        "diagnostic-calibration-reference-v1",
      );
    if (
      !current ||
      current.workspaceId !== workspaceId ||
      !calibration ||
      calibration.workspaceId !== workspaceId
    ) {
      throw new ExperimentNotFoundError(
        "Diagnostic trust state was not found",
      );
    }
    const next = assessDiagnosticTrust({
      assessedAt: this.now().toISOString(),
      calibrationPassed:
        data<DiagnosticCalibrationReport>(calibration).passed,
      dataDistributionShift: bounded(
        input.dataDistributionShift,
        "dataDistributionShift",
      ),
      policyEffectShift: bounded(
        input.policyEffectShift,
        "policyEffectShift",
      ),
      modelOutputShift: bounded(
        input.modelOutputShift,
        "modelOutputShift",
      ),
    });
    await this.repository.commitLifecycleRecord({
      record: {
        ...current,
        status: next.mode,
        revision: current.revision + 1,
        data: { ...next },
        updatedAt: next.assessedAt,
      },
      expectedRevision: current.revision,
      event: this.event(
        current.id,
        DIAGNOSIS_RECORD_KINDS.trust,
        "diagnostic-trust.assessed",
        actor,
        current.organizationId,
        {
          mode: next.mode,
          automationAllowed: next.automationAllowed,
          reasons: next.reasons,
        },
        `corr-${current.id}`,
        current.id,
      ),
    });
    return next;
  }

  async recordHumanJudgment(
    diagnosisId: string,
    statement: string,
    actor: ExperimentActor,
  ): Promise<CausalDiagnosis> {
    assertActorPermission(actor, "runs:write");
    if (actorPrincipalType(actor) !== "human") {
      throw new ExperimentPermissionError(
        "Only a human can record human judgment",
      );
    }
    const current =
      await this.repository.getLifecycleRecord(
        requiredText(diagnosisId, "diagnosisId", 220),
      );
    if (
      !current ||
      current.workspaceId !== actorWorkspaceId(actor) ||
      current.kind !== DIAGNOSIS_RECORD_KINDS.diagnosis
    ) {
      throw new ExperimentNotFoundError(
        `Diagnosis ${diagnosisId} was not found`,
      );
    }
    const diagnosis = data<CausalDiagnosis>(current);
    const timestamp = this.now().toISOString();
    const judgment: DiagnosticEvidence = {
      id: `evidence-${diagnosis.id}-human-${this.id()}`,
      classification: "human-judgment",
      statement: requiredText(statement, "statement"),
      sourceType: "governance-boundary",
      sourceId: actor.id,
      observedFromTick: diagnosis.frozenSnapshot.tick,
      observedToTick: diagnosis.frozenSnapshot.tick,
      confidence: 1,
    };
    const next: CausalDiagnosis = {
      ...diagnosis,
      evidence: [...diagnosis.evidence, judgment],
      graph: {
        ...diagnosis.graph,
        nodes: [
          ...diagnosis.graph.nodes,
          {
            id: judgment.id,
            kind: "uncertainty",
            label: judgment.statement,
            classification: "human-judgment",
            confidence: 1,
          },
        ],
      },
      fingerprint: "",
    };
    next.fingerprint = fingerprintDiagnosis(next);
    await this.repository.commitLifecycleRecord({
      record: {
        ...current,
        revision: current.revision + 1,
        data: { ...next },
        updatedAt: timestamp,
      },
      expectedRevision: current.revision,
      event: this.event(
        current.id,
        DIAGNOSIS_RECORD_KINDS.diagnosis,
        "diagnosis.human-judgment.recorded",
        actor,
        current.organizationId,
        {
          evidenceId: judgment.id,
          classification: judgment.classification,
        },
        diagnosis.correlationId,
        diagnosis.id,
      ),
    });
    return next;
  }

  private async ensureRecord(
    kind: string,
    id: string,
    status: string,
    recordData: object,
    eventType: string,
    organizationId: string,
    workspaceId: string,
  ): Promise<void> {
    const existing =
      await this.repository.getLifecycleRecord(id);
    if (existing) {
      return;
    }
    const timestamp = this.now().toISOString();
    const actor: ExperimentActor = {
      id: "system:diagnosis-initializer",
      role: "admin",
      principalType: "system",
      workspaceId,
      organizationId,
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
          data: { ...structuredClone(recordData) },
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        event: this.event(
          id,
          kind,
          eventType,
          actor,
          organizationId,
          { initialized: true },
          `corr-${id}`,
        ),
      });
    } catch (error) {
      if (!(error instanceof ExperimentConflictError)) {
        throw error;
      }
    }
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
      id: `${aggregateId}-${type}-${this.id()}`,
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
}
