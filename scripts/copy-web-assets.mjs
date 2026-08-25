import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const sourceDir = path.join(rootDir, "src", "web", "public");
const targetDir = path.join(rootDir, "dist", "web", "public");

if (!fs.existsSync(sourceDir))
{
    console.warn("[copy-web-assets] No existe src/web/public, no se copian assets.");
    process.exit(0);
}

fs.mkdirSync(targetDir, { recursive: true });
fs.cpSync(sourceDir, targetDir, { recursive: true, force: true });

console.log("[copy-web-assets] Assets copiados a dist/web/public");
