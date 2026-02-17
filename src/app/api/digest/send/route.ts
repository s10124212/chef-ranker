import { NextRequest, NextResponse } from "next/server";
import { sendDailyDigest } from "@/lib/digest-generator";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const testEmail = body.testEmail as string | undefined;

  try {
    const result = await sendDailyDigest(testEmail);
    if (!result) {
      return NextResponse.json({ message: "No stories to send today — digest skipped." });
    }
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
