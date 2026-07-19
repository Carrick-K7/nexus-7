import { defineConfig, devices } from "@playwright/test";

const e2ePort = Number(process.env.NEXUS_E2E_PORT ?? 43_217);
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;

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
    command: `npm run start -- -H 127.0.0.1 -p ${e2ePort}`,
    url: e2eBaseUrl,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      NEXUS_AUTH_MODE: "development",
    },
  },
});
