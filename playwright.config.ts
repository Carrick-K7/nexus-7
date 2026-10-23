import { defineConfig, devices } from "@playwright/test";

const e2ePort = Number(process.env.NEXUS_E2E_PORT ?? 43_217);
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;
// Never inherit a production DATABASE_URL into development-auth browser tests.
const e2eDatabaseUrl = process.env.NEXUS_E2E_DATABASE_URL ?? "";
if (e2eDatabaseUrl) {
  const target = new URL(e2eDatabaseUrl);
  if (!["postgres:", "postgresql:"].includes(target.protocol) ||
    !["127.0.0.1", "localhost"].includes(target.hostname) ||
    target.pathname !== "/nexus_research_e2e" || target.port === "55433") {
    throw new Error("Browser tests require the explicitly named isolated local test database");
  }
}

export default defineConfig({
  testDir: "./e2e",
  // The browser suite intentionally exercises one shared in-memory control
  // plane. Serial execution keeps each workflow's projection atomic.
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: e2eBaseUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: devices["Desktop Chrome"],
    },
  ],
  webServer: {
    command: `node scripts/start-e2e-server.mjs ${e2ePort}`,
    url: e2eBaseUrl,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? "",
      LANG: "C.UTF-8",
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
      NEXUS_AUTH_MODE: "development",
      NEXUS_E2E_DATABASE_URL: e2eDatabaseUrl,
      DATABASE_URL: "",
      POSTGRES_URL: "",
      NEXUS_MODEL_PROVIDER: "deterministic-mock",
      SYMBIOSIS_COGNITIVE_PROVIDER: "deterministic",
      SYMBIOSIS_SHADOW_PROVIDER: "none",
      NEXUS_RESEARCH_ENABLED: "false",
    },
  },
});
