import {
  NextResponse,
} from "next/server";
import {
  verifyClosedLoopCertification,
} from "@/closure/verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let cached:
  | Awaited<
      ReturnType<typeof verifyClosedLoopCertification>
    >
  | undefined;

export async function GET(): Promise<NextResponse> {
  cached ??= await verifyClosedLoopCertification();
  return NextResponse.json(cached);
}
