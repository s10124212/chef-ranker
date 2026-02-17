import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const snapshot = await prisma.monthlySnapshot.findUnique({
    where: { id },
    include: {
      entries: {
        include: {
          chef: {
            select: { name: true, slug: true, currentRestaurant: true, city: true, country: true, cuisineSpecialties: true },
          },
        },
        orderBy: { rank: "asc" },
      },
    },
  });

  if (!snapshot) {
    return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });
  }

  return NextResponse.json(snapshot);
}
