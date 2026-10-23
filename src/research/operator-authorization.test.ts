// @vitest-environment node

import { constants, type Stats } from "node:fs";
import * as fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryExperimentRepository } from "@/experiments/memory-repository";
import { PostgresExperimentRepository } from "@/experiments/postgres-repository";
import type { ExperimentRepository } from "@/experiments/repository";
import type { ExperimentActor } from "@/experiments/types";
import { ExperimentConflictError, ExperimentPermissionError } from "@/experiments/errors";
import { authorizeResearchFromCli, runOperatorAuthorizationCli } from "../../scripts/authorize-research";
import { RESEARCH_SUBJECTS } from "./catalog";
import type { EpisodeRunner, ResearchSubject } from "./contracts";
import { DEFAULT_RESEARCH_POLICY, researchDigest } from "./integrity";
import { ResearchService } from "./service";
import {
  OPERATOR_AUTHENTICATION, OPERATOR_EXECUTOR_ID, OPERATOR_PERMIT_SCHEMA, OPERATOR_POLICY_CEILING,
  operatorConfigurationDigest, requireOperatorAuthorization, validateOperatorPermit, verifyOperatorAuthorizationFile,
  type OperatorResearchPermit, type VerifiedOperatorAuthorization,
} from "./operator-authorization";

vi.mock("node:fs/promises", async (importOriginal) => ({
  ...await importOriginal<typeof import("node:fs/promises")>(),
}));

const NOW = Date.parse("2026-10-23T12:00:00.000Z");
const RELEASE = "a".repeat(40);
const WORKSPACE = "workspace-operator-test";
const ORGANIZATION = "organization-operator-test";
const PERMIT_PATH = "/private/permit.json";
const actualRoot = typeof process.geteuid === "function" && process.geteuid() === 0;
const originalExitCode = process.exitCode;
// Explicit isolated-test URL only. Never use a production connection fallback.
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

/** Test-only scratch selection; it never changes the production permit verifier. */
async function operatorTestParent(): Promise<string> {
  const parent = process.env.NEXUS_OPERATOR_TEST_PARENT ?? "/root";
  if (!["/root", "/workspace"].includes(parent) || !path.isAbsolute(parent) || path.resolve(parent) !== parent) {
    throw new Error("Invalid operator test parent");
  }
  for (const ancestor of ["/", parent]) {
    const stats = await fs.lstat(ancestor);
    if (!stats.isDirectory() || stats.isSymbolicLink() || stats.uid !== 0 || (stats.mode & 0o7022) !== 0) {
      throw new Error("Invalid operator test parent");
    }
  }
  if (await fs.realpath(parent) !== parent) throw new Error("Invalid operator test parent");
  return parent;
}

function permit(overrides: Partial<OperatorResearchPermit> = {}): OperatorResearchPermit {
  const value: OperatorResearchPermit = {
    schemaVersion: OPERATOR_PERMIT_SCHEMA, approvalSource: "operator-delegated", purpose: "start-once",
    approvedBy: "github:Carrick-K7", executorId: OPERATOR_EXECUTOR_ID,
    humanReferenceDigest: researchDigest("synthetic unit-test reference, not a real user approval"),
    releaseRevision: RELEASE, workspaceId: WORKSPACE, organizationId: ORGANIZATION,
    seed: "operator-test-seed", subjectIds: ["operator-reference"], subjectVersions: { "operator-reference": "test.v1" },
    policy: { ...OPERATOR_POLICY_CEILING }, nonce: "b".repeat(64), issuedAt: new Date(Date.now() - 1_000).toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(), configDigest: "0".repeat(64), ...overrides,
  };
  value.configDigest = operatorConfigurationDigest(value);
  return value;
}
function actor(overrides: Partial<ExperimentActor> = {}): ExperimentActor {
  return { id: OPERATOR_EXECUTOR_ID, role: "operator", principalType: "system", authSource: "system",
    workspaceId: WORKSPACE, organizationId: ORGANIZATION, ...overrides };
}
const human = (): ExperimentActor => actor({ id: "test-only-human", principalType: "human", authSource: "development" });

/** Mock only the OS in unit tests; production has no injected euid, clock or issuer. */
function disk(value: unknown = permit()) {
  let bytes = Buffer.from(JSON.stringify(value));
  const metadata = {
    rootUid: 0, rootMode: 0o755, parentUid: 0, parentMode: 0o700,
    uid: 0, gid: 0, mode: 0o600, nlink: 1, regular: true,
    changedAfterRead: false, fileSymlink: false, parentSymlink: false,
  };
  const close = vi.fn(async () => {});
  let fileStats = 0;
  const stat = () => ({
    uid: metadata.uid, gid: metadata.gid, mode: metadata.mode, nlink: metadata.nlink,
    size: bytes.length, dev: 1, ino: 20, mtimeMs: 100,
    ctimeMs: metadata.changedAfterRead && ++fileStats % 2 === 0 ? 101 : 100,
    isFile: () => metadata.regular,
  });
  const open = vi.spyOn(fs, "open").mockImplementation(async (path, flags) => {
    if (path === "/") return { fd: 10, stat: async () => ({ uid: metadata.rootUid, mode: metadata.rootMode, isDirectory: () => true }), close } as unknown as fs.FileHandle;
    if (path === "/proc/self/fd/10/private") {
      if (metadata.parentSymlink && (Number(flags) & constants.O_NOFOLLOW)) throw new Error("private symlink detail");
      return { fd: 11, stat: async () => ({ uid: metadata.parentUid, mode: metadata.parentMode, isDirectory: () => true }), close } as unknown as fs.FileHandle;
    }
    if (path === "/proc/self/fd/11/permit.json") {
      if (metadata.fileSymlink && (Number(flags) & constants.O_NOFOLLOW)) throw new Error("private symlink detail");
      return { fd: 12, stat: async () => stat(), close,
        read: async (buffer: Buffer, offset: number, length: number, position: number) => {
          const bytesRead = bytes.copy(buffer, offset, position, Math.min(position + length, bytes.length));
          return { bytesRead, buffer };
        },
      } as unknown as fs.FileHandle;
    }
    throw new Error("unexpected private file path");
  });
  return { metadata, open, close,
    write(value: unknown) { bytes = Buffer.from(JSON.stringify(value)); },
    raw(value: string) { bytes = Buffer.from(value); },
    verify: () => verifyOperatorAuthorizationFile(PERMIT_PATH),
  };
}

function subject(): ResearchSubject {
  return {
    id: "operator-reference", version: "test.v1", title: { en: "Test reference", zh: "测试参考" },
    claim: { en: "Bounded test", zh: "有界测试" }, family: "test", origin: "generated-challenge",
    interpretation: "declared-contract", generate: () => 1, valid: (value) => value === 1,
    measure: vi.fn(async () => ({ holds: true, code: "negative-result", facts: { synthetic: true } })),
  };
}
async function setup(repository: ExperimentRepository = new InMemoryExperimentRepository(), scope = WORKSPACE) {
  const instrument = subject();
  const timestamp = new Date().toISOString();
  await repository.ensureWorkspace({ id: scope, name: "Isolated operator test", createdAt: timestamp });
  await repository.ensureOrganization({ id: ORGANIZATION, name: "Isolated operator test", createdAt: timestamp, updatedAt: timestamp });
  await repository.ensureGovernedWorkspace({ workspaceId: scope, organizationId: ORGANIZATION, createdAt: timestamp, updatedAt: timestamp });
  const runner = vi.fn<EpisodeRunner>(async (_station, question, episodeId, meter) => {
    const observation = await meter.observe(instrument, 1, "discovery");
    return { verdict: "no-change", observations: [observation], questions: [], lessons: [{
      id: `${episodeId}:lesson`, episodeId, subjectId: question.subjectId, kind: "limit", status: "provisional",
      statement: { en: "A negative result", zh: "负性结果" }, evidenceIds: [observation.id], applicability: "isolated test only",
    }] };
  });
  const service = new ResearchService(repository, [instrument], runner, { autoInduction: false });
  return { service, repository, instrument, runner, executor: actor({ workspaceId: scope }) };
}

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW);
  vi.spyOn(process, "geteuid").mockReturnValue(0);
  vi.stubEnv("NEXUS_RELEASE_REVISION", RELEASE);
  vi.stubEnv("NEXUS_RESEARCH_WORKSPACE_ID", WORKSPACE);
  vi.stubEnv("NEXUS_ORGANIZATION_ID", ORGANIZATION);
  vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("POSTGRES_URL", "");
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.useRealTimers(); process.exitCode = originalExitCode; });

describe("root-private operator permit verifier", () => {
  it("issues only an opaque capability and an honest local-root receipt", async () => {
    const value = permit(), f = disk(value), capability = await f.verify();
    expect(Object.keys(capability)).toEqual([]);
    expect(Object.isFrozen(capability)).toBe(true);
    const verified = requireOperatorAuthorization(capability, actor());
    expect(verified.permit).toEqual(value);
    expect(verified.authorization).toMatchObject({ authentication: OPERATOR_AUTHENTICATION,
      approvedBy: "github:Carrick-K7", executorId: OPERATOR_EXECUTOR_ID, permitDigest: researchDigest(value), nonceDigest: researchDigest(value.nonce) });
    expect(verified.authorization).not.toHaveProperty("nonce");
    expect(verified.authorization).not.toHaveProperty("seed");
    verified.permit.policy.maxOracleCalls = 20_000;
    verified.authorization.approvalSource = "forged" as "operator-delegated";
    expect(requireOperatorAuthorization(capability, actor()).permit.policy).toEqual(DEFAULT_RESEARCH_POLICY);
    expect(() => requireOperatorAuthorization(JSON.parse(JSON.stringify(capability)), actor())).toThrow(ExperimentPermissionError);
    expect(() => requireOperatorAuthorization({ authorized: true } as unknown as VerifiedOperatorAuthorization, actor())).toThrow(ExperimentPermissionError);
    expect(f.open.mock.calls.every(([, flags]) => (Number(flags) & constants.O_NOFOLLOW) !== 0)).toBe(true);
    expect(Number(f.open.mock.calls.at(-1)![1]) & constants.O_NONBLOCK).not.toBe(0);
    expect(f.close).toHaveBeenCalledTimes(3);
  });

  it("denies nonroot before opening files and rechecks euid after reading", async () => {
    const f = disk(); vi.mocked(process.geteuid!).mockReturnValue(1001);
    await expect(f.verify()).rejects.toThrow(ExperimentPermissionError); expect(f.open).not.toHaveBeenCalled();
    vi.mocked(process.geteuid!).mockReturnValueOnce(0).mockReturnValue(1001);
    await expect(f.verify()).rejects.toThrow(ExperimentPermissionError);
  });

  it.each([
    ["rootUid", 1001], ["rootMode", 0o777], ["parentUid", 1001], ["parentMode", 0o750], ["parentMode", 0o711],
    ["uid", 1001], ["mode", 0o640], ["mode", 0o620], ["mode", 0o604], ["mode", 0o602], ["mode", 0o4600],
    ["nlink", 2], ["regular", false], ["changedAfterRead", true], ["fileSymlink", true], ["parentSymlink", true],
  ] as const)("rejects insecure file metadata %s=%s", async (key, value) => {
    const f = disk(); Object.assign(f.metadata, { [key]: value });
    await expect(f.verify()).rejects.toThrow("Research operator authorization denied");
    expect(f.close).toHaveBeenCalled();
  });

  it.each(["private/permit.json", "/private/../permit.json", "/private/./permit.json", "/private//permit.json", "/private/permit.json/", "/private/permit.json\0", "/permit.json"])(
    "rejects noncanonical or escaping path %s before opening", async (path) => {
      const f = disk(); await expect(verifyOperatorAuthorizationFile(path)).rejects.toThrow(ExperimentPermissionError);
      expect(f.open).not.toHaveBeenCalled();
    });

  it.each(["", " ".repeat(32_769), "{private-file-content", '{"nonce":"one","nonce":"two"}'])("rejects bounded malformed or duplicate-key JSON", async (raw) => {
    const f = disk(); f.raw(raw); await expect(f.verify()).rejects.toThrow("Research operator authorization denied");
  });

  it("rejects duplicate nested keys, including unicode-escaped duplicates", async () => {
    const f = disk(), value = permit();
    f.raw(JSON.stringify(value).replace('"maxEpisodes":40', '"maxEpisodes":40,"max\\u0045pisodes":40'));
    await expect(f.verify()).rejects.toThrow(ExperimentPermissionError);
  });

  it.each(["schemaVersion", "approvalSource", "purpose", "approvedBy", "executorId", "humanReferenceDigest", "releaseRevision", "workspaceId", "organizationId", "seed", "subjectIds", "subjectVersions", "policy", "configDigest", "nonce", "issuedAt", "expiresAt"])(
    "requires explicit closed-schema field %s", (key) => {
      const value = permit() as unknown as Record<string, unknown>; delete value[key];
      expect(() => validateOperatorPermit(value)).toThrow(ExperimentPermissionError);
    });

  it("rejects getters, symbols, hidden fields, arrays with properties and nonplain prototypes without invoking accessors", () => {
    const getter = vi.fn(() => "operator-delegated");
    const a = permit(); Object.defineProperty(a, "approvalSource", { enumerable: true, get: getter });
    const b = permit(); Object.defineProperty(b.policy, "maxOracleCalls", { enumerable: true, get: getter });
    const c = permit(); Object.defineProperty(c, "hidden", { value: true });
    const d = permit(); Object.assign(d.subjectIds, { extra: true });
    const e = permit(); Object.setPrototypeOf(e, { authorized: true });
    const f = permit(); Object.assign(f, { [Symbol("approval")]: true });
    for (const value of [a, b, c, d, e, f]) expect(() => validateOperatorPermit(value)).toThrow(ExperimentPermissionError);
    expect(getter).not.toHaveBeenCalled();
  });

  it.each([
    { authorized: true }, { approvalSource: "oidc" }, { purpose: "resume" }, { approvedBy: "github:other" }, { executorId: "research-worker-1" },
    { releaseRevision: "a".repeat(39) }, { releaseRevision: "A".repeat(40) }, { releaseRevision: "g".repeat(40) },
    { humanReferenceDigest: "private request plaintext" }, { nonce: "b".repeat(63) }, { configDigest: "f".repeat(64) },
    { seed: "different seed without rehash" }, { workspaceId: "workspace-other" }, { organizationId: "organization-other" },
    { subjectIds: [] }, { subjectIds: ["operator-reference", "operator-reference"] },
    { subjectVersions: { "operator-reference": "test.v1", extra: "test.v1" } },
    { policy: { ...OPERATOR_POLICY_CEILING, authorized: true } },
  ])("denies extra keys or incorrect source, SHA, config or scope %j", (patch) => {
    expect(() => validateOperatorPermit({ ...permit(), ...patch })).toThrow(ExperimentPermissionError);
  });

  it.each(Object.keys(OPERATOR_POLICY_CEILING) as Array<keyof typeof OPERATOR_POLICY_CEILING>)("never exceeds the initial %s ceiling", (key) => {
    const value = permit({ policy: { ...OPERATOR_POLICY_CEILING, [key]: OPERATOR_POLICY_CEILING[key] + 1 } });
    expect(() => validateOperatorPermit(value)).toThrow(ExperimentPermissionError);
  });

  it("accepts explicit default and zero-oracle caps but not zero per-episode work or incomplete policy", () => {
    expect(validateOperatorPermit(permit()).policy).toEqual(DEFAULT_RESEARCH_POLICY);
    expect(validateOperatorPermit(permit({ policy: { ...OPERATOR_POLICY_CEILING, maxOracleCalls: 0 } })).policy.maxOracleCalls).toBe(0);
    expect(() => validateOperatorPermit(permit({ policy: { ...OPERATOR_POLICY_CEILING, maxCallsPerEpisode: 0 } }))).toThrow();
    const value = permit(); delete (value.policy as Partial<typeof value.policy>).maxEpisodes;
    expect(() => validateOperatorPermit(value)).toThrow();
  });

  it.each([
    { expiresAt: new Date(NOW).toISOString() }, { issuedAt: new Date(NOW + 1).toISOString() },
    { issuedAt: "invalid" }, { issuedAt: "2026-10-23" }, { expiresAt: "2026-10-23T12:00:00Z" },
    { issuedAt: new Date(NOW).toISOString(), expiresAt: new Date(NOW - 1).toISOString() },
  ])("rejects expired, future or noncanonical times %j", (patch) => {
    expect(() => validateOperatorPermit(permit(patch))).toThrow(ExperimentPermissionError);
  });

  it.each(["NEXUS_RELEASE_REVISION", "NEXUS_RESEARCH_WORKSPACE_ID", "NEXUS_ORGANIZATION_ID"])("requires explicit environment %s", (key) => {
    vi.stubEnv(key, ""); expect(() => validateOperatorPermit(permit())).toThrow(ExperimentPermissionError);
  });

  it.each(["/tmp", "/", "workspace", "/workspace/", "/workspace/../root", "/workspace/child", "/root/child", ""])(
    "rejects nonallowlisted test scratch %j before filesystem access", async (parent) => {
      vi.stubEnv("NEXUS_OPERATOR_TEST_PARENT", parent);
      const lstat = vi.spyOn(fs, "lstat");
      await expect(operatorTestParent()).rejects.toThrow("Invalid operator test parent");
      expect(lstat).not.toHaveBeenCalled();
    });

  it.each([
    { uid: 1001 }, { mode: 0o777 }, { mode: 0o2755 },
    { isDirectory: () => false }, { isSymbolicLink: () => true },
  ])("rejects unsafe scratch parent metadata %j", async (patch) => {
    vi.stubEnv("NEXUS_OPERATOR_TEST_PARENT", "/workspace");
    const safe = { uid: 0, mode: 0o755, isDirectory: () => true, isSymbolicLink: () => false };
    vi.spyOn(fs, "lstat").mockImplementation(async (target) => ({ ...safe, ...(target === "/workspace" ? patch : {}) }) as Stats);
    await expect(operatorTestParent()).rejects.toThrow("Invalid operator test parent");
  });

  it("rejects an unsafe filesystem root or redirected canonical scratch", async () => {
    vi.stubEnv("NEXUS_OPERATOR_TEST_PARENT", "/workspace");
    const safe = { uid: 0, mode: 0o755, isDirectory: () => true, isSymbolicLink: () => false } as Stats;
    const lstat = vi.spyOn(fs, "lstat").mockResolvedValue({ ...safe, uid: 1001 });
    await expect(operatorTestParent()).rejects.toThrow("Invalid operator test parent");
    lstat.mockResolvedValue(safe);
    vi.spyOn(fs, "realpath").mockResolvedValue("/tmp/redirected-test-scratch");
    await expect(operatorTestParent()).rejects.toThrow("Invalid operator test parent");
  });

  it.skipIf(!actualRoot)("checks real Linux root files, mode and both symlink positions", async () => {
    // A disposable root-private test directory, never the deployment permit directory.
    const parent = await operatorTestParent();
    const directory = await fs.mkdtemp(`${parent}/.nexus-operator-unit-`);
    expect(directory).toMatch(/^\/(?:root|workspace)\/\.nexus-operator-unit-[a-zA-Z0-9]+$/);
    expect(path.dirname(directory)).toBe(parent);
    try {
      await fs.chmod(directory, 0o700);
      const path = `${directory}/permit.json`;
      await fs.writeFile(path, JSON.stringify(permit()), { mode: 0o600 });
      const capability = await verifyOperatorAuthorizationFile(path);
      expect(requireOperatorAuthorization(capability, actor()).permit.configDigest).toBe(permit().configDigest);
      await fs.chmod(path, 0o640); await expect(verifyOperatorAuthorizationFile(path)).rejects.toThrow();
      // Owner rejection is covered by metadata tests; no host ownership changes are needed.
      await fs.chmod(path, 0o600);
      await fs.symlink(path, `${directory}/linked.json`);
      await expect(verifyOperatorAuthorizationFile(`${directory}/linked.json`)).rejects.toThrow();
      await fs.symlink(directory, `${directory}/linked-directory`);
      await expect(verifyOperatorAuthorizationFile(`${directory}/linked-directory/permit.json`)).rejects.toThrow();
      await fs.chmod(directory, 0o755);
      await expect(verifyOperatorAuthorizationFile(path)).rejects.toThrow();
      await fs.chmod(directory, 0o700);
      await fs.link(path, `${directory}/hardlinked.json`);
      await expect(verifyOperatorAuthorizationFile(path)).rejects.toThrow();
    } finally {
      // Revalidate the exact, root-owned mkdtemp target before recursive deletion.
      if (!/^\/(?:root|workspace)\/\.nexus-operator-unit-[a-zA-Z0-9]+$/.test(directory) ||
        path.dirname(directory) !== parent || path.resolve(directory) !== directory ||
        await operatorTestParent() !== parent || await fs.realpath(directory) !== directory) throw new Error("Invalid cleanup target");
      const stats = await fs.lstat(directory);
      if (!stats.isDirectory() || stats.isSymbolicLink() || stats.uid !== 0) throw new Error("Invalid cleanup target");
      await fs.rm(directory, { recursive: true });
    }
  });
});

describe("capability-only research start: memory lifecycle contract", () => {
  it("atomically creates provenance plus a system-executed event without work or bootstrap", async () => {
    const f = await setup(), value = permit(), files = disk(value), capability = await files.verify();
    const initialize = vi.spyOn(f.repository, "initialize"), ensure = vi.spyOn(f.repository, "ensureGovernedWorkspace");
    const station = await f.service.startFromOperatorAuthorization(f.executor, capability);
    expect(station.policy).toEqual(DEFAULT_RESEARCH_POLICY);
    expect(station.budget).toMatchObject({ spentCalls: 0, reservedCalls: 0, externalModelCalls: 0, actualModelCostUsd: 0 });
    expect(station.authorization).toMatchObject({ authentication: OPERATOR_AUTHENTICATION, configDigest: value.configDigest });
    expect(JSON.stringify(station)).not.toContain(value.nonce);
    const events = await f.repository.listLifecycleEvents(WORKSPACE);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ id: `research-operator-authorization:${researchDigest(value.nonce)}`,
      actorId: OPERATOR_EXECUTOR_ID, aggregateId: station.id, type: "research.station-started", payload: {
        authorization: station.authorization, executorPrincipalType: "system", executorAuthSource: "system", stateDigest: researchDigest(station),
      } });
    expect(f.instrument.measure).not.toHaveBeenCalled(); expect(f.runner).not.toHaveBeenCalled();
    expect(initialize).not.toHaveBeenCalled(); expect(ensure).not.toHaveBeenCalled();
    expect("createStation" in f.service).toBe(false);
  });

  it("keeps ordinary start, pause and resume strictly human and rejects forged capabilities", async () => {
    const f = await setup(), files = disk(), capability = await files.verify();
    await expect(f.service.start(f.executor, { seed: "seed", subjectIds: [f.instrument.id] })).rejects.toThrow(ExperimentPermissionError);
    for (const forged of [{ authorized: true }, {}, JSON.parse(JSON.stringify(capability)), validateOperatorPermit(permit())]) {
      await expect(f.service.startFromOperatorAuthorization(f.executor, forged as VerifiedOperatorAuthorization)).rejects.toThrow(ExperimentPermissionError);
    }
    await f.service.startFromOperatorAuthorization(f.executor, capability);
    await expect(f.service.pause(f.executor)).rejects.toThrow(ExperimentPermissionError);
    await expect(f.service.resume(f.executor)).rejects.toThrow(ExperimentPermissionError);
  });

  it.each([
    { id: "research-worker-1" }, { principalType: "human" }, { principalType: "service-account" }, { authSource: "development" },
    { role: "viewer" }, { workspaceId: "another-workspace" }, { organizationId: "another-organization" },
  ] as Partial<ExperimentActor>[])("rejects incorrect executor identity %j", async (patch) => {
    const f = await setup(), files = disk();
    await expect(f.service.startFromOperatorAuthorization(actor(patch), await files.verify())).rejects.toThrow(ExperimentPermissionError);
    expect(await f.service.get(f.executor)).toBeNull();
  });

  it("denies a nonroot worker even holding an issued capability", async () => {
    const f = await setup(), files = disk(), capability = await files.verify();
    vi.mocked(process.geteuid!).mockReturnValue(1001);
    await expect(f.service.startFromOperatorAuthorization(f.executor, capability)).rejects.toThrow(ExperimentPermissionError);
    expect(await f.service.get(f.executor)).toBeNull();
  });

  it("reopens and returns the original spent/paused station without resetting or resuming", async () => {
    const f = await setup(), files = disk(), capability = await files.verify();
    await f.service.startFromOperatorAuthorization(f.executor, capability);
    await f.service.step(actor({ id: "ordinary-worker" }), "test-worker");
    const paused = await f.service.pause(human());
    const eventCount = (await f.repository.listLifecycleEvents(WORKSPACE)).length;
    const reopened = new ResearchService(f.repository, [f.instrument], f.runner, { autoInduction: false });
    expect(await reopened.startFromOperatorAuthorization(f.executor, await files.verify())).toEqual(paused);
    expect(paused.budget.spentCalls).toBe(1); expect(paused.status).toBe("paused");
    expect(await f.repository.listLifecycleEvents(WORKSPACE)).toHaveLength(eventCount);
    expect(f.instrument.measure).toHaveBeenCalledTimes(1);
  });

  it.each(["nonce", "seed", "policy", "release", "reference"])("cannot substitute %s when reusing a station", async (change) => {
    const f = await setup(), value = permit(), files = disk(value);
    const original = await f.service.startFromOperatorAuthorization(f.executor, await files.verify());
    if (change === "nonce") value.nonce = "c".repeat(64);
    if (change === "seed") value.seed = "changed-seed";
    if (change === "policy") value.policy.maxOracleCalls -= 1;
    if (change === "release") { value.releaseRevision = "c".repeat(40); vi.stubEnv("NEXUS_RELEASE_REVISION", value.releaseRevision); }
    if (change === "reference") value.humanReferenceDigest = "e".repeat(64);
    value.configDigest = operatorConfigurationDigest(value); files.write(value);
    await expect(f.service.startFromOperatorAuthorization(f.executor, await files.verify())).rejects.toThrow(ExperimentConflictError);
    expect(await f.service.get(f.executor)).toEqual(original);
    expect(await f.repository.listLifecycleEvents(WORKSPACE)).toHaveLength(1);
  });

  it("binds the nonce globally: another workspace rolls back station and event atomically", async () => {
    const f = await setup(), value = permit(), files = disk(value);
    const original = await f.service.startFromOperatorAuthorization(f.executor, await files.verify());
    const other = await setup(f.repository, "workspace-other");
    vi.stubEnv("NEXUS_RESEARCH_WORKSPACE_ID", "workspace-other");
    files.write(permit({ workspaceId: "workspace-other" }));
    await expect(other.service.startFromOperatorAuthorization(other.executor, await files.verify())).rejects.toThrow(ExperimentConflictError);
    expect(await other.service.get(other.executor)).toBeNull();
    expect(await f.repository.listLifecycleEvents("workspace-other")).toHaveLength(0);
    expect(await f.service.get(f.executor)).toEqual(original);
  });

  it("admits one atomic creation under same-capability races, rejects a racing unknown nonce", async () => {
    const f = await setup(), files = disk(), capability = await files.verify();
    const results = await Promise.all([f.service.startFromOperatorAuthorization(f.executor, capability), f.service.startFromOperatorAuthorization(f.executor, capability)]);
    expect(results[0]).toEqual(results[1]);
    expect(await f.repository.listLifecycleEvents(WORKSPACE)).toHaveLength(1);
    files.write(permit({ nonce: "d".repeat(64) }));
    await expect(f.service.startFromOperatorAuthorization(f.executor, await files.verify())).rejects.toThrow(ExperimentConflictError);
  });

  it("allows only one winner when different nonces race the same station", async () => {
    const f = await setup(), files = disk(), first = await files.verify();
    files.write(permit({ nonce: "e".repeat(64) }));
    const second = await files.verify();
    const results = await Promise.allSettled([
      f.service.startFromOperatorAuthorization(f.executor, first),
      f.service.startFromOperatorAuthorization(f.executor, second),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejection = results.find((result) => result.status === "rejected");
    expect(rejection?.status === "rejected" && rejection.reason).toBeInstanceOf(ExperimentConflictError);
    expect(await f.repository.listLifecycleEvents(WORKSPACE)).toHaveLength(1);
    expect(f.instrument.measure).not.toHaveBeenCalled();
  });

  it("expiry does not revoke already authorized bounded work or grant a new start", async () => {
    const f = await setup(), value = permit(), files = disk(value), capability = await files.verify();
    await f.service.startFromOperatorAuthorization(f.executor, capability);
    vi.setSystemTime(Date.parse(value.expiresAt));
    vi.mocked(process.geteuid!).mockReturnValue(1001);
    const completed = await f.service.step(actor({ id: "ordinary-worker" }), "bounded-worker");
    expect(completed!.budget.spentCalls).toBe(1);
    expect(completed!.authorization!.permitDigest).toBe(researchDigest(value));
    await expect(f.service.startFromOperatorAuthorization(f.executor, capability)).rejects.toThrow(ExperimentPermissionError);
  });

  it.each(["source", "config", "policy"])("rejects corrupted persisted authorization %s", async (field) => {
    const f = await setup(), files = disk();
    const station = await f.service.startFromOperatorAuthorization(f.executor, await files.verify());
    if (field === "source") station.authorization!.approvalSource = "oidc" as "operator-delegated";
    if (field === "config") station.authorization!.configDigest = "0".repeat(64);
    if (field === "policy") station.policy.maxOracleCalls += 1;
    const original = f.repository.getLifecycleRecord.bind(f.repository);
    vi.spyOn(f.repository, "getLifecycleRecord").mockImplementation(async (id) => {
      const record = await original(id);
      return record && { ...record, data: { ...station } };
    });
    await expect(f.service.get(f.executor)).rejects.toThrow("integrity");
  });

  it("expired capabilities fail even on retry and expiry during governance lookup cannot create", async () => {
    const f = await setup(), value = permit(), files = disk(value), capability = await files.verify();
    const station = await f.service.startFromOperatorAuthorization(f.executor, capability);
    vi.setSystemTime(Date.parse(value.expiresAt));
    await expect(f.service.startFromOperatorAuthorization(f.executor, capability)).rejects.toThrow(ExperimentPermissionError);
    expect(await f.service.get(f.executor)).toEqual(station);
    vi.setSystemTime(NOW);
    const other = await setup(new InMemoryExperimentRepository());
    const originalLookup = other.repository.getGovernedWorkspace.bind(other.repository);
    vi.spyOn(other.repository, "getGovernedWorkspace").mockImplementation(async (id) => {
      vi.setSystemTime(Date.parse(value.expiresAt)); return originalLookup(id);
    });
    await expect(other.service.startFromOperatorAuthorization(other.executor, capability)).rejects.toThrow(ExperimentPermissionError);
    expect(await other.service.get(other.executor)).toBeNull();
  });

  it("rechecks the release and scoped governance on every retry", async () => {
    const f = await setup(), files = disk(), capability = await files.verify();
    await f.service.startFromOperatorAuthorization(f.executor, capability);
    vi.stubEnv("NEXUS_RELEASE_REVISION", "d".repeat(40));
    await expect(f.service.startFromOperatorAuthorization(f.executor, capability)).rejects.toThrow(ExperimentPermissionError);
    vi.stubEnv("NEXUS_RELEASE_REVISION", RELEASE);
    vi.spyOn(f.repository, "getGovernedWorkspace").mockResolvedValue(null);
    await expect(f.service.startFromOperatorAuthorization(f.executor, capability)).rejects.toThrow("governance");
  });

  it("rejects unknown subjects, catalog version drift and uninitialized governance without work", async () => {
    const f = await setup(), files = disk(permit({ subjectVersions: { "operator-reference": "test.v2" } }));
    await expect(f.service.startFromOperatorAuthorization(f.executor, await files.verify())).rejects.toThrow();
    files.write(permit({ subjectIds: ["unknown"], subjectVersions: { unknown: "test.v1" } }));
    await expect(f.service.startFromOperatorAuthorization(f.executor, await files.verify())).rejects.toThrow();
    files.write(permit());
    const emptyRepository = new InMemoryExperimentRepository();
    const empty = new ResearchService(emptyRepository, [f.instrument], f.runner);
    await expect(empty.startFromOperatorAuthorization(f.executor, await files.verify())).rejects.toThrow("governance");
    expect(await emptyRepository.listLifecycleRecords(WORKSPACE)).toEqual([]);
    expect(f.instrument.measure).not.toHaveBeenCalled();
  });

  it("retains legacy no-authorization station/event hashes and cannot adopt them with a permit", async () => {
    const f = await setup(), value = permit(), files = disk(value);
    const legacy = await f.service.start(human(), { seed: value.seed, subjectIds: value.subjectIds, policy: value.policy });
    const before = researchDigest(legacy);
    expect(legacy).not.toHaveProperty("authorization");
    expect((await f.repository.listLifecycleEvents(WORKSPACE))[0].id).toBe(`${legacy.id}:revision:1`);
    await expect(f.service.startFromOperatorAuthorization(f.executor, await files.verify())).rejects.toThrow(ExperimentConflictError);
    expect(researchDigest(await f.service.get(f.executor))).toBe(before);
  });

  it("honors zero calls and smaller approved caps and never authorizes additional work", async () => {
    const f = await setup(), files = disk(permit({ policy: { ...OPERATOR_POLICY_CEILING, maxOracleCalls: 0 } })), capability = await files.verify();
    const station = await f.service.startFromOperatorAuthorization(f.executor, capability);
    expect(station.status).toBe("budget-exhausted");
    expect(await f.service.step(f.executor, "test-worker")).toEqual(station);
    expect(await f.service.startFromOperatorAuthorization(f.executor, capability)).toEqual(station);
    expect(f.instrument.measure).not.toHaveBeenCalled(); expect(f.runner).not.toHaveBeenCalled();
    const second = await setup();
    files.write(permit({ policy: { ...OPERATOR_POLICY_CEILING, maxOracleCalls: 1, maxEpisodes: 1 } }));
    const small = await files.verify();
    await second.service.startFromOperatorAuthorization(second.executor, small);
    const spent = await second.service.step(second.executor, "worker");
    expect(spent!.budget.spentCalls).toBe(1);
    expect(await second.service.startFromOperatorAuthorization(second.executor, small)).toEqual(spent);
    expect(second.instrument.measure).toHaveBeenCalledTimes(1);
  });
});

describe("standalone sanitized operator CLI", () => {
  function fakePostgres(repository: ExperimentRepository) {
    const initialize = vi.spyOn(PostgresExperimentRepository.prototype, "initialize").mockRejectedValue(new Error("must not bootstrap"));
    vi.spyOn(PostgresExperimentRepository.prototype, "getGovernedWorkspace").mockImplementation((id) => repository.getGovernedWorkspace(id));
    vi.spyOn(PostgresExperimentRepository.prototype, "getOrganization").mockImplementation((id) => repository.getOrganization(id));
    vi.spyOn(PostgresExperimentRepository.prototype, "getLifecycleRecord").mockImplementation((id) => repository.getLifecycleRecord(id));
    vi.spyOn(PostgresExperimentRepository.prototype, "createLifecycleRecord").mockImplementation((input) => repository.createLifecycleRecord(input));
    const close = vi.spyOn(PostgresExperimentRepository.prototype, "close").mockResolvedValue(undefined);
    return { initialize, close };
  }
  it("requires PostgreSQL and strict CLI arguments before any repository queries", async () => {
    const f = await setup(), pg = fakePostgres(f.repository); disk();
    await expect(authorizeResearchFromCli(["--permit", PERMIT_PATH])).rejects.toThrow("requires PostgreSQL");
    await expect(authorizeResearchFromCli(["--permit", PERMIT_PATH, "--seed", "other"])).rejects.toThrow("Invalid operator command");
    expect(PostgresExperimentRepository.prototype.getGovernedWorkspace).not.toHaveBeenCalled();
    expect(pg.initialize).not.toHaveBeenCalled();
  });

  it("starts with no runner and emits only bounded ids, hashes, status and the non-OIDC disclaimer", async () => {
    const f = await setup(), pg = fakePostgres(f.repository), instrument = RESEARCH_SUBJECTS[0];
    const value = permit({ subjectIds: [instrument.id], subjectVersions: { [instrument.id]: instrument.version } });
    disk(value); vi.stubEnv("DATABASE_URL", "postgresql://isolated-test.invalid/not-a-real-database");
    const receipt = await authorizeResearchFromCli(["--permit", PERMIT_PATH]);
    expect(Object.keys(receipt).sort()).toEqual(["authorizationStatus", "configDigest", "nonceDigest", "permitDigest", "releaseRevision", "stationId", "status"]);
    expect(receipt).toMatchObject({ authorizationStatus: OPERATOR_AUTHENTICATION, status: "running", configDigest: value.configDigest });
    expect(pg.initialize).not.toHaveBeenCalled(); expect(pg.close).toHaveBeenCalledOnce();
    expect(JSON.stringify(receipt)).not.toContain(value.nonce);
    const stored = (await f.repository.getLifecycleRecord(receipt.stationId))!;
    expect(stored.data.budget).toMatchObject({ spentCalls: 0, externalModelCalls: 0 });
  });

  it("sanitizes idle-client driver error events and retries a committed start without reset", async () => {
    const f = await setup(), pg = fakePostgres(f.repository), instrument = RESEARCH_SUBJECTS[0];
    disk(permit({ subjectIds: [instrument.id], subjectVersions: { [instrument.id]: instrument.version } }));
    vi.stubEnv("DATABASE_URL", "postgresql://isolated-test.invalid/not-a-real-database");
    pg.close.mockImplementationOnce(async function (this: PostgresExperimentRepository) {
      const pool = (this as unknown as { pool: Pool }).pool;
      pool.emit("error", new Error("private idle-client driver detail"));
      await pool.end();
    });
    const output = vi.spyOn(console, "log").mockImplementation(() => {});
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    await runOperatorAuthorizationCli(["--permit", PERMIT_PATH]);
    expect(output).not.toHaveBeenCalled();
    expect(errors).toHaveBeenCalledExactlyOnceWith('{"status":"operator-authorization-failed"}');
    expect(await f.repository.listLifecycleEvents(WORKSPACE)).toHaveLength(1);
    const retry = await authorizeResearchFromCli(["--permit", PERMIT_PATH]);
    expect(retry.status).toBe("running");
    expect(await f.repository.listLifecycleEvents(WORKSPACE)).toHaveLength(1);
  });

  it("suppresses database errors, secrets and authorization file contents on stderr", async () => {
    const f = await setup(), pg = fakePostgres(f.repository); disk();
    vi.stubEnv("DATABASE_URL", "postgresql://private-user:private-password@isolated-test.invalid/private-db");
    vi.mocked(PostgresExperimentRepository.prototype.getGovernedWorkspace).mockRejectedValue(new Error("private driver detail and credentials"));
    const output = vi.spyOn(console, "log").mockImplementation(() => {});
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    await runOperatorAuthorizationCli(["--permit", PERMIT_PATH]);
    expect(output).not.toHaveBeenCalled(); expect(errors).toHaveBeenCalledExactlyOnceWith('{"status":"operator-authorization-failed"}');
    expect(process.exitCode).toBe(1); expect(pg.close).toHaveBeenCalledOnce();
  });
});

describe.skipIf(!testDatabaseUrl)("operator PostgreSQL lifecycle contract (explicit TEST_DATABASE_URL only)", () => {
  it("persists and reopens provenance and atomically rolls back a cross-workspace nonce replay", async () => {
    vi.useRealTimers();
    const repository = new PostgresExperimentRepository(testDatabaseUrl!);
    const reopenedRepository = new PostgresExperimentRepository(testDatabaseUrl!);
    try {
      await repository.initialize();
      const workspaceId = `operator-pg-${randomUUID()}`;
      vi.stubEnv("NEXUS_RESEARCH_WORKSPACE_ID", workspaceId);
      const f = await setup(repository, workspaceId), value = permit({ workspaceId, nonce: researchDigest(randomUUID()) }), files = disk(value);
      const initial = await f.service.startFromOperatorAuthorization(f.executor, await files.verify());
      const reopened = new ResearchService(reopenedRepository, [f.instrument], f.runner, { autoInduction: false });
      expect(await reopened.startFromOperatorAuthorization(f.executor, await files.verify())).toEqual(initial);
      expect(await repository.listLifecycleEvents(workspaceId)).toHaveLength(1);
      await f.service.step(actor({ id: "pg-worker", workspaceId }), "pg-worker");
      const paused = await f.service.pause({ ...human(), workspaceId });
      expect(paused.budget.spentCalls).toBe(1);
      expect(await reopened.startFromOperatorAuthorization(f.executor, await files.verify())).toEqual(paused);
      expect(await repository.listLifecycleEvents(workspaceId)).toHaveLength(4);
      const otherScope = `operator-pg-${randomUUID()}`;
      const other = await setup(reopenedRepository, otherScope);
      vi.stubEnv("NEXUS_RESEARCH_WORKSPACE_ID", otherScope);
      files.write(permit({ workspaceId: otherScope, nonce: value.nonce }));
      await expect(other.service.startFromOperatorAuthorization(other.executor, await files.verify())).rejects.toThrow(ExperimentConflictError);
      expect(await other.service.get(other.executor)).toBeNull();
      expect(await reopenedRepository.listLifecycleEvents(otherScope)).toHaveLength(0);
      expect(await f.service.get(f.executor)).toEqual(paused);
    } finally { await Promise.all([repository.close(), reopenedRepository.close()]); }
  });
});
