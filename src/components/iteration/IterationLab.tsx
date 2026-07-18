"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Beaker,
  CheckCircle2,
  GitBranch,
  Play,
  RefreshCw,
  Rocket,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import type {
  ExperimentPermission,
  ExperimentPrincipalType,
  ExperimentOverview,
  ExperimentRole,
} from "@/experiments/types";
import type {
  ImprovementAction,
  ImprovementProposal,
  IterationDecisionRecord,
} from "@/iteration/types";
import type {
  ReleaseEnvironment,
} from "@/governance/types";

async function json<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? `Request failed with ${response.status}`);
  }
  return payload;
}

interface AuthenticationContext {
  actorId: string;
  role: ExperimentRole;
  workspaceId: string;
  principalType: ExperimentPrincipalType;
  authSource: string;
  issuer?: string;
  permissions: ExperimentPermission[];
}

async function loadIterationLabData(
  headers: Record<string, string>,
): Promise<{
  experimentData: ExperimentOverview;
  iterationData: { proposals: ImprovementProposal[] };
  identity: AuthenticationContext;
}> {
  const [experimentData, iterationData, identity] = await Promise.all([
    json<ExperimentOverview>(
      await fetch("/api/experiments", {
        cache: "no-store",
        headers,
      }),
    ),
    json<{ proposals: ImprovementProposal[] }>(
      await fetch("/api/iterations", {
        cache: "no-store",
        headers,
      }),
    ),
    json<AuthenticationContext>(
      await fetch("/api/auth/context", {
        cache: "no-store",
        headers,
      }),
    ),
  ]);
  return { experimentData, iterationData, identity };
}

const EMPTY_RELEASE_ARTIFACT = {
  name: "nexus-7",
  repository: "Carrick-K7/nexus-7",
  commitSha: "",
  evidenceManifestSha256: "",
  evidenceManifestFingerprint: "",
};

export default function IterationLab() {
  const { t } = useTranslation();
  const [overview, setOverview] = useState<ExperimentOverview | null>(null);
  const [proposals, setProposals] = useState<ImprovementProposal[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<IterationDecisionRecord[]>([]);
  const [sourceRunId, setSourceRunId] = useState("");
  const [role, setRole] = useState<ExperimentRole>("admin");
  const [principalType, setPrincipalType] =
    useState<ExperimentPrincipalType>("human");
  const [authContext, setAuthContext] =
    useState<AuthenticationContext | null>(null);
  const [changeScope, setChangeScope] =
    useState<ImprovementProposal["changeScope"]>("policy");
  const [releaseArtifact, setReleaseArtifact] = useState(
    EMPTY_RELEASE_ARTIFACT,
  );
  const [targetEnvironment, setTargetEnvironment] =
    useState<ReleaseEnvironment>("development");
  const [receiptJson, setReceiptJson] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected =
    proposals.find((proposal) => proposal.id === selectedId) ??
    proposals[0] ??
    null;
  const headers = useMemo(
    () => ({
      "Content-Type": "application/json",
      "x-nexus-actor": "iteration-reviewer",
      "x-nexus-role": role,
      "x-nexus-workspace":
        authContext?.workspaceId ?? "workspace-neo-angeles",
      "x-nexus-principal-type": principalType,
    }),
    [authContext?.workspaceId, principalType, role],
  );

  const refresh = useCallback(async () => {
    const { experimentData, iterationData, identity } =
      await loadIterationLabData(headers);
    setOverview(experimentData);
    setProposals(iterationData.proposals);
    setAuthContext(identity);
    setSourceRunId((current) => current || experimentData.runs[0]?.id || "");
    setSelectedId((current) => current ?? iterationData.proposals[0]?.id ?? null);
    return iterationData.proposals;
  }, [headers]);

  useEffect(() => {
    loadIterationLabData(headers)
      .then(({ experimentData, iterationData, identity }) => {
        setOverview(experimentData);
        setProposals(iterationData.proposals);
        setAuthContext(identity);
        setSourceRunId((current) =>
          current || experimentData.runs[0]?.id || "",
        );
        setSelectedId(
          (current) => current ?? iterationData.proposals[0]?.id ?? null,
        );
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : String(cause)),
      );
  }, [headers]);

  useEffect(() => {
    if (!selected?.id) {
      return;
    }
    fetch(`/api/iterations/${selected.id}`, {
      cache: "no-store",
      headers,
    })
      .then(
        json<{
          proposal: ImprovementProposal;
          decisions: IterationDecisionRecord[];
        }>,
      )
      .then((payload) => setDecisions(payload.decisions))
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : String(cause)),
      );
  }, [headers, selected?.id, selected?.revision]);

  const propose = async () => {
    if (!sourceRunId) {
      setError(t("iterationNeedsRun"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const proposal = await json<ImprovementProposal>(
        await fetch("/api/iterations", {
          method: "POST",
          headers,
          body: JSON.stringify({
            sourceRunId,
            changeScope,
            ...(changeScope === "policy"
              ? {}
              : { releaseArtifact, targetEnvironment }),
          }),
        }),
      );
      await refresh();
      setSelectedId(proposal.id);
      setDecisions([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const act = async (action: ImprovementAction) => {
    if (!selected) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const proposal = await json<ImprovementProposal>(
        await fetch(`/api/iterations/${selected.id}/actions`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            action: action.type,
            expectedRevision: selected.revision,
            ...("rationale" in action ? { rationale: action.rationale } : {}),
            ...("receipt" in action ? { receipt: action.receipt } : {}),
          }),
        }),
      );
      await refresh();
      setSelectedId(proposal.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const attachEvidence = async () => {
    try {
      const receipt = JSON.parse(receiptJson) as Extract<
        ImprovementAction,
        { type: "attach-external-evidence" }
      >["receipt"];
      await act({ type: "attach-external-evidence", receipt });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `${t("invalidReceipt")}: ${cause.message}`
          : t("invalidReceipt"),
      );
    }
  };

  const stageCards = selected
    ? [
        {
          label: t("iterationProposalStage"),
          complete: true,
          detail: selected.trigger.metric,
        },
        {
          label:
            selected.changeScope === "policy"
              ? t("iterationExperimentStage")
              : t("iterationEvidenceStage"),
          complete:
            selected.changeScope === "policy"
              ? Boolean(selected.evaluation)
              : Boolean(selected.externalEvidence),
          detail:
            selected.changeScope === "policy"
              ? selected.evaluation
                ? `${selected.evaluation.targetImprovement.toFixed(2)}`
                : t("pending")
              : selected.externalEvidence?.receipt.payload.runId ??
                t("pending"),
        },
        {
          label: t("iterationApprovalStage"),
          complete: Boolean(selected.approval),
          detail: selected.approval?.decision ?? t("pending"),
        },
        {
          label: t("iterationCanaryStage"),
          complete:
            selected.status === "promoted" ||
            selected.status === "rolled-back",
          detail:
            selected.deployment?.status ??
            selected.canary?.status ??
            t("pending"),
        },
      ]
    : [];

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-cyber-green/30 bg-cyber-green/10 p-2">
            <Sparkles className="h-6 w-6 text-cyber-green" />
          </div>
          <div>
            <h1 className="font-orbitron text-3xl font-bold text-cyber-green">
              {t("iterationLab")}
            </h1>
            <p className="mt-1 text-cyber-text-dim">{t("iterationLabDesc")}</p>
          </div>
        </div>
      </motion.div>

      <section className="rounded-xl border border-cyber-blue/20 bg-cyber-dark/50 p-4 sm:p-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1fr_auto_auto_auto] xl:items-end">
          <label className="space-y-2 text-sm text-cyber-text-dim">
            <span>{t("iterationSourceRun")}</span>
            <select
              aria-label={t("iterationSourceRun")}
              value={sourceRunId}
              onChange={(event) => setSourceRunId(event.target.value)}
              className="w-full rounded-lg border border-cyber-blue/30 bg-cyber-black px-3 py-2 text-cyber-text"
            >
              {overview?.runs.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.name} · tick {run.run.world.tick}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2 text-sm text-cyber-text-dim">
            <span>{t("changeScope")}</span>
            <select
              aria-label={t("changeScope")}
              value={changeScope}
              onChange={(event) =>
                setChangeScope(
                  event.target.value as ImprovementProposal["changeScope"],
                )
              }
              className="rounded-lg border border-cyber-blue/30 bg-cyber-black px-3 py-2 text-cyber-text"
            >
              <option value="policy">{t("scopePolicy")}</option>
              <option value="code">{t("scopeCode")}</option>
              <option value="deployment">{t("scopeDeployment")}</option>
            </select>
          </label>
          <label className="space-y-2 text-sm text-cyber-text-dim">
            <span>{t("workspaceRole")}</span>
            <select
              aria-label={t("workspaceRole")}
              value={role}
              onChange={(event) => setRole(event.target.value as ExperimentRole)}
              disabled={authContext?.authSource !== "development"}
              className="rounded-lg border border-cyber-blue/30 bg-cyber-black px-3 py-2 text-cyber-text disabled:opacity-60"
            >
              <option value="viewer">{t("roleViewer")}</option>
              <option value="operator">{t("roleOperator")}</option>
              <option value="admin">{t("roleAdmin")}</option>
            </select>
          </label>
          <label className="space-y-2 text-sm text-cyber-text-dim">
            <span>{t("principalType")}</span>
            <select
              aria-label={t("principalType")}
              value={principalType}
              onChange={(event) =>
                setPrincipalType(
                  event.target.value as ExperimentPrincipalType,
                )
              }
              disabled={authContext?.authSource !== "development"}
              className="rounded-lg border border-cyber-blue/30 bg-cyber-black px-3 py-2 text-cyber-text disabled:opacity-60"
            >
              <option value="human">{t("principalHuman")}</option>
              <option value="service-account">
                {t("principalServiceAccount")}
              </option>
            </select>
          </label>
        </div>

        {changeScope !== "policy" && (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <label className="space-y-2 text-sm text-cyber-text-dim">
              <span>{t("targetEnvironment")}</span>
              <select
                aria-label={t("targetEnvironment")}
                value={targetEnvironment}
                onChange={(event) =>
                  setTargetEnvironment(
                    event.target.value as ReleaseEnvironment,
                  )
                }
                className="w-full rounded-lg border border-cyber-blue/30 bg-cyber-black px-3 py-2 text-cyber-text"
              >
                <option value="development">
                  {t("environmentDevelopment")}
                </option>
                <option value="staging">
                  {t("environmentStaging")}
                </option>
                <option value="production">
                  {t("environmentProduction")}
                </option>
              </select>
            </label>
            {(
              [
                ["name", t("artifactName")],
                ["repository", t("artifactRepository")],
                ["commitSha", t("artifactCommit")],
                [
                  "evidenceManifestSha256",
                  t("evidenceManifestDigest"),
                ],
                [
                  "evidenceManifestFingerprint",
                  t("evidenceManifestFingerprint"),
                ],
              ] as const
            ).map(([field, label]) => (
              <label
                key={field}
                className="space-y-2 text-sm text-cyber-text-dim"
              >
                <span>{label}</span>
                <input
                  aria-label={label}
                  value={releaseArtifact[field]}
                  onChange={(event) =>
                    setReleaseArtifact((current) => ({
                      ...current,
                      [field]: event.target.value.trim(),
                    }))
                  }
                  className="w-full rounded-lg border border-cyber-blue/30 bg-cyber-black px-3 py-2 font-mono text-xs text-cyber-text"
                />
              </label>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1 rounded-lg border border-cyber-gray/30 bg-cyber-black/20 px-3 py-2 text-xs text-cyber-text-dim">
            <span className="font-semibold text-cyber-text">
              {authContext?.actorId ?? "—"}
            </span>
            {" · "}
            {authContext?.workspaceId ?? "—"}
            {" · "}
            {authContext?.principalType ?? principalType}
            {" · "}
            {authContext?.authSource ?? "—"}
            <p className="mt-1 truncate font-mono text-[11px] text-cyber-blue">
              {authContext?.permissions.join(" · ") ?? t("collectingData")}
            </p>
          </div>
          <button
            type="button"
            onClick={propose}
            disabled={
              busy ||
              !sourceRunId ||
              role === "viewer" ||
              (changeScope !== "policy" &&
                Object.values(releaseArtifact).some((value) => !value))
            }
            className="flex items-center justify-center gap-2 rounded-lg bg-cyber-green px-4 py-2 font-semibold text-cyber-black disabled:opacity-40"
          >
            <Sparkles className="h-4 w-4" />
            {t("generateImprovement")}
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-3 text-sm text-cyber-red">
            {error}
          </p>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <section className="rounded-xl border border-cyber-blue/20 bg-cyber-dark/50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-orbitron text-lg text-cyber-text">
              {t("improvementProposals")}
            </h2>
            <button
              type="button"
              aria-label={t("refreshProposals")}
              onClick={() => refresh()}
              className="rounded-lg p-2 text-cyber-blue hover:bg-cyber-blue/10"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-2">
            {proposals.map((proposal) => (
              <button
                key={proposal.id}
                type="button"
                onClick={() => {
                  setSelectedId(proposal.id);
                  setDecisions([]);
                }}
                className={`w-full rounded-lg border p-3 text-left ${
                  selected?.id === proposal.id
                    ? "border-cyber-green/60 bg-cyber-green/10"
                    : "border-cyber-gray/40 bg-cyber-black/20"
                }`}
              >
                <span className="block truncate font-semibold text-cyber-text">
                  {proposal.title}
                </span>
                <span className="mt-1 block text-xs text-cyber-text-dim">
                  r{proposal.revision} · {proposal.status}
                </span>
              </button>
            ))}
            {proposals.length === 0 && (
              <p className="py-6 text-center text-sm text-cyber-text-dim">
                {t("noImprovementProposals")}
              </p>
            )}
          </div>
        </section>

        <section
          data-testid="iteration-workflow"
          className="rounded-xl border border-cyber-blue/20 bg-cyber-dark/50 p-4 sm:p-5"
        >
          {selected ? (
            <div className="space-y-6">
              <div className="flex flex-wrap items-start gap-3">
                <div>
                  <h2 className="font-orbitron text-xl text-cyber-text">
                    {selected.title}
                  </h2>
                  <p className="mt-1 text-sm text-cyber-text-dim">
                    {selected.hypothesis}
                  </p>
                </div>
                <span
                  className="rounded-full border border-cyber-blue/30 bg-cyber-blue/10 px-3 py-1 text-xs uppercase text-cyber-blue"
                >
                  {selected.changeScope}
                </span>
                <span
                  data-testid="iteration-status"
                  className="ml-auto rounded-full border border-cyber-green/30 bg-cyber-green/10 px-3 py-1 text-xs uppercase text-cyber-green"
                >
                  {selected.status}
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {stageCards.map((stage) => (
                  <div
                    key={stage.label}
                    className={`rounded-lg border p-3 ${
                      stage.complete
                        ? "border-cyber-green/30 bg-cyber-green/5"
                        : "border-cyber-gray/40 bg-cyber-black/20"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {stage.complete ? (
                        <CheckCircle2 className="h-4 w-4 text-cyber-green" />
                      ) : (
                        <div className="h-4 w-4 rounded-full border border-cyber-text-dim" />
                      )}
                      <span className="text-xs font-semibold text-cyber-text">
                        {stage.label}
                      </span>
                    </div>
                    <p className="mt-2 truncate text-xs text-cyber-text-dim">
                      {stage.detail}
                    </p>
                  </div>
                ))}
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-cyber-purple/30 bg-cyber-purple/5 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <GitBranch className="h-4 w-4 text-cyber-purple" />
                    <h3 className="font-semibold text-cyber-text">
                      {t("isolatedBranch")}
                    </h3>
                  </div>
                  <p className="font-mono text-sm text-cyber-purple">
                    {selected.implementation.branchName}
                  </p>
                  <p className="mt-2 text-xs text-cyber-text-dim">
                    {selected.implementation.summary}
                  </p>
                </div>
                <div className="rounded-lg border border-cyber-blue/30 bg-cyber-blue/5 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Beaker className="h-4 w-4 text-cyber-blue" />
                    <h3 className="font-semibold text-cyber-text">
                      {t("experimentSpecification")}
                    </h3>
                  </div>
                  <p className="text-sm text-cyber-text">
                    {selected.specification.actorId.toUpperCase()} ·{" "}
                    {selected.specification.targetMetric}{" "}
                    {selected.specification.delta > 0 ? "+" : ""}
                    {selected.specification.delta}
                  </p>
                  <p className="mt-2 text-xs text-cyber-text-dim">
                    {selected.specification.horizonTicks} ticks · min{" "}
                    {selected.specification.minimumImprovement} · max regression{" "}
                    {selected.specification.maximumRegression}
                  </p>
                </div>
              </div>

              {selected.releaseArtifact && (
                <div className="rounded-lg border border-cyber-blue/30 bg-cyber-blue/5 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-cyber-blue" />
                    <h3 className="font-semibold text-cyber-text">
                      {t("releaseArtifact")}
                    </h3>
                    <span
                      className={`ml-auto text-xs ${
                        selected.externalEvidence
                          ? "text-cyber-green"
                          : "text-cyber-yellow"
                      }`}
                    >
                      {selected.externalEvidence
                        ? t("externalEvidenceVerified")
                        : t("externalEvidencePending")}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                    <p className="text-cyber-text">
                      {selected.releaseArtifact.name} ·{" "}
                      {selected.releaseArtifact.repository}
                    </p>
                    <p className="text-cyber-purple">
                      {t("targetEnvironment")}:{" "}
                      {selected.targetEnvironment ?? "development"} ·{" "}
                      {selected.releasePolicy
                        ? `${selected.releasePolicy.policyId}@${selected.releasePolicy.version}`
                        : t("collectingData")}
                    </p>
                    <p className="break-all font-mono text-cyber-text-dim">
                      {selected.releaseArtifact.commitSha}
                    </p>
                    {selected.externalEvidence && (
                      <>
                        <p className="text-cyber-text-dim">
                          {selected.externalEvidence.receipt.payload.workflow} ·
                          run{" "}
                          {selected.externalEvidence.receipt.payload.runId}
                        </p>
                        <p className="text-cyber-text-dim">
                          {t("expiresAt")}{" "}
                          {selected.externalEvidence.receipt.payload.expiresAt}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              )}

              {selected.evaluation && (
                <div className="rounded-lg border border-cyber-green/30 bg-cyber-green/5 p-4">
                  <h3 className="font-semibold text-cyber-text">
                    {t("experimentEvaluation")}
                  </h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div>
                      <p className="text-xs text-cyber-text-dim">
                        {t("targetImprovement")}
                      </p>
                      <p className="text-xl font-bold text-cyber-green">
                        {selected.evaluation.targetImprovement.toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-cyber-text-dim">
                        {t("maximumRegression")}
                      </p>
                      <p className="text-xl font-bold text-cyber-text">
                        {selected.evaluation.maximumObservedRegression.toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-cyber-text-dim">
                        {t("replayIntegrity")}
                      </p>
                      <p className="text-xl font-bold text-cyber-green">
                        {selected.evaluation.deterministicReplay
                          ? t("verified")
                          : t("mismatch")}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {selected.canary && (
                <div className="rounded-lg border border-cyber-yellow/30 bg-cyber-yellow/5 p-4">
                  <h3 className="font-semibold text-cyber-text">
                    {t("canarySlo")}
                  </h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div>
                      <p className="text-xs text-cyber-text-dim">
                        {t("targetDirectionDelta")}
                      </p>
                      <p className="font-mono text-lg text-cyber-text">
                        {selected.canary.slo.observation?.targetDirectionDelta.toFixed(
                          2,
                        ) ?? t("pending")}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-cyber-text-dim">
                        {t("protectedMetricRegression")}
                      </p>
                      <p className="font-mono text-lg text-cyber-text">
                        {selected.canary.slo.observation?.maximumProtectedMetricRegression.toFixed(
                          2,
                        ) ?? t("pending")}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-cyber-text-dim">
                        {t("verifiedLoopRate")}
                      </p>
                      <p className="font-mono text-lg text-cyber-text">
                        {selected.canary.slo.observation
                          ? `${selected.canary.slo.observation.verifiedAutonomyLoopRate.toFixed(1)}%`
                          : t("pending")}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <p className="text-xs font-semibold text-cyber-text">
                      {t("activeAlerts")}
                    </p>
                    {selected.canary.alerts.length > 0 ? (
                      <ul className="mt-2 space-y-1">
                        {selected.canary.alerts.map((alert) => (
                          <li
                            key={alert.id}
                            className="text-xs text-cyber-red"
                          >
                            {alert.code}: {alert.message}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-xs text-cyber-green">
                        {t("noActiveAlerts")}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {selected.deployment && (
                <div className="rounded-lg border border-cyber-purple/30 bg-cyber-purple/5 p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="font-semibold text-cyber-text">
                      {t("deploymentSlo")}
                    </h3>
                    <span className="font-mono text-xs text-cyber-purple">
                      {selected.deployment.environment} ·{" "}
                      {selected.deployment.policyId}@
                      {selected.deployment.policyVersion} ·{" "}
                      {selected.deployment.adapterId} ·{" "}
                      {selected.deployment.deploymentId}
                    </span>
                    <span className="ml-auto text-lg font-bold text-cyber-text">
                      {selected.deployment.trafficPercent}%{" "}
                      {t("traffic")}
                    </span>
                  </div>
                  <p className="mt-2 font-mono text-xs text-cyber-text-dim">
                    {t("trafficStages")}:{" "}
                    {selected.deployment.trafficStages.join(" → ")}%
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-4">
                    <div>
                      <p className="text-xs text-cyber-text-dim">
                        {t("deploymentObservations")}
                      </p>
                      <p className="font-mono text-lg text-cyber-text">
                        {selected.deployment.observationCount}/
                        {selected.deployment.observationWindow}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-cyber-text-dim">
                        {t("errorRate")}
                      </p>
                      <p className="font-mono text-lg text-cyber-text">
                        {selected.deployment.slo.samples.at(-1)
                          ?.errorRatePercent ?? "—"}
                        %
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-cyber-text-dim">
                        {t("p95Latency")}
                      </p>
                      <p className="font-mono text-lg text-cyber-text">
                        {selected.deployment.slo.samples.at(-1)
                          ?.p95LatencyMs ?? "—"}
                        ms
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-cyber-text-dim">
                        {t("availability")}
                      </p>
                      <p className="font-mono text-lg text-cyber-text">
                        {selected.deployment.slo.samples.at(-1)
                          ?.availabilityPercent ?? "—"}
                        %
                      </p>
                    </div>
                  </div>
                  <div className="mt-3">
                    {selected.deployment.alerts.length > 0 ? (
                      <ul className="space-y-1">
                        {selected.deployment.alerts.map((alert) => (
                          <li
                            key={alert.id}
                            className="text-xs text-cyber-red"
                          >
                            {alert.code}: {alert.message}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-cyber-green">
                        {t("noActiveAlerts")}
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div>
                <div className="mb-3 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-cyber-blue" />
                  <h3 className="font-semibold text-cyber-text">
                    {t("qualityEvidence")}
                  </h3>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {selected.qualityEvidence.map((evidence) => (
                    <div
                      key={evidence.gate}
                      className="rounded-lg border border-cyber-gray/30 bg-cyber-black/20 p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-cyber-text">
                          {evidence.gate}
                        </span>
                        <span
                          className={`text-xs ${
                            evidence.status === "passed"
                              ? "text-cyber-green"
                              : evidence.status === "failed"
                                ? "text-cyber-red"
                                : "text-cyber-text-dim"
                          }`}
                        >
                          {evidence.status}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-cyber-text-dim">
                        {evidence.detail}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {selected.status === "proposed" &&
                  selected.changeScope === "policy" && (
                  <button
                    type="button"
                    onClick={() => act({ type: "run-experiment" })}
                    disabled={busy || role === "viewer"}
                    className="flex items-center gap-2 rounded-lg bg-cyber-blue px-3 py-2 text-sm font-semibold text-cyber-black disabled:opacity-40"
                  >
                    <Play className="h-4 w-4" />
                    {t("runControlledExperiment")}
                  </button>
                )}
                {selected.status === "proposed" &&
                  selected.changeScope !== "policy" && (
                    <div className="w-full rounded-lg border border-cyber-yellow/30 bg-cyber-yellow/5 p-4">
                      <label className="block space-y-2 text-sm text-cyber-text-dim">
                        <span>{t("attestationReceipt")}</span>
                        <textarea
                          aria-label={t("attestationReceipt")}
                          value={receiptJson}
                          onChange={(event) =>
                            setReceiptJson(event.target.value)
                          }
                          rows={8}
                          placeholder={t("attestationReceiptPlaceholder")}
                          className="w-full rounded-lg border border-cyber-yellow/30 bg-cyber-black p-3 font-mono text-xs text-cyber-text"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={attachEvidence}
                        disabled={
                          busy ||
                          role === "viewer" ||
                          receiptJson.trim().length === 0
                        }
                        className="mt-3 flex items-center gap-2 rounded-lg bg-cyber-yellow px-3 py-2 text-sm font-semibold text-cyber-black disabled:opacity-40"
                      >
                        <ShieldCheck className="h-4 w-4" />
                        {t("attachExternalEvidence")}
                      </button>
                    </div>
                  )}
                {selected.status === "pending-approval" && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        act({
                          type: "approve",
                          rationale: "Human reviewer accepts the verified evidence.",
                        })
                      }
                      disabled={busy || role !== "admin"}
                      className="flex items-center gap-2 rounded-lg bg-cyber-green px-3 py-2 text-sm font-semibold text-cyber-black disabled:opacity-40"
                    >
                      <ThumbsUp className="h-4 w-4" />
                      {t("approvePromotion")}
                    </button>
                    <button
                      type="button"
                      onClick={() => act({ type: "reject" })}
                      disabled={busy || role !== "admin"}
                      className="flex items-center gap-2 rounded-lg border border-cyber-red/40 px-3 py-2 text-sm text-cyber-red disabled:opacity-40"
                    >
                      <ThumbsDown className="h-4 w-4" />
                      {t("rejectPromotion")}
                    </button>
                  </>
                )}
                {selected.status === "approved" && (
                  <button
                    type="button"
                    onClick={() => act({ type: "start-canary" })}
                    disabled={busy || role !== "admin"}
                    className="flex items-center gap-2 rounded-lg bg-cyber-purple px-3 py-2 text-sm font-semibold text-cyber-black disabled:opacity-40"
                  >
                    <Rocket className="h-4 w-4" />
                    {t("startCanary")}
                  </button>
                )}
                {selected.status === "canary" && (
                  <>
                    <button
                      type="button"
                      onClick={() => act({ type: "observe-canary" })}
                      disabled={busy || role !== "admin"}
                      className="flex items-center gap-2 rounded-lg bg-cyber-yellow px-3 py-2 text-sm font-semibold text-cyber-black disabled:opacity-40"
                    >
                      <RotateCcw className="h-4 w-4" />
                      {t("observeCanary")}
                    </button>
                    <button
                      type="button"
                      onClick={() => act({ type: "drill-rollback" })}
                      disabled={busy || role !== "admin"}
                      className="flex items-center gap-2 rounded-lg border border-cyber-red/50 bg-cyber-red/10 px-3 py-2 text-sm font-semibold text-cyber-red disabled:opacity-40"
                    >
                      <RotateCcw className="h-4 w-4" />
                      {t("rollbackDrill")}
                    </button>
                  </>
                )}
              </div>

              <div>
                <h3 className="mb-3 font-semibold text-cyber-text">
                  {t("immutableDecisionLog")}
                </h3>
                <div className="space-y-2">
                  {decisions.map((decision) => (
                    <div
                      key={decision.cursor}
                      className="grid grid-cols-[auto_1fr_auto] gap-3 rounded-lg border border-cyber-gray/30 bg-cyber-black/20 p-3 text-xs"
                    >
                      <span className="font-mono text-cyber-blue">
                        #{decision.cursor}
                      </span>
                      <span className="text-cyber-text">{decision.type}</span>
                      <span className="text-cyber-text-dim">
                        {decision.actorId}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-h-72 items-center justify-center text-cyber-text-dim">
              {t("selectOrGenerateImprovement")}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
