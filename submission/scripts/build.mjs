// Renders submission/slides.src.html into a self-contained slides.html (fonts, images and
// numbers inlined) and prints slides.pdf with headless Chrome. Numbers come from numbers.json,
// which `npm run numbers:export` fills from the live app; a missing number renders as a
// visible "live at submission" placeholder, never as an invented value.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(dir, "..");
const fonts = join(root, "brand/fonts");
const assetDirs = [join(dir, "assets"), join(root, "apps/web/src/assets/brand")];
const TYPES = { ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const PENDING = "live at submission";
// The counts from NumbersResponse (GET /api/numbers) that the slides show; see docs/team-prompts/vinaynaik432-debug.md Task D.
export const METRICS = ["visitors", "engaged", "decided", "shared"];
// Series of the numbers-over-time chart on slide 3; colors validated with the dataviz palette checks.
const SERIES = [
  { key: "engaged", label: "browsed", color: "#355eda" },
  { key: "decided", label: "route/menu taps", color: "#e8730c" },
  { key: "shared", label: "shared", color: "#1f9d6b" },
];

const dataUri = (file) => {
  if (!existsSync(file)) throw new Error(`Missing asset ${file}`);
  return `data:${TYPES[extname(file)]};base64,${readFileSync(file).toString("base64")}`;
};

export function readNumbers() {
  const numbers = JSON.parse(readFileSync(join(dir, "numbers.json"), "utf8"));
  for (const key of METRICS) {
    const v = numbers[key];
    if (v !== null && !(Number.isInteger(v) && v >= 0)) throw new Error(`numbers.json: ${key} must be null or a count`);
  }
  numbers.history ??= [];
  for (const point of numbers.history) {
    if (Number.isNaN(Date.parse(point.generatedAt)) || !SERIES.every((s) => Number.isInteger(point[s.key]))) {
      throw new Error(`numbers.json: bad history point ${JSON.stringify(point)}`);
    }
  }
  return numbers;
}

const berlin = (iso) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/Berlin", dateStyle: "medium", timeStyle: "short" });

function formatNumber(numbers, key) {
  if (key === "asof") {
    if (!numbers.generatedAt) return "Traction counts will appear when GET /api/numbers returns live data.";
    const since = numbers.since ? `measured since ${berlin(numbers.since)} · ` : "";
    const visitors = numbers.visitors === null ? "" : `${numbers.visitors.toLocaleString("en-US")} devices opened the app · `;
    return `${visitors}${since}as of ${berlin(numbers.generatedAt)} Berlin time · GET ${numbers.url}/api/numbers`;
  }
  if (!METRICS.includes(key)) throw new Error(`Unknown number ${key}`);
  const v = numbers[key];
  return v === null ? PENDING : v.toLocaleString("en-US");
}

const esc = (text) => String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** Inline SVG line chart of the exported snapshots; a labelled empty slot until there are two. */
function chart(history) {
  const points = [...history].sort((a, b) => Date.parse(a.generatedAt) - Date.parse(b.generatedAt));
  if (points.length < 2) {
    return `<div class="chart chart--empty"><span class="kicker">Numbers over time</span><span>The chart appears after two live exports.</span></div>`;
  }
  const W = 1152, H = 136, L = 8, Rgt = 150, T = 14, B = 26;
  const t0 = Date.parse(points[0].generatedAt), t1 = Date.parse(points.at(-1).generatedAt);
  const max = Math.max(1, ...points.flatMap((p) => SERIES.map((s) => p[s.key])));
  const x = (p) => L + ((Date.parse(p.generatedAt) - t0) / (t1 - t0)) * (W - L - Rgt);
  const y = (v) => T + (1 - v / max) * (H - T - B);
  const time = (p) => new Date(p.generatedAt).toLocaleString("en-GB", { timeZone: "Europe/Berlin", weekday: "short", hour: "2-digit", minute: "2-digit" });
  const grid = [0, 0.5, 1].map((f) => `<line x1="${L}" x2="${W - Rgt}" y1="${y(max * f)}" y2="${y(max * f)}" class="grid"/>`).join("");
  const ticks = [points[0], points.at(-1)].map((p, i) =>
    `<text x="${x(p)}" y="${H - 6}" text-anchor="${i ? "end" : "start"}" class="tick">${esc(time(p))}</text>`).join("");
  // End labels sorted by value, nudged apart so they never collide.
  const ends = SERIES.map((s) => ({ ...s, v: points.at(-1)[s.key], y: y(points.at(-1)[s.key]) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 15);
  const lines = SERIES.map((s) => {
    const d = points.map((p, i) => `${i ? "L" : "M"}${x(p).toFixed(1)},${y(p[s.key]).toFixed(1)}`).join("");
    const dots = points.map((p) => `<circle cx="${x(p).toFixed(1)}" cy="${y(p[s.key]).toFixed(1)}" r="4" fill="${s.color}" stroke="var(--surface)" stroke-width="2"/>`).join("");
    return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${dots}`;
  }).join("");
  const labels = ends.map((e) =>
    `<text x="${W - Rgt + 12}" y="${e.y + 4}" class="end"><tspan class="end-v">${e.v.toLocaleString("en-US")}</tspan> ${esc(e.label)}</text>`).join("");
  const legend = SERIES.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.label)}</span>`).join("");
  return `<div class="chart"><div class="chart-head"><span class="kicker">Numbers over time</span><span class="legend">${legend}</span></div>`
    + `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Devices that browsed, tapped directions or a menu, or tapped share, per export">${grid}${lines}${ticks}${labels}</svg></div>`;
}

export function build() {
  const numbers = readNumbers();
  let html = readFileSync(join(dir, "slides.src.html"), "utf8")
    .replace(/{{font:([\w.-]+)}}/g, (_, f) => dataUri(join(fonts, f)))
    .replace(/{{asset:([\w.-]+)}}/g, (_, f) => dataUri(assetDirs.map((d) => join(d, f)).find(existsSync) ?? f))
    .replace(/{{numbers-json}}/g, JSON.stringify(numbers).replace(/</g, "\\u003c"));
  // Pending metric values get a dashed placeholder style instead of the big number.
  html = html.replace(/class="v" data-num="(\w+)">{{num:\1}}/g, (_, key) =>
    `class="v${numbers[key] === null ? " pending" : ""}" data-num="${key}">{{num:${key}}}`,
  );
  html = html.replace("{{chart}}", () => chart(numbers.history));
  html = html.replace(/{{num:(\w+)}}/g, (_, key) => formatNumber(numbers, key));
  const left = html.match(/{{[^}]*}}/);
  if (left) throw new Error(`Unfilled placeholder ${left[0]}`);
  const out = join(dir, "slides.html");
  writeFileSync(out, html);
  return out;
}

const CHROMES = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

export function printPdf(htmlFile) {
  const chrome = CHROMES.find(existsSync);
  if (!chrome) throw new Error("No Chrome found; set CHROME_PATH");
  const pdf = join(dir, "slides.pdf");
  execFileSync(chrome, [
    "--headless",
    "--disable-gpu",
    "--no-pdf-header-footer",
    "--virtual-time-budget=5000",
    `--print-to-pdf=${pdf}`,
    pathToFileURL(htmlFile).href,
  ], { stdio: ["ignore", "ignore", "pipe"] });
  return pdf;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const html = build();
  console.log(`Wrote ${html}`);
  console.log(`Wrote ${printPdf(html)}`);
}
