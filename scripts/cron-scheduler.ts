/**
 * Standalone cron scheduler for non-Vercel environments.
 * Runs weekly collection on Monday at 6 AM.
 *
 * Usage: npx tsx scripts/cron-scheduler.ts
 */

import cron from "node-cron";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { resolve } from "path";

const dbPath = resolve(__dirname, "..", "dev.db");
const adapter = new PrismaLibSql({ url: `file:${dbPath}` });
const prisma = new PrismaClient({ adapter });

console.log("Chef Ranker Cron Scheduler started.");
console.log("Scheduled: Weekly collection on Monday at 6:00 AM\n");

// Run every Monday at 6:00 AM
cron.schedule("0 6 * * 1", async () => {
  console.log(`[${new Date().toISOString()}] Starting weekly collection...`);

  try {
    // Dynamic import to avoid module resolution issues
    const { runCollection } = await import("../src/lib/collectors/orchestrator");
    const summary = await runCollection();

    console.log(`[${new Date().toISOString()}] Collection complete:`);
    console.log(`  Status: ${summary.status}`);
    console.log(`  Chefs processed: ${summary.totalChefsProcessed}`);
    console.log(`  New accolades: ${summary.newAccolades}`);
    console.log(`  Updated signals: ${summary.updatedSignals}`);
    console.log(`  New career entries: ${summary.newCareerEntries}`);
    console.log(`  New peer standings: ${summary.newPeerStandings}`);

    for (const log of summary.logs) {
      console.log(`  [${log.source}] ${log.status} - ${log.itemsFound} items (${log.durationMs}ms)`);
      if (log.errors.length > 0) {
        console.log(`    Errors: ${log.errors.join("; ")}`);
      }
    }
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Collection failed:`, (err as Error).message);
  }
});

// Keep process alive
process.on("SIGINT", async () => {
  console.log("\nShutting down cron scheduler...");
  await prisma.$disconnect();
  process.exit(0);
});
