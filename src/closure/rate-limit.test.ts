// @vitest-environment node

import {
  describe,
  expect,
  it,
} from "vitest";
import {
  FixedWindowRateLimiter,
} from "./rate-limit";

describe("closed-loop API rate limiter", () => {
  it("isolates buckets and resets after the fixed window", () => {
    const limiter = new FixedWindowRateLimiter(1_000);
    const start = new Date("2026-07-18T18:00:00.000Z");
    expect(limiter.consume("workspace:a", 2, start)).toMatchObject({
      allowed: true,
      remaining: 1,
    });
    expect(limiter.consume("workspace:a", 2, start)).toMatchObject({
      allowed: true,
      remaining: 0,
    });
    expect(limiter.consume("workspace:a", 2, start)).toMatchObject({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 1,
    });
    expect(limiter.consume("workspace:b", 2, start).allowed).toBe(
      true,
    );
    expect(
      limiter.consume(
        "workspace:a",
        2,
        new Date(start.getTime() + 1_000),
      ),
    ).toMatchObject({
      allowed: true,
      remaining: 1,
    });
  });
});
