import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { calculateBreakdown, calculateTotalScore, getWeights } from "@/lib/scoring";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const slugs = searchParams.get("slugs")?.split(",").filter(Boolean) || [];

  if (slugs.length < 2 || slugs.length > 4) {
    return NextResponse.json({ error: "Provide 2-4 chef slugs separated by commas" }, { status: 400 });
  }

  const chefs = await prisma.chef.findMany({
    where: { slug: { in: slugs } },
    include: {
      accolades: true,
      careerEntries: true,
      recognitions: true,
      publicSignals: true,
      peerStandings: true,
    },
  });

  if (chefs.length < 2) {
    return NextResponse.json({ error: "Not enough chefs found" }, { status: 404 });
  }

  const weights = await getWeights();

  const comparisons = chefs.map((chef) => {
    const breakdown = calculateBreakdown(chef);
    const totalScore = calculateTotalScore(breakdown, weights);
    return { chef, breakdown, totalScore };
  });

  comparisons.sort((a, b) => b.totalScore - a.totalScore);

  return NextResponse.json({ comparisons });
}
