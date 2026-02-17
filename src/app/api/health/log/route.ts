import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const status = searchParams.get("status");
  const limit = parseInt(searchParams.get("limit") || "50");
  const page = parseInt(searchParams.get("page") || "1");

  const where: Record<string, unknown> = {};
  if (category) where.category = category;
  if (status) where.status = status;

  const [logs, total] = await Promise.all([
    prisma.healthCheckLog.findMany({
      where,
      orderBy: { runAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.healthCheckLog.count({ where }),
  ]);

  return NextResponse.json({ logs, total, page, limit });
}
