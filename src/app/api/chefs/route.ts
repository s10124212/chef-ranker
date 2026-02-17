import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cuisine = searchParams.get("cuisine");
  const country = searchParams.get("country");
  const minScore = searchParams.get("minScore");
  const maxScore = searchParams.get("maxScore");
  const accoladeType = searchParams.get("accoladeType");
  const sort = searchParams.get("sort") || "rank";
  const order = searchParams.get("order") || "asc";
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");
  const search = searchParams.get("search");

  const where: Record<string, unknown> = { isArchived: false };

  if (country) where.country = { contains: country };
  if (cuisine) where.cuisineSpecialties = { contains: cuisine };
  if (minScore || maxScore) {
    where.totalScore = {};
    if (minScore) (where.totalScore as Record<string, number>).gte = parseFloat(minScore);
    if (maxScore) (where.totalScore as Record<string, number>).lte = parseFloat(maxScore);
  }
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { currentRestaurant: { contains: search } },
      { city: { contains: search } },
    ];
  }
  if (accoladeType) {
    where.accolades = { some: { type: accoladeType } };
  }

  const orderBy: Record<string, string> = {};
  orderBy[sort] = order;

  const [chefs, total] = await Promise.all([
    prisma.chef.findMany({
      where,
      include: { accolades: true },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.chef.count({ where }),
  ]);

  return NextResponse.json({ chefs, total, page, limit });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const slug = slugify(body.name);

  const chef = await prisma.chef.create({
    data: {
      name: body.name,
      slug,
      city: body.city || null,
      country: body.country || null,
      currentRestaurant: body.currentRestaurant || null,
      cuisineSpecialties: body.cuisineSpecialties ? JSON.stringify(body.cuisineSpecialties) : null,
      yearsExperience: body.yearsExperience || null,
      photoUrl: body.photoUrl || null,
      bio: body.bio || null,
    },
  });

  return NextResponse.json(chef, { status: 201 });
}
