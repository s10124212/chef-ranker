import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const subscribers = await prisma.newsSubscriber.findMany({
    orderBy: { subscribedAt: "desc" },
  });
  const activeCount = subscribers.filter((s) => s.isActive).length;
  return NextResponse.json({ subscribers, activeCount, total: subscribers.length });
}

export async function DELETE(req: NextRequest) {
  const { email } = await req.json();
  if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });

  await prisma.newsSubscriber.deleteMany({ where: { email } });
  return NextResponse.json({ success: true });
}
