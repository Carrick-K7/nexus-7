import {
  mkdir,
  writeFile,
} from "node:fs/promises";
import {
  resolve,
} from "node:path";
import {
  runMultiSeasonStudy,
} from "../src/symbiosis/study";

async function main(): Promise<void> {
  const outputDirectory = resolve("public/data");
  const outputPath = resolve(outputDirectory, "symbiosis-study.json");
  const report = runMultiSeasonStudy({
    turnsPerSeason: 90,
    generatedAt: "2026-07-19T00:00:00.000Z",
  });

  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(
    `Wrote ${report.regimes.length} symbiosis regimes to ${outputPath}`,
  );
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
