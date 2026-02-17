import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const settings = await prisma.senderSettings.findFirst();
  return NextResponse.json(settings || { name: "", title: "", company: "", email: "" });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const existing = await prisma.senderSettings.findFirst();

  if (existing) {
    const updated = await prisma.senderSettings.update({
      where: { id: existing.id },
      data: {
        name: body.name ?? null,
        title: body.title ?? null,
        company: body.company ?? null,
        email: body.email ?? null,
      },
    });
    return NextResponse.json(updated);
  }

  const created = await prisma.senderSettings.create({
    data: {
      name: body.name ?? null,
      title: body.title ?? null,
      company: body.company ?? null,
      email: body.email ?? null,
    },
  });
  return NextResponse.json(created);
}
