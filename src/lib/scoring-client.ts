import type { ScoreBreakdown } from "@/types";

export function calculateBreakdownClient(chef: {
  accolades: { type: string; detail: string | null; year?: number | null }[];
  careerEntries: { isCurrent: boolean; startYear: number | null; endYear: number | null; role: string }[];
  publicSignals: { platform: string; value: number | null }[];
  peerStandings: { type: string }[];
  yearsExperience?: number | null;
}): ScoreBreakdown {
  const michelin = chef.accolades.filter((a) => a.type === "MICHELIN_STAR");
  let michelinScore = 0;
  for (const m of michelin) {
    const stars = parseInt(m.detail || "1");
    if (stars === 3) michelinScore = Math.max(michelinScore, 100);
    else if (stars === 2) michelinScore = Math.max(michelinScore, 70);
    else michelinScore = Math.max(michelinScore, 40);
  }
  const jbScore = chef.accolades.some((a) => a.type === "JAMES_BEARD") ? 80 : 0;
  const w50Score = chef.accolades.some((a) => a.type === "WORLDS_50_BEST") ? 90 : 0;
  const bocuseScore = chef.accolades.some((a) => a.type === "BOCUSE_DOR") ? 85 : 0;
  const otherScore = chef.accolades.some((a) => a.type === "OTHER") ? 30 : 0;
  const formalAccolades = Math.min(100, Math.max(michelinScore, jbScore, w50Score, bocuseScore) +
    (chef.accolades.length > 1 ? Math.min(20, (chef.accolades.length - 1) * 5) : 0) +
    otherScore * 0.3);

  const years = chef.yearsExperience || 0;
  const yearScore = Math.min(40, years * 2);
  const positionScore = Math.min(30, chef.careerEntries.length * 6);
  const hasExecRole = chef.careerEntries.some((c) =>
    /chef.*owner|executive|head chef|chef de cuisine/i.test(c.role)
  );
  const careerTrack = Math.min(100, yearScore + positionScore + (hasExecRole ? 30 : 15));

  const signalCount = chef.publicSignals.length;
  const totalSignalValue = chef.publicSignals.reduce((sum, s) => sum + (s.value || 0), 0);
  const publicSignals = Math.min(100, signalCount * 15 + Math.min(50, totalSignalValue / 10000));

  const peerCount = chef.peerStandings.length;
  const mentored = chef.peerStandings.filter((p) => p.type === "MENTORED").length;
  const collabs = chef.peerStandings.filter((p) => p.type === "COLLABORATION").length;
  const endorsements = chef.peerStandings.filter((p) => p.type === "ENDORSEMENT").length;
  const peerStanding = Math.min(100, peerCount * 10 + mentored * 15 + collabs * 10 + endorsements * 12);

  return {
    formalAccolades: Math.round(formalAccolades * 10) / 10,
    careerTrack: Math.round(careerTrack * 10) / 10,
    publicSignals: Math.round(publicSignals * 10) / 10,
    peerStanding: Math.round(peerStanding * 10) / 10,
  };
}
