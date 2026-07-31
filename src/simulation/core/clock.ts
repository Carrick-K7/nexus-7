import type { SimulationClock } from "../types";

export function advanceClock(
  clock: SimulationClock,
  minutes: number,
): SimulationClock {
  const totalMinutes = clock.totalMinutes + minutes;
  const elapsedDays = Math.floor(totalMinutes / 1440);
  const minuteOfDay = totalMinutes % 1440;

  return {
    day: elapsedDays + 1,
    hour: Math.floor(minuteOfDay / 60),
    minute: minuteOfDay % 60,
    totalMinutes,
  };
}
