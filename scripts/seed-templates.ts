import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { resolve } from "path";

const dbPath = resolve(__dirname, "..", "dev.db");
const adapter = new PrismaLibSql({ url: `file:${dbPath}` });
const prisma = new PrismaClient({ adapter });

const templates = [
  {
    name: "Event Invitation",
    category: "event",
    subject: "Invitation: {{chef_first_name}}, join us at our upcoming culinary event",
    body: `Dear Chef {{chef_name}},

I hope this message finds you well. My name is {{sender_name}}{{sender_title}} from {{sender_company}}.

We are organizing an upcoming culinary event and would be honored to have you participate. Your work at {{restaurant_name}} and your reputation as one of the top chefs in {{city}} make you an ideal fit for this occasion.

{{custom_note}}

We would love to discuss the details with you at your earliest convenience. Please let me know if you're interested and available.

Warm regards,
{{sender_name}}
{{sender_title}}
{{sender_company}}`,
    isDefault: true,
  },
  {
    name: "Collaboration Proposal",
    category: "collaboration",
    subject: "Collaboration opportunity with {{chef_first_name}}",
    body: `Dear Chef {{chef_name}},

I'm {{sender_name}}{{sender_title}} at {{sender_company}}, and I'm reaching out because I've long admired your culinary vision at {{restaurant_name}}.

I'd love to explore a potential collaboration — whether that's a pop-up dinner, a joint menu, or another creative partnership. Your {{top_accolade}} speaks to the caliber of work you do, and I think there's a great opportunity for us to create something special together.

{{custom_note}}

Would you be open to a brief call or meeting to discuss possibilities?

Best regards,
{{sender_name}}
{{sender_title}}
{{sender_company}}`,
    isDefault: true,
  },
  {
    name: "Guest Chef Invitation",
    category: "guest",
    subject: "Guest Chef Invitation for {{chef_first_name}} {{chef_name}}",
    body: `Dear Chef {{chef_name}},

I'm writing on behalf of {{sender_company}} to invite you for a guest chef appearance. Your exceptional work at {{restaurant_name}} in {{city}} has caught our attention, and we believe our guests would be thrilled to experience your culinary artistry.

{{custom_note}}

We're flexible on dates and would be happy to accommodate your schedule. All travel and accommodation would be arranged and covered by us.

Please let me know if this is something you'd be interested in, and I'll send over the full details.

Kind regards,
{{sender_name}}
{{sender_title}}
{{sender_company}}`,
    isDefault: true,
  },
  {
    name: "Panel / Speaking Invitation",
    category: "speaking",
    subject: "Speaking invitation for Chef {{chef_name}}",
    body: `Dear Chef {{chef_name}},

I'm {{sender_name}} from {{sender_company}}. We're putting together a panel discussion and would be honored to have you as a speaker.

With your experience at {{restaurant_name}} and recognition as a {{top_accolade}} recipient, your perspective would be invaluable to our audience.

{{custom_note}}

The format would be a moderated conversation followed by audience Q&A. We'd love to have you share your insights on the future of the culinary world.

Would you be available to join us? Happy to discuss details.

Best,
{{sender_name}}
{{sender_title}}
{{sender_company}}`,
    isDefault: true,
  },
  {
    name: "General Introduction",
    category: "introduction",
    subject: "Introduction from {{sender_name}} — great admiration for your work",
    body: `Dear Chef {{chef_name}},

My name is {{sender_name}}, and I'm {{sender_title}} at {{sender_company}}. I wanted to reach out to introduce myself and express my admiration for what you've built at {{restaurant_name}}.

{{custom_note}}

I'd love the opportunity to connect and learn more about your upcoming plans. No specific ask here — just a genuine interest in building a relationship.

Looking forward to hearing from you.

Warm regards,
{{sender_name}}
{{sender_title}}
{{sender_company}}`,
    isDefault: true,
  },
  {
    name: "Follow-Up",
    category: "followup",
    subject: "Following up — {{chef_first_name}}, would love to connect",
    body: `Dear Chef {{chef_name}},

I hope you're doing well. I reached out recently and wanted to follow up in case my previous message got lost in the shuffle — I know how busy things must be at {{restaurant_name}}.

{{custom_note}}

I'd still love the chance to connect. Even a brief call would be wonderful. Please let me know if there's a better time or way to reach you.

Thank you for your time,
{{sender_name}}
{{sender_title}}
{{sender_company}}`,
    isDefault: true,
  },
];

async function main() {
  // Check if templates already exist
  const count = await prisma.emailTemplate.count();
  if (count > 0) {
    console.log(`Templates already seeded (${count} found). Skipping.`);
    return;
  }

  for (const t of templates) {
    await prisma.emailTemplate.create({ data: t });
  }
  console.log(`Seeded ${templates.length} default email templates.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
