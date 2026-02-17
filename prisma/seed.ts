import { execSync } from "child_process";
import { join } from "path";

const scriptPath = join(__dirname, "..", "scripts", "import-data.ts");
console.log("Running import script...");
execSync(`npx tsx ${scriptPath}`, { stdio: "inherit" });
