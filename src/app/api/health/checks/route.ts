import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getWeights, calculateBreakdown, calculateTotalScore } from "@/lib/scoring";
import axios from "axios";
import * as cheerio from "cheerio";

// ─── Data Health Checks ────────────────────────────────────────

async function dataCompleteness() {
  const chefs = await prisma.chef.findMany({
    where: { isArchived: false },
    select: {
      id: true, name: true, slug: true, city: true, country: true, currentRestaurant: true,
      cuisineSpecialties: true, yearsExperience: true, photoUrl: true, bio: true,
      _count: { select: { accolades: true, careerEntries: true, publicSignals: true, peerStandings: true } },
    },
  });

  const fields = ["city", "country", "currentRestaurant", "cuisineSpecialties", "yearsExperience", "photoUrl", "bio"];
  const results = chefs.map((chef) => {
    const filled = fields.filter((f) => (chef as Record<string, unknown>)[f] != null).length;
    const hasRelations = (chef._count.accolades > 0 ? 1 : 0) + (chef._count.careerEntries > 0 ? 1 : 0) +
      (chef._count.publicSignals > 0 ? 1 : 0) + (chef._count.peerStandings > 0 ? 1 : 0);
    const totalFields = fields.length + 4;
    const completeness = Math.round(((filled + hasRelations) / totalFields) * 100);
    const missing = fields.filter((f) => (chef as Record<string, unknown>)[f] == null);
    if (chef._count.accolades === 0) missing.push("accolades");
    if (chef._count.careerEntries === 0) missing.push("careerEntries");
    if (chef._count.publicSignals === 0) missing.push("publicSignals");
    if (chef._count.peerStandings === 0) missing.push("peerStandings");
    return { name: chef.name, slug: chef.slug, completeness, missing };
  });

  results.sort((a, b) => a.completeness - b.completeness);
  const avg = results.length > 0 ? Math.round(results.reduce((s, r) => s + r.completeness, 0) / results.length) : 0;
  const insufficient = results.filter((r) => r.completeness < 40);

  return { results, averageCompleteness: avg, insufficientCount: insufficient.length };
}

async function staleDataCheck() {
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const stale = await prisma.chef.findMany({
    where: { isArchived: false, updatedAt: { lt: sixtyDaysAgo } },
    select: { name: true, slug: true, updatedAt: true },
    orderBy: { updatedAt: "asc" },
  });

  return stale.map((c) => ({
    name: c.name,
    slug: c.slug,
    lastUpdated: c.updatedAt.toISOString(),
    daysSinceUpdate: Math.floor((Date.now() - c.updatedAt.getTime()) / (24 * 60 * 60 * 1000)),
  }));
}

async function orphanedRecords() {
  const orphanedNews = await prisma.newsItem.count({
    where: { chefs: { none: {} } },
  });
  const allChefIds = new Set((await prisma.chef.findMany({ select: { id: true } })).map((c) => c.id));
  const accoladeChefIds = await prisma.accolade.findMany({ select: { chefId: true }, distinct: ["chefId"] });
  const orphanedAccolades = accoladeChefIds.filter((a) => !allChefIds.has(a.chefId)).length;

  return { orphanedNews, orphanedAccolades };
}

async function contactCoverage() {
  const contacts = await prisma.chefContact.findMany({
    select: { chefId: true, email: true, agentEmail: true, restaurantEmail: true },
  });
  const contactMap = new Map(contacts.map((c) => [c.chefId, c]));

  const chefIds = await prisma.chef.findMany({
    where: { isArchived: false },
    select: { id: true, name: true, slug: true },
  });

  const results = chefIds.map((chef) => {
    const contact = contactMap.get(chef.id);
    return {
      name: chef.name,
      slug: chef.slug,
      hasEmail: !!contact?.email,
      hasAgentEmail: !!contact?.agentEmail,
      hasRestaurantEmail: !!contact?.restaurantEmail,
      hasAnyContact: !!(contact?.email || contact?.agentEmail || contact?.restaurantEmail),
    };
  });

  results.sort((a, b) => (a.hasAnyContact === b.hasAnyContact ? 0 : a.hasAnyContact ? 1 : -1));
  const withContact = results.filter((r) => r.hasAnyContact).length;
  const coveragePercent = results.length > 0 ? Math.round((withContact / results.length) * 100) : 0;

  return { results, coveragePercent, total: results.length, withContact };
}

// ─── Scoring Sanity Checks ─────────────────────────────────────

async function floorCeilingTests() {
  const chefs = await prisma.chef.findMany({
    where: { isArchived: false },
    include: { accolades: true, careerEntries: true, publicSignals: true, peerStandings: true },
  });

  const violations: { rule: string; chef: string; slug: string; score: number }[] = [];

  for (const chef of chefs) {
    const score = chef.totalScore;
    const has3Stars = chef.accolades.some((a) => a.type === "MICHELIN_STAR" && a.detail?.includes("3"));
    const has2Stars = chef.accolades.some((a) => a.type === "MICHELIN_STAR" && a.detail?.includes("2"));
    const noAccolades = chef.accolades.length === 0;
    const emptyCats = [
      chef.accolades.length === 0,
      chef.careerEntries.length === 0,
      chef.publicSignals.length === 0,
      chef.peerStandings.length === 0,
    ].filter(Boolean).length;

    if (has3Stars && score < 75) violations.push({ rule: "3-star Michelin chef below 75", chef: chef.name, slug: chef.slug, score });
    if (has2Stars && score < 60) violations.push({ rule: "2-star Michelin chef below 60", chef: chef.name, slug: chef.slug, score });
    if (noAccolades && score > 60) violations.push({ rule: "Zero accolades but score above 60", chef: chef.name, slug: chef.slug, score });
    if (emptyCats >= 2 && score > 50) violations.push({ rule: "2+ empty categories but score above 50", chef: chef.name, slug: chef.slug, score });
  }

  return {
    rules: [
      { rule: "3-star Michelin chef should score >= 75", passed: !violations.some((v) => v.rule.includes("3-star")) },
      { rule: "2-star Michelin chef should score >= 60", passed: !violations.some((v) => v.rule.includes("2-star")) },
      { rule: "Zero accolades should score <= 60", passed: !violations.some((v) => v.rule.includes("Zero accolades")) },
      { rule: "2+ empty categories should score <= 50", passed: !violations.some((v) => v.rule.includes("empty categories")) },
    ],
    violations,
  };
}

async function weightValidation() {
  const weights = await getWeights();
  const entries = Object.entries(weights);
  const sum = entries.reduce((s, [, v]) => s + v, 0);
  const issues: string[] = [];

  if (Math.abs(sum - 1) > 0.01) issues.push(`Weights sum to ${(sum * 100).toFixed(1)}%, expected 100%`);
  for (const [key, val] of entries) {
    if (val === 0) issues.push(`${key} weight is 0% (category ignored)`);
    if (val > 0.5) issues.push(`${key} weight is ${(val * 100).toFixed(0)}% (dominates scoring)`);
  }

  return { weights, sum: Math.round(sum * 100), issues, valid: issues.length === 0 };
}

async function scoreDistribution() {
  const chefs = await prisma.chef.findMany({
    where: { isArchived: false, totalScore: { gt: 0 } },
    select: { totalScore: true },
  });

  const scores = chefs.map((c) => c.totalScore);
  const buckets = [0, 0, 0, 0, 0]; // 0-20, 20-40, 40-60, 60-80, 80-100
  for (const s of scores) {
    const idx = Math.min(4, Math.floor(s / 20));
    buckets[idx]++;
  }

  const warnings: string[] = [];
  const total = scores.length;
  if (total > 0) {
    const maxBucket = Math.max(...buckets);
    if (maxBucket / total > 0.5) warnings.push("More than 50% of scores in a single bucket — too clustered");
    if (!scores.some((s) => s >= 80)) warnings.push("No scores above 80 — range may be too narrow");
    if (!scores.some((s) => s < 30)) warnings.push("No scores below 30 — range may be too narrow");
  }

  const sorted = [...scores].sort((a, b) => a - b);
  const mean = total > 0 ? Math.round((scores.reduce((s, v) => s + v, 0) / total) * 10) / 10 : 0;
  const median = total > 0 ? sorted[Math.floor(total / 2)] : 0;
  const min = total > 0 ? sorted[0] : 0;
  const max = total > 0 ? sorted[total - 1] : 0;

  return {
    buckets: [
      { range: "0-20", count: buckets[0] },
      { range: "20-40", count: buckets[1] },
      { range: "40-60", count: buckets[2] },
      { range: "60-80", count: buckets[3] },
      { range: "80-100", count: buckets[4] },
    ],
    stats: { mean, median, min, max, total },
    warnings,
  };
}

async function rankVolatility() {
  const lastSnapshot = await prisma.monthlySnapshot.findFirst({
    orderBy: { month: "desc" },
    include: { entries: { include: { chef: true } } },
  });

  if (!lastSnapshot) return { changes: [], snapshotMonth: null };

  const currentChefs = await prisma.chef.findMany({
    where: { isArchived: false, rank: { not: null } },
    select: { id: true, name: true, slug: true, rank: true, totalScore: true },
  });

  const snapshotRankMap = new Map(lastSnapshot.entries.map((e) => [e.chefId, e.rank]));
  const changes = currentChefs
    .map((chef) => {
      const prevRank = snapshotRankMap.get(chef.id);
      if (prevRank == null || chef.rank == null) return null;
      const change = prevRank - chef.rank;
      return { name: chef.name, slug: chef.slug, previousRank: prevRank, currentRank: chef.rank, change };
    })
    .filter((c): c is NonNullable<typeof c> => c != null && Math.abs(c.change) > 0)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

  return { changes, snapshotMonth: lastSnapshot.month };
}

async function emptyBreakdown() {
  const chefs = await prisma.chef.findMany({
    where: { isArchived: false },
    include: { accolades: true, careerEntries: true, publicSignals: true, peerStandings: true },
    orderBy: { totalScore: "desc" },
  });

  const results = chefs.map((chef) => {
    const breakdown = calculateBreakdown(chef);
    const categories = {
      formalAccolades: breakdown.formalAccolades > 0,
      careerTrack: breakdown.careerTrack > 0,
      publicSignals: breakdown.publicSignals > 0,
      peerStanding: breakdown.peerStanding > 0,
    };
    const filledCount = Object.values(categories).filter(Boolean).length;
    const emptyCount = 4 - filledCount;
    return {
      name: chef.name,
      slug: chef.slug,
      score: chef.totalScore,
      filledCategories: filledCount,
      emptyCategories: emptyCount,
      categories,
    };
  });

  return results.filter((r) => r.filledCategories < 2);
}

// ─── News Quality Checks ───────────────────────────────────────

async function newsFreshness() {
  const lastNewsRefresh = await prisma.updateStepLog.findFirst({
    where: { stepName: "news_refresh", status: "success" },
    orderBy: { runAt: "desc" },
  });

  const latestArticle = await prisma.newsItem.findFirst({
    orderBy: { publishedAt: "desc" },
    select: { publishedAt: true },
  });

  // Simpler query: count chefs that have NO news links at all, or whose latest is old
  const chefsWithNews = await prisma.newsItemChef.findMany({
    select: { chefId: true },
    distinct: ["chefId"],
  });
  const chefsWithNewsSet = new Set(chefsWithNews.map((c) => c.chefId));
  const allChefs = await prisma.chef.findMany({
    where: { isArchived: false },
    select: { id: true, name: true, slug: true },
  });
  const chefsWithNoNews = allChefs.filter((c) => !chefsWithNewsSet.has(c.id));

  return {
    lastRefresh: lastNewsRefresh?.runAt?.toISOString() || null,
    latestArticle: latestArticle?.publishedAt?.toISOString() || null,
    chefsWithNoRecentNews: chefsWithNoNews.slice(0, 20),
    chefsWithNoRecentNewsCount: chefsWithNoNews.length,
  };
}

async function duplicateArticles() {
  const articles = await prisma.newsItem.findMany({
    select: { id: true, title: true, url: true, source: true },
    orderBy: { publishedAt: "desc" },
    take: 500,
  });

  const duplicates: { titleA: string; titleB: string; sourceA: string; sourceB: string }[] = [];

  const normalized = articles.map((a) => ({
    ...a,
    norm: a.title.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim(),
  }));

  for (let i = 0; i < normalized.length; i++) {
    for (let j = i + 1; j < normalized.length; j++) {
      if (normalized[i].norm === normalized[j].norm) {
        duplicates.push({
          titleA: articles[i].title,
          titleB: articles[j].title,
          sourceA: articles[i].source,
          sourceB: articles[j].source,
        });
      }
    }
    if (duplicates.length >= 20) break;
  }

  return { count: duplicates.length, duplicates: duplicates.slice(0, 20) };
}

// ─── Data Connector Health Checks ───────────────────────────────

async function checkMichelinConnector() {
  const start = Date.now();
  try {
    // Ping the Michelin Guide search page with a known chef
    const res = await axios.get(
      "https://guide.michelin.com/en/restaurants?q=ducasse",
      {
        timeout: 10000,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; ChefRankerBot/1.0)" },
        validateStatus: () => true,
      }
    );
    const ms = Date.now() - start;
    const $ = cheerio.load(res.data);
    const hasContent = $("body").text().length > 500;
    const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

    return {
      status: res.status === 200 && hasContent ? "reachable" : "degraded",
      httpStatus: res.status,
      responseTimeMs: ms,
      hasContent,
      hasAnthropicKey: hasApiKey,
      note: !hasApiKey ? "Anthropic API key missing — Claude fallback won't work" : undefined,
    };
  } catch (err) {
    return {
      status: "unreachable",
      error: (err as Error).message,
      responseTimeMs: Date.now() - start,
      hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    };
  }
}

async function checkJamesBeardConnector() {
  const start = Date.now();
  try {
    const res = await axios.get(
      "https://www.jamesbeard.org/awards/search?keyword=test",
      {
        timeout: 10000,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; ChefRankerBot/1.0)" },
        validateStatus: () => true,
      }
    );
    const ms = Date.now() - start;
    const $ = cheerio.load(res.data);
    const hasSearchForm = $("form").length > 0 || $("[class*='search']").length > 0;

    return {
      status: res.status === 200 ? "reachable" : "degraded",
      httpStatus: res.status,
      responseTimeMs: ms,
      hasSearchForm,
    };
  } catch (err) {
    return {
      status: "unreachable",
      error: (err as Error).message,
      responseTimeMs: Date.now() - start,
    };
  }
}

async function checkWorlds50BestConnector() {
  const start = Date.now();
  try {
    const res = await axios.get(
      "https://www.theworlds50best.com/list/1-50",
      {
        timeout: 15000,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; ChefRankerBot/1.0)" },
        validateStatus: () => true,
      }
    );
    const ms = Date.now() - start;
    const $ = cheerio.load(res.data);
    const hasListItems = $(".list-item, .restaurant-item, [class*='rank']").length > 0;
    const bodyLength = $("body").text().length;

    return {
      status: res.status === 200 && bodyLength > 1000 ? "reachable" : "degraded",
      httpStatus: res.status,
      responseTimeMs: ms,
      hasListItems,
      contentLength: bodyLength,
    };
  } catch (err) {
    return {
      status: "unreachable",
      error: (err as Error).message,
      responseTimeMs: Date.now() - start,
    };
  }
}

async function checkInstagramConnector() {
  const start = Date.now();
  try {
    // Test with a well-known public chef account
    const res = await axios.get("https://www.instagram.com/gordongram/", {
      timeout: 10000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      maxRedirects: 3,
      validateStatus: () => true,
    });
    const ms = Date.now() - start;
    const $ = cheerio.load(res.data);
    const ogDesc = $('meta[property="og:description"]').attr("content") || "";
    const hasFollowers = /followers/i.test(ogDesc);

    // Check how many chefs have Instagram signals
    const igSignals = await prisma.publicSignal.count({ where: { platform: "INSTAGRAM" } });

    return {
      status: res.status === 200 ? (hasFollowers ? "reachable" : "degraded") : "degraded",
      httpStatus: res.status,
      responseTimeMs: ms,
      canExtractFollowers: hasFollowers,
      existingInstagramSignals: igSignals,
      note: "Instagram scraping has ~50% expected failure rate",
    };
  } catch (err) {
    return {
      status: "unreachable",
      error: (err as Error).message,
      responseTimeMs: Date.now() - start,
      note: "Instagram blocks many automated requests — this is expected",
    };
  }
}

async function checkNewsAiExtractor() {
  const start = Date.now();
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

  // Count unprocessed items (without actually processing them)
  const unprocessedCount = await prisma.newsItem.count({
    where: {
      dataExtracted: false,
      category: { in: ["AWARD", "JOB_CHANGE", "COOKBOOK", "TV_MEDIA"] },
    },
  });

  const processedCount = await prisma.newsItem.count({
    where: { dataExtracted: true },
  });

  const lastProcessed = await prisma.newsItem.findFirst({
    where: { dataExtracted: true },
    orderBy: { fetchedAt: "desc" },
    select: { fetchedAt: true, title: true },
  });

  return {
    status: hasApiKey ? (unprocessedCount > 50 ? "degraded" : "reachable") : "degraded",
    hasAnthropicKey: hasApiKey,
    unprocessedItems: unprocessedCount,
    processedItems: processedCount,
    lastProcessed: lastProcessed?.fetchedAt?.toISOString() || null,
    lastProcessedTitle: lastProcessed?.title || null,
    responseTimeMs: Date.now() - start,
    note: !hasApiKey ? "Anthropic API key missing — extraction won't work" : undefined,
  };
}

// ─── Router ────────────────────────────────────────────────────

const CHECK_MAP: Record<string, () => Promise<unknown>> = {
  data_completeness: dataCompleteness,
  stale_data: staleDataCheck,
  orphaned_records: orphanedRecords,
  contact_coverage: contactCoverage,
  floor_ceiling: floorCeilingTests,
  weight_validation: weightValidation,
  score_distribution: scoreDistribution,
  rank_volatility: rankVolatility,
  empty_breakdown: emptyBreakdown,
  news_freshness: newsFreshness,
  duplicate_articles: duplicateArticles,
  connector_michelin: checkMichelinConnector,
  connector_james_beard: checkJamesBeardConnector,
  connector_worlds_50_best: checkWorlds50BestConnector,
  connector_instagram: checkInstagramConnector,
  connector_news_ai: checkNewsAiExtractor,
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const checkName: string = body.check;

    if (checkName === "all") {
      const start = Date.now();
      const results: Record<string, unknown> = {};
      let totalPassed = 0;
      let totalFailed = 0;

      for (const [name, fn] of Object.entries(CHECK_MAP)) {
        try {
          results[name] = await fn();
          totalPassed++;
        } catch (err) {
          results[name] = { error: (err as Error).message };
          totalFailed++;
        }
      }

      const duration = Date.now() - start;
      await prisma.healthCheckLog.create({
        data: {
          category: "all",
          checkName: "full_health_check",
          status: totalFailed === 0 ? "pass" : "warning",
          totalChecks: totalPassed + totalFailed,
          passedChecks: totalPassed,
          failedChecks: totalFailed,
          details: JSON.stringify({ summary: true }),
          duration,
        },
      }).catch(() => {});

      return NextResponse.json({ results, totalPassed, totalFailed, duration });
    }

    const fn = CHECK_MAP[checkName];
    if (!fn) {
      return NextResponse.json({ error: `Unknown check: ${checkName}` }, { status: 400 });
    }

    const start = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - start;

      const category = ["data_completeness", "stale_data", "orphaned_records", "contact_coverage"].includes(checkName)
        ? "data_health"
        : ["floor_ceiling", "weight_validation", "score_distribution", "rank_volatility", "empty_breakdown"].includes(checkName)
        ? "scoring"
        : checkName.startsWith("connector_")
        ? "connectors"
        : "news_quality";

      await prisma.healthCheckLog.create({
        data: {
          category,
          checkName,
          status: "pass",
          details: JSON.stringify(result).slice(0, 10000),
          duration,
        },
      }).catch(() => {});

      return NextResponse.json({ check: checkName, result, duration });
    } catch (err) {
      const duration = Date.now() - start;
      await prisma.healthCheckLog.create({
        data: {
          category: "unknown",
          checkName,
          status: "fail",
          details: (err as Error).message,
          duration,
        },
      }).catch(() => {});
      return NextResponse.json({ check: checkName, error: (err as Error).message, duration }, { status: 500 });
    }
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || "Internal error" }, { status: 500 });
  }
}
