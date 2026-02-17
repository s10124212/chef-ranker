/**
 * Michelin Guide collector: searches guide.michelin.com for each chef.
 * Falls back to Google RSS search for Michelin site mentions.
 */

import Anthropic from "@anthropic-ai/sdk";
import axios from "axios";
import * as cheerio from "cheerio";
import type { Collector, CollectionResult, CollectorChef } from "./types";
import { sleep, fetchWithRetry } from "./types";

export const michelinCollector: Collector = {
  name: "Michelin Guide",

  async collect(chefs: CollectorChef[]): Promise<CollectionResult[]> {
    const results: CollectionResult[] = [];

    for (const chef of chefs) {
      try {
        const accolades = await searchMichelin(chef);
        if (accolades.length > 0) {
          results.push({
            chefId: chef.id,
            source: "Michelin Guide",
            accolades,
          });
        }
        await sleep(500);
      } catch (err) {
        console.error(`[Michelin] Failed for ${chef.name}: ${(err as Error).message}`);
      }
    }

    return results;
  },
};

async function searchMichelin(
  chef: CollectorChef
): Promise<NonNullable<CollectionResult["accolades"]>> {
  // Primary: search guide.michelin.com directly
  try {
    const searchUrl = `https://guide.michelin.com/en/restaurants?q=${encodeURIComponent(chef.name)}`;
    const response = await fetchWithRetry(
      () => axios.get(searchUrl, {
        timeout: 10000,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; ChefRankerBot/1.0)" },
      }),
    ) as { data: string };

    const $ = cheerio.load(response.data);
    const accolades: NonNullable<CollectionResult["accolades"]> = [];

    // Look for star indicators in restaurant cards
    $(".card__menu-content, .restaurant-card, [class*='restaurant']").each((_, el) => {
      const text = $(el).text().toLowerCase();
      const nameInCard = text.includes(chef.name.toLowerCase()) ||
        (chef.currentRestaurant && text.includes(chef.currentRestaurant.toLowerCase()));

      if (nameInCard) {
        // Count star icons or look for star text
        const starIcons = $(el).find('[class*="star"], .michelin-star, svg[class*="star"]').length;
        const starTextMatch = text.match(/(\d)\s*star/);
        const stars = starIcons || (starTextMatch ? parseInt(starTextMatch[1]) : 0);

        if (stars > 0) {
          accolades.push({
            type: "MICHELIN_STAR",
            detail: `${stars} star${stars > 1 ? "s" : ""}`,
            sourceUrl: searchUrl,
          });
        }
      }
    });

    if (accolades.length > 0) return accolades;
  } catch {
    // Primary search failed, try fallback
  }

  // Fallback: Google RSS search for Michelin mentions
  return searchMichelinViaGoogle(chef);
}

async function searchMichelinViaGoogle(
  chef: CollectorChef
): Promise<NonNullable<CollectionResult["accolades"]>> {
  try {
    const query = encodeURIComponent(`"${chef.name}" site:guide.michelin.com`);
    const rssUrl = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;

    const response = await fetchWithRetry(
      () => axios.get(rssUrl, {
        timeout: 10000,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; ChefRankerBot/1.0)" },
      }),
    ) as { data: string };

    const $ = cheerio.load(response.data, { xml: true });
    const snippets: string[] = [];

    $("item").each((_, el) => {
      const title = $(el).find("title").text();
      const desc = $(el).find("description").text();
      snippets.push(`${title} ${desc}`);
    });

    if (snippets.length === 0) return [];

    // Use Claude to extract star info from snippets
    const anthropic = new Anthropic();
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: `From these search snippets about "${chef.name}" on the Michelin Guide, extract ONLY explicitly mentioned Michelin star counts. Return JSON: {"stars": number} or {} if no star count is explicitly mentioned.\n\nSnippets:\n${snippets.join("\n").slice(0, 2000)}`,
        },
      ],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";
    const jsonStr = text.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(jsonStr);

    if (parsed.stars && parsed.stars > 0) {
      return [
        {
          type: "MICHELIN_STAR",
          detail: `${parsed.stars} star${parsed.stars > 1 ? "s" : ""}`,
          sourceUrl: `https://guide.michelin.com`,
        },
      ];
    }
  } catch {
    // Fallback also failed, return empty
  }

  return [];
}
