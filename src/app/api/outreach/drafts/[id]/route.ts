import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const draft = await prisma.outreachDraft.findUnique({
    where: { id },
    include: { chef: { select: { name: true, slug: true, currentRestaurant: true } } },
  });
  if (!draft) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(draft);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.subject !== undefined) data.subject = body.subject;
  if (body.body !== undefined) data.body = body.body;
  if (body.status !== undefined) data.status = body.status;
  if (body.toEmail !== undefined) data.toEmail = body.toEmail;

  const draft = await prisma.outreachDraft.update({ where: { id }, data });
  return NextResponse.json(draft);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.outreachDraft.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
