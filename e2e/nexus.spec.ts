import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("v4 simulated-city APIs preserve privacy and zero-denominator honesty", async ({ page }) => {
  const headers = {
    "x-nexus-actor": "symbiosis-browser-researcher",
    "x-nexus-role": "viewer",
    "x-nexus-principal-type": "human",
  };
  const snapshotResponse = await page.request.get(
    "/api/world/v3/snapshot",
    { headers },
  );
  expect(snapshotResponse.ok()).toBe(true);
  const snapshot = await snapshotResponse.json();
  expect(snapshot.projection).toBe("researcher-pseudonymized");
  expect(snapshot.season.foregroundResidentCount).toBe(260);
  expect(snapshot.season.backgroundPopulation).toBe(18_248_500);
  expect(snapshot.snapshot.residentStates).toHaveLength(260);

  const residentResponse = await page.request.get(
    "/api/residents/resident-sz-201/view",
    { headers },
  );
  expect(residentResponse.ok()).toBe(true);
  const resident = await residentResponse.json();
  expect(resident.resident.kind).toBe("ai");
  expect(resident.resident.controller).toBe("cognitive-gateway");

  const eventsResponse = await page.request.get(
    "/api/world/v3/events?afterCursor=0",
    { headers },
  );
  expect(eventsResponse.ok()).toBe(true);
  expect((await eventsResponse.json()).privateFieldsIncluded).toBe(false);

  const reportResponse = await page.request.get(
    "/api/reports/symbiosis",
    { headers },
  );
  expect(reportResponse.ok()).toBe(true);
  const report = await reportResponse.json();
  expect(report.status).toBe("feasibility-only");
  expect(report.ralr).toMatchObject({
    numerator: 0,
    denominator: 0,
    rate: null,
  });

  const observatoryResponse = await page.request.get(
    "/api/observatory/v1/overview",
    { headers },
  );
  expect(observatoryResponse.ok()).toBe(true);
  const observatory = await observatoryResponse.json();
  expect(observatory.schemaVersion).toBe("nexus.human-observatory.v1");
  expect(observatory.units).toHaveLength(260);
  expect(observatory.institutions).toHaveLength(24);
  expect(observatory.production).toMatchObject({
    autonomousControlRate: 1,
    humanLaborDependencyRate: 0,
    modeledStageCoverageRate: 1,
  });
  expect(observatory.evidence).toMatchObject({
    privateFieldsIncluded: false,
    modelReasoningIncluded: false,
    consciousnessClaimed: false,
  });

  const livingCityResponse = await page.request.get(
    "/api/observatory/v2/overview",
    { headers },
  );
  expect(livingCityResponse.ok()).toBe(true);
  const livingCity = await livingCityResponse.json();
  expect(livingCity.schemaVersion).toBe("nexus.human-observatory.v2");
  expect(livingCity.population.byKind).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: "human", count: 200 }),
      expect.objectContaining({ kind: "ai", count: 36 }),
      expect.objectContaining({ kind: "robot", count: 24 }),
    ]),
  );
  expect(livingCity.economy).toMatchObject({
    persistedLedgerRows: 24,
    residentStateRows: 260,
    activeResourceFlows: 0,
  });
  expect(livingCity.economy.resources).toHaveLength(8);
});

for (const viewport of [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 },
] as const) {
  test(`${viewport.name} Human Observatory is understandable and WCAG A/AA clean`, async ({
    page,
  }) => {
    test.slow();
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(
      page.getByRole("heading", {
        name: "SHENZHEN SYMBIOSIS CITY · HUMAN OBSERVATORY",
      }),
    ).toBeVisible();
    await expect(page.getByText("START HERE · WHAT IS THIS?")).toBeVisible();
    await expect(page.getByText("LIVING CITY FLOW")).toBeVisible();
    await expect(page.getByTestId("city-flow-map")).toBeVisible();
    await expect(page.getByTestId("resource-ledger-table")).toBeVisible();
    await expect(page.getByText("END-TO-END AI PRODUCTION")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "EVERY RESIDENT" }),
    ).toBeVisible();
    await expect(page.getByTestId("unit-status-table")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Inspect resident:/ }).first(),
    ).toBeVisible();
    await page
      .getByRole("button", { name: /Inspect resident:/ })
      .first()
      .click();
    await expect(page.getByText("SELECTED RESIDENT")).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
    if (viewport.name === "mobile") {
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    }
  });
}

test("Human Observatory explains the city in Chinese", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Change language" }).click();
  await page.getByRole("button", { name: "中文" }).click();
  await expect(
    page.getByRole("heading", { name: "深圳共生城市 · 人类观测台" }),
  ).toBeVisible();
  await expect(page.getByText("城市实时资源流")).toBeVisible();
  await expect(page.getByText("生产环节全链条 AI 化")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "每一位居民" }),
  ).toBeVisible();
  await expect(page.getByText(/AI 指标不代表意识/)).toBeVisible();
  await expect(page.getByText("合成人类")).toHaveCount(0);
});

test("desktop shell, agent details, and charts remain stable", async ({ page }) => {
  test.slow();

  const runtimeErrors: string[] = [];
  const chartWarnings: string[] = [];

  page.on("pageerror", error => runtimeErrors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error") {
      runtimeErrors.push(message.text());
    }
    if (message.type() === "warning" && message.text().includes("width(-1)")) {
      chartWarnings.push(message.text());
    }
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Dashboard" }).click();
  await expect(page.getByRole("heading", { name: "CITY OVERVIEW" })).toBeVisible();
  await page.getByRole("button", { name: "10x", exact: true }).click();
  await page.waitForTimeout(1_200);

  await page.getByRole("button", { name: "AI Agents" }).click();
  await page.getByText("ATLAS", { exact: true }).last().click();
  await expect(page.getByRole("dialog", { name: /ATLAS/i })).toBeVisible();
  await page.waitForTimeout(1_200);

  await expect(page.getByText("This page couldn’t load")).toHaveCount(0);
  expect(runtimeErrors).toEqual([]);
  expect(chartWarnings).toEqual([]);
});

test("simulation can pause, step, replay, reset, and continue across views", async ({ page }) => {
  test.slow();

  await page.goto("/");
  await page.getByRole("button", { name: "Dashboard" }).click();

  const tick = page.getByTestId("simulation-tick");
  await expect(tick).toContainText("Tick");
  await page.getByRole("button", { name: "Pause simulation" }).last().click();

  const pausedTick = Number((await tick.textContent())?.match(/\d+/)?.[0]);
  await page.waitForTimeout(1_200);
  await expect(tick).toHaveText(`Tick ${pausedTick}`);

  await page.getByRole("button", { name: "Advance simulation by one step" }).click();
  await expect(tick).toHaveText(`Tick ${pausedTick + 1}`);

  await page.getByRole("button", { name: "Verify deterministic replay" }).click();
  await expect(page.getByTestId("replay-status")).toContainText("Replay verified");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export simulation run" }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();

  await page.getByRole("button", { name: "Reset simulation" }).click();
  await expect(tick).toHaveText("Tick 0");
  await page.getByLabel("Import simulation run").setInputFiles(downloadPath!);
  await expect(page.getByRole("status")).toContainText(
    "Simulation run imported and replay-verified",
  );
  await expect(tick).toHaveText(`Tick ${pausedTick + 1}`);

  await page.getByRole("button", { name: "AI Agents" }).click();
  await page.getByRole("button", { name: "Resume simulation" }).click();
  await page.waitForTimeout(1_200);
  await page.getByRole("button", { name: "Dashboard" }).click();
  await expect(tick).not.toHaveText(`Tick ${pausedTick + 1}`);

  await page.getByRole("button", { name: "Pause simulation" }).last().click();
  await page.getByRole("button", { name: "Reset simulation" }).click();
  await expect(tick).toHaveText("Tick 0");
  await expect(page.getByTestId("replay-status")).toContainText("Replay not checked");
});

test("all primary views render without the application error boundary", async ({ page }) => {
  test.slow();

  const views = [
    ["Dashboard", "CITY OVERVIEW"],
    [
      "Human Observatory",
      "SHENZHEN SYMBIOSIS CITY · HUMAN OBSERVATORY",
    ],
    ["Neural Net", "NEURAL NETWORK"],
    ["Trading", "MARKET TRADING"],
    ["Missions", "MISSIONS"],
    ["Terminal", "TERMINAL"],
    ["ARIA", "ARIA"],
    ["Quantum", "QUANTUM CORE"],
    ["Satellite", "SATELLITE CONTROL"],
    ["Hacker", "HACKING INTERFACE"],
    ["AI Agents", "AI Agents"],
    ["City 3D", "CITY OVERVIEW"],
    ["Analytics", "DATA ANALYTICS"],
    ["Emergency", "EMERGENCY RESPONSE"],
    ["Weather", "ENVIRONMENT"],
    ["Resource", "RESOURCE MANAGEMENT"],
    ["SOCIAL HUB", "SOCIAL HUB"],
    ["EVOLUTION LOG", "EVOLUTION LOG"],
    ["Observer", "OBSERVER DASHBOARD"],
    ["Experiments", "EXPERIMENT PLATFORM"],
    ["Iteration Lab", "CONTROLLED ITERATION LAB"],
    ["Verification", "VERIFIED AUTONOMY"],
    ["Operations", "OPERATIONS CENTER"],
    ["Governance Evidence", "GOVERNANCE EVIDENCE"],
    ["News", "CITY NEWS"],
    ["Achievements", "Achievements"],
    ["Settings", "SETTINGS"],
    ["About", "ABOUT NEXUS"],
  ] as const;

  await page.goto("/");

  for (const [navigationLabel, heading] of views) {
    await page.getByRole("button", { name: navigationLabel, exact: true }).click();
    await expect(page.getByRole("heading", { name: heading, exact: true }).first()).toBeVisible();
    await expect(page.getByText("This page couldn’t load")).toHaveCount(0);
  }

  await page.getByRole("button", { name: "EVOLUTION LOG", exact: true }).click();
  await expect(page.getByText("v0.3.0", { exact: true })).toBeVisible();
  await expect(page.getByText("vv0.3.0", { exact: true })).toHaveCount(0);
});

test("terminal, ARIA, language, and persistence work", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Terminal" }).click();
  const terminalInput = page.locator("main input");
  await terminalInput.fill("help");
  await terminalInput.press("Enter");
  await expect(page.getByText(/Available commands:/)).toBeVisible();

  await page.getByRole("button", { name: "ARIA", exact: true }).first().click();
  const ariaInput = page.getByPlaceholder("Ask ARIA anything...");
  await ariaInput.fill("status");
  await ariaInput.press("Enter");
  await expect(page.getByText("status", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/Analyzing current city data|Energy grid analysis|Threat assessment|Processing your request/),
  ).toBeVisible();

  await ariaInput.fill("why coordinator decision");
  await ariaInput.press("Enter");
  await expect(page.getByText(/ARIA reviewed .* proposals/)).toBeVisible();

  await page.getByRole("button", { name: "Change language" }).click();
  await page.getByRole("button", { name: "中文" }).click();
  await expect(page.getByRole("button", { name: "仪表盘" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: "仪表盘" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Change language" })).toContainText("ZH");
});

test("observer reconstructs traces and compares counterfactual runs", async ({ page }) => {
  test.slow();

  await page.goto("/");
  await page.getByRole("button", { name: "Dashboard" }).click();
  await page.getByRole("button", { name: "10x", exact: true }).click();
  await page.waitForTimeout(2_200);
  await page.getByRole("button", { name: "Pause simulation" }).last().click();
  await page.getByRole("button", { name: "Verify deterministic replay" }).click();

  const currentTickText = await page.getByTestId("simulation-tick").textContent();
  const currentTick = Number(currentTickText?.match(/\d+/)?.[0]);
  expect(currentTick).toBeGreaterThan(10);

  await page.getByRole("button", { name: "Observer" }).click();
  await expect(
    page.getByRole("heading", { name: "OBSERVER DASHBOARD" }),
  ).toBeVisible();
  await expect(page.getByText("Verified autonomy loop rate")).toBeVisible();
  await expect(page.getByText("Trace completeness").first()).toBeVisible();

  await page.getByLabel("Tick to inspect").fill("10");
  await page.getByRole("button", { name: "Inspect tick" }).click();
  await expect(page.getByTestId("tick-inspection")).toContainText("tick 10");

  await page.getByRole("button", { name: "Compare runs" }).click();
  await expect(page.getByTestId("run-comparison")).toContainText("Δ events");

  await page.getByRole("button", { name: "Generate model proposal" }).click();
  const approval = page.getByTestId("approval-request").first();
  await expect(approval).toContainText("pending");
  await page.getByRole("button", { name: "Approve atlas" }).click();
  await expect(approval).toContainText("approved");
  await page.getByRole("button", { name: "Resume simulation" }).click();
  await expect(approval).toContainText("executed");
  await page.getByRole("button", { name: "Pause simulation" }).click();

  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
});

test("observer traces the coherent city ontology into a persisted synthetic incident", async ({
  page,
}) => {
  test.slow();

  await page.goto("/");
  await page.getByRole("button", { name: "Observer", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "COHERENT CITY MODEL" }),
  ).toBeVisible();
  await expect(page.getByTestId("coherent-city-model")).toContainText(
    "22",
  );
  await expect(
    page.getByRole("region", { name: "City metric dictionary" }),
  ).toContainText("network-continuity");

  await page
    .getByRole("button", { name: "Inject cascade scenario" })
    .click();
  await expect(page.getByText("GRID_TRANSFORMER_CAPACITY_LOSS")).toBeVisible();
  await expect(
    page.getByText(/synthetic population affected/i),
  ).toBeVisible();
});

test("observer runs the durable incident-to-lesson reference loop without manual data", async ({
  page,
}) => {
  test.slow();

  await page.goto("/");
  await page
    .getByRole("button", { name: "Observer", exact: true })
    .click();
  const workbench = page.getByTestId(
    "closed-loop-workbench",
  );
  await expect(workbench).toBeVisible();
  await page
    .getByTestId("run-closed-loop-reference")
    .click();
  await expect(
    page.getByTestId("closed-loop-status"),
  ).toHaveText("closed", { timeout: 30_000 });
  await expect(
    page.getByTestId("closed-loop-disposition"),
  ).toHaveText("beneficial");
  await expect(workbench).toContainText(
    "deployment-record-closed-loop-case-city-economic-single-fault",
  );
  await expect(workbench).toContainText(
    "learning-proposal",
  );
  await expect(
    workbench.locator('[data-stage-status="completed"]'),
  ).toHaveCount(10);

  const accessibility = await new AxeBuilder({
    page,
  })
    .include('[data-testid="closed-loop-workbench"]')
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
});

test("causal explorer preserves alternatives and replays frozen counterfactuals", async ({
  page,
}) => {
  test.slow();

  await page.goto("/");
  await page.getByRole("button", { name: "Observer", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "CAUSAL EXPLORER" }),
  ).toBeVisible();
  await expect(page.getByText("Top-3 root-cause hit")).toBeVisible();
  await page
    .getByRole("button", { name: "Diagnose cascade scenario" })
    .click();
  await expect(
    page.getByText("GRID_TRANSFORMER_CAPACITY_LOSS").first(),
  ).toBeVisible();
  await expect(
    page.getByRole("region", {
      name: "Frozen-snapshot counterfactual tests",
    }),
  ).toContainText("100%");
  await expect(page.getByTestId("hypothesis-graph")).toContainText(
    "alternative",
  );
  await expect(page.getByText("eligible", { exact: true })).toBeVisible();

  await page.getByLabel("Explanation").selectOption("audit");
  await expect(
    page.getByText("INDEPENDENT AGENT SUBMISSIONS"),
  ).toBeVisible();
  await expect(page.getByText("provenance preserved").first()).toBeVisible();
});

test("planning workbench compares no-action, approves evidence, and stages safely", async ({
  page,
}) => {
  test.slow();
  await page.context().setExtraHTTPHeaders({
    "x-nexus-actor": "browser-planning-admin",
    "x-nexus-role": "admin",
    "x-nexus-principal-type": "human",
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Observer", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "PLANNING WORKBENCH" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Create planning portfolio" })
    .click();
  const plan = page.getByTestId("intervention-plan");
  await expect(plan).toContainText("awaiting-approval");
  await expect(plan).toContainText("No action");
  await expect(plan).toContainText("Direct cause stabilization");
  await expect(plan).toContainText("Protected-service resilience");
  await expect(
    page.getByRole("region", {
      name: "Intervention candidate portfolio",
    }),
  ).toContainText("No action");
  await expect(plan).toContainText("holm-bonferroni");
  await expect(plan).toContainText("guardrail-breach");

  await page
    .getByRole("button", { name: "Approve selected plan" })
    .click();
  await expect(plan).toContainText("approved");
  await page
    .getByRole("button", { name: "Stage authorized plan" })
    .click();
  await expect(plan).toContainText("staged");
});

test("outcome learning revises delayed benefit and invalidates unsafe memory", async ({
  page,
}) => {
  test.slow();
  await page.context().setExtraHTTPHeaders({
    "x-nexus-actor": "browser-outcome-admin",
    "x-nexus-role": "admin",
    "x-nexus-principal-type": "human",
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Observer", exact: true }).click();
  await page
    .getByRole("button", { name: "Prepare sustained-outcome portfolio" })
    .click();

  const plan = page.getByTestId("intervention-plan");
  await expect(plan).toContainText("awaiting-approval");
  await page
    .getByRole("button", { name: "Approve selected plan" })
    .click();
  await expect(plan).toContainText("approved");
  await page
    .getByRole("button", { name: "Stage authorized plan" })
    .click();
  await expect(plan).toContainText("staged");

  await page
    .getByRole("button", { name: "Evaluate delayed outcome" })
    .click();
  const outcome = page.getByTestId("outcome-record");
  await expect(outcome).toContainText("beneficial");
  await expect(
    page.getByRole("table", {
      name: "Short-, medium-, and long-horizon outcome windows",
    }),
  ).toContainText("long");
  await expect(outcome).toContainText("Prediction error");
  await expect(page.getByText("LESSON REGISTRY")).toBeVisible();

  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);

  await page
    .getByRole("button", { name: "Propose governed test" })
    .click();
  await expect(
    page.getByText("existing-controlled-iteration").first(),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Inject synthetic late harm" })
    .click();
  await expect(outcome).toContainText("harmful");
  await expect(outcome).toContainText("revision 2");
  await expect(outcome).toContainText(
    "incident reopened by later evidence",
  );
  await expect(
    page.getByText(/invalidated/).first(),
  ).toBeVisible();
});

test("participatory governance applies deliberation and makes an appeal change real state", async ({
  page,
}) => {
  test.slow();
  await page.context().setExtraHTTPHeaders({
    "x-nexus-actor": "browser-participation-admin",
    "x-nexus-role": "admin",
    "x-nexus-principal-type": "human",
  });

  const planResponse = await page.request.post("/api/planning", {
    data: {
      action: "create-plan",
      scenarioId: "city-economic-cascade",
      maximumCost: 610,
    },
  });
  expect(planResponse.ok()).toBe(true);
  const proposed = (await planResponse.json()) as {
    id: string;
    decision: { selectedCandidateId: string };
  };
  expect(
    (
      await page.request.post("/api/planning", {
        data: {
          action: "approve-plan",
          planId: proposed.id,
          selectedCandidateId:
            proposed.decision.selectedCandidateId,
          note: "Browser governance evidence approval.",
        },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await page.request.post("/api/planning", {
        data: {
          action: "stage-plan",
          planId: proposed.id,
          note: "Browser governance staging.",
        },
      })
    ).ok(),
  ).toBe(true);
  const outcomeResponse = await page.request.post(
    "/api/outcomes",
    {
      data: {
        action: "evaluate-plan",
        planId: proposed.id,
      },
    },
  );
  expect(outcomeResponse.ok()).toBe(true);
  const outcome = (await outcomeResponse.json()) as {
    id: string;
    currentLessonId: string;
  };

  const objectionResponse = await page.request.post(
    "/api/participation",
    {
      data: {
        action: "submit-feedback",
        kind: "objection",
        target: {
          kind: "lesson",
          id: outcome.currentLessonId,
        },
        summary:
          "The lesson omits a contradictory delayed window.",
      },
    },
  );
  expect(objectionResponse.ok()).toBe(true);
  const objection = (await objectionResponse.json()) as {
    id: string;
  };
  for (const data of [
    {
      action: "triage-feedback",
      feedbackId: objection.id,
    },
    {
      action: "start-review",
      feedbackId: objection.id,
    },
    {
      action: "respond-feedback",
      feedbackId: objection.id,
      text: "The original lesson was retained after review.",
    },
  ]) {
    expect(
      (
        await page.request.post("/api/participation", {
          data,
        })
      ).ok(),
    ).toBe(true);
  }
  const appealResponse = await page.request.post(
    "/api/participation",
    {
      data: {
        action: "submit-feedback",
        kind: "appeal",
        appealOfCaseId: objection.id,
        summary:
          "The response did not address the contradictory evidence.",
      },
    },
  );
  expect(appealResponse.ok()).toBe(true);
  const appeal = (await appealResponse.json()) as {
    id: string;
  };

  await page.goto("/");
  await page
    .getByRole("button", { name: "Governance Evidence", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "GOVERNANCE EVIDENCE",
    }),
  ).toBeVisible();
  await expect(page.getByText("All attacks contained")).toBeVisible();
  await expect(page.getByText("minority-harm", { exact: true })).toBeVisible();

  await page
    .getByRole("button", {
      name: "Register reference synthetic group",
    })
    .click();
  await expect(
    page.getByText("Synthetic Riverside Tenants"),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Open deliberation" })
    .first()
    .click();
  await page
    .getByLabel("Base objective version")
    .fill("city-objectives-1.0.0");
  await page.getByLabel("Base weight").fill("0.8");
  await page.getByLabel("Metric").fill("energy");
  await page.getByLabel("Target").fill("85");
  await page.getByLabel("Representation weight").fill("0.9");
  await page.getByLabel("Owner").fill("human:infrastructure");
  await page
    .getByRole("button", { name: "Open deliberation" })
    .last()
    .click();
  const deliberation = page
    .getByTestId("goal-deliberation")
    .first();
  await expect(deliberation).toContainText("open");
  await deliberation
    .getByRole("button", { name: "Add statement" })
    .click();
  await deliberation
    .getByLabel("Statement")
    .fill("Support after protected-group review.");
  await deliberation
    .getByRole("button", { name: "Add statement" })
    .last()
    .click();
  await deliberation
    .getByRole("button", { name: "Simulate group impacts" })
    .click();
  await expect(deliberation).toContainText("simulated");
  await deliberation
    .getByRole("button", { name: "Record my approval" })
    .click();
  await expect(deliberation).toContainText("approved");
  await deliberation
    .getByRole("button", {
      name: "Apply approved objective",
    })
    .click();
  await expect(deliberation).toContainText("applied");
  await expect(deliberation).toContainText(
    "Applied objective version",
  );

  const appealCard = page
    .getByTestId("feedback-case")
    .filter({ hasText: appeal.id });
  await appealCard
    .getByRole("button", { name: "Resolve appeal" })
    .first()
    .click();
  await appealCard.getByLabel("Outcome").selectOption("overturned");
  await appealCard
    .getByLabel("Resolution note")
    .fill("Contradictory delayed evidence invalidates the lesson.");
  await appealCard
    .getByLabel("Resolution actions")
    .fill(
      JSON.stringify([
        {
          type: "invalidate-lesson",
          lessonId: outcome.currentLessonId,
        },
      ]),
    );
  await appealCard
    .getByRole("button", { name: "Resolve appeal" })
    .last()
    .click();
  await expect(appealCard).toContainText("overturned");

  const outcomeOverviewResponse =
    await page.request.get("/api/outcomes");
  expect(outcomeOverviewResponse.ok()).toBe(true);
  const outcomeOverview =
    (await outcomeOverviewResponse.json()) as {
      lessons: Array<{ id: string; status: string }>;
    };
  expect(
    outcomeOverview.lessons.find(
      (lesson) =>
        lesson.id === outcome.currentLessonId,
    )?.status,
  ).toBe("invalidated");

  await page
    .getByLabel("Subject kind")
    .selectOption("outcome");
  await page
    .getByLabel("Subject ID")
    .fill(outcome.id);
  await page
    .getByRole("button", {
      name: "Publish structured explanation",
    })
    .click();
  const explanation = page
    .getByTestId("public-explanation")
    .first();
  await expect(explanation).toContainText("outcome-verdict");
  await expect(explanation).toContainText(
    "independent-outcome-evaluator-v1",
  );

  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
});

test("narrative modules declare their sandbox boundary", async ({ page }) => {
  await page.goto("/");

  for (const view of ["Terminal", "Quantum", "Satellite", "Hacker"]) {
    await page.getByRole("button", { name: view, exact: true }).click();
    await expect(page.getByTestId("sandbox-notice")).toContainText(
      "NARRATIVE SANDBOX",
    );
  }
});

test("server experiment runs persist, branch, enforce roles, and export reports", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Experiments", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "EXPERIMENT PLATFORM" }),
  ).toBeVisible();
  await expect(page.getByTestId("experiment-backend")).toContainText(
    /memory|postgres/,
  );

  await page.getByLabel("Run name").fill("Browser authority test");
  await page.getByLabel("Run seed").fill("browser-authority-seed");
  await page.getByRole("button", { name: "Create run" }).click();
  const run = page.getByTestId("server-run");
  await expect(run).toContainText("Browser authority test");
  await expect(page.getByTestId("server-run-tick")).toHaveText("0");

  await page.getByRole("button", { name: "Resume" }).last().click();
  const tickResponse = await page.request.post("/api/experiments/tick");
  expect(tickResponse.ok()).toBe(true);
  await page.getByRole("button", { name: "Refresh server runs" }).click();
  await expect(page.getByTestId("server-run-tick")).toHaveText("1");
  await expect(run).toContainText("city.metrics.updated");

  await page.getByRole("button", { name: "Fork run" }).click();
  await expect(run).toContainText("Forked from");
  await expect(page.getByTestId("server-run-tick")).toHaveText("1");

  const reportDownload = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export report" }).click();
  expect((await reportDownload).suggestedFilename()).toContain(
    "nexus-experiment-",
  );

  await page.getByLabel("Workspace role").selectOption("viewer");
  await expect(page.getByRole("button", { name: "Server step" })).toBeDisabled();
});

test("controlled iteration evaluates, approves, canaries, and promotes a policy branch", async ({
  page,
}) => {
  const sourceResponse = await page.request.post("/api/experiments", {
    headers: {
      "Content-Type": "application/json",
      "x-nexus-actor": "iteration-browser",
      "x-nexus-role": "admin",
    },
    data: {
      name: "Iteration browser source",
      seed: "iteration-browser-seed",
    },
  });
  expect(sourceResponse.ok()).toBe(true);
  const source = (await sourceResponse.json()) as { id: string };

  await page.goto("/");
  await page.getByRole("button", { name: "Iteration Lab", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "CONTROLLED ITERATION LAB" }),
  ).toBeVisible();
  await page.getByLabel("Source run").selectOption(source.id);
  await page.getByRole("button", { name: "Generate improvement" }).click();

  const workflow = page.getByTestId("iteration-workflow");
  await expect(page.getByTestId("iteration-status")).toHaveText("proposed");
  await expect(workflow).toContainText("policy/traffic");

  await page
    .getByRole("button", { name: "Run controlled experiment" })
    .click();
  await expect(page.getByTestId("iteration-status")).toHaveText(
    "pending-approval",
  );
  await expect(workflow).toContainText("Target improvement");

  await page.getByRole("button", { name: "Approve promotion" }).click();
  await expect(page.getByTestId("iteration-status")).toHaveText("approved");
  await page.getByRole("button", { name: "Start canary" }).click();
  await expect(page.getByTestId("iteration-status")).toHaveText("canary");
  await page.getByRole("button", { name: "Observe canary" }).click();
  await expect(page.getByTestId("iteration-status")).toHaveText("promoted");
  await expect(workflow).toContainText("promotion.completed");

  await page.getByRole("button", { name: "EVOLUTION LOG" }).click();
  await expect(page.getByText("CONTROLLED ITERATION WORKFLOWS")).toBeVisible();
  await expect(page.getByText("Reduce traffic").first()).toBeVisible();
});

test("canary SLO drill raises an alert and automatically rolls back", async ({
  page,
}) => {
  const sourceResponse = await page.request.post("/api/experiments", {
    headers: {
      "Content-Type": "application/json",
      "x-nexus-actor": "rollback-browser",
      "x-nexus-role": "admin",
    },
    data: {
      name: "Rollback drill source",
      seed: "rollback-browser-seed",
    },
  });
  expect(sourceResponse.ok()).toBe(true);
  const source = (await sourceResponse.json()) as { id: string };

  await page.goto("/");
  await page.getByRole("button", { name: "Iteration Lab", exact: true }).click();
  await page.getByLabel("Source run").selectOption(source.id);
  await page.getByRole("button", { name: "Generate improvement" }).click();
  await page
    .getByRole("button", { name: "Run controlled experiment" })
    .click();
  await expect(page.getByTestId("iteration-status")).toHaveText(
    "pending-approval",
  );
  await page.getByRole("button", { name: "Approve promotion" }).click();
  await page.getByRole("button", { name: "Start canary" }).click();
  await expect(page.getByTestId("iteration-status")).toHaveText("canary");

  await page.getByRole("button", { name: "Run rollback drill" }).click();
  await expect(page.getByTestId("iteration-status")).toHaveText("rolled-back");
  const workflow = page.getByTestId("iteration-workflow");
  await expect(workflow).toContainText("wrong-direction");
  await expect(workflow).toContainText("rollback.triggered");
});

test("verification center proves the v1 north-star thresholds", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Verification", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "VERIFIED AUTONOMY" }),
  ).toBeVisible();
  await expect(page.getByTestId("v1-readiness")).toHaveText(
    "v1 ready",
    { timeout: 30_000 },
  );
  await expect(page.getByText("neo-angeles-baseline")).toBeVisible();
  await expect(page.getByText("neo-angeles-grid-stress")).toBeVisible();
  await expect(page.getByText("neo-angeles-civic-recovery")).toBeVisible();
  await expect(page.getByText("100.0%").first()).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "RELEASE GOVERNANCE" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "EVIDENCE FRESHNESS" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "WORKSPACE ACCESS" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "SIGNED RELEASE POLICY" }),
  ).toBeVisible();
  await expect(page.getByText("ci-evidence", { exact: true })).toBeVisible();
  await expect(
    page.getByText("deployment-drill", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("development", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("staging", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByText("production", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("12/12")).toBeVisible();
  await expect(
    page.getByText("model-regression-live", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByTestId("v2-certification-status"),
  ).toContainText(
    "implementation-complete-external-evidence-pending",
    { timeout: 30_000 },
  );
  await expect(
    page.getByTestId("v2-certification"),
  ).toContainText("80.0%");
  await expect(
    page.getByTestId("v2-certification"),
  ).toContainText("25/25");
});

test("code releases require exact artifacts and signed external evidence", async ({
  page,
}) => {
  const sourceResponse = await page.request.post("/api/experiments", {
    headers: {
      "Content-Type": "application/json",
      "x-nexus-actor": "release-browser",
      "x-nexus-role": "admin",
    },
    data: {
      name: "Governed release source",
      seed: "governed-release-seed",
    },
  });
  expect(sourceResponse.ok()).toBe(true);
  const source = (await sourceResponse.json()) as { id: string };

  await page.goto("/");
  await page.getByRole("button", { name: "Iteration Lab", exact: true }).click();
  await page.getByLabel("Source run").selectOption(source.id);
  await page.getByLabel("Change scope").selectOption("code");
  await page.getByLabel("Artifact name").fill("nexus-web");
  await page.getByLabel("Repository").fill("Carrick-K7/nexus-7");
  await page.getByLabel("Commit SHA").fill("a".repeat(40));
  await page.getByLabel("Evidence SHA-256").fill("b".repeat(64));
  await page.getByLabel("Manifest fingerprint").fill("c".repeat(64));
  await page.getByRole("button", { name: "Generate improvement" }).click();

  const workflow = page.getByTestId("iteration-workflow");
  await expect(page.getByTestId("iteration-status")).toHaveText("proposed");
  await expect(workflow).toContainText("code");
  await expect(workflow).toContainText("External evidence required");
  await expect(page.getByLabel("Signed attestation receipt")).toBeVisible();

  await page.getByLabel("Signed attestation receipt").fill("{}");
  await page
    .getByRole("button", { name: "Verify and attach evidence" })
    .click();
  await expect(
    page.getByText(/complete signed external attestation receipt/i),
  ).toBeVisible();
});

test("mobile observer, verification, and operations views have no WCAG A/AA violations", async ({
  page,
}) => {
  test.slow();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Observer" }).click();
  await expect(
    page.getByRole("heading", { name: "OBSERVER DASHBOARD" }),
  ).toBeVisible();
  const observerResults = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(observerResults.violations).toEqual([]);

  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Verification" }).click();
  await expect(page.getByTestId("v1-readiness")).toHaveText("v1 ready");
  await expect(
    page.getByTestId("v2-certification-status"),
  ).toBeVisible({ timeout: 30_000 });
  const verificationResults = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(verificationResults.violations).toEqual([]);

  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Operations" }).click();
  await expect(
    page.getByRole("heading", { name: "OPERATIONS CENTER" }),
  ).toBeVisible();
  await expect(page.getByLabel("Telemetry source")).toBeVisible();
  const operationsResults = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(operationsResults.violations).toEqual([]);

  await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("button", { name: "Governance Evidence" })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "GOVERNANCE EVIDENCE",
    }),
  ).toBeVisible();
  const participationResults = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(participationResults.violations).toEqual([]);
});

test("mobile shell uses a drawer without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      name: "SHENZHEN SYMBIOSIS CITY · HUMAN OBSERVATORY",
    }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Open navigation" })).toBeVisible();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("button", { name: "Dashboard" })).toBeVisible();
  await page.getByRole("button", { name: "Neural Net" }).click();
  await expect(page.getByRole("heading", { name: "NEURAL NETWORK" })).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));

  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
});

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`${viewport.name} dashboard has no WCAG A/AA violations`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.waitForTimeout(1_000);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    expect(results.violations).toEqual([]);
  });
}
