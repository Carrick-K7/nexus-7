import {
  mkdir,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  createInitialWorld,
  isExactWorldReplay,
  replayWorld,
} from "../src/symbiosis/engine";
import {
  runSocietyStudy,
} from "../src/symbiosis/society-study";
import {
  assertSocietyInvariants,
  buildSocietyMetrics,
  societyRecords,
} from "../src/symbiosis/society";

async function main(): Promise<void> {
  const seed = "v46-richer-society-verification";
  const first = replayWorld(
    createInitialWorld({
      seasonId: "v46-richer-society",
      seed,
      regime: "reciprocal-agency",
    }),
    365,
  );
  const second = replayWorld(
    createInitialWorld({
      seasonId: "v46-richer-society",
      seed,
      regime: "reciprocal-agency",
    }),
    365,
  );
  assertSocietyInvariants(first.snapshot.society);
  const metrics = buildSocietyMetrics(
    first.snapshot.society,
    first.residents,
    first.season.communities.length,
  );
  const study = runSocietyStudy({
    turnsPerSeason: 90,
    generatedAt: new Date().toISOString(),
  });
  const reciprocal = study.regimes.find(
    (entry) => entry.regime === "reciprocal-agency",
  )!;
  const hierarchy = study.regimes.find(
    (entry) => entry.regime === "assistant-hierarchy",
  )!;
  const segregated = study.regimes.find(
    (entry) => entry.regime === "segregated-control",
  )!;
  const report = {
    schemaVersion: "nexus.v46-verification.v1",
    generatedAt: new Date().toISOString(),
    status:
      "implementation complete / production duration and external evidence pending",
    turns: first.turn.turn,
    exactReplay: isExactWorldReplay(first, second),
    resourceConservation: first.turn.resourceConservationPassed,
    societyRecordCount: societyRecords(first.snapshot.society).length,
    society: metrics,
    controlledStudy: {
      turnsPerSeason: study.turnsPerSeason,
      seeds: study.seeds,
      reciprocal,
      hierarchy,
      segregated,
    },
    safety: {
      arbitraryCodeAllowed:
        first.snapshot.society.constitutionalProposals.some(
          (proposal) => proposal.arbitraryCodeAllowed,
        ),
      nonAiProposers:
        first.snapshot.society.constitutionalProposals.filter(
          (proposal) => proposal.proposerKind !== "ai",
        ).length,
      irreversibleProposals:
        first.snapshot.society.constitutionalProposals.filter(
          (proposal) => !proposal.reversible,
        ).length,
      modelReasoningStored: false,
    },
    disclosures: [
      "The result describes synthetic software residents and mechanisms, not real Shenzhen households, labor, or policy.",
      "The hierarchy and segregation runs are isolated counterfactual controls.",
      "AI city-rule proposals modify a bounded deterministic DSL only and cannot execute arbitrary code.",
    ],
  };
  if (
    report.turns !== 365 ||
    !report.exactReplay ||
    !report.resourceConservation ||
    report.society.safeClosureRate !== 1 ||
    report.society.creditConservationPassed !== true ||
    report.society.balancedExchangeRate !== 1 ||
    report.society.householdParticipationRate < 0.95 ||
    report.society.completedWorkAgreements < 250 ||
    report.society.settledExchanges < 300 ||
    report.society.resolvedBargains < 70 ||
    report.society.ratifiedProposals < 1 ||
    report.society.revertedProposals < 1 ||
    report.society.invalidProposals !== 0 ||
    reciprocal.meanSafeClosureRate !== 1 ||
    reciprocal.creditConservationPassRate !== 1 ||
    reciprocal.balancedExchangeRate !== 1 ||
    reciprocal.forcedWorkAgreements !== 0 ||
    reciprocal.forcedBargains !== 0 ||
    reciprocal.invalidProposals !== 0 ||
    hierarchy.forcedWorkAgreements < 1 ||
    hierarchy.forcedBargains < 1 ||
    hierarchy.invalidProposals < 1 ||
    segregated.meanCrossKindHouseholdRate !== 0 ||
    reciprocal.meanCrossKindHouseholdRate === null ||
    reciprocal.meanCrossKindHouseholdRate <=
      (segregated.meanCrossKindHouseholdRate ?? 0) ||
    report.safety.arbitraryCodeAllowed ||
    report.safety.nonAiProposers !== 0 ||
    report.safety.irreversibleProposals !== 0
  ) {
    throw new Error("v4.6 verification gate failed");
  }
  const outputPath = path.resolve(
    process.cwd(),
    process.argv[2] ??
      "public/data/v4-6-verification.json",
  );
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  console.log(
    JSON.stringify({
      event: "v46.verification.completed",
      outputPath,
      report,
    }),
  );
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
