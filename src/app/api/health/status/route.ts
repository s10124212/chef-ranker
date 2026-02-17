import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import axios from "axios";
import * as fs from "fs";
import * as path from "path";

interface ServiceStatus {
  name: string;
  status: "healthy" | "degraded" | "down";
  detail: string;
  responseTimeMs?: number;
  lastFetch?: string | null;
  extra?: Record<string, unknown>;
}

async function checkDatabase(): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    const [chefs, news, outreach, snapshots, accolades, contacts] = await Promise.all([
      prisma.chef.count({ where: { isArchived: false } }),
      prisma.newsItem.count(),
      prisma.outreachDraft.count(),
      prisma.monthlySnapshot.count(),
      prisma.accolade.count(),
      prisma.chefContact.count(),
    ]);
    const ms = Date.now() - start;
    return {
      name: "Database",
      status: ms > 2000 ? "degraded" : "healthy",
      detail: `Connected (${ms}ms)`,
      responseTimeMs: ms,
      extra: { chefs, news, outreach, snapshots, accolades, contacts },
    };
  } catch (err) {
    return { name: "Database", status: "down", detail: (err as Error).message, responseTimeMs: Date.now() - start };
  }
}

async function checkGoogleNews(): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    const res = await axios.get("https://news.google.com/rss/search?q=chef&hl=en-US&gl=US&ceid=US:en", {
      timeout: 10000,
      headers: { "User-Agent": "ChefRanker/1.0" },
    });
    const ms = Date.now() - start;
    const ok = res.status === 200 && res.data.includes("<item>");
    const lastFetch = await prisma.updateStepLog.findFirst({
      where: { stepName: "news_refresh", status: "success" },
      orderBy: { runAt: "desc" },
    });
    return {
      name: "Google News RSS",
      status: ok ? (ms > 5000 ? "degraded" : "healthy") : "down",
      detail: ok ? `Reachable (${ms}ms)` : "No items in response",
      responseTimeMs: ms,
      lastFetch: lastFetch?.runAt?.toISOString() || null,
    };
  } catch (err) {
    return { name: "Google News RSS", status: "down", detail: (err as Error).message, responseTimeMs: Date.now() - start };
  }
}

async function checkWikipedia(): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    const res = await axios.get(
      "https://en.wikipedia.org/w/api.php?action=query&format=json&titles=Chef&prop=extracts&exintro=true&explaintext=true",
      { timeout: 10000, headers: { "User-Agent": "ChefRanker/1.0 (health-check)" } }
    );
    const ms = Date.now() - start;
    return {
      name: "Wikipedia API",
      status: ms > 3000 ? "degraded" : "healthy",
      detail: `Reachable (${ms}ms)`,
      responseTimeMs: ms,
    };
  } catch (err) {
    return { name: "Wikipedia API", status: "down", detail: (err as Error).message, responseTimeMs: Date.now() - start };
  }
}

async function checkApiRoutes(): Promise<ServiceStatus> {
  const routes = [
    { path: "/api/chefs?limit=1", method: "GET" },
    { path: "/api/news?limit=1", method: "GET" },
    { path: "/api/stats", method: "GET" },
    { path: "/api/snapshots", method: "GET" },
    { path: "/api/scoring", method: "GET" },
    { path: "/api/update/log", method: "GET" },
  ];

  let passing = 0;
  let failing = 0;
  const failures: string[] = [];

  for (const route of routes) {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000";
      const res = await axios.get(`${baseUrl}${route.path}`, { timeout: 5000 });
      if (res.status >= 200 && res.status < 400) {
        passing++;
      } else {
        failing++;
        failures.push(`${route.path}: ${res.status}`);
      }
    } catch {
      failing++;
      failures.push(route.path);
    }
  }

  return {
    name: "API Routes",
    status: failing === 0 ? "healthy" : failing < routes.length ? "degraded" : "down",
    detail: `${passing}/${routes.length} passing`,
    extra: { passing, failing, total: routes.length, failures: failures.slice(0, 5) },
  };
}

async function getDataHealth() {
  const [
    totalChefs,
    scoredChefs,
    totalNews,
    tasteRelevantNews,
    totalOutreach,
    sentOutreach,
    pendingOutreach,
    contactCount,
    staleChefs,
    duplicateCheck,
    weightRows,
  ] = await Promise.all([
    prisma.chef.count({ where: { isArchived: false } }),
    prisma.chef.count({ where: { isArchived: false, totalScore: { gt: 0 } } }),
    prisma.newsItem.count(),
    prisma.newsItem.count({ where: { isTasteRelevant: true } }),
    prisma.outreachDraft.count(),
    prisma.outreachDraft.count({ where: { status: "sent" } }),
    prisma.outreachDraft.count({ where: { status: "drafted" } }),
    prisma.chefContact.count(),
    prisma.chef.count({
      where: {
        isArchived: false,
        updatedAt: { lt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) },
      },
    }),
    prisma.chef.findMany({
      where: { isArchived: false },
      select: { name: true },
    }),
    prisma.scoringWeight.findMany(),
  ]);

  const insufficientData = totalChefs - scoredChefs;

  // Check weights sum
  const weightSum = weightRows.reduce((s, w) => s + w.weight, 0);
  const weightsOk = weightRows.length === 0 || Math.abs(weightSum - 1) < 0.01;

  // Simple duplicate check (exact match only for perf)
  const names = duplicateCheck.map((c) => c.name.toLowerCase());
  const nameSet = new Set(names);
  const duplicates = names.length - nameSet.size;

  const warnings: string[] = [];
  const passes: string[] = [];

  if (staleChefs > 0) warnings.push(`${staleChefs} chefs not updated in 60+ days`);
  if (insufficientData > 0) warnings.push(`${insufficientData} chefs with no score data`);
  if (duplicates > 0) warnings.push(`${duplicates} possible duplicate profiles`);

  if (weightsOk) passes.push("All scoring weights valid");
  if (duplicates === 0) passes.push("No duplicate profiles detected");

  const totalChefsWithContact = contactCount;
  const contactCoverage = totalChefs > 0 ? Math.round((totalChefsWithContact / totalChefs) * 100) : 0;

  return {
    chefs: { total: totalChefs, scored: scoredChefs, insufficient: insufficientData },
    news: { total: totalNews, tasteRelevant: tasteRelevantNews },
    outreach: { total: totalOutreach, sent: sentOutreach, pending: pendingOutreach },
    contactCoverage: `${contactCoverage}%`,
    warnings,
    passes,
    staleChefs,
  };
}

function getDbFileSize(): string {
  try {
    const dbPath = path.resolve(process.cwd(), "dev.db");
    const stats = fs.statSync(dbPath);
    const mb = (stats.size / (1024 * 1024)).toFixed(2);
    return `${mb} MB`;
  } catch {
    return "unknown";
  }
}

export async function GET() {
  const [db, googleNews, wikipedia, apiRoutes, dataHealth] = await Promise.all([
    checkDatabase(),
    checkGoogleNews(),
    checkWikipedia(),
    checkApiRoutes(),
    getDataHealth(),
  ]);

  return NextResponse.json({
    services: [db, googleNews, wikipedia, apiRoutes],
    dataHealth,
    dbFileSize: getDbFileSize(),
    checkedAt: new Date().toISOString(),
  });
}
