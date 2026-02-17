import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { readFileSync } from "fs";
import { join, resolve } from "path";

interface ManualChefData {
  name: string;
  city?: string;
  country?: string;
  currentRestaurant?: string;
  cuisineSpecialties?: string[];
  yearsExperience?: number;
  bio?: string;
  accolades?: { type: string; detail?: string; year?: number; sourceUrl?: string }[];
  career?: { role: string; restaurant: string; city?: string; startYear?: number; endYear?: number; isCurrent?: boolean }[];
  recognitions?: { title: string; category?: string; year?: number }[];
  publicSignals?: { platform: string; metric?: string; value?: number }[];
  peerStandings?: { type: string; detail?: string; relatedChef?: string }[];
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

async function main() {
  const dbPath = resolve(__dirname, "..", "dev.db");
  const adapter = new PrismaLibSql({ url: `file:${dbPath}` });
  const prisma = new PrismaClient({ adapter });

  try {
    const dataPath = join(__dirname, "..", "data", "chefs-manual.json");
    const raw = readFileSync(dataPath, "utf-8");
    const chefs: ManualChefData[] = JSON.parse(raw);

    console.log(`Importing ${chefs.length} chefs...`);

    for (const data of chefs) {
      const slug = slugify(data.name);

      const existing = await prisma.chef.findUnique({ where: { slug } });
      if (existing) {
        console.log(`  Skipping ${data.name} (already exists)`);
        continue;
      }

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
            data: {
              chefId: chef.id,
              type: a.type,
              detail: a.detail || null,
              year: a.year || null,
              sourceUrl: a.sourceUrl || null,
            },
          });
        }
      }

      if (data.career) {
        for (const c of data.career) {
          await prisma.careerEntry.create({
            data: {
              chefId: chef.id,
              role: c.role,
              restaurant: c.restaurant,
              city: c.city || null,
              startYear: c.startYear || null,
              endYear: c.endYear || null,
              isCurrent: c.isCurrent || false,
            },
          });
        }
      }

      if (data.recognitions) {
        for (const r of data.recognitions) {
          await prisma.industryRecognition.create({
            data: {
              chefId: chef.id,
              title: r.title,
              category: r.category || null,
              year: r.year || null,
            },
          });
        }
      }

      if (data.publicSignals) {
        for (const s of data.publicSignals) {
          await prisma.publicSignal.create({
            data: {
              chefId: chef.id,
              platform: s.platform,
              metric: s.metric || null,
              value: s.value || null,
            },
          });
        }
      }

      if (data.peerStandings) {
        for (const p of data.peerStandings) {
          await prisma.peerStanding.create({
            data: {
              chefId: chef.id,
              type: p.type,
              detail: p.detail || null,
              relatedChef: p.relatedChef || null,
            },
          });
        }
      }

      console.log(`  Imported: ${data.name}`);
    }

    // Initialize default scoring weights
    const defaultWeights = [
      { category: "formalAccolades", weight: 0.30 },
      { category: "careerTrack", weight: 0.20 },
      { category: "credentials", weight: 0.10 },
      { category: "industryRecognition", weight: 0.15 },
      { category: "publicSignals", weight: 0.10 },
      { category: "peerStanding", weight: 0.15 },
    ];

    for (const w of defaultWeights) {
      await prisma.scoringWeight.upsert({
        where: { category: w.category },
        update: { weight: w.weight },
        create: { category: w.category, weight: w.weight },
      });
    }
    console.log("Scoring weights initialized.");

    // Recalculate scores
    console.log("Calculating scores...");
    const allChefs = await prisma.chef.findMany({
      where: { isArchived: false },
      include: {
        accolades: true,
        careerEntries: true,
        recognitions: true,
        publicSignals: true,
        peerStandings: true,
      },
    });

    const weights = {
      formalAccolades: 0.30,
      careerTrack: 0.20,
      credentials: 0.10,
      industryRecognition: 0.15,
      publicSignals: 0.10,
      peerStanding: 0.15,
    };

    // Inline scoring to avoid ESM/import issues in script context
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

    const scored = allChefs.map((chef) => {
      const michelinScore = scoreMichelinStars(chef.accolades);
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

      const accoladeTypes = new Set(chef.accolades.map((a) => a.type));
      const credentials = Math.min(100, accoladeTypes.size * 25 +
        chef.careerEntries.filter((c) => c.startYear && c.endYear).length * 10);

      const recCount = chef.recognitions.length;
      const mediaRec = chef.recognitions.filter((r) => r.category === "MEDIA").length;
      const mentorRec = chef.recognitions.filter((r) => r.category === "MENTORSHIP").length;
      const pubRec = chef.recognitions.filter((r) => r.category === "PUBLICATION").length;
      const industryRecognition = Math.min(100, recCount * 12 + mediaRec * 8 + mentorRec * 10 + pubRec * 5);

      const signalCount = chef.publicSignals.length;
      const totalSignalValue = chef.publicSignals.reduce((sum, s) => sum + (s.value || 0), 0);
      const publicSignals = Math.min(100, signalCount * 15 + Math.min(50, totalSignalValue / 10000));

      const peerCount = chef.peerStandings.length;
      const mentored = chef.peerStandings.filter((p) => p.type === "MENTORED").length;
      const collabs = chef.peerStandings.filter((p) => p.type === "COLLABORATION").length;
      const endorsements = chef.peerStandings.filter((p) => p.type === "ENDORSEMENT").length;
      const peerStanding = Math.min(100, peerCount * 10 + mentored * 15 + collabs * 10 + endorsements * 12);

      const total =
        formalAccolades * weights.formalAccolades +
        careerTrack * weights.careerTrack +
        credentials * weights.credentials +
        industryRecognition * weights.industryRecognition +
        publicSignals * weights.publicSignals +
        peerStanding * weights.peerStanding;

      return { id: chef.id, name: chef.name, total: Math.round(total * 10) / 10 };
    });

    scored.sort((a, b) => b.total - a.total);

    for (let i = 0; i < scored.length; i++) {
      await prisma.chef.update({
        where: { id: scored[i].id },
        data: { totalScore: scored[i].total, rank: i + 1 },
      });
    }

    console.log("\nTop 10:");
    for (let i = 0; i < Math.min(10, scored.length); i++) {
      console.log(`  ${i + 1}. ${scored[i].name} — ${scored[i].total}`);
    }

    console.log(`\nDone! Imported and scored ${chefs.length} chefs.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
