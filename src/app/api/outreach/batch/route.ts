import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { chefIds, templateId, subject, bodyTemplate, customNote } = body as {
    chefIds: string[];
    templateId?: string;
    subject: string;
    bodyTemplate: string;
    customNote?: string;
  };

  if (!chefIds || chefIds.length === 0) {
    return NextResponse.json({ error: "No chefs selected" }, { status: 400 });
  }

  const chefs = await prisma.chef.findMany({
    where: { id: { in: chefIds } },
    include: { contact: true, accolades: true },
  });

  const sender = await prisma.senderSettings.findFirst();

  const drafts = [];
  for (const chef of chefs) {
    const firstName = chef.name.split(" ")[0];
    const topAccolade = chef.accolades[0]?.detail || chef.accolades[0]?.type || "";
    const merged = (text: string) =>
      text
        .replace(/\{\{chef_name\}\}/g, chef.name)
        .replace(/\{\{chef_first_name\}\}/g, firstName)
        .replace(/\{\{restaurant_name\}\}/g, chef.currentRestaurant || "your restaurant")
        .replace(/\{\{top_accolade\}\}/g, topAccolade)
        .replace(/\{\{city\}\}/g, chef.city || "your city")
        .replace(/\{\{sender_name\}\}/g, sender?.name || "[Your Name]")
        .replace(/\{\{sender_title\}\}/g, sender?.title ? `, ${sender.title}` : "")
        .replace(/\{\{sender_company\}\}/g, sender?.company || "[Your Company]")
        .replace(/\{\{custom_note\}\}/g, customNote || "");

    const draft = await prisma.outreachDraft.create({
      data: {
        chefId: chef.id,
        templateId: templateId || null,
        toEmail: chef.contact?.email || chef.contact?.agentEmail || null,
        subject: merged(subject),
        body: merged(bodyTemplate),
        status: "drafted",
      },
    });
    drafts.push(draft);
  }

  return NextResponse.json({ drafts, count: drafts.length }, { status: 201 });
}
