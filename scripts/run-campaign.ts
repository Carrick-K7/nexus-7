import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  CAMPAIGN_REGISTRY,
} from "../src/symbiosis/campaign-definitions";
import {
  runHypothesisCampaign,
  verifyHypothesisCampaignReport,
  type HypothesisCampaignReport,
} from "../src/symbiosis/campaign";

async function main(): Promise<void> {
  const campaignId = process.argv[2];
  const campaign = CAMPAIGN_REGISTRY[campaignId];
  if (!campaign) {
    throw new Error(
      `Unknown campaign "${campaignId}"; available: ${Object.keys(CAMPAIGN_REGISTRY).join(", ")}`,
    );
  }
  const write = process.argv.includes("--write");
  const outputPath = path.resolve(
    process.cwd(),
    process.env.NEXUS_CAMPAIGN_OUTPUT ??
      `public/data/campaigns/${campaign.id}.json`,
  );
  const report = await runHypothesisCampaign(campaign);
  const verification = verifyHypothesisCampaignReport(report, campaign);
  if (!verification.passed) {
    throw new Error(
      `Generated campaign failed: ${verification.errors.join(", ")}`,
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
    ) as HypothesisCampaignReport;
    const publishedVerification = verifyHypothesisCampaignReport(
      published,
      campaign,
    );
    publishedSha256 = published.integrity.reportSha256;
    if (!publishedVerification.passed) {
      throw new Error(
        `Published campaign failed: ${publishedVerification.errors.join(", ")}`,
      );
    }
    exactMatch =
      published.integrity.reportSha256 === report.integrity.reportSha256;
    if (!exactMatch) {
      throw new Error(
        `Campaign reproduction mismatch: published=${published.integrity.reportSha256} reproduced=${report.integrity.reportSha256}`,
      );
    }
  }
  console.log(
    JSON.stringify({
      event: "campaign.completed",
      campaignId: report.campaignId,
      version: report.campaignVersion,
      mode: write ? "write" : "verify",
      status: report.status,
      hypotheses: `${report.analysis.passed}/${report.analysis.total}`,
      runs: report.runs.length,
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
