import fs from "node:fs";

const adminPath = "admin-dashboard/tailwind.config.ts";
const nodePath = "node-gui/frontend/tailwind.config.js";

function palette(path) {
  const source = fs.readFileSync(path, "utf8");
  const block = source.match(/colony:\s*\{([\s\S]*?)\n\s*\},/);
  if (!block) throw new Error(`Colony palette not found in ${path}`);
  return Object.fromEntries(
    [...block[1].matchAll(/(\w+):\s*"(#[0-9A-Fa-f]{6})"/g)].map((match) => [match[1], match[2].toUpperCase()]),
  );
}

const admin = palette(adminPath);
const node = palette(nodePath);
if (JSON.stringify(admin) !== JSON.stringify(node)) {
  console.error("Zonn Node palette differs from Zonn Console.");
  console.error({ admin, node });
  process.exit(1);
}

console.log(`Theme parity: OK (${Object.keys(admin).length} shared colors)`);
