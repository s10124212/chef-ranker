import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/utils";
import { recalculateAllScores } from "@/lib/scoring";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const chefs = body.chefs || body;
  if (!Array.isArray(chefs)) {
    return NextResponse.json({ error: "Expected an array of chefs" }, { status: 400 });
  }

  let imported = 0;
  let skipped = 0;

  for (const data of chefs) {
    const slug = slugify(data.name);
    const existing = await prisma.chef.findUnique({ where: { slug } });
    if (existing) { skipped++; continue; }

    const chef = await prisma.chef.create({
      data: {
        name: data.name,
        slug,
        city: data.city || null,
        country: data.country || null,
        currentRestaurant: data.currentRestaurant || null,
        cuisineSpecialties: data.cuisineSpecialties ? JSON.stringify(data.cuisineSpecialties) : null,
        yearsExperience: data.yearsExperience || null,
        bio: data.bio || null,
      },
    });

    if (data.accolades) {
      for (const a of data.accolades) {
        await prisma.accolade.create({
          data: { chefId: chef.id, type: a.type, detail: a.detail || null, year: a.year || null, sourceUrl: a.sourceUrl || null },
        });
      }
    }

    if (data.career) {
      for (const c of data.career) {
        await prisma.careerEntry.create({
          data: { chefId: chef.id, role: c.role, restaurant: c.restaurant, city: c.city || null, startYear: c.startYear || null, endYear: c.endYear || null, isCurrent: c.isCurrent || false },
        });
      }
    }

    imported++;
  }

  await recalculateAllScores();

  return NextResponse.json({ imported, skipped, total: chefs.length });
}
