import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const { email } = await req.json();

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  const existing = await prisma.newsSubscriber.findUnique({ where: { email } });

  if (existing) {
    if (existing.isActive) {
      return NextResponse.json({ message: "Already subscribed!" });
    }
    // Re-activate
    await prisma.newsSubscriber.update({
      where: { email },
      data: { isActive: true, unsubscribedAt: null },
    });
    return NextResponse.json({ message: "Welcome back! You've been re-subscribed." });
  }

  await prisma.newsSubscriber.create({ data: { email } });
  return NextResponse.json({ message: "You're subscribed! You'll get your first digest tomorrow morning." }, { status: 201 });
}
