import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "messages");
const REFERENCE = "en";

function flatten(obj: unknown, prefix = ""): string[] {
  if (obj === null || typeof obj !== "object") return [prefix];
  return Object.entries(obj).flatMap(([key, value]) =>
    flatten(value, prefix ? `${prefix}.${key}` : key),
  );
}

function load(file: string): Set<string> {
  return new Set(flatten(JSON.parse(readFileSync(join(dir, file), "utf8"))));
}

const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
const reference = load(`${REFERENCE}.json`);
let failed = false;

for (const file of files) {
  if (file === `${REFERENCE}.json`) continue;
  const keys = load(file);
  const missing = [...reference].filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !reference.has(k));
  if (missing.length || extra.length) {
    failed = true;
    console.error(`${file}:`);
    for (const k of missing) console.error(`  missing: ${k}`);
    for (const k of extra) console.error(`  extra:   ${k}`);
  }
}

if (failed) process.exit(1);
console.log(`i18n OK: ${reference.size} keys`);
