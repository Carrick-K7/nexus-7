"use client";

import { useEffect } from "react";
import { useNexusStore } from "@/stores/nexus-store";

export function useCitySimulation(enabled = true) {
  const status = useNexusStore((state) => state.simulation.status);
  const speed = useNexusStore((state) => state.gameTime.speed);
  const advanceSimulation = useNexusStore(
    (state) => state.advanceSimulation,
  );

  useEffect(() => {
    if (!enabled || status !== "running") {
      return;
    }

    const interval = window.setInterval(
      advanceSimulation,
      1000 / speed,
    );

    return () => window.clearInterval(interval);
  }, [advanceSimulation, enabled, speed, status]);
}
