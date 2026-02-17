import { NextResponse } from "next/server";
import { runCollection } from "@/lib/collectors/orchestrator";

export async function POST() {
  try {
    const summary = await runCollection();
    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message, status: "FAILED" },
      { status: 500 }
    );
  }
}
