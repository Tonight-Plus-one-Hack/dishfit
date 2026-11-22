#!/usr/bin/env node
// Renders the Plus One logo loop in both formats from the one source, index.html.
//
//   node scripts/render.mjs                          sync brand inputs, then both formats into out/
//   node scripts/render.mjs --only vertical --quality draft --workers 2
//   node scripts/render.mjs --prepare-vertical <dir> write the 1080x1920 project copy only
//                                                    (for `npx hyperframes snapshot|preview <dir>`)
//
// HyperFrames wants exactly one root composition per project, so the vertical cut is a
// temporary copy of this project whose canvas (root, scene hosts, scene roots) is 1080x1920.
// Every shot positions from --mark-cy and the --safe-* insets, which index.html sets per
// canvas, so the scenes re-flow without a second source.
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CLI = "hyperframes@0.9.77";
const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FORMATS = {
  square: { width: 1080, height: 1080 },
  vertical: { width: 1080, height: 1920 },
};

function parseArgs(argv) {
  const args = { only: "all", quality: "delivery", out: join(project, "out"), prepare: null, workers: "auto" };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === "--only") args.only = value;
    else if (flag === "--quality") args.quality = value;
    else if (flag === "--out") args.out = resolve(value);
    else if (flag === "--prepare-vertical") args.prepare = resolve(value);
    else if (flag === "--workers") args.workers = value;
    else throw new Error(`Unknown argument: ${flag}`);
    i += 1;
  }
  if (!["all", "square", "vertical"].includes(args.only)) {
    throw new Error(`--only must be square, vertical or all, got ${args.only}`);
  }
  return args;
}

function withCanvas(html, { width, height }) {
  const replaced = html
    .replace(/content="width=1080, height=1080"/, `content="width=${width}, height=${height}"`)
    .replace(/(html,\s*body\s*\{\s*width:\s*)1080px;(\s*height:\s*)1080px;/, `$1${width}px;$2${height}px;`)
    .replace(/data-width="1080"(\s+)data-height="1080"/g, `data-width="${width}"$1data-height="${height}"`);
  const count = (text, value) => text.split(`data-height="${value}"`).length - 1;
  const expected = count(html, 1080);
  const changed = count(replaced, height) - count(html, height);
  if (expected === 0 || changed !== expected) {
    throw new Error(`canvas markers changed shape (${changed}/${expected} rewritten); update scripts/render.mjs`);
  }
  return replaced;
}

function prepareVertical(target) {
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  for (const entry of ["compositions", "assets", "hyperframes.json", "meta.json", "package.json"]) {
    cpSync(join(project, entry), join(target, entry), { recursive: true });
  }
  // The root, every scene host and every scene root declare the canvas; all of them change.
  const scenes = readdirSync(join(project, "compositions"))
    .filter((name) => name.endsWith(".html"))
    .map((name) => join("compositions", name));
  for (const file of ["index.html", ...scenes]) {
    const html = readFileSync(join(project, file), "utf8");
    writeFileSync(join(target, file), withCanvas(html, FORMATS.vertical));
  }
  return target;
}

function render(dir, format, args) {
  const { width, height } = FORMATS[format];
  const output = join(args.out, `plus-one-logo-${width}x${height}.mp4`);
  const result = spawnSync(
    "npx",
    ["--yes", CLI, "render", dir, "--quality", args.quality, "--fps", "30", "--workers", args.workers, "--strict", "-o", output],
    { stdio: "inherit" },
  );
  if (result.status !== 0) throw new Error(`${format} render failed (exit ${result.status})`);
  return output;
}

const args = parseArgs(process.argv.slice(2));
const sync = spawnSync(process.execPath, [join(project, "scripts/sync-brand.mjs")], { stdio: "inherit" });
if (sync.status !== 0) throw new Error("brand sync failed");
if (args.prepare) {
  console.log(prepareVertical(args.prepare));
} else {
  mkdirSync(args.out, { recursive: true });
  const outputs = [];
  if (args.only !== "vertical") outputs.push(render(project, "square", args));
  if (args.only !== "square") {
    const temp = mkdtempSync(join(tmpdir(), "plus-one-vertical-"));
    try {
      outputs.push(render(prepareVertical(temp), "vertical", args));
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  }
  console.log(outputs.join("\n"));
}
