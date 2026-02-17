export interface MergeContext {
  chefName: string;
  restaurantName: string;
  topAccolade: string;
  city: string;
  senderName: string;
  senderTitle: string;
  senderCompany: string;
  customNote: string;
}

export function mergeTemplate(text: string, ctx: MergeContext): string {
  const firstName = ctx.chefName.split(" ")[0];
  return text
    .replace(/\{\{chef_name\}\}/g, ctx.chefName)
    .replace(/\{\{chef_first_name\}\}/g, firstName)
    .replace(/\{\{restaurant_name\}\}/g, ctx.restaurantName || "your restaurant")
    .replace(/\{\{top_accolade\}\}/g, ctx.topAccolade)
    .replace(/\{\{city\}\}/g, ctx.city || "your city")
    .replace(/\{\{sender_name\}\}/g, ctx.senderName || "[Your Name]")
    .replace(/\{\{sender_title\}\}/g, ctx.senderTitle ? `, ${ctx.senderTitle}` : "")
    .replace(/\{\{sender_company\}\}/g, ctx.senderCompany || "[Your Company]")
    .replace(/\{\{custom_note\}\}/g, ctx.customNote || "");
}

export function generateEml(to: string, subject: string, body: string, from?: string): string {
  const date = new Date().toUTCString();
  return [
    from ? `From: ${from}` : "",
    `To: ${to}`,
    `Subject: ${subject}`,
    `Date: ${date}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=utf-8`,
    ``,
    body,
  ]
    .filter(Boolean)
    .join("\r\n");
}
