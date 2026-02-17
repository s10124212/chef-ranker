import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { calculateChefScore, recalculateAllScores, createMonthlySnapshot } from "@/lib/scoring";
import { slugify } from "@/lib/utils";

interface TestStep {
  step: number;
  description: string;
  passed: boolean;
  detail?: string;
}

async function chefLifecycleTest(): Promise<{ steps: TestStep[]; passed: boolean }> {
  const steps: TestStep[] = [];
  let testChefId: string | null = null;
  let testAccoladeId: string | null = null;

  try {
    // 1. Create test chef
    const testChef = await prisma.chef.create({
      data: {
        name: "Test Chef — DELETE ME",
        slug: slugify("Test Chef DELETE ME " + Date.now()),
        city: "Test City",
        country: "Test Country",
        currentRestaurant: "Test Restaurant",
        yearsExperience: 10,
      },
    });
    testChefId = testChef.id;
    steps.push({ step: 1, description: "Create test chef", passed: true });

    // 2. Verify appears in DB
    const found = await prisma.chef.findUnique({ where: { id: testChefId } });
    steps.push({ step: 2, description: "Verify chef exists in database", passed: !!found });

    // 3. Add an accolade
    const accolade = await prisma.accolade.create({
      data: { chefId: testChefId, type: "MICHELIN_STAR", detail: "1 star", year: 2025 },
    });
    testAccoladeId = accolade.id;
    steps.push({ step: 3, description: "Add Michelin star accolade", passed: true });

    // 4. Calculate score
    const { total: scoreAfter } = await calculateChefScore(testChefId);
    steps.push({ step: 4, description: "Calculate score", passed: true, detail: `Score: ${scoreAfter}` });

    // 5. Verify score > 0
    steps.push({ step: 5, description: "Verify score increased from 0", passed: scoreAfter > 0, detail: `Score: ${scoreAfter}` });

    // 6. Delete accolade
    await prisma.accolade.delete({ where: { id: testAccoladeId } });
    testAccoladeId = null;
    steps.push({ step: 6, description: "Remove accolade", passed: true });

    // 7. Recalculate and verify score dropped
    const { total: scoreAfterRemove } = await calculateChefScore(testChefId);
    steps.push({
      step: 7,
      description: "Verify score decreased after removing accolade",
      passed: scoreAfterRemove < scoreAfter,
      detail: `Before: ${scoreAfter}, After: ${scoreAfterRemove}`,
    });

    // 8. Delete test chef
    await prisma.chef.delete({ where: { id: testChefId } });
    testChefId = null;
    steps.push({ step: 8, description: "Delete test chef", passed: true });

    // 9. Verify cleanup
    const deleted = await prisma.chef.findUnique({ where: { id: testChef.id } });
    steps.push({ step: 9, description: "Verify chef deleted", passed: !deleted });

  } catch (err) {
    steps.push({
      step: steps.length + 1,
      description: "Unexpected error",
      passed: false,
      detail: (err as Error).message,
    });
  } finally {
    // Cleanup in case of failure
    if (testAccoladeId) await prisma.accolade.delete({ where: { id: testAccoladeId } }).catch(() => {});
    if (testChefId) await prisma.chef.delete({ where: { id: testChefId } }).catch(() => {});
  }

  return { steps, passed: steps.every((s) => s.passed) };
}

async function scoreRecalculationTest(): Promise<{ steps: TestStep[]; passed: boolean }> {
  const steps: TestStep[] = [];
  let testAccoladeId: string | null = null;

  try {
    // 1. Pick a chef with FEW accolades (so adding a 3-star Michelin will noticeably change the score)
    const chefs = await prisma.chef.findMany({
      where: { isArchived: false },
      include: { accolades: true },
      orderBy: { totalScore: "asc" },
    });
    const chef = chefs.find((c) => c.accolades.length <= 1);

    if (!chef) {
      steps.push({ step: 1, description: "Find a chef with few accolades", passed: false, detail: "No suitable chef found" });
      return { steps, passed: false };
    }

    steps.push({ step: 1, description: "Pick a chef with few accolades", passed: true, detail: `${chef.name} (score: ${chef.totalScore}, ${chef.accolades.length} accolades)` });

    const originalScore = chef.totalScore;

    // 2. Add a 3-star Michelin accolade
    const accolade = await prisma.accolade.create({
      data: { chefId: chef.id, type: "MICHELIN_STAR", detail: "3 stars", year: 2026 },
    });
    testAccoladeId = accolade.id;
    steps.push({ step: 2, description: "Add fake 3-star Michelin accolade", passed: true });

    // 3. Recalculate
    const { total: boostedScore } = await calculateChefScore(chef.id);
    await prisma.chef.update({ where: { id: chef.id }, data: { totalScore: boostedScore } });
    steps.push({ step: 3, description: "Recalculate score", passed: true, detail: `New score: ${boostedScore}` });

    // 4. Verify increase
    const increased = boostedScore > originalScore;
    steps.push({
      step: 4,
      description: "Verify score increased significantly",
      passed: increased,
      detail: `Original: ${originalScore}, Boosted: ${boostedScore}, Diff: ${(boostedScore - originalScore).toFixed(1)}`,
    });

    // 5. Remove fake accolade
    await prisma.accolade.delete({ where: { id: testAccoladeId } });
    testAccoladeId = null;
    steps.push({ step: 5, description: "Remove fake accolade", passed: true });

    // 6. Recalculate again
    const { total: restoredScore } = await calculateChefScore(chef.id);
    await prisma.chef.update({ where: { id: chef.id }, data: { totalScore: restoredScore } });
    const diff = Math.abs(restoredScore - originalScore);
    steps.push({
      step: 6,
      description: "Verify score restored to original",
      passed: diff <= 1,
      detail: `Original: ${originalScore}, Restored: ${restoredScore}, Diff: ${diff.toFixed(1)}`,
    });

  } catch (err) {
    steps.push({ step: steps.length + 1, description: "Unexpected error", passed: false, detail: (err as Error).message });
  } finally {
    if (testAccoladeId) await prisma.accolade.delete({ where: { id: testAccoladeId } }).catch(() => {});
  }

  return { steps, passed: steps.every((s) => s.passed) };
}

async function snapshotTest(): Promise<{ steps: TestStep[]; passed: boolean }> {
  const steps: TestStep[] = [];
  let testSnapshotId: string | null = null;

  try {
    // 1. Recalculate scores
    await recalculateAllScores();
    steps.push({ step: 1, description: "Recalculate all scores", passed: true });

    // 2. Create test snapshot
    const testMonth = "1999-01"; // clearly a test
    testSnapshotId = await createMonthlySnapshot(testMonth, "E2E test snapshot — DELETE ME");
    steps.push({ step: 2, description: "Create test snapshot", passed: !!testSnapshotId });

    // 3. Verify snapshot exists
    const snapshot = await prisma.monthlySnapshot.findUnique({
      where: { id: testSnapshotId },
      include: { _count: { select: { entries: true } } },
    });
    steps.push({
      step: 3,
      description: "Verify snapshot saved",
      passed: !!snapshot && snapshot._count.entries > 0,
      detail: `${snapshot?._count.entries} entries`,
    });

    // 4. Delete test snapshot
    await prisma.snapshotEntry.deleteMany({ where: { snapshotId: testSnapshotId } });
    await prisma.monthlySnapshot.delete({ where: { id: testSnapshotId } });
    testSnapshotId = null;
    steps.push({ step: 4, description: "Delete test snapshot", passed: true });

    // 5. Verify cleanup
    const deleted = await prisma.monthlySnapshot.findFirst({ where: { month: testMonth } });
    steps.push({ step: 5, description: "Verify snapshot deleted", passed: !deleted });

  } catch (err) {
    steps.push({ step: steps.length + 1, description: "Unexpected error", passed: false, detail: (err as Error).message });
  } finally {
    if (testSnapshotId) {
      await prisma.snapshotEntry.deleteMany({ where: { snapshotId: testSnapshotId } }).catch(() => {});
      await prisma.monthlySnapshot.delete({ where: { id: testSnapshotId } }).catch(() => {});
    }
  }

  return { steps, passed: steps.every((s) => s.passed) };
}

const E2E_MAP: Record<string, () => Promise<{ steps: TestStep[]; passed: boolean }>> = {
  chef_lifecycle: chefLifecycleTest,
  score_recalculation: scoreRecalculationTest,
  snapshot_test: snapshotTest,
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const testName: string = body.test;

    if (testName === "all") {
      const allResults: Record<string, { steps: TestStep[]; passed: boolean; duration: number }> = {};
      let totalPassed = 0;
      let totalFailed = 0;

      for (const [name, fn] of Object.entries(E2E_MAP)) {
        const start = Date.now();
        try {
          const result = await fn();
          allResults[name] = { ...result, duration: Date.now() - start };
          if (result.passed) totalPassed++;
          else totalFailed++;

          await prisma.healthCheckLog.create({
            data: {
              category: "e2e_workflow",
              checkName: name,
              status: result.passed ? "pass" : "fail",
              totalChecks: result.steps.length,
              passedChecks: result.steps.filter((s) => s.passed).length,
              failedChecks: result.steps.filter((s) => !s.passed).length,
              details: JSON.stringify(result.steps).slice(0, 10000),
              duration: Date.now() - start,
            },
          }).catch(() => {});
        } catch (err) {
          allResults[name] = { steps: [{ step: 1, description: "Error", passed: false, detail: (err as Error).message }], passed: false, duration: Date.now() - start };
          totalFailed++;
        }
      }

      return NextResponse.json({ results: allResults, totalPassed, totalFailed });
    }

    const fn = E2E_MAP[testName];
    if (!fn) {
      return NextResponse.json({ error: `Unknown test: ${testName}` }, { status: 400 });
    }

    const start = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - start;

      await prisma.healthCheckLog.create({
        data: {
          category: "e2e_workflow",
          checkName: testName,
          status: result.passed ? "pass" : "fail",
          totalChecks: result.steps.length,
          passedChecks: result.steps.filter((s) => s.passed).length,
          failedChecks: result.steps.filter((s) => !s.passed).length,
          details: JSON.stringify(result.steps).slice(0, 10000),
          duration,
        },
      }).catch(() => {});

      return NextResponse.json({ test: testName, ...result, duration });
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message, test: testName }, { status: 500 });
    }
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || "Internal error" }, { status: 500 });
  }
}
