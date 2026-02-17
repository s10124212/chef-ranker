import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") || "json";

  const chefs = await prisma.chef.findMany({
    where: { isArchived: false },
    include: {
      accolades: true,
      careerEntries: true,
      recognitions: true,
      publicSignals: true,
      peerStandings: true,
    },
    orderBy: { rank: "asc" },
  });

  if (format === "csv") {
    const header = "Rank,Name,Restaurant,City,Country,Score,Top Accolade\n";
    const rows = chefs.map((c) => {
      const topAccolade = c.accolades.length > 0
        ? `${c.accolades[0].type}${c.accolades[0].detail ? ` (${c.accolades[0].detail})` : ""}`
        : "";
      return `${c.rank},"${c.name}","${c.currentRestaurant || ""}","${c.city || ""}","${c.country || ""}",${c.totalScore},"${topAccolade}"`;
    });

    return new NextResponse(header + rows.join("\n"), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=chef-rankings.csv",
      },
    });
  }

  return NextResponse.json(chefs);
}
