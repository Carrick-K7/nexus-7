import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HumanHome from "@/components/human/HumanHome";
import Home from "@/app/page";
import HumanPage from "@/app/human/page";
import { measuredPair } from "@/components/human/format";
import { briefRule, conceptualRule, originalIdea } from "@/components/human/rules";
import { HUMAN_ENDPOINT } from "@/components/human/useReadOnlySnapshot";
import type { HumanEvaluation, HumanOverview, HumanRule } from "@/research/human-contracts";

vi.mock("@/components/research/ResearchShell", () => ({ default: () => <div data-testid="explicit-legacy-shell" /> }));

const readAt = "2026-10-24T04:10:00.000Z";
const experimentAt = "2026-10-23T13:00:00.000Z";

// Deliberate UNIT reference fake. Never used by the app, browser success tests,
// a worker, or as evidence of any live experiment, resource use, or model call.
function evaluation(status: HumanEvaluation["status"], phase: HumanEvaluation["phase"] = "falsification"): HumanEvaluation {
  const observationIds = Array.from({ length: 8 }, (_, i) => i === 0 && status === "refuted" ? "reference-fake-witness" : `reference-fake-${phase}-${status}-${i}`);
  return { phase, status, calls: 8, inScope: 4, outOfScope: 4, allowance: 16,
    episodeId: `reference-fake-${phase}-${status}-episode`, observationIds,
    counterexampleIds: status === "refuted" ? [observationIds[0]] : [] };
}
function referenceFake(): HumanOverview {
  const evidence = (name: string) => ({ creationEpisodeId: `reference-fake-${name}-episode`, programDigest: `reference-fake-${name}-program`, trainingDigest: `reference-fake-${name}-training`, trainingObservationIds: [`reference-fake-${name}-input`] });
  return {
    schemaVersion: "nexus.research-human.v1", readAt,
    source: { backend: "memory", releaseRevision: null, releaseEvidence: "local-unbound", stationRevision: 5 },
    study: { state: "budget-exhausted", stopReason: "episode-cap", steps: 5, stepLimit: 5, measurements: 17, reserved: 0, measurementLimit: 100,
      modelCalls: 3, modelCostUsd: 0.125, lastActivityAt: experimentAt, pendingQuestions: 2, counts: { hypotheses: 2, tools: 1, lessons: 2 } },
    story: {
      kind: "floating-point-sum-order", subject: { id: "sum-grouping-hypothesis", version: "ieee754-instrument-v1" },
      initial: { id: "reference-fake-initial", rule: { expectedEqual: true, condition: { op: "lte", feature: "length", threshold: 3.5 } }, status: "refuted", evaluations: [evaluation("refuted")], evidence: evidence("initial") },
      counterexample: { observationId: "reference-fake-witness", input: [0.1, 0.2, 0.3], original: 0.6000000000000001, reordered: 0.6 },
      revised: { id: "reference-fake-revised", rule: { expectedEqual: true, condition: { op: "or", left: { op: "lte", feature: "length", threshold: 2.5 }, right: { op: "lte", feature: "nonIntegerCount", threshold: 0.5 } } }, status: "survived-budget", evaluations: [evaluation("survived-budget")], evidence: evidence("revised") },
    },
    storyAvailability: { status: "available", reason: null },
  };
}
function response(payload: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => payload } as Response;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}
async function openDetails(id: string) {
  const details = screen.getByTestId(id) as HTMLDetailsElement;
  details.open = true;
  fireEvent(details, new Event("toggle"));
  await waitFor(() => expect(details).toHaveAttribute("open"));
}
async function loaded() {
  await screen.findByTestId("human-read-time");
  await waitFor(() => expect(screen.getByRole("button", { name: "重新读取记录" })).toBeEnabled());
}
let visibility: DocumentVisibilityState;
beforeEach(() => {
  visibility = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
  document.documentElement.lang = "en";
  document.documentElement.dataset.theme = "dark";
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("HumanHome — explicit unit reference fakes, not live research evidence", () => {
  it("offers an independent Chinese, light, plain-language first reading with real projected limits", async () => {
    const fetcher = vi.fn(async () => response(referenceFake()));
    vi.stubGlobal("fetch", fetcher);
    render(<HumanHome />);
    await loaded();
    expect(screen.getByTestId("human-intro")).toHaveTextContent("这里记录一个程序做过的小实验");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/^这一轮已经停止$/);
    expect(screen.getByTestId("human-progress")).toHaveTextContent("已做 5 / 5 步，按预先上限结束");
    expect(screen.getByTestId("human-status")).toHaveTextContent("一步是处理一个任务");
    expect(screen.getByTestId("human-status")).toHaveTextContent("不是模型的钱花完");
    expect(screen.getByTestId("human-status")).toHaveTextContent("不是故障，也不会自动续跑");
    expect(screen.getByTestId("human-status")).toHaveTextContent("待办不代表还会运行");
    expect(screen.getByTestId("human-home")).toHaveAttribute("data-theme", "light");
    expect(document.documentElement).toHaveAttribute("lang", "zh-CN");
    expect(screen.queryByTestId("explicit-legacy-shell")).not.toBeInTheDocument();
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(within(screen.getByRole("banner")).getByRole("link", { name: "技术记录" })).toHaveAttribute("href", "/research");
    expect(fetcher).toHaveBeenCalledWith(HUMAN_ENDPOINT, expect.objectContaining({ method: "GET", cache: "no-store", signal: expect.any(AbortSignal) }));
  });

  it("offers a pure, bilingual example anchor without another request, and keeps errors prominent", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response(referenceFake())).mockResolvedValueOnce(response({}, 503));
    vi.stubGlobal("fetch", fetcher);
    render(<HumanHome />);
    await loaded();
    const jump = screen.getByRole("link", { name: "先看一个实际例子" });
    expect(jump).toHaveAttribute("href", "#human-story-heading");
    expect(screen.getByRole("heading", { name: "把同一组数字换顺序相加" })).toHaveAttribute("tabindex", "-1");
    fireEvent.click(jump);
    expect(fetcher).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(screen.getByRole("link", { name: "See an actual example first" })).toHaveAttribute("href", "#human-story-heading");
    fireEvent.click(screen.getByRole("button", { name: "Read the records again" }));
    await screen.findByRole("alert");
    expect(screen.queryByTestId("human-story-jump")).not.toBeInTheDocument();
    expect(screen.getByTestId("human-read-time")).toHaveAttribute("datetime", readAt);
  });

  it.each(["and", "or"] as const)("explains a less-simple revised %s condition using its real features and connective", async (op) => {
    const fake = referenceFake();
    fake.story!.revised.rule = { expectedEqual: op === "or", condition: { op,
      left: { feature: "nonZeroOrderSpan", op: "gt", threshold: 2.5 },
      right: { feature: "min", op: "lte", threshold: -21413824.5 },
    } };
    vi.stubGlobal("fetch", vi.fn(async () => response(fake)));
    render(<HumanHome />);
    await loaded();
    const text = screen.getByTestId("human-revised-idea");
    expect(text).toHaveTextContent("非零数的大小相差多悬殊");
    expect(text).toHaveTextContent("最小的数有多小");
    expect(text).toHaveTextContent(op === "and" ? "两项条件同时满足时" : "满足其中一种条件时");
    expect(text).toHaveTextContent(op === "and" ? "预计两次结果不同" : "预计两次结果相同");
    expect(text).toHaveTextContent("具体门槛在下面");
    expect(text).not.toHaveTextContent("21413824.5");
    expect(text).not.toHaveTextContent("符合这些条件");
    fireEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(text).toHaveTextContent("how widely the nonzero numbers differ in size");
    expect(text).toHaveTextContent(op === "and" ? "When both conditions are met" : "When either condition is met");
    expect(text).toHaveTextContent("The exact cutoffs are below");
  });

  it("tells the actual attempt → contradiction → revision, keeps unequal outputs distinct, and defers raw evidence", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(referenceFake())));
    render(<HumanHome />);
    await loaded();
    const headings = within(screen.getByTestId("human-story")).getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(["先做一个小实验", "原来的想法", "找到不符合的例子", "修改猜测", "暂时结论"]);
    expect(screen.getByTestId("human-result-original")).toHaveTextContent(/^0\.6000000000000001$/);
    expect(screen.getByTestId("human-result-reordered")).toHaveTextContent(/^0\.6$/);
    expect(screen.getByTestId("human-original-idea")).toHaveTextContent("最多有 3 个数");
    expect(screen.getByTestId("human-revised-idea")).toHaveTextContent("只有两个数，或者这一组全是整数时");
    expect(screen.getByTestId("human-story-conclusion")).toHaveTextContent("这次测试没找到反例");
    expect(screen.getByTestId("human-story-conclusion")).toHaveTextContent("还不是证明");
    expect(screen.queryByText("reference-fake-initial-program")).not.toBeInTheDocument();
    expect(screen.getByTestId("human-home").textContent).not.toMatch(/DSL|AST|oracle|fenced lease|programDigest|survived-budget|仪器|回执/);
    await openDetails("human-story-details");
    expect(screen.getByTestId("human-exact-input")).toHaveTextContent("0.1");
    expect(screen.getByTestId("human-exact-original")).toHaveTextContent("0.6000000000000001");
    expect(screen.getByTestId("human-story-details")).toHaveTextContent("reference-fake-initial-program");
  });

  it("explains the known size-or-count original idea without exposing its huge threshold by default", async () => {
    const fake = referenceFake();
    fake.story!.initial.rule = { expectedEqual: true, condition: { op: "or",
      left: { op: "gt", feature: "min", threshold: -21413824.5 }, right: { op: "lte", feature: "length", threshold: 2.5 } } };
    vi.stubGlobal("fetch", vi.fn(async () => response(fake)));
    render(<HumanHome />);
    await loaded();
    expect(screen.getByTestId("human-original-idea")).toHaveTextContent("原先按数字大小或数量");
    expect(screen.getByTestId("human-original-idea")).toHaveTextContent("这组数字符合它当时的条件");
    expect(screen.getByTestId("human-home")).not.toHaveTextContent("21413824.5");
    expect(screen.getByTestId("human-revised-idea")).toHaveTextContent("只有两个数，或者这一组全是整数时");
    await openDetails("human-story-details");
    expect(screen.getByTestId("human-story-details")).toHaveTextContent("-21413824.5");
  });

  it("shows the reported production-scale decimal pair in ordinary decimal notation with full values available", async () => {
    // A UI reference fake using the reported numeric pair, not a reproduced live experiment.
    const fake = referenceFake();
    fake.story!.counterexample.original = 6e-8;
    fake.story!.counterexample.reordered = 5.960464477539063e-8;
    vi.stubGlobal("fetch", vi.fn(async () => response(fake)));
    render(<HumanHome />);
    await loaded();
    expect(screen.getByTestId("human-result-original")).toHaveTextContent(/^0\.00000006$/);
    expect(screen.getByTestId("human-result-reordered")).toHaveTextContent(/^0\.000000059604645$/);
    expect(screen.queryByTestId("human-compact-numbers")).not.toBeInTheDocument();
    await openDetails("human-story-details");
    expect(screen.getByTestId("human-exact-original")).toHaveTextContent(/^6e-8$/);
    expect(screen.getByTestId("human-exact-reordered")).toHaveTextContent(/^5\.960464477539063e-8$/);
  });

  it("labels extremely small unequal outputs distinctly and offers their exact values without a wall of zeroes", async () => {
    const fake = referenceFake();
    fake.story!.counterexample.original = 1e-300;
    fake.story!.counterexample.reordered = 1.0000000000000002e-300;
    vi.stubGlobal("fetch", vi.fn(async () => response(fake)));
    render(<HumanHome />);
    await loaded();
    expect(screen.getByTestId("human-result-original")).toHaveTextContent("极小的正数（结果一）");
    expect(screen.getByTestId("human-result-reordered")).toHaveTextContent("极小的正数（结果二）");
    expect(screen.getByTestId("human-compact-numbers")).toHaveTextContent("两次结果不同");
    expect(screen.getByTestId("human-home").textContent).not.toContain("0".repeat(50));
    fireEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(screen.getByTestId("human-result-original")).toHaveTextContent("Very small positive value (result 1)");
    fireEvent.click(screen.getByRole("button", { name: "See the full values" }));
    await waitFor(() => expect(screen.getByTestId("human-exact-original")).toHaveTextContent("1e-300"));
    expect(screen.getByTestId("human-exact-reordered")).toHaveTextContent("1.0000000000000002e-300");
    expect(screen.getByTestId("human-story-details").querySelector("summary")).toHaveFocus();
  });

  it("keeps in-condition and outside-condition measurements separate in the expanded tests", async () => {
    const fake = referenceFake();
    fake.study!.measurements = 64;
    fake.story!.revised.evaluations = [
      { ...evaluation("survived-budget"), calls: 24, inScope: 13, outOfScope: 11, allowance: 24, observationIds: Array.from({ length: 24 }, (_, i) => `reference-fake-feedback-${i}`) },
      { ...evaluation("survived-budget", "audit"), calls: 32, inScope: 16, outOfScope: 16, allowance: 32, observationIds: Array.from({ length: 32 }, (_, i) => `reference-fake-audit-${i}`) },
    ];
    vi.stubGlobal("fetch", vi.fn(async () => response(fake)));
    render(<HumanHome />);
    await loaded();
    await openDetails("human-story-details");
    expect(screen.getByTestId("human-story-details")).toHaveTextContent("24 次计算，其中 13 次符合条件，11 次在条件外");
    expect(screen.getByTestId("human-story-details")).toHaveTextContent("32 次计算，其中 16 次符合条件，16 次在条件外");
  });

  it("does not reuse the known revision sentence for another condition or prediction", async () => {
    const fake = referenceFake();
    fake.story!.revised.rule.condition = { op: "gt", feature: "length", threshold: 4.5 };
    fake.story!.revised.rule.expectedEqual = false;
    vi.stubGlobal("fetch", vi.fn(async () => response(fake)));
    render(<HumanHome />);
    await loaded();
    expect(screen.getByTestId("human-revised-idea")).toHaveTextContent("至少有 5 个数");
    expect(screen.getByTestId("human-revised-idea")).toHaveTextContent("结果不同");
    expect(screen.getByTestId("human-revised-idea")).not.toHaveTextContent("这一组全是整数");
  });

  it("retains a historical refutation even after a later test without a counterexample", async () => {
    const fake = referenceFake();
    fake.story!.revised.status = "refuted";
    fake.story!.revised.evaluations = [evaluation("refuted"), evaluation("survived-budget", "audit")];
    vi.stubGlobal("fetch", vi.fn(async () => response(fake)));
    render(<HumanHome />);
    await loaded();
    expect(screen.getByTestId("human-story-conclusion")).toHaveTextContent("修改后的想法也找到了不符合的例子");
    expect(screen.getByTestId("human-story-conclusion")).not.toHaveTextContent("这次测试没找到反例");
    expect(screen.getByTestId("human-story-conclusion")).toHaveTextContent("原来的反例仍然保留");
  });

  it.each(["pending", "inconclusive"] as const)("does not upgrade a %s revision to a proof", async (status) => {
    const fake = referenceFake();
    fake.story!.revised.status = status;
    fake.story!.revised.evaluations = status === "pending" ? [] : [evaluation("inconclusive")];
    vi.stubGlobal("fetch", vi.fn(async () => response(fake)));
    render(<HumanHome />);
    await loaded();
    expect(screen.getByTestId("human-story-conclusion")).toHaveTextContent(status === "pending" ? "还没有测试结果" : "还不足以下结论");
  });

  it("uses the recorded model cost/calls, separates local computation, and admits unmeasured resources", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(referenceFake())));
    render(<HumanHome />);
    await loaded();
    expect(screen.getByTestId("human-measurements")).toHaveTextContent("17 次");
    expect(screen.getByTestId("human-model-calls")).toHaveTextContent("3 次");
    expect(screen.getByTestId("human-model-cost")).toHaveTextContent("0.125 美元");
    expect(screen.getByTestId("human-usage")).toHaveTextContent("不是 DeepSeek");
    expect(screen.getByTestId("human-usage")).toHaveTextContent("不包括服务器租金");
    expect(screen.getByTestId("human-usage")).toHaveTextContent("未测量");
    expect(screen.getByTestId("human-roles")).toHaveTextContent("城市模拟已经冻结");
    expect(screen.getByTestId("human-roles")).toHaveTextContent("网站里的实验程序");
  });

  it("distinguishes Beijing experiment time from read time, and supports EN and grouped theme controls", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(referenceFake())));
    render(<HumanHome />);
    await loaded();
    expect(screen.getByTestId("human-last-experiment")).toHaveAttribute("datetime", experimentAt);
    expect(screen.getByTestId("human-last-experiment")).toHaveTextContent("21:00:00");
    expect(screen.getByTestId("human-read-time")).toHaveAttribute("datetime", readAt);
    expect(screen.getByTestId("human-read-time")).toHaveTextContent("12:10:00");
    expect(screen.getByRole("group", { name: "语言" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(document.documentElement).toHaveAttribute("lang", "en");
    expect(screen.getByTestId("human-intro")).toHaveTextContent("This page records a program's small experiments");
    expect(screen.getByRole("group", { name: "Appearance" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dark" }));
    expect(screen.getByTestId("human-home")).toHaveAttribute("data-theme", "dark");
    expect(screen.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");
    for (const button of screen.getAllByRole("button")) expect(button).toHaveAccessibleName();
    expect(screen.queryByRole("button", { name: /start|resume|pay|启动|执行|付费/i })).not.toBeInTheDocument();
  });

  it("describes running only as permission rather than active OS computation", async () => {
    const fake = referenceFake();
    Object.assign(fake.study!, { state: "running", stopReason: null, stepLimit: 20 });
    vi.stubGlobal("fetch", vi.fn(async () => response(fake)));
    render(<HumanHome />);
    await loaded();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("记录允许继续实验");
    expect(screen.getByTestId("human-status")).toHaveTextContent("不知道它此刻是否真的在算");
    expect(screen.getByTestId("human-status")).not.toHaveTextContent("这一轮已经停止");
  });

  it.each([
    ["paused", "human-paused", "已暂停"], ["idle", "agenda-empty", "这一轮已经停止"],
    ["unknown", "unknown", "暂时不知道是否在工作"], ["budget-exhausted", "oracle-budget", "这一轮已经停止"],
  ] as const)("reads %s / %s without inventing activity", async (state, stopReason, title) => {
    const fake = referenceFake();
    Object.assign(fake.study!, { state, stopReason, stepLimit: 20 });
    if (stopReason === "oracle-budget") fake.study!.measurements = fake.study!.measurementLimit;
    vi.stubGlobal("fetch", vi.fn(async () => response(fake)));
    render(<HumanHome />);
    await loaded();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(title);
    if (stopReason === "oracle-budget") {
      expect(screen.getByTestId("human-progress")).toHaveTextContent("100 / 100 次本地计算");
      expect(screen.getByTestId("human-status")).toHaveTextContent("本地计算次数上限停止");
      expect(screen.getByTestId("human-status")).not.toHaveTextContent("这里到步数上限停止");
    }
  });

  it("keeps a valid empty response distinct from a successful experiment or zero usage", async () => {
    const fake = referenceFake();
    fake.study = null; fake.story = null; fake.source.stationRevision = null;
    fake.storyAvailability = { status: "pending", reason: "no-study" };
    vi.stubGlobal("fetch", vi.fn(async () => response(fake)));
    render(<HumanHome />);
    await loaded();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("还没有实验记录");
    expect(screen.getByTestId("human-story")).toHaveTextContent("不能提供真实例子");
    expect(screen.getByTestId("human-usage")).toHaveTextContent("未知不等于零");
    expect(screen.queryByTestId("human-model-calls")).not.toBeInTheDocument();
  });

  it("declines an unsupported story rather than filling it with static decimal examples", async () => {
    const fake = referenceFake(); fake.story = null; fake.storyAvailability = { status: "unavailable", reason: "unsupported-predicate" };
    vi.stubGlobal("fetch", vi.fn(async () => response(fake)));
    render(<HumanHome />);
    await loaded();
    expect(screen.getByTestId("human-story")).toHaveTextContent("暂不展示计算结果");
    expect(screen.queryByTestId("human-result-original")).not.toBeInTheDocument();
    expect(screen.queryByTestId("human-story-details")).not.toBeInTheDocument();
  });

  it.each([401, 403, 503])("does not render initial HTTP %i as an empty or successful zero record", async (status) => {
    vi.stubGlobal("fetch", vi.fn(async () => response({ error: "explicit-reference-fake-http-error" }, status)));
    render(<HumanHome />);
    await screen.findByRole("alert");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("暂时不知道是否在工作");
    expect(screen.queryByTestId("human-read-time")).not.toBeInTheDocument();
    expect(screen.queryByTestId("human-progress")).not.toBeInTheDocument();
    expect(screen.queryByTestId("human-model-calls")).not.toBeInTheDocument();
    if (status !== 503) expect(screen.getByRole("alert")).toHaveTextContent("没有读取权限");
  });

  it.each(["schema", "negative-count", "nonfinite-result", "future-rule", "contradictory-history"])("rejects %s data instead of manufacturing a replacement", async (kind) => {
    const fake = referenceFake();
    const payload: unknown = kind === "schema" ? { ...fake, schemaVersion: "future-v99" }
      : kind === "future-rule" ? { ...fake, story: { ...fake.story, revised: { ...fake.story!.revised, rule: { expectedEqual: true, condition: { op: "future", feature: "length", threshold: 2 } } } } }
      : fake;
    if (kind === "negative-count") fake.study!.measurements = -1;
    if (kind === "nonfinite-result") fake.story!.counterexample.original = Infinity;
    if (kind === "contradictory-history") fake.story!.revised.evaluations = [evaluation("refuted")];
    vi.stubGlobal("fetch", vi.fn(async () => response(payload)));
    render(<HumanHome />);
    expect(await screen.findByRole("alert")).toHaveTextContent("返回的数据无法核对");
    expect(screen.queryByTestId("human-result-original")).not.toBeInTheDocument();
    expect(screen.queryByTestId("human-read-time")).not.toBeInTheDocument();
  });

  it("keeps the old snapshot and timestamps on refresh failure, and recovers only on a new valid GET", async () => {
    const fake = referenceFake();
    const fresh = { ...fake, readAt: "2026-10-24T04:12:00.000Z" };
    const fetcher = vi.fn().mockResolvedValueOnce(response(fake)).mockResolvedValueOnce(response({}, 503)).mockResolvedValueOnce(response(fresh));
    vi.stubGlobal("fetch", fetcher);
    render(<HumanHome />);
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "重新读取记录" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("上次读到的记录");
    expect(screen.getByTestId("human-read-time")).toHaveAttribute("datetime", readAt);
    expect(screen.getByTestId("human-result-original")).toHaveTextContent("0.6000000000000001");
    await waitFor(() => expect(screen.getByRole("button", { name: "重新读取记录" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "重新读取记录" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(screen.getByTestId("human-read-time")).toHaveAttribute("datetime", fresh.readAt);
    expect(fetcher.mock.calls.every(([, options]) => options.method === "GET")).toBe(true);
  });

  it("does not make an initial GET while the page is hidden", async () => {
    vi.useFakeTimers();
    visibility = "hidden";
    const fetcher = vi.fn(async () => response(referenceFake()));
    vi.stubGlobal("fetch", fetcher);
    render(<HumanHome />);
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(fetcher).not.toHaveBeenCalled();
    expect(screen.queryByTestId("human-read-time")).not.toBeInTheDocument();
    visibility = "visible";
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("human-read-time")).toHaveAttribute("datetime", readAt);
  });

  it.each(["network", "json"])("treats an initial %s failure as unread rather than zero", async (failure) => {
    vi.stubGlobal("fetch", failure === "network" ? vi.fn().mockRejectedValue(new Error("explicit-reference-fake-network"))
      : vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => { throw new SyntaxError("explicit-reference-fake-json"); } }));
    render(<HumanHome />);
    expect(await screen.findByRole("alert")).toHaveTextContent("没能读取记录");
    expect(screen.queryByTestId("human-model-calls")).not.toBeInTheDocument();
    expect(screen.queryByTestId("human-read-time")).not.toBeInTheDocument();
  });

  it("polls visible pages at 30 seconds, aborts hidden reads, ignores their late results, and cleans up", async () => {
    vi.useFakeTimers();
    const later = deferred<Response>();
    const fetcher = vi.fn().mockResolvedValueOnce(response(referenceFake())).mockImplementationOnce(() => later.promise).mockResolvedValue(response(referenceFake()));
    vi.stubGlobal("fetch", fetcher);
    const { unmount } = render(<HumanHome />);
    await act(async () => { vi.advanceTimersByTime(0); });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(29_999); });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(fetcher).toHaveBeenCalledTimes(2);
    const signal = fetcher.mock.calls[1][1].signal as AbortSignal;
    fireEvent.click(screen.getByRole("button", { name: "重新读取记录" }));
    expect(fetcher).toHaveBeenCalledTimes(2);
    visibility = "hidden";
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(signal.aborted).toBe(true);
    await act(async () => { vi.advanceTimersByTime(90_000); later.resolve(response({ ...referenceFake(), readAt: "2026-10-24T05:00:00.000Z" })); });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("human-read-time")).toHaveAttribute("datetime", readAt);
    visibility = "visible";
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(fetcher).toHaveBeenCalledTimes(3);
    unmount();
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("times out a hung request, aborts it, and makes a read-only retry available", async () => {
    vi.useFakeTimers();
    const hung = deferred<Response>();
    const fetcher = vi.fn().mockImplementationOnce(() => hung.promise).mockResolvedValue(response(referenceFake()));
    vi.stubGlobal("fetch", fetcher);
    render(<HumanHome />);
    await act(async () => { vi.advanceTimersByTime(15_000); });
    expect((fetcher.mock.calls[0][1].signal as AbortSignal).aborted).toBe(true);
    expect(screen.getByRole("alert")).toHaveTextContent("没能读取记录");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "重新读取记录" })));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByTestId("human-read-time")).toHaveAttribute("datetime", readAt);
  });

  it("cancels the obsolete StrictMode timer and aborts unmounted requests without accepting their data", async () => {
    const hung = deferred<Response>();
    const fetcher = vi.fn(() => hung.promise);
    vi.stubGlobal("fetch", fetcher);
    const { unmount } = render(<StrictMode><HumanHome /></StrictMode>);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    const signal = (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].signal!;
    expect(signal.aborted).toBe(false);
    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => hung.resolve(response(referenceFake())));
    expect(screen.queryByTestId("human-home")).not.toBeInTheDocument();
  });

  it("keeps / and /human independent, while an explicit view remains the legacy shell", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(referenceFake())));
    const defaultPage = render(await Home({ searchParams: Promise.resolve({}) }));
    await loaded();
    expect(screen.getByTestId("human-home")).toBeInTheDocument();
    defaultPage.unmount();
    const humanPage = render(<HumanPage />);
    await loaded();
    expect(screen.getByTestId("human-home")).toBeInTheDocument();
    humanPage.unmount();
    render(await Home({ searchParams: Promise.resolve({ view: "legacy" }) }));
    expect(screen.getByTestId("explicit-legacy-shell")).toBeInTheDocument();
    expect(screen.queryByTestId("human-home")).not.toBeInTheDocument();
  });
});

describe("Human number/rule display — presentation, never a repeated experiment", () => {
  it.each([[0.6000000000000001, 0.6], [1e-300, 1.0000000000000002e-300], [1.0000000000000002, 1], [0, Number.MIN_VALUE]])("never rounds unequal %s and %s into the same visible result", (a, b) => {
    const [first, second] = measuredPair(a, b);
    expect(first).not.toBe(second);
    if (a !== 0) expect(Number(first)).not.toBe(0);
    if (b !== 0) expect(Number(second)).not.toBe(0);
  });
  it("matches the original min-or-count shape, not a production threshold or an unrelated connective", () => {
    const shape = { expectedEqual: true, condition: { op: "or", left: { feature: "min", op: "gt", threshold: -9e8 }, right: { feature: "length", op: "lte", threshold: 2.5 } } } as const;
    expect(originalIdea(shape, "zh")).toContain("原先按数字大小或数量");
    expect(originalIdea({ ...shape, condition: { ...shape.condition, op: "and" } }, "zh")).toBeNull();
    expect(originalIdea({ ...shape, expectedEqual: false }, "zh")).toBeNull();
    expect(originalIdea({ ...shape, condition: { ...shape.condition, left: { ...shape.condition.left, feature: "max" } } }, "zh")).toBeNull();
  });
  it("keeps decimal previews bounded and distinct even at extreme magnitudes", () => {
    expect(measuredPair(6e-8, 5.960464477539063e-8)).toEqual(["0.00000006", "0.000000059604645"]);
    expect(measuredPair(1e-25, 1.0000000000000003e-25)[0]).not.toBe(measuredPair(1e-25, 1.0000000000000003e-25)[1]);
    expect(measuredPair(-1e-300, -2e-300)[0]).toContain("极小的负数");
    expect(measuredPair(1e300, 2e300)[0]).toContain("很大的正数");
    for (const value of measuredPair(Number.MIN_VALUE, Number.MIN_VALUE * 2)) {
      expect(value.length).toBeLessThan(50);
      expect(value).not.toMatch(/e[-+]\d/);
    }
  });
  it.each([
    ["length", "一共有几个数"], ["nonIntegerCount", "有几个数带小数部分"],
    ["min", "最小的数有多小"], ["max", "最大的数有多大"],
    ["maxAbs", "忽略正负号后最大的数有多大"], ["nonZeroOrderSpan", "非零数的大小相差多悬殊"],
  ] as const)("explains the known %s feature without inventing a cutoff", (feature, explanation) => {
    const rule: HumanRule = { expectedEqual: false, condition: { feature, op: "gt", threshold: 9e8 } };
    expect(briefRule(rule, "zh")).toBeNull();
    const sentence = conceptualRule(rule, "zh");
    expect(sentence).toContain(explanation);
    expect(sentence).toContain("结果不同");
    expect(sentence).toContain("具体门槛在下面");
    expect(sentence).not.toContain("900000000");
  });
  it("does not attach a known-feature explanation to future or malformed predicates", () => {
    for (const condition of [
      { feature: "future", op: "gt", threshold: 1 },
      { feature: "min", op: "future", threshold: 1 },
      { feature: "min", op: "gt", threshold: Infinity },
      { op: "xor", left: { feature: "min", op: "gt", threshold: 1 }, right: { feature: "length", op: "lte", threshold: 2 } },
    ]) expect(conceptualRule({ expectedEqual: true, condition } as HumanRule, "zh")).toBeNull();
  });
  it("defers giant and tiny thresholds instead of copying the known rule's story", () => {
    expect(briefRule({ expectedEqual: true, condition: { feature: "max", op: "lte", threshold: 9e8 } }, "zh")).toBeNull();
    expect(briefRule({ expectedEqual: true, condition: { feature: "min", op: "gt", threshold: 1e-200 } }, "zh")).toBeNull();
  });
});
