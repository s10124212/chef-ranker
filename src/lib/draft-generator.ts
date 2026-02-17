import Anthropic from "@anthropic-ai/sdk";

export interface ChefProfile {
  name: string;
  currentRestaurant: string | null;
  city: string | null;
  country: string | null;
  cuisineSpecialties: string | null;
  totalScore: number;
  yearsExperience: number | null;
  bio: string | null;
  accolades: { type: string; detail: string | null; year: number | null }[];
  careerEntries: { role: string; restaurant: string; city: string | null; startYear: number | null; endYear: number | null; isCurrent: boolean }[];
  newsItems?: { newsItem: { title: string; source: string; publishedAt: string | Date; category: string; summary: string | null } }[];
}

export interface SenderInfo {
  name: string;
  title: string;
  company: string;
}

export interface OutreachConfig {
  purpose: string;
  tone: string; // "professional" | "casual" | "warm"
  maxWords: number;
}

export interface GeneratedDraft {
  subject: string;
  body: string;
  dataPointsUsed: string[];
  confidence: "high" | "medium" | "low";
}

function accoladeLabel(type: string, detail: string | null): string {
  switch (type) {
    case "MICHELIN_STAR": return `Michelin ${detail || "Star"}`;
    case "JAMES_BEARD": return detail || "James Beard Award";
    case "WORLDS_50_BEST": return detail || "World's 50 Best";
    case "BOCUSE_DOR": return detail || "Bocuse d'Or";
    default: return detail || type;
  }
}

function assessConfidence(chef: ChefProfile): "high" | "medium" | "low" {
  let signals = 0;
  if (chef.accolades.length > 0) signals++;
  if (chef.accolades.length > 2) signals++;
  if (chef.careerEntries.length > 0) signals++;
  if (chef.newsItems && chef.newsItems.length > 0) signals++;
  if (chef.bio) signals++;
  if (chef.currentRestaurant) signals++;

  if (signals >= 4) return "high";
  if (signals >= 2) return "medium";
  return "low";
}

function extractDataPoints(chef: ChefProfile): string[] {
  const points: string[] = [];

  for (const a of chef.accolades.slice(0, 3)) {
    points.push(accoladeLabel(a.type, a.detail) + (a.year ? ` (${a.year})` : ""));
  }

  if (chef.currentRestaurant) {
    points.push(`Current restaurant: ${chef.currentRestaurant}`);
  }

  if (chef.newsItems) {
    for (const n of chef.newsItems.slice(0, 2)) {
      points.push(`${n.newsItem.source} article: "${n.newsItem.title}"`);
    }
  }

  const currentRole = chef.careerEntries.find((c) => c.isCurrent);
  if (currentRole) {
    points.push(`${currentRole.role} at ${currentRole.restaurant}`);
  }

  return points;
}

function buildPrompt(
  chef: ChefProfile,
  sender: SenderInfo,
  config: OutreachConfig,
  previousDraftBody?: string
): string {
  const topAccolade = chef.accolades.length > 0
    ? accoladeLabel(chef.accolades[0].type, chef.accolades[0].detail)
    : "none";

  const cuisines = chef.cuisineSpecialties
    ? (() => { try { return JSON.parse(chef.cuisineSpecialties).join(", "); } catch { return chef.cuisineSpecialties; } })()
    : "not specified";

  const careerHighlights = chef.careerEntries
    .slice(0, 4)
    .map((c) => `${c.role} at ${c.restaurant}${c.city ? ` (${c.city})` : ""}${c.isCurrent ? " [current]" : ""}`)
    .join("; ");

  const recentNews = chef.newsItems && chef.newsItems.length > 0
    ? chef.newsItems.slice(0, 3).map((n) =>
        `"${n.newsItem.title}" (${n.newsItem.source}, ${new Date(n.newsItem.publishedAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })})${n.newsItem.summary ? ` — ${n.newsItem.summary}` : ""}`
      ).join("\n    - ")
    : "No recent news available";

  const toneGuide = {
    professional: "Use a professional, polished tone. Formal but not stiff.",
    casual: "Use a casual, friendly tone. Like texting a colleague you respect.",
    warm: "Use a warm, genuine tone. Friendly and respectful, like a handwritten note.",
  }[config.tone] || "Use a warm, genuine tone.";

  let regenerateInstruction = "";
  if (previousDraftBody) {
    regenerateInstruction = `
IMPORTANT — REGENERATION:
The previous draft for this chef said:
"""
${previousDraftBody}
"""
Write a COMPLETELY DIFFERENT email. Use a different opening angle, reference different data points, and take a fresh approach. Do NOT repeat any phrases or structure from the previous draft.
`;
  }

  return `You are writing a personalized outreach email to a top chef for user research purposes.

ABOUT THE CHEF:
- Name: ${chef.name}
- Restaurant: ${chef.currentRestaurant || "Unknown"}
- City: ${[chef.city, chef.country].filter(Boolean).join(", ") || "Unknown"}
- Cuisine: ${cuisines}
- Top Accolade: ${topAccolade}
- Chef Score: ${chef.totalScore.toFixed(1)}/100
- Years of Experience: ${chef.yearsExperience || "Unknown"}
- Career Highlights: ${careerHighlights || "Not available"}
- Recent News:
    - ${recentNews}
${chef.bio ? `- Bio: ${chef.bio}` : ""}

ABOUT THE SENDER:
- Name: ${sender.name || "[Your Name]"}
- Title: ${sender.title || "[Your Title]"}
- Company: ${sender.company || "[Your Company]"}

PURPOSE:
${config.purpose}

TONE: ${toneGuide}

MAX LENGTH: ${config.maxWords} words for the body.
${regenerateInstruction}
RULES:
1. Open with a specific, genuine reference to their work — mention a REAL accolade, recent news item, or career detail from the data above. NOT generic flattery.
2. Keep the body under ${config.maxWords} words. 3-4 short paragraphs max.
3. Clearly ask for a 15-minute call about their experience with assistants and day-to-day support.
4. Sound like a real person wrote this, not a mass email. Be conversational.
5. Make it easy to say yes — suggest a quick call, offer flexibility.
6. Don't be salesy. This is genuine research.
7. Use the chef's first name in the greeting.
8. The subject line should reference something specific about the chef.

Return ONLY a JSON object with exactly two fields:
{
  "subject": "the subject line",
  "body": "the full email body"
}

No markdown, no code fences, no explanation — just the JSON object.`;
}

export async function generateOutreachDraft(
  chef: ChefProfile,
  sender: SenderInfo,
  config: OutreachConfig,
  previousDraftBody?: string
): Promise<GeneratedDraft> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set. Add it in Settings or .env file.");
  }

  const client = new Anthropic({ apiKey });
  const prompt = buildPrompt(chef, sender, config, previousDraftBody);
  const dataPointsUsed = extractDataPoints(chef);
  const confidence = assessConfidence(chef);

  const message = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  let parsed: { subject: string; body: string };
  try {
    // Try to extract JSON even if there's surrounding text
    const jsonMatch = text.match(/\{[\s\S]*"subject"[\s\S]*"body"[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error("No JSON found in response");
    }
  } catch {
    throw new Error(`Failed to parse AI response. Raw: ${text.slice(0, 200)}`);
  }

  return {
    subject: parsed.subject,
    body: parsed.body,
    dataPointsUsed,
    confidence,
  };
}
