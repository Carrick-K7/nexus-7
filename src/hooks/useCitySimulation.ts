"use client";

import { useEffect } from "react";
import { useNexusStore } from "@/stores/nexus-store";

export function useCitySimulation() {
  const status = useNexusStore((state) => state.simulation.status);
  const speed = useNexusStore((state) => state.gameTime.speed);
  const advanceSimulation = useNexusStore(
    (state) => state.advanceSimulation,
  );

  useEffect(() => {
    if (status !== "running") {
      return;
    }

    const interval = window.setInterval(
      advanceSimulation,
      1000 / speed,
    );

    return () => window.clearInterval(interval);
  }, [advanceSimulation, speed, status]);
}
