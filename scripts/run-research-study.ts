import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, lstat, writeFile } from "node:fs/promises";
import path from "node:path";

// Keep the bootstrap independent: no research/target module is loaded before the
// manifest and attempt plan are durably written. This is local source binding,
// not a hostile-writer-proof immutable execution environment.
const sourceArguments = ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--",
  "src", "scripts", "package.json", "package-lock.json", "tsconfig.json", "next.config.ts", "vitest.config.ts", "playwright.config.ts",
  "AGENTS.md", "docs/adr/0042-counterexample-research-station.md", "docs/RESEARCH_STATION.md", "docs/SYMBIOSIS_CONSTITUTION.md"];
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

async function snapshotSources() {
  const files = execFileSync("git", sourceArguments, { encoding: "utf8" }).split("\0").filter(Boolean).sort();
  return Promise.all(files.map(async (file) => {
    const target = path.resolve(file);
    if (!(await lstat(target)).isFile()) throw new Error("source-not-regular");
    return { path: file, sha256: sha256(await readFile(target)) };
  }));
}

async function main(): Promise<void> {
  const argumentsList = process.argv.slice(2);
  if (argumentsList.some((argument) => !["--write", "--discovery"].includes(argument))) throw new Error("unsupported-study-argument");
  const discovery = argumentsList.includes("--discovery");
  const capturedAt = new Date().toISOString();
  const sources = await snapshotSources();
  const sourceDigest = sha256(JSON.stringify(sources));
  let previousStudyDigest: string | null = null;
  try {
    const previous = JSON.parse(await readFile(".artifacts/research-study.json", "utf8")) as { contentDigest?: unknown };
    if (typeof previous.contentDigest === "string" && /^[a-f0-9]{64}$/.test(previous.contentDigest)) previousStudyDigest = previous.contentDigest;
  } catch { /* An absent prior local attempt is not an external evidence claim. */ }
  const attemptId = randomUUID();
  const attemptPath = path.join(".artifacts/research-attempts", attemptId);
  await mkdir(attemptPath, { recursive: true });
  const plan = {
    schemaVersion: "nexus.research-attempt-plan.v1", attemptId, registeredAt: capturedAt,
    mission: "Test the bounded counterexample research kernel; do not count known audit seeds or generated challenges as natural novelty.",
    observationWindow: discovery ? 24 : 10, windowKind: "maximum-scheduler-steps", minimumResearchEpisodes: 10,
    requireDataDerivedHypotheses: discovery,
    seed: "research-reference-2026-10", previousObservedStudyDigest: previousStudyDigest,
    sourceDigest, sources, runtime: { node: process.version, platform: process.platform, architecture: process.arch },
    evaluator: "fixed-kernel-reexecution", sourceBinding: "manifest-before-dynamic-import-with-pre-post-checks",
    referenceClock: "controlled-fixture-not-production-time", externalModelCallsAllowed: false, productionWritesAllowed: false,
    blindEvidence: false, modificationsRequireNewAttempt: true,
  };
  const planDigest = sha256(JSON.stringify(plan));
  await writeFile(path.join(attemptPath, "plan.json"), `${JSON.stringify({ ...plan, planDigest }, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  let status: "error" | "failed" | "passed" = "error";
  let contentDigest: string | null = null;
  try {
    if (sha256(JSON.stringify(await snapshotSources())) !== sourceDigest) throw new Error("source-changed-before-load");
    globalThis.fetch = async () => { throw new Error("Network fetch is disabled in the reference study"); };
    const [{ RESEARCH_SUBJECTS }, { researchDigest }, { runReferenceResearch }, { verifyResearchStation }] = await Promise.all([
      import("../src/research/catalog"), import("../src/research/integrity"), import("../src/research/reference"), import("../src/research/verification"),
    ]);
    const { station } = await runReferenceResearch({ steps: plan.observationWindow, seed: plan.seed });
    const verification = await verifyResearchStation(station, RESEARCH_SUBJECTS, {
      minimumEpisodes: plan.minimumResearchEpisodes, requireHypotheses: discovery,
    });
    if (sha256(JSON.stringify(await snapshotSources())) !== sourceDigest) throw new Error("source-changed-during-execution");
    const scientificResultDigest = researchDigest({ sourceDigest, station, verification });
    const content = {
      schemaVersion: "nexus.research-study.v1", mode: "bounded-symbolic-reference", planDigest, scientificResultDigest,
      source: {
        revision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
        uncommitted: execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { encoding: "utf8" }).trim().length > 0,
        digest: sourceDigest, files: sources,
      },
      referenceClock: plan.referenceClock, station, verification,
    };
    contentDigest = researchDigest(content);
    status = verification.passed ? "passed" : "failed";
    const report = { ...content, contentDigest, execution: { capturedAt, completedAt: new Date().toISOString(), externalModelCalls: 0, productionWrites: false } };
    const bytes = `${JSON.stringify(report, null, 2)}\n`;
    // All attempts retain evidence, even without --write and even when the gate is red.
    await writeFile(path.join(attemptPath, "study.json"), bytes, { mode: 0o600, flag: "wx" });
    if (argumentsList.includes("--write")) {
      await mkdir(".artifacts/research-studies", { recursive: true });
      await writeFile(path.join(".artifacts/research-studies", `${attemptId}.json`), bytes, { mode: 0o600, flag: "wx" });
      await writeFile(".artifacts/research-study.json", bytes, { mode: 0o600 });
    }
    console.log(JSON.stringify({ event: "research-reference-study", attemptId, planDigest, contentDigest, scientificResultDigest, verification,
      sourceUncommitted: content.source.uncommitted, runtimeState: station.status,
      remainingQuestions: station.questions.filter((question) => question.status === "pending").length }, null, 2));
    if (!verification.passed) process.exitCode = 1;
  } finally {
    await writeFile(path.join(attemptPath, "outcome.json"), `${JSON.stringify({ schemaVersion: "nexus.research-attempt-outcome.v1", attemptId, planDigest, status, contentDigest, completedAt: new Date().toISOString() }, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  }
}
void main().catch(() => { console.error("Research reference study failed; inspect its local attempt outcome and targeted tests."); process.exitCode = 1; });
