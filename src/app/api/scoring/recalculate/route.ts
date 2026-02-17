import { NextResponse } from "next/server";
import { recalculateAllScores } from "@/lib/scoring";

export async function POST() {
  await recalculateAllScores();
  return NextResponse.json({ success: true });
}
