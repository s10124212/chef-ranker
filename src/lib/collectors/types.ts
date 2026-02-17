/**
 * Shared types for the collector module system.
 */

export interface CollectionResult {
  chefId: string;
  source: string;
  accolades?: {
    type: string;
    detail?: string;
    year?: number;
    sourceUrl?: string;
  }[];
  careerEntries?: {
    role: string;
    restaurant: string;
    city?: string;
    startYear?: number;
    endYear?: number;
    isCurrent?: boolean;
    sourceUrl?: string;
  }[];
  publicSignals?: {
    platform: string;
    metric?: string;
    value?: number;
    sourceUrl?: string;
  }[];
  peerStandings?: {
    type: string;
    detail?: string;
    relatedChef?: string;
    sourceUrl?: string;
  }[];
}

export interface CollectorLog {
  source: string;
  status: "SUCCESS" | "FAILED" | "PARTIAL";
  itemsFound: number;
  errors: string[];
  durationMs: number;
}

export interface CollectionSummary {
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  totalChefsProcessed: number;
  newAccolades: number;
  updatedSignals: number;
  newCareerEntries: number;
  newPeerStandings: number;
  logs: CollectorLog[];
  timestamp: string;
}

export interface Collector {
  name: string;
  collect(chefs: CollectorChef[]): Promise<CollectionResult[]>;
}

export interface CollectorChef {
  id: string;
  name: string;
  slug: string;
  currentRestaurant: string | null;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithRetry(
  fn: () => Promise<unknown>,
  retries = 3,
  baseDelayMs = 1000
): Promise<unknown> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries - 1) throw err;
      await sleep(baseDelayMs * Math.pow(2, attempt));
    }
  }
  throw new Error("Unreachable");
}
