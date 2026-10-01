// Performance budget (ADR-0014): first-load JS + CSS <= 200 KB gzipped. Fails the build.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const LIMIT = 200 * 1024;
const dir = new URL("../dist/assets/", import.meta.url).pathname;
let total = 0;
for (const f of readdirSync(dir)) {
  if (!/\.(js|css)$/.test(f) || statSync(join(dir, f)).isDirectory()) continue;
  total += gzipSync(readFileSync(join(dir, f))).length;
}
console.log(`bundle: ${(total / 1024).toFixed(1)} KB gzipped (budget ${LIMIT / 1024} KB)`);
if (total > LIMIT) {
  console.error("over the performance budget");
  process.exit(1);
}
