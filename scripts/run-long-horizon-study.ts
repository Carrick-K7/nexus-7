import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  createLongHorizonStudy,
  verifyLongHorizonStudy,
  type LongHorizonStudyReport,
} from "../src/symbiosis/long-horizon";

async function main(): Promise<void> {
  const write = process.argv.includes("--write");
  const outputPath = path.resolve(
    process.cwd(),
    process.env.NEXUS_LONG_HORIZON_OUTPUT ??
      "public/data/long-horizon-study.json",
  );
  const report = createLongHorizonStudy();
  const verification = verifyLongHorizonStudy(report);
  if (!verification.passed) {
    throw new Error(
      `Generated long-horizon study failed: ${verification.errors.join(", ")}`,
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
    ) as LongHorizonStudyReport;
    const publishedVerification = verifyLongHorizonStudy(published);
    publishedSha256 = published.integrity.reportSha256;
    if (!publishedVerification.passed) {
      throw new Error(
        `Published long-horizon study failed: ${publishedVerification.errors.join(", ")}`,
      );
    }
    exactMatch =
      published.integrity.reportSha256 === report.integrity.reportSha256;
    if (!exactMatch) {
      throw new Error(
        `Long-horizon reproduction mismatch: published=${published.integrity.reportSha256} reproduced=${report.integrity.reportSha256}`,
      );
    }
  }
  console.log(
    JSON.stringify({
      event: "long-horizon-study.completed",
      mode: write ? "write" : "verify",
      status: report.status,
      runs: report.runs.length,
      turnsPerRun: report.design.turnsPerRun,
      pooledRalr: report.analysis.pooledRalr,
      longPendingTotal: report.analysis.longPendingTotal,
      driftDirection: report.analysis.driftDirection,
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
