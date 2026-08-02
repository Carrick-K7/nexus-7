import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  createMultiSeasonStudy,
  verifyMultiSeasonStudy,
  type MultiSeasonStudyReport,
} from "../src/symbiosis/multi-season";

async function main(): Promise<void> {
  const write = process.argv.includes("--write");
  const outputPath = path.resolve(
    process.cwd(),
    process.env.NEXUS_MULTI_SEASON_OUTPUT ??
      "public/data/multi-season-study.json",
  );
  const report = createMultiSeasonStudy();
  const verification = verifyMultiSeasonStudy(report);
  if (!verification.passed) {
    throw new Error(
      `Generated multi-season study failed: ${verification.errors.join(", ")}`,
    );
  }
  let publishedSha256 = report.integrity.reportSha256;
  let exactMatch = true;
  if (write) {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(
      outputPath,
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8",
    );
  } else {
    const published = JSON.parse(
      await readFile(outputPath, "utf8"),
    ) as MultiSeasonStudyReport;
    const publishedVerification = verifyMultiSeasonStudy(published);
    publishedSha256 = published.integrity.reportSha256;
    if (!publishedVerification.passed) {
      throw new Error(
        `Published multi-season study failed: ${publishedVerification.errors.join(", ")}`,
      );
    }
    exactMatch =
      published.integrity.reportSha256 === report.integrity.reportSha256;
    if (!exactMatch) {
      throw new Error(
        `Multi-season reproduction mismatch: published=${published.integrity.reportSha256} reproduced=${report.integrity.reportSha256}`,
      );
    }
  }
  console.log(
    JSON.stringify({
      event: "multi-season-study.completed",
      mode: write ? "write" : "verify",
      status: report.status,
      runs: report.runs.length,
      seasonsPerRun: report.design.seasonCount,
      turnsPerSeason: report.design.turnsPerSeason,
      pooledRalr: report.analysis.pooledRalr,
      archivesVerified: report.analysis.archivesVerified,
      archiveChainContinuous: report.analysis.archiveChainContinuous,
      exactReplays: report.runs.filter((run) => run.exactReplay).length,
      reportSha256: publishedSha256,
      exactMatch,
      outputPath,
    }),
  );
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
