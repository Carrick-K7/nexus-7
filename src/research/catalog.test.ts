// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { RESEARCH_SUBJECTS, researchSubject } from "./catalog";
import { assertResearchJson, researchDigest } from "./integrity";

describe("isolated original-code research instruments", () => {
  it("uses legal bounded generated inputs and reproducible observations without network", async () => {
    const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network forbidden"));
    try {
      for (const subject of RESEARCH_SUBJECTS) {
        const input = subject.generate("catalog-confirmation-2026");
        expect(subject.valid(input), subject.id).toBe(true);
        assertResearchJson(input);
        const first = await subject.measure(input);
        const second = await subject.measure(input);
        assertResearchJson(first);
        expect(researchDigest(first), subject.id).toBe(researchDigest(second));
      }
      expect(network).not.toHaveBeenCalled();
    } finally { network.mockRestore(); }
  }, 60_000);

  it("keeps audit seeds, exploratory hypotheses and healthy controls distinct", async () => {
    for (const id of ["campaign-content-identity", "season-calendar-continuity", "zero-budget-no-dispatch"]) {
      const subject = researchSubject(id);
      expect(subject.origin).toBe("known-audit-seed");
      expect((await subject.measure(subject.generate("known-seed"))).holds).toBe(false);
    }
    const healthy = researchSubject("integer-sum-control");
    expect((await healthy.measure(healthy.generate("held-control"))).holds).toBe(true);
    const numeric = researchSubject("sum-grouping-hypothesis");
    expect(numeric.origin).toBe("generated-challenge");
    expect(numeric.interpretation).toBe("exploratory-hypothesis");
    expect((await numeric.measure(numeric.generate("numeric"))).holds).toBe(false);
  }, 60_000);

  it("rejects malformed or over-budget instrument inputs instead of manufacturing failures", () => {
    for (const subject of RESEARCH_SUBJECTS) {
      expect(subject.valid(null), subject.id).toBe(false);
      expect(subject.valid({ turns: 100_000, seed: "x", label: "y" }), subject.id).toBe(false);
    }
    expect(() => researchSubject("execute-shell")).toThrow();
  });
});
