import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  // Get the most recent log for each step
  const allLogs = await prisma.updateStepLog.findMany({
    orderBy: { runAt: "desc" },
  });

  // Group by stepName and take the most recent
  const latestByStep: Record<string, typeof allLogs[0]> = {};
  for (const log of allLogs) {
    if (!latestByStep[log.stepName]) {
      latestByStep[log.stepName] = log;
    }
  }

  return NextResponse.json(latestByStep);
}
