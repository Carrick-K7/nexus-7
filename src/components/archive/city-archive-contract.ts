/** Static, read-only archive projection. Validation is not an authenticity certificate. */
export interface CityArchiveManifest {
  schemaVersion: "nexus.city-archive.v1";
  state: "archived" | "pending";
  capturedAt: string | null;
  stoppedAt: string | null;
  releaseRevision: string;
  turn: number | null;
  simulationDate: string | null;
  fingerprint: string | null;
  reason: { en: string; zh: string };
  trustSummary: { observedDays: number | null; requiredDays: 90; status: string };
  artifacts: Array<{ label: { en: string; zh: string }; href: string; sha256?: string }>;
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 4_096;
}
function localized(value: unknown): boolean {
  return object(value) && text(value.en) && text(value.zh);
}
function nullableText(value: unknown): boolean { return value === null || text(value); }
function timestamp(value: unknown): boolean {
  return value === null || (text(value) && /^\d{4}-\d\d-\d\dT.+(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value)));
}

/** Only ordinary root-relative or HTTPS document links, never executable URLs. */
export function safeArchiveHref(value: unknown): value is string {
  if (!text(value) || /[\s\\\u0000-\u001f\u007f]/.test(value)) return false;
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch { return false; }
}

export function parseCityArchive(value: unknown): CityArchiveManifest | null {
  if (!object(value) || value.schemaVersion !== "nexus.city-archive.v1"
    || (value.state !== "archived" && value.state !== "pending")
    || !timestamp(value.capturedAt) || !timestamp(value.stoppedAt)
    || !text(value.releaseRevision) || !nullableText(value.simulationDate) || !nullableText(value.fingerprint)
    || !(value.turn === null || (typeof value.turn === "number" && Number.isSafeInteger(value.turn) && value.turn >= 0))
    || !localized(value.reason) || !object(value.trustSummary)
    || value.trustSummary.requiredDays !== 90 || !text(value.trustSummary.status)
    || !(value.trustSummary.observedDays === null || (typeof value.trustSummary.observedDays === "number" && Number.isFinite(value.trustSummary.observedDays) && value.trustSummary.observedDays >= 0))
    || !Array.isArray(value.artifacts) || value.artifacts.length > 100
    || !value.artifacts.every((artifact) => object(artifact) && localized(artifact.label)
      && safeArchiveHref(artifact.href) && (artifact.sha256 === undefined || (typeof artifact.sha256 === "string" && /^[a-f0-9]{64}$/i.test(artifact.sha256))))) return null;
  return value as unknown as CityArchiveManifest;
}

/** Missing capture/stop evidence must never be presented as completed retirement. */
export function hasCompletedCityArchive(manifest: CityArchiveManifest): boolean {
  return manifest.state === "archived" && manifest.capturedAt !== null && manifest.stoppedAt !== null
    && manifest.turn !== null && manifest.simulationDate !== null && manifest.fingerprint !== null
    && manifest.artifacts.length > 0;
}
