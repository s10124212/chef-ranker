import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const [totalChefs, totalAccolades, totalSnapshots, avgScore, topCuisines] = await Promise.all([
    prisma.chef.count({ where: { isArchived: false } }),
    prisma.accolade.count(),
    prisma.monthlySnapshot.count(),
    prisma.chef.aggregate({ where: { isArchived: false }, _avg: { totalScore: true } }),
    prisma.chef.findMany({
      where: { isArchived: false, cuisineSpecialties: { not: null } },
      select: { cuisineSpecialties: true },
    }),
  ]);

  const cuisineCount: Record<string, number> = {};
  for (const c of topCuisines) {
    if (c.cuisineSpecialties) {
      try {
        const arr = JSON.parse(c.cuisineSpecialties);
        for (const cuisine of arr) {
          cuisineCount[cuisine] = (cuisineCount[cuisine] || 0) + 1;
        }
      } catch {
        // skip invalid JSON
      }
    }
  }

  const topCuisineList = Object.entries(cuisineCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  return NextResponse.json({
    totalChefs,
    totalAccolades,
    totalSnapshots,
    averageScore: Math.round((avgScore._avg.totalScore || 0) * 10) / 10,
    topCuisines: topCuisineList,
  });
}
