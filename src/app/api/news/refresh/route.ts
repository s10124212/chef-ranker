import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import axios from "axios";
import * as cheerio from "cheerio";

// --- Taste-relevance tagging (tagger, NOT filter) ---

// Exclusion overrides: if these match, force isTasteRelevant = false even if inclusion keywords match
const EXCLUSION_OVERRIDES = [
  /\b(dating|married|divorce|personal life|morning routine|grocery list|easy recipe|home cook|sponsored|listicle)\b/i,
  /\b(gossip|rumor|TMZ|paparazzi|scandal|arrest)\b/i,
  /\b(net worth|salary|weight loss|workout|fitness routine)\b/i,
  /\b(clickbait|you won't believe|shocking)\b/i,
  /\b(social media feud|twitter fight|claps back)\b/i,
];

function hasExclusionOverride(text: string): boolean {
  return EXCLUSION_OVERRIDES.some((p) => p.test(text));
}

// Inclusion rules: keyword pattern -> [points, category label]
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

interface TasteResult {
  isTasteRelevant: boolean;
  relevanceCategory: string | null;
  relevanceScore: number;
}

function evaluateTasteRelevance(title: string, summary: string, source: string): TasteResult {
  const text = `${title} ${summary}`;

  // Check exclusion override first
  if (hasExclusionOverride(text)) {
    return { isTasteRelevant: false, relevanceCategory: null, relevanceScore: 0 };
  }

  let score = 0;
  let topCategory: string | null = null;
  let topCategoryScore = 0;

  for (const [pattern, points, category] of TASTE_RULES) {
    if (pattern.test(text)) {
      score += points;
      if (points > topCategoryScore) {
        topCategoryScore = points;
        topCategory = category;
      }
    }
  }

  if (REPUTABLE_SOURCES.test(source)) {
    score += 10;
  }

  if (score === 0) {
    return { isTasteRelevant: false, relevanceCategory: null, relevanceScore: 0 };
  }

  // Add base score for matching at least one rule
  score = Math.min(score + 20, 100);

  return {
    isTasteRelevant: true,
    relevanceCategory: topCategory,
    relevanceScore: score,
  };
}

// --- Categorization ---

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
  for (const [pattern, category] of CATEGORY_RULES) {
    if (pattern.test(title)) return category;
  }
  return "OTHER";
}

function stripHtml(html: string): string {
  const $ = cheerio.load(html);
  return $.text().trim();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

interface RawArticle {
  title: string;
  url: string;
  source: string;
  summary: string;
  category: string;
  publishedAt: Date;
  matchedChefIds: string[];
  isTasteRelevant: boolean;
  relevanceCategory: string | null;
  relevanceScore: number;
}

export async function POST() {
  const chefs = await prisma.chef.findMany({
    where: { isArchived: false },
    select: { id: true, name: true },
  });

  const articles: RawArticle[] = [];
  const seenUrls = new Set<string>();
  const errors: string[] = [];

  // Phase 1: Fetch RSS feeds and collect ALL articles
  for (const chef of chefs) {
    try {
      const query = encodeURIComponent(`"${chef.name}" chef`);
      const rssUrl = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;

      const res = await axios.get(rssUrl, {
        timeout: 10000,
        headers: { "User-Agent": "ChefRanker/1.0" },
      });

      const $ = cheerio.load(res.data, { xml: true });
      const items = $("item");

      items.each((_, el) => {
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

        // Skip articles older than 10 years
        const tenYearsAgo = new Date();
        tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
        if (publishedAt < tenYearsAgo) return;

        // Tag taste relevance (never discard)
        const taste = evaluateTasteRelevance(title, summary, sourceName);

        // Match chefs mentioned
        const textToSearch = `${title} ${summary}`.toLowerCase();
        const matchedChefIds: string[] = [];
        for (const c of chefs) {
          if (textToSearch.includes(c.name.toLowerCase())) {
            matchedChefIds.push(c.id);
          }
        }
        if (!matchedChefIds.includes(chef.id)) {
          matchedChefIds.push(chef.id);
        }

        articles.push({
          title, url, source: sourceName, summary, category, publishedAt, matchedChefIds,
          isTasteRelevant: taste.isTasteRelevant,
          relevanceCategory: taste.relevanceCategory,
          relevanceScore: taste.relevanceScore,
        });
      });

      await sleep(500);
    } catch (err) {
      errors.push(`${chef.name}: ${(err as Error).message}`);
    }
  }

  // Phase 2: Insert ALL articles into database
  let totalNew = 0;
  let totalLinked = 0;
  let totalTasteRelevant = 0;

  for (const article of articles) {
    try {
      const existing = await prisma.newsItem.findUnique({ where: { url: article.url } });
      if (existing) continue;

      if (article.isTasteRelevant) totalTasteRelevant++;

      const newsItem = await prisma.newsItem.create({
        data: {
          title: article.title,
          url: article.url,
          source: article.source,
          summary: article.summary,
          category: article.category,
          publishedAt: article.publishedAt,
          isTasteRelevant: article.isTasteRelevant,
          relevanceCategory: article.relevanceCategory,
          relevanceScore: article.relevanceScore,
        },
      });

      for (const chefId of article.matchedChefIds) {
        try {
          await prisma.newsItemChef.create({
            data: { newsItemId: newsItem.id, chefId },
          });
          totalLinked++;
        } catch {
          // Duplicate link, skip
        }
      }

      totalNew++;
    } catch (err) {
      if (errors.length < 5) errors.push(`DB insert: ${(err as Error).message}`);
    }
  }

  return NextResponse.json({
    totalFetched: articles.length,
    totalNew,
    totalTasteRelevant,
    totalGeneral: totalNew - totalTasteRelevant,
    totalLinked,
    chefsSearched: chefs.length,
    errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
    timestamp: new Date().toISOString(),
  });
}
