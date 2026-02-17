import crypto from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { Resend } from "resend";
import { prisma } from "@/lib/db";

// --- Types ---

interface DigestStory {
  title: string;
  url: string;
  source: string;
  category: string;
  chefNames: string[];
  summary: string;
}

interface RankingMove {
  chefName: string;
  from: number;
  to: number;
}

interface AccoladeAlert {
  chefName: string;
  detail: string;
}

interface DigestContent {
  intro: string;
  stories: DigestStory[];
  rankingMoves: RankingMove[];
  accoladeAlerts: AccoladeAlert[];
  date: string;
}

// --- Token helpers ---

export function generateToken(email: string): string {
  const secret = process.env.RESEND_API_KEY || "secret";
  return crypto.createHmac("sha256", secret).update(email).digest("hex");
}

export function verifyToken(email: string, token: string): boolean {
  const expected = generateToken(email);
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
}

// --- Digest content generation ---

export async function generateDigestContent(): Promise<DigestContent | null> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Fetch recent news items with related chefs
  const newsItems = await prisma.newsItem.findMany({
    where: {
      publishedAt: { gte: twentyFourHoursAgo },
    },
    include: {
      chefs: {
        include: {
          chef: {
            select: { name: true, slug: true },
          },
        },
      },
    },
    orderBy: { publishedAt: "desc" },
  });

  if (newsItems.length < 2) {
    return null;
  }

  // Fetch ranking changes from this week
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentSnapshots = await prisma.snapshotEntry.findMany({
    where: {
      createdAt: { gte: oneWeekAgo },
      delta: { not: null },
    },
    include: {
      chef: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const rankingMoves: RankingMove[] = recentSnapshots
    .filter((entry) => entry.delta !== null && entry.delta !== 0)
    .map((entry) => ({
      chefName: entry.chef.name,
      from: entry.rank + (entry.delta ?? 0),
      to: entry.rank,
    }));

  // Fetch new accolades from last 24 hours
  const recentAccolades = await prisma.accolade.findMany({
    where: {
      createdAt: { gte: twentyFourHoursAgo },
    },
    include: {
      chef: { select: { name: true } },
    },
  });

  const accoladeAlerts: AccoladeAlert[] = recentAccolades.map((a) => ({
    chefName: a.chef.name,
    detail: a.detail
      ? `${a.type}: ${a.detail}`
      : a.type,
  }));

  // Use Anthropic to curate and summarize
  const anthropic = new Anthropic();

  const newsPayload = newsItems.map((item) => ({
    title: item.title,
    url: item.url,
    source: item.source,
    category: item.category,
    summary: item.summary || null,
    chefs: item.chefs.map((c) => c.chef.name),
  }));

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `You are a culinary news editor. Given these news items from the last 24 hours, curate a daily digest.

NEWS ITEMS:
${JSON.stringify(newsPayload, null, 2)}

Instructions:
1. Select the top 10 most newsworthy items (or all if fewer than 10).
2. Rank by importance: awards > restaurant openings > features > routine news.
3. For any item missing a summary, write a 2-3 sentence summary.
4. If there's a common theme across the stories, generate a brief intro line (1 sentence). Otherwise set intro to an empty string.

Return ONLY valid JSON — no markdown, no comments, no trailing commas. Escape any special characters in strings. Use this exact format:
{"intro":"string or empty","stories":[{"title":"string","url":"string","source":"string","category":"string","chefNames":["string"],"summary":"string"}]}`,
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Anthropic");
  }

  let parsed: { intro: string; stories: DigestStory[] };
  const rawText = textBlock.text.trim();

  function extractAndParse(text: string): { intro: string; stories: DigestStory[] } {
    // Strip markdown code fences if present
    let clean = text.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
    // Find the JSON object
    const jsonStart = clean.indexOf("{");
    const jsonEnd = clean.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd <= jsonStart) {
      throw new Error("No JSON object found in response");
    }
    clean = clean.slice(jsonStart, jsonEnd + 1);
    // Fix common JSON issues: trailing commas
    clean = clean.replace(/,\s*([}\]])/g, "$1");
    return JSON.parse(clean);
  }

  try {
    parsed = extractAndParse(rawText);
  } catch (parseErr) {
    // Fallback: ask the model again with a simpler prompt using just the raw news
    console.error("JSON parse failed, building digest from raw data");
    parsed = {
      intro: "",
      stories: newsItems.slice(0, 10).map((item) => ({
        title: item.title,
        url: item.url,
        source: item.source,
        category: item.category,
        chefNames: item.chefs.map((c) => c.chef.name),
        summary: item.summary || "Read more at the link.",
      })),
    };
  }

  const today = new Date();
  const dateStr = today.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return {
    intro: parsed.intro,
    stories: parsed.stories,
    rankingMoves,
    accoladeAlerts,
    date: dateStr,
  };
}

// --- HTML email builder ---

export function buildDigestHtml(
  content: DigestContent,
  appUrl: string,
  unsubscribeUrl: string
): string {
  const categoryColors: Record<string, string> = {
    AWARD: "#dc2626",
    RESTAURANT: "#059669",
    FEATURE: "#7c3aed",
    INTERVIEW: "#0891b2",
    TV_MEDIA: "#d97706",
    COOKBOOK: "#be185d",
    EVENT: "#4f46e5",
    JOB_CHANGE: "#0d9488",
    OTHER: "#6b7280",
  };

  const storiesHtml = content.stories
    .map((story, i) => {
      const badgeColor = categoryColors[story.category] || "#6b7280";
      const chefLine =
        story.chefNames.length > 0
          ? `<p style="margin:0 0 4px 0;font-size:13px;color:#6b7280;">${story.chefNames.join(", ")}</p>`
          : "";
      return `
      <tr>
        <td style="padding:16px 0;border-bottom:1px solid #e5e7eb;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td style="vertical-align:top;width:28px;padding-right:12px;">
                <span style="display:inline-block;width:24px;height:24px;border-radius:50%;background:#2563eb;color:#ffffff;font-size:12px;font-weight:700;line-height:24px;text-align:center;">${i + 1}</span>
              </td>
              <td>
                <a href="${story.url}" style="color:#111827;font-size:16px;font-weight:600;text-decoration:none;line-height:1.3;">${story.title}</a>
                <br/>
                ${chefLine}
                <p style="margin:4px 0 0 0;font-size:13px;color:#6b7280;">
                  ${story.source}
                  <span style="display:inline-block;margin-left:8px;padding:1px 8px;border-radius:9999px;background:${badgeColor};color:#ffffff;font-size:11px;font-weight:600;text-transform:uppercase;">${story.category.replace(/_/g, " ")}</span>
                </p>
                <p style="margin:8px 0 0 0;font-size:14px;color:#374151;line-height:1.5;">${story.summary}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
    })
    .join("");

  let rankingMovesHtml = "";
  if (content.rankingMoves.length > 0) {
    const movesRows = content.rankingMoves
      .map((move) => {
        const isUp = move.to < move.from;
        const arrow = isUp ? "&#9650;" : "&#9660;";
        const arrowColor = isUp ? "#059669" : "#dc2626";
        const diff = Math.abs(move.from - move.to);
        return `
        <tr>
          <td style="padding:8px 0;font-size:14px;color:#374151;">
            <span style="color:${arrowColor};font-size:16px;">${arrow}</span>
            <strong>${move.chefName}</strong>
            <span style="color:#6b7280;"> #${move.from} &rarr; #${move.to} (${isUp ? "+" : "-"}${diff})</span>
          </td>
        </tr>`;
      })
      .join("");

    rankingMovesHtml = `
    <tr>
      <td style="padding:24px 0 0 0;">
        <h2 style="margin:0 0 12px 0;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#2563eb;">Ranking Moves</h2>
        <table cellpadding="0" cellspacing="0" border="0" width="100%">
          ${movesRows}
        </table>
      </td>
    </tr>`;
  }

  let accoladesHtml = "";
  if (content.accoladeAlerts.length > 0) {
    const accoladeRows = content.accoladeAlerts
      .map(
        (alert) => `
        <tr>
          <td style="padding:8px 0;font-size:14px;color:#374151;">
            ⭐ <strong>${alert.chefName}</strong>
            <span style="color:#6b7280;"> — ${alert.detail}</span>
          </td>
        </tr>`
      )
      .join("");

    accoladesHtml = `
    <tr>
      <td style="padding:24px 0 0 0;">
        <h2 style="margin:0 0 12px 0;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#2563eb;">Accolade Alerts</h2>
        <table cellpadding="0" cellspacing="0" border="0" width="100%">
          ${accoladeRows}
        </table>
      </td>
    </tr>`;
  }

  const introHtml = content.intro
    ? `<tr><td style="padding:0 0 16px 0;font-size:15px;color:#374151;font-style:italic;line-height:1.5;">${content.intro}</td></tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Chef Ranker Daily — ${content.date}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f3f4f6;">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color:#2563eb;padding:24px 32px;">
              <h1 style="margin:0;font-size:20px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:#ffffff;">Chef Ranker Daily</h1>
              <p style="margin:4px 0 0 0;font-size:13px;color:rgba(255,255,255,0.8);">${content.date}</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:24px 32px;">
              <table cellpadding="0" cellspacing="0" border="0" width="100%">
                ${introHtml}
                <!-- Top Stories -->
                <tr>
                  <td style="padding:0 0 8px 0;">
                    <h2 style="margin:0 0 4px 0;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#2563eb;">Top Stories</h2>
                  </td>
                </tr>
                <tr>
                  <td>
                    <table cellpadding="0" cellspacing="0" border="0" width="100%">
                      ${storiesHtml}
                    </table>
                  </td>
                </tr>
                ${rankingMovesHtml}
                ${accoladesHtml}
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;background-color:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
              <a href="${appUrl}" style="display:inline-block;padding:10px 24px;background-color:#2563eb;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;">View Full Rankings</a>
              <p style="margin:16px 0 0 0;font-size:12px;color:#9ca3af;">
                <a href="${unsubscribeUrl}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a> from the daily digest
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// --- Plain text builder ---

export function buildPlainText(content: DigestContent): string {
  const lines: string[] = [];

  lines.push("CHEF RANKER DAILY");
  lines.push(content.date);
  lines.push("=".repeat(40));
  lines.push("");

  if (content.intro) {
    lines.push(content.intro);
    lines.push("");
  }

  lines.push("TOP STORIES");
  lines.push("-".repeat(40));
  content.stories.forEach((story, i) => {
    lines.push(`${i + 1}. ${story.title}`);
    if (story.chefNames.length > 0) {
      lines.push(`   Chef(s): ${story.chefNames.join(", ")}`);
    }
    lines.push(`   Source: ${story.source} | Category: ${story.category.replace(/_/g, " ")}`);
    lines.push(`   ${story.summary}`);
    lines.push(`   Read more: ${story.url}`);
    lines.push("");
  });

  if (content.rankingMoves.length > 0) {
    lines.push("RANKING MOVES");
    lines.push("-".repeat(40));
    content.rankingMoves.forEach((move) => {
      const isUp = move.to < move.from;
      const arrow = isUp ? "UP" : "DOWN";
      const diff = Math.abs(move.from - move.to);
      lines.push(`  ${arrow} ${move.chefName}: #${move.from} -> #${move.to} (${isUp ? "+" : "-"}${diff})`);
    });
    lines.push("");
  }

  if (content.accoladeAlerts.length > 0) {
    lines.push("ACCOLADE ALERTS");
    lines.push("-".repeat(40));
    content.accoladeAlerts.forEach((alert) => {
      lines.push(`  * ${alert.chefName} — ${alert.detail}`);
    });
    lines.push("");
  }

  lines.push("=".repeat(40));
  lines.push("View full rankings at chefranker.com");
  lines.push("");

  return lines.join("\n");
}

// --- Send daily digest ---

export async function sendDailyDigest(testEmail?: string): Promise<{
  recipientCount: number;
  storyCount: number;
  subject: string;
} | void> {
  const content = await generateDigestContent();

  if (!content) {
    console.log("No stories to send");
    return;
  }

  const settings = await prisma.digestSettings.findFirst();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const subject = `Chef Ranker Daily — ${content.date}`;

  if (!process.env.RESEND_API_KEY) {
    throw new Error(
      "RESEND_API_KEY environment variable is not set. Cannot send digest emails."
    );
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const fromEmail = settings?.fromEmail || "digest@chefranker.com";
  const fromName = settings?.fromName || "Chef Ranker";
  const plainText = buildPlainText(content);

  // If testEmail is provided, send only to that address
  const recipients = testEmail
    ? [{ id: "test", email: testEmail }]
    : await prisma.newsSubscriber.findMany({ where: { isActive: true } });

  if (recipients.length === 0) {
    console.log("No active subscribers");
    return;
  }

  for (const subscriber of recipients) {
    const unsubscribeUrl = `${appUrl}/api/digest/unsubscribe?email=${encodeURIComponent(subscriber.email)}&token=${generateToken(subscriber.email)}`;
    const html = buildDigestHtml(content, appUrl, unsubscribeUrl);

    await resend.emails.send({
      from: `${fromName} <${fromEmail}>`,
      to: subscriber.email,
      subject,
      html,
      text: plainText,
    });

    if (!testEmail) {
      await prisma.newsSubscriber.update({
        where: { id: subscriber.id },
        data: { lastDigestSent: new Date() },
      });
    }

    // 100ms delay between sends
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // Log the digest
  await prisma.digestLog.create({
    data: {
      recipientCount: recipients.length,
      storyCount: content.stories.length,
      subject,
      htmlContent: buildDigestHtml(content, appUrl, `${appUrl}/api/digest/unsubscribe`),
      newsItemIds: JSON.stringify(content.stories.map((s) => s.url)),
    },
  });

  console.log(
    `Digest sent to ${recipients.length} ${testEmail ? "test" : ""} recipients with ${content.stories.length} stories`
  );

  return {
    recipientCount: recipients.length,
    storyCount: content.stories.length,
    subject,
  };
}
