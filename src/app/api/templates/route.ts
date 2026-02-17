import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const templates = await prisma.emailTemplate.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const template = await prisma.emailTemplate.create({
    data: {
      name: body.name,
      category: body.category,
      subject: body.subject,
      body: body.body,
      isDefault: false,
    },
  });
  return NextResponse.json(template, { status: 201 });
}
