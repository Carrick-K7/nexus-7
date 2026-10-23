import { spawn } from "node:child_process";
import path from "node:path";

// Playwright itself merges parent environment into webServer.env. This wrapper
// strips it before launching the application; no production configuration reaches Next.
const port = Number(process.argv[2]);
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid isolated browser-test port");
const database = process.env.NEXUS_E2E_DATABASE_URL ?? "";
if (database) {
  const target = new URL(database);
  if (!["postgres:", "postgresql:"].includes(target.protocol) || !["127.0.0.1", "localhost"].includes(target.hostname) ||
    target.pathname !== "/nexus_research_e2e" || target.port === "55433") throw new Error("Invalid isolated browser-test database");
}
const child = spawn(process.execPath, [path.resolve("node_modules/next/dist/bin/next"), "start", "-H", "127.0.0.1", "-p", String(port)], {
  stdio: "inherit",
  env: {
    PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", LANG: "C.UTF-8", NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1", NEXUS_AUTH_MODE: "development", DATABASE_URL: database, POSTGRES_URL: "",
    NEXUS_MODEL_PROVIDER: "deterministic-mock", SYMBIOSIS_COGNITIVE_PROVIDER: "deterministic", SYMBIOSIS_SHADOW_PROVIDER: "none",
    NEXUS_RESEARCH_ENABLED: "false",
  },
});
child.once("error", () => { console.error("Isolated browser-test server failed to start"); process.exitCode = 1; });
child.once("exit", (code) => { process.exitCode = code ?? 1; });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
