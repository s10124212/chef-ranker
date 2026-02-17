import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { resolve } from "path";
import { mkdirSync, writeFileSync } from "fs";
import axios from "axios";
import * as cheerio from "cheerio";

// ---------------------------------------------------------------------------
// Database setup
// ---------------------------------------------------------------------------
const dbPath = resolve(__dirname, "..", "dev.db");
const adapter = new PrismaLibSql({ url: `file:${dbPath}` });
const prisma = new PrismaClient({ adapter });

// ---------------------------------------------------------------------------
// Category classification rules
// ---------------------------------------------------------------------------
const CATEGORY_RULES: [RegExp, string][] = [
  [/open(s|ing|ed)|new restaurant|launch(es|ed)|clos(es|ing|ed)|shutt(ing|ers)/i, "RESTAURANT"],
  [/award|michelin|james beard|wins|winner|star(s)?|best\s+(chef|restaurant|new)/i, "AWARD"],
  [/interview|talks?\s+to|speaks?|Q\s*&\s*A|conversation/i, "INTERVIEW"],
  [/TV|show|netflix|series|MasterChef|Top Chef|streaming|episode/i, "TV_MEDIA"],
  [/cookbook|book|publish(es|ed)|memoir|recipe\s+book/i, "COOKBOOK"],
  [/joins?|leaves?|appoint(ed|s)|new\s+role|hire[ds]?|depart(s|ure)/i, "JOB_CHANGE"],
  [/event|festival|pop-up|popup|gala|dinner\s+series/i, "EVENT"],
  [/profile|feature[ds]?|spotlight|story|behind/i, "FEATURE"],
];

function categorize(title: string): string {
  for (const [pattern, category] of CATEGORY_RULES) {
    if (pattern.test(title)) return category;
  }
  return "OTHER";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function stripHtml(html: string): string {
  const $ = cheerio.load(html);
  return $.text().trim();
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// RSS fetching & parsing
// ---------------------------------------------------------------------------
interface RssArticle {
  title: string;
  url: string;
  pubDate: string;
  description: string;
  source: string;
}

async function fetchChefNews(chefName: string): Promise<RssArticle[]> {
  const query = `"${chefName}" chef`;
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;

  const response = await axios.get(rssUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; ChefRankerBot/1.0)",
    },
    timeout: 15000,
  });

  const $ = cheerio.load(response.data, { xmlMode: true });
  const articles: RssArticle[] = [];

  $("item").each((_, el) => {
    const title = $(el).find("title").text().trim();
    const url = $(el).find("link").text().trim();
    const pubDate = $(el).find("pubDate").text().trim();
    const description = $(el).find("description").text().trim();
    const source = $(el).find("source").text().trim() || "Unknown";

    if (title && url) {
      articles.push({ title, url, pubDate, description, source });
    }
  });

  return articles;
}

// ---------------------------------------------------------------------------
// Main script
// ---------------------------------------------------------------------------
async function main() {
  console.log("=== Chef News Collector ===\n");

  // Fetch all non-archived chefs
  const chefs = await prisma.chef.findMany({
    where: { isArchived: false },
    select: { id: true, name: true, slug: true },
  });

  console.log(`Found ${chefs.length} active chefs.\n`);

  // Stats
  let totalFetched = 0;
  let totalNew = 0;
  let totalLinked = 0;

  // Collect all raw articles for the JSON backup
  const rawArticles: Array<RssArticle & { matchedChefs: string[] }> = [];

  // Get existing URLs in one query for deduplication
  const existingUrls = new Set(
    (await prisma.newsItem.findMany({ select: { url: true } })).map(
      (n) => n.url
    )
  );

  for (const chef of chefs) {
    console.log(`Fetching news for: ${chef.name}`);

    try {
      const articles = await fetchChefNews(chef.name);
      console.log(`  -> ${articles.length} articles found`);
      totalFetched += articles.length;

      for (const article of articles) {
        // Determine which chefs this article mentions
        const matchedChefs = chefs.filter((c) => {
          const haystack =
            (article.title + " " + article.description).toLowerCase();
          return haystack.includes(c.name.toLowerCase());
        });

        // Track for raw backup
        rawArticles.push({
          ...article,
          matchedChefs: matchedChefs.map((c) => c.name),
        });

        // Skip duplicates
        if (existingUrls.has(article.url)) {
          continue;
        }

        // Categorize
        const category = categorize(article.title);

        // Clean summary
        const cleanDescription = stripHtml(article.description);
        const summary = truncate(cleanDescription, 300);

        // Parse published date
        let publishedAt: Date;
        try {
          publishedAt = new Date(article.pubDate);
          if (isNaN(publishedAt.getTime())) {
            publishedAt = new Date();
          }
        } catch {
          publishedAt = new Date();
        }

        // Insert NewsItem
        try {
          const newsItem = await prisma.newsItem.create({
            data: {
              title: article.title,
              url: article.url,
              source: article.source,
              summary,
              category,
              publishedAt,
            },
          });

          existingUrls.add(article.url);
          totalNew++;

          // Create NewsItemChef links
          for (const matched of matchedChefs) {
            await prisma.newsItemChef.create({
              data: {
                newsItemId: newsItem.id,
                chefId: matched.id,
              },
            });
            totalLinked++;
          }
        } catch (err: unknown) {
          // Handle unique constraint violations gracefully
          const message =
            err instanceof Error ? err.message : String(err);
          if (message.includes("Unique constraint")) {
            existingUrls.add(article.url);
          } else {
            console.error(
              `  [ERROR] Failed to insert article "${article.title}": ${message}`
            );
          }
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  [ERROR] Failed to fetch news for ${chef.name}: ${message}`);
    }

    // Be polite to Google
    await sleep(500);
  }

  // ---------------------------------------------------------------------------
  // Write raw backup
  // ---------------------------------------------------------------------------
  const dataDir = resolve(__dirname, "..", "data");
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(
    resolve(dataDir, "news-raw.json"),
    JSON.stringify(rawArticles, null, 2),
    "utf-8"
  );
  console.log(`\nBackup written to data/news-raw.json`);

  // ---------------------------------------------------------------------------
  // Final stats
  // ---------------------------------------------------------------------------
  console.log("\n=== Stats ===");
  console.log(`Total articles fetched:       ${totalFetched}`);
  console.log(`New articles inserted:        ${totalNew}`);
  console.log(`Chef-article links created:   ${totalLinked}`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("Fatal error:", err);
  await prisma.$disconnect();
  process.exit(1);
});
