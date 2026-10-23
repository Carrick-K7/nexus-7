// @vitest-environment node
import { mkdtemp, mkdir, readFile, writeFile, symlink, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

it("starts the research entry with real Node/tsx and no npm on PATH", async () => {
  const parent = await realpath(os.tmpdir());
  const directory = await mkdtemp(path.join(parent, "nexus-startup-reference-"));
  try {
    await mkdir(path.join(directory, "scripts"));
    await mkdir(path.join(directory, "bin"));
    await writeFile(path.join(directory, "scripts/start-production.sh"), await readFile("scripts/start-production.sh"), { mode: 0o755 });
    await writeFile(path.join(directory, ".deploy-sha"), `${"a".repeat(40)}\n`);
    await writeFile(path.join(directory, "test-password"), "reference-only@password", { mode: 0o600 });
    await symlink(path.resolve("node_modules"), path.join(directory, "node_modules"), "dir");
    for (const tool of ["bash", "tr", "dirname"]) await symlink(`/usr/bin/${tool}`, path.join(directory, "bin", tool));
    await symlink(process.execPath, path.join(directory, "bin/node"));
    await writeFile(path.join(directory, "scripts/run-research-worker.ts"), `
      const boundary: string = "synthetic-startup-only";
      const connection = new URL(process.env.DATABASE_URL!);
      console.log(JSON.stringify({ boundary, arguments: process.argv.slice(2), revision: process.env.NEXUS_RELEASE_REVISION,
        credentialDecoded: decodeURIComponent(connection.password) === "reference-only@password",
        host: connection.hostname, database: connection.pathname }));
    `);
    const result = spawnSync("/usr/bin/bash", [path.join(directory, "scripts/start-production.sh"), "research", "--once"], {
      cwd: directory, encoding: "utf8", timeout: 20_000,
      env: { PATH: path.join(directory, "bin"), NODE_ENV: "test", TSX_DISABLE_CACHE: "1",
        NEXUS7_DB_PASSWORD_FILE: path.join(directory, "test-password"), NEXUS7_DB_HOST: "127.0.0.1", NEXUS7_DB_NAME: "reference_only" },
    });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ boundary: "synthetic-startup-only", arguments: ["--once"],
      revision: "a".repeat(40), credentialDecoded: true, host: "127.0.0.1", database: "/reference_only" });
    expect(result.stdout).not.toContain("reference-only@password");
  } finally {
    if (path.dirname(directory) !== parent || !/^nexus-startup-reference-[a-zA-Z0-9]+$/.test(path.basename(directory)) || await realpath(directory) !== directory) throw new Error("Unsafe startup fixture cleanup");
    await rm(directory, { recursive: true });
  }
});
