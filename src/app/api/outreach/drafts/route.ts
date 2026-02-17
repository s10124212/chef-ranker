import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const chefId = url.searchParams.get("chefId");
  const status = url.searchParams.get("status");
  const limit = parseInt(url.searchParams.get("limit") || "50");
  const offset = parseInt(url.searchParams.get("offset") || "0");

  const where: Record<string, unknown> = {};
  if (chefId) where.chefId = chefId;
  if (status) where.status = status;

  const [drafts, total] = await Promise.all([
    prisma.outreachDraft.findMany({
      where,
      include: { chef: { select: { name: true, slug: true, currentRestaurant: true } } },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.outreachDraft.count({ where }),
  ]);

  return NextResponse.json({ drafts, total });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const draft = await prisma.outreachDraft.create({
    data: {
      chefId: body.chefId,
      templateId: body.templateId || null,
      toEmail: body.toEmail || null,
      subject: body.subject,
      body: body.body,
      status: "drafted",
    },
  });
  return NextResponse.json(draft, { status: 201 });
}
