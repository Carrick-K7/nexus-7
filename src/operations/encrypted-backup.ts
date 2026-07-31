import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import {
  appendFile,
  chmod,
  open,
  readFile,
  rename,
  stat,
  unlink,
} from "node:fs/promises";
import {
  createReadStream,
  createWriteStream,
} from "node:fs";
import {
  pipeline,
} from "node:stream/promises";

const MAGIC = Buffer.from("NEXUS7B1", "ascii");
const IV_BYTES = 12;
const TAG_BYTES = 16;

export interface EncryptedBackupResult {
  inputPath: string;
  outputPath: string;
  sizeBytes: number;
  sha256: string;
  algorithm: "aes-256-gcm";
}

async function backupKey(path: string): Promise<Buffer> {
  const metadata = await stat(path);
  if ((metadata.mode & 0o077) !== 0) {
    throw new Error(
      "Backup key file must not be readable by group or others",
    );
  }
  const encoded = (await readFile(path, "utf8")).trim();
  if (!/^[0-9a-f]{64}$/i.test(encoded)) {
    throw new Error(
      "Backup key file must contain exactly 32 bytes as hexadecimal",
    );
  }
  return Buffer.from(encoded, "hex");
}

export async function backupArtifactSha256(
  path: string,
): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex");
}

async function removeIfPresent(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if (
      typeof error !== "object" ||
      error === null ||
      !("code" in error) ||
      error.code !== "ENOENT"
    ) {
      throw error;
    }
  }
}

export async function encryptBackupFile(
  inputPath: string,
  outputPath: string,
  keyPath: string,
): Promise<EncryptedBackupResult> {
  const key = await backupKey(keyPath);
  const iv = randomBytes(IV_BYTES);
  const temporaryPath = `${outputPath}.tmp`;
  await removeIfPresent(temporaryPath);
  const handle = await open(temporaryPath, "wx", 0o600);
  try {
    await handle.write(Buffer.concat([MAGIC, iv]));
  } finally {
    await handle.close();
  }
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(MAGIC);
  try {
    await pipeline(
      createReadStream(inputPath),
      cipher,
      createWriteStream(temporaryPath, { flags: "a" }),
    );
    await appendFile(temporaryPath, cipher.getAuthTag());
    await chmod(temporaryPath, 0o600);
    await rename(temporaryPath, outputPath);
  } catch (error) {
    await removeIfPresent(temporaryPath);
    throw error;
  }
  const metadata = await stat(outputPath);
  return {
    inputPath,
    outputPath,
    sizeBytes: metadata.size,
    sha256: await backupArtifactSha256(outputPath),
    algorithm: "aes-256-gcm",
  };
}

export async function decryptBackupFile(
  inputPath: string,
  outputPath: string,
  keyPath: string,
): Promise<void> {
  const key = await backupKey(keyPath);
  const metadata = await stat(inputPath);
  const minimumSize = MAGIC.length + IV_BYTES + TAG_BYTES;
  if (metadata.size <= minimumSize) {
    throw new Error("Encrypted backup is truncated");
  }
  const handle = await open(inputPath, "r");
  const prefix = Buffer.alloc(MAGIC.length + IV_BYTES);
  const tag = Buffer.alloc(TAG_BYTES);
  try {
    await handle.read(prefix, 0, prefix.length, 0);
    await handle.read(
      tag,
      0,
      tag.length,
      metadata.size - TAG_BYTES,
    );
  } finally {
    await handle.close();
  }
  if (!prefix.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error("Encrypted backup magic is invalid");
  }
  const iv = prefix.subarray(MAGIC.length);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(tag);
  const temporaryPath = `${outputPath}.tmp`;
  await removeIfPresent(temporaryPath);
  try {
    await pipeline(
      createReadStream(inputPath, {
        start: MAGIC.length + IV_BYTES,
        end: metadata.size - TAG_BYTES - 1,
      }),
      decipher,
      createWriteStream(temporaryPath, {
        flags: "wx",
        mode: 0o600,
      }),
    );
    await chmod(temporaryPath, 0o600);
    await rename(temporaryPath, outputPath);
  } catch (error) {
    await removeIfPresent(temporaryPath);
    throw error;
  }
}
