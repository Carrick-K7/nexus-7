// @vitest-environment node

import {
  readFileSync,
} from "node:fs";
import path from "node:path";
import {
  describe,
  expect,
  it,
} from "vitest";

function workflow(name: string): string {
  return readFileSync(
    path.join(process.cwd(), ".github/workflows", name),
    "utf8",
  );
}

describe("independent symbiosis replication workflow", () => {
  it("reproduces, compares and attests the frozen bundle without a model key", () => {
    const source = workflow("symbiosis-replication.yml");

    expect(source).toContain("name: Symbiosis replication");
    expect(source).toContain("branches: [main]");
    expect(source).not.toContain("pull_request:");
    expect(source).toContain("ref: v4.7.0");
    expect(source.match(/npm run verify:v47/g)).toHaveLength(2);
    expect(source).toContain("cmp --silent");
    expect(source).toContain("name: nexus-symbiosis-replication");
    expect(source).toContain("uses: actions/attest@v4");
    expect(source).not.toMatch(/OPENAI|DEEPSEEK|API_KEY/);
  });

  it("issues receipts only for non-PR runs and trusts the dedicated signer", () => {
    const source = workflow("evidence-receipts.yml");

    expect(source).toContain("- Symbiosis replication");
    expect(source).toContain(
      "github.event.workflow_run.event != 'pull_request'",
    );
    expect(source).toContain(
      "ref: ${{ github.event.repository.default_branch }}",
    );
    expect(source).not.toContain(
      "ref: ${{ github.event.workflow_run.head_sha }}",
    );
    expect(source).toContain("--name nexus-symbiosis-replication");
    expect(source).toContain(
      "/.github/workflows/symbiosis-replication.yml",
    );
    expect(source).toContain("name: Receipt configuration");
    expect(source).toContain(
      "needs: configuration\n    if: needs.configuration.outputs.configured == 'true'",
    );
    expect(source).toContain(
      "Receipt signing is pending human key configuration; no receipt was issued.",
    );
  });

  it("keeps an absent human receipt key pending in both follower workflows", () => {
    for (const name of [
      "evidence-receipts.yml",
      "promotion-receipt.yml",
    ]) {
      const source = workflow(name);
      expect(source).toContain(
        "configured: ${{ steps.receipt-key.outputs.configured }}",
      );
      expect(source).toContain(
        "RECEIPT_KEY: ${{ secrets.NEXUS_ATTESTATION_RECEIPT_PRIVATE_KEY_BASE64 }}",
      );
      expect(source).toContain(
        "if: needs.configuration.outputs.configured == 'true'",
      );
      expect(source).not.toContain("continue-on-error");
    }
  });

  it("keeps the explicit deployment signer override aligned with every producer", () => {
    const source = readFileSync(
      path.join(process.cwd(), ".env.example"),
      "utf8",
    );
    const configured = source
      .split("\n")
      .find((line) =>
        line.startsWith("SYMBIOSIS_TRUSTED_SIGNER_WORKFLOWS="),
      );

    expect(configured).toBeDefined();
    for (const signer of [
      "/.github/workflows/ci.yml",
      "/.github/workflows/symbiosis-replication.yml",
      "/.github/workflows/operations-drills.yml",
      "/.github/workflows/symbiosis-offhost-recovery.yml",
    ]) {
      expect(configured).toContain(signer);
    }
  });
});
