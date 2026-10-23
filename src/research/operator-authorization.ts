import { constants } from "node:fs";
import * as fs from "node:fs/promises";
import { posix } from "node:path";
import type { ExperimentActor } from "@/experiments/types";
import { ExperimentPermissionError } from "@/experiments/errors";
import type { ResearchOperatorAuthorization, ResearchPolicy, ResearchStation } from "./contracts";
import { assertResearchJson, researchDigest, validateResearchPolicy } from "./integrity";

export const OPERATOR_PERMIT_SCHEMA = "nexus.research-operator-permit.v1" as const;
export const OPERATOR_EXECUTOR_ID = "nexus-research-root-operator" as const;
export const OPERATOR_APPROVER = "github:Carrick-K7" as const;
export const OPERATOR_AUTHENTICATION = "local-root-permit-not-oidc-or-third-party-signature" as const;
/** This entry point cannot approve more than the initial bounded research defaults. */
export const OPERATOR_POLICY_CEILING: Readonly<ResearchPolicy> = Object.freeze({
  maxOracleCalls: 800, maxCallsPerEpisode: 96, maxEpisodes: 40, maxAttemptsPerQuestion: 2, leaseMs: 120_000,
});

export interface OperatorResearchPermit {
  schemaVersion: typeof OPERATOR_PERMIT_SCHEMA;
  approvalSource: "operator-delegated";
  purpose: "start-once";
  humanReferenceDigest: string;
  approvedBy: typeof OPERATOR_APPROVER;
  executorId: typeof OPERATOR_EXECUTOR_ID;
  releaseRevision: string;
  workspaceId: string;
  organizationId: string;
  seed: string;
  subjectIds: string[];
  subjectVersions: Record<string, string>;
  policy: ResearchPolicy;
  configDigest: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
}

type OperatorConfiguration = Pick<OperatorResearchPermit,
  "releaseRevision" | "workspaceId" | "organizationId" | "seed" | "subjectIds" | "subjectVersions" | "policy">;

// No public constructor, JSON flag, injectable filesystem/euid, or exported issuer.
// The nominal type is only ergonomic; the private WeakMap is the runtime authority.
declare const verifiedOperatorAuthorization: unique symbol;
export interface VerifiedOperatorAuthorization { readonly [verifiedOperatorAuthorization]: true }
const issuedCapabilities = new WeakMap<VerifiedOperatorAuthorization, OperatorResearchPermit>();
const HASH = /^[a-f0-9]{64}$/;
const REVISION = /^[a-f0-9]{40}$/;
const IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,119}$/;
const MAX_PERMIT_BYTES = 32_768;
const PERMIT_KEYS = ["schemaVersion", "approvalSource", "purpose", "humanReferenceDigest", "approvedBy", "executorId",
  "releaseRevision", "workspaceId", "organizationId", "seed", "subjectIds", "subjectVersions", "policy", "configDigest",
  "nonce", "issuedAt", "expiresAt"];
const AUTHORIZATION_KEYS = ["schemaVersion", "approvalSource", "purpose", "authentication", "approvedBy", "executorId",
  "humanReferenceDigest", "releaseRevision", "configDigest", "nonceDigest", "permitDigest", "issuedAt", "expiresAt"];

function denied(): never { throw new ExperimentPermissionError("Research operator authorization denied"); }
function rootOnly(): void {
  if (process.platform !== "linux" || typeof process.geteuid !== "function" || process.geteuid() !== 0) denied();
}
function closedRecord(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  // Inspect descriptors before reading fields or hashing: getters, symbols and prototypes are not JSON authority.
  try { assertResearchJson(value); } catch { denied(); }
  if (!value || typeof value !== "object" || Array.isArray(value) ||
    Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) denied();
}
function identifier(value: unknown): asserts value is string {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) denied();
}
function hash(value: unknown): asserts value is string {
  if (typeof value !== "string" || !HASH.test(value)) denied();
}
function interval(issuedAt: unknown, expiresAt: unknown): [number, number] {
  if (typeof issuedAt !== "string" || typeof expiresAt !== "string") denied();
  const issued = Date.parse(issuedAt), expires = Date.parse(expiresAt);
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || new Date(issued).toISOString() !== issuedAt ||
    new Date(expires).toISOString() !== expiresAt || issued >= expires) denied();
  return [issued, expires];
}
function runtimeScope(): { releaseRevision: string; workspaceId: string; organizationId: string } {
  const releaseRevision = process.env.NEXUS_RELEASE_REVISION;
  const workspaceId = process.env.NEXUS_RESEARCH_WORKSPACE_ID;
  const organizationId = process.env.NEXUS_ORGANIZATION_ID;
  if (!releaseRevision || !REVISION.test(releaseRevision)) denied();
  identifier(workspaceId); identifier(organizationId);
  return { releaseRevision, workspaceId, organizationId };
}

/** A local content hash, not a signature, OIDC identity, or proof of the referenced human request. */
export function operatorConfigurationDigest(value: OperatorConfiguration): string {
  try { assertResearchJson(value); } catch { denied(); }
  return researchDigest({
    schemaVersion: "nexus.research-operator-configuration.v1", approvalSource: "operator-delegated", purpose: "start-once",
    approvedBy: OPERATOR_APPROVER, executorId: OPERATOR_EXECUTOR_ID, releaseRevision: value.releaseRevision,
    workspaceId: value.workspaceId, organizationId: value.organizationId, seed: value.seed,
    subjectIds: value.subjectIds, subjectVersions: value.subjectVersions, policy: value.policy,
  });
}

/** Validation alone cannot mint a capability. Only the root-private file verifier below can do that. */
export function validateOperatorPermit(value: unknown): OperatorResearchPermit {
  closedRecord(value, PERMIT_KEYS);
  if (value.schemaVersion !== OPERATOR_PERMIT_SCHEMA || value.approvalSource !== "operator-delegated" ||
    value.purpose !== "start-once" || value.approvedBy !== OPERATOR_APPROVER || value.executorId !== OPERATOR_EXECUTOR_ID) denied();
  hash(value.humanReferenceDigest); hash(value.configDigest); hash(value.nonce);
  const expected = runtimeScope();
  if (value.releaseRevision !== expected.releaseRevision || value.workspaceId !== expected.workspaceId ||
    value.organizationId !== expected.organizationId) denied();
  if (typeof value.seed !== "string" || !value.seed.trim() || value.seed.length > 240) denied();
  const ids = value.subjectIds;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 32) denied();
  ids.forEach(identifier);
  if (new Set(ids).size !== ids.length || ids.some((id, index) => index > 0 && ids[index - 1] >= id)) denied();
  closedRecord(value.subjectVersions, ids);
  for (const version of Object.values(value.subjectVersions)) identifier(version);
  closedRecord(value.policy, Object.keys(OPERATOR_POLICY_CEILING));
  try { validateResearchPolicy(value.policy as unknown as ResearchPolicy); } catch { denied(); }
  for (const [key, ceiling] of Object.entries(OPERATOR_POLICY_CEILING)) {
    if ((value.policy[key] as number) > ceiling) denied();
  }
  const [issued, expires] = interval(value.issuedAt, value.expiresAt);
  if (Date.now() < issued || Date.now() >= expires) denied();
  const permit = value as unknown as OperatorResearchPermit;
  if (permit.configDigest !== operatorConfigurationDigest(permit)) denied();
  return structuredClone(permit);
}

/** Reject duplicate JSON keys as well as the non-JSON/getter cases rejected by the schema validator. */
function parsePermit(text: string): unknown {
  const keys: Array<Set<string>> = [];
  const token = /"(?:[^"\\\x00-\x1f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"|[{}]|[^"{}]+/gy;
  let match: RegExpExecArray | null;
  let end = 0;
  while ((match = token.exec(text))) {
    end = token.lastIndex;
    if (match[0] === "{") keys.push(new Set());
    else if (match[0] === "}") keys.pop();
    else if (match[0].startsWith('"') && /^\s*:/.test(text.slice(end))) {
      const key: string = JSON.parse(match[0]);
      const current = keys.at(-1);
      if (!current || current.has(key)) denied();
      current.add(key);
    }
  }
  if (end !== text.length) denied();
  return JSON.parse(text) as unknown;
}

/** Linux descriptor-relative traversal pins every ancestor; caller-controlled symlinks are never followed. */
async function readRootPrivatePermit(filePath: string): Promise<unknown> {
  rootOnly();
  if (typeof filePath !== "string" || filePath.length > 4_096 || filePath.includes("\0") ||
    !posix.isAbsolute(filePath) || posix.normalize(filePath) !== filePath || filePath.endsWith("/")) denied();
  const segments = filePath.slice(1).split("/");
  if (segments.length < 2 || segments.some((part) => !part || part === "." || part === "..")) denied();
  const directories: fs.FileHandle[] = [];
  let file: fs.FileHandle | undefined;
  try {
    directories.push(await fs.open("/", constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW));
    for (let index = 0; index < segments.length; index++) {
      const directory = directories.at(-1)!;
      const stat = await directory.stat();
      if (!stat.isDirectory() || stat.uid !== 0 || (stat.mode & 0o022) !== 0 ||
        (index === segments.length - 1 && (stat.mode & 0o077) !== 0)) denied();
      const path = `/proc/self/fd/${directory.fd}/${segments[index]}`;
      if (index < segments.length - 1) {
        directories.push(await fs.open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW));
      } else {
        // NONBLOCK ensures a FIFO/device cannot hang the verifier before fstat rejects it.
        file = await fs.open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      }
    }
    const before = await file!.stat();
    if (!before.isFile() || before.uid !== 0 || (before.mode & 0o077) !== 0 ||
      (before.mode & 0o7000) !== 0 || before.nlink !== 1 || before.size < 1 || before.size > MAX_PERMIT_BYTES) denied();
    const bytes = Buffer.alloc(MAX_PERMIT_BYTES + 1);
    let length = 0;
    while (length < bytes.length) {
      const read = await file!.read(bytes, length, bytes.length - length, length);
      if (read.bytesRead === 0) break;
      length += read.bytesRead;
    }
    const after = await file!.stat();
    if (length !== before.size || length > MAX_PERMIT_BYTES || before.dev !== after.dev || before.ino !== after.ino ||
      before.mode !== after.mode || before.uid !== after.uid || before.gid !== after.gid || before.nlink !== after.nlink ||
      before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) denied();
    return parsePermit(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, length)));
  } finally {
    await Promise.all([...(file ? [file] : []), ...directories].map((handle) => handle.close()));
  }
}

/** Consumes an OS-protected local delegation; it does NOT authenticate the human via OIDC or a third-party signature. */
export async function verifyOperatorAuthorizationFile(filePath: string): Promise<VerifiedOperatorAuthorization> {
  try {
    const permit = validateOperatorPermit(await readRootPrivatePermit(filePath));
    rootOnly();
    const capability = Object.freeze(Object.create(null)) as VerifiedOperatorAuthorization;
    issuedCapabilities.set(capability, permit);
    return capability;
  } catch { return denied(); } // Never expose a path, file contents, driver error, or parser excerpt.
}

/** Service-only consumption. Rechecks expiry, euid and the exact environment on every admission/retry. */
export function requireOperatorAuthorization(capability: VerifiedOperatorAuthorization, actor: ExperimentActor): {
  permit: OperatorResearchPermit; authorization: ResearchOperatorAuthorization;
} {
  rootOnly();
  const stored = issuedCapabilities.get(capability);
  if (!stored) denied();
  try { assertResearchJson(actor); } catch { denied(); }
  const permit = validateOperatorPermit(stored);
  if (actor.principalType !== "system" || actor.authSource !== "system" || actor.id !== permit.executorId ||
    actor.workspaceId !== permit.workspaceId || actor.organizationId !== permit.organizationId || actor.role !== "operator") denied();
  return {
    permit,
    authorization: {
      schemaVersion: "nexus.research-operator-authorization.v1", approvalSource: permit.approvalSource, purpose: permit.purpose,
      authentication: OPERATOR_AUTHENTICATION, approvedBy: permit.approvedBy, executorId: permit.executorId,
      humanReferenceDigest: permit.humanReferenceDigest, releaseRevision: permit.releaseRevision, configDigest: permit.configDigest,
      nonceDigest: researchDigest(permit.nonce), permitDigest: researchDigest(permit), issuedAt: permit.issuedAt, expiresAt: permit.expiresAt,
    },
  };
}

/** Historical receipts may expire without revoking already bounded work. They never grant resume or a new budget. */
export function validateOperatorAuthorizationProvenance(value: unknown,
  station: Pick<ResearchStation, "workspaceId" | "organizationId" | "seed" | "subjectIds" | "subjectVersions" | "policy" | "createdAt">): void {
  closedRecord(value, AUTHORIZATION_KEYS);
  if (value.schemaVersion !== "nexus.research-operator-authorization.v1" || value.approvalSource !== "operator-delegated" ||
    value.purpose !== "start-once" || value.authentication !== OPERATOR_AUTHENTICATION || value.approvedBy !== OPERATOR_APPROVER ||
    value.executorId !== OPERATOR_EXECUTOR_ID || typeof value.releaseRevision !== "string" || !REVISION.test(value.releaseRevision)) denied();
  for (const field of ["humanReferenceDigest", "configDigest", "nonceDigest", "permitDigest"]) hash(value[field]);
  const [issued, expires] = interval(value.issuedAt, value.expiresAt);
  const created = Date.parse(station.createdAt);
  if (!Number.isFinite(created) || created < issued || created >= expires || value.configDigest !== operatorConfigurationDigest({
    releaseRevision: value.releaseRevision, workspaceId: station.workspaceId, organizationId: station.organizationId,
    seed: station.seed, subjectIds: station.subjectIds, subjectVersions: station.subjectVersions, policy: station.policy,
  })) denied();
  for (const key of Object.keys(OPERATOR_POLICY_CEILING) as Array<keyof ResearchPolicy>) {
    if (station.policy[key] > OPERATOR_POLICY_CEILING[key]) denied();
  }
}
