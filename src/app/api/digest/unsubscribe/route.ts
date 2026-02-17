import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import crypto from "crypto";

function verifyToken(email: string, token: string): boolean {
  const secret = process.env.RESEND_API_KEY || "secret";
  const expected = crypto.createHmac("sha256", secret).update(email).digest("hex");
  return token === expected;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const email = url.searchParams.get("email");
  const token = url.searchParams.get("token");

  if (!email || !token) {
    return new NextResponse(unsubPage("Invalid unsubscribe link."), {
      headers: { "Content-Type": "text/html" },
    });
  }

  if (!verifyToken(email, token)) {
    return new NextResponse(unsubPage("Invalid or expired unsubscribe link."), {
      headers: { "Content-Type": "text/html" },
    });
  }

  await prisma.newsSubscriber.updateMany({
    where: { email, isActive: true },
    data: { isActive: false, unsubscribedAt: new Date() },
  });

  return new NextResponse(
    unsubPage("You've been unsubscribed. You won't receive any more digests."),
    { headers: { "Content-Type": "text/html" } }
  );
}

function unsubPage(message: string): string {
  return `<!DOCTYPE html>
<html>
<head><title>Unsubscribe — Chef Ranker</title>
<style>body{font-family:-apple-system,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f9fafb}
.card{background:white;padding:40px;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.1);text-align:center;max-width:400px}
h1{font-size:18px;margin:0 0 12px}p{color:#6b7280;font-size:14px;margin:0}
a{color:#2563eb;text-decoration:none;font-size:14px;display:inline-block;margin-top:16px}</style></head>
<body><div class="card"><h1>Chef Ranker</h1><p>${message}</p><a href="/">Back to Chef Ranker</a></div></body></html>`;
}
