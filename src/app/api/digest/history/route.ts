import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const logs = await prisma.digestLog.findMany({
    orderBy: { sentAt: "desc" },
    take: 30,
  });
  return NextResponse.json(logs);
}
