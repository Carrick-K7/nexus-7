import type {
  ExperimentActor,
} from "@/experiments/types";
import {
  actorWorkspaceId,
} from "@/experiments/authorization";

export interface ClosureRateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: string;
  retryAfterSeconds: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

function positiveInteger(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : fallback;
}

export class FixedWindowRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly windowMs = 60_000,
    private readonly maximumBuckets = 10_000,
  ) {}

  consume(
    key: string,
    limit: number,
    now = new Date(),
  ): ClosureRateLimitResult {
    const timestamp = now.getTime();
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= timestamp) {
      bucket = {
        count: 0,
        resetAt: timestamp + this.windowMs,
      };
      this.buckets.set(key, bucket);
    }
    const allowed = bucket.count < limit;
    if (allowed) {
      bucket.count += 1;
    }
    if (this.buckets.size > this.maximumBuckets) {
      for (const [candidateKey, candidate] of this.buckets) {
        if (candidate.resetAt <= timestamp) {
          this.buckets.delete(candidateKey);
        }
      }
    }
    return {
      allowed,
      limit,
      remaining: Math.max(0, limit - bucket.count),
      resetAt: new Date(bucket.resetAt).toISOString(),
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((bucket.resetAt - timestamp) / 1_000),
      ),
    };
  }
}

interface ClosureRateLimitGlobal {
  limiter?: FixedWindowRateLimiter;
}

const rateLimitGlobal = globalThis as typeof globalThis & {
  __nexusClosureRateLimit?: ClosureRateLimitGlobal;
};

export function consumeClosureApiQuota(
  actor: ExperimentActor,
  mutation: boolean,
  now = new Date(),
): ClosureRateLimitResult {
  const state =
    rateLimitGlobal.__nexusClosureRateLimit ??
    (rateLimitGlobal.__nexusClosureRateLimit = {});
  state.limiter ??= new FixedWindowRateLimiter();
  const limit = mutation
    ? positiveInteger(
        process.env.NEXUS_CLOSURE_MUTATION_RATE_LIMIT,
        30,
      )
    : positiveInteger(
        process.env.NEXUS_CLOSURE_READ_RATE_LIMIT,
        120,
      );
  const scope = mutation ? "mutation" : "read";
  return state.limiter.consume(
    `${actorWorkspaceId(actor)}:${actor.id}:${scope}`,
    limit,
    now,
  );
}
