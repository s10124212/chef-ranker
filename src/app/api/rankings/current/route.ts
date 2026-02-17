import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { calculateBreakdown, calculateTotalScore, getWeights } from "@/lib/scoring";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cuisine = searchParams.get("cuisine");
  const country = searchParams.get("country");
  const limit = parseInt(searchParams.get("limit") || "50");
  const page = parseInt(searchParams.get("page") || "1");

  const where: Record<string, unknown> = { isArchived: false };
  if (cuisine) where.cuisineSpecialties = { contains: cuisine };
  if (country) where.country = { contains: country };

  const chefs = await prisma.chef.findMany({
    where,
    include: {
      accolades: true,
      careerEntries: true,
      recognitions: true,
      publicSignals: true,
      peerStandings: true,
    },
    orderBy: { rank: "asc" },
    skip: (page - 1) * limit,
    take: limit,
  });

  const total = await prisma.chef.count({ where });
  const weights = await getWeights();

  // Get latest snapshot for delta calculation
  const latestSnapshot = await prisma.monthlySnapshot.findFirst({
    orderBy: { month: "desc" },
    include: { entries: true },
  });
  const prevSnapshot = await prisma.monthlySnapshot.findFirst({
    where: latestSnapshot ? { month: { lt: latestSnapshot.month } } : undefined,
    orderBy: { month: "desc" },
    include: { entries: true },
  });

  const prevRankMap = new Map<string, number>();
  if (prevSnapshot) {
    for (const e of prevSnapshot.entries) {
      prevRankMap.set(e.chefId, e.rank);
    }
  }

  const rankings = chefs.map((chef) => {
    const breakdown = calculateBreakdown(chef);
    const totalScore = calculateTotalScore(breakdown, weights);
    const prevRank = prevRankMap.get(chef.id);
    const delta = prevRank && chef.rank ? prevRank - chef.rank : null;

    return {
      rank: chef.rank,
      chef,
      totalScore,
      breakdown,
      delta,
    };
  });

  return NextResponse.json({ rankings, total, page, limit });
}
