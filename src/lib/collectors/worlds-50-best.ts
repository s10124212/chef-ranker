/**
 * World's 50 Best Restaurants collector: fetches ranked list and
 * cross-references against chefs' currentRestaurant field.
 */

import axios from "axios";
import * as cheerio from "cheerio";
import type { Collector, CollectionResult, CollectorChef } from "./types";
import { fetchWithRetry } from "./types";

interface RankedRestaurant {
  rank: number;
  name: string;
  chef?: string;
  city?: string;
}

export const worlds50BestCollector: Collector = {
  name: "World's 50 Best",

  async collect(chefs: CollectorChef[]): Promise<CollectionResult[]> {
    const results: CollectionResult[] = [];

    try {
      const response = await fetchWithRetry(
        () => axios.get("https://www.theworlds50best.com/list/1-50", {
          timeout: 15000,
          headers: { "User-Agent": "Mozilla/5.0 (compatible; ChefRankerBot/1.0)" },
        }),
      ) as { data: string };

      const $ = cheerio.load(response.data);
      const rankedRestaurants: RankedRestaurant[] = [];

      // Parse the ranked list entries
      $(".list-item, .restaurant-item, [class*='rank']").each((_, el) => {
        const text = $(el).text().trim();
        const rankMatch = text.match(/^(\d+)\b/);
        const rank = rankMatch ? parseInt(rankMatch[1]) : 0;

        // Try to extract restaurant name from headings or links
        const nameEl = $(el).find("h2, h3, a.name, .restaurant-name").first();
        const name = nameEl.text().trim() || text.split("\n")[0]?.trim() || "";

        if (rank > 0 && name) {
          rankedRestaurants.push({ rank, name });
        }
      });

      if (rankedRestaurants.length === 0) return results;

      // Cross-reference chefs by currentRestaurant
      for (const chef of chefs) {
        if (!chef.currentRestaurant) continue;

        const restaurantLower = chef.currentRestaurant.toLowerCase();
        const match = rankedRestaurants.find((r) =>
          r.name.toLowerCase().includes(restaurantLower) ||
          restaurantLower.includes(r.name.toLowerCase())
        );

        if (match) {
          results.push({
            chefId: chef.id,
            source: "World's 50 Best",
            accolades: [
              {
                type: "WORLDS_50_BEST",
                detail: `#${match.rank} World's 50 Best Restaurants`,
                year: new Date().getFullYear(),
                sourceUrl: "https://www.theworlds50best.com/list/1-50",
              },
            ],
          });
        }
      }
    } catch (err) {
      console.error(`[World's 50 Best] Failed to fetch list: ${(err as Error).message}`);
    }

    return results;
  },
};
