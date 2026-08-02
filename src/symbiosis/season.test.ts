// @vitest-environment node

import {
  describe,
  expect,
  it,
} from "vitest";
import {
  createInitialWorld,
  replayWorld,
} from "./engine";
import {
  isRecognizedSeasonId,
  nextSeasonId,
  rolloverSeason,
  seasonSeedFamily,
  verifySeasonArchive,
} from "./season";

describe("season boundary protocol", () => {
  it("advances quarter identifiers and wraps years", () => {
    expect(nextSeasonId("symbiotic-shenzhen-season-2026-q3")).toBe(
      "symbiotic-shenzhen-season-2026-q4",
    );
    expect(nextSeasonId("symbiotic-shenzhen-season-2026-q4")).toBe(
      "symbiotic-shenzhen-season-2027-q1",
    );
    expect(
      isRecognizedSeasonId("symbiotic-shenzhen-season-2027-q1"),
    ).toBe(true);
    expect(isRecognizedSeasonId("attacker-season")).toBe(false);
  });

  it("rolls a settled season over into the next season with a chained archive", () => {
    const previous = replayWorld(
      createInitialWorld({
        seasonId: "symbiotic-shenzhen-season-2026-q3",
        seed: "rollover-test-seed",
      }),
      30,
    );
    const { archive, next } = rolloverSeason(previous, {
      archivedAt: "2026-08-01T12:00:00.000Z",
    });
    expect(archive.previousSeasonId).toBe(
      "symbiotic-shenzhen-season-2026-q3",
    );
    expect(archive.nextSeasonId).toBe(
      "symbiotic-shenzhen-season-2026-q4",
    );
    expect(archive.previousFinalFingerprint).toBe(
      previous.snapshot.fingerprint,
    );
    expect(archive.nextGenesisFingerprint).toBe(
      next.snapshot.fingerprint,
    );
    expect(archive.previousFinalTurn).toBe(30);
    expect(archive.nextStartDate).toBe("2026-08-18");
    expect(next.season.id).toBe("symbiotic-shenzhen-season-2026-q4");
    expect(next.turn.turn).toBe(0);
    expect(next.season.seed).toBe(seasonSeedFamily(archive.nextSeasonId));
    const verification = verifySeasonArchive(archive);
    expect(verification.passed).toBe(true);
    expect(verification.errors).toEqual([]);
  });

  it("is deterministic for the same head and decision time", () => {
    const previous = replayWorld(
      createInitialWorld({
        seasonId: "symbiotic-shenzhen-season-2026-q3",
        seed: "rollover-test-seed",
      }),
      15,
    );
    const first = rolloverSeason(previous, {
      archivedAt: "2026-08-01T12:00:00.000Z",
    });
    const second = rolloverSeason(previous, {
      archivedAt: "2026-08-01T12:00:00.000Z",
    });
    expect(first.archive.archiveSha256).toBe(
      second.archive.archiveSha256,
    );
  });

  it("rejects a genesis or unsettled head", () => {
    const genesis = createInitialWorld({
      seasonId: "symbiotic-shenzhen-season-2026-q3",
    });
    expect(() =>
      rolloverSeason(genesis),
    ).toThrow("settled non-genesis head");
  });

  it("rejects archives with tampered fingerprints or broken ordering", () => {
    const previous = replayWorld(
      createInitialWorld({
        seasonId: "symbiotic-shenzhen-season-2026-q3",
        seed: "rollover-test-seed",
      }),
      5,
    );
    const { archive } = rolloverSeason(previous, {
      archivedAt: "2026-08-01T12:00:00.000Z",
    });
    const tampered = structuredClone(archive);
    tampered.previousFinalFingerprint = "f".repeat(64);
    expect(
      verifySeasonArchive(tampered).errors,
    ).toContain("archive-hash-mismatch");
    const reordered = structuredClone(archive);
    reordered.nextSeasonId = "symbiotic-shenzhen-season-2027-q1";
    expect(
      verifySeasonArchive(reordered).errors,
    ).toContain("season-order-mismatch");
  });
});
