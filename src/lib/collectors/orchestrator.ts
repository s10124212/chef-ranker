/**
 * Orchestrator: runs all collectors, deduplicates results, upserts into database.
 */

import { prisma } from "@/lib/db";
import type {
  Collector,
  CollectionResult,
  CollectionSummary,
  CollectorChef,
  CollectorLog,
} from "./types";
import { newsAiExtractor } from "./news-ai-extractor";
import { jamesBeardCollector } from "./james-beard";
import { worlds50BestCollector } from "./worlds-50-best";
import { michelinCollector } from "./michelin";
import { instagramCollector } from "./instagram";

const ALL_COLLECTORS: Collector[] = [
  newsAiExtractor,
  michelinCollector,
  jamesBeardCollector,
  worlds50BestCollector,
  instagramCollector,
];

export async function runCollection(): Promise<CollectionSummary> {
  const chefs: CollectorChef[] = await prisma.chef.findMany({
    where: { isArchived: false },
    select: { id: true, name: true, slug: true, currentRestaurant: true },
  });

  const logs: CollectorLog[] = [];
  const allResults: CollectionResult[] = [];

  for (const collector of ALL_COLLECTORS) {
    const start = Date.now();
    const log: CollectorLog = {
      source: collector.name,
      status: "SUCCESS",
      itemsFound: 0,
      errors: [],
      durationMs: 0,
    };

    try {
      const results = await collector.collect(chefs);
      log.itemsFound = results.length;
      allResults.push(...results);
    } catch (err) {
      log.status = "FAILED";
      log.errors.push((err as Error).message);
    }

    log.durationMs = Date.now() - start;
    logs.push(log);

    // Log to DataSource
    await prisma.dataSource.create({
      data: {
        name: collector.name,
        fetchedAt: new Date(),
        status: log.status,
        notes: log.errors.length > 0
          ? `Errors: ${log.errors.slice(0, 5).join("; ")}`
          : `Found ${log.itemsFound} items in ${log.durationMs}ms`,
      },
    });
  }

  // Deduplicate and upsert results
  const stats = await upsertResults(allResults);

  const hasSuccess = logs.some((l) => l.status === "SUCCESS");
  const hasFailed = logs.some((l) => l.status === "FAILED");
  const overallStatus = hasSuccess && hasFailed ? "PARTIAL" : hasFailed ? "FAILED" : "SUCCESS";

  return {
    status: overallStatus,
    totalChefsProcessed: chefs.length,
    newAccolades: stats.newAccolades,
    updatedSignals: stats.updatedSignals,
    newCareerEntries: stats.newCareerEntries,
    newPeerStandings: stats.newPeerStandings,
    logs,
    timestamp: new Date().toISOString(),
  };
}

interface UpsertStats {
  newAccolades: number;
  updatedSignals: number;
  newCareerEntries: number;
  newPeerStandings: number;
}

async function upsertResults(results: CollectionResult[]): Promise<UpsertStats> {
  const stats: UpsertStats = {
    newAccolades: 0,
    updatedSignals: 0,
    newCareerEntries: 0,
    newPeerStandings: 0,
  };

  for (const result of results) {
    // Accolades: skip if same chefId + type + detail + year exists
    if (result.accolades) {
      for (const accolade of result.accolades) {
        const existing = await prisma.accolade.findFirst({
          where: {
            chefId: result.chefId,
            type: accolade.type,
            detail: accolade.detail || null,
            year: accolade.year || null,
          },
        });
        if (!existing) {
          await prisma.accolade.create({
            data: {
              chefId: result.chefId,
              type: accolade.type,
              detail: accolade.detail || null,
              year: accolade.year || null,
              sourceUrl: accolade.sourceUrl || null,
            },
          });
          stats.newAccolades++;
        }
      }
    }

    // PublicSignal: upsert by chefId + platform (update value if newer)
    if (result.publicSignals) {
      for (const signal of result.publicSignals) {
        const existing = await prisma.publicSignal.findFirst({
          where: {
            chefId: result.chefId,
            platform: signal.platform,
          },
        });
        if (existing) {
          await prisma.publicSignal.update({
            where: { id: existing.id },
            data: {
              metric: signal.metric || existing.metric,
              value: signal.value ?? existing.value,
              sourceUrl: signal.sourceUrl || existing.sourceUrl,
            },
          });
          stats.updatedSignals++;
        } else {
          await prisma.publicSignal.create({
            data: {
              chefId: result.chefId,
              platform: signal.platform,
              metric: signal.metric || null,
              value: signal.value ?? null,
              sourceUrl: signal.sourceUrl || null,
            },
          });
          stats.updatedSignals++;
        }
      }
    }

    // CareerEntry: skip if same chefId + restaurant + role exists
    if (result.careerEntries) {
      for (const entry of result.careerEntries) {
        const existing = await prisma.careerEntry.findFirst({
          where: {
            chefId: result.chefId,
            restaurant: entry.restaurant,
            role: entry.role,
          },
        });
        if (!existing) {
          await prisma.careerEntry.create({
            data: {
              chefId: result.chefId,
              role: entry.role,
              restaurant: entry.restaurant,
              city: entry.city || null,
              startYear: entry.startYear || null,
              endYear: entry.endYear || null,
              isCurrent: entry.isCurrent || false,
              sourceUrl: entry.sourceUrl || null,
            },
          });
          stats.newCareerEntries++;
        }
      }
    }

    // PeerStanding: skip if same chefId + type + relatedChef exists
    if (result.peerStandings) {
      for (const peer of result.peerStandings) {
        const existing = await prisma.peerStanding.findFirst({
          where: {
            chefId: result.chefId,
            type: peer.type,
            relatedChef: peer.relatedChef || null,
          },
        });
        if (!existing) {
          await prisma.peerStanding.create({
            data: {
              chefId: result.chefId,
              type: peer.type,
              detail: peer.detail || null,
              relatedChef: peer.relatedChef || null,
              sourceUrl: peer.sourceUrl || null,
            },
          });
          stats.newPeerStandings++;
        }
      }
    }
  }

  return stats;
}
