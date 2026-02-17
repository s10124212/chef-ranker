import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const chef = await prisma.chef.findUnique({ where: { slug } });
  if (!chef) return NextResponse.json({ error: "Chef not found" }, { status: 404 });

  const accolades = await prisma.accolade.findMany({
    where: { chefId: chef.id },
    orderBy: { year: "desc" },
  });
  return NextResponse.json(accolades);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const chef = await prisma.chef.findUnique({ where: { slug } });
  if (!chef) return NextResponse.json({ error: "Chef not found" }, { status: 404 });

  const body = await req.json();
  const accolade = await prisma.accolade.create({
    data: {
      chefId: chef.id,
      type: body.type,
      detail: body.detail || null,
      year: body.year || null,
      sourceUrl: body.sourceUrl || null,
    },
  });
  return NextResponse.json(accolade, { status: 201 });
}
