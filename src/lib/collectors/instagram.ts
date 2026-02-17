/**
 * Instagram collector: fetches public profile pages to extract follower counts.
 * Expects ~50% failure rate — logs failures silently.
 */

import axios from "axios";
import * as cheerio from "cheerio";
import { prisma } from "@/lib/db";
import type { Collector, CollectionResult, CollectorChef } from "./types";
import { sleep } from "./types";

function parseFollowerCount(text: string): number | null {
  // Handle formats like "1.2M", "500K", "12,345", "1,234,567"
  const match = text.match(/([\d,.]+)\s*([MmKk])?/);
  if (!match) return null;

  let num = parseFloat(match[1].replace(/,/g, ""));
  const suffix = match[2]?.toUpperCase();
  if (suffix === "M") num *= 1_000_000;
  if (suffix === "K") num *= 1_000;

  return Math.round(num);
}

export const instagramCollector: Collector = {
  name: "Instagram",

  async collect(chefs: CollectorChef[]): Promise<CollectionResult[]> {
    const results: CollectionResult[] = [];

    // Get existing Instagram signals with profile URLs
    const existingSignals = await prisma.publicSignal.findMany({
      where: { platform: "INSTAGRAM" },
      select: { chefId: true, sourceUrl: true, metric: true },
    });

    // Build a map of chefId -> profile URL
    const profileMap = new Map<string, string>();
    for (const signal of existingSignals) {
      if (signal.sourceUrl?.includes("instagram.com")) {
        profileMap.set(signal.chefId, signal.sourceUrl);
      }
    }

    // Also try to construct URLs from chef names for those without stored URLs
    for (const chef of chefs) {
      if (profileMap.has(chef.id)) continue;
      // Only attempt if there's an existing Instagram signal (even without URL)
      const hasSignal = existingSignals.some((s) => s.chefId === chef.id);
      if (hasSignal) {
        // Try a username guess from the metric field or skip
        const signal = existingSignals.find((s) => s.chefId === chef.id);
        if (signal?.metric?.includes("@")) {
          const handle = signal.metric.match(/@(\w+)/)?.[1];
          if (handle) {
            profileMap.set(chef.id, `https://www.instagram.com/${handle}/`);
          }
        }
      }
    }

    for (const [chefId, profileUrl] of profileMap) {
      try {
        const response = await axios.get(profileUrl, {
          timeout: 10000,
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
          maxRedirects: 3,
        });

        const $ = cheerio.load(response.data);

        // Try meta tag extraction (most reliable for public profiles)
        let followerCount: number | null = null;

        // og:description often contains "X Followers"
        const ogDesc = $('meta[property="og:description"]').attr("content") || "";
        const followerMatch = ogDesc.match(/([\d,.]+[MmKk]?)\s*Followers/i);
        if (followerMatch) {
          followerCount = parseFollowerCount(followerMatch[1]);
        }

        // Also check meta description
        if (!followerCount) {
          const metaDesc = $('meta[name="description"]').attr("content") || "";
          const metaMatch = metaDesc.match(/([\d,.]+[MmKk]?)\s*Followers/i);
          if (metaMatch) {
            followerCount = parseFollowerCount(metaMatch[1]);
          }
        }

        if (followerCount && followerCount > 0) {
          const metric = followerCount >= 1_000_000
            ? `${(followerCount / 1_000_000).toFixed(1)}M followers`
            : followerCount >= 1_000
              ? `${(followerCount / 1_000).toFixed(0)}K followers`
              : `${followerCount} followers`;

          results.push({
            chefId,
            source: "Instagram",
            publicSignals: [
              {
                platform: "INSTAGRAM",
                metric,
                value: followerCount,
                sourceUrl: profileUrl,
              },
            ],
          });
        }

        await sleep(500);
      } catch {
        // Expected ~50% failure rate, log silently
      }
    }

    return results;
  },
};
