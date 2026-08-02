import {
  createHash,
} from "node:crypto";
import {
  stableStringify,
} from "@/simulation";
import type {
  TurnSettlement,
} from "./contracts";
import {
  createInitialWorld,
} from "./engine";

export const SEASON_ARCHIVE_SCHEMA_VERSION =
  "nexus.season-archive.v1" as const;

/**
 * Season boundary protocol.
 *
 * A season is the calendar container of the synthetic city. The current
 * production season is a constant; this module defines the *protocol* for
 * opening the next season without breaking the evidence chain. Executing a
 * rollover in production is a human constitutional decision (ADR 0041), never
 * an automatic step.
 *
 * The archive ledger is the continuity link: it records the previous season's
 * final fingerprint, the next season's genesis fingerprint and the wall-clock
 * decision time. The elapsed-production evidence lane is runtime-envelope
 * based and therefore continues across seasons unchanged.
 */

export interface SeasonArchive {
  schemaVersion: typeof SEASON_ARCHIVE_SCHEMA_VERSION;
  previousSeasonId: string;
  nextSeasonId: string;
  previousFinalFingerprint: string;
  nextGenesisFingerprint: string;
  previousFinalTurn: number;
  previousFinalSimulationDate: string;
  nextStartDate: string;
  regime: string;
  seedFamily: string;
  archivedAt: string;
  archiveSha256: string;
  executedBy: "human-constitutional-decision";
  syntheticBoundary: string;
}

const SEASON_PATTERN = /^symbiotic-shenzhen-season-(\d{4})-q([1-4])$/;

export function nextSeasonId(currentSeasonId: string): string {
  const match = SEASON_PATTERN.exec(currentSeasonId);
  if (!match) {
    throw new Error(`Unrecognized season identifier: ${currentSeasonId}`);
  }
  const year = Number(match[1]);
  const quarter = Number(match[2]);
  return quarter === 4
    ? `symbiotic-shenzhen-season-${year + 1}-q1`
    : `symbiotic-shenzhen-season-${year}-q${quarter + 1}`;
}

export function isRecognizedSeasonId(seasonId: string): boolean {
  return SEASON_PATTERN.test(seasonId);
}

export function seasonSeedFamily(seasonId: string): string {
  return `${seasonId}-calibration-seed`;
}

function sha256(value: unknown): string {
  return createHash("sha256")
    .update(stableStringify(value), "utf8")
    .digest("hex");
}

export function rolloverSeason(
  previous: TurnSettlement,
  options: {
    archivedAt?: string;
  } = {},
): { archive: SeasonArchive; next: TurnSettlement } {
  if (previous.turn.turn < 1 || previous.turn.status !== "settled") {
    throw new Error("Season rollover requires a settled non-genesis head");
  }
  const previousSeasonId = previous.season.id;
  if (!isRecognizedSeasonId(previousSeasonId)) {
    throw new Error(
      `Season rollover requires a recognized season identifier: ${previousSeasonId}`,
    );
  }
  const nextId = nextSeasonId(previousSeasonId);
  const startDate = previous.turn.simulationDate;
  const [year, month, day] = startDate.split("-").map(Number);
  const nextStartDate = new Date(
    Date.UTC(year, month - 1, day + 1),
  ).toISOString().slice(0, 10);
  const seed = seasonSeedFamily(nextId);
  const next = createInitialWorld({
    seasonId: nextId,
    seed,
    regime: previous.season.regime,
    createdAt: `${nextStartDate}T00:00:00.000+08:00`,
  });
  const archive = {
    schemaVersion: SEASON_ARCHIVE_SCHEMA_VERSION,
    previousSeasonId,
    nextSeasonId: nextId,
    previousFinalFingerprint: previous.snapshot.fingerprint,
    nextGenesisFingerprint: next.snapshot.fingerprint,
    previousFinalTurn: previous.turn.turn,
    previousFinalSimulationDate: startDate,
    nextStartDate,
    regime: previous.season.regime,
    seedFamily: seed,
    archivedAt: options.archivedAt ?? new Date().toISOString(),
    executedBy: "human-constitutional-decision" as const,
    syntheticBoundary:
      "Season archives are synthetic research evidence; they are not a digital twin and not evidence of real policy effects.",
  };
  const unsigned = { ...archive, archiveSha256: "" };
  return {
    archive: {
      ...archive,
      archiveSha256: sha256(unsigned),
    },
    next,
  };
}

export function verifySeasonArchive(
  archive: SeasonArchive,
): { passed: boolean; errors: string[] } {
  const errors: string[] = [];
  if (archive.schemaVersion !== SEASON_ARCHIVE_SCHEMA_VERSION) {
    errors.push("schema-version-mismatch");
  }
  if (!isRecognizedSeasonId(archive.previousSeasonId)) {
    errors.push("previous-season-unrecognized");
  }
  if (nextSeasonId(archive.previousSeasonId) !== archive.nextSeasonId) {
    errors.push("season-order-mismatch");
  }
  if (
    !/^[a-f0-9]{8}$/i.test(archive.previousFinalFingerprint) ||
    !/^[a-f0-9]{8}$/i.test(archive.nextGenesisFingerprint)
  ) {
    errors.push("fingerprint-digest-invalid");
  }
  const { archiveSha256, ...unsigned } = archive;
  if (
    archiveSha256 !== sha256({ ...unsigned, archiveSha256: "" })
  ) {
    errors.push("archive-hash-mismatch");
  }
  return { passed: errors.length === 0, errors };
}
