// Text measuring and wrapping for the share cards. SVG has no automatic line breaks, so lines are
// broken here with Inter's real advance widths (fonts/metrics.json, per 1000 units of font size).
import metrics from "./fonts/metrics.json";

export type Weight = 600 | 800;

const ADVANCE: Record<Weight, Record<string, number>> = { 600: metrics["600"], 800: metrics["800"] };
const FALLBACK_ADVANCE = 600;

/** Keeps only characters the bundled Inter subsets can draw, so no tofu boxes reach a card. */
export function drawable(text: string): string {
  const kept = [...text.normalize("NFC")].filter((ch) => ch === " " || ADVANCE[600][String(ch.codePointAt(0))] !== undefined).join("");
  return kept
    .replace(/\(\s*\)|\[\s*\]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s,;:·–-]+|[\s,;:·–-]+$/g, "")
    .trim();
}

/** Width in px of one line at the given size, letter spacing in em. */
export function measure(text: string, size: number, weight: Weight, tracking = 0): number {
  let units = 0;
  let count = 0;
  for (const ch of text) {
    units += ADVANCE[weight][String(ch.codePointAt(0))] ?? FALLBACK_ADVANCE;
    count++;
  }
  return (units * size) / 1000 + Math.max(0, count - 1) * tracking * size;
}

/** Cuts a line to fit maxWidth, ending in an ellipsis when it had to cut. */
export function fit(text: string, size: number, weight: Weight, maxWidth: number, tracking = 0): string {
  if (measure(text, size, weight, tracking) <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && measure(`${cut}…`, size, weight, tracking) > maxWidth) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

/** Greedy word wrap into at most maxLines lines; the last line ends in an ellipsis when text is left over. */
export function wrap(text: string, size: number, weight: Weight, maxWidth: number, maxLines: number, tracking = 0): string[] {
  const words = text.split(" ").filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (let i = 0; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i]!;
    if (measure(next, size, weight, tracking) <= maxWidth || !line) {
      line = next;
      continue;
    }
    lines.push(line);
    line = words[i]!;
    if (lines.length === maxLines - 1) {
      line = words.slice(i).join(" ");
      break;
    }
  }
  if (line) lines.push(line);
  return lines.map((l) => fit(l, size, weight, maxWidth, tracking));
}
