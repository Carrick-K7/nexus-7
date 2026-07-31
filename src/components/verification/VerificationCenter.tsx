"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  BadgeCheck,
  CheckCircle2,
  Download,
  FileCode2,
  RotateCcw,
  ShieldCheck,
  Target,
} from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import type {
  AutonomyReadinessReport,
} from "@/verification";
import V2CertificationPanel from "./V2CertificationPanel";

interface VerificationPayload {
  generatedAt: string;
  report: AutonomyReadinessReport;
}

interface GovernancePayload {
  identity: {
    actorId: string;
    role: string;
    organizationId?: string;
    workspaceId: string;
    serviceAccountId?: string;
    workloadKind?: string;
    principalType: string;
    authSource: string;
    permissions: string[];
  };
  releasePolicy: {
    requiredExternalGates: string[];
    humanApprovalRequired: boolean;
    serviceAccountsMayApprove: boolean;
    maximumReceiptLifetimeDays: number;
  };
  ciEvidence: {
    generatedAt: string;
    source: {
      commitSha: string;
      workflow: string;
      runId: string;
      dirty: boolean;
    };
    provenance: {
      trustLevel: string;
      provider: string;
    };
    fingerprint: string;
  };
  modelRegression: {
    providerId: string;
    model: string;
    promptVersion: string;
    liveProviderRequired: boolean;
    summary: {
      totalCases: number;
      passedCases: number;
      fallbackCases: number;
      errorCases: number;
      p95LatencyMs: number;
      totalCostUsd: number;
    };
    gate: {
      passed: boolean;
      failures: string[];
    };
  };
  operations: {
    recoveryDrill: {
      completedAt: string;
      observedRecoveryPointMs: number;
      observedRecoveryTimeMs: number;
      passed: boolean;
    } | null;
    deploymentDrill: {
      completedAt: string;
      adapterId: string;
      observedRollbackTimeMs: number;
      passed: boolean;
    } | null;
    schedule: string;
    retentionDays: number;
  };
  evidenceRegistry: {
    records: Array<{
      id: string;
      kind: string;
      runId: string;
      passed: boolean;
      verifiedAt: string;
      expiresAt: string;
      signerWorkflow: string;
    }>;
    freshness: Array<{
      kind: string;
      status: "current" | "expiring" | "stale" | "missing";
      maximumAgeHours: number;
      ageHours?: number;
      expiresAt?: string;
      message: string;
    }>;
    alerts: Array<{
      kind: string;
      status: string;
      message: string;
    }>;
  };
  releasePolicies: {
    active: {
      id: string;
      status: string;
      activatedAt: string;
      bundle: {
        payload: {
          policyId: string;
          version: string;
          expiresAt: string;
          environments: Record<
            "development" | "staging" | "production",
            {
              trafficStages: number[];
              prerequisite?: string;
              maximumErrorRatePercent: number;
              maximumP95LatencyMs: number;
              minimumAvailabilityPercent: number;
            }
          >;
        };
      };
    } | null;
    history: Array<{ id: string; status: string }>;
  };
  access: {
    organization: {
      id: string;
      name: string;
    };
    memberships: {
      total: number;
      active: number;
      suspended: number;
    };
    serviceAccounts: {
      total: number;
      active: number;
      suspended: number;
      revoked: number;
      workloads: Record<string, number>;
    };
    recentAudit: Array<{
      id: string;
      action: string;
      actorId: string;
      targetId: string;
      createdAt: string;
    }>;
  };
  deployment: {
    adapter: string;
    externalConfigured: boolean;
  };
}

function percent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export default function VerificationCenter() {
  const { t } = useTranslation();
  const [payload, setPayload] = useState<VerificationPayload | null>(null);
  const [governance, setGovernance] =
    useState<GovernancePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/verification", { cache: "no-store" }),
      fetch("/api/governance", { cache: "no-store" }),
    ])
      .then(async ([verificationResponse, governanceResponse]) => {
        if (!verificationResponse.ok || !governanceResponse.ok) {
          throw new Error(
            `Verification failed with ${verificationResponse.status}/${governanceResponse.status}`,
          );
        }
        return Promise.all([
          verificationResponse.json() as Promise<VerificationPayload>,
          governanceResponse.json() as Promise<GovernancePayload>,
        ]);
      })
      .then(([verificationPayload, governancePayload]) => {
        setPayload(verificationPayload);
        setGovernance(governancePayload);
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : String(cause)),
      );
  }, []);

  const report = payload?.report;
  const cards = report
    ? [
        {
          label: t("verifiedLoopRate"),
          value: percent(report.aggregate.verifiedAutonomyLoopRate),
          threshold: `≥ ${report.thresholds.verifiedAutonomyLoopRate}%`,
          icon: Target,
        },
        {
          label: t("deterministicReplaySuccess"),
          value: percent(report.aggregate.deterministicReplaySuccess),
          threshold: `≥ ${report.thresholds.deterministicReplaySuccess}%`,
          icon: ShieldCheck,
        },
        {
          label: t("causalCompleteness"),
          value: percent(report.aggregate.causalTraceCompleteness),
          threshold: `= ${report.thresholds.causalTraceCompleteness}%`,
          icon: FileCode2,
        },
        {
          label: t("rollbackCoverage"),
          value: percent(report.aggregate.rollbackCoverage),
          threshold: `= ${report.thresholds.rollbackCoverage}%`,
          icon: RotateCcw,
        },
      ]
    : [];

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-lg border border-cyber-green/30 bg-cyber-green/10 p-2">
            <BadgeCheck className="h-6 w-6 text-cyber-green" />
          </div>
          <div>
            <h1 className="font-orbitron text-3xl font-bold text-cyber-green">
              {t("verificationCenter")}
            </h1>
            <p className="mt-1 text-cyber-text-dim">
              {t("verificationCenterDesc")}
            </p>
          </div>
          {report && (
            <span
              data-testid="v1-readiness"
              className={`ml-auto rounded-full border px-4 py-2 text-sm font-bold uppercase ${
                report.meetsV1
                  ? "border-cyber-green/50 bg-cyber-green/10 text-cyber-green"
                  : "border-cyber-red/50 bg-cyber-red/10 text-cyber-red"
              }`}
            >
              {report.meetsV1 ? t("v1Ready") : t("v1NotReady")}
            </span>
          )}
        </div>
      </motion.div>

      {error && (
        <p role="alert" className="rounded-lg border border-cyber-red/40 p-4 text-cyber-red">
          {error}
        </p>
      )}

      <V2CertificationPanel enabled={Boolean(report)} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="rounded-xl border border-cyber-blue/20 bg-cyber-dark/50 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-cyber-text-dim">{card.label}</span>
                <Icon className="h-4 w-4 text-cyber-blue" />
              </div>
              <p className="mt-2 text-2xl font-bold text-cyber-text">
                {card.value}
              </p>
              <p className="mt-1 text-xs text-cyber-green">
                {t("threshold")} {card.threshold}
              </p>
            </div>
          );
        })}
      </div>

      <section className="rounded-xl border border-cyber-blue/20 bg-cyber-dark/50 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h2 className="font-orbitron text-lg text-cyber-text">
              {t("publicScenarioSuite")}
            </h2>
            <p className="mt-1 text-sm text-cyber-text-dim">
              {report
                ? `${report.aggregate.publicScenarios} scenarios · ${report.aggregate.totalTicks} ticks · ${report.aggregate.acceptedActions} accepted actions`
                : t("collectingData")}
            </p>
          </div>
          <a
            href="/api/verification"
            className="ml-auto flex items-center gap-2 rounded-lg border border-cyber-green/40 px-3 py-2 text-sm text-cyber-text"
          >
            <Download className="h-4 w-4" />
            {t("machineReadableReport")}
          </a>
        </div>

        <div
          className="mt-4 overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label={t("publicScenarioSuite")}
        >
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-cyber-gray/40 text-xs uppercase text-cyber-text-dim">
                <th className="p-3">{t("scenario")}</th>
                <th className="p-3">{t("policyVersion")}</th>
                <th className="p-3">{t("acceptedActions")}</th>
                <th className="p-3">{t("verifiedLoopRate")}</th>
                <th className="p-3">{t("rollbackCoverage")}</th>
                <th className="p-3">{t("status")}</th>
              </tr>
            </thead>
            <tbody>
              {report?.scenarios.map((scenario) => {
                const passed =
                  scenario.deterministicReplay &&
                  scenario.invariantViolations.length === 0 &&
                  scenario.verifiedAutonomyLoopRate >=
                    report.thresholds.verifiedAutonomyLoopRate &&
                  scenario.causalTraceCompleteness ===
                    report.thresholds.causalTraceCompleteness &&
                  scenario.rollbackCoverage ===
                    report.thresholds.rollbackCoverage;
                return (
                  <tr
                    key={scenario.scenarioId}
                    className="border-b border-cyber-gray/20 text-cyber-text"
                  >
                    <td className="p-3 font-semibold">{scenario.scenarioId}</td>
                    <td className="p-3 font-mono text-xs text-cyber-blue">
                      {scenario.policyVersion}
                    </td>
                    <td className="p-3">{scenario.acceptedActions}</td>
                    <td className="p-3">
                      {percent(scenario.verifiedAutonomyLoopRate)}
                    </td>
                    <td className="p-3">
                      {percent(scenario.rollbackCoverage)}
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-flex items-center gap-1 text-xs ${
                          passed ? "text-cyber-green" : "text-cyber-red"
                        }`}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        {passed ? t("verified") : t("mismatch")}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-cyber-green/20 bg-cyber-dark/50 p-4 sm:p-5">
        <div>
          <h2 className="font-orbitron text-lg text-cyber-text">
            {t("releaseGovernance")}
          </h2>
          <p className="mt-1 text-sm text-cyber-text-dim">
            {t("releaseGovernanceDesc")}
          </p>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-cyber-blue/30 bg-cyber-blue/5 p-4">
            <h3 className="text-sm font-semibold text-cyber-text">
              {t("identityBoundary")}
            </h3>
            <p className="mt-2 text-sm text-cyber-text">
              {governance?.identity.actorId ?? "—"} ·{" "}
              {governance?.identity.role ?? "—"}
            </p>
            <p className="mt-1 text-xs text-cyber-text-dim">
              {governance?.identity.organizationId ?? "—"} ·{" "}
              {governance?.identity.workspaceId ?? "—"} ·{" "}
              {governance?.identity.principalType ?? "—"} ·{" "}
              {governance?.identity.workloadKind ??
                governance?.identity.authSource ??
                "—"}
            </p>
            <p className="mt-2 text-xs text-cyber-green">
              {governance?.releasePolicy.humanApprovalRequired
                ? t("humanApprovalEnforced")
                : t("collectingData")}
            </p>
          </div>
          <div className="rounded-lg border border-cyber-purple/30 bg-cyber-purple/5 p-4">
            <h3 className="text-sm font-semibold text-cyber-text">
              {t("modelReleaseGate")}
            </h3>
            <p className="mt-2 text-2xl font-bold text-cyber-text">
              {governance
                ? `${governance.modelRegression.summary.passedCases}/${governance.modelRegression.summary.totalCases}`
                : "—"}
            </p>
            <p className="mt-1 text-xs text-cyber-text-dim">
              {governance?.modelRegression.providerId ?? "—"} ·{" "}
              {governance?.modelRegression.model ?? "—"} ·{" "}
              {governance?.modelRegression.promptVersion ?? "—"}
            </p>
            <p
              className={`mt-2 text-xs ${
                governance?.modelRegression.gate.passed
                  ? "text-cyber-green"
                  : "text-cyber-red"
              }`}
            >
              P95 {governance?.modelRegression.summary.p95LatencyMs ?? "—"}ms ·
              ${governance?.modelRegression.summary.totalCostUsd ?? "—"} ·{" "}
              {governance?.modelRegression.summary.fallbackCases ?? "—"}{" "}
              fallback
            </p>
          </div>
          <div className="rounded-lg border border-cyber-yellow/30 bg-cyber-yellow/5 p-4">
            <h3 className="text-sm font-semibold text-cyber-text">
              {t("externalProvenance")}
            </h3>
            <p className="mt-2 text-sm text-cyber-text">
              {governance?.ciEvidence.provenance.trustLevel ?? "—"} ·{" "}
              {governance?.ciEvidence.provenance.provider ?? "—"}
            </p>
            <p className="mt-1 break-all font-mono text-xs text-cyber-text-dim">
              {governance?.ciEvidence.source.commitSha ?? "—"}
            </p>
            <p className="mt-2 text-xs text-cyber-yellow">
              {governance?.releasePolicy.requiredExternalGates.length ?? 0}{" "}
              {t("requiredPromotionGates")}
            </p>
            <p className="mt-2 break-words font-mono text-[10px] text-cyber-text-dim">
              {governance?.releasePolicy.requiredExternalGates.join(" · ") ??
                "—"}
            </p>
          </div>
        </div>
        <div className="mt-4 rounded-lg border border-cyber-gray/30 bg-cyber-black/20 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-sm font-semibold text-cyber-text">
              {t("operationsDrills")}
            </h3>
            <span className="text-xs text-cyber-text-dim">
              {governance?.operations.schedule ?? "—"} ·{" "}
              {governance?.operations.retentionDays ?? "—"}{" "}
              {t("retentionDays")}
            </span>
            <span className="ml-auto text-xs text-cyber-blue">
              {governance?.deployment.adapter ?? "—"}
            </span>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <p className="text-xs text-cyber-text-dim">
              {t("recoveryDrill")}:{" "}
              {governance?.operations.recoveryDrill
                ? `${governance.operations.recoveryDrill.passed ? t("verified") : t("mismatch")} · RPO ${governance.operations.recoveryDrill.observedRecoveryPointMs}ms · RTO ${governance.operations.recoveryDrill.observedRecoveryTimeMs}ms`
                : t("evidenceAvailableAfterDrill")}
            </p>
            <p className="text-xs text-cyber-text-dim">
              {t("deploymentRollbackDrill")}:{" "}
              {governance?.operations.deploymentDrill
                ? `${governance.operations.deploymentDrill.passed ? t("verified") : t("mismatch")} · ${governance.operations.deploymentDrill.observedRollbackTimeMs}ms`
                : t("evidenceAvailableAfterDrill")}
            </p>
          </div>
          <div className="mt-4 border-t border-cyber-gray/30 pt-4">
            <h4 className="text-xs font-semibold text-cyber-text">
              {t("evidenceFreshness")}
            </h4>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {governance?.evidenceRegistry.freshness.map((entry) => {
                const label =
                  entry.status === "current"
                    ? t("freshnessCurrent")
                    : entry.status === "expiring"
                      ? t("freshnessExpiring")
                      : entry.status === "stale"
                        ? t("freshnessStale")
                        : t("freshnessMissing");
                const tone =
                  entry.status === "current"
                    ? "text-cyber-green"
                    : entry.status === "expiring"
                      ? "text-cyber-yellow"
                      : "text-cyber-red";
                return (
                  <div
                    key={entry.kind}
                    className="rounded border border-cyber-gray/30 bg-cyber-black/20 p-3"
                  >
                    <p className="font-mono text-xs text-cyber-text">
                      {entry.kind}
                    </p>
                    <p className={`mt-1 text-xs font-semibold ${tone}`}>
                      {label}
                    </p>
                    <p className="mt-1 text-[11px] text-cyber-text-dim">
                      {t("freshnessSlo")} ≤ {entry.maximumAgeHours}h ·{" "}
                      {entry.ageHours === undefined
                        ? "—"
                        : `${entry.ageHours.toFixed(1)}h`}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-cyber-blue/30 bg-cyber-blue/5 p-4">
            <h3 className="text-sm font-semibold text-cyber-text">
              {t("workspaceAccess")}
            </h3>
            <p className="mt-1 text-xs text-cyber-text-dim">
              {governance?.access.organization.name ?? "—"} ·{" "}
              {governance?.access.organization.id ?? "—"}
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded border border-cyber-gray/30 p-2">
                <p className="text-lg font-bold text-cyber-green">
                  {governance?.access.memberships.active ?? 0}
                </p>
                <p className="text-[10px] text-cyber-text-dim">
                  {t("activeMembers")}
                </p>
              </div>
              <div className="rounded border border-cyber-gray/30 p-2">
                <p className="text-lg font-bold text-cyber-yellow">
                  {governance?.access.memberships.suspended ?? 0}
                </p>
                <p className="text-[10px] text-cyber-text-dim">
                  {t("suspendedMembers")}
                </p>
              </div>
              <div className="rounded border border-cyber-gray/30 p-2">
                <p className="text-lg font-bold text-cyber-blue">
                  {governance?.access.serviceAccounts.total ?? 0}
                </p>
                <p className="text-[10px] text-cyber-text-dim">
                  {t("serviceAccounts")}
                </p>
              </div>
            </div>
            <p className="mt-3 text-xs text-cyber-text-dim">
              {t("workloadIdentities")}:{" "}
              {Object.entries(
                governance?.access.serviceAccounts.workloads ?? {},
              )
                .map(([kind, count]) => `${kind} ${count}`)
                .join(" · ") || "—"}
            </p>
            <div className="mt-3">
              <p className="text-xs font-semibold text-cyber-text">
                {t("governanceAudit")}
              </p>
              <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto">
                {governance?.access.recentAudit.slice(0, 4).map((record) => (
                  <li
                    key={record.id}
                    className="font-mono text-[10px] text-cyber-text-dim"
                  >
                    {record.action} · {record.actorId}
                  </li>
                ))}
                {governance?.access.recentAudit.length === 0 && (
                  <li className="text-xs text-cyber-text-dim">—</li>
                )}
              </ul>
            </div>
          </div>

          <div className="rounded-lg border border-cyber-purple/30 bg-cyber-purple/5 p-4">
            <h3 className="text-sm font-semibold text-cyber-text">
              {t("releasePolicyBundle")}
            </h3>
            <p className="mt-2 text-sm text-cyber-text">
              {governance?.releasePolicies.active
                ? `${governance.releasePolicies.active.bundle.payload.policyId}@${governance.releasePolicies.active.bundle.payload.version}`
                : t("freshnessMissing")}
            </p>
            <p className="mt-1 text-xs text-cyber-text-dim">
              {t("expiresAt")}{" "}
              {governance?.releasePolicies.active?.bundle.payload.expiresAt ??
                "—"}
            </p>
            <div className="mt-3 space-y-2">
              {(["development", "staging", "production"] as const).map(
                (environment) => {
                  const policy =
                    governance?.releasePolicies.active?.bundle.payload
                      .environments[environment];
                  return (
                    <div
                      key={environment}
                      className="rounded border border-cyber-gray/30 bg-cyber-black/20 p-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-cyber-text">
                          {environment}
                        </span>
                        <span className="font-mono text-[10px] text-cyber-purple">
                          {policy?.trafficStages.join(" → ") ?? "—"}%
                        </span>
                      </div>
                      <p className="mt-1 text-[10px] text-cyber-text-dim">
                        {policy?.prerequisite
                          ? `after ${policy.prerequisite} · `
                          : ""}
                        error ≤ {policy?.maximumErrorRatePercent ?? "—"}% · P95
                        ≤ {policy?.maximumP95LatencyMs ?? "—"}ms · availability
                        ≥ {policy?.minimumAvailabilityPercent ?? "—"}%
                      </p>
                    </div>
                  );
                },
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-cyber-gray/30 bg-cyber-black/20 p-4">
          <h3 className="text-sm font-semibold text-cyber-text">
            {t("evidenceHistory")}
          </h3>
          <div
            className="mt-3 overflow-x-auto"
            tabIndex={0}
            role="region"
            aria-label={t("evidenceHistory")}
          >
            <table className="w-full min-w-[680px] text-left text-xs">
              <thead className="text-cyber-text-dim">
                <tr>
                  <th className="p-2">{t("status")}</th>
                  <th className="p-2">{t("verificationEvidence")}</th>
                  <th className="p-2">{t("generatedAt")}</th>
                  <th className="p-2">{t("expiresAt")}</th>
                </tr>
              </thead>
              <tbody>
                {governance?.evidenceRegistry.records
                  .slice(0, 8)
                  .map((record) => (
                    <tr
                      key={record.id}
                      className="border-t border-cyber-gray/20"
                    >
                      <td className="p-2 text-cyber-green">
                        {record.passed ? t("verified") : t("mismatch")}
                      </td>
                      <td className="p-2 font-mono text-cyber-text">
                        {record.kind} · run {record.runId}
                      </td>
                      <td className="p-2 text-cyber-text-dim">
                        {record.verifiedAt}
                      </td>
                      <td className="p-2 text-cyber-text-dim">
                        {record.expiresAt}
                      </td>
                    </tr>
                  ))}
                {governance?.evidenceRegistry.records.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="p-3 text-cyber-text-dim"
                    >
                      {t("freshnessMissing")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-cyber-purple/30 bg-cyber-purple/5 p-5">
          <h2 className="font-orbitron text-lg text-cyber-text">
            {t("extensionContracts")}
          </h2>
          <ul className="mt-3 space-y-2 text-sm text-cyber-text-dim">
            <li>AgentPolicy.observe / propose</li>
            <li>ModelProvider.generateProposal</li>
            <li>SimulationScenario JSON schema</li>
            <li>ExperimentRepository transaction contract</li>
          </ul>
        </div>
        <div className="rounded-xl border border-cyber-green/30 bg-cyber-green/5 p-5">
          <h2 className="font-orbitron text-lg text-cyber-text">
            {t("verificationArtifact")}
          </h2>
          <p className="mt-3 break-all font-mono text-xs text-cyber-green">
            {report?.fingerprint ?? "—"}
          </p>
          <p className="mt-2 text-sm text-cyber-text-dim">
            {payload
              ? `${t("generatedAt")} ${payload.generatedAt}`
              : t("collectingData")}
          </p>
        </div>
      </section>
    </div>
  );
}
