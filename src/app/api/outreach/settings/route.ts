import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const settings = await prisma.outreachSettings.findFirst();
  return NextResponse.json(settings || {
    purpose: "We want to connect one-on-one to understand what top chefs look for in an assistant, what tools and support they rely on, and what's missing.",
    tone: "warm",
    maxWords: 150,
  });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const existing = await prisma.outreachSettings.findFirst();

  if (existing) {
    const updated = await prisma.outreachSettings.update({
      where: { id: existing.id },
      data: {
        purpose: body.purpose ?? existing.purpose,
        tone: body.tone ?? existing.tone,
        maxWords: body.maxWords ?? existing.maxWords,
      },
    });
    return NextResponse.json(updated);
  }

  const created = await prisma.outreachSettings.create({
    data: {
      purpose: body.purpose,
      tone: body.tone || "warm",
      maxWords: body.maxWords || 150,
    },
  });
  return NextResponse.json(created);
}
