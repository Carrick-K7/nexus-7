import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { parseHumanOverview, type HumanOverview } from "../src/research/human-contracts";
import { measuredPair } from "../src/components/human/format";
import { compactRule } from "../src/components/human/rules";

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
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("研究概览");
  await expect(page.getByTestId("human-intro")).toHaveCount(0);
  await expect(page.getByTestId("human-story-jump")).toHaveCount(0);
  await expect(page.getByTestId("human-roles")).toHaveCount(0);
  await expect(page.getByTestId("human-home").locator("pre")).toHaveCount(0);
  await expect(page.getByTestId("human-read-time")).toHaveAttribute("datetime", snapshot.readAt);
  const study = snapshot.study;
  if (!study) {
    await expect(page.getByTestId("human-state")).toHaveText("状态未知");
    await expect(page.getByTestId("human-status")).toContainText("暂无研究记录");
    await expect(page.getByTestId("human-usage")).toContainText("资源数据未知");
    await expect(page.getByTestId("human-metrics").locator("dd")).toHaveText(["未记录", "未记录", "未记录", "未记录"]);
    await expect(page.getByTestId("human-model-calls")).toHaveCount(0);
  } else {
    await expect(page.getByTestId("human-progress")).toHaveText(`${study.steps.toLocaleString("zh-CN")} / ${study.stepLimit.toLocaleString("zh-CN")}`);
    await expect(page.getByTestId("human-measurements")).toHaveText(study.measurements.toLocaleString("zh-CN"));
    await expect(page.getByTestId("human-tools")).toHaveText(study.counts.tools.toLocaleString("zh-CN"));
    await expect(page.getByTestId("human-hypotheses")).toHaveText(study.counts.hypotheses.toLocaleString("zh-CN"));
    await expect(page.getByTestId("human-model-calls")).toHaveText(`${study.modelCalls.toLocaleString("zh-CN")} 次`);
    await expect(page.getByTestId("human-model-cost")).toHaveText(`${String(study.modelCostUsd)} 美元`);
    if (study.lastActivityAt) await expect(page.getByTestId("human-last-experiment")).toHaveAttribute("datetime", study.lastActivityAt);
    else await expect(page.getByTestId("human-freshness")).toContainText("未记录");
    const state = study.state === "unknown" || study.stopReason === "unknown" ? "状态未知"
      : study.state === "budget-exhausted" ? "本轮结束" : study.state === "running" ? "已授权" : study.state === "paused" ? "已暂停" : "空闲";
    await expect(page.getByTestId("human-state")).toHaveText(state);
    if (study.stopReason === "episode-cap") await expect(page.getByTestId("human-status")).toContainText("达到回合上限");
    if (study.stopReason === "oracle-budget") await expect(page.getByTestId("human-status")).toContainText("达到本地测量上限");
  }

  const story = snapshot.story;
  if (!story) {
    await expect(page.getByTestId("human-story")).toContainText("暂无完整实验结果");
    await expect(page.getByTestId("human-result-original")).toHaveCount(0);
  } else {
    const [first, second] = measuredPair(story.counterexample.original, story.counterexample.reordered);
    expect(first).not.toBe(second);
    await expect(page.getByTestId("human-result-original")).toHaveText(first);
    await expect(page.getByTestId("human-result-reordered")).toHaveText(second);
    await expect(page.getByTestId("human-story").getByRole("heading", { level: 3 })).toHaveText(["原假设", "修订假设"]);
    await expect(page.getByTestId("human-original-idea")).toHaveText(compactRule(story.initial.rule, "zh"));
    await expect(page.getByTestId("human-revised-idea")).toHaveText(compactRule(story.revised.rule, "zh"));
    await expect(page.getByTestId("human-original-conclusion")).toHaveText("已否证");
    const status = { refuted: "已否证", "survived-budget": "未检出反例", pending: "待检验", inconclusive: "无结论" };
    await expect(page.getByTestId("human-story-conclusion")).toHaveText(status[story.revised.status]);
    const details = page.getByTestId("human-story-details");
    await expect(details).not.toHaveAttribute("open", "");
    await details.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(details).toHaveAttribute("open", "");
    await expect(page.getByTestId("human-exact-original")).toHaveText(String(story.counterexample.original));
    await expect(page.getByTestId("human-exact-reordered")).toHaveText(String(story.counterexample.reordered));
    await expect(page.getByTestId("human-exact-input")).toHaveText(JSON.stringify(story.counterexample.input, null, 2));
    await expect(details).toContainText("原反例保留");
    for (const [key, label] of [["initial", "原假设"], ["revised", "修订假设"]] as const) {
      const evaluations = details.getByRole("region", { name: `${label} · 测试记录` });
      for (const evaluation of story[key].evaluations) {
        const row = evaluations.getByRole("heading", { name: evaluation.phase === "audit" ? "T · 保留测试" : "F · 反例测试" }).locator("../..");
        await expect(row.locator("dd")).toHaveText([evaluation.calls, evaluation.inScope, evaluation.outOfScope, evaluation.allowance].map((value) => value.toLocaleString("zh-CN")));
      }
    }
    await assertFits(page);
    await details.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(details).not.toHaveAttribute("open", "");
  }
  const visibleCopy = await page.getByTestId("human-home").innerText();
  expect(visibleCopy).not.toMatch(/DSL|AST|oracle|fenced lease|programDigest|survived-budget|仪器|回执/);
  expect(visibleCopy).not.toMatch(/给人看的|这里记录一个程序|看懂一次尝试|先做一个小实验|这对我有什么用|开发助手|你可以只读到这里|不是故障|符合这些条件/);
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
  test(`${viewport.name}: dashboard projects real results with keyboard, EN/ZH, themes and axe`, async ({ page }, testInfo) => {
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
    await expect(page.getByTestId("human-state")).toBeInViewport();
    await expect(page.getByTestId("human-metrics")).toBeInViewport();
    if (snapshot.story) {
      await expect(page.getByTestId("human-result-original")).toBeInViewport();
      await expect(page.getByTestId("human-result-reordered")).toBeInViewport();
    }
    await expect(page.getByTestId("human-home")).toHaveCSS("font-size", "16px");
    for (const button of await page.getByRole("button").all()) {
      const box = await button.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
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
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Research overview");
    expect(await page.getByTestId("human-home").innerText()).not.toMatch(/For people|This page records a program|Understand one attempt|What can this do for me|You can stop reading here/);
    await expect(page.getByRole("group", { name: "Language", exact: true })).toBeVisible();
    await assertAccessible(page);
    await page.getByRole("group", { name: "Appearance", exact: true }).getByRole("button", { name: "Light", exact: true }).click();
    await assertFits(page);
    await assertAccessible(page);

    const details = page.getByTestId("human-technical");
    await details.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(details).toHaveAttribute("open", "");
    await expect(details.getByRole("link", { name: "Research records", exact: true })).toHaveAttribute("href", "/research");
    await expect(details.getByRole("link", { name: "Raw data (JSON)", exact: true })).toHaveAttribute("href", ENDPOINT);
    await expect(details).toContainText("Local measurements are not model calls");
    await expect(details).toContainText("CPU / memory: not measured");
    await expect(details).toContainText("No counterexample in finite tests is not proof");
    if (snapshot.study) await expect(page.getByTestId("human-measurement-budget")).toHaveText(`${snapshot.study.measurements.toLocaleString("en-US")} · Reserved ${snapshot.study.reserved.toLocaleString("en-US")} · Limit ${snapshot.study.measurementLimit.toLocaleString("en-US")}`);
    await assertFits(page);
    await assertAccessible(page);
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

test("/ defaults to the dashboard; research and explicit legacy links stay separate", async ({ page }) => {
  await openHuman(page, "/");
  const header = page.getByRole("banner");
  await expect(header.getByRole("link", { name: "NEXUS-7" })).toHaveAttribute("href", "/");
  await expect(header.getByRole("link", { name: "概览", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(header.getByRole("link", { name: "研究记录" })).toHaveAttribute("href", "/research");
  await expect(header.getByRole("link", { name: "城市档案" })).toHaveAttribute("href", "/archive/city");
  await header.getByRole("link", { name: "研究记录" }).click();
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
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("研究概览");
  await expect(page.getByTestId("human-state")).toHaveText("状态未知");
  await expect(page.getByTestId("human-progress")).toHaveCount(0);
  await expect(page.getByTestId("human-model-calls")).toHaveCount(0);
  await expect(page.getByTestId("human-result-original")).toHaveCount(0);
  await expect(page.getByTestId("human-read-time")).toHaveCount(0);
});
