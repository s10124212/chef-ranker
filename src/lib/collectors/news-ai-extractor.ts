/**
 * News AI Extractor: processes recent NewsItem records using Claude
 * to extract structured accolade, career, signal, and peer data.
 */

import Anthropic from "@anthropic-ai/sdk";
import axios from "axios";
import * as cheerio from "cheerio";
import { prisma } from "@/lib/db";
import type { Collector, CollectionResult, CollectorChef } from "./types";
import { sleep, fetchWithRetry } from "./types";

const EXTRACTABLE_CATEGORIES = ["AWARD", "JOB_CHANGE", "COOKBOOK", "TV_MEDIA"];

const EXTRACTION_PROMPT = `You are a data extraction assistant for a chef ranking system. Given an article about a chef, extract any of the following structured data that is **explicitly stated** in the article. Do NOT infer or guess — only include data clearly mentioned.

Return a JSON object with these optional fields:
{
  "accolades": [
    {
      "type": "MICHELIN_STAR" | "JAMES_BEARD" | "WORLDS_50_BEST" | "BOCUSE_DOR" | "OTHER",
      "detail": "string (e.g. '2 stars', 'Best New Restaurant')",
      "year": number | null
    }
  ],
  "careerEntries": [
    {
      "role": "string",
      "restaurant": "string",
      "city": "string | null",
      "startYear": number | null,
      "isCurrent": boolean
    }
  ],
  "publicSignals": [
    {
      "platform": "INSTAGRAM" | "YOUTUBE" | "COOKBOOK" | "TV" | "OTHER",
      "metric": "string (e.g. '1.2M followers', '5 books published')",
      "value": number | null
    }
  ],
  "peerStandings": [
    {
      "type": "MENTORED_BY" | "MENTORED" | "COLLABORATION" | "ENDORSEMENT",
      "detail": "string",
      "relatedChef": "string | null"
    }
  ]
}

Only include fields that have data. Return empty object {} if nothing extractable is found. Return ONLY valid JSON, no markdown fences.`;

async function fetchArticleText(url: string): Promise<string> {
  const response = await fetchWithRetry(
    () => axios.get(url, {
      timeout: 10000,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ChefRankerBot/1.0)" },
      maxRedirects: 3,
    }),
  ) as { data: string };

  const $ = cheerio.load(response.data);

  // Remove non-content elements
  $("script, style, nav, footer, header, aside, .ad, .sidebar").remove();

  // Try common article selectors
  const selectors = ["article", '[role="main"]', ".post-content", ".article-body", "main"];
  for (const sel of selectors) {
    const text = $(sel).text().trim();
    if (text.length > 200) return text.slice(0, 5000);
  }

  // Fallback to body text
  return $("body").text().trim().slice(0, 5000);
}

export const newsAiExtractor: Collector = {
  name: "News AI Extractor",

  async collect(chefs: CollectorChef[]): Promise<CollectionResult[]> {
    const anthropic = new Anthropic();
    const results: CollectionResult[] = [];

    // Build chef name -> id lookup
    const chefNameMap = new Map<string, string>();
    for (const chef of chefs) {
      chefNameMap.set(chef.name.toLowerCase(), chef.id);
    }

    // Find unprocessed news items in extractable categories
    const newsItems = await prisma.newsItem.findMany({
      where: {
        dataExtracted: false,
        category: { in: EXTRACTABLE_CATEGORIES },
      },
      include: {
        chefs: { include: { chef: { select: { id: true, name: true } } } },
      },
      take: 50, // Process in batches
      orderBy: { publishedAt: "desc" },
    });

    if (newsItems.length === 0) return results;

    for (const item of newsItems) {
      try {
        // Fetch article text
        let articleText: string;
        try {
          articleText = await fetchArticleText(item.url);
        } catch {
          // If we can't fetch, use the summary
          articleText = item.summary || item.title;
        }

        if (articleText.length < 50) {
          await prisma.newsItem.update({
            where: { id: item.id },
            data: { dataExtracted: true },
          });
          continue;
        }

        // Call Claude for extraction
        const linkedChefNames = item.chefs.map((c) => c.chef.name).join(", ");
        const message = await anthropic.messages.create({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 1024,
          messages: [
            {
              role: "user",
              content: `${EXTRACTION_PROMPT}\n\nChef(s) this article is about: ${linkedChefNames}\nArticle title: ${item.title}\n\nArticle text:\n${articleText}`,
            },
          ],
        });

        const responseText = message.content[0].type === "text" ? message.content[0].text : "";
        let extracted: {
          accolades?: { type: string; detail?: string; year?: number }[];
          careerEntries?: { role: string; restaurant: string; city?: string; startYear?: number; isCurrent?: boolean }[];
          publicSignals?: { platform: string; metric?: string; value?: number }[];
          peerStandings?: { type: string; detail?: string; relatedChef?: string }[];
        };

        try {
          // Handle potential markdown fences
          const jsonStr = responseText.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
          extracted = JSON.parse(jsonStr);
        } catch {
          // Mark as processed even if parsing fails
          await prisma.newsItem.update({
            where: { id: item.id },
            data: { dataExtracted: true },
          });
          continue;
        }

        // Map extracted data to CollectionResults for each linked chef
        for (const chefLink of item.chefs) {
          const result: CollectionResult = {
            chefId: chefLink.chefId,
            source: "News AI Extractor",
          };

          if (extracted.accolades?.length) {
            result.accolades = extracted.accolades.map((a) => ({
              type: a.type,
              detail: a.detail,
              year: a.year,
              sourceUrl: item.url,
            }));
          }

          if (extracted.careerEntries?.length) {
            result.careerEntries = extracted.careerEntries.map((c) => ({
              role: c.role,
              restaurant: c.restaurant,
              city: c.city,
              startYear: c.startYear,
              isCurrent: c.isCurrent,
              sourceUrl: item.url,
            }));
          }

          if (extracted.publicSignals?.length) {
            result.publicSignals = extracted.publicSignals.map((s) => ({
              platform: s.platform,
              metric: s.metric,
              value: s.value,
              sourceUrl: item.url,
            }));
          }

          if (extracted.peerStandings?.length) {
            result.peerStandings = extracted.peerStandings.map((p) => ({
              type: p.type,
              detail: p.detail,
              relatedChef: p.relatedChef,
              sourceUrl: item.url,
            }));
          }

          // Only add if there's actual data
          if (result.accolades || result.careerEntries || result.publicSignals || result.peerStandings) {
            results.push(result);
          }
        }

        // Mark as processed
        await prisma.newsItem.update({
          where: { id: item.id },
          data: { dataExtracted: true },
        });

        await sleep(500);
      } catch (err) {
        // Per-item isolation: log and continue
        console.error(`[News AI Extractor] Failed to process "${item.title}": ${(err as Error).message}`);
      }
    }

    return results;
  },
};
