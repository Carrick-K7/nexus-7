import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/** Operator-only capture of existing public data; does not advance or initialize a city. */
async function main() {
  const markerPath = process.argv[2];
  if (!markerPath || process.argv.length !== 3 || process.getuid?.() !== 0) throw new Error("Explicit operator retirement record required");
  const marker = JSON.parse(await readFile(markerPath, "utf8")) as { state?: string; stoppedAt?: string; previousRevision?: string };
  if (marker.state !== "retired" || !marker.stoppedAt || !Number.isFinite(Date.parse(marker.stoppedAt)) || !/^[a-f0-9]{40}$/.test(marker.previousRevision ?? "")) throw new Error("Invalid retirement record");
  const directory = path.resolve("public/archives/city-v4.10.1-20261023");
  await mkdir(directory, { recursive: true });
  const endpoints = [
    { name: "overview", endpoint: "/api/observatory/v2/overview", en: "Frozen city overview", zh: "冻结城市概览" },
    { name: "trust", endpoint: "/api/observatory/v2/trust", en: "Original trust result", zh: "原始信任门禁结果" },
    { name: "snapshot", endpoint: "/api/world/v3/snapshot", en: "Frozen public world snapshot", zh: "冻结公开世界快照" },
    { name: "report", endpoint: "/api/reports/symbiosis", en: "Original city report", zh: "原始城市报告" },
  ];
  const values: Record<string, Record<string, unknown>> = {};
  const artifacts: Array<{ label: { en: string; zh: string }; href: string; sha256?: string }> = [];
  for (const item of endpoints) {
    const response = await fetch(`https://nexus7.carrick7.com${item.endpoint}`, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error("Public archive source unavailable");
    const bytes = Buffer.from(await response.arrayBuffer());
    const decoded = JSON.parse(bytes.toString("utf8")) as Record<string, unknown>;
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) throw new Error("Unexpected public archive source");
    values[item.name] = decoded;
    await writeFile(path.join(directory, `${item.name}.json`), bytes, { flag: "wx", mode: 0o644 });
    artifacts.push({ label: { en: item.en, zh: item.zh }, href: `/archives/city-v4.10.1-20261023/${item.name}.json`, sha256: createHash("sha256").update(bytes).digest("hex") });
  }
  const city = values.overview.city as { turn?: number; simulationDate?: string; fingerprint?: string };
  const trust = values.trust as { releaseRevision?: string; lanes?: { elapsedProduction?: { observedDays?: number; requiredDays?: number; status?: string } } };
  if (!Number.isSafeInteger(city?.turn) || !city.simulationDate || !city.fingerprint || trust.releaseRevision !== marker.previousRevision) throw new Error("Archive head/release identity is incomplete");
  artifacts.push({ label: { en: "Exact archived source revision", zh: "精确归档源码版本" }, href: `https://github.com/Carrick-K7/nexus-7/tree/${marker.previousRevision}` });
  const manifest = {
    schemaVersion: "nexus.city-archive.v1", state: "archived", capturedAt: new Date().toISOString(), stoppedAt: marker.stoppedAt,
    releaseRevision: marker.previousRevision, turn: city.turn, simulationDate: city.simulationDate, fingerprint: city.fingerprint,
    reason: { en: "The owner retired continuous city settlement to focus on the counterexample research station. Original source, state and failed evidence remain preserved. Retirement does not complete the old 90-day gate.", zh: "项目所有者决定停止城市持续结算，转向反例驱动研究站。原代码、状态与失败证据保留；退役不等于旧90天门禁完成。" },
    trustSummary: { observedDays: trust.lanes?.elapsedProduction?.observedDays ?? null, requiredDays: 90, status: trust.lanes?.elapsedProduction?.status ?? "unknown" },
    artifacts,
  };
  await writeFile("public/data/city-archive.json", `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx", mode: 0o644 });
  console.log(JSON.stringify({ event: "city-public-archive-captured", turn: manifest.turn, fingerprint: manifest.fingerprint, releaseRevision: manifest.releaseRevision, oldGateStatus: manifest.trustSummary.status, rawArtifacts: endpoints.length }));
}
void main().catch(() => { console.error("City archive capture failed; preserve any partial files and investigate before retrying"); process.exitCode = 1; });
