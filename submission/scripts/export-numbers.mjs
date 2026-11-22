// npm run numbers:export -- https://<deployed-app>
// Pulls GET /api/numbers from the deployed app (or NUMBERS_URL), writes submission/numbers.json
// and re-renders slides.html and slides.pdf. On any failure numbers.json stays untouched,
// so the deck keeps its "live at submission" placeholders instead of stale or invented values.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build, METRICS, printPdf } from "./build.mjs";

const dir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = (process.argv[2] ?? process.env.NUMBERS_URL ?? "").replace(/\/+$/, "");
if (!/^https?:\/\/[^/]+/.test(base)) {
  console.error("Usage: npm run numbers:export -- https://<deployed-app>   (or set NUMBERS_URL)");
  process.exit(2);
}

const res = await fetch(`${base}/api/numbers`, { headers: { accept: "application/json" } });
if (!res.ok) {
  console.error(`GET ${base}/api/numbers answered ${res.status}; numbers.json unchanged`);
  process.exit(1);
}
const body = await res.json();
for (const key of METRICS) {
  if (!Number.isInteger(body[key]) || body[key] < 0) {
    console.error(`GET /api/numbers: ${key} is not a count (${JSON.stringify(body[key])}); numbers.json unchanged`);
    process.exit(1);
  }
}
const iso = (v) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : null);
const numbers = { url: base, generatedAt: iso(body.generatedAt) ?? new Date().toISOString(), since: iso(body.since) };
for (const key of METRICS) numbers[key] = body[key];

const file = join(dir, "numbers.json");
const before = readFileSync(file, "utf8");
// Every export adds one point to the numbers-over-time chart on slide 3 (same base URL only).
const previous = JSON.parse(before);
const history = previous.url === base ? (previous.history ?? []) : [];
numbers.history = [
  ...history.filter((p) => p.generatedAt !== numbers.generatedAt),
  { generatedAt: numbers.generatedAt, engaged: numbers.engaged, decided: numbers.decided, shared: numbers.shared },
];
writeFileSync(file, `${JSON.stringify(numbers, null, 2)}\n`);
try {
  const html = build();
  const pdf = printPdf(html);
  console.log(JSON.stringify({ ...numbers, history: `${numbers.history.length} points` }));
  console.log(`Wrote ${html}\nWrote ${pdf}`);
} catch (error) {
  writeFileSync(file, before);
  throw error;
}
