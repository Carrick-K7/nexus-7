import path from "node:path";
import process from "node:process";
import {
  decryptBackupFile,
  encryptBackupFile,
} from "../src/operations/encrypted-backup";

async function main(): Promise<void> {
  const [mode, input, output] = process.argv.slice(2);
  const keyFile =
    process.env.NEXUS7_BACKUP_ENCRYPTION_KEY_FILE?.trim();
  if (
    (mode !== "encrypt" && mode !== "decrypt") ||
    !input ||
    !output ||
    !keyFile
  ) {
    throw new Error(
      "Usage: NEXUS7_BACKUP_ENCRYPTION_KEY_FILE=... npm run backup:crypt -- <encrypt|decrypt> <input> <output>",
    );
  }
  const inputPath = path.resolve(process.cwd(), input);
  const outputPath = path.resolve(process.cwd(), output);
  if (mode === "encrypt") {
    console.log(
      JSON.stringify(
        await encryptBackupFile(
          inputPath,
          outputPath,
          keyFile,
        ),
      ),
    );
    return;
  }
  await decryptBackupFile(inputPath, outputPath, keyFile);
  console.log(
    JSON.stringify({
      event: "backup.decrypted",
      inputPath,
      outputPath,
    }),
  );
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
