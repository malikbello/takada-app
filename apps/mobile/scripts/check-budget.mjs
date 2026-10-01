// Performance budget (ADR-0014): the first load (entry script, preloaded chunks and CSS
// referenced by index.html) must be <= 200 KB gzipped. Lazy chunks are reported, not
// counted. Fails the build when over.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const LIMIT = 200 * 1024;
const dist = new URL("../dist/", import.meta.url).pathname;
const html = readFileSync(join(dist, "index.html"), "utf8");
const files = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
let total = 0;
for (const f of files) {
  const n = gzipSync(readFileSync(join(dist, f))).length;
  total += n;
  console.log(`  ${(n / 1024).toFixed(1).padStart(6)} KB  ${f}`);
}
console.log(`first load: ${(total / 1024).toFixed(1)} KB gzipped (budget ${LIMIT / 1024} KB)`);
if (!files.length) {
  console.error("no assets found in index.html");
  process.exit(1);
}
if (total > LIMIT) {
  console.error("over the performance budget");
  process.exit(1);
}
