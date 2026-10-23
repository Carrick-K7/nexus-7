import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ResearchStation from "@/components/research/ResearchStation";
import ResearchShell from "@/components/research/ResearchShell";
import CityArchive from "@/components/archive/CityArchive";
import { hasCompletedCityArchive, parseCityArchive, type CityArchiveManifest } from "@/components/archive/city-archive-contract";

const { useCitySimulationMock } = vi.hoisted(() => ({ useCitySimulationMock: vi.fn() }));
vi.mock("@/hooks/useCitySimulation", () => ({ useCitySimulation: useCitySimulationMock }));
vi.mock("@/components/layout/BackgroundEffects", () => ({ default: () => null }));
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import { useNexusStore } from "@/stores/nexus-store";
import type { HypothesisEvaluation, Observation, ResearchHypothesis, ResearchOverview, ResearchTool } from "@/research/contracts";

const ENDPOINT = "/api/research/v1/overview";
const observedAt = "2026-10-20T12:00:00.000Z";

// Deliberate UI contract reference fake. This is NOT a worker run, live API,
// generated research result, certification, or evidence of natural discovery.
function referenceFakeOverview(populated = true): ResearchOverview {
  const tool: ResearchTool = {
    id: "reference-fake-tool",
    program: { schemaVersion: "nexus.counterexample-reducer.v1", operators: ["delete-entry", "halve-number"], maxPasses: 2 },
    digest: "reference-fake-tool-digest-" + "a".repeat(64),
    source: "// reference fake generated reducer source; inspection only\n{\"operators\":[\"delete-entry\",\"halve-number\"],\"maxPasses\":2}",
    createdByEpisodeId: "reference-fake-parent-episode",
    trainingSubjectId: "reference-fake-known-seed",
    status: "certified",
    evaluation: {
      verifierVersion: "reference-fake-verifier-v1",
      programDigest: "reference-fake-tool-digest-" + "a".repeat(64),
      subjectId: "reference-fake-known-seed",
      subjectVersion: "reference-fake-v1",
      inputDigest: "reference-fake-evaluation-input-digest",
      observationIds: ["reference-fake-evaluation-initial", "reference-fake-evaluation-final", "reference-fake-evaluation-control"],
      initialObservationId: "reference-fake-evaluation-initial",
      finalObservationId: "reference-fake-evaluation-final",
      controlObservationId: "reference-fake-evaluation-control",
      allowance: 10,
      accepted: true,
      code: "reference-fake-evaluation",
      calls: 4,
      originalSize: 20,
      reducedSize: 3,
      counterexamplePreserved: true,
      controlRejected: true,
      reduced: [1],
    },
    reusedOnSubjectIds: ["reference-fake-generated-challenge"],
  };
  const observations: Observation[] = Array.from({ length: 105 }, (_, index) => ({
    id: `reference-fake-observation-${index}`,
    subjectId: "reference-fake-generated-challenge",
    subjectVersion: "reference-fake-v1",
    input: { values: [1, 2, 3] },
    inputDigest: `reference-fake-input-digest-${index}`,
    partition: "tool-training",
    measurement: { holds: false, code: "reference-fake-measurement", facts: { measuredSize: 3, result: `reference-fake-fact-${index}` } },
  }));
  return {
    schemaVersion: "nexus.research-station.v1",
    generatedAt: observedAt,
    backend: "memory",
    boundary: { productionWrites: false, arbitraryCodeExecution: false, liveModelCalls: false, knownSeedsAreNotDiscoveries: true, evaluatorIsolation: "separate-module-not-hostile-process-isolation" },
    subjects: [
      { id: "reference-fake-known-seed", version: "reference-fake-v1", title: { en: "Reference fake known audit seed", zh: "参考假数据：已知审计种子" }, claim: { en: "Reference fake declared claim", zh: "参考假数据：声明命题" }, origin: "known-audit-seed", interpretation: "declared-contract", family: "reference-fake-family-a" },
      { id: "reference-fake-generated-challenge", version: "reference-fake-v1", title: { en: "Reference fake generated challenge", zh: "参考假数据：生成式挑战" }, claim: { en: "Reference fake exploratory claim", zh: "参考假数据：探索命题" }, origin: "generated-challenge", interpretation: "exploratory-hypothesis", family: "reference-fake-family-b" },
    ],
    station: populated ? {
      schemaVersion: "nexus.research-station.v1",
      id: "reference-fake-station-not-live-evidence",
      workspaceId: "reference-fake-workspace",
      organizationId: "reference-fake-organization",
      revision: 7,
      status: "paused",
      mode: "bounded-symbolic-research",
      seed: "reference-fake-run-seed",
      subjectIds: ["reference-fake-known-seed", "reference-fake-generated-challenge"],
      subjectVersions: { "reference-fake-known-seed": "reference-fake-v1", "reference-fake-generated-challenge": "reference-fake-v1" },
      policy: { maxOracleCalls: 200, maxCallsPerEpisode: 120, maxEpisodes: 10, maxAttemptsPerQuestion: 2, leaseMs: 60000 },
      budget: { spentCalls: 110, reservedCalls: 30, abandonedReservations: 1, externalModelCalls: 0, actualModelCostUsd: 0 },
      questions: [{
        id: "reference-fake-question",
        kind: "transfer",
        subjectId: "reference-fake-generated-challenge",
        title: { en: "Reference fake follow-up question", zh: "参考假数据：后续问题" },
        status: "answered",
        createdAtRound: 2,
        parentEpisodeId: "reference-fake-parent-episode",
        observationId: "reference-fake-parent-observation",
        toolId: tool.id,
        priority: 3,
        attempts: 1,
        reasonCode: "reference-fake-follow-up-reason",
      }],
      episodes: [{
        id: "reference-fake-episode",
        questionId: "reference-fake-question",
        subjectId: "reference-fake-generated-challenge",
        kind: "transfer",
        selectionReason: "reference-fake-selection",
        verdict: "no-change",
        observations,
        lessonIds: ["reference-fake-refutation"],
        generatedQuestionIds: [],
        calls: 105,
        startedAt: observedAt,
        completedAt: observedAt,
        inputStateDigest: "reference-fake-state-digest",
        previousDigest: "reference-fake-previous-digest",
        digest: "reference-fake-episode-digest",
      }],
      lessons: [{ id: "reference-fake-refutation", subjectId: "reference-fake-generated-challenge", kind: "refutation", statement: { en: "Reference fake hypothesis was refuted", zh: "参考假数据：假设已被否证" }, evidenceIds: [observations[0].id], episodeId: "reference-fake-episode", applicability: "reference-fake bounded family only", status: "refuted", supersedes: "reference-fake-earlier-lesson" }],
      tools: [tool],
      lease: { token: "reference-fake-lease-token-not-for-display", owner: "reference-fake-worker", questionId: "reference-fake-pending-question", episodeId: "reference-fake-pending-episode", reservedCalls: 30, acquiredAt: observedAt, expiresAt: "2026-10-20T12:01:00.000Z", inputStateDigest: "reference-fake-reservation-digest" },
      stopReason: "reference-fake-no-gain-limit",
      createdAt: observedAt,
      updatedAt: observedAt,
    } : null,
  };
}

// Additive conditional-program reference fake, not a real induction or F/T run.
function referenceFakeInductionOverview(): ResearchOverview {
  const overview = referenceFakeOverview();
  const station = overview.station!;
  const parent: ResearchHypothesis = {
    id: "reference-fake-hypothesis-parent",
    subjectId: "reference-fake-generated-challenge",
    subjectVersion: "reference-fake-v1",
    program: { schemaVersion: "nexus.conditional-hypothesis.v1", when: { op: "gt", feature: "n:/value", threshold: 1 }, expectedHolds: false },
    programDigest: "reference-fake-parent-program-digest",
    trainingDigest: "reference-fake-parent-training-digest",
    trainingObservationIds: Array.from({ length: 65 }, (_, index) => `reference-fake-training-${index}`),
    createdByEpisodeId: "reference-fake-induce-parent-episode",
    parentHypothesisId: null,
  };
  const child: ResearchHypothesis = {
    ...parent,
    id: "reference-fake-hypothesis-child",
    program: { schemaVersion: "nexus.conditional-hypothesis.v1", when: { op: "and", left: { op: "gt", feature: "n:/value", threshold: 5 }, right: { op: "lte", feature: "a:length:/values", threshold: 10 } }, expectedHolds: false },
    programDigest: "reference-fake-child-program-digest",
    trainingDigest: "reference-fake-child-training-digest",
    createdByEpisodeId: "reference-fake-induce-child-episode",
    parentHypothesisId: parent.id,
  };
  const receipt = (hypothesis: ResearchHypothesis, phase: HypothesisEvaluation["phase"], status: HypothesisEvaluation["status"]): HypothesisEvaluation => {
    const count = status === "refuted" ? 3 : status === "inconclusive" ? 2 : 8;
    const observationIds = Array.from({ length: count }, (_, index) => `${hypothesis.id}:${phase}:reference-fake-observation-${index}`);
    return {
      evaluatorVersion: "conditional-falsifier-v1",
      hypothesisId: hypothesis.id,
      programDigest: hypothesis.programDigest,
      trainingDigest: hypothesis.trainingDigest,
      subjectId: hypothesis.subjectId,
      subjectVersion: hypothesis.subjectVersion,
      phase,
      seed: `reference-fake-${phase}-seed`,
      status,
      reason: `reference-fake-${status}-reason`,
      observationIds,
      counterexampleIds: status === "refuted" ? [observationIds.at(-1)!] : [],
      inScope: count - Math.floor(count / 2),
      outOfScope: Math.floor(count / 2),
      attemptedCandidates: 32,
      samplingProtocol: "bounded-perturbation-v1",
      sampleKinds: observationIds.map((_, index) => index % 2 ? "boundary" : "exploration"),
      excludedInputDigests: Array.from({ length: 90 }, (_, index) => `reference-fake-excluded-${index}`),
      calls: count,
      allowance: phase === "audit" ? 32 : 24,
    };
  };
  station.hypotheses = [parent, child];
  station.hypothesisEvaluations = [
    receipt(parent, "falsification", "refuted"),
    receipt(parent, "audit", "survived-budget"),
    receipt(child, "falsification", "survived-budget"),
    receipt(child, "audit", "inconclusive"),
  ];
  for (const [index, kind] of (["induce", "falsify", "audit-hypothesis"] as const).entries()) {
    const id = `reference-fake-${kind}-question`;
    station.questions.push({ ...station.questions[0], id, kind, hypothesisId: parent.id, title: { en: `Reference fake ${kind} question`, zh: `参考假数据：${kind} 问题` } });
    station.episodes.push({ ...station.episodes[0], id: `reference-fake-${kind}-episode`, questionId: id, kind, verdict: (["hypothesis-proposed", "hypothesis-refuted", "hypothesis-survived"] as const)[index], observations: [], calls: 0 });
  }
  station.lessons.push({ ...station.lessons[0], id: "reference-fake-hypothesis-lesson", kind: "hypothesis", statement: { en: "Reference fake conditional hypothesis remains provisional", zh: "参考假数据：条件命题仍为暂定" }, status: "provisional" });
  return overview;
}

function response(payload: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => payload } as Response;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function toggle(details: HTMLElement, open = true) {
  (details as HTMLDetailsElement).open = open;
  fireEvent(details, new Event("toggle"));
  await waitFor(() => expect(details.hasAttribute("open")).toBe(open));
}

beforeEach(() => {
  useNexusStore.setState({ language: "en", activeView: "research", theme: "dark" });
  window.history.replaceState(null, "", "/");
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  useCitySimulationMock.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ResearchStation read-only UI contract — explicit reference fake, not live evidence", () => {
  it("keeps legacy v1 records without optional hypothesis arrays readable and honest", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(referenceFakeOverview())));
    render(<ResearchStation />);
    expect(await screen.findByTestId("research-hypotheses")).toHaveTextContent("No frozen conditional hypotheses recorded");
    expect(screen.getByTestId("research-new-claims")).toHaveTextContent(/^0$/);
    expect(screen.getByTestId("research-hypothesis-receipts")).toHaveTextContent("No falsification or held-out audit receipts recorded");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/generation is not supported/)).not.toBeInTheDocument();
  });

  it("counts conditional hypotheses by frozen program digest plus subject version, not record or queue count", async () => {
    const fake = referenceFakeInductionOverview();
    const parent = fake.station!.hypotheses![0];
    fake.station!.hypotheses!.push(
      { ...parent, id: "reference-fake-repeat-training", trainingDigest: "reference-fake-later-training" },
      { ...parent, id: "reference-fake-new-instrument-version", subjectVersion: "reference-fake-v2" },
    );
    vi.stubGlobal("fetch", vi.fn(async () => response(fake)));
    render(<ResearchStation />);
    await screen.findByTestId("research-hypotheses");
    expect(screen.getByTestId("research-new-claims")).toHaveTextContent(/^3$/);
    expect(screen.getAllByTestId("research-hypothesis")).toHaveLength(4);
    expect(screen.getByTestId("research-initial-claims")).toHaveTextContent(/^2$/);
    expect(screen.getByTestId("research-claim-scope")).toHaveTextContent("Protocol follow-ups are not new hypotheses");
    expect(screen.getByTestId("research-questions")).toHaveTextContent("Induce a conditional hypothesis");
    expect(screen.getByTestId("research-episodes")).toHaveTextContent("Conditional hypothesis refuted");
    expect(screen.getByTestId("research-lessons")).toHaveTextContent("Conditional hypothesis");
    const hypothesisNote = screen.getAllByTestId("research-lesson").at(-1)!;
    expect(within(hypothesisNote).getByTestId("research-lesson-boundary")).toHaveTextContent("Kernel hypothesis note — not a proof");
    expect(within(hypothesisNote).getByTestId("research-lesson-status")).toHaveTextContent("Reported status: provisional");
  });

  it("shows conditional AST, false instrument prediction, parent lineage, and bounded training references in both languages", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(referenceFakeInductionOverview())));
    render(<ResearchStation />);
    await screen.findByTestId("research-hypotheses");
    const [parent, child] = screen.getAllByTestId("research-hypothesis");
    expect(within(parent).getByTestId("research-hypothesis-latest-f")).toHaveTextContent("Refuted");
    expect(within(parent).getByTestId("research-hypothesis-latest-audit")).toHaveTextContent("Not refuted within budget — not proved");
    expect(within(child).getByTestId("research-hypothesis-latest-audit")).toHaveTextContent("Inconclusive");
    expect(screen.queryAllByTestId("research-reference")).toHaveLength(0);
    await toggle(child);
    expect(await within(child).findByText("reference-fake-hypothesis-parent")).toBeVisible();
    expect(within(child).getByText("false")).toBeVisible();
    expect(child).toHaveTextContent("not whether this meta-hypothesis is true");
    expect(within(child).getByTestId("research-hypothesis-ast")).toHaveTextContent('"op": "and"');
    expect(within(child).getByText("reference-fake-child-training-digest")).toBeVisible();
    expect(within(child).getAllByTestId("research-reference")).toHaveLength(3);
    expect(child).toHaveTextContent("Shown: 3 / Total: 65");
    expect(within(child).queryByText("reference-fake-training-64")).not.toBeInTheDocument();
    act(() => useNexusStore.setState({ language: "zh" }));
    expect(screen.getByTestId("research-claim-scope")).toHaveTextContent("新提出条件命题数");
    expect(child).toHaveTextContent("不代表此元假设已经为真");
    expect(parent).toHaveTextContent("预算内未被推翻 — 并非证明");
    await toggle(child, false);
    await waitFor(() => expect(within(child).queryAllByTestId("research-reference")).toHaveLength(0));
  });

  it("shows F/T receipt counts and targeted-sampling limits without mounting all observation references", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(referenceFakeInductionOverview())));
    render(<ResearchStation />);
    await screen.findByTestId("research-hypothesis-receipts");
    const receipts = screen.getAllByTestId("research-hypothesis-receipt");
    expect(receipts).toHaveLength(4);
    expect(screen.queryAllByTestId("research-reference")).toHaveLength(0);
    await toggle(receipts[0]);
    expect(await within(receipts[0]).findByText("conditional-falsifier-v1")).toBeVisible();
    expect(within(receipts[0]).getByText("In-scope observations").parentElement).toHaveTextContent("2");
    expect(within(receipts[0]).getByText("Out-of-scope observations").parentElement).toHaveTextContent("1");
    expect(within(receipts[0]).getByText("Oracle calls").parentElement).toHaveTextContent("3");
    expect(within(receipts[0]).getByText("Call allowance").parentElement).toHaveTextContent("24");
    expect(receipts[0]).toHaveTextContent("Contradictory observations: 1");
    expect(receipts[0]).toHaveTextContent("do not estimate population coverage");
    expect(within(receipts[0]).getAllByTestId("research-reference")).toHaveLength(7);
    expect(receipts[0]).toHaveTextContent("Excluded input digests · Shown: 3 / Total: 90");
    expect(within(receipts[0]).queryByText("reference-fake-excluded-89")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("gives historical F refutation overall priority over a later T survived-budget receipt", async () => {
    // An intentionally counterfactual read-history reference fake. This does not
    // require or claim that the backend permits scheduling T after refutation.
    const fake = referenceFakeInductionOverview();
    fake.station!.hypotheses = [fake.station!.hypotheses![0]];
    fake.station!.hypothesisEvaluations = [
      fake.station!.hypothesisEvaluations![0],
      { ...fake.station!.hypothesisEvaluations![1], samplingProtocol: "bounded-perturbation-v2" },
    ];
    const fetchMock = vi.fn(async () => response(fake));
    vi.stubGlobal("fetch", fetchMock);
    render(<ResearchStation />);
    const hypothesis = await screen.findByTestId("research-hypothesis");
    expect(hypothesis).not.toHaveAttribute("open");
    expect(within(hypothesis).getByTestId("research-hypothesis-overall")).toBeVisible();
    expect(within(hypothesis).getByTestId("research-hypothesis-overall")).toHaveTextContent("Overall record: Still refuted");
    expect(hypothesis).toHaveTextContent("The historical counterexample remains valid");
    expect(within(hypothesis).getByTestId("research-hypothesis-latest-f")).toHaveTextContent("bounded-perturbation-v1");
    expect(within(hypothesis).getByTestId("research-hypothesis-latest-audit")).toHaveTextContent("Not refuted within budget");
    expect(within(hypothesis).getByTestId("research-hypothesis-latest-audit")).toHaveTextContent("bounded-perturbation-v2");
    const receipts = screen.getAllByTestId("research-hypothesis-receipt");
    await toggle(receipts[0]);
    expect(await within(receipts[0]).findByText("bounded-perturbation-v1")).toBeVisible();
    expect(receipts[0]).toHaveTextContent("does not rerun a sampler or claim cross-version exact replay");
    expect(within(receipts[0]).getByText("Oracle calls").parentElement).toHaveTextContent("3");
    act(() => useNexusStore.setState({ language: "zh" }));
    expect(within(hypothesis).getByTestId("research-hypothesis-overall")).toHaveTextContent("整体记录: 仍已被反驳");
    expect(hypothesis).toHaveTextContent("历史反例仍有效，后续样本没有反例不能撤销该否证");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("preserves an unknown sampling protocol as warning-only read evidence without certification or resampling", async () => {
    const fake = referenceFakeInductionOverview();
    const originalReceipt = fake.station!.hypothesisEvaluations![2];
    const payload = { ...fake, station: { ...fake.station, hypothesisEvaluations: [
      ...fake.station!.hypothesisEvaluations!,
      { ...originalReceipt, samplingProtocol: "reference-fake-future-sampler-v99", seed: "reference-fake-future-seed" },
    ] } };
    const fetchMock = vi.fn(async () => response(payload));
    vi.stubGlobal("fetch", fetchMock);
    render(<ResearchStation />);
    expect(await screen.findByTestId("research-unknown-sampling-protocol")).toHaveTextContent("read-only receipt, not validated or certified by this view");
    expect(screen.getByTestId("research-unknown-sampling-protocol")).toHaveTextContent("reference-fake-future-sampler-v99");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    const child = screen.getAllByTestId("research-hypothesis")[1];
    expect(within(child).getByTestId("research-hypothesis-overall")).toHaveTextContent("Unproven");
    expect(child).toHaveTextContent("Unknown sampling protocol");
    const receipt = screen.getAllByTestId("research-hypothesis-receipt").at(-1)!;
    await toggle(receipt);
    expect(await within(receipt).findByText("reference-fake-future-seed")).toBeVisible();
    expect(within(receipt).getByText("Oracle calls").parentElement).toHaveTextContent(String(originalReceipt.calls));
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    act(() => useNexusStore.setState({ language: "zh" }));
    expect(screen.getByTestId("research-unknown-sampling-protocol")).toHaveTextContent("仅只读展示回执");
  });

  it("retains old refutations when a later bounded receipt survives and does not attach mismatched receipts", async () => {
    const fake = referenceFakeInductionOverview();
    const receipts = fake.station!.hypothesisEvaluations!;
    receipts.push({ ...receipts[1], phase: "falsification", seed: "reference-fake-later-f" });
    receipts.push({ ...receipts[2], status: "refuted", programDigest: "reference-fake-wrong-program", seed: "reference-fake-unmatched" });
    vi.stubGlobal("fetch", vi.fn(async () => response(fake)));
    render(<ResearchStation />);
    await screen.findByTestId("research-hypotheses");
    const [parent, child] = screen.getAllByTestId("research-hypothesis");
    expect(within(parent).getByTestId("research-hypothesis-latest-f")).toHaveTextContent("Not refuted within budget");
    expect(within(parent).getByTestId("research-hypothesis-refutations")).toHaveTextContent("1");
    expect(within(child).getByTestId("research-hypothesis-latest-f")).toHaveTextContent("Not refuted within budget");
    expect(within(child).getByTestId("research-hypothesis-refutations")).toHaveTextContent("0");
    expect(screen.getAllByTestId("research-hypothesis-receipt")[0]).toHaveTextContent("Refuted");
    expect(screen.getAllByTestId("research-hypothesis-receipt")).toHaveLength(6);
    expect(screen.getAllByTestId("research-hypothesis-receipt")[5]).toHaveTextContent("No matching frozen hypothesis binding in this snapshot");
  });

  it.each(["null-array", "bad-ast", "wrong-prediction-type", "oversized-ast", "bad-status", "bad-count", "bad-refs"])("rejects malformed additive hypothesis data (%s), rather than rendering fabricated evidence", async (kind) => {
    const fake = referenceFakeInductionOverview();
    const hypothesis = fake.station!.hypotheses![0];
    const receipt = fake.station!.hypothesisEvaluations![0];
    let payload: unknown;
    if (kind === "null-array") payload = { ...fake, station: { ...fake.station, hypotheses: null } };
    else if (kind === "bad-ast") payload = { ...fake, station: { ...fake.station, hypotheses: [{ ...hypothesis, program: { ...hypothesis.program, when: { op: "execute", source: "not-executable" } } }] } };
    else if (kind === "wrong-prediction-type") payload = { ...fake, station: { ...fake.station, hypotheses: [{ ...hypothesis, program: { ...hypothesis.program, expectedHolds: "false" } }] } };
    else if (kind === "oversized-ast") payload = { ...fake, station: { ...fake.station, hypotheses: [{ ...hypothesis, program: { ...hypothesis.program, when: { op: "gt", feature: "n:/" + "x".repeat(65_536), threshold: 0 } } }] } };
    else if (kind === "bad-status") payload = { ...fake, station: { ...fake.station, hypothesisEvaluations: [{ ...receipt, status: "proved" }] } };
    else if (kind === "bad-count") payload = { ...fake, station: { ...fake.station, hypothesisEvaluations: [{ ...receipt, inScope: -1 }] } };
    else payload = { ...fake, station: { ...fake.station, hypothesisEvaluations: [{ ...receipt, observationIds: [42] }] } };
    vi.stubGlobal("fetch", vi.fn(async () => response(payload)));
    render(<ResearchStation />);
    expect(await screen.findByRole("alert")).toHaveTextContent("No result has been invented");
    expect(screen.queryByTestId("research-hypotheses")).not.toBeInTheDocument();
  });

  it("limits each JSON value to 64 KiB and mounted text to 2,000 characters, not the whole overview", async () => {
    const fake = referenceFakeInductionOverview();
    fake.station!.episodes[0].observations[0].measurement.facts = { large: "x".repeat(64_000) };
    fake.station!.episodes[0].observations[1].measurement.facts = { oversized: "x".repeat(65_536) };
    fake.station!.episodes[0].observations[2].measurement.facts = { unicodeBytes: "界".repeat(24_000) };
    vi.stubGlobal("fetch", vi.fn(async () => response(fake)));
    render(<ResearchStation />);
    await screen.findByTestId("research-hypotheses");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    const episode = screen.getAllByTestId("research-episode")[0];
    await toggle(episode);
    const observations = screen.getAllByTestId("research-observation");
    expect(observations[0].querySelector("pre")!.textContent!.length).toBeLessThanOrEqual(2_001);
    expect(observations[0]).toHaveTextContent("Preview truncated");
    expect(observations[1]).toHaveTextContent("64 KiB or structural preview budget");
    expect(observations[1].querySelector("pre")).toBeNull();
    expect(observations[2]).toHaveTextContent("64 KiB or structural preview budget");
  });

  it("shows loading, then an honest null-station empty state without generating data", async () => {
    const pending = deferred<Response>();
    const fetchMock = vi.fn(() => pending.promise);
    vi.stubGlobal("fetch", fetchMock);
    render(<ResearchStation />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading research snapshot");
    expect(screen.getByRole("button", { name: "Refresh research snapshot" })).toBeDisabled();
    expect(screen.queryByTestId("research-empty")).not.toBeInTheDocument();
    await act(async () => pending.resolve(response(referenceFakeOverview(false))));
    expect(await screen.findByTestId("research-empty")).toHaveTextContent("The API returned no station");
    expect(screen.queryByTestId("research-state")).not.toBeInTheDocument();
    expect(screen.queryByTestId("research-episode")).not.toBeInTheDocument();
    expect(screen.getByTestId("research-initial-claims")).toHaveTextContent("None recorded");
    expect(screen.getByTestId("research-derived-questions")).toHaveTextContent("None recorded");
    expect(screen.getByTestId("research-new-claims")).toHaveTextContent(/^0$/);
    expect(screen.getByTestId("research-claim-scope")).toHaveTextContent("run-level counts are unavailable");
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(ENDPOINT, expect.objectContaining({ method: "GET", cache: "no-store", signal: expect.any(AbortSignal) }));
    expect(screen.getByTestId("research-freshness").querySelector("time[datetime]")).not.toBeNull();
  });

  it("projects real contract fields, origins, negative results, and budget without mutation controls", async () => {
    const fetchMock = vi.fn(async () => response(referenceFakeOverview()));
    vi.stubGlobal("fetch", fetchMock);
    render(<ResearchStation />);
    expect(await screen.findByTestId("research-state")).toHaveTextContent("reference-fake-station-not-live-evidence");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Bounded symbolic research");
    expect(screen.getByTestId("research-status")).toHaveTextContent("Paused");
    expect(screen.getByTestId("research-spent")).toHaveTextContent(/^110$/);
    expect(screen.getByTestId("research-reserved")).toHaveTextContent(/^30$/);
    expect(screen.getByTestId("research-cap")).toHaveTextContent(/^200$/);
    expect(screen.getByTestId("research-stop-reason")).toHaveTextContent("reference-fake-no-gain-limit");
    expect(screen.getByTestId("research-negative-results")).toHaveTextContent("1 / 1");
    expect(screen.getByTestId("research-initial-claims")).toHaveTextContent(/^2$/);
    expect(screen.getByTestId("research-derived-questions")).toHaveTextContent(/^1$/);
    expect(screen.getByTestId("research-new-claims")).toHaveTextContent(/^0$/);
    expect(screen.getByTestId("research-claim-scope")).toHaveTextContent("Operation rounds are not independent scientific samples");
    expect(screen.getByTestId("research-subjects")).toHaveTextContent("Known audit seed — not a discovery");
    expect(screen.getByTestId("research-subjects")).toHaveTextContent("Generated challenge — novelty unproven");
    expect(screen.getByText(/Natural new discoveries have not been demonstrated/)).toBeVisible();
    expect(screen.getByText(/Read-only observation · Research ledger persists · No city writes or deployment · External model calls: 0/)).toBeVisible();
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["Refresh research snapshot"]);
    await toggle(screen.getByTestId("research-boundary"));
    expect(screen.getByText(/not hostile-process isolation/)).toBeVisible();
    expect(screen.queryByText("reference-fake-lease-token-not-for-display")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps low-priority transfer questions in the denominator and counts retries once, not as independent samples", async () => {
    const fake = referenceFakeOverview();
    const station = fake.station!;
    const base = station.questions[0];
    station.questions.push(
      { ...base, id: "reference-fake-transfer-success", attempts: 2 },
      { ...base, id: "reference-fake-transfer-rejected" },
      { ...base, id: "reference-fake-transfer-low-priority", priority: 1, attempts: 0, status: "pending" },
      { ...base, id: "reference-fake-transfer-running", status: "running" },
      { ...base, id: "reference-fake-transfer-stopped", attempts: 2, status: "stopped" },
      { ...base, id: "reference-fake-transfer-retry", status: "pending" },
    );
    const episode = station.episodes[0];
    station.episodes.push(
      { ...episode, id: "reference-fake-success-first-attempt", questionId: "reference-fake-transfer-success", verdict: "inconclusive", observations: [] },
      { ...episode, id: "reference-fake-success-second-attempt", questionId: "reference-fake-transfer-success", verdict: "transferred", observations: [] },
      { ...episode, id: "reference-fake-rejected-episode", questionId: "reference-fake-transfer-rejected", verdict: "tool-rejected", observations: [] },
      { ...episode, id: "reference-fake-stopped-episode", questionId: "reference-fake-transfer-stopped", verdict: "inconclusive", observations: [] },
      { ...episode, id: "reference-fake-retry-episode", questionId: "reference-fake-transfer-retry", verdict: "inconclusive", observations: [] },
    );
    vi.stubGlobal("fetch", vi.fn(async () => response(fake)));
    render(<ResearchStation />);
    await screen.findByTestId("research-transfer-denominator");
    expect(screen.getByTestId("research-transfer-total")).toHaveTextContent(/^7$/);
    expect(screen.getByTestId("research-transfer-attempted")).toHaveTextContent(/^6$/);
    expect(screen.getByTestId("research-transfer-succeeded")).toHaveTextContent(/^1$/);
    expect(screen.getByTestId("research-transfer-rejected")).toHaveTextContent(/^1$/);
    expect(screen.getByTestId("research-transfer-pending")).toHaveTextContent(/^3$/);
    expect(screen.getByTestId("research-transfer-no-gain")).toHaveTextContent(/^1$/);
    expect(screen.getByTestId("research-transfer-stopped")).toHaveTextContent(/^1$/);
    expect(screen.getByTestId("research-transfer-denominator")).toHaveTextContent("including low-priority questions");
    expect(screen.getByTestId("research-initial-claims")).toHaveTextContent(/^2$/);
    expect(screen.getByTestId("research-derived-questions")).toHaveTextContent(/^7$/);
    expect(screen.getByTestId("research-new-claims")).toHaveTextContent(/^0$/);
    act(() => useNexusStore.setState({ language: "zh" }));
    expect(screen.getByTestId("research-claim-scope")).toHaveTextContent("操作轮次不等于独立科学样本数");
    expect(screen.getByTestId("research-transfer-denominator")).toHaveTextContent("包括低优先级问题");
  });

  it("mounts only three observation previews on expansion and preserves total, facts, and causal provenance", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(referenceFakeOverview())));
    render(<ResearchStation />);
    const episode = await screen.findByTestId("research-episode");
    expect(episode).toHaveTextContent("Observations: 105");
    expect(screen.queryAllByTestId("research-observation")).toHaveLength(0);
    await toggle(episode);
    await waitFor(() => expect(screen.getAllByTestId("research-observation")).toHaveLength(3));
    expect(within(episode).getByText("reference-fake-parent-episode")).toBeVisible();
    expect(within(episode).getByText("reference-fake-parent-observation")).toBeVisible();
    expect(within(episode).getByText("reference-fake-previous-digest")).toBeVisible();
    expect(episode).toHaveTextContent("generated-challenge");
    expect(episode).toHaveTextContent("reference-fake-family-b");
    expect(screen.getByTestId("research-observation-preview")).toHaveTextContent("Shown: 3 / Total: 105");
    expect(screen.getByText(/"result": "reference-fake-fact-0"/)).toBeVisible();
    expect(screen.queryByText("reference-fake-observation-3")).not.toBeInTheDocument();
    expect(screen.queryByText("reference-fake-observation-104")).not.toBeInTheDocument();
    await toggle(episode, false);
    await waitFor(() => expect(screen.queryAllByTestId("research-observation")).toHaveLength(0));
  });

  it("caps large fact previews and reports missing provenance instead of inventing a parent", async () => {
    const fake = referenceFakeOverview();
    fake.station!.questions = [];
    fake.station!.episodes[0].observations[0].measurement.facts = { longValue: "x".repeat(5000) + "not-in-preview" };
    vi.stubGlobal("fetch", vi.fn(async () => response(fake)));
    render(<ResearchStation />);
    const episode = await screen.findByTestId("research-episode");
    await toggle(episode);
    expect(await within(episode).findByText("Question provenance unavailable in this snapshot")).toBeVisible();
    expect(within(episode).getByText("Preview truncated")).toBeVisible();
    const facts = screen.getAllByTestId("research-observation")[0].querySelector("pre")!;
    expect(facts.textContent!.length).toBeLessThanOrEqual(2001);
    expect(facts).not.toHaveTextContent("not-in-preview");
  });

  it("exposes tool AST, digest, generated source, cross-family reuse, and refuted lessons as inspection only", async () => {
    const fake = referenceFakeOverview();
    vi.stubGlobal("fetch", vi.fn(async () => response(fake)));
    render(<ResearchStation />);
    const tool = await screen.findByTestId("research-tool");
    expect(tool).toHaveTextContent("Cross-family reuse targets: 1");
    await toggle(tool);
    expect(await within(tool).findAllByText(fake.station!.tools[0].digest)).toHaveLength(2);
    expect(within(tool).getByText("reference-fake-verifier-v1")).toBeVisible();
    expect(screen.getByTestId("research-reduced-input")).toHaveTextContent("Exact reduced input · bounded preview");
    expect(screen.getByTestId("research-reduced-input").querySelector("pre")).toHaveTextContent("[ 1 ]");
    expect(screen.getByTestId("research-tool-source")).toHaveTextContent("reference fake generated reducer source; inspection only");
    expect(tool).toHaveTextContent("nexus.counterexample-reducer.v1");
    expect(tool).toHaveTextContent("reference-fake-family-a");
    expect(tool).toHaveTextContent("reference-fake-family-b");
    expect(tool).toHaveTextContent("Different family");
    expect(tool).toHaveTextContent("Non-counterexample control rejected");
    const lesson = screen.getByTestId("research-lesson");
    expect(lesson).toHaveTextContent("Reported status: refuted");
    await toggle(lesson);
    expect(await within(lesson).findByText("reference-fake-earlier-lesson")).toBeVisible();
    expect(lesson).toHaveTextContent("reference-fake-observation-0");
  });

  it("preserves a legacy confirmed note as reported text, never a conditional-law certificate or execution authority", async () => {
    const fake = referenceFakeOverview();
    const legacy = fake.station!.lessons[0];
    legacy.kind = "confirmation";
    legacy.status = "confirmed";
    legacy.statement = {
      en: "Reference fake legacy text claims a new conditional law is certified.",
      zh: "参考假数据历史文本声称新条件定律已获认证。",
    };
    const fetchMock = vi.fn(async () => response(fake));
    vi.stubGlobal("fetch", fetchMock);
    render(<ResearchStation />);
    const lesson = await screen.findByTestId("research-lesson");
    expect(lesson).not.toHaveAttribute("open");
    expect(within(lesson).getByTestId("research-lesson-boundary")).toHaveTextContent("Reported note — not an independent scientific certificate");
    expect(within(lesson).getByTestId("research-lesson-status")).toHaveTextContent(/^Reported status: confirmed$/);
    expect(within(lesson).getByText(legacy.statement.en)).toBeVisible();
    expect(lesson.querySelector(".text-cyber-green")).toBeNull();
    expect(within(lesson).queryByText("Certified", { exact: true })).not.toBeInTheDocument();
    expect(screen.getByTestId("research-lessons")).toHaveTextContent("raw observations and formal tool / hypothesis evaluation receipts");
    expect(screen.getByTestId("research-new-claims")).toHaveTextContent(/^0$/);
    await toggle(lesson);
    expect(await within(lesson).findByText(legacy.episodeId)).toBeVisible();
    expect(lesson).toHaveTextContent(legacy.evidenceIds[0]);
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["Refresh research snapshot"]);
    act(() => useNexusStore.setState({ language: "zh" }));
    expect(within(lesson).getByTestId("research-lesson-boundary")).toHaveTextContent("候选/历史记录，不是独立科学证书");
    expect(within(lesson).getByTestId("research-lesson-status")).toHaveTextContent(/^记录状态: confirmed$/);
    expect(within(lesson).getByText(legacy.statement.zh)).toBeVisible();
    expect(screen.getByTestId("research-lessons")).toHaveTextContent("不能认证新条件定律，也不能授权行动");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(legacy.status).toBe("confirmed");
  });

  it("does not count missing family provenance as cross-family reuse", async () => {
    const fake = referenceFakeOverview();
    fake.subjects = fake.subjects.slice(0, 1);
    vi.stubGlobal("fetch", vi.fn(async () => response(fake)));
    render(<ResearchStation />);
    const tool = await screen.findByTestId("research-tool");
    expect(tool).toHaveTextContent("Cross-family reuse targets: 0");
    await toggle(tool);
    expect(await within(tool).findByText(/Family not reported; cross-family reuse unproven/)).toBeVisible();
  });

  it("switches labels and localized records to Chinese without refetching", async () => {
    const fetchMock = vi.fn(async () => response(referenceFakeOverview()));
    vi.stubGlobal("fetch", fetchMock);
    render(<ResearchStation />);
    await screen.findByTestId("research-state");
    act(() => useNexusStore.setState({ language: "zh" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("研究站 · 有界符号研究");
    expect(screen.getByRole("button", { name: "刷新研究快照" })).toBeVisible();
    expect(screen.getByTestId("research-questions")).toHaveTextContent("参考假数据：后续问题");
    expect(screen.getByTestId("research-lessons")).toHaveTextContent("参考假数据：假设已被否证");
    expect(screen.getByTestId("research-subjects")).toHaveTextContent("已知审计种子 — 不是新发现");
    expect(screen.getByTestId("research-budget")).toHaveTextContent("已花费 / 已预留 / 上限");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retains a stale snapshot and last successful timestamp throughout refresh failure, then recovers", async () => {
    const pending = deferred<Response>();
    const updated = referenceFakeOverview();
    updated.station!.revision = 8;
    updated.generatedAt = "2026-10-20T12:02:00.000Z";
    const fetchMock = vi.fn().mockResolvedValueOnce(response(referenceFakeOverview())).mockReturnValueOnce(pending.promise).mockResolvedValueOnce(response(updated));
    vi.stubGlobal("fetch", fetchMock);
    render(<ResearchStation />);
    await screen.findByTestId("research-state");
    const successTime = screen.getByTestId("research-freshness").querySelector("time")!.dateTime;
    fireEvent.click(screen.getByRole("button", { name: "Refresh research snapshot" }));
    expect(screen.getByRole("status")).toHaveTextContent("previous snapshot remains visible");
    expect(screen.getByTestId("research-revision")).toHaveTextContent(/^7$/);
    await act(async () => pending.resolve(response({ error: "reference-fake-outage" }, 503)));
    expect(await screen.findByRole("alert")).toHaveTextContent("Stale snapshot");
    expect(screen.getByTestId("research-revision")).toHaveTextContent(/^7$/);
    expect(screen.getByTestId("research-freshness").querySelector("time")!.dateTime).toBe(successTime);
    fireEvent.click(screen.getByRole("button", { name: "Refresh research snapshot" }));
    await waitFor(() => expect(screen.getByTestId("research-revision")).toHaveTextContent(/^8$/));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByTestId("research-freshness")).toHaveTextContent(updated.generatedAt);
    expect(fetchMock.mock.calls.every(([url, init]) => url === ENDPOINT && init.method === "GET")).toBe(true);
  });

  it.each(["http", "network", "json", "contract"])("reports %s failure as an error, not an empty successful station", async (kind) => {
    const fetchMock = vi.fn(async () => {
      if (kind === "network") throw new Error("reference-fake-network-error");
      if (kind === "json") return { ok: true, json: async () => { throw new Error("reference-fake-invalid-json"); } } as unknown as Response;
      return kind === "http" ? response({ error: "reference-fake-unavailable" }, 503) : response({ station: null });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ResearchStation />);
    expect(await screen.findByRole("alert")).toHaveTextContent("No result has been invented");
    expect(screen.queryByTestId("research-empty")).not.toBeInTheDocument();
    expect(screen.queryByTestId("research-state")).not.toBeInTheDocument();
    expect(screen.getByTestId("research-freshness")).toHaveTextContent("No successful read yet");
    expect(screen.getByRole("button", { name: "Refresh research snapshot" })).toBeEnabled();
  });

  it("aborts in-flight reads on unmount and ignores a late reference-fake response", async () => {
    const pending = deferred<Response>();
    const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(() => pending.promise);
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<ResearchStation />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const signal = fetchMock.mock.calls[0][1].signal!;
    expect(signal.aborted).toBe(false);
    view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve(response(referenceFakeOverview())));
    expect(screen.queryByTestId("research-station")).not.toBeInTheDocument();
  });

  it("ignores a late aborted response after StrictMode remount and cancels redundant initial reads", async () => {
    const oldRequest = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValueOnce(oldRequest.promise).mockResolvedValueOnce(response(referenceFakeOverview(false)));
    vi.stubGlobal("fetch", fetchMock);
    const initial = render(<ResearchStation />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    initial.unmount();
    render(<StrictMode><ResearchStation /></StrictMode>);
    expect(await screen.findByTestId("research-empty")).toBeVisible();
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => oldRequest.resolve(response(referenceFakeOverview())));
    expect(screen.getByTestId("research-empty")).toBeVisible();
    expect(screen.queryByTestId("research-state")).not.toBeInTheDocument();
  });
});

describe("Research understanding and automatic read lifecycle", () => {
  it("maps the briefing to recorded question, catalogue and episode, not legacy lesson assertions", async () => {
    const fake = referenceFakeOverview();
    fake.station!.status = "running";
    fake.station!.questions[0].status = "pending";
    fake.station!.lessons[0].statement.en = "UNTRUSTED NOTE: universal law proved";
    fake.runtime = { releaseRevision: "reference-fake-release", evidence: "deployment-env", lastEpisodeAt: observedAt };
    fake.generatedAt = "2026-10-23T00:00:00.000Z";
    vi.stubGlobal("fetch", vi.fn(async () => response(fake)));
    render(<ResearchStation />);
    await screen.findByTestId("research-state");
    const briefing = screen.getByTestId("research-briefing");
    expect(briefing).toHaveTextContent("Reference fake follow-up question");
    expect(briefing).toHaveTextContent("Reference fake exploratory claim");
    expect(briefing).toHaveTextContent("reference-fake-follow-up-reason");
    expect(briefing).toHaveTextContent("reference-fake-parent-episode");
    expect(briefing).toHaveTextContent("No change / no gain");
    expect(briefing).not.toHaveTextContent("UNTRUSTED NOTE");
    expect(briefing).not.toHaveTextContent(fake.generatedAt);
    expect(briefing).toHaveTextContent(observedAt);
    expect(screen.getByTestId("research-status")).toHaveTextContent("Running");
    expect(screen.getByTestId("research-worker-boundary")).toHaveTextContent("not an OS worker heartbeat");
    expect(screen.getByTestId("research-runtime")).toHaveTextContent("not an independent deployment attestation");
    expect(screen.getByTestId("research-runtime")).toHaveTextContent("reference-fake-release");
    expect(screen.getByTestId("research-freshness")).toHaveTextContent("not claim-evidence timestamps");
    expect(within(briefing).getByRole("link", { name: "Share research page" })).toHaveAttribute("href", "/research");
    act(() => useNexusStore.setState({ language: "zh" }));
    expect(briefing).toHaveTextContent("现在研究什么");
    expect(briefing).toHaveTextContent("为什么选择下一步");
    expect(screen.getByTestId("research-worker-boundary")).toHaveTextContent("不是操作系统 worker 心跳");
  });

  it("shows a finite 800-call / 40-episode ending honestly even if the ledger still says running", async () => {
    const fake = referenceFakeOverview();
    const station = fake.station!;
    station.status = "running";
    station.policy.maxOracleCalls = 800;
    station.policy.maxEpisodes = 40;
    station.budget.spentCalls = 800;
    station.budget.reservedCalls = 0;
    station.stopReason = null;
    station.episodes = Array.from({ length: 40 }, (_, index) => ({ ...station.episodes[0], id: `reference-fake-finite-${index}`, observations: [] }));
    fake.runtime = { releaseRevision: null, evidence: "local-unbound", lastEpisodeAt: observedAt };
    vi.stubGlobal("fetch", vi.fn(async () => response(fake)));
    render(<ResearchStation />);
    await screen.findByTestId("research-state");
    expect(screen.getByTestId("research-briefing-budget")).toHaveTextContent("800 / 800");
    expect(screen.getByTestId("research-briefing-budget")).toHaveTextContent("40 / 40");
    expect(screen.getByTestId("research-briefing-budget")).toHaveTextContent("A finite limit has been reached");
    expect(screen.getByTestId("research-stop-reason")).toHaveTextContent("No stop reason recorded");
    expect(screen.getByTestId("research-runtime")).toHaveTextContent("not deployment evidence");
  });

  it("refreshes every 30 seconds, never overlaps, and retains an old snapshot through automatic 503", async () => {
    vi.useFakeTimers();
    const pending = deferred<Response>();
    const fetchMock = vi.fn().mockResolvedValueOnce(response(referenceFakeOverview())).mockReturnValueOnce(pending.promise).mockResolvedValueOnce(response(referenceFakeOverview(false)));
    vi.stubGlobal("fetch", fetchMock);
    render(<ResearchStation />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const readTime = screen.getByTestId("research-freshness").querySelector("time")!.dateTime;
    await act(async () => { await vi.advanceTimersByTimeAsync(29_999); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Refresh research snapshot" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => pending.resolve(response({}, 503)));
    expect(within(screen.getByTestId("research-freshness")).getByRole("alert")).toHaveTextContent("Stale snapshot");
    expect(screen.getByTestId("research-freshness").querySelector("time")!.dateTime).toBe(readTime);
    expect(screen.getByTestId("research-revision")).toHaveTextContent("7");
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId("research-empty")).toBeInTheDocument();
    expect(fetchMock.mock.calls.every(([url, init]) => url === ENDPOINT && init.method === "GET")).toBe(true);
  });

  it("pauses while hidden, aborts in-flight reads, ignores late data and cancels all timers on unmount", async () => {
    vi.useFakeTimers();
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    const pending = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValueOnce(response(referenceFakeOverview(false)));
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<ResearchStation />);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(fetchMock).not.toHaveBeenCalled();
    visibility.mockReturnValue("visible");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    visibility.mockReturnValue("hidden");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    visibility.mockReturnValue("visible");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(response(referenceFakeOverview())));
    expect(screen.queryByTestId("research-state")).not.toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(screen.getByTestId("research-empty")).toBeInTheDocument();
    view.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

function referenceFakeArchive(state: "pending" | "archived" = "archived"): CityArchiveManifest {
  return {
    schemaVersion: "nexus.city-archive.v1", state, capturedAt: observedAt, stoppedAt: "2026-10-20T11:59:00.000Z", releaseRevision: "reference-fake-city-revision",
    turn: 24, simulationDate: "2026-01-02", fingerprint: "reference-fake-city-fingerprint", reason: { en: "Reference fake capture reason", zh: "参考假数据捕获原因" },
    trustSummary: { observedDays: 3.5, requiredDays: 90, status: "reference-fake-incomplete-retired" },
    artifacts: [{ label: { en: "Reference fake original report", zh: "参考假数据原始报告" }, href: "/data/reference-fake-report.json", sha256: "a".repeat(64) }],
  };
}

describe("Static city archive — explicit reference fakes, not retirement evidence", () => {
  it.each([404, 503])("does not claim retirement when the manifest returns %s", async (status) => {
    const fetchMock = vi.fn(async () => response({}, status));
    vi.stubGlobal("fetch", fetchMock);
    render(<CityArchive />);
    await waitFor(() => expect(screen.getByTestId("city-archive-status")).toHaveTextContent("Completed retirement has not been verified"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/data/city-archive.json", expect.objectContaining({ method: "GET", signal: expect.any(AbortSignal) }));
  });

  it("keeps pending capture and incomplete archived records explicitly unfinished", async () => {
    const fake = referenceFakeArchive("pending");
    fake.capturedAt = null;
    fake.stoppedAt = null;
    fake.artifacts = [];
    vi.stubGlobal("fetch", vi.fn(async () => response(fake)));
    render(<CityArchive />);
    await waitFor(() => expect(screen.getByTestId("city-archive-status")).toHaveTextContent("not complete"));
    expect(screen.getByTestId("city-archive-status")).not.toHaveTextContent("records a stopped city");
    expect(hasCompletedCityArchive({ ...fake, state: "archived" })).toBe(false);
  });

  it("shows original capture dates, artifacts and unpassed 90-day boundaries in both languages, with no city fetch", async () => {
    const fake = referenceFakeArchive();
    const fetchMock = vi.fn(async () => response(fake));
    vi.stubGlobal("fetch", fetchMock);
    render(<ResearchShell fixedView="city-archive" />);
    await waitFor(() => expect(screen.getByTestId("city-archive-status")).toHaveTextContent("records a stopped city"));
    expect(screen.getByTestId("city-archive")).toHaveTextContent(observedAt);
    expect(screen.getByTestId("city-archive-trust")).toHaveTextContent("3.5 / 90");
    expect(screen.getByTestId("city-archive-trust")).toHaveTextContent("does not mean it passed");
    expect(screen.getByRole("link", { name: "Reference fake original report" })).toHaveAttribute("href", fake.artifacts[0].href);
    expect(screen.getByText("Read-only historical archive").closest("header")).toBeInTheDocument();
    expect(useCitySimulationMock).not.toHaveBeenCalledWith(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    act(() => useNexusStore.setState({ language: "zh" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("历史城市档案");
    expect(screen.getByTestId("city-archive-trust")).toHaveTextContent("退役旧 90 天轨道不等于通过");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(["javascript:alert(1)", "//untrusted.example/report", "data:text/html,bad", "/\\\\untrusted.example/report", "https://user:password@example.com/report"])("rejects unsafe artifact links: %s", (href) => {
    const fake = referenceFakeArchive();
    fake.artifacts[0].href = href;
    expect(parseCityArchive(fake)).toBeNull();
  });

  it("rejects malformed schema, dates, day denominator and digests instead of generating substitute evidence", () => {
    const fake = referenceFakeArchive();
    expect(parseCityArchive({ ...fake, schemaVersion: "unsupported" })).toBeNull();
    expect(parseCityArchive({ ...fake, capturedAt: "yesterday" })).toBeNull();
    expect(parseCityArchive({ ...fake, trustSummary: { ...fake.trustSummary, requiredDays: 3 } })).toBeNull();
    expect(parseCityArchive({ ...fake, artifacts: [{ ...fake.artifacts[0], sha256: "not-a-checksum" }] })).toBeNull();
    expect(parseCityArchive(fake)).toEqual(fake);
  });
});

describe("Research Station shell", () => {
  it("names research observation and omits legacy city clock, speed, notifications, and simulation controls", () => {
    render(<Topbar onOpenMenu={vi.fn()} themeReady />);
    expect(screen.getByText("Research observation")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /simulation/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "1x" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open notifications" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Citizens|DAY \d/)).not.toBeInTheDocument();
    act(() => useNexusStore.setState({ language: "zh" }));
    expect(screen.getByText("研究观测")).toBeInTheDocument();
  });

  it("defaults to research with collapsed legacy views and a permanent city archive entry", async () => {
    expect(useNexusStore.getInitialState().activeView).toBe("research");
    const onClose = vi.fn();
    render(<Sidebar mobileOpen onClose={onClose} themeReady />);
    expect(screen.getByText("Counterexample-driven research station")).toBeVisible();
    expect(screen.getByRole("navigation").querySelector("button")).toHaveTextContent("Research Station");
    expect(screen.getByRole("button", { name: "Research Station" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Historical city archive" })).toHaveAttribute("href", "/archive/city");
    const legacy = screen.getByTestId("legacy-navigation");
    expect(legacy).not.toHaveAttribute("open");
    await toggle(legacy);
    fireEvent.click(screen.getByRole("button", { name: "Human Observatory" }));
    expect(useNexusStore.getState().activeView).toBe("symbiosis");
    fireEvent.click(screen.getByRole("button", { name: "EVOLUTION LOG" }));
    expect(useNexusStore.getState().activeView).toBe("evolution");
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it.each(["/", "/?view=unknown", "/?view=__proto__"])("uses real research default/fallback at %s without starting the local city", async (path) => {
    window.history.replaceState(null, "", path);
    vi.stubGlobal("fetch", vi.fn(async () => response(referenceFakeOverview(false))));
    render(<ResearchShell />);
    expect(await screen.findByTestId("research-empty")).toBeInTheDocument();
    expect(useCitySimulationMock).toHaveBeenCalledWith(false);
    expect(useCitySimulationMock).not.toHaveBeenCalledWith(true);
  });

  it("honors an explicit legacy query rather than faking the old home default", () => {
    window.history.replaceState(null, "", "/?view=neural");
    render(<ResearchShell />);
    expect(screen.queryByTestId("research-station")).not.toBeInTheDocument();
    expect(useCitySimulationMock).toHaveBeenCalledWith(true);
  });

  it("keeps the share route research-only despite an earlier legacy selection", async () => {
    useNexusStore.setState({ activeView: "dashboard" });
    vi.stubGlobal("fetch", vi.fn(async () => response(referenceFakeOverview(false))));
    render(<ResearchShell fixedView="research" />);
    expect(await screen.findByTestId("research-empty")).toBeInTheDocument();
    expect(useCitySimulationMock).not.toHaveBeenCalledWith(true);
  });
});
