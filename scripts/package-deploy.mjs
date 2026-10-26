import { cpSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("../", import.meta.url));
const deployDir = path.join(rootDir, "deploy");
const entries = ["dist", "config", "package.json", "package-lock.json"];
const copiedEntries = ["dist", "config", "package-lock.json"];

for (const entry of entries)
{
    statSync(path.join(rootDir, entry));
}

statSync(path.join(rootDir, "dist", "index.js"));
statSync(path.join(rootDir, "dist", "server", "web", "public", "index.html"));
statSync(path.join(rootDir, "config", "server-config.json"));

rmSync(deployDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
mkdirSync(deployDir);

for (const entry of copiedEntries)
{
    cpSync(path.join(rootDir, entry), path.join(deployDir, entry), { recursive: true });
}

// The deployment package only runs the compiled app; build scripts need the full source tree.
const packageJson = JSON.parse(readFileSync(path.join(rootDir, "package.json"), "utf8"));
packageJson.scripts = { start: "node dist/index.js" };
writeFileSync(path.join(deployDir, "package.json"), `${JSON.stringify(packageJson, null, 4)}\n`);

console.log("[Build] Carpeta deploy lista para subir al servidor.");
console.log("[Build] En el servidor: npm ci --omit=dev && npm start");
console.log("[Build] Revisar config/server-config.json antes de iniciar.");
