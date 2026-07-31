// @vitest-environment node

import {
  chmod,
  mkdtemp,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import {
  tmpdir,
} from "node:os";
import {
  join,
} from "node:path";
import {
  describe,
  expect,
  it,
} from "vitest";
import {
  decryptBackupFile,
  encryptBackupFile,
} from "./encrypted-backup";

describe("encrypted PostgreSQL backup envelope", () => {
  it("round-trips with AES-256-GCM and mode-0600 files", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "nexus7-backup-"),
    );
    const input = join(directory, "backup.json");
    const encrypted = join(directory, "backup.nexus7");
    const restored = join(directory, "restored.json");
    const key = join(directory, "backup.key");
    const payload = JSON.stringify({
      schemaVersion: 1,
      checksum: "backup-checksum",
      residents: 260,
    });
    await writeFile(input, payload, { mode: 0o600 });
    await writeFile(key, "ab".repeat(32), { mode: 0o600 });

    const result = await encryptBackupFile(
      input,
      encrypted,
      key,
    );
    await decryptBackupFile(encrypted, restored, key);

    expect(result).toMatchObject({
      inputPath: input,
      outputPath: encrypted,
      algorithm: "aes-256-gcm",
    });
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect((await stat(encrypted)).mode & 0o777).toBe(0o600);
    expect((await stat(restored)).mode & 0o777).toBe(0o600);
    expect(await readFile(restored, "utf8")).toBe(payload);
  });

  it("rejects a key that is readable by other users", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "nexus7-backup-key-"),
    );
    const input = join(directory, "backup.json");
    const key = join(directory, "backup.key");
    await writeFile(input, "backup", { mode: 0o600 });
    await writeFile(key, "cd".repeat(32), { mode: 0o644 });
    await chmod(key, 0o644);

    await expect(
      encryptBackupFile(
        input,
        join(directory, "backup.nexus7"),
        key,
      ),
    ).rejects.toThrow("must not be readable");
  });

  it("rejects a modified authenticated artifact", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "nexus7-backup-tamper-"),
    );
    const input = join(directory, "backup.json");
    const encrypted = join(directory, "backup.nexus7");
    const restored = join(directory, "restored.json");
    const key = join(directory, "backup.key");
    await writeFile(input, "authenticated backup", {
      mode: 0o600,
    });
    await writeFile(key, "ef".repeat(32), { mode: 0o600 });
    await encryptBackupFile(input, encrypted, key);
    const modified = await readFile(encrypted);
    modified[Math.floor(modified.length / 2)] ^= 0xff;
    await writeFile(encrypted, modified, { mode: 0o600 });

    await expect(
      decryptBackupFile(encrypted, restored, key),
    ).rejects.toThrow();
  });
});
