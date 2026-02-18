import { prisma } from "./db";
import { DEFAULT_WEIGHTS, type ScoreBreakdown, type ScoringWeights } from "@/types";

export async function getWeights(): Promise<ScoringWeights> {
  const rows = await prisma.scoringWeight.findMany();
  if (rows.length === 0) return DEFAULT_WEIGHTS;
  const weights = { ...DEFAULT_WEIGHTS };
  for (const row of rows) {
    if (row.category in weights) {
      (weights as Record<string, number>)[row.category] = row.weight;
    }
  }
  return weights;
}

function scoreMichelinStars(accolades: { type: string; detail: string | null }[]): number {
  const michelin = accolades.filter((a) => a.type === "MICHELIN_STAR");
  if (michelin.length === 0) return 0;
  let best = 0;
  for (const m of michelin) {
    const stars = parseInt(m.detail || "1");
    if (stars === 3) best = Math.max(best, 100);
    else if (stars === 2) best = Math.max(best, 70);
    else best = Math.max(best, 40);
  }
  return best;
}

function scoreAccoladeType(accolades: { type: string }[], type: string, maxScore: number): number {
  return accolades.some((a) => a.type === type) ? maxScore : 0;
}

export function calculateBreakdown(chef: {
  accolades: { type: string; detail: string | null; year: number | null; createdAt: Date }[];
  careerEntries: { isCurrent: boolean; startYear: number | null; endYear: number | null; role: string; createdAt: Date }[];
  publicSignals: { platform: string; value: number | null; createdAt: Date }[];
  peerStandings: { type: string; createdAt: Date }[];
  yearsExperience: number | null;
}): ScoreBreakdown {
  // 10-year rolling window
  const cutoffYear = new Date().getFullYear() - 10;
  const cutoffDate = new Date();
  cutoffDate.setFullYear(cutoffDate.getFullYear() - 10);

  // Filter accolades: use year field if set, otherwise fall back to createdAt
  const recentAccolades = chef.accolades.filter((a) =>
    a.year ? a.year >= cutoffYear : a.createdAt >= cutoffDate
  );

  // Filter career entries: include if current, or if startYear/endYear is within window, or createdAt is recent
  const recentCareer = chef.careerEntries.filter((c) =>
    c.isCurrent ||
    (c.startYear && c.startYear >= cutoffYear) ||
    (c.endYear && c.endYear >= cutoffYear) ||
    c.createdAt >= cutoffDate
  );

  // Filter public signals and peer standings by createdAt
  const recentSignals = chef.publicSignals.filter((s) => s.createdAt >= cutoffDate);
  const recentPeers = chef.peerStandings.filter((p) => p.createdAt >= cutoffDate);

  // Formal Accolades (raw 0-100)
  const michelinScore = scoreMichelinStars(recentAccolades);
  const jbScore = scoreAccoladeType(recentAccolades, "JAMES_BEARD", 80);
  const w50Score = scoreAccoladeType(recentAccolades, "WORLDS_50_BEST", 90);
  const bocuseScore = scoreAccoladeType(recentAccolades, "BOCUSE_DOR", 85);
  const otherAccoladeScore = scoreAccoladeType(recentAccolades, "OTHER", 30);
  const formalAccolades = Math.min(100, Math.max(michelinScore, jbScore, w50Score, bocuseScore) +
    (recentAccolades.length > 1 ? Math.min(20, (recentAccolades.length - 1) * 5) : 0) +
    otherAccoladeScore * 0.3);

  // Career Track Record (raw 0-100)
  const years = chef.yearsExperience || 0;
  const yearScore = Math.min(40, years * 2);
  const positionCount = recentCareer.length;
  const positionScore = Math.min(30, positionCount * 6);
  const hasExecRole = recentCareer.some((c) =>
    /chef.*owner|executive|head chef|chef de cuisine/i.test(c.role)
  );
  const roleScore = hasExecRole ? 30 : 15;
  const careerTrack = Math.min(100, yearScore + positionScore + roleScore);

  // Public Signals (raw 0-100)
  const signalCount = recentSignals.length;
  const totalSignalValue = recentSignals.reduce((sum, s) => sum + (s.value || 0), 0);
  const publicSignals = Math.min(100,
    signalCount * 15 + Math.min(50, totalSignalValue / 10000)
  );

  // Peer Standing (raw 0-100)
  const peerCount = recentPeers.length;
  const mentored = recentPeers.filter((p) => p.type === "MENTORED").length;
  const collabs = recentPeers.filter((p) => p.type === "COLLABORATION").length;
  const endorsements = recentPeers.filter((p) => p.type === "ENDORSEMENT").length;
  const peerStanding = Math.min(100,
    peerCount * 10 + mentored * 15 + collabs * 10 + endorsements * 12
  );

  return {
    formalAccolades: Math.round(formalAccolades * 10) / 10,
    careerTrack: Math.round(careerTrack * 10) / 10,
    publicSignals: Math.round(publicSignals * 10) / 10,
    peerStanding: Math.round(peerStanding * 10) / 10,
  };
}

export function calculateTotalScore(breakdown: ScoreBreakdown, weights: ScoringWeights): number {
  const total =
    breakdown.formalAccolades * weights.formalAccolades +
    breakdown.careerTrack * weights.careerTrack +
    breakdown.publicSignals * weights.publicSignals +
    breakdown.peerStanding * weights.peerStanding;
  return Math.round(total * 10) / 10;
}

export async function calculateChefScore(chefId: string): Promise<{ total: number; breakdown: ScoreBreakdown }> {
  const chef = await prisma.chef.findUniqueOrThrow({
    where: { id: chefId },
    include: {
      accolades: true,
      careerEntries: true,
      recognitions: true,
      publicSignals: true,
      peerStandings: true,
    },
  });
  const weights = await getWeights();
  const breakdown = calculateBreakdown(chef);
  const total = calculateTotalScore(breakdown, weights);
  return { total, breakdown };
}

export async function recalculateAllScores(): Promise<void> {
  const chefs = await prisma.chef.findMany({
    where: { isArchived: false },
    include: {
      accolades: true,
      careerEntries: true,
      recognitions: true,
      publicSignals: true,
      peerStandings: true,
    },
  });

  const weights = await getWeights();
  const scored = chefs.map((chef) => {
    const breakdown = calculateBreakdown(chef);
    const total = calculateTotalScore(breakdown, weights);
    return { id: chef.id, total, breakdown };
  });

  scored.sort((a, b) => b.total - a.total);

  for (let i = 0; i < scored.length; i++) {
    await prisma.chef.update({
      where: { id: scored[i].id },
      data: { totalScore: scored[i].total, rank: i + 1 },
    });
  }
}

export async function createMonthlySnapshot(month: string, notes?: string): Promise<string> {
  await recalculateAllScores();

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

  const weights = await getWeights();

  // Get previous snapshot for delta calc
  const prevSnapshot = await prisma.monthlySnapshot.findFirst({
    where: { month: { lt: month } },
    orderBy: { month: "desc" },
    include: { entries: true },
  });

  const prevRankMap = new Map<string, number>();
  if (prevSnapshot) {
    for (const entry of prevSnapshot.entries) {
      prevRankMap.set(entry.chefId, entry.rank);
    }
  }

  const snapshot = await prisma.monthlySnapshot.upsert({
    where: { month },
    update: { notes, publishedAt: new Date() },
    create: { month, notes, publishedAt: new Date() },
  });

  // Delete old entries if re-publishing
  await prisma.snapshotEntry.deleteMany({ where: { snapshotId: snapshot.id } });

  for (const chef of chefs) {
    const breakdown = calculateBreakdown(chef);
    const total = calculateTotalScore(breakdown, weights);
    const prevRank = prevRankMap.get(chef.id);
    const delta = prevRank && chef.rank ? prevRank - chef.rank : null;

    await prisma.snapshotEntry.create({
      data: {
        snapshotId: snapshot.id,
        chefId: chef.id,
        rank: chef.rank!,
        totalScore: total,
        breakdown: JSON.stringify(breakdown),
        delta,
      },
    });
  }

  return snapshot.id;
}
