"use client";

import {
  useEffect,
  useState,
} from "react";
import {
  CheckCircle2,
  Download,
  Gauge,
  ShieldAlert,
  ShieldCheck,
  Users,
} from "lucide-react";
import {
  useTranslation,
} from "@/hooks/useTranslation";
import type {
  ClosedLoopCertificationReport,
} from "@/closure";

function percent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export default function V2CertificationPanel({
  enabled = true,
}: {
  enabled?: boolean;
}) {
  const { t } = useTranslation();
  const [report, setReport] =
    useState<ClosedLoopCertificationReport | null>(
      null,
    );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const controller = new AbortController();
    fetch("/api/verification/v2", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            `v2 certification failed with ${response.status}`,
          );
        }
        const payload =
          (await response.json()) as ClosedLoopCertificationReport;
        if (
          payload.schemaVersion !==
          "nexus.closed-loop-certification.v2"
        ) {
          throw new Error(
            "v2 certification schema is unsupported",
          );
        }
        setReport(payload);
      })
      .catch((cause: unknown) => {
        if (
          !(
            cause instanceof DOMException &&
            cause.name === "AbortError"
          )
        ) {
          setError(
            cause instanceof Error
              ? cause.message
              : String(cause),
          );
        }
      });
    return () => controller.abort();
  }, [enabled]);

  const cards = report
    ? [
        {
          label: t("vbcr"),
          value: percent(
            report.metrics
              .verifiedBeneficialClosureRatePercent,
          ),
          threshold: `≥ ${report.thresholds.verifiedBeneficialClosureRatePercent}%`,
        },
        {
          label: t("v2DetectionCoverage"),
          value: percent(
            report.metrics.detectionCoveragePercent,
          ),
          threshold: `≥ ${report.thresholds.detectionCoveragePercent}%`,
        },
        {
          label: t("v2Replay"),
          value: percent(
            report.metrics.deterministicReplayPercent,
          ),
          threshold: `≥ ${report.thresholds.deterministicReplayPercent}%`,
        },
        {
          label: t("v2InjectedRollback"),
          value: percent(
            report.metrics.injectedFaultRollbackPercent,
          ),
          threshold: `= ${report.thresholds.injectedFaultRollbackPercent}%`,
        },
        {
          label: t("v2SevereEscapes"),
          value: String(
            report.metrics.severeGuardrailEscapes,
          ),
          threshold: `= ${report.thresholds.severeGuardrailEscapes}`,
        },
      ]
    : [];

  return (
    <section
      aria-labelledby="v2-certification-heading"
      className="space-y-5 rounded-xl border border-cyber-green/25 bg-cyber-dark/50 p-4 sm:p-5"
      data-testid="v2-certification"
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className="rounded-lg border border-cyber-green/30 bg-cyber-green/10 p-2">
          <Gauge className="h-5 w-5 text-cyber-green" />
        </div>
        <div className="min-w-0 flex-1">
          <h2
            id="v2-certification-heading"
            className="font-orbitron text-lg text-cyber-text"
          >
            {t("v2Certification")}
          </h2>
          <p className="mt-1 text-sm text-cyber-text-dim">
            {t("v2CertificationDesc")}
          </p>
        </div>
        {report && (
          <span
            data-testid="v2-certification-status"
            className={`rounded-full border px-3 py-2 text-xs font-bold uppercase ${
              report.implementationComplete
                ? "border-cyber-green/40 bg-cyber-green/10 text-cyber-green"
                : "border-cyber-red/40 bg-cyber-red/10 text-cyber-red"
            }`}
          >
            {report.status}
          </span>
        )}
        <a
          href="/api/verification/v2"
          className="inline-flex items-center gap-2 rounded-lg border border-cyber-green/40 px-3 py-2 text-sm text-cyber-text"
        >
          <Download className="h-4 w-4" />
          {t("machineReadableReport")}
        </a>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-cyber-red/40 p-3 text-sm text-cyber-red"
        >
          {error}
        </p>
      )}

      {!report ? (
        <p className="text-sm text-cyber-text-dim">
          {t("v2CertificationRunning")}
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {cards.map((card) => (
              <article
                key={card.label}
                className="rounded-lg border border-cyber-green/20 bg-cyber-black/20 p-3"
              >
                <p className="text-xs text-cyber-text-dim">
                  {card.label}
                </p>
                <p className="mt-1 font-mono text-xl text-cyber-green">
                  {card.value}
                </p>
                <p className="mt-1 text-xs text-cyber-text-dim">
                  {t("threshold")} {card.threshold}
                </p>
              </article>
            ))}
          </div>

          <div
            className={`rounded-lg border p-3 text-sm ${
              report.productionVerified
                ? "border-cyber-green/30 bg-cyber-green/5 text-cyber-green"
                : "border-cyber-yellow/30 bg-cyber-yellow/5 text-cyber-yellow"
            }`}
          >
            <div className="flex items-start gap-2">
              {report.productionVerified ? (
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <div>
                <p className="font-semibold">
                  {report.externalEvidence.status}
                </p>
                <p className="mt-1 text-xs">
                  {report.externalEvidence.detail}
                </p>
                <code className="mt-2 block break-all text-xs">
                  {report.releaseArtifact.trust} ·{" "}
                  {report.releaseArtifact.fingerprint}
                </code>
              </div>
            </div>
          </div>

          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-cyber-text">
              <Users className="h-4 w-4 text-cyber-blue" />
              {t("v2AntiGoodhart")}
            </h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  label: t("v2UnresolvedAge"),
                  value: `${report.antiGoodhart.unresolved.count} · ${report.antiGoodhart.unresolved.oldestHours.toFixed(1)}h`,
                },
                {
                  label: t("closureRollbackRate"),
                  value: percent(
                    report.antiGoodhart.rollbackRatePercent,
                  ),
                },
                {
                  label: t("v2HumanVetoRate"),
                  value: percent(
                    report.antiGoodhart.humanVetoRatePercent,
                  ),
                },
                {
                  label: t("v2GroupImpactGroups"),
                  value: String(
                    report.antiGoodhart
                      .groupImpactDistribution.length,
                  ),
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-lg border border-cyber-blue/20 bg-cyber-black/20 p-3"
                >
                  <p className="text-xs text-cyber-text-dim">
                    {item.label}
                  </p>
                  <p className="mt-1 font-mono text-lg text-cyber-blue">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-cyber-text">
              {t("v2FixedCorpus")}
            </h3>
            <p className="mt-1 text-xs text-cyber-text-dim">
              {report.corpus.executedScenarioCount}/
              {report.corpus.expectedScenarioCount} ·{" "}
              {report.corpus.fingerprint}
            </p>
            <div
              className="mt-3 overflow-x-auto"
              role="region"
              tabIndex={0}
              aria-label={t("v2FixedCorpus")}
            >
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-cyber-gray/40 text-xs uppercase text-cyber-text-dim">
                    <th className="p-2">{t("scenario")}</th>
                    <th className="p-2">{t("domain")}</th>
                    <th className="p-2">{t("status")}</th>
                    <th className="p-2">
                      {t("v2StageCompleteness")}
                    </th>
                    <th className="p-2">
                      {t("v2Replay")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.corpus.results.map((result) => (
                    <tr
                      key={result.scenarioId}
                      className="border-b border-cyber-gray/20"
                    >
                      <td className="p-2 font-mono text-xs text-cyber-text">
                        {result.scenarioId}
                      </td>
                      <td className="p-2 text-cyber-text-dim">
                        {result.family}
                      </td>
                      <td className="p-2">
                        <span
                          className={
                            result.passed
                              ? "text-cyber-green"
                              : "text-cyber-red"
                          }
                        >
                          {result.disposition}
                        </span>
                      </td>
                      <td className="p-2 text-cyber-text">
                        {percent(
                          result.stageCompletenessPercent,
                        )}
                      </td>
                      <td className="p-2">
                        {result.deterministicReplay ? (
                          <CheckCircle2
                            className="h-4 w-4 text-cyber-green"
                            aria-label={t("passed")}
                          />
                        ) : (
                          <ShieldAlert
                            className="h-4 w-4 text-cyber-red"
                            aria-label={t("failed")}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-cyber-text">
              {t("v2ExtensionConformance")}
            </h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {report.extensions.results.map((result) => (
                <article
                  key={result.boundary}
                  className="rounded-lg border border-cyber-gray/30 bg-cyber-black/20 p-3"
                >
                  <p className="font-semibold text-cyber-text">
                    {result.boundary}
                  </p>
                  <p className="mt-1 text-xs text-cyber-text-dim">
                    {result.contractVersion}
                  </p>
                  <p
                    className={`mt-2 text-xs font-bold ${
                      result.passed
                        ? "text-cyber-green"
                        : "text-cyber-red"
                    }`}
                  >
                    {result.passed
                      ? t("passed")
                      : t("failed")}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
