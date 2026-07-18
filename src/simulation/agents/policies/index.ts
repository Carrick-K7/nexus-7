import type { AgentPolicy } from "../types";
import { atlasPolicy } from "./atlas";
import { civitasPolicy } from "./civitas";
import { economicaPolicy } from "./economica";
import { spectrePolicy } from "./spectre";

export const AGENT_POLICIES: AgentPolicy[] = [
  atlasPolicy,
  economicaPolicy,
  civitasPolicy,
  spectrePolicy,
];

export {
  atlasPolicy,
  civitasPolicy,
  economicaPolicy,
  spectrePolicy,
};
