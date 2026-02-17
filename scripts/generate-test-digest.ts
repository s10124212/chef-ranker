import { generateDigestContent, buildDigestHtml } from "../src/lib/digest-generator";
import * as fs from "fs";
import "dotenv/config";

async function main() {
  const content = await generateDigestContent();
  if (!content) {
    console.log("No content generated (need at least 2 news items from last 24h)");
    return;
  }
  const html = buildDigestHtml(content, "http://localhost:3000", "#");
  fs.writeFileSync("test-digest.html", html);
  console.log(`Saved test-digest.html with ${content.stories.length} stories`);
}
main();
