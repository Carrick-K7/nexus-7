import {
  HttpDeploymentAdapter,
} from "./http-adapter";
import {
  InMemoryDeploymentAdapter,
} from "./memory-adapter";
import type {
  DeploymentAdapter,
} from "./types";

let developmentAdapter: InMemoryDeploymentAdapter | undefined;

export function getDeploymentAdapterFromEnvironment(): DeploymentAdapter {
  if (process.env.NEXUS_DEPLOYMENT_ADAPTER === "http") {
    const baseUrl = process.env.NEXUS_DEPLOYMENT_BASE_URL;
    const token = process.env.NEXUS_DEPLOYMENT_TOKEN;
    if (!baseUrl || !token) {
      throw new Error(
        "HTTP deployment adapter requires NEXUS_DEPLOYMENT_BASE_URL and NEXUS_DEPLOYMENT_TOKEN",
      );
    }
    return new HttpDeploymentAdapter({ baseUrl, token });
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Production external release canaries require NEXUS_DEPLOYMENT_ADAPTER=http",
    );
  }
  developmentAdapter ??= new InMemoryDeploymentAdapter();
  return developmentAdapter;
}
