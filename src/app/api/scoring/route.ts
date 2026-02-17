import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { recalculateAllScores, getWeights } from "@/lib/scoring";

export async function GET() {
  const weights = await getWeights();
  return NextResponse.json(weights);
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const categories = ["formalAccolades", "careerTrack", "publicSignals", "peerStanding"];

  for (const cat of categories) {
    if (body[cat] !== undefined) {
      await prisma.scoringWeight.upsert({
        where: { category: cat },
        update: { weight: body[cat] },
        create: { category: cat, weight: body[cat] },
      });
    }
  }

  // Automatically recalculate all scores with the new weights
  await recalculateAllScores();

  const weights = await getWeights();
  return NextResponse.json(weights);
}
