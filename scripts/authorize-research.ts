import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { PostgresExperimentRepository } from "../src/experiments/postgres-repository";
import type { ExperimentActor } from "../src/experiments/types";
import { RESEARCH_SUBJECTS } from "../src/research/catalog";
import { ResearchService } from "../src/research/service";
import {
  OPERATOR_EXECUTOR_ID,
  requireOperatorAuthorization,
  verifyOperatorAuthorizationFile,
} from "../src/research/operator-authorization";

/** Local operator-only entry point. Public APIs and the worker must never import this script. */
export async function authorizeResearchFromCli(argv: readonly string[]): Promise<{
  stationId: string; status: string; configDigest: string; permitDigest: string; nonceDigest: string;
  releaseRevision: string; authorizationStatus: "local-root-permit-not-oidc-or-third-party-signature";
}> {
  if (argv.length !== 2 || argv[0] !== "--permit") throw new Error("Invalid operator command");
  const capability = await verifyOperatorAuthorizationFile(argv[1]);
  const actor: ExperimentActor = {
    id: OPERATOR_EXECUTOR_ID, role: "operator", principalType: "system", authSource: "system",
    workspaceId: process.env.NEXUS_RESEARCH_WORKSPACE_ID, organizationId: process.env.NEXUS_ORGANIZATION_ID,
  };
  requireOperatorAuthorization(capability, actor);
  const connection = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!connection?.trim()) throw new Error("Research operator requires PostgreSQL");
  const pool = new Pool({ connectionString: connection });
  let storageFailed = false;
  // pg can emit idle-client errors outside a query promise. Do not let EventEmitter
  // turn those into an unhandled exception containing private driver details.
  pool.on("error", () => { storageFailed = true; });
  const repository = new PostgresExperimentRepository(pool);
  try {
    // No server factory, schema initialization, fixture identities, workspace bootstrap,
    // runner, model client or research episode is permitted in this command.
    const service = new ResearchService(repository, RESEARCH_SUBJECTS, async () => {
      throw new Error("Operator authorization cannot execute research");
    });
    const station = await service.startFromOperatorAuthorization(actor, capability);
    const authorization = station.authorization!;
    return {
      stationId: station.id, status: station.status, configDigest: authorization.configDigest,
      permitDigest: authorization.permitDigest, nonceDigest: authorization.nonceDigest,
      releaseRevision: authorization.releaseRevision, authorizationStatus: authorization.authentication,
    };
  } finally {
    await repository.close();
    if (storageFailed) throw new Error("Research operator storage failed");
  }
}

/** Catches all filesystem/JSON/PG errors without printing secrets, paths or driver messages. */
export async function runOperatorAuthorizationCli(argv: readonly string[]): Promise<void> {
  try { console.log(JSON.stringify(await authorizeResearchFromCli(argv))); }
  catch {
    console.error(JSON.stringify({ status: "operator-authorization-failed" }));
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void runOperatorAuthorizationCli(process.argv.slice(2));
}
