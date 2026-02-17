import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createMonthlySnapshot } from "@/lib/scoring";

export async function GET() {
  const snapshots = await prisma.monthlySnapshot.findMany({
    orderBy: { month: "desc" },
    include: { _count: { select: { entries: true } } },
  });
  return NextResponse.json(snapshots);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const month = body.month;
  const notes = body.notes;

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "Invalid month format. Use YYYY-MM." }, { status: 400 });
  }

  const snapshotId = await createMonthlySnapshot(month, notes);
  const snapshot = await prisma.monthlySnapshot.findUnique({
    where: { id: snapshotId },
    include: { entries: { include: { chef: true }, orderBy: { rank: "asc" } } },
  });

  return NextResponse.json(snapshot, { status: 201 });
}
