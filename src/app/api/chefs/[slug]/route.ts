import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const chef = await prisma.chef.findUnique({
    where: { slug },
    include: {
      accolades: { orderBy: { year: "desc" } },
      careerEntries: { orderBy: { startYear: "desc" } },
      recognitions: { orderBy: { year: "desc" } },
      publicSignals: true,
      peerStandings: true,
      snapshotEntries: {
        include: { snapshot: true },
        orderBy: { snapshot: { month: "desc" } },
      },
      newsItems: {
        include: {
          newsItem: true,
        },
        orderBy: { newsItem: { publishedAt: "desc" } },
        take: 10,
      },
      contact: true,
      outreachDrafts: {
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });

  if (!chef) {
    return NextResponse.json({ error: "Chef not found" }, { status: 404 });
  }

  return NextResponse.json(chef);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = await req.json();

  const chef = await prisma.chef.update({
    where: { slug },
    data: {
      name: body.name,
      city: body.city,
      country: body.country,
      currentRestaurant: body.currentRestaurant,
      cuisineSpecialties: body.cuisineSpecialties ? JSON.stringify(body.cuisineSpecialties) : undefined,
      yearsExperience: body.yearsExperience,
      photoUrl: body.photoUrl,
      bio: body.bio,
    },
  });

  return NextResponse.json(chef);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await prisma.chef.update({
    where: { slug },
    data: { isArchived: true },
  });
  return NextResponse.json({ success: true });
}
