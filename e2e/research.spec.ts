import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import type { ResearchOverview } from "../src/research/contracts";
import { hasCompletedCityArchive, parseCityArchive } from "../src/components/archive/city-archive-contract";

const ENDPOINT = "/api/research/v1/overview";

// These tests read the real Next API. They do not seed a station, invoke a
// worker, or intercept successful responses to pretend research has happened.
async function openResearch(page: Page, path = "/research"): Promise<ResearchOverview> {
  const responsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === ENDPOINT && response.request().method() === "GET");
  await page.goto(path);
  await expect(page.getByRole("heading", { name: "Research Station · Bounded symbolic research" })).toBeVisible();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const overview: ResearchOverview = await response.json();
  await expect(page.getByTestId("research-freshness")).toContainText("Last successful snapshot shown");
  return overview;
}

async function assertProjection(page: Page, overview: ResearchOverview) {
  await expect(page.getByTestId("research-freshness")).toContainText(overview.generatedAt);
  await expect(page.getByTestId("research-freshness")).toContainText(overview.backend);
  await expect(page.getByTestId("research-briefing-now")).toContainText("What is being studied?");
  await expect(page.getByTestId("research-briefing-latest")).toContainText("What was found or refuted?");
  await expect(page.getByTestId("research-briefing-next")).toContainText("Why this next step?");
  await expect(page.getByTestId("research-briefing-budget")).toContainText("Budget & stopping reasons");
  await expect(page.getByTestId("research-worker-boundary")).toContainText("not an OS worker heartbeat");
  await expect(page.getByTestId("research-freshness")).toContainText("not claim-evidence timestamps");
  if (overview.runtime) {
    await expect(page.getByTestId("research-runtime")).toContainText(overview.runtime.evidence);
    if (overview.runtime.releaseRevision) await expect(page.getByTestId("research-runtime")).toContainText(overview.runtime.releaseRevision);
  }
  await expect(page.getByTestId("research-subject")).toHaveCount(overview.subjects.length);
  const station = overview.station;
  const hypotheses = station?.hypotheses ?? [];
  const receipts = station?.hypothesisEvaluations ?? [];
  const uniquePrograms = new Set(hypotheses.map((hypothesis) => JSON.stringify([hypothesis.programDigest, hypothesis.subjectVersion]))).size;
  await expect(page.getByTestId("research-new-claims")).toHaveText(String(uniquePrograms));
  await expect(page.getByTestId("research-claim-scope")).toContainText("Protocol follow-ups are not new hypotheses");
  if (!station) {
    await expect(page.getByTestId("research-empty")).toContainText("The API returned no station");
    await expect(page.getByTestId("research-state")).toHaveCount(0);
    await expect(page.getByTestId("research-episode")).toHaveCount(0);
    await expect(page.getByTestId("research-tool")).toHaveCount(0);
    return;
  }
  await expect(page.getByTestId("research-empty")).toHaveCount(0);
  await expect(page.getByTestId("research-state")).toContainText(station.id);
  await expect(page.getByTestId("research-revision")).toHaveText(String(station.revision));
  await expect(page.getByTestId("research-status")).toContainText(station.status);
  await expect(page.getByTestId("research-spent")).toHaveText(String(station.budget.spentCalls));
  await expect(page.getByTestId("research-reserved")).toHaveText(String(station.budget.reservedCalls));
  await expect(page.getByTestId("research-cap")).toHaveText(String(station.policy.maxOracleCalls));
  await expect(page.getByTestId("research-stop-reason")).toHaveText(station.stopReason ?? "No stop reason recorded");
  await expect(page.getByTestId("research-question")).toHaveCount(station.questions.length);
  await expect(page.getByTestId("research-episode")).toHaveCount(station.episodes.length);
  await expect(page.getByTestId("research-tool")).toHaveCount(station.tools.length);
  await expect(page.getByTestId("research-lesson")).toHaveCount(station.lessons.length);
  await expect(page.getByTestId("research-hypothesis")).toHaveCount(hypotheses.length);
  await expect(page.getByTestId("research-hypothesis-receipt")).toHaveCount(receipts.length);
  await expect(page.getByTestId("research-reference")).toHaveCount(0);
  if (!hypotheses.length) {
    await expect(page.getByTestId("research-hypotheses")).toContainText("No frozen conditional hypotheses recorded");
  } else {
    const hypothesis = hypotheses[0];
    const details = page.getByTestId("research-hypothesis").first();
    await details.locator(":scope > summary").focus();
    await page.keyboard.press("Enter");
    await expect(details).toHaveAttribute("open", "");
    await expect(details).toContainText(hypothesis.programDigest);
    await expect(details).toContainText(hypothesis.trainingDigest);
    await expect(details).toContainText("not whether this meta-hypothesis is true");
    await expect(details.getByTestId("research-hypothesis-ast")).toContainText(hypothesis.program.when.op);
    await expect(details.getByTestId("research-reference")).toHaveCount(Math.min(3, hypothesis.trainingObservationIds.length));
    await expect(details).toContainText(`Total: ${hypothesis.trainingObservationIds.length}`);
    if (hypothesis.parentHypothesisId) await expect(details).toContainText(hypothesis.parentHypothesisId);
  }
  if (receipts.length) {
    const receipt = receipts[0];
    const details = page.getByTestId("research-hypothesis-receipt").first();
    await details.locator(":scope > summary").focus();
    await page.keyboard.press("Enter");
    await expect(details).toHaveAttribute("open", "");
    await expect(details).toContainText(receipt.status);
    await expect(details).toContainText(receipt.evaluatorVersion);
    await expect(details).toContainText(receipt.samplingProtocol);
    await expect(details).toContainText("do not estimate population coverage");
    await expect(details.getByTestId("research-reference")).toHaveCount(
      Math.min(3, receipt.observationIds.length) + Math.min(3, receipt.counterexampleIds.length) + Math.min(3, receipt.excludedInputDigests.length),
    );
    if (receipt.status === "survived-budget") await expect(details).toContainText("Not refuted within budget — not proved");
  }
  // An episode's internal reducer observations must not flood the collapsed DOM.
  await expect(page.getByTestId("research-observation")).toHaveCount(0);
  if (station.episodes.length) {
    const episode = station.episodes[0];
    const details = page.getByTestId("research-episode").first();
    await expect(details).toContainText(episode.verdict);
    await details.locator(":scope > summary").focus();
    await page.keyboard.press("Enter");
    await expect(details).toHaveAttribute("open", "");
    await expect(details.getByTestId("research-observation")).toHaveCount(Math.min(3, episode.observations.length));
    await expect(details).toContainText(`Total: ${episode.observations.length}`);
    await expect(details).toContainText(episode.previousDigest);
    const question = station.questions.find((item) => item.id === episode.questionId);
    if (question?.parentEpisodeId) await expect(details).toContainText(question.parentEpisodeId);
    if (question?.observationId) await expect(details).toContainText(question.observationId);
    if (episode.observations.length) await expect(details).toContainText(episode.observations[0].measurement.code);
  }
  if (station.tools.length) {
    const details = page.getByTestId("research-tool").first();
    await details.locator(":scope > summary").focus();
    await page.keyboard.press("Enter");
    await expect(details).toContainText(station.tools[0].digest);
    await expect(details.getByTestId("research-tool-source")).toHaveText(station.tools[0].source);
  }
}

async function assertNoHorizontalOverflow(page: Page) {
  const widths = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-testid="research-station"]')!;
    return {
      documentWidth: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
      researchWidth: root.scrollWidth,
      researchViewport: root.clientWidth,
    };
  });
  expect(widths.documentWidth).toBeLessThanOrEqual(widths.viewport + 1);
  expect(widths.researchWidth).toBeLessThanOrEqual(widths.researchViewport + 1);
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("real research overview is read-only and does not manufacture successful data", async ({ request }) => {
  const response = await request.get(ENDPOINT);
  expect(response.status()).toBe(200);
  const overview: ResearchOverview = await response.json();
  expect(overview.schemaVersion).toBe("nexus.research-station.v1");
  expect(["memory", "postgres"]).toContain(overview.backend);
  expect(overview.boundary).toEqual({
    productionWrites: false,
    arbitraryCodeExecution: false,
    liveModelCalls: false,
    knownSeedsAreNotDiscoveries: true,
    evaluatorIsolation: "separate-module-not-hostile-process-isolation",
  });
  expect(Array.isArray(overview.subjects)).toBe(true);
  if (overview.station !== null) {
    expect(overview.station.mode).toBe("bounded-symbolic-research");
    expect(overview.station.budget.externalModelCalls).toBe(0);
    expect(overview.station.budget.actualModelCostUsd).toBe(0);
    expect(overview.station.budget.spentCalls + overview.station.budget.reservedCalls).toBeLessThanOrEqual(overview.station.policy.maxOracleCalls);
    expect(Array.isArray(overview.station.episodes)).toBe(true);
  }
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const write = await request.fetch(ENDPOINT, { method });
    expect(write.status(), `${method} must not mutate research`).toBe(405);
  }
  // No assertion that a completed run must exist: null is a valid honest state.
});

for (const viewport of [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "390px mobile", width: 390, height: 844 },
]) {
  test(`${viewport.name} real research projection supports EN/ZH, keyboard, themes, and WCAG A/AA`, async ({ page }) => {
    test.slow();
    await page.setViewportSize(viewport);
    const writes: string[] = [];
    const pageErrors: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.startsWith("/api/research/") && !["GET", "HEAD"].includes(request.method())) writes.push(request.method());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const overview = await openResearch(page);
    await expect(page.locator('[data-surface="observatory"]')).toBeVisible();
    await expect(page.locator(".cyberpunk-shell")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1, name: "Research Station · Bounded symbolic research" })).toBeVisible();
    await expect(page.getByRole("banner")).toContainText("Research observation");
    await expect(page.getByRole("button", { name: /Pause simulation|Resume simulation|^1x$|^2x$|^5x$|^10x$/ })).toHaveCount(0);
    await expect(page.getByTestId("research-station").getByRole("button")).toHaveCount(1);
    await expect(page.getByTestId("research-station")).toContainText("Read-only observation · Research ledger persists · No city writes or deployment · External model calls: 0");
    await expect(page.getByTestId("research-station")).toContainText("Natural new discoveries have not been demonstrated");
    if (viewport.width < 1024) {
      await page.getByRole("button", { name: "Open navigation" }).focus();
      await page.keyboard.press("Enter");
      const closeNavigation = page.locator("aside").getByRole("button", { name: "Close navigation" });
      await expect(closeNavigation).toBeFocused();
      await expect(closeNavigation).toBeInViewport();
      await page.keyboard.press("Shift+Tab");
      await expect(page.locator("aside").getByRole("button", { name: "Dark", exact: true })).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(closeNavigation).toBeFocused();
      await expect(page.getByTestId("legacy-navigation")).not.toHaveAttribute("open", "");
      await expect(page.locator("aside").getByRole("link", { name: "Historical city archive" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("button", { name: "Open navigation" })).toBeFocused();
    }
    await assertProjection(page, overview);

    const refresh = page.getByRole("button", { name: "Refresh research snapshot" });
    const boundary = page.getByTestId("research-boundary");
    const share = page.getByTestId("research-briefing").getByRole("link", { name: "Share research page" });
    await share.focus();
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("research-briefing").getByRole("link", { name: "Read raw evidence (JSON)" })).toBeFocused();
    await boundary.locator(":scope > summary").focus();
    await expect(boundary.locator(":scope > summary")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(boundary).toHaveAttribute("open", "");
    await expect(boundary).toContainText("not hostile-process isolation");
    await assertNoHorizontalOverflow(page);
    const englishDarkAxe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(englishDarkAxe.violations).toEqual([]);

    // Refresh is a real GET, not a worker trigger or a mocked successful response.
    const refreshedResponse = page.waitForResponse((response) => new URL(response.url()).pathname === ENDPOINT && response.request().method() === "GET");
    await refresh.focus();
    await page.keyboard.press("Enter");
    const refreshed = await refreshedResponse;
    expect(refreshed.status()).toBe(200);
    await expect(page.getByTestId("research-freshness")).toContainText((await refreshed.json() as ResearchOverview).generatedAt);
    await expect(refresh).toBeEnabled();

    await page.getByRole("button", { name: "Change language" }).click();
    await page.getByRole("button", { name: "中文", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(page.getByRole("heading", { level: 1, name: "研究站 · 有界符号研究" })).toBeVisible();
    await expect(page.getByRole("banner")).toContainText("研究观测");
    await expect(page.getByRole("button", { name: "刷新研究快照" })).toBeVisible();
    await expect(page.getByTestId("research-station")).toContainText("自然新发现尚未证明");
    await page.getByRole("button", { name: "切换到浅色模式" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await assertNoHorizontalOverflow(page);
    const chineseLightAxe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(chineseLightAxe.violations).toEqual([]);
    expect(writes).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
}

test("explicit 503 route fake retains the last real snapshot and timestamp, then recovers through real GET", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const overview = await openResearch(page);
  const freshness = page.getByTestId("research-freshness");
  const lastSuccess = await freshness.locator("time").first().getAttribute("datetime");
  // Failure injection only. Successful responses above and below are real Next responses.
  await page.route(`**${ENDPOINT}`, (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "explicit-browser-reference-fake-outage" }) }));
  await page.getByRole("button", { name: "Refresh research snapshot" }).click();
  await expect(page.getByTestId("research-freshness").getByRole("alert")).toContainText("Stale snapshot");
  await expect(freshness.locator("time").first()).toHaveAttribute("datetime", lastSuccess!);
  if (overview.station) await expect(page.getByTestId("research-revision")).toHaveText(String(overview.station.revision));
  else await expect(page.getByTestId("research-empty")).toBeVisible();
  await page.unroute(`**${ENDPOINT}`);
  const realRecovery = page.waitForResponse((response) => new URL(response.url()).pathname === ENDPOINT && response.status() === 200);
  await page.getByRole("button", { name: "Refresh research snapshot" }).click();
  const recovered: ResearchOverview = await (await realRecovery).json();
  await expect(page.getByTestId("research-freshness").getByRole("alert")).toHaveCount(0);
  await expect(freshness).toContainText(recovered.generatedAt);
});

test("shareable research and unknown-view routes select research, with legacy navigation explicitly collapsed", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openResearch(page, "/research");
  await expect(page.getByTestId("legacy-navigation")).not.toHaveAttribute("open", "");
  await expect(page.locator("aside").getByRole("button", { name: "Research Station", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.locator("aside").getByRole("link", { name: "Historical city archive" })).toHaveAttribute("href", "/archive/city");
  await expect(page.getByTestId("human-guide-link")).toHaveAttribute("href", "/human");
  await expect(page.getByRole("group", { name: "Color theme" })).toBeVisible();
  await openResearch(page, "/?view=unknown");
  await page.getByTestId("legacy-navigation").locator(":scope > summary").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("legacy-navigation")).toHaveAttribute("open", "");
  await page.getByRole("button", { name: "Human Observatory", exact: true }).click();
  await expect(page).toHaveURL(/view=symbiosis/);
  await expect(page.getByRole("heading", { name: "SHENZHEN SYMBIOSIS CITY · HUMAN OBSERVATORY" })).toBeVisible();
});

test("visible research automatically reads the real API after 30 seconds without writes", async ({ page }) => {
  await page.clock.install();
  const methods: string[] = [];
  page.on("request", (request) => { if (new URL(request.url()).pathname === ENDPOINT) methods.push(request.method()); });
  await openResearch(page);
  const automatic = page.waitForResponse((response) => new URL(response.url()).pathname === ENDPOINT);
  await page.clock.fastForward(30_000);
  const updated = await automatic;
  expect(updated.status()).toBe(200);
  await expect(page.getByTestId("research-freshness")).toContainText((await updated.json() as ResearchOverview).generatedAt);
  expect(methods).toEqual(["GET", "GET"]);
});

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`${viewport.width}px static city archive is honest, bilingual, keyboard reachable and WCAG A/AA clean`, async ({ page }) => {
    test.slow();
    await page.setViewportSize(viewport);
    const apiReads: string[] = [];
    page.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/api/")) apiReads.push(request.url()); });
    const manifestResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/data/city-archive.json");
    await page.goto("/archive/city");
    const response = await manifestResponse;
    const manifest = response.ok() ? parseCityArchive(await response.json()) : null;
    await expect(page.getByRole("heading", { name: "Historical city archive", exact: true })).toBeVisible();
    await expect(page.getByTestId("city-archive-status")).toContainText(!manifest ? "Completed retirement has not been verified" : hasCompletedCityArchive(manifest) ? "records a stopped city" : "not complete");
    await expect(page.getByTestId("city-archive")).toContainText("does not mean it passed");
    if (manifest?.capturedAt) await expect(page.getByTestId("city-archive")).toContainText(manifest.capturedAt);
    if (manifest?.stoppedAt) await expect(page.getByTestId("city-archive")).toContainText(manifest.stoppedAt);
    const back = page.getByTestId("city-archive").getByRole("link", { name: "Return to the research station" });
    await back.focus();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Read the static manifest (JSON)" })).toBeFocused();
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations).toEqual([]);
    await page.getByRole("button", { name: "Change language" }).click();
    await page.getByRole("button", { name: "中文", exact: true }).click();
    await expect(page.getByRole("heading", { name: "历史城市档案", exact: true })).toBeVisible();
    await expect(page.getByTestId("city-archive")).toContainText("退役旧 90 天轨道不等于通过");
    await page.getByRole("button", { name: "切换到浅色模式" }).click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations).toEqual([]);
    expect(apiReads).toEqual([]);
  });
}

test("explicit missing archive failure fake never creates or advances a city", async ({ page }) => {
  const apiReads: string[] = [];
  page.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/api/")) apiReads.push(request.url()); });
  await page.route("**/data/city-archive.json", (route) => route.fulfill({ status: 404, body: "explicit missing-archive failure fake" }));
  await page.goto("/archive/city");
  await expect(page.getByTestId("city-archive-status")).toContainText("Completed retirement has not been verified");
  expect(apiReads).toEqual([]);
});

test("explicit initial 503 route fake is an error, not a successful empty station", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route(`**${ENDPOINT}`, (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "explicit-browser-reference-fake-initial-outage" }) }));
  await page.goto("/research");
  await expect(page.getByTestId("research-freshness").getByRole("alert")).toContainText("No result has been invented");
  await expect(page.getByTestId("research-empty")).toHaveCount(0);
  await expect(page.getByTestId("research-state")).toHaveCount(0);
  await expect(page.getByTestId("research-freshness")).toContainText("No successful read yet");
});
