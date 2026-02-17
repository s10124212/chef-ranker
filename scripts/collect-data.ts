/**
 * CLI wrapper for the data collection orchestrator.
 * Runs all collectors and prints results.
 *
 * Usage: npx tsx scripts/collect-data.ts
 */

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { resolve } from "path";

// Database setup (same pattern as collect-news.ts)
const dbPath = resolve(__dirname, "..", "dev.db");
const adapter = new PrismaLibSql({ url: `file:${dbPath}` });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("=== Chef Ranker Data Collection ===\n");

  // Dynamic import to use the orchestrator
  const { runCollection } = await import("../src/lib/collectors/orchestrator");
  const summary = await runCollection();

  console.log(`\nStatus: ${summary.status}`);
  console.log(`Chefs processed: ${summary.totalChefsProcessed}`);
  console.log(`New accolades: ${summary.newAccolades}`);
  console.log(`Updated signals: ${summary.updatedSignals}`);
  console.log(`New career entries: ${summary.newCareerEntries}`);
  console.log(`New peer standings: ${summary.newPeerStandings}`);

  console.log("\n--- Source Details ---");
  for (const log of summary.logs) {
    const statusIcon = log.status === "SUCCESS" ? "✓" : log.status === "PARTIAL" ? "~" : "✗";
    console.log(`  [${statusIcon}] ${log.source}: ${log.itemsFound} items (${log.durationMs}ms)`);
    if (log.errors.length > 0) {
      for (const err of log.errors) {
        console.log(`      Error: ${err}`);
      }
    }
  }

  console.log(`\nTimestamp: ${summary.timestamp}`);
  console.log("\nCollection complete.");

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("Fatal error:", err);
  await prisma.$disconnect();
  process.exit(1);
});
