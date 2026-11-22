/**
 * A small multilingual word filter (de, en, es, fr, it, tr): slurs, targeted
 * insults, threats and sexual harassment. Run it on any text a user can make
 * other people see (names, notes, feedback, captions) before it is stored,
 * as the safety net when AI moderation is off or slow.
 *
 * Casual swearing ("Scheiße", "fuck yeah") stays allowed: the list targets
 * attacks on people, not tone.
 *
 * Matching runs on a normalized form: lowercase, accents stripped, Cyrillic
 * and Greek look-alike letters mapped to Latin, common leetspeak undone
 * (h4ck3r -> hacker; "!", "1" and "|" count as "i" only between two letters),
 * separators inside words removed (f.u.c.k) and letter runs collapsed
 * (fuuuck -> fuck). Phrases also match written together ("fuckyou").
 * Zero-width characters are tried both as separators and as nothing.
 *
 * Ported from fm/lane2-chat-safety (apps/api/src/safety/word-filter.ts),
 * which hardened fm/t3-chat-safety's list per the security audit (H6, N2).
 */

type Rule = { term: string; mode: "word" | "prefix" | "part" };

/** Whole token only (safe for short or ambiguous terms). */
const WORDS = [
  // en
  "cunt", "cunts", "fag", "fags", "faggot", "faggots", "nigger", "niggers", "nigga", "niggas",
  "retarded", "tranny", "trannies", "kike", "kikes", "spic", "spics", "chink", "chinks",
  "whore", "whores", "slut", "sluts", "raped", "rapist", "rapists", "kys", "nudes", "dickpic",
  // de
  "fotze", "fotzen", "wichser", "spast", "spasti", "spacko", "missgeburt", "schlampe", "schlampen",
  "nutte", "nutten", "neger", "kanake", "kanaken", "schwuchtel", "zigeuner",
  "nacktbilder", "nacktfotos",
  // es
  "puta", "putas", "maricon", "marica", "zorra",
  // fr
  "salope", "pute", "encule", "bougnoule", "negre",
  // it
  "frocio", "ricchione", "troia", "puttana", "negro di merda",
  // tr
  "orospu", "ibne", "yarrak", "amk", "kahpe",
];

/** Token starts with the stem (inflections: Hurensöhne, vergewaltigen). */
const PREFIXES = ["hurensohn", "huerensohn", "vergewaltig", "orospucocu"];

/** Anywhere inside a token (German compounds like Drecksfotze). */
const PARTS = ["fotze", "hurensohn", "nigger", "schwuchtel", "kanake", "wichser"];

/** Multi-word phrases, matched on the normalized text. */
const PHRASES = [
  // en
  "kill yourself", "kill your self", "go kill yourself", "i will kill you", "ill kill you", "im going to kill you",
  "hang yourself", "go die", "fuck you", "fuck u", "i will rape you", "rape you", "send nudes", "send me nudes", "suck my dick", "dick pic",
  "show me your tits", "i know where you live",
  // de
  "fick dich", "ich fick dich", "fick deine mutter", "ich bring dich um", "bring dich um", "ich tote dich",
  "ich stech dich ab", "ich stech dich", "halt die fresse", "schick nacktbilder", "schick mir nacktbilder",
  "ich weiss wo du wohnst", "lutsch meinen schwanz",
  // es
  "hijo de puta", "te voy a matar", "matate", "chupame la",
  // fr
  "va te faire foutre", "fils de pute", "nique ta mere", "je vais te tuer", "suce ma",
  // it
  "vaffanculo", "figlio di puttana", "ti ammazzo", "succhiamelo",
  // tr
  "orospu cocugu", "amina koyayim", "amina koyim", "siktir git", "seni oldururum", "anani sikeyim",
];

const LEET: Record<string, string> = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "@": "a", "$": "s", "€": "e", "!": "i", "|": "i",
};

/** "!", "1" and "|" are "i" only between two letters ("sh!t", "n1gger"), else punctuation. */
const AMBIGUOUS_I = new Set(["!", "1", "|"]);

/** Cyrillic and Greek letters that look like Latin ones (after lowercasing). */
const HOMOGLYPHS: Record<string, string> = {
  а: "a", в: "b", е: "e", к: "k", м: "m", н: "h", о: "o", р: "p", с: "c", т: "t", у: "y", х: "x",
  і: "i", ј: "j", ѕ: "s", ԁ: "d", ү: "y", һ: "h", ӏ: "l", ԛ: "q", ԝ: "w", ь: "b",
  α: "a", β: "b", γ: "y", ε: "e", η: "n", ι: "i", κ: "k", ν: "v", ο: "o", ρ: "p", τ: "t", υ: "u", χ: "x", ω: "w",
};

const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/g;
const HAS_ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/;

/** Lowercase, strip accents, map special and look-alike letters. Keeps spacing. */
function fold(text: string): string {
  return text
    .replace(/\u00AD/g, "")
    .replace(/ß/g, "ss")
    .replace(/ı/g, "i")
    .replace(/İ/g, "i")
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/\P{ASCII}/gu, (c) => HOMOGLYPHS[c] ?? c);
}

/** Collapses runs of the same letter: "fuuuck" -> "fuck", "kill" -> "kil". */
function squeeze(token: string): string {
  return token.replace(/(\p{L})\1+/gu, "$1");
}

const isLetterLike = (c: string | undefined): boolean =>
  c !== undefined && (/\p{L}/u.test(c) || (c in LEET && !AMBIGUOUS_I.has(c)));

/** Turns a raw chunk (one whitespace-separated piece) into a plain word. */
function cleanToken(chunk: string): string {
  const chars = [...chunk];
  const hasLetter = chars.some((c) => /\p{L}/u.test(c));
  const mapped = hasLetter
    ? chars
        .map((c, i) =>
          AMBIGUOUS_I.has(c) ? (isLetterLike(chars[i - 1]) && isLetterLike(chars[i + 1]) ? "i" : "") : (LEET[c] ?? c),
        )
        .join("")
    : chunk;
  return mapped.replace(/[^\p{L}\p{N}]+/gu, "");
}

/** Words of a text, with runs of single letters joined ("f u c k" -> "fuck"). */
export function tokenize(text: string): string[] {
  const raw = fold(text).split(/\s+/).map(cleanToken).filter(Boolean);
  const tokens: string[] = [];
  let run = "";
  for (const token of raw) {
    if (token.length === 1 && /\p{L}/u.test(token)) {
      run += token;
      continue;
    }
    if (run) {
      tokens.push(run);
      run = "";
    }
    tokens.push(token);
  }
  if (run) tokens.push(run);
  return tokens;
}

function compile(): { rules: Rule[]; phrases: string[]; collapsed: Set<string>; longest: number } {
  const rules: Rule[] = [
    ...WORDS.filter((w) => !w.includes(" ")).map((term) => ({ term: squeeze(fold(term)), mode: "word" as const })),
    ...PREFIXES.map((term) => ({ term: squeeze(fold(term)), mode: "prefix" as const })),
    ...PARTS.map((term) => ({ term: squeeze(fold(term)), mode: "part" as const })),
  ];
  const phrases = [...PHRASES, ...WORDS.filter((w) => w.includes(" "))].map((p) =>
    tokenize(p).map(squeeze).join(" "),
  );
  // Phrases written together or split oddly ("fuckyou", "fu ck you").
  const collapsed = new Set(phrases.map((p) => squeeze(p.replaceAll(" ", ""))));
  const longest = Math.max(...phrases.map((p) => p.split(" ").length)) + 2;
  return { rules, phrases, collapsed, longest };
}

const COMPILED = compile();

export type FilterResult = { ok: true } | { ok: false; match: string };

/** Checks one user text against the word list. */
export function checkText(text: string): FilterResult {
  // Zero-width characters hide a word break ("kill\u200Byourself") or split a word ("hurens\u200Bohn").
  const asSeparator = checkNormalized(text.replace(ZERO_WIDTH, " "));
  if (!asSeparator.ok || !HAS_ZERO_WIDTH.test(text)) return asSeparator;
  return checkNormalized(text.replace(ZERO_WIDTH, ""));
}

function checkNormalized(text: string): FilterResult {
  const tokens = tokenize(text).map(squeeze);
  for (const token of tokens) {
    for (const rule of COMPILED.rules) {
      const hit =
        rule.mode === "word"
          ? token === rule.term
          : rule.mode === "prefix"
            ? token.startsWith(rule.term)
            : token.includes(rule.term);
      if (hit) return { ok: false, match: rule.term };
    }
  }
  const joined = ` ${tokens.join(" ")} `;
  for (const phrase of COMPILED.phrases) {
    if (joined.includes(` ${phrase} `)) return { ok: false, match: phrase };
  }
  for (let start = 0; start < tokens.length; start++) {
    let together = "";
    for (let end = start; end < tokens.length && end - start < COMPILED.longest; end++) {
      together += tokens[end];
      const candidate = squeeze(together);
      if (COMPILED.collapsed.has(candidate)) return { ok: false, match: candidate };
    }
  }
  return { ok: true };
}
