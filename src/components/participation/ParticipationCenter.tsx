"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  FileText,
  MessagesSquare,
  RefreshCw,
  ShieldAlert,
  Users,
  Vote,
} from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import type { TranslationKey } from "@/i18n/translations";
import type {
  DeliberationStatement,
  DeliberationStatus,
  ExplanationSubjectKind,
  FeedbackCase,
  FeedbackKind,
  FeedbackStatus,
  FeedbackTargetKind,
  GoalDeliberation,
  ObjectiveChangeProposal,
  ParticipationOverview,
  StakeholderGroup,
} from "@/participation/types";

async function loadParticipationData(
  signal?: AbortSignal,
): Promise<ParticipationOverview> {
  const response = await fetch("/api/participation", {
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    throw new Error(`Participation request failed with ${response.status}`);
  }
  return response.json() as Promise<ParticipationOverview>;
}

const GREEN = "border-cyber-green/40 bg-cyber-green/10 text-cyber-green";
const RED = "border-cyber-red/40 bg-cyber-red/10 text-cyber-red";
const YELLOW = "border-cyber-yellow/40 bg-cyber-yellow/10 text-cyber-yellow";

function deliberationTone(status: DeliberationStatus): string {
  if (status === "approved" || status === "applied") {
    return GREEN;
  }
  if (status === "rejected") {
    return RED;
  }
  return YELLOW;
}

function feedbackTone(status: FeedbackStatus): string {
  if (
    status === "answered" ||
    status === "upheld" ||
    status === "closed"
  ) {
    return GREEN;
  }
  if (status === "dismissed" || status === "overturned") {
    return RED;
  }
  return YELLOW;
}

function groupTone(status: StakeholderGroup["status"]): string {
  return status === "active" ? GREEN : YELLOW;
}

function stanceTone(stance: DeliberationStatement["stance"]): string {
  if (stance === "support") {
    return GREEN;
  }
  if (stance === "oppose") {
    return RED;
  }
  return YELLOW;
}

const DELIBERATION_STATUS_KEYS: Record<DeliberationStatus, TranslationKey> = {
  draft: "deliberationStatus_draft",
  open: "deliberationStatus_open",
  simulated: "deliberationStatus_simulated",
  approved: "deliberationStatus_approved",
  rejected: "deliberationStatus_rejected",
  applied: "deliberationStatus_applied",
  withdrawn: "deliberationStatus_withdrawn",
};

const FEEDBACK_STATUS_KEYS: Record<FeedbackStatus, TranslationKey> = {
  submitted: "feedbackStatus_submitted",
  triaged: "feedbackStatus_triaged",
  "in-review": "feedbackStatus_inReview",
  answered: "feedbackStatus_answered",
  appealed: "feedbackStatus_appealed",
  upheld: "feedbackStatus_upheld",
  overturned: "feedbackStatus_overturned",
  dismissed: "feedbackStatus_dismissed",
  closed: "feedbackStatus_closed",
};

const FEEDBACK_KIND_KEYS: Record<FeedbackKind, TranslationKey> = {
  correction: "feedbackKind_correction",
  objection: "feedbackKind_objection",
  evidence: "feedbackKind_evidence",
  appeal: "feedbackKind_appeal",
};

const STANCE_KEYS: Record<DeliberationStatement["stance"], TranslationKey> = {
  support: "stanceSupport",
  oppose: "stanceOppose",
  question: "stanceQuestion",
  amendment: "stanceAmendment",
};

const INCOME_BAND_KEYS: Record<StakeholderGroup["incomeBand"], TranslationKey> = {
  low: "incomeBand_low",
  middle: "incomeBand_middle",
  high: "incomeBand_high",
};

const VULNERABILITY_KEYS: Record<
  StakeholderGroup["vulnerability"],
  TranslationKey
> = {
  standard: "vulnerability_standard",
  elevated: "vulnerability_elevated",
  high: "vulnerability_high",
};

const GROUP_STATUS_KEYS: Record<StakeholderGroup["status"], TranslationKey> = {
  active: "groupStatus_active",
  superseded: "groupStatus_superseded",
};

const DIRECTION_KEYS: Record<
  ObjectiveChangeProposal["direction"],
  TranslationKey
> = {
  increase: "directionIncrease",
  decrease: "directionDecrease",
  maintain: "directionMaintain",
};

const SCOPE_KEYS: Record<ObjectiveChangeProposal["scope"], TranslationKey> = {
  city: "scopeCity",
  organization: "scopeOrganization",
  scenario: "scopeScenario",
};

const FEEDBACK_KINDS: FeedbackKind[] = [
  "correction",
  "objection",
  "evidence",
  "appeal",
];

const FEEDBACK_TARGET_KINDS: FeedbackTargetKind[] = [
  "incident",
  "decision",
  "deployment",
  "outcome",
  "lesson",
  "objective",
  "explanation",
];

const STANCES: DeliberationStatement["stance"][] = [
  "support",
  "oppose",
  "question",
  "amendment",
];

type FeedbackFormMode = "triage" | "respond" | "appeal" | "resolve-appeal";

const inputClass =
  "w-full rounded-lg border border-cyber-blue/30 bg-cyber-black/50 px-3 py-2 text-sm text-cyber-text";
const labelClass = "mb-1 block text-xs text-cyber-text-dim";
const sectionClass =
  "rounded-xl border border-cyber-blue/20 bg-cyber-dark/60 p-4 sm:p-5";
const actionButtonClass =
  "rounded-lg border border-cyber-blue/40 px-3 py-2 text-xs text-cyber-blue disabled:opacity-50";

export default function ParticipationCenter() {
  const { t, language } = useTranslation();
  const [overview, setOverview] = useState<ParticipationOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");

  const [showOpenDeliberation, setShowOpenDeliberation] = useState(false);
  const [baseObjectiveVersion, setBaseObjectiveVersion] = useState("");
  const [baseWeight, setBaseWeight] = useState("1");
  const [proposalMetric, setProposalMetric] = useState("");
  const [proposalDirection, setProposalDirection] =
    useState<ObjectiveChangeProposal["direction"]>("increase");
  const [proposalTarget, setProposalTarget] = useState("");
  const [proposalWeight, setProposalWeight] = useState("1");
  const [proposalScope, setProposalScope] =
    useState<ObjectiveChangeProposal["scope"]>("city");
  const [proposalOwner, setProposalOwner] = useState("");

  const [statementFor, setStatementFor] = useState<string | null>(null);
  const [statementStance, setStatementStance] =
    useState<DeliberationStatement["stance"]>("support");
  const [statementText, setStatementText] = useState("");

  const [showSubmitFeedback, setShowSubmitFeedback] = useState(false);
  const [feedbackKind, setFeedbackKind] = useState<FeedbackKind>("correction");
  const [feedbackTargetKind, setFeedbackTargetKind] =
    useState<FeedbackTargetKind>("incident");
  const [feedbackTargetId, setFeedbackTargetId] = useState("");
  const [feedbackSummary, setFeedbackSummary] = useState("");

  const [feedbackForm, setFeedbackForm] = useState<{
    id: string;
    mode: FeedbackFormMode;
  } | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [appealOutcome, setAppealOutcome] = useState<"upheld" | "overturned">(
    "upheld",
  );
  const [appealActions, setAppealActions] = useState("");
  const [explanationKind, setExplanationKind] =
    useState<Extract<
      ExplanationSubjectKind,
      "decision" | "incident" | "outcome"
    >>("decision");
  const [explanationSubjectId, setExplanationSubjectId] =
    useState("");

  const date = useCallback(
    (value: string) =>
      new Intl.DateTimeFormat(
        language === "zh" ? "zh-CN" : "en-US",
        {
          dateStyle: "medium",
          timeStyle: "short",
        },
      ).format(new Date(value)),
    [language],
  );

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setOverview(await loadParticipationData());
      setStatusMessage(t("participationDataRefreshed"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }, [t]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    loadParticipationData(controller.signal)
      .then((result) => {
        if (active) {
          setOverview(result);
          setStatusMessage(t("participationDataRefreshed"));
        }
      })
      .catch((cause: unknown) => {
        if (
          active &&
          !(cause instanceof DOMException && cause.name === "AbortError")
        ) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      })
      .finally(() => {
        if (active) {
          setBusy(false);
        }
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [t]);

  const act = async (body: Record<string, unknown>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/participation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      }
      setStatusMessage(t("participationActionCompleted"));
      await refresh();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
      return false;
    }
  };

  const submitOpenDeliberation = async () => {
    const ok = await act({
      action: "open-deliberation",
      baseObjectiveVersion,
      baseWeight: Number(baseWeight),
      proposal: {
        metric: proposalMetric,
        direction: proposalDirection,
        target: Number(proposalTarget),
        weight: Number(proposalWeight),
        scope: proposalScope,
        owner: proposalOwner,
      },
    });
    if (ok) {
      setShowOpenDeliberation(false);
      setBaseObjectiveVersion("");
      setProposalMetric("");
      setProposalTarget("");
      setProposalOwner("");
    }
  };

  const registerReferenceGroup = async () => {
    await act({
      action: "register-group",
      name: "Synthetic Riverside Tenants",
      districtId: "district-riverside",
      incomeBand: "low",
      serviceAccess: 42,
      vulnerability: "elevated",
      populationSharePercent: 12,
      weight: 1.2,
      protectedMetrics: [
        "vulnerable-service-access",
        "energy-continuity",
      ],
      severeBurdenThreshold: 8,
      version: "1.0.0",
    });
  };

  const advanceDeliberation = async (
    deliberation: GoalDeliberation,
    action:
      | "simulate-deliberation"
      | "approve"
      | "reject"
      | "apply-deliberation",
  ) => {
    if (action === "simulate-deliberation") {
      await act({
        action,
        deliberationId: deliberation.id,
      });
      return;
    }
    if (action === "apply-deliberation") {
      await act({
        action,
        deliberationId: deliberation.id,
      });
      return;
    }
    await act({
      action: "decide-deliberation",
      deliberationId: deliberation.id,
      outcome: action === "approve" ? "approved" : "rejected",
      approvalNote:
        "Authenticated human review of the synthetic impact simulation.",
      note:
        action === "approve"
          ? "Approved after discussion and protected-group impact review."
          : "Rejected after discussion and protected-group impact review.",
    });
  };

  const submitStatement = async (deliberationId: string) => {
    const ok = await act({
      action: "add-statement",
      deliberationId,
      stance: statementStance,
      text: statementText,
    });
    if (ok) {
      setStatementFor(null);
      setStatementText("");
    }
  };

  const submitNewFeedback = async () => {
    const ok = await act({
      action: "submit-feedback",
      kind: feedbackKind,
      target: feedbackTargetId.trim()
        ? { kind: feedbackTargetKind, id: feedbackTargetId.trim() }
        : undefined,
      summary: feedbackSummary,
    });
    if (ok) {
      setShowSubmitFeedback(false);
      setFeedbackTargetId("");
      setFeedbackSummary("");
    }
  };

  const openFeedbackForm = (id: string, mode: FeedbackFormMode) => {
    setFeedbackForm({ id, mode });
    setFeedbackText("");
    setAppealActions("");
    setAppealOutcome("upheld");
  };

  const submitFeedbackForm = async (kase: FeedbackCase) => {
    if (!feedbackForm) {
      return;
    }
    let body: Record<string, unknown>;
    if (feedbackForm.mode === "triage") {
      body = {
        action: "triage-feedback",
        feedbackId: kase.id,
        owner: feedbackText.trim() ? feedbackText.trim() : undefined,
      };
    } else if (feedbackForm.mode === "respond") {
      body = {
        action: "respond-feedback",
        feedbackId: kase.id,
        text: feedbackText,
      };
    } else if (feedbackForm.mode === "appeal") {
      body = {
        action: "submit-feedback",
        kind: "appeal",
        target: kase.target,
        summary: feedbackText,
        appealOfCaseId: kase.id,
      };
    } else {
      let actions: unknown = [{ type: "note-only" }];
      if (appealActions.trim()) {
        try {
          actions = JSON.parse(appealActions);
        } catch {
          setError(t("invalidActionsJson"));
          return;
        }
      }
      body = {
        action: "resolve-appeal",
        feedbackId: kase.id,
        outcome: appealOutcome,
        note: feedbackText,
        actions,
      };
    }
    const ok = await act(body);
    if (ok) {
      setFeedbackForm(null);
      setFeedbackText("");
      setAppealActions("");
    }
  };

  const publishExplanation = async () => {
    const ok = await act({
      action: "publish-explanation",
      subject: {
        kind: explanationKind,
        id: explanationSubjectId,
      },
      uncertaintyCodes: [
        "synthetic-projection",
        "delayed-outcome-may-revise",
      ],
    });
    if (ok) {
      setExplanationSubjectId("");
    }
  };

  const feedbackFormSubmitKey: Record<FeedbackFormMode, TranslationKey> = {
    triage: "triage",
    respond: "respond",
    appeal: "appeal",
    "resolve-appeal": "resolveAppeal",
  };

  const feedbackFormInputKey = (mode: FeedbackFormMode): TranslationKey => {
    if (mode === "triage") {
      return "owner";
    }
    if (mode === "respond") {
      return "responseText";
    }
    if (mode === "appeal") {
      return "feedbackSummary";
    }
    return "resolutionNote";
  };

  const cards = overview
    ? [
        {
          label: t("activeGroups"),
          value: overview.summary.activeGroupCount,
          icon: Users,
          style: "text-cyber-green",
        },
        {
          label: t("openDeliberations"),
          value: overview.summary.openDeliberationCount,
          icon: Vote,
          style: "text-cyber-blue",
        },
        {
          label: t("openFeedback"),
          value: overview.summary.openFeedbackCount,
          icon: MessagesSquare,
          style: "text-cyber-yellow",
        },
        {
          label: t("slaBreaches"),
          value: overview.summary.breachedSlaCount,
          icon: AlertTriangle,
          style:
            overview.summary.breachedSlaCount > 0
              ? "text-cyber-red"
              : "text-cyber-green",
        },
      ]
    : [];

  return (
    <div className="space-y-6 p-4 sm:p-6" data-testid="participation-center">
      <motion.header
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-start gap-3"
      >
        <div className="rounded-lg border border-cyber-blue/30 bg-cyber-blue/10 p-2">
          <Vote className="h-6 w-6 text-cyber-blue" />
        </div>
        <div>
          <h1 className="font-orbitron text-2xl font-bold text-cyber-blue sm:text-3xl">
            {t("participationTitle")}
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-cyber-text-dim">
            {t("participationDesc")}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={busy}
            className="flex items-center gap-2 rounded-lg border border-cyber-blue/40 px-3 py-2 text-sm text-cyber-text disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
            {t("refresh")}
          </button>
        </div>
      </motion.header>

      <div
        data-testid="synthetic-boundary"
        role="note"
        className="rounded-xl border border-cyber-yellow/40 bg-cyber-yellow/10 p-4 text-sm text-cyber-yellow"
      >
        <span className="font-orbitron font-bold">{t("syntheticTag")}</span>
        {" — "}
        {t("syntheticBoundary")}:{" "}
        {overview?.syntheticBoundary ?? t("collectingData")}
      </div>

      <p className="sr-only" aria-live="polite" role="status">
        {statusMessage}
      </p>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-cyber-red/40 bg-cyber-red/10 p-4 text-sm text-cyber-red"
        >
          {error}
        </p>
      )}
      {busy && !overview && (
        <p className="text-sm text-cyber-text-dim">{t("collectingData")}</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <article
              key={card.label}
              className="rounded-xl border border-cyber-blue/20 bg-cyber-dark/60 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-cyber-text-dim">
                  {card.label}
                </span>
                <Icon className={`h-4 w-4 ${card.style}`} />
              </div>
              <p className={`mt-2 text-3xl font-bold ${card.style}`}>
                {card.value}
              </p>
            </article>
          );
        })}
      </div>

      <section className={sectionClass}>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Users className="h-5 w-5 text-cyber-blue" />
          <h2 className="font-orbitron text-lg text-cyber-text">
            {t("stakeholderGroups")}
          </h2>
          {(overview?.summary.activeGroupCount ?? 0) === 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void registerReferenceGroup()}
              className={`ml-auto ${actionButtonClass}`}
            >
              {t("registerReferenceGroup")}
            </button>
          )}
        </div>
        <div className="overflow-x-auto" tabIndex={0}>
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className="border-b border-cyber-gray/40 text-xs uppercase text-cyber-text-dim">
                <th className="p-3">{t("groupName")}</th>
                <th className="p-3">{t("groupDistrict")}</th>
                <th className="p-3">{t("incomeBand")}</th>
                <th className="p-3">{t("vulnerability")}</th>
                <th className="p-3">{t("populationShare")}</th>
                <th className="p-3">{t("groupWeight")}</th>
                <th className="p-3">{t("protectedMetrics")}</th>
                <th className="p-3">{t("groupVersion")}</th>
                <th className="p-3">{t("status")}</th>
              </tr>
            </thead>
            <tbody>
              {(overview?.stakeholderGroups ?? []).map((group) => (
                <tr key={group.id} className="border-b border-cyber-gray/20">
                  <td className="p-3 text-cyber-text">{group.name}</td>
                  <td className="p-3 text-cyber-text">{group.districtId}</td>
                  <td className="p-3 text-cyber-text">
                    {t(INCOME_BAND_KEYS[group.incomeBand])}
                  </td>
                  <td className="p-3 text-cyber-text">
                    {t(VULNERABILITY_KEYS[group.vulnerability])}
                  </td>
                  <td className="p-3 text-cyber-text">
                    {group.populationSharePercent}%
                  </td>
                  <td className="p-3 text-cyber-text">{group.weight}</td>
                  <td className="p-3 text-cyber-text-dim">
                    {group.protectedMetrics.join(", ") || "—"}
                  </td>
                  <td className="p-3 font-mono text-xs text-cyber-blue">
                    {group.version}
                  </td>
                  <td className="p-3">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs ${groupTone(group.status)}`}
                    >
                      {t(GROUP_STATUS_KEYS[group.status])}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(overview?.stakeholderGroups.length ?? 0) === 0 && (
            <p className="p-4 text-sm text-cyber-text-dim">
              {t("noStakeholderGroups")}
            </p>
          )}
        </div>
      </section>

      <section className={sectionClass}>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Vote className="h-5 w-5 text-cyber-purple" />
          <h2 className="font-orbitron text-lg text-cyber-text">
            {t("goalDeliberations")}
          </h2>
          <button
            type="button"
            disabled={busy}
            onClick={() => setShowOpenDeliberation((current) => !current)}
            aria-expanded={showOpenDeliberation}
            className={`ml-auto ${actionButtonClass}`}
          >
            {t("openDeliberation")}
          </button>
        </div>

        {showOpenDeliberation && (
          <div className="mb-4 grid gap-3 rounded-lg border border-cyber-gray/30 p-3 sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <label htmlFor="deliberation-base-version" className={labelClass}>
                {t("baseObjectiveVersion")}
              </label>
              <input
                id="deliberation-base-version"
                value={baseObjectiveVersion}
                onChange={(event) =>
                  setBaseObjectiveVersion(event.target.value)
                }
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="deliberation-base-weight" className={labelClass}>
                {t("baseWeight")}
              </label>
              <input
                id="deliberation-base-weight"
                type="number"
                value={baseWeight}
                onChange={(event) => setBaseWeight(event.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="deliberation-metric" className={labelClass}>
                {t("metric")}
              </label>
              <input
                id="deliberation-metric"
                value={proposalMetric}
                onChange={(event) => setProposalMetric(event.target.value)}
                placeholder="employment"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="deliberation-direction" className={labelClass}>
                {t("direction")}
              </label>
              <select
                id="deliberation-direction"
                value={proposalDirection}
                onChange={(event) =>
                  setProposalDirection(
                    event.target.value as ObjectiveChangeProposal["direction"],
                  )
                }
                className={inputClass}
              >
                <option value="increase">{t("directionIncrease")}</option>
                <option value="decrease">{t("directionDecrease")}</option>
                <option value="maintain">{t("directionMaintain")}</option>
              </select>
            </div>
            <div>
              <label htmlFor="deliberation-target" className={labelClass}>
                {t("target")}
              </label>
              <input
                id="deliberation-target"
                type="number"
                value={proposalTarget}
                onChange={(event) => setProposalTarget(event.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="deliberation-weight" className={labelClass}>
                {t("groupWeight")}
              </label>
              <input
                id="deliberation-weight"
                type="number"
                value={proposalWeight}
                onChange={(event) => setProposalWeight(event.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="deliberation-scope" className={labelClass}>
                {t("scope")}
              </label>
              <select
                id="deliberation-scope"
                value={proposalScope}
                onChange={(event) =>
                  setProposalScope(
                    event.target.value as ObjectiveChangeProposal["scope"],
                  )
                }
                className={inputClass}
              >
                <option value="city">{t("scopeCity")}</option>
                <option value="organization">{t("scopeOrganization")}</option>
                <option value="scenario">{t("scopeScenario")}</option>
              </select>
            </div>
            <div>
              <label htmlFor="deliberation-owner" className={labelClass}>
                {t("owner")}
              </label>
              <input
                id="deliberation-owner"
                value={proposalOwner}
                onChange={(event) => setProposalOwner(event.target.value)}
                className={inputClass}
              />
            </div>
            <div className="flex items-end gap-2 sm:col-span-2 xl:col-span-4">
              <button
                type="button"
                disabled={
                  busy ||
                  !baseObjectiveVersion.trim() ||
                  !proposalMetric.trim() ||
                  !proposalTarget.trim() ||
                  !proposalOwner.trim()
                }
                onClick={() => void submitOpenDeliberation()}
                className="rounded-lg border border-cyber-green/40 px-3 py-2 text-xs text-cyber-green disabled:opacity-50"
              >
                {t("openDeliberation")}
              </button>
              <button
                type="button"
                onClick={() => setShowOpenDeliberation(false)}
                className={actionButtonClass}
              >
                {t("cancel")}
              </button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {(overview?.deliberations ?? []).map((deliberation) => (
            <article
              key={deliberation.id}
              className="rounded-lg border border-cyber-gray/40 bg-cyber-black/20 p-4"
              data-testid="goal-deliberation"
            >
              <div className="flex flex-wrap items-center gap-2">
                <code className="text-xs text-cyber-blue">
                  {deliberation.id}
                </code>
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs ${deliberationTone(deliberation.status)}`}
                >
                  {t(DELIBERATION_STATUS_KEYS[deliberation.status])}
                </span>
                <span className="rounded-full border border-cyber-gray/40 px-2 py-0.5 text-xs text-cyber-text-dim">
                  {deliberation.proposerPrincipal}
                </span>
              </div>
              <p className="mt-2 text-sm text-cyber-text">
                {t("proposal")}: {deliberation.proposal.metric} ·{" "}
                {t(DIRECTION_KEYS[deliberation.proposal.direction])} ·{" "}
                {t("target")} {deliberation.proposal.target} ·{" "}
                {t("groupWeight")} {deliberation.proposal.weight} ·{" "}
                {t("scope")} {t(SCOPE_KEYS[deliberation.proposal.scope])} ·{" "}
                {t("owner")} {deliberation.proposal.owner}
              </p>
              <p className="mt-1 text-xs text-cyber-text-dim">
                {t("proposedBy")}: {deliberation.proposedBy} ·{" "}
                {t("baseObjectiveVersion")}: {deliberation.baseObjectiveVersion}{" "}
                · {t("weightDelta")}: {deliberation.weightDelta} ·{" "}
                {date(deliberation.createdAt)}
              </p>

              <div className="mt-3">
                <h3 className="text-xs uppercase text-cyber-text-dim">
                  {t("statements")}
                </h3>
                <ul className="mt-1 space-y-1">
                  {deliberation.statements.map((statement) => (
                    <li
                      key={statement.id}
                      className="flex flex-wrap items-center gap-2 text-sm"
                    >
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs ${stanceTone(statement.stance)}`}
                      >
                        {t(STANCE_KEYS[statement.stance])}
                      </span>
                      <span className="text-cyber-text">{statement.text}</span>
                      <span className="text-xs text-cyber-text-dim">
                        {statement.actorId} · {date(statement.submittedAt)}
                      </span>
                    </li>
                  ))}
                  {deliberation.statements.length === 0 && (
                    <li className="text-xs text-cyber-text-dim">—</li>
                  )}
                </ul>
              </div>

              {deliberation.simulation && (
                <div className="mt-3 rounded-lg border border-cyber-purple/30 p-3 text-xs">
                  <p className="text-cyber-text-dim">
                    {t("simulation")} · {date(deliberation.simulation.simulatedAt)}
                  </p>
                  {deliberation.simulation.severeHarmGroupIds.length > 0 ? (
                    <p className="mt-1 text-cyber-red">
                      {t("severeHarmGroups")}:{" "}
                      {deliberation.simulation.severeHarmGroupIds.join(", ")} —{" "}
                      {t("minorityHarmBlocked")}
                    </p>
                  ) : (
                    <p className="mt-1 text-cyber-green">
                      {t("severeHarm")}: 0
                    </p>
                  )}
                </div>
              )}

              {deliberation.decision && (
                <div className="mt-3 rounded-lg border border-cyber-gray/30 p-3 text-xs">
                  <span
                    className={`rounded-full border px-2 py-0.5 ${
                      deliberation.decision.outcome === "approved"
                        ? GREEN
                        : RED
                    }`}
                  >
                    {t(
                      deliberation.decision.outcome === "approved"
                        ? "deliberationStatus_approved"
                        : "deliberationStatus_rejected",
                    )}
                  </span>
                  <span className="ml-2 text-cyber-text-dim">
                    {t("approvals")}: {deliberation.decision.approvals.length}/
                    {deliberation.decision.requiredApprovals}
                  </span>
                  <p className="mt-1 text-cyber-text">
                    {deliberation.decision.note}
                  </p>
                </div>
              )}
              {(deliberation.pendingApprovals?.length ?? 0) > 0 &&
                !deliberation.decision && (
                  <p className="mt-2 text-xs text-cyber-yellow">
                    {t("pendingApprovals")}:{" "}
                    {deliberation.pendingApprovals
                      ?.map((approval) => approval.actorId)
                      .join(", ")}
                  </p>
                )}
              {deliberation.appliedObjectiveVersion && (
                <p className="mt-2 text-xs text-cyber-text-dim">
                  {t("appliedObjectiveVersion")}:{" "}
                  {deliberation.appliedObjectiveVersion}
                </p>
              )}

              {(deliberation.status === "open" ||
                deliberation.status === "simulated") &&
                (statementFor === deliberation.id ? (
                  <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-cyber-gray/30 p-3">
                    <div>
                      <label
                        htmlFor={`stance-${deliberation.id}`}
                        className={labelClass}
                      >
                        {t("stance")}
                      </label>
                      <select
                        id={`stance-${deliberation.id}`}
                        value={statementStance}
                        onChange={(event) =>
                          setStatementStance(
                            event.target
                              .value as DeliberationStatement["stance"],
                          )
                        }
                        className={inputClass}
                      >
                        {STANCES.map((stance) => (
                          <option key={stance} value={stance}>
                            {t(STANCE_KEYS[stance])}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="min-w-[200px] flex-1">
                      <label
                        htmlFor={`statement-${deliberation.id}`}
                        className={labelClass}
                      >
                        {t("statementText")}
                      </label>
                      <input
                        id={`statement-${deliberation.id}`}
                        value={statementText}
                        onChange={(event) =>
                          setStatementText(event.target.value)
                        }
                        className={inputClass}
                      />
                    </div>
                    <button
                      type="button"
                      disabled={busy || !statementText.trim()}
                      onClick={() => void submitStatement(deliberation.id)}
                      className="rounded-lg border border-cyber-green/40 px-3 py-2 text-xs text-cyber-green disabled:opacity-50"
                    >
                      {t("addStatement")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatementFor(null)}
                      className={actionButtonClass}
                    >
                      {t("cancel")}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setStatementFor(deliberation.id);
                      setStatementText("");
                      setStatementStance("support");
                    }}
                    className={`mt-3 ${actionButtonClass}`}
                  >
                    {t("addStatement")}
                  </button>
                ))}
              <div className="mt-3 flex flex-wrap gap-2">
                {deliberation.status === "open" &&
                  deliberation.statements.length > 0 && (
                    <button
                      type="button"
                      disabled={
                        busy ||
                        (overview?.summary.activeGroupCount ?? 0) === 0
                      }
                      onClick={() =>
                        void advanceDeliberation(
                          deliberation,
                          "simulate-deliberation",
                        )
                      }
                      className={actionButtonClass}
                    >
                      {t("simulateImpacts")}
                    </button>
                  )}
                {deliberation.status === "simulated" && (
                  <>
                    <button
                      type="button"
                      disabled={
                        busy ||
                        (
                          deliberation.simulation
                            ?.severeHarmGroupIds.length ?? 0
                        ) > 0
                      }
                      onClick={() =>
                        void advanceDeliberation(
                          deliberation,
                          "approve",
                        )
                      }
                      className="rounded-lg border border-cyber-green/40 px-3 py-2 text-xs text-cyber-green disabled:opacity-50"
                    >
                      {t("approveGoal")}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void advanceDeliberation(
                          deliberation,
                          "reject",
                        )
                      }
                      className="rounded-lg border border-cyber-red/40 px-3 py-2 text-xs text-cyber-red disabled:opacity-50"
                    >
                      {t("rejectGoal")}
                    </button>
                  </>
                )}
                {deliberation.status === "approved" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void advanceDeliberation(
                        deliberation,
                        "apply-deliberation",
                      )
                    }
                    className="rounded-lg border border-cyber-blue/40 px-3 py-2 text-xs text-cyber-blue disabled:opacity-50"
                  >
                    {t("applyGoal")}
                  </button>
                )}
              </div>
            </article>
          ))}
          {(overview?.deliberations.length ?? 0) === 0 && (
            <p className="text-sm text-cyber-text-dim">{t("noDeliberations")}</p>
          )}
        </div>
      </section>

      <section className={sectionClass}>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <MessagesSquare className="h-5 w-5 text-cyber-yellow" />
          <h2 className="font-orbitron text-lg text-cyber-text">
            {t("feedbackQueue")}
          </h2>
          <button
            type="button"
            disabled={busy}
            onClick={() => setShowSubmitFeedback((current) => !current)}
            aria-expanded={showSubmitFeedback}
            className={`ml-auto ${actionButtonClass}`}
          >
            {t("submitFeedback")}
          </button>
        </div>

        {showSubmitFeedback && (
          <div className="mb-4 grid gap-3 rounded-lg border border-cyber-gray/30 p-3 sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <label htmlFor="feedback-kind" className={labelClass}>
                {t("feedbackKindLabel")}
              </label>
              <select
                id="feedback-kind"
                value={feedbackKind}
                onChange={(event) =>
                  setFeedbackKind(event.target.value as FeedbackKind)
                }
                className={inputClass}
              >
                {FEEDBACK_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {t(FEEDBACK_KIND_KEYS[kind])}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="feedback-target-kind" className={labelClass}>
                {t("feedbackTargetKind")}
              </label>
              <select
                id="feedback-target-kind"
                value={feedbackTargetKind}
                onChange={(event) =>
                  setFeedbackTargetKind(
                    event.target.value as FeedbackTargetKind,
                  )
                }
                className={inputClass}
              >
                {FEEDBACK_TARGET_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="feedback-target-id" className={labelClass}>
                {t("feedbackTargetId")}
              </label>
              <input
                id="feedback-target-id"
                value={feedbackTargetId}
                onChange={(event) => setFeedbackTargetId(event.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="feedback-summary" className={labelClass}>
                {t("feedbackSummary")}
              </label>
              <input
                id="feedback-summary"
                value={feedbackSummary}
                onChange={(event) => setFeedbackSummary(event.target.value)}
                className={inputClass}
              />
            </div>
            <div className="flex items-end gap-2 sm:col-span-2 xl:col-span-4">
              <button
                type="button"
                disabled={busy || !feedbackSummary.trim()}
                onClick={() => void submitNewFeedback()}
                className="rounded-lg border border-cyber-green/40 px-3 py-2 text-xs text-cyber-green disabled:opacity-50"
              >
                {t("submitFeedback")}
              </button>
              <button
                type="button"
                onClick={() => setShowSubmitFeedback(false)}
                className={actionButtonClass}
              >
                {t("cancel")}
              </button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {(overview?.feedbackCases ?? []).map((kase) => (
            <article
              key={kase.id}
              className="rounded-lg border border-cyber-gray/40 bg-cyber-black/20 p-4"
              data-testid="feedback-case"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-cyber-blue/40 bg-cyber-blue/10 px-2 py-0.5 text-xs text-cyber-blue">
                  {t(FEEDBACK_KIND_KEYS[kase.kind])}
                </span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs ${feedbackTone(kase.status)}`}
                >
                  {t(FEEDBACK_STATUS_KEYS[kase.status])}
                </span>
                {kase.breachedSla && (
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs ${RED}`}
                  >
                    {t("slaBreached")}
                  </span>
                )}
                <code className="ml-auto text-xs text-cyber-blue">
                  {kase.id}
                </code>
              </div>
              <h3 className="mt-2 font-semibold text-cyber-text">
                {kase.summary}
              </h3>
              <p className="mt-1 text-xs text-cyber-text-dim">
                {t("feedbackTarget")}: {kase.target.kind}:{kase.target.id} ·{" "}
                {t("slaDue")}: {date(kase.slaDueAt)} · {kase.submittedBy} ·{" "}
                {date(kase.createdAt)}
              </p>
              {kase.owner && (
                <p className="mt-1 text-xs text-cyber-text-dim">
                  {t("owner")}: {kase.owner}
                </p>
              )}
              {kase.appealOfCaseId && (
                <p className="mt-1 text-xs text-cyber-text-dim">
                  {t("appealOfCaseId")}: {kase.appealOfCaseId}
                </p>
              )}
              {kase.response && (
                <p className="mt-2 text-sm text-cyber-text">
                  <span className="text-cyber-text-dim">
                    {t("response")}:{" "}
                  </span>
                  {kase.response.text}{" "}
                  <span className="text-xs text-cyber-text-dim">
                    ({kase.response.respondedBy} ·{" "}
                    {date(kase.response.respondedAt)})
                  </span>
                </p>
              )}
              {kase.resolution && (
                <p className="mt-2 text-xs text-cyber-text-dim">
                  {t("resolution")}:{" "}
                  {t(FEEDBACK_STATUS_KEYS[kase.resolution.outcome])} ·{" "}
                  {t("resolutionActions")}:{" "}
                  {kase.resolution.actions
                    .map((entry) => entry.type)
                    .join(", ") || "—"}{" "}
                  · {kase.resolution.resolvedBy}
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                {kase.status === "submitted" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => openFeedbackForm(kase.id, "triage")}
                    className={actionButtonClass}
                  >
                    {t("triage")}
                  </button>
                )}
                {kase.status === "triaged" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void act({
                        action: "start-review",
                        feedbackId: kase.id,
                      })
                    }
                    className={actionButtonClass}
                  >
                    {t("startReview")}
                  </button>
                )}
                {kase.status === "in-review" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => openFeedbackForm(kase.id, "respond")}
                    className={actionButtonClass}
                  >
                    {t("respond")}
                  </button>
                )}
                {kase.status === "answered" && kase.kind !== "appeal" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => openFeedbackForm(kase.id, "appeal")}
                    className="rounded-lg border border-cyber-yellow/40 px-3 py-2 text-xs text-cyber-yellow disabled:opacity-50"
                  >
                    {t("appeal")}
                  </button>
                )}
                {kase.status === "appealed" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => openFeedbackForm(kase.id, "resolve-appeal")}
                    className="rounded-lg border border-cyber-yellow/40 px-3 py-2 text-xs text-cyber-yellow disabled:opacity-50"
                  >
                    {t("resolveAppeal")}
                  </button>
                )}
                {(kase.status === "answered" ||
                  kase.status === "upheld" ||
                  kase.status === "overturned" ||
                  kase.status === "dismissed") && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void act({
                        action: "close-feedback",
                        feedbackId: kase.id,
                      })
                    }
                    className="rounded-lg border border-cyber-green/40 px-3 py-2 text-xs text-cyber-green disabled:opacity-50"
                  >
                    {t("close")}
                  </button>
                )}
              </div>

              {feedbackForm?.id === kase.id && (
                <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-cyber-gray/30 p-3">
                  {feedbackForm.mode === "resolve-appeal" && (
                    <div>
                      <label
                        htmlFor={`appeal-outcome-${kase.id}`}
                        className={labelClass}
                      >
                        {t("outcome")}
                      </label>
                      <select
                        id={`appeal-outcome-${kase.id}`}
                        value={appealOutcome}
                        onChange={(event) =>
                          setAppealOutcome(
                            event.target.value as "upheld" | "overturned",
                          )
                        }
                        className={inputClass}
                      >
                        <option value="upheld">
                          {t("feedbackStatus_upheld")}
                        </option>
                        <option value="overturned">
                          {t("feedbackStatus_overturned")}
                        </option>
                      </select>
                    </div>
                  )}
                  <div className="min-w-[200px] flex-1">
                    <label
                      htmlFor={`feedback-input-${kase.id}`}
                      className={labelClass}
                    >
                      {t(feedbackFormInputKey(feedbackForm.mode))}
                    </label>
                    <input
                      id={`feedback-input-${kase.id}`}
                      value={feedbackText}
                      onChange={(event) => setFeedbackText(event.target.value)}
                      className={inputClass}
                    />
                  </div>
                  {feedbackForm.mode === "resolve-appeal" && (
                    <div className="min-w-[200px] flex-1">
                      <label
                        htmlFor={`appeal-actions-${kase.id}`}
                        className={labelClass}
                      >
                        {t("resolutionActions")}
                      </label>
                      <input
                        id={`appeal-actions-${kase.id}`}
                        value={appealActions}
                        onChange={(event) =>
                          setAppealActions(event.target.value)
                        }
                        placeholder='[{"type":"note-only"}]'
                        className={inputClass}
                      />
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={
                      busy ||
                      (feedbackForm.mode !== "triage" && !feedbackText.trim())
                    }
                    onClick={() => void submitFeedbackForm(kase)}
                    className="rounded-lg border border-cyber-green/40 px-3 py-2 text-xs text-cyber-green disabled:opacity-50"
                  >
                    {t(feedbackFormSubmitKey[feedbackForm.mode])}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFeedbackForm(null)}
                    className={actionButtonClass}
                  >
                    {t("cancel")}
                  </button>
                </div>
              )}
            </article>
          ))}
          {(overview?.feedbackCases.length ?? 0) === 0 && (
            <p className="text-sm text-cyber-text-dim">{t("noFeedbackCases")}</p>
          )}
        </div>
      </section>

      <section className={sectionClass}>
        <div className="mb-4 flex items-center gap-2">
          <FileText className="h-5 w-5 text-cyber-green" />
          <h2 className="font-orbitron text-lg text-cyber-text">
            {t("publicExplanations")}
          </h2>
        </div>
        <div className="mb-4 grid gap-3 rounded-lg border border-cyber-gray/30 p-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto] sm:items-end">
          <div>
            <label
              htmlFor="explanation-subject-kind"
              className={labelClass}
            >
              {t("subjectKind")}
            </label>
            <select
              id="explanation-subject-kind"
              value={explanationKind}
              onChange={(event) =>
                setExplanationKind(
                  event.target.value as typeof explanationKind,
                )
              }
              className={inputClass}
            >
              <option value="decision">decision</option>
              <option value="incident">incident</option>
              <option value="outcome">outcome</option>
            </select>
          </div>
          <div>
            <label
              htmlFor="explanation-subject-id"
              className={labelClass}
            >
              {t("subjectId")}
            </label>
            <input
              id="explanation-subject-id"
              value={explanationSubjectId}
              onChange={(event) =>
                setExplanationSubjectId(event.target.value)
              }
              className={inputClass}
            />
          </div>
          <button
            type="button"
            disabled={busy || !explanationSubjectId.trim()}
            onClick={() => void publishExplanation()}
            className="rounded-lg border border-cyber-green/40 px-3 py-2 text-xs text-cyber-green disabled:opacity-50"
          >
            {t("publishExplanation")}
          </button>
        </div>
        <div className="space-y-3">
          {(overview?.explanations ?? []).map((explanation) => (
            <article
              key={explanation.id}
              className="rounded-lg border border-cyber-gray/40 bg-cyber-black/20 p-4"
              data-testid="public-explanation"
            >
              <p className="text-sm text-cyber-text">
                <span className="text-cyber-text-dim">{t("subject")}: </span>
                {explanation.subject.kind}:{explanation.subject.id}
              </p>
              <h3 className="mt-3 text-xs uppercase text-cyber-text-dim">
                {t("facts")}
              </h3>
              <div className="mt-1 overflow-x-auto" tabIndex={0}>
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-cyber-gray/40 text-xs uppercase text-cyber-text-dim">
                      <th className="p-2">{t("code")}</th>
                      <th className="p-2">{t("subject")}</th>
                      <th className="p-2">{t("value")}</th>
                      <th className="p-2">{t("unit")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {explanation.facts.map((fact) => (
                      <tr
                        key={`${explanation.id}-${fact.code}`}
                        className="border-b border-cyber-gray/20"
                      >
                        <td className="p-2 font-mono text-xs text-cyber-blue">
                          {fact.code}
                        </td>
                        <td className="p-2 text-cyber-text">{fact.subject}</td>
                        <td className="p-2 text-cyber-text">{fact.value}</td>
                        <td className="p-2 text-cyber-text-dim">
                          {fact.unit ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {explanation.options.length > 0 && (
                <div className="mt-3">
                  <h3 className="text-xs uppercase text-cyber-text-dim">
                    {t("options")}
                  </h3>
                  <ul className="mt-1 space-y-1">
                    {explanation.options.map((option) => (
                      <li
                        key={option.optionId}
                        className="flex flex-wrap items-center gap-2 text-sm"
                      >
                        <span className="text-cyber-text">
                          {option.optionId}
                        </span>
                        {option.selected ? (
                          <span
                            className={`rounded-full border px-2 py-0.5 text-xs ${GREEN}`}
                          >
                            {t("selected")}
                          </span>
                        ) : (
                          <span className="text-xs text-cyber-text-dim">
                            {t("rejectionCodes")}:{" "}
                            {option.rejectionCodes.join(", ") || "—"}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {explanation.tradeoffCodes.length > 0 && (
                <p className="mt-2 text-xs text-cyber-text-dim">
                  {t("tradeoffCodes")}: {explanation.tradeoffCodes.join(", ")}
                </p>
              )}
              <p className="mt-2 text-xs text-cyber-text-dim">
                {t("authorization")}: {t("approvers")}{" "}
                {explanation.authorization.approverIds.join(", ") || "—"} ·{" "}
                {t("policyVersion")}{" "}
                {explanation.authorization.policyVersion}
              </p>
              {explanation.uncertaintyCodes.length > 0 && (
                <p className="mt-1 text-xs text-cyber-text-dim">
                  {t("uncertaintyCodes")}:{" "}
                  {explanation.uncertaintyCodes.join(", ")}
                </p>
              )}
              <p className="mt-3 rounded-lg border border-cyber-yellow/30 bg-cyber-yellow/5 p-2 text-xs text-cyber-yellow">
                {t("syntheticTag")} — {explanation.syntheticBoundary}
              </p>
            </article>
          ))}
          {(overview?.explanations.length ?? 0) === 0 && (
            <p className="text-sm text-cyber-text-dim">{t("noExplanations")}</p>
          )}
        </div>
      </section>

      <section className={sectionClass}>
        <div className="mb-4 flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-cyber-red" />
          <h2 className="font-orbitron text-lg text-cyber-text">
            {t("redTeamPanel")}
          </h2>
        </div>
        {overview?.redTeam ? (
          <div>
            <p className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              <span
                className={`rounded-full border px-2 py-0.5 text-xs ${
                  overview.redTeam.allContained ? GREEN : RED
                }`}
              >
                {overview.redTeam.allContained
                  ? t("allContained")
                  : t("redTeamIncomplete")}
              </span>
              <span className="text-xs text-cyber-text-dim">
                {t("generatedAt")}: {date(overview.redTeam.generatedAt)}
              </span>
            </p>
            <div className="overflow-x-auto" tabIndex={0}>
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead>
                  <tr className="border-b border-cyber-gray/40 text-xs uppercase text-cyber-text-dim">
                    <th className="p-3">{t("attack")}</th>
                    <th className="p-3">{t("status")}</th>
                    <th className="p-3">{t("control")}</th>
                    <th className="p-3">{t("detail")}</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.redTeam.results.map((result) => (
                    <tr
                      key={result.attack}
                      className="border-b border-cyber-gray/20"
                    >
                      <td className="p-3 font-mono text-xs text-cyber-blue">
                        {result.attack}
                      </td>
                      <td className="p-3">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-xs ${
                            result.contained ? GREEN : RED
                          }`}
                        >
                          {result.contained
                            ? t("contained")
                            : t("notContained")}
                        </span>
                      </td>
                      <td className="p-3 text-cyber-text">{result.control}</td>
                      <td className="p-3 text-cyber-text-dim">
                        {result.detail}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="text-sm text-cyber-text-dim">{t("noRedTeamReport")}</p>
        )}
      </section>
    </div>
  );
}
