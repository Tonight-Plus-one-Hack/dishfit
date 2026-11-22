// Draws the share cards ahead of time, so the Worker never has to: a Workers Free request may use 10 ms of
// CPU and drawing one card takes hundreds. Reads the dishes the web build wrote (apps/web/dist/share/dishes.json)
// and writes PNGs into the same static assets, named by card version (src/share/card.ts, cardVersion), so a
// changed dish or design gets a new file and an unchanged one is skipped on the next run. Cards are JPEG:
// a story with a dish photo is about 1 MB as PNG and a tenth of that as JPEG.
// Also draws the DishFit brand card, which the Worker serves for dishes without a pre-drawn card.
//
// Usage (after `npm run build --prefix apps/web`): npm run cards [-- --top 300 | --all]
// Default: every dish with a KI-Bild plus the 300 best by health score, a few minutes on a laptop.
// Bundled with esbuild first (fonts and resvg's wasm are binary imports, as in the Worker).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { deflateSync, crc32 } from "node:zlib";
import { brandCardPath, cardVersion, prebuiltCardPath, renderCardPixels, type CardFormat } from "../src/share/card";
import type { ShareDish } from "../src/share/dishes";

const FORMATS: CardFormat[] = ["og", "story"];
const DIST = resolve(process.cwd(), process.cwd().endsWith("worker") ? "../apps/web/dist" : "apps/web/dist");

function args(): { top: number } {
  const argv = process.argv.slice(2);
  if (argv.includes("--all")) return { top: Number.POSITIVE_INFINITY };
  const i = argv.indexOf("--top");
  return { top: i >= 0 ? Number(argv[i + 1]) : 300 };
}

/** One PNG chunk: length, type, data, CRC. */
function pngChunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
}

/** Minimal PNG encoder for decoded WebP pixels (resvg reads PNG and JPEG, not WebP). */
function encodePng(rgba: Uint8ClampedArray, width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

type Pixels = { data: Uint8ClampedArray; width: number; height: number };
type JpegEncode = (image: Pixels, options: { quality: number }) => Promise<ArrayBuffer>;
let jpeg: Promise<JpegEncode> | null = null;

function polyfillImageData() {
  // The emscripten codecs use ImageData, which Node does not have.
  (globalThis as { ImageData?: unknown }).ImageData ??= class {
    constructor(
      public data: Uint8ClampedArray,
      public width: number,
      public height: number,
    ) {}
  };
}

async function jpegEncoder(): Promise<JpegEncode> {
  polyfillImageData();
  const require = createRequire(import.meta.url);
  const mod = (await import("@jsquash/jpeg/encode.js")) as { init: (m: WebAssembly.Module) => Promise<void>; default: JpegEncode };
  await mod.init(await WebAssembly.compile(readFileSync(require.resolve("@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm"))));
  return mod.default;
}

async function drawJpeg(file: string, format: CardFormat, dish: ShareDish | null, image: string | null) {
  jpeg ??= jpegEncoder();
  const pixels = await renderCardPixels(format, dish, image);
  writeFileSync(file, Buffer.from(await (await jpeg)(pixels, { quality: 86 })));
}

type WebpDecode = (buffer: ArrayBuffer) => Promise<{ data: Uint8ClampedArray; width: number; height: number }>;
let webp: Promise<WebpDecode> | null = null;

async function webpDecoder(): Promise<WebpDecode> {
  polyfillImageData();
  const require = createRequire(import.meta.url);
  const mod = (await import("@jsquash/webp/decode.js")) as { init: (m: WebAssembly.Module) => Promise<void>; default: WebpDecode };
  await mod.init(await WebAssembly.compile(readFileSync(require.resolve("@jsquash/webp/codec/dec/webp_dec.wasm"))));
  return mod.default;
}

/** The dish image from the build output as a data URL resvg can draw. */
async function imageDataUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const file = join(DIST, path);
  if (!existsSync(file)) return null;
  const bytes = readFileSync(file);
  if (/\.jpe?g$/i.test(path)) return `data:image/jpeg;base64,${bytes.toString("base64")}`;
  if (/\.png$/i.test(path)) return `data:image/png;base64,${bytes.toString("base64")}`;
  if (/\.webp$/i.test(path)) {
    webp ??= webpDecoder();
    const decoded = await (await webp)(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    return `data:image/png;base64,${encodePng(decoded.data, decoded.width, decoded.height).toString("base64")}`;
  }
  return null;
}

async function main() {
  const indexFile = join(DIST, "share/dishes.json");
  if (!existsSync(indexFile)) throw new Error(`${indexFile} is missing: run npm run build --prefix apps/web first`);
  const { dishes } = JSON.parse(readFileSync(indexFile, "utf8")) as { dishes: Record<string, ShareDish> };
  const { top } = args();
  const entries = Object.entries(dishes);
  const best = new Set(
    entries
      .toSorted(([, a], [, b]) => b.score - a.score || b.protein - a.protein)
      .slice(0, top)
      .map(([id]) => id),
  );
  const chosen = entries.filter(([id, dish]) => dish.image !== null || best.has(id));
  mkdirSync(join(DIST, "share/cards"), { recursive: true });

  for (const format of FORMATS) await drawJpeg(join(DIST, brandCardPath(format)), format, null, null);

  const started = Date.now();
  let drawn = 0;
  for (const [i, [, dish]] of chosen.entries()) {
    const version = await cardVersion(dish);
    for (const format of FORMATS) {
      const file = join(DIST, prebuiltCardPath(version, format));
      if (existsSync(file)) continue;
      await drawJpeg(file, format, dish, await imageDataUrl(dish.image));
      drawn++;
    }
    if ((i + 1) % 100 === 0) console.log(`  ${i + 1} of ${chosen.length} dishes`);
  }
  console.log(`Share cards: ${chosen.length} of ${entries.length} dishes, ${drawn} drawn in ${Math.round((Date.now() - started) / 1000)} s, in ${join(DIST, "share/cards")}`);
}

await main();
