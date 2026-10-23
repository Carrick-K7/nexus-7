import type { ResearchOverview, ResearchStation } from "./contracts";

/** A process-level release assertion, not independent remote attestation or a worker heartbeat. */
export function researchRuntime(station: ResearchStation | null): NonNullable<ResearchOverview["runtime"]> {
  const configured = process.env.NEXUS_RELEASE_REVISION?.trim();
  const releaseRevision = configured && /^[a-f0-9]{40}$/.test(configured) ? configured : null;
  return { releaseRevision, evidence: releaseRevision ? "deployment-env" : "local-unbound", lastEpisodeAt: station?.episodes.at(-1)?.completedAt ?? null };
}

export function persistentResearchRequired(): boolean {
  return process.env.NODE_ENV === "production" && process.env.NEXUS_AUTH_MODE !== "development";
}
