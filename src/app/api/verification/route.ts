import { NextResponse } from "next/server";
import { verifyAutonomyReadiness } from "@/verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let cached:
  | {
      generatedAt: string;
      report: ReturnType<typeof verifyAutonomyReadiness>;
    }
  | undefined;

export async function GET(): Promise<NextResponse> {
  if (!cached) {
    cached = {
      generatedAt: new Date().toISOString(),
      report: verifyAutonomyReadiness(),
    };
  }
  return NextResponse.json(cached);
}
