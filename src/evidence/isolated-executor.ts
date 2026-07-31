import path from "node:path";

export type IsolatedEvaluationProfile = "smoke" | "quality";

const PROFILE_COMMANDS: Record<IsolatedEvaluationProfile, string> = {
  smoke:
    "npm run test:run -- src/simulation/simulation.test.ts src/auth/oidc.test.ts",
  quality:
    "npm run lint -- --max-warnings=0 && npm run test:run && npm run verify:model && npm run build",
};

export const ISOLATED_EVALUATION_IMAGE =
  "node:24.15.0-bookworm-slim@sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d";

export function isolatedEvaluationArguments(
  root: string,
  profile: IsolatedEvaluationProfile,
): string[] {
  const source = path.resolve(root);
  const command = [
    "set -eu",
    "tar -C /source --exclude=.git --exclude=.next --exclude=backups --exclude=.artifacts -cf - . | tar --no-same-owner -C /workspace -xf -",
    "cd /workspace",
    PROFILE_COMMANDS[profile],
  ].join("\n");
  return [
    "run",
    "--rm",
    "--network",
    "none",
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--pids-limit",
    "512",
    "--memory",
    "4g",
    "--cpus",
    "2",
    "--tmpfs",
    "/workspace:rw,exec,nosuid,nodev,size=3g,mode=1777",
    "--tmpfs",
    "/tmp:rw,exec,nosuid,nodev,size=512m,mode=1777",
    "--mount",
    `type=bind,source=${source},target=/source,readonly`,
    "--env",
    "CI=1",
    "--env",
    "HOME=/tmp",
    "--env",
    "NEXT_TELEMETRY_DISABLED=1",
    "--workdir",
    "/workspace",
    ISOLATED_EVALUATION_IMAGE,
    "sh",
    "-lc",
    command,
  ];
}
