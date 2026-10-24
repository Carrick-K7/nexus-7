import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { parseHumanOverview, type HumanOverview } from "../src/research/human-contracts";
import { measuredPair } from "../src/components/human/format";

const ENDPOINT = "/api/research/v1/human";

// All successful responses in this suite are real GETs to the isolated Next API.
// No successful route fake, static study, worker call, or model call is used.
async function openHuman(page: Page, path: "/" | "/human" = "/human"): Promise<HumanOverview> {
  const responsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === ENDPOINT && response.request().method() === "GET");
  await page.goto(path);
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const snapshot = parseHumanOverview(await response.json());
  expect(snapshot).not.toBeNull();
  await expect(page.getByTestId("human-read-time")).toHaveAttribute("datetime", snapshot!.readAt);
  await expect(page.getByRole("button", { name: "重新读取记录" })).toBeEnabled();
  return snapshot!;
}

async function assertProjection(page: Page, snapshot: HumanOverview) {
  await expect(page.getByTestId("human-home")).toBeVisible();
  await expect(page.locator("aside")).toHaveCount(0);
  await expect(page.getByTestId("research-station")).toHaveCount(0);
  await expect(page.getByTestId("human-intro")).toContainText("没有聊天 AI 一直待在这里");
  await expect(page.getByTestId("human-read-time")).toHaveAttribute("datetime", snapshot.readAt);
  const study = snapshot.study;
  if (!study) {
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("还没有实验记录");
    await expect(page.getByTestId("human-usage")).toContainText("未知不等于零");
    await expect(page.getByTestId("human-model-calls")).toHaveCount(0);
  } else {
    const progress = study.state === "budget-exhausted" && study.stopReason === "oracle-budget"
      ? `${study.measurements.toLocaleString("zh-CN")} / ${study.measurementLimit.toLocaleString("zh-CN")}`
      : `${study.steps.toLocaleString("zh-CN")} / ${study.stepLimit.toLocaleString("zh-CN")}`;
    await expect(page.getByTestId("human-progress")).toContainText(progress);
    await expect(page.getByTestId("human-measurements")).toContainText(study.measurements.toLocaleString("zh-CN"));
    await expect(page.getByTestId("human-model-calls")).toHaveText(`${study.modelCalls.toLocaleString("zh-CN")} 次`);
    await expect(page.getByTestId("human-model-cost")).toHaveText(`${String(study.modelCostUsd)} 美元`);
    if (study.lastActivityAt) await expect(page.getByTestId("human-last-experiment")).toHaveAttribute("datetime", study.lastActivityAt);
    else await expect(page.getByTestId("human-freshness")).toContainText("尚未记录完成时间");
    if (study.pendingQuestions > 0) await expect(page.getByTestId("human-status")).toContainText("待办不代表还会运行");
    if (study.state === "unknown" || study.stopReason === "unknown") await expect(page.getByRole("heading", { level: 1 })).toHaveText("暂时不知道是否在工作");
    else if (study.state === "budget-exhausted" && (study.stopReason === "episode-cap" || study.stopReason === "oracle-budget")) {
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("这一轮已经停止");
      await expect(page.getByTestId("human-status")).toContainText("不是故障，也不会自动续跑");
    } else if (study.state === "running") {
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("记录允许继续实验");
      await expect(page.getByTestId("human-status")).toContainText("不知道它此刻是否真的在算");
    }
  }

  const story = snapshot.story;
  if (!story) {
    await expect(page.getByTestId("human-story")).toContainText("还没有可完整讲述的实验记录");
    await expect(page.getByTestId("human-result-original")).toHaveCount(0);
  } else {
    const [first, second] = measuredPair(story.counterexample.original, story.counterexample.reordered);
    expect(first).not.toBe(second);
    await expect(page.getByTestId("human-result-original")).toHaveText(first);
    await expect(page.getByTestId("human-result-reordered")).toHaveText(second);
    await expect(page.getByTestId("human-story").getByRole("heading", { level: 3 })).toHaveText([
      "先做一个小实验", "原来的想法", "找到不符合的例子", "修改猜测", "暂时结论",
    ]);
    if (story.revised.status === "refuted") {
      await expect(page.getByTestId("human-story-conclusion")).toContainText("修改后的想法也找到了不符合的例子");
      await expect(page.getByTestId("human-story-conclusion")).not.toContainText("这次测试没找到反例");
    } else if (story.revised.status === "survived-budget") {
      await expect(page.getByTestId("human-story-conclusion")).toContainText("这次测试没找到反例");
      await expect(page.getByTestId("human-story-conclusion")).toContainText("还不是证明");
    }
    await expect(page.getByTestId("human-story-conclusion")).toContainText("原来的反例仍然保留");
    const details = page.getByTestId("human-story-details");
    await details.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(details).toHaveAttribute("open", "");
    await expect(page.getByTestId("human-exact-original")).toHaveText(String(story.counterexample.original));
    await expect(page.getByTestId("human-exact-reordered")).toHaveText(String(story.counterexample.reordered));
    await expect(page.getByTestId("human-exact-input")).toHaveText(JSON.stringify(story.counterexample.input, null, 2));
    await details.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(details).not.toHaveAttribute("open", "");
  }
  await expect(page.getByTestId("human-usage")).toContainText("实时 CPU、内存：未测量");
  const visibleCopy = await page.getByTestId("human-home").innerText();
  expect(visibleCopy).not.toMatch(/DSL|AST|oracle|fenced lease|programDigest|survived-budget|仪器|回执/);
}

async function assertFits(page: Page) {
  const dimensions = await page.evaluate(() => {
    const home = document.querySelector<HTMLElement>('[data-testid="human-home"]')!;
    return { viewport: window.innerWidth, document: document.documentElement.scrollWidth, home: home.scrollWidth, local: home.clientWidth };
  });
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
  expect(dimensions.home).toBeLessThanOrEqual(dimensions.local + 1);
}

async function assertAccessible(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(result.violations).toEqual([]);
  // Opaque plain surfaces should allow contrast to be checked, not just skipped.
  expect(result.incomplete.filter((check) => check.id === "color-contrast")).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("human API success is a real, versioned, read-only GET", async ({ request }) => {
  const result = await request.get(ENDPOINT);
  expect(result.status()).toBe(200);
  expect(result.headers()["cache-control"]).toContain("no-store");
  const snapshot = parseHumanOverview(await result.json());
  expect(snapshot).not.toBeNull();
  expect(snapshot!.schemaVersion).toBe("nexus.research-human.v1");
  // A genuine empty study is tested as empty, never replaced by a successful fake.
  if (!snapshot!.study) expect(snapshot!.story).toBeNull();
});

for (const viewport of [
  { name: "390px mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 1000 },
]) {
  test(`${viewport.name}: /human answers the first questions, reads real data, and supports keyboard, EN/ZH, themes and axe`, async ({ page }, testInfo) => {
    test.slow();
    await page.setViewportSize(viewport);
    const writes: string[] = [];
    const errors: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.startsWith("/api/") && !["GET", "HEAD"].includes(request.method())) writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
    });
    page.on("pageerror", (error) => errors.push(error.message));
    const snapshot = await openHuman(page);
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(page.getByTestId("human-home")).toHaveAttribute("data-theme", "light");
    const firstScreen = await page.getByRole("heading", { level: 1 }).boundingBox();
    expect(firstScreen!.y + firstScreen!.height).toBeLessThan(viewport.height);
    await expect(page.getByTestId("human-intro")).toBeInViewport();
    await expect(page.getByTestId("human-home")).toHaveCSS("font-size", "18px");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "跳到正文" })).toBeFocused();
    await expect(page.getByRole("link", { name: "跳到正文" })).toHaveCSS("outline-style", "solid");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("main")).toBeFocused();
    await assertProjection(page, snapshot);
    await assertFits(page);
    await assertAccessible(page);
    await page.screenshot({ path: testInfo.outputPath("human-zh-light.png"), fullPage: true });

    const languages = page.getByRole("group", { name: "语言", exact: true });
    await expect(languages.getByRole("button", { name: "中文", exact: true })).toHaveAttribute("aria-pressed", "true");
    const appearance = page.getByRole("group", { name: "外观", exact: true });
    await appearance.getByRole("button", { name: "深色", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("human-home")).toHaveAttribute("data-theme", "dark");
    await assertAccessible(page);
    await languages.getByRole("button", { name: "EN", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByTestId("human-intro")).toContainText("This page records a program's small experiments");
    await expect(page.getByRole("group", { name: "Language", exact: true })).toBeVisible();
    await assertAccessible(page);
    await page.getByRole("group", { name: "Appearance", exact: true }).getByRole("button", { name: "Light", exact: true }).click();
    await assertFits(page);
    await assertAccessible(page);

    const details = page.getByTestId("human-technical");
    await details.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(details).toHaveAttribute("open", "");
    await expect(details.getByRole("link", { name: "Technical records", exact: true })).toHaveAttribute("href", "/research");
    await expect(details.getByRole("link", { name: "Read this data (JSON)", exact: true })).toHaveAttribute("href", ENDPOINT);
    await assertFits(page);
    const refreshed = page.waitForResponse((response) => new URL(response.url()).pathname === ENDPOINT && response.request().method() === "GET");
    await page.getByRole("button", { name: "Read the records again", exact: true }).click();
    const refreshResponse = await refreshed;
    expect(refreshResponse.status()).toBe(200);
    const next = parseHumanOverview(await refreshResponse.json());
    expect(next).not.toBeNull();
    await expect(page.getByTestId("human-read-time")).toHaveAttribute("datetime", next!.readAt);
    for (const button of await page.getByRole("button").all()) await expect(button).toHaveAccessibleName(/\S/);
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test("/ defaults to the human page; technical records and explicit legacy links stay separate", async ({ page }) => {
  await openHuman(page, "/");
  const header = page.getByRole("banner");
  await expect(header.getByRole("link", { name: "技术记录" })).toHaveAttribute("href", "/research");
  await expect(header.getByRole("link", { name: "旧城档案" })).toHaveAttribute("href", "/archive/city");
  await header.getByRole("link", { name: "技术记录" }).click();
  await expect(page).toHaveURL(/\/research$/);
  await expect(page.getByTestId("research-station")).toBeVisible();
  await expect(page.getByTestId("human-home")).toHaveCount(0);
  await page.goto("/?view=legacy");
  await expect(page.getByTestId("research-station")).toBeVisible();
  await expect(page.getByTestId("human-home")).toHaveCount(0);
});

test("an explicit 503 failure fake retains the last real snapshot and recovers through another real GET", async ({ page }) => {
  const snapshot = await openHuman(page);
  await page.route(`**${ENDPOINT}`, (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "explicit-browser-failure-fake" }) }));
  await page.getByRole("button", { name: "重新读取记录" }).click();
  await expect(page.getByTestId("human-home").getByRole("alert")).toContainText("上次读到的记录");
  await expect(page.getByTestId("human-read-time")).toHaveAttribute("datetime", snapshot.readAt);
  if (snapshot.study) await expect(page.getByTestId("human-model-cost")).toHaveText(`${String(snapshot.study.modelCostUsd)} 美元`);
  await page.unroute(`**${ENDPOINT}`);
  const success = page.waitForResponse((response) => new URL(response.url()).pathname === ENDPOINT && response.status() === 200);
  await page.getByRole("button", { name: "重新读取记录" }).click();
  const next = parseHumanOverview(await (await success).json());
  expect(next).not.toBeNull();
  await expect(page.getByTestId("human-home").getByRole("alert")).toHaveCount(0);
  await expect(page.getByTestId("human-read-time")).toHaveAttribute("datetime", next!.readAt);
});

test("an explicit initial unauthorized fake is unknown, not a zero or empty successful study", async ({ page }) => {
  await page.route(`**${ENDPOINT}`, (route) => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "explicit-browser-unauthorized-fake" }) }));
  await page.goto("/human");
  await expect(page.getByTestId("human-home").getByRole("alert")).toContainText("没有读取权限");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("暂时不知道是否在工作");
  await expect(page.getByTestId("human-progress")).toHaveCount(0);
  await expect(page.getByTestId("human-model-calls")).toHaveCount(0);
  await expect(page.getByTestId("human-result-original")).toHaveCount(0);
  await expect(page.getByTestId("human-read-time")).toHaveCount(0);
});
