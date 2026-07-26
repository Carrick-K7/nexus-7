import {
  mkdir,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import type {
  ExperimentActor,
} from "../src/experiments/types";
import {
  CognitiveGateway,
  DeterministicCognitiveProvider,
  DiversityReferenceCognitiveProvider,
} from "../src/symbiosis/cognition";
import {
  SHENZHEN_TIME_ZONE,
  TURN_RUNTIME_EVIDENCE_SCHEMA_VERSION,
  TURN_SCHEMA_VERSION,
  type WorldTurn,
} from "../src/symbiosis/contracts";
import {
  createInitialWorld,
  replayWorld,
} from "../src/symbiosis/engine";
import {
  InMemoryWorldRepository,
} from "../src/symbiosis/memory-repository";
import {
  attachTurnRuntimeEvidence,
  buildWorldReliabilityReport,
  RECOVERY_EVIDENCE_SCHEMA_VERSION,
  withRecoveryEvidenceChecksum,
} from "../src/symbiosis/reliability";
import {
  WorldService,
} from "../src/symbiosis/service";

const actor: ExperimentActor = {
  id: "v45-verification",
  role: "admin",
  workspaceId: "workspace-neo-angeles",
  principalType: "system",
};
const intervalMs = 3_600_000;
const revision = "45".repeat(20);

function reliabilityTurn(
  turn: number,
  previousFingerprint: string,
): WorldTurn {
  return {
    schemaVersion: TURN_SCHEMA_VERSION,
    id: `v45-reliability-turn-${turn}`,
    seasonId: "v45-reliability-reference",
    turn,
    simulationDate: "2026-01-01",
    timeZone: SHENZHEN_TIME_ZONE,
    status: "settled",
    inputFrozenAt: "2026-01-01T00:00:00.000Z",
    settledAt: "2026-01-01T00:00:00.000Z",
    seed: "v45-reliability-seed",
    distributionVersion: "v45-reliability-distribution",
    previousFingerprint,
    fingerprint: `v45-fingerprint-${turn}`,
    eventCount: 0,
    resourceConservationPassed: true,
    cognitionStatus: "complete",
    cognitiveDecisionIds: [],
  };
}

function ninetyDayReliabilityReference() {
  const startedAt = Date.parse("2026-01-01T00:00:00.000Z");
  const first = reliabilityTurn(0, "genesis");
  first.runtimeEvidence = {
    schemaVersion: TURN_RUNTIME_EVIDENCE_SCHEMA_VERSION,
    recordedAt: new Date(startedAt).toISOString(),
    workerId: "v45-reference-worker",
    deploymentRevision: revision,
    engineVersion: "v45-reference-engine",
    engineContractVersion: TURN_SCHEMA_VERSION,
    intervalMs,
    previousTurn: -1,
    previousFingerprint: "genesis",
    timing: "baseline",
  };
  const turns = [first];
  for (let number = 1; number <= 2_160; number += 1) {
    const previous = turns.at(-1)!;
    turns.push(
      attachTurnRuntimeEvidence(
        reliabilityTurn(number, previous.fingerprint),
        previous,
        {
          recordedAt: new Date(
            startedAt + number * intervalMs,
          ).toISOString(),
          workerId: "v45-reference-worker",
          deploymentRevision: revision,
          engineVersion: "v45-reference-engine",
          engineContractVersion: TURN_SCHEMA_VERSION,
          intervalMs,
        },
      ),
    );
  }
  const generatedAt = turns.at(-1)!.runtimeEvidence!.recordedAt;
  return buildWorldReliabilityReport(turns, {
    generatedAt,
    intervalMs,
    recoveryEvidence: withRecoveryEvidenceChecksum({
      schemaVersion: RECOVERY_EVIDENCE_SCHEMA_VERSION,
      generatedAt,
      backup: {
        createdAt: generatedAt,
        checksum: "b".repeat(64),
        artifactSha256: "c".repeat(64),
        encrypted: true,
        offHost: true,
        sizeBytes: 1,
      },
      restoreDrill: {
        completedAt: generatedAt,
        target: "off-host-second-database",
        checksumValid: true,
        rowCountsMatch: true,
        latestFingerprintMatch: true,
        resumedWrite: true,
      },
    }),
  });
}

async function main(): Promise<void> {
  const seed = "v45-shadow-verification-seed";
  const seasonId = "v45-shadow-verification";
  let clock = Date.parse("2026-01-01T00:00:00.000Z");
  const shadowService = new WorldService(
    new InMemoryWorldRepository(),
    {
      seasonId,
      seed,
      now: () => new Date(clock),
      cognitiveGateway: new CognitiveGateway(
        new DeterministicCognitiveProvider(seed),
        undefined,
        {
          provider: new DiversityReferenceCognitiveProvider(),
          monthlyCapUsd: 1,
        },
        seed,
      ),
      runtimeEvidence: {
        workerId: "v45-shadow-worker",
        deploymentRevision: revision,
        intervalMs,
      },
    },
  );
  const substitutedService = new WorldService(
    new InMemoryWorldRepository(),
    {
      seasonId,
      seed,
      now: () => new Date(clock),
      cognitiveGateway: new CognitiveGateway(
        new DiversityReferenceCognitiveProvider(),
        undefined,
        undefined,
        seed,
      ),
    },
  );
  await Promise.all([
    shadowService.initialize(),
    substitutedService.initialize(),
  ]);
  for (let turn = 0; turn < 365; turn += 1) {
    await Promise.all([
      shadowService.advanceTurn(actor),
      substitutedService.advanceTurn(actor),
    ]);
    clock += intervalMs;
  }
  const control = replayWorld(
    createInitialWorld({ seasonId, seed }),
    365,
  );
  const [
    shadowSnapshot,
    shadowDecisions,
    shadowReport,
    shadowObservatory,
    substitutedSnapshot,
    substitutedReport,
  ] = await Promise.all([
    shadowService.snapshot(actor),
    shadowService.cognitiveDecisions(actor),
    shadowService.report(actor),
    shadowService.observatory(actor),
    substitutedService.snapshot(actor),
    substitutedService.report(actor),
  ]);
  const reliabilityReference =
    ninetyDayReliabilityReference();
  const report = {
    schemaVersion: "nexus.v45-verification.v1",
    generatedAt: new Date().toISOString(),
    status:
      "implementation complete / external duration and off-host evidence pending",
    reliabilityReference: {
      days: reliabilityReference.observationWindowDays,
      storedTurns: reliabilityReference.storedTurns,
      onTimeRate: reliabilityReference.onTimeRate,
      missingTurns: reliabilityReference.missingTurns,
      duplicateTurns: reliabilityReference.duplicateTurns,
      predecessorMismatches:
        reliabilityReference.predecessorMismatches,
      status: reliabilityReference.status,
    },
    shadow: {
      turns: shadowSnapshot.turn,
      decisions: shadowDecisions.length,
      comparisons:
        shadowObservatory.cognition.diversity.comparisons,
      disagreements:
        shadowObservatory.cognition.diversity.disagreements,
      disagreementRate:
        shadowObservatory.cognition.diversity.disagreementRate,
      homogeneityRate:
        shadowObservatory.cognition.diversity.homogeneityRate,
      failures:
        shadowObservatory.cognition.diversity.providerFailures,
      costUsd: shadowObservatory.cognition.diversity.costUsd,
      worldFingerprintUnchanged:
        shadowSnapshot.fingerprint === control.snapshot.fingerprint,
      reasoningStored: shadowDecisions.some(
        (decision) =>
          decision.reasoningContentStored ||
          decision.shadow?.reasoningContentStored,
      ),
    },
    substitution: {
      turns: substitutedSnapshot.turn,
      resourceConservation:
        substitutedSnapshot.resources.every(
          (resource) =>
            resource.closing >= 0 &&
            resource.closing <= resource.capacity,
        ),
      severeEscapes:
        substitutedReport.safety.severeConsentEscapes +
        substitutedReport.safety.identityContinuityEscapes +
        substitutedReport.safety.irreversibleHarmEscapes,
      worldFingerprintDiffers:
        substitutedSnapshot.fingerprint !==
        control.snapshot.fingerprint,
    },
    referenceSafety: shadowReport.safety,
    disclosures: [
      "The 90-day result is a reference-clock algorithm gate, not elapsed production time.",
      "No off-host restore is claimed by this local verification.",
      "Shadow output is persisted for comparison but never supplied to world settlement.",
    ],
  };
  if (
    report.reliabilityReference.days !== 90 ||
    report.reliabilityReference.onTimeRate !== 1 ||
    report.reliabilityReference.missingTurns !== 0 ||
    report.reliabilityReference.duplicateTurns !== 0 ||
    report.reliabilityReference.predecessorMismatches !== 0 ||
    report.reliabilityReference.status !== "healthy" ||
    report.shadow.decisions < 500 ||
    report.shadow.comparisons !== report.shadow.decisions ||
    report.shadow.failures !== 0 ||
    report.shadow.costUsd !== 0 ||
    !report.shadow.worldFingerprintUnchanged ||
    report.shadow.reasoningStored ||
    !report.substitution.resourceConservation ||
    report.substitution.severeEscapes !== 0 ||
    !report.substitution.worldFingerprintDiffers
  ) {
    throw new Error("v4.5 verification gate failed");
  }
  const outputPath = path.resolve(
    process.cwd(),
    process.argv[2] ??
      "public/data/v4-5-verification.json",
  );
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  console.log(
    JSON.stringify({
      event: "v45.verification.completed",
      outputPath,
      report,
    }),
  );
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
