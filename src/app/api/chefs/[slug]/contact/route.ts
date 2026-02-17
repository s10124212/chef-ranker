import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const chef = await prisma.chef.findUnique({ where: { slug }, include: { contact: true } });
  if (!chef) return NextResponse.json({ error: "Chef not found" }, { status: 404 });
  return NextResponse.json(chef.contact || {});
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const chef = await prisma.chef.findUnique({ where: { slug } });
  if (!chef) return NextResponse.json({ error: "Chef not found" }, { status: 404 });

  const body = await req.json();
  const contact = await prisma.chefContact.upsert({
    where: { chefId: chef.id },
    update: {
      email: body.email ?? null,
      agentName: body.agentName ?? null,
      agentEmail: body.agentEmail ?? null,
      restaurantEmail: body.restaurantEmail ?? null,
      phone: body.phone ?? null,
      preferredContactMethod: body.preferredContactMethod ?? null,
      linkedinUrl: body.linkedinUrl ?? null,
      notes: body.notes ?? null,
    },
    create: {
      chefId: chef.id,
      email: body.email ?? null,
      agentName: body.agentName ?? null,
      agentEmail: body.agentEmail ?? null,
      restaurantEmail: body.restaurantEmail ?? null,
      phone: body.phone ?? null,
      preferredContactMethod: body.preferredContactMethod ?? null,
      linkedinUrl: body.linkedinUrl ?? null,
      notes: body.notes ?? null,
    },
  });
  return NextResponse.json(contact);
}
