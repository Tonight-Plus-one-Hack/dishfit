// Share cards in the Cal AI look: dish photo, name, restaurant and Kiez, kcal, macros, price, health
// score and the DishFit mark. Drawn as SVG and rasterized to PNG with resvg (WebAssembly). Two formats:
// the link preview (1200 x 630) and the story (1080 x 1920). Drawing takes far more than the 10 ms CPU a
// Workers Free request may use, so the build draws the cards ahead of time (worker/scripts/render-cards.ts)
// and the Worker only draws on request where SHARE_CARD_RENDER allows it (src/share/routes.ts).
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";
import latinExt600 from "./fonts/inter-latin-ext-600.ttf";
import latinExt800 from "./fonts/inter-latin-ext-800.ttf";
import latin600 from "./fonts/inter-latin-600.ttf";
import latin800 from "./fonts/inter-latin-800.ttf";
import viet600 from "./fonts/inter-vietnamese-600.ttf";
import viet800 from "./fonts/inter-vietnamese-800.ttf";
import type { ShareDish } from "./dishes";
import { drawable, fit, measure, wrap, type Weight } from "./text";

export type CardFormat = "og" | "story";

export const CARD_SIZE: Record<CardFormat, { width: number; height: number }> = {
  og: { width: 1200, height: 630 },
  story: { width: 1080, height: 1920 },
};

const INK = "#1c2024";
const MUTED = "#60646c";
const TRACK = "#eeeef3";
const BANDS = { green: "#2fa866", orange: "#f0a03c", red: "#e5534b" };
const TIGHT = -0.02;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const band = (score: number) => (score >= 80 ? BANDS.green : score >= 60 ? BANDS.orange : BANDS.red);
export const formatPrice = (eur: number) => `${eur.toFixed(2).replace(".", ",")} €`;

function text(x: number, y: number, value: string, size: number, weight: Weight, fill: string, extra = ""): string {
  const tracking = size >= 40 ? ` letter-spacing="${TIGHT * size}"` : "";
  return `<text x="${x}" y="${y}" font-family="Inter" font-size="${size}" font-weight="${weight}" fill="${fill}"${tracking} ${extra}>${esc(value)}</text>`;
}

/** The brand symbol on its gradient tile, as in the app's BrandMark. */
function brandMark(x: number, y: number, size: number): string {
  const s = size / 32;
  const inner = 0.62;
  const offset = (size * (1 - inner)) / 2;
  return `<g transform="translate(${x} ${y})">
    <rect width="${size}" height="${size}" rx="${size * 0.3}" fill="url(#brand)"/>
    <g transform="translate(${offset} ${offset}) scale(${s * inner})" fill="#fff">
      <path d="M11.1 6.2 16 2.4c1.5-1.2 3.4-1.1 4.9 0l3.8 3c2.1 1.7 2.1 3.7.1 5.5-4 3.6-8.8 3.9-13.2.8-2.5-1.8-2.7-3.7-.5-5.5Z"/>
      <path d="M5.1 12.6c1.4-1.8 3.1-2 4.7-.5 4 3.8 4.3 8.1.6 12.3-1.7 2-3.6 2.1-5.3.1l-2.2-2.9c-1.8-2.3-1.6-4.7.1-7l2.1-2Z"/>
      <path d="M12 24.4c2.4-3 6.5-4.7 11.3-4.2 1 .1 1.4-.2 1.4-1.1 0-.7.6-.9 1.1-.5l2.2 2c2 1.9 1.9 4-.2 6l-4.6 3.1c-3.9 2.2-7.1 1.5-10.5-.8-1.8-1.2-2.1-2.7-.7-4.5Z"/>
      <circle cx="28.4" cy="14" r="2.8"/>
    </g>
  </g>`;
}

function brandRow(x: number, y: number, tile: number): string {
  return brandMark(x, y, tile) + text(x + tile + tile * 0.32, y + tile * 0.72, "DishFit", Math.round(tile * 0.62), 800, INK);
}

/** The macro glyphs from the app's icon set (src/assets/icon-set/svg), drawn on a 24 px grid. */
const GLYPHS = {
  kcal: `<path d="M12 2.6C12.8 5.7 15.2 7.4 16.9 9.7C18.4 11.7 19.2 13.5 19.2 15.3C19.2 19.2 16 21.8 12 21.8C8 21.8 4.8 19.2 4.8 15.3C4.8 12.7 6.1 10.4 7.7 9C7.8 10.7 8.6 12 9.8 12.6C9.4 9.1 10.6 5.4 12 2.6Z" fill="#FF7A1F"/><path d="M12 12.4C12.8 14.1 15.1 15.5 15.1 17.8C15.1 19.6 13.7 20.8 12 20.8C10.3 20.8 8.9 19.6 8.9 17.8C8.9 16.3 9.9 15.3 10.7 14.9C10.9 15.9 11.4 16.5 12 16.7C11.7 15.3 11.6 13.8 12 12.4Z" fill="#FFC83D"/>`,
  protein: `<path d="M13.6 10.4L17.4 6.6" fill="none" stroke="#FFD3BC" stroke-width="2.8" stroke-linecap="round"/><circle cx="16.8" cy="4.7" r="2" fill="#FFD3BC"/><circle cx="19.3" cy="7.2" r="2" fill="#FFD3BC"/><path d="M11.4 12.6L15.2 8.8" fill="none" stroke="#EF5B4C" stroke-width="3.6" stroke-linecap="round"/><ellipse cx="9.2" cy="14.8" rx="6.9" ry="5.6" transform="rotate(-45 9.2 14.8)" fill="#EF5B4C"/>`,
  carbs: `<g transform="rotate(28 12 12.4)"><path d="M12 21.8V8.4" fill="none" stroke="#F5A524" stroke-width="1.6" stroke-linecap="round"/><ellipse cx="9.2" cy="17" rx="1.65" ry="2.7" transform="rotate(-38 9.2 17)" fill="#FFC24D"/><ellipse cx="9.2" cy="12.6" rx="1.65" ry="2.7" transform="rotate(-38 9.2 12.6)" fill="#FFC24D"/><ellipse cx="9.4" cy="8.3" rx="1.55" ry="2.5" transform="rotate(-38 9.4 8.3)" fill="#FFC24D"/><ellipse cx="14.8" cy="17" rx="1.65" ry="2.7" transform="rotate(38 14.8 17)" fill="#F5A524"/><ellipse cx="14.8" cy="12.6" rx="1.65" ry="2.7" transform="rotate(38 14.8 12.6)" fill="#F5A524"/><ellipse cx="14.6" cy="8.3" rx="1.55" ry="2.5" transform="rotate(38 14.6 8.3)" fill="#F5A524"/><ellipse cx="12" cy="4.4" rx="1.5" ry="2.5" fill="#FFC24D"/></g>`,
  fat: `<path d="M12 3.2C9.4 6.7 5.4 10.9 5.4 14.8C5.4 18.5 8.3 21.2 12 21.2C15.7 21.2 18.6 18.5 18.6 14.8C18.6 10.9 14.6 6.7 12 3.2Z" fill="#3D9DF6"/><path d="M8.7 15.2C8.7 13.4 9.7 11.7 10.8 10.4" fill="none" stroke="#BFE0FF" stroke-width="1.8" stroke-linecap="round"/>`,
};

const glyph = (name: keyof typeof GLYPHS, x: number, y: number, size: number) =>
  `<g transform="translate(${x} ${y}) scale(${size / 24})">${GLYPHS[name]}</g>`;

/** Health score ring in its colour band with the number inside. */
function scoreRing(cx: number, cy: number, r: number, stroke: number, score: number, numberSize: number): string {
  const c = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, score)) / 100) * c;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${TRACK}" stroke-width="${stroke}"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${band(score)}" stroke-width="${stroke}" stroke-linecap="round"
      stroke-dasharray="${dash} ${c}" transform="rotate(-90 ${cx} ${cy})"/>
    ${text(cx, cy + numberSize * 0.36, String(score), numberSize, 800, INK, 'text-anchor="middle"')}`;
}

function photo(x: number, y: number, w: number, h: number, radius: number, image: string | null): string {
  const id = `clip${x}${y}`;
  const fill = image
    ? `<image href="${image}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`
    : `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="url(#brand)"/>
       <g opacity="0.22">${brandMark(x + w * 0.2, y + h * 0.2, w * 0.6).replace('fill="url(#brand)"', 'fill="none"')}</g>`;
  return `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}"/></clipPath>${fill}`;
}

/** Dark translucent pill on the photo, e.g. the price. */
function photoPill(x: number, y: number, label: string, size: number): string {
  const padX = size * 0.75;
  const h = size * 2;
  const w = measure(label, size, 800) + padX * 2;
  return `<rect x="${x - w}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="#111113" fill-opacity="0.72"/>
    ${text(x - w + padX, y + h * 0.66, label, size, 800, "#fff")}`;
}

/**
 * A white card with a soft shadow. The shadow is a few faint offset layers instead of an SVG blur filter,
 * which costs resvg seconds per card.
 */
function softCard(x: number, y: number, w: number, h: number, r: number): string {
  const layers = [
    [14, 10, 0.025],
    [8, 6, 0.035],
    [3, 2, 0.05],
  ]
    .map(([dy, grow, opacity]) => {
      const g = grow!;
      return `<rect x="${x - g}" y="${y - g + dy!}" width="${w + 2 * g}" height="${h + 2 * g}" rx="${r + g}" fill="#14163c" fill-opacity="${opacity}"/>`;
    })
    .join("");
  return `${layers}<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="#fff"/>`;
}

function defs(): string {
  return `<defs>
    <linearGradient id="brand" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#355eda"/><stop offset="0.55" stop-color="#6f7cf0"/><stop offset="1" stop-color="#9c90fe"/>
    </linearGradient>
    <linearGradient id="wash" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#eef0fe"/><stop offset="1" stop-color="#fcfcfd"/>
    </linearGradient>
  </defs>`;
}

/** Name and restaurant line as shown on the card: only drawable characters, never empty. */
export function cardLabels(dish: ShareDish): { name: string; place: string } {
  const name = drawable(dish.name) || `Gericht bei ${drawable(dish.restaurant) || "einem Restaurant"}`;
  const place = [drawable(dish.restaurant), dish.kiez].filter(Boolean).join(" · ");
  return { name, place };
}

function macros(x: number, baseline: number, colWidth: number, valueSize: number, labelSize: number, dish: ShareDish): string {
  const items = [
    { key: "protein" as const, value: dish.protein, label: "Protein" },
    { key: "carbs" as const, value: dish.carbs, label: "Kohlenhydrate" },
    { key: "fat" as const, value: dish.fat, label: "Fett" },
  ];
  const icon = Math.round(valueSize * 1.05);
  return items
    .map((m, i) => {
      const cx = x + i * colWidth;
      return (
        glyph(m.key, cx, baseline - valueSize * 0.92, icon) +
        text(cx + icon + valueSize * 0.25, baseline, `${m.value} g`, valueSize, 800, INK) +
        text(cx, baseline + labelSize * 1.6, m.label, labelSize, 600, MUTED)
      );
    })
    .join("");
}

export function ogSvg(dish: ShareDish, image: string | null): string {
  const { width, height } = CARD_SIZE.og;
  const { name, place } = cardLabels(dish);
  const colX = 642;
  const colW = 1160 - colX;
  const nameLines = wrap(name, 54, 800, colW, 3, TIGHT);
  const nameSvg = nameLines.map((l, i) => text(colX, 214 + i * 62, l, 54, 800, INK)).join("");
  const kcal = String(dish.kcal);
  const kcalW = measure(kcal, 56, 800, TIGHT);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${defs()}
  <rect width="${width}" height="${height}" fill="#f5f5f8"/>
  ${photo(40, 40, 556, 550, 36, image)}
  ${dish.price !== null ? photoPill(572, 64, formatPrice(dish.price), 26) : ""}
  ${brandRow(colX, 52, 48)}
  ${text(colX, 150, fit(place, 26, 600, colW), 26, 600, MUTED)}
  ${nameSvg}
  ${softCard(colX - 10, 392, colW + 20, 198, 30)}
  ${glyph("kcal", colX + 18, 418, 50)}
  ${text(colX + 78, 462, kcal, 56, 800, INK)}
  ${text(colX + 78 + kcalW + 10, 462, "kcal", 26, 600, MUTED)}
  ${scoreRing(1104, 444, 30, 7, dish.score, 24)}
  ${text(1104 - 60, 444 + 6, "Health", 20, 600, MUTED, 'text-anchor="end"')}
  ${macros(colX + 18, 540, 168, 30, 19, dish)}
</svg>`;
}

export function storySvg(dish: ShareDish, image: string | null): string {
  const { width, height } = CARD_SIZE.story;
  const { name, place } = cardLabels(dish);
  const x = 80;
  const w = width - 2 * x;
  const inner = x + 56;
  const innerW = w - 112;
  const nameLines = wrap(name, 74, 800, innerW, 2, TIGHT);
  const cardTop = 1072;
  let y = cardTop + 92;
  const placeSvg = text(inner, y, fit(place, 34, 600, innerW), 34, 600, MUTED);
  y += 96;
  const nameSvg = nameLines.map((l, i) => text(inner, y + i * 86, l, 74, 800, INK)).join("");
  y += (nameLines.length - 1) * 86 + 150;
  const kcal = String(dish.kcal);
  const kcalW = measure(kcal, 96, 800, TIGHT);
  const kcalSvg =
    glyph("kcal", inner, y - 84, 84) +
    text(inner + 104, y, kcal, 96, 800, INK) +
    text(inner + 104 + kcalW + 16, y, "kcal", 40, 600, MUTED) +
    scoreRing(inner + innerW - 54, y - 34, 52, 11, dish.score, 40) +
    text(inner + innerW - 128, y - 22, "Health", 30, 600, MUTED, 'text-anchor="end"');
  y += 130;
  const macroSvg = macros(inner, y, innerW / 3, 50, 30, dish);
  const cardBottom = y + 110;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${defs()}
  <rect width="${width}" height="${height}" fill="url(#wash)"/>
  ${brandRow(x, 104, 76)}
  ${photo(x, 232, w, 800, 56, image)}
  ${dish.price !== null ? photoPill(x + w - 36, 268, formatPrice(dish.price), 38) : ""}
  ${softCard(x, cardTop, w, cardBottom - cardTop, 52)}
  ${placeSvg}
  ${nameSvg}
  ${kcalSvg}
  ${macroSvg}
  ${text(width / 2, 1800, dish.estimate ? "Nährwerte: KI-Schätzung" : "Nährwerte vom Restaurant", 28, 600, MUTED, 'text-anchor="middle"')}
  ${text(width / 2, 1850, "Gefunden mit DishFit · gesund essen in Berlin", 28, 600, MUTED, 'text-anchor="middle"')}
</svg>`;
}

/** The DishFit card for pages without a dish card: brand tile, name and promise. */
export function brandSvg(format: CardFormat): string {
  const { width, height } = CARD_SIZE[format];
  const tile = format === "og" ? 168 : 260;
  const title = format === "og" ? 76 : 104;
  const lede = format === "og" ? 34 : 46;
  const cy = height / 2 - (format === "og" ? 40 : 120);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${defs()}
  <rect width="${width}" height="${height}" fill="url(#wash)"/>
  ${brandMark(width / 2 - tile / 2, cy - tile, tile)}
  ${text(width / 2, cy + title * 1.45, "DishFit", title, 800, INK, 'text-anchor="middle"')}
  ${text(width / 2, cy + title * 1.45 + lede * 1.9, "Gesund essen gehen in Berlin", lede, 600, MUTED, 'text-anchor="middle"')}
  ${text(width / 2, cy + title * 1.45 + lede * 3.3, "Gerichte mit Preis, Kalorien und Protein", lede, 600, MUTED, 'text-anchor="middle"')}
</svg>`;
}

/** Bump when the card design changes, so every card is drawn again. */
export const CARD_DESIGN = 1;

/** Short hash of the design and the dish's card data: a card file name changes whenever its content would. */
export async function cardVersion(dish: ShareDish): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${CARD_DESIGN}:${JSON.stringify(dish)}`));
  return [...new Uint8Array(digest).subarray(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Where the build puts pre-rendered cards in the static assets (worker/scripts/render-cards.ts). */
export const prebuiltCardPath = (version: string, format: CardFormat) => `/share/cards/${version}-${format}.jpg`;
export const brandCardPath = (format: CardFormat) => `/share/cards/dishfit-${format}.jpg`;

let ready: Promise<void> | null = null;
const FONTS = [latin800, latin600, latinExt800, latinExt600, viet800, viet600].map((f) => new Uint8Array(f));

function rasterize(format: CardFormat, dish: ShareDish | null, image: string | null) {
  const svg = !dish ? brandSvg(format) : format === "og" ? ogSvg(dish, image) : storySvg(dish, image);
  const resvg = new Resvg(svg, {
    font: { fontBuffers: FONTS, loadSystemFonts: false, defaultFontFamily: "Inter" },
    fitTo: { mode: "original" },
  });
  const rendered = resvg.render();
  resvg.free();
  return rendered;
}

async function ensureWasm(): Promise<void> {
  ready ??= initWasm(resvgWasm).catch((error: unknown) => {
    ready = null;
    throw error;
  });
  await ready;
}

/** PNG bytes of a dish card, or of the brand card without a dish. */
export async function renderCard(format: CardFormat, dish: ShareDish | null, image: string | null): Promise<Uint8Array> {
  await ensureWasm();
  const rendered = rasterize(format, dish, image);
  const png = rendered.asPng();
  rendered.free();
  return png;
}

/** RGBA pixels of a card, for encoders other than PNG (the build writes JPEG). */
export async function renderCardPixels(
  format: CardFormat,
  dish: ShareDish | null,
  image: string | null,
): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  await ensureWasm();
  const rendered = rasterize(format, dish, image);
  const result = { data: new Uint8ClampedArray(rendered.pixels), width: rendered.width, height: rendered.height };
  rendered.free();
  return result;
}
