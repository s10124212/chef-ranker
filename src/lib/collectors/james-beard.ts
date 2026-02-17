/**
 * James Beard Awards collector: searches jamesbeard.org for award data.
 */

import axios from "axios";
import * as cheerio from "cheerio";
import type { Collector, CollectionResult, CollectorChef } from "./types";
import { sleep, fetchWithRetry } from "./types";

export const jamesBeardCollector: Collector = {
  name: "James Beard Awards",

  async collect(chefs: CollectorChef[]): Promise<CollectionResult[]> {
    const results: CollectionResult[] = [];

    for (const chef of chefs) {
      try {
        const searchUrl = `https://www.jamesbeard.org/awards/search?keyword=${encodeURIComponent(chef.name)}`;

        const response = await fetchWithRetry(
          () => axios.get(searchUrl, {
            timeout: 10000,
            headers: { "User-Agent": "Mozilla/5.0 (compatible; ChefRankerBot/1.0)" },
          }),
        ) as { data: string };

        const $ = cheerio.load(response.data);
        const accolades: CollectionResult["accolades"] = [];

        // Parse award result entries
        $(".c-award-recipient, .award-item, .search-result").each((_, el) => {
          const text = $(el).text().trim();
          const nameMatch = text.toLowerCase().includes(chef.name.toLowerCase());

          if (nameMatch) {
            // Extract year from text (4-digit number)
            const yearMatch = text.match(/\b(19|20)\d{2}\b/);
            const year = yearMatch ? parseInt(yearMatch[0]) : null;

            // Extract award detail
            const detailEl = $(el).find(".award-name, .c-award-recipient__award, h3, h4");
            const detail = detailEl.text().trim() || "James Beard Award";

            accolades.push({
              type: "JAMES_BEARD",
              detail,
              year: year ?? undefined,
              sourceUrl: searchUrl,
            });
          }
        });

        if (accolades.length > 0) {
          results.push({
            chefId: chef.id,
            source: "James Beard Awards",
            accolades,
          });
        }

        await sleep(500);
      } catch (err) {
        // Per-chef isolation: log and continue
        console.error(`[James Beard] Failed for ${chef.name}: ${(err as Error).message}`);
      }
    }

    return results;
  },
};
