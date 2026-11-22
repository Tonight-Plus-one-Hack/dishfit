#!/usr/bin/env node
// Generate a QR code (SVG and PNG) for a URL, with optional UTM tags.
// Zero dependencies: a small QR encoder (byte mode, versions 1-40) plus a PNG writer on node:zlib.
//
// Usage:
//   node launch/make-qr.mjs <url> [options]
//
// Options:
//   --out <path>        Output path without extension (default: ./qr). Writes <path>.svg and <path>.png.
//   --source <value>    utm_source (one of: meta, whatsapp, qr, esn, team, ph).
//   --medium <value>    utm_medium (for example: poster, flyer, sticker).
//   --campaign <value>  utm_campaign (for example: launch-berlin).
//   --content <value>   utm_content (for example: hostel-generator-mitte).
//   --ecc <L|M|Q|H>     Error correction level (default: M; use Q for printed posters that may get scuffed).
//   --scale <n>         PNG pixels per module (default: 16).
//   --margin <n>        Quiet zone in modules (default: 4, the spec minimum).
//   --dark <#hex>       Dark module color (default: #1c2024, the Plus One brand ink).
//   --light <#hex>      Background color (default: #ffffff). Keep it much lighter than --dark so scanners read it.
//   --svg-only          Only write the SVG.
//   --png-only          Only write the PNG.
//
// Example:
//   node launch/make-qr.mjs https://example.app/berlin --source qr --medium poster \
//     --campaign launch-berlin --content hostel-1 --out /tmp/qr-hostel-1

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { pathToFileURL } from "node:url";

// ---------- QR encoder ----------

const ECC_LEVELS = { L: 0, M: 1, Q: 2, H: 3 };
const ECC_FORMAT_BITS = [1, 0, 3, 2]; // L, M, Q, H

// Per version 0..40 (index 0 unused), per level L, M, Q, H.
const ECC_CODEWORDS_PER_BLOCK = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];
const NUM_ERROR_CORRECTION_BLOCKS = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

function numRawDataModules(ver) {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}

function numDataCodewords(ver, ecl) {
  return Math.floor(numRawDataModules(ver) / 8) - ECC_CODEWORDS_PER_BLOCK[ecl][ver] * NUM_ERROR_CORRECTION_BLOCKS[ecl][ver];
}

function gfMultiply(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function rsDivisor(degree) {
  const result = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

function rsRemainder(data, divisor) {
  const result = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ result.shift();
    result.push(0);
    divisor.forEach((coef, i) => {
      result[i] ^= gfMultiply(coef, factor);
    });
  }
  return result;
}

function alignmentPositions(ver) {
  if (ver === 1) return [];
  const size = ver * 4 + 17;
  const numAlign = Math.floor(ver / 7) + 2;
  const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
  return result;
}

/**
 * Encode text as a QR code in byte mode.
 * @param {string} text
 * @param {{ ecc?: "L" | "M" | "Q" | "H", mask?: number }} [options]
 * @returns {{ version: number, size: number, mask: number, modules: boolean[][] }}
 */
export function encodeQr(text, options = {}) {
  const eclName = (options.ecc ?? "M").toUpperCase();
  if (!(eclName in ECC_LEVELS)) throw new Error(`Unknown ECC level "${eclName}", use L, M, Q or H`);
  const ecl = ECC_LEVELS[eclName];
  const bytes = [...Buffer.from(text, "utf8")];

  // Pick the smallest version that fits.
  let ver = 1;
  for (; ver <= 40; ver++) {
    const countBits = ver <= 9 ? 8 : 16;
    if (bytes.length < 2 ** countBits && 4 + countBits + bytes.length * 8 <= numDataCodewords(ver, ecl) * 8) break;
  }
  if (ver > 40) throw new Error("Text too long for a QR code");

  // Data bit stream.
  const bits = [];
  const appendBits = (val, len) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  appendBits(0b0100, 4);
  appendBits(bytes.length, ver <= 9 ? 8 : 16);
  for (const b of bytes) appendBits(b, 8);
  const capacityBits = numDataCodewords(ver, ecl) * 8;
  appendBits(0, Math.min(4, capacityBits - bits.length));
  appendBits(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacityBits; pad ^= 0xec ^ 0x11) appendBits(pad, 8);
  const dataCodewords = [];
  for (let i = 0; i < bits.length; i += 8) dataCodewords.push(parseInt(bits.slice(i, i + 8).join(""), 2));

  // Error correction and interleaving.
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ecl][ver];
  const blockEccLen = ECC_CODEWORDS_PER_BLOCK[ecl][ver];
  const rawCodewords = Math.floor(numRawDataModules(ver) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);
  const divisor = rsDivisor(blockEccLen);
  const blocks = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = dataCodewords.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, divisor);
    if (i < numShortBlocks) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const codewords = [];
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((block, j) => {
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) codewords.push(block[i]);
    });
  }

  // Matrix with function patterns.
  const size = ver * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  const isFunction = Array.from({ length: size }, () => new Array(size).fill(false));
  const setFunction = (x, y, dark) => {
    modules[y][x] = dark;
    isFunction[y][x] = true;
  };
  for (let i = 0; i < size; i++) {
    setFunction(6, i, i % 2 === 0);
    setFunction(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) setFunction(x, y, dist !== 2 && dist !== 4);
      }
    }
  }
  const align = alignmentPositions(ver);
  const last = align.length - 1;
  for (let i = 0; i < align.length; i++) {
    for (let j = 0; j < align.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) setFunction(align[i] + dx, align[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }
  const drawFormatBits = (mask) => {
    const data = (ECC_FORMAT_BITS[ecl] << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const f = ((data << 10) | rem) ^ 0x5412;
    const bit = (i) => ((f >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) setFunction(8, i, bit(i));
    setFunction(8, 7, bit(6));
    setFunction(8, 8, bit(7));
    setFunction(7, 8, bit(8));
    for (let i = 9; i < 15; i++) setFunction(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) setFunction(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) setFunction(8, size - 15 + i, bit(i));
    setFunction(8, size - 8, true);
  };
  drawFormatBits(0); // Reserve the format areas; redrawn after masking.
  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const v = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const dark = ((v >>> i) & 1) !== 0;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFunction(a, b, dark);
      setFunction(b, a, dark);
    }
  }

  // Place codewords in the zigzag order.
  let bitIndex = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFunction[y][x] && bitIndex < codewords.length * 8) {
          modules[y][x] = ((codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) !== 0;
          bitIndex++;
        }
      }
    }
  }

  const applyMask = (mask) => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let invert;
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break;
          case 1: invert = y % 2 === 0; break;
          case 2: invert = x % 3 === 0; break;
          case 3: invert = (x + y) % 3 === 0; break;
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
          case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          default: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
        }
        if (!isFunction[y][x] && invert) modules[y][x] = !modules[y][x];
      }
    }
  };

  let mask = options.mask;
  if (mask === undefined) {
    let best = Infinity;
    for (let m = 0; m < 8; m++) {
      applyMask(m);
      drawFormatBits(m);
      const score = penaltyScore(modules);
      if (score < best) {
        best = score;
        mask = m;
      }
      applyMask(m); // XOR undo.
    }
  }
  applyMask(mask);
  drawFormatBits(mask);
  return { version: ver, size, mask, modules };
}

function penaltyScore(modules) {
  const size = modules.length;
  let score = 0;
  const line = (get) => {
    // Rule 1: runs of five or more of the same color.
    let run = 1;
    for (let i = 1; i <= size; i++) {
      if (i < size && get(i) === get(i - 1)) run++;
      else {
        if (run >= 5) score += 3 + (run - 5);
        run = 1;
      }
    }
    // Rule 3: finder-like pattern with four light modules on either side (out of bounds counts as light).
    const at = (i) => (i >= 0 && i < size ? get(i) : false);
    const core = [true, false, true, true, true, false, true];
    for (let i = 0; i + 7 <= size; i++) {
      if (!core.every((v, k) => at(i + k) === v)) continue;
      const lightBefore = [1, 2, 3, 4].every((k) => !at(i - k));
      const lightAfter = [0, 1, 2, 3].every((k) => !at(i + 7 + k));
      if (lightBefore) score += 40;
      if (lightAfter) score += 40;
    }
  };
  for (let y = 0; y < size; y++) line((x) => modules[y][x]);
  for (let x = 0; x < size; x++) line((y) => modules[y][x]);
  // Rule 2: 2x2 blocks of one color.
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = modules[y][x];
      if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) score += 3;
    }
  }
  // Rule 4: dark/light balance.
  const dark = modules.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
  const total = size * size;
  score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return score;
}

// ---------- Renderers ----------

const BRAND_INK = "#1c2024";

function hexToRgb(hex) {
  let h = hex.slice(1);
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function toSvg(qr, { margin = 4, dark = BRAND_INK, light = "#ffffff" } = {}) {
  const dim = qr.size + margin * 2;
  let path = "";
  qr.modules.forEach((row, y) => {
    // One rectangle per horizontal run of dark modules.
    for (let x = 0; x < row.length; x++) {
      if (!row[x]) continue;
      let end = x;
      while (end + 1 < row.length && row[end + 1]) end++;
      path += `M${x + margin},${y + margin}h${end - x + 1}v1h-${end - x + 1}z`;
      x = end;
    }
  });
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges">`,
    `<rect width="${dim}" height="${dim}" fill="${light}"/>`,
    `<path d="${path}" fill="${dark}"/>`,
    `</svg>`,
    "",
  ].join("\n");
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([len, typeAndData, crc]);
}

export function toPng(qr, { margin = 4, scale = 16, dark = BRAND_INK, light = "#ffffff" } = {}) {
  const dim = (qr.size + margin * 2) * scale;
  const stride = dim * 3 + 1;
  const darkRgb = hexToRgb(dark);
  const lightRgb = hexToRgb(light);
  const raw = Buffer.alloc(stride * dim);
  for (let py = 0; py < dim; py++) {
    raw[py * stride] = 0; // Filter type: none.
    const my = Math.floor(py / scale) - margin;
    for (let px = 0; px < dim; px++) {
      const mx = Math.floor(px / scale) - margin;
      const on = my >= 0 && my < qr.size && mx >= 0 && mx < qr.size && qr.modules[my][mx];
      const rgb = on ? darkRgb : lightRgb;
      const at = py * stride + 1 + px * 3;
      raw[at] = rgb[0];
      raw[at + 1] = rgb[1];
      raw[at + 2] = rgb[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(dim, 0);
  ihdr.writeUInt32BE(dim, 4);
  ihdr[8] = 8; // Bit depth.
  ihdr[9] = 2; // Truecolor RGB.
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- CLI ----------

const UTM_SOURCES = ["meta", "whatsapp", "qr", "esn", "team", "ph"];

export function withUtm(url, { source, medium, campaign, content } = {}) {
  const u = new URL(url);
  if (source !== undefined) {
    if (!UTM_SOURCES.includes(source)) throw new Error(`utm_source must be one of ${UTM_SOURCES.join(", ")}`);
    u.searchParams.set("utm_source", source);
  }
  if (medium !== undefined) u.searchParams.set("utm_medium", medium);
  if (campaign !== undefined) u.searchParams.set("utm_campaign", campaign);
  if (content !== undefined) u.searchParams.set("utm_content", content);
  return u.toString();
}

function parseArgs(argv) {
  const opts = { out: "qr", ecc: "M", scale: 16, margin: 4, dark: BRAND_INK, light: "#ffffff", svg: true, png: true };
  const valued = new Set(["--out", "--source", "--medium", "--campaign", "--content", "--ecc", "--scale", "--margin", "--dark", "--light"]);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") opts.help = true;
    else if (arg === "--svg-only") opts.png = false;
    else if (arg === "--png-only") opts.svg = false;
    else if (valued.has(arg)) {
      const value = argv[++i];
      if (value === undefined) throw new Error(`${arg} needs a value`);
      opts[arg.slice(2)] = value;
    } else if (arg.startsWith("--")) throw new Error(`Unknown option ${arg}`);
    else if (opts.url === undefined) opts.url = arg;
    else throw new Error(`Unexpected argument ${arg}`);
  }
  opts.scale = Number(opts.scale);
  opts.margin = Number(opts.margin);
  if (!Number.isInteger(opts.scale) || opts.scale < 1) throw new Error("--scale must be a positive integer");
  if (!Number.isInteger(opts.margin) || opts.margin < 0) throw new Error("--margin must be a non-negative integer");
  for (const key of ["dark", "light"]) {
    if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(opts[key])) throw new Error(`--${key} must be a hex color like #1c2024`);
  }
  // Scanners need strong contrast; 7:1 keeps printed codes reliable.
  const contrast = (luminance(opts.light) + 0.05) / (luminance(opts.dark) + 0.05);
  if (contrast < 7) throw new Error(`--dark on --light contrast is ${contrast.toFixed(1)}:1; use at least 7:1 (dark modules on a light background)`);
  if (!opts.svg && !opts.png) throw new Error("--svg-only and --png-only exclude each other");
  return opts;
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
    if (opts.help || !opts.url) {
      console.log("Usage: node launch/make-qr.mjs <url> [--out path] [--source qr] [--medium poster] [--campaign name] [--content name] [--ecc M] [--scale 16] [--margin 4] [--dark #1c2024] [--light #ffffff] [--svg-only|--png-only]");
      process.exit(opts.help ? 0 : 1);
    }
    const parsed = new URL(opts.url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("URL must start with http:// or https://");
    const url = withUtm(opts.url, opts);
    const qr = encodeQr(url, { ecc: opts.ecc });
    const base = resolve(opts.out);
    mkdirSync(dirname(base), { recursive: true });
    console.log(`URL: ${url}`);
    console.log(`QR version ${qr.version}, ${qr.size}x${qr.size} modules, ECC ${opts.ecc.toUpperCase()}, mask ${qr.mask}`);
    if (opts.svg) {
      writeFileSync(`${base}.svg`, toSvg(qr, opts));
      console.log(`Saved: ${base}.svg`);
    }
    if (opts.png) {
      writeFileSync(`${base}.png`, toPng(qr, opts));
      console.log(`Saved: ${base}.png`);
    }
  } catch (err) {
    console.error(`make-qr: ${err.message}`);
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
