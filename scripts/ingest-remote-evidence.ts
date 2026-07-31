import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  isRemoteEvidenceReceipt,
} from "../src/evidence";

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

async function githubOidcToken(audience: string): Promise<string> {
  const requestUrl = new URL(
    required(
      process.env.ACTIONS_ID_TOKEN_REQUEST_URL,
      "ACTIONS_ID_TOKEN_REQUEST_URL",
    ),
  );
  requestUrl.searchParams.set("audience", audience);
  const response = await fetch(requestUrl, {
    headers: {
      Authorization: `Bearer ${required(
        process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN,
        "ACTIONS_ID_TOKEN_REQUEST_TOKEN",
      )}`,
    },
  });
  const payload = (await response.json()) as {
    value?: string;
    message?: string;
  };
  if (!response.ok || !payload.value) {
    throw new Error(
      payload.message ??
        `GitHub OIDC token request failed with ${response.status}`,
    );
  }
  return payload.value;
}

async function main(): Promise<void> {
  const receiptPath = path.resolve(
    process.cwd(),
    required(process.argv[2], "receipt path"),
  );
  const baseUrl = required(
    process.env.NEXUS_GOVERNANCE_BASE_URL,
    "NEXUS_GOVERNANCE_BASE_URL",
  ).replace(/\/$/, "");
  const receipt: unknown = JSON.parse(
    await fs.readFile(receiptPath, "utf8"),
  );
  if (!isRemoteEvidenceReceipt(receipt)) {
    throw new Error("Receipt is not a valid remote evidence envelope");
  }
  const token = await githubOidcToken(
    process.env.NEXUS_OIDC_AUDIENCE ?? "nexus-7",
  );
  const response = await fetch(
    `${baseUrl}/api/governance/evidence`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ receipt }),
    },
  );
  const payload = (await response.json()) as {
    id?: string;
    error?: string;
  };
  if (!response.ok) {
    throw new Error(
      payload.error ??
        `Evidence ingestion failed with ${response.status}`,
    );
  }
  console.log(
    JSON.stringify({
      event: "remote-evidence.ingested",
      recordId: payload.id,
      kind: receipt.payload.kind,
      runId: receipt.payload.runId,
    }),
  );
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
