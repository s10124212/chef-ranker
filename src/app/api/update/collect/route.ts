import { prisma } from "@/lib/db";
import type { Collector, CollectionResult, CollectorChef, CollectorLog } from "@/lib/collectors/types";
import { newsAiExtractor } from "@/lib/collectors/news-ai-extractor";
import { jamesBeardCollector } from "@/lib/collectors/james-beard";
import { worlds50BestCollector } from "@/lib/collectors/worlds-50-best";
import { michelinCollector } from "@/lib/collectors/michelin";
import { instagramCollector } from "@/lib/collectors/instagram";

const ALL_COLLECTORS: Collector[] = [
  newsAiExtractor,
  michelinCollector,
  jamesBeardCollector,
  worlds50BestCollector,
  instagramCollector,
];

export async function POST() {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      try {
        const chefs: CollectorChef[] = await prisma.chef.findMany({
          where: { isArchived: false },
          select: { id: true, name: true, slug: true, currentRestaurant: true },
        });

        const total = ALL_COLLECTORS.length;
        const allResults: CollectionResult[] = [];
        const logs: CollectorLog[] = [];

        for (let i = 0; i < ALL_COLLECTORS.length; i++) {
          const collector = ALL_COLLECTORS[i];
          send({
            type: "progress",
            current: i,
            total,
            message: `Running ${collector.name}...`,
          });

          const log: CollectorLog = {
            source: collector.name,
            status: "SUCCESS",
            itemsFound: 0,
            errors: [],
            durationMs: 0,
          };

          const start = Date.now();
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

        send({ type: "progress", current: total, total, message: "Saving results..." });

        // Upsert results
        let newAccolades = 0, updatedSignals = 0, newCareerEntries = 0, newPeerStandings = 0;
        for (const result of allResults) {
          if (result.accolades) {
            for (const accolade of result.accolades) {
              const existing = await prisma.accolade.findFirst({
                where: { chefId: result.chefId, type: accolade.type, detail: accolade.detail || null, year: accolade.year || null },
              });
              if (!existing) {
                await prisma.accolade.create({ data: { chefId: result.chefId, type: accolade.type, detail: accolade.detail || null, year: accolade.year || null, sourceUrl: accolade.sourceUrl || null } });
                newAccolades++;
              }
            }
          }
          if (result.publicSignals) {
            for (const signal of result.publicSignals) {
              const existing = await prisma.publicSignal.findFirst({ where: { chefId: result.chefId, platform: signal.platform } });
              if (existing) {
                await prisma.publicSignal.update({ where: { id: existing.id }, data: { metric: signal.metric || existing.metric, value: signal.value ?? existing.value, sourceUrl: signal.sourceUrl || existing.sourceUrl } });
              } else {
                await prisma.publicSignal.create({ data: { chefId: result.chefId, platform: signal.platform, metric: signal.metric || null, value: signal.value ?? null, sourceUrl: signal.sourceUrl || null } });
              }
              updatedSignals++;
            }
          }
          if (result.careerEntries) {
            for (const entry of result.careerEntries) {
              const existing = await prisma.careerEntry.findFirst({ where: { chefId: result.chefId, restaurant: entry.restaurant, role: entry.role } });
              if (!existing) {
                await prisma.careerEntry.create({ data: { chefId: result.chefId, role: entry.role, restaurant: entry.restaurant, city: entry.city || null, startYear: entry.startYear || null, endYear: entry.endYear || null, isCurrent: entry.isCurrent || false, sourceUrl: entry.sourceUrl || null } });
                newCareerEntries++;
              }
            }
          }
          if (result.peerStandings) {
            for (const peer of result.peerStandings) {
              const existing = await prisma.peerStanding.findFirst({ where: { chefId: result.chefId, type: peer.type, relatedChef: peer.relatedChef || null } });
              if (!existing) {
                await prisma.peerStanding.create({ data: { chefId: result.chefId, type: peer.type, detail: peer.detail || null, relatedChef: peer.relatedChef || null, sourceUrl: peer.sourceUrl || null } });
                newPeerStandings++;
              }
            }
          }
        }

        const totalItems = newAccolades + updatedSignals + newCareerEntries + newPeerStandings;
        const summary = [
          newAccolades > 0 ? `${newAccolades} accolades` : null,
          updatedSignals > 0 ? `${updatedSignals} signals` : null,
          newCareerEntries > 0 ? `${newCareerEntries} career entries` : null,
          newPeerStandings > 0 ? `${newPeerStandings} peer standings` : null,
        ].filter(Boolean).join(", ") || "No new data found";

        const resultSummary = `Updated ${chefs.length} chefs. ${summary}.`;

        await prisma.updateStepLog.create({
          data: { stepName: "data_collection", status: "success", resultSummary, itemsAffected: totalItems },
        });

        send({ type: "complete", resultSummary, itemsAffected: totalItems });
      } catch (err) {
        const msg = (err as Error).message;
        await prisma.updateStepLog.create({
          data: { stepName: "data_collection", status: "error", resultSummary: msg },
        }).catch(() => {});
        send({ type: "error", message: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
