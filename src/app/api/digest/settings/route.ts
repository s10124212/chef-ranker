import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const settings = await prisma.digestSettings.findFirst();
  return NextResponse.json(settings || {
    fromEmail: "onboarding@resend.dev",
    fromName: "Chef Ranker",
    sendHour: 8,
    sendMinute: 0,
    timezone: "America/New_York",
  });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const existing = await prisma.digestSettings.findFirst();

  const data = {
    fromEmail: body.fromEmail,
    fromName: body.fromName,
    sendHour: body.sendHour ?? 8,
    sendMinute: body.sendMinute ?? 0,
    timezone: body.timezone ?? "America/New_York",
  };

  if (existing) {
    const updated = await prisma.digestSettings.update({ where: { id: existing.id }, data });
    return NextResponse.json(updated);
  }

  const created = await prisma.digestSettings.create({ data });
  return NextResponse.json(created);
}
