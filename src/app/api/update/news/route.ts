import { prisma } from "@/lib/db";
import axios from "axios";
import * as cheerio from "cheerio";

// Reuse taste-relevance logic from the main refresh route
const EXCLUSION_OVERRIDES = [
  /\b(dating|married|divorce|personal life|morning routine|grocery list|easy recipe|home cook|sponsored|listicle)\b/i,
  /\b(gossip|rumor|TMZ|paparazzi|scandal|arrest)\b/i,
  /\b(net worth|salary|weight loss|workout|fitness routine)\b/i,
  /\b(clickbait|you won't believe|shocking)\b/i,
  /\b(social media feud|twitter fight|claps back)\b/i,
];

const TASTE_RULES: [RegExp, number, string][] = [
  [/michelin|james beard|world'?s 50 best|bocuse|award|wins|winner|nominated|best chef|best restaurant/i, 30, "Award"],
  [/open(s|ing|ed)|new restaurant|clos(es|ing|ed)|shutt(ers|ing)|debut|launch(es|ed)/i, 20, "Restaurant Opening"],
  [/joins?|leaves?|departs?|appoint(ed|s)|hired|new\s+role|executive chef|steps?\s+down|retires?/i, 20, "Career Move"],
  [/cookbook|new book|publish(es|ed)|bestseller/i, 15, "Publication"],
  [/new menu|tasting menu|technique|innovation|pioneering|movement|signature dish/i, 15, "Innovation"],
  [/guest chef|pop-up|collaborat(ion|ed)|festival|keynote|symposium/i, 15, "Collaboration"],
  [/netflix|documentary|tv show|series|premiere|streaming/i, 10, "Media Milestone"],
  [/review|critic|stars|rating/i, 10, "Review"],
  [/interview|feature[ds]?|profile|spotlight/i, 10, "Feature"],
  [/mentor|protege|prot\u00e9g\u00e9/i, 10, "Mentorship"],
];

const REPUTABLE_SOURCES = /eater|bon app[eé]tit|new york times|nyt|food & wine|food and wine/i;

function evaluateTaste(title: string, summary: string, source: string) {
  const text = `${title} ${summary}`;
  if (EXCLUSION_OVERRIDES.some((p) => p.test(text))) return { isTasteRelevant: false, relevanceCategory: null, relevanceScore: 0 };
  let score = 0; let topCat: string | null = null; let topScore = 0;
  for (const [p, pts, cat] of TASTE_RULES) { if (p.test(text)) { score += pts; if (pts > topScore) { topScore = pts; topCat = cat; } } }
  if (REPUTABLE_SOURCES.test(source)) score += 10;
  if (score === 0) return { isTasteRelevant: false, relevanceCategory: null, relevanceScore: 0 };
  return { isTasteRelevant: true, relevanceCategory: topCat, relevanceScore: Math.min(score + 20, 100) };
}

const CATEGORY_RULES: [RegExp, string][] = [
  [/open(s|ing|ed)|new restaurant|launch(es|ed)|clos(es|ing|ed)|shutt(ing|ers)/i, "RESTAURANT"],
  [/award|michelin|james beard|wins|winner|star(s)?|best\s+(chef|restaurant|new)/i, "AWARD"],
  [/interview|talks?\s+to|speaks?|Q\s*&\s*A|conversation/i, "INTERVIEW"],
  [/TV|show|netflix|series|MasterChef|Top Chef|streaming|episode/i, "TV_MEDIA"],
  [/cookbook|book|publish(es|ed)|memoir|recipe\s+book/i, "COOKBOOK"],
  [/joins?|leaves?|appoint(ed|s)|new\s+role|hire[ds]?|depart(s|ure)/i, "JOB_CHANGE"],
  [/event|festival|pop-up|popup|gala|dinner\s+series/i, "EVENT"],
  [/innovation|technique|molecular|ferment|sustainability|zero-waste/i, "INNOVATION"],
  [/collaborat(ion|ed)|partnered|teamed up|joint venture/i, "COLLABORATION"],
  [/profile|feature[ds]?|spotlight|story|behind/i, "FEATURE"],
];

function categorize(title: string): string {
  for (const [p, c] of CATEGORY_RULES) if (p.test(title)) return c;
  return "OTHER";
}

function stripHtml(html: string): string { const $ = cheerio.load(html); return $.text().trim(); }

export async function POST() {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      try {
        const chefs = await prisma.chef.findMany({ where: { isArchived: false }, select: { id: true, name: true } });
        const total = chefs.length;
        const seenUrls = new Set<string>();
        const articles: { title: string; url: string; source: string; summary: string; category: string; publishedAt: Date; matchedChefIds: string[]; isTasteRelevant: boolean; relevanceCategory: string | null; relevanceScore: number }[] = [];

        for (let i = 0; i < chefs.length; i++) {
          const chef = chefs[i];
          send({ type: "progress", current: i, total, message: `Fetching news for ${chef.name}...` });

          try {
            const query = encodeURIComponent(`"${chef.name}" chef`);
            const rssUrl = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;
            const res = await axios.get(rssUrl, { timeout: 10000, headers: { "User-Agent": "ChefRanker/1.0" } });
            const $ = cheerio.load(res.data, { xml: true });

            $("item").each((_, el) => {
              const title = $(el).find("title").text().trim();
              const url = $(el).find("link").text().trim();
              const pubDate = $(el).find("pubDate").text().trim();
              const description = $(el).find("description").text().trim();
              const sourceName = $(el).find("source").text().trim() || "Unknown";

              if (!title || !url || seenUrls.has(url)) return;
              seenUrls.add(url);

              const summary = stripHtml(description).slice(0, 300);
              const category = categorize(title);
              const publishedAt = pubDate ? new Date(pubDate) : new Date();
              const taste = evaluateTaste(title, summary, sourceName);

              const textToSearch = `${title} ${summary}`.toLowerCase();
              const matchedChefIds: string[] = [];
              for (const c of chefs) if (textToSearch.includes(c.name.toLowerCase())) matchedChefIds.push(c.id);
              if (!matchedChefIds.includes(chef.id)) matchedChefIds.push(chef.id);

              articles.push({ title, url, source: sourceName, summary, category, publishedAt, matchedChefIds, ...taste });
            });

            await new Promise((r) => setTimeout(r, 300));
          } catch {
            // Skip failed chef
          }
        }

        send({ type: "progress", current: total, total, message: "Saving articles..." });

        let totalNew = 0, totalTasteRelevant = 0;
        for (const article of articles) {
          try {
            const existing = await prisma.newsItem.findUnique({ where: { url: article.url } });
            if (existing) continue;
            if (article.isTasteRelevant) totalTasteRelevant++;
            const newsItem = await prisma.newsItem.create({
              data: {
                title: article.title, url: article.url, source: article.source, summary: article.summary,
                category: article.category, publishedAt: article.publishedAt,
                isTasteRelevant: article.isTasteRelevant, relevanceCategory: article.relevanceCategory, relevanceScore: article.relevanceScore,
              },
            });
            for (const chefId of article.matchedChefIds) {
              try { await prisma.newsItemChef.create({ data: { newsItemId: newsItem.id, chefId } }); } catch { /* dup */ }
            }
            totalNew++;
          } catch { /* dup url */ }
        }

        const resultSummary = `Found ${totalNew} new articles. ${totalTasteRelevant} taste-relevant.`;
        await prisma.updateStepLog.create({
          data: { stepName: "news_refresh", status: "success", resultSummary, itemsAffected: totalNew },
        });

        send({ type: "complete", resultSummary, itemsAffected: totalNew, totalTasteRelevant });
      } catch (err) {
        const msg = (err as Error).message;
        await prisma.updateStepLog.create({ data: { stepName: "news_refresh", status: "error", resultSummary: msg } }).catch(() => {});
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
