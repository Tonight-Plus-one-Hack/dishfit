// Finds a restaurant's menu on its own website: robots.txt respected, same-site crawl to depth 2,
// HTML text, PDFs and menu images. Delivery platforms (Wolt, Lieferando, ...) are only noted, never fetched.
import type { SkipReason } from '../types.ts';
import { isDeliveryPlatform, isHostedDeliveryPage } from './delivery.ts';

export interface MenuDocument {
  kind: 'html' | 'pdf' | 'image';
  url: string;
  text?: string;
  bytes?: Uint8Array;
  mediaType?: string;
}

export type MenuFetch = { docs: MenuDocument[]; aggregatorLinks: string[] } | { skip: SkipReason; detail: string; aggregatorLinks: string[] };

export interface MenuFetcher {
  fetchMenu(r: { id: string; name: string; website: string }): Promise<MenuFetch>;
}

const UA = 'MenuPipelineBot/0.1';
const MENU_WORDS = /(speisekarte|speise|men[uü]|karte|food|essen|gerichte|mittag|lunch|dinner|abend|carte|naehrwert|nährwert|nutrition|bowls?|salads?)/i;
const NOT_MENU = /(impressum|datenschutz|privacy|agb|terms|jobs?|karriere|career|vermoegen|vermögen|investor|presse|press|gutschein|newsletter|cookie|login|cart|warenkorb)/i;
const PRICE = /(?:€\s?\d{1,3}(?:[.,]\d{1,2})?|\b\d{1,3}[.,]\d{1,2}\s?(?:€|eur\b)?|\b\d{1,2}[.,]\d\b)/gi;
const MAX_HTML_CHARS = 60000;
const MAX_PDF_BYTES = 12 * 1024 * 1024;
const MAX_IMAGE_BYTES = 3_500_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(br|\/p|\/li|\/h\d|\/tr|\/div|\/section|\/article|\/dt|\/dd)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

function decodeEntities(s: string): string {
  const named: Record<string, string> = { amp: '&', nbsp: ' ', euro: '€', quot: '"', apos: "'", lt: '<', gt: '>', auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', eacute: 'é', egrave: 'è', ndash: '-', mdash: '-', hellip: '...' };
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return named[e] ?? m;
  });
}

export function countPrices(text: string): number {
  return (text.match(PRICE) ?? []).length;
}

export function extractLinks(html: string, base: string): { href: string; text: string }[] {
  const out: { href: string; text: string }[] = [];
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const m of html.matchAll(re)) {
    try {
      const href = new URL(decodeEntities(m[1]!), base).toString().split('#')[0]!;
      if (href.startsWith('http')) out.push({ href, text: htmlToText(m[2]!).slice(0, 80) });
    } catch { /* bad URL */ }
  }
  return out;
}

export function extractImages(html: string, base: string): { src: string; alt: string }[] {
  const out: { src: string; alt: string }[] = [];
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    const alt = /\balt\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? '';
    if (!src) continue;
    try { out.push({ src: new URL(decodeEntities(src), base).toString(), alt }); } catch { /* bad URL */ }
  }
  return out;
}

function attribute(tag: string, name: string): string | undefined {
  const pattern = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const match = pattern.exec(tag);
  return match ? decodeEntities(match[1] ?? match[2] ?? match[3] ?? '') : undefined;
}

export function logoLinks(html: string, page: string): string[] {
  const header = html.match(/<header\b[^>]*>[\s\S]*?<\/header>/gi)?.join(' ') ?? '';
  const branded = extractImages(header || html, page).filter((img) => /\blogo\b|[_-]logo/i.test(`${img.alt} ${img.src}`));
  const icons = [...html.matchAll(/<link\b[^>]*>/gi)].flatMap(([tag]) => {
    const rel = attribute(tag, 'rel')?.toLowerCase().split(/\s+/);
    const href = attribute(tag, 'href');
    if (!href || !rel) return [];
    if (rel.some((token) => token.startsWith('apple-touch-icon'))) return [{ href, rank: 0 }];
    return rel.includes('icon') ? [{ href, rank: 1 }] : [];
  }).toSorted((a, b) => a.rank - b.rank);
  const social = [...html.matchAll(/<meta\b[^>]*>/gi)].flatMap(([tag]) => {
    const image = attribute(tag, 'content');
    return attribute(tag, 'property')?.toLowerCase() === 'og:image' && image && /logo|brand|favicon/i.test(image) ? [image] : [];
  });
  const links = new Set<string>();
  for (const href of [...branded.map((img) => img.src), ...icons.map((icon) => icon.href), '/favicon.ico', ...social]) {
    try {
      const url = new URL(href, page);
      url.hash = '';
      const generic = /\/wp-includes\/images\/|\/themes\/enfold\/images\/|\/wordpress[_.-]|static\.parastorage\.com|\/static\/icons\/favicons\/restaurant\.ico|\/runtime\/favicon_d1_res\.ico/i.test(url.href);
      if (/^https?:$/.test(url.protocol) && !generic && !isDeliveryPlatform(url.href)) links.add(url.href);
    } catch { /* invalid markup URL */ }
  }
  return [...links];
}

const LOGO_MAX_BYTES = 2 * 1024 * 1024;

async function boundedBytes(response: Response, max: number): Promise<Buffer | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    if (Number(response.headers.get('content-length')) > max) return null;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return Buffer.concat(chunks, size);
      size += value.length;
      if (size > max) return null;
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
}

/** Minimal robots.txt evaluation for the "*" group (and our agent): longest matching rule wins. */
export function robotsAllows(robots: string, path: string, agent = UA): boolean {
  type Rule = { allow: boolean; path: string };
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  let cur: { agents: string[]; rules: Rule[] } | null = null;
  let lastWasAgent = false;
  for (const raw of robots.split('\n')) {
    const line = raw.replace(/#.*/, '').trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const value = m[2]!.trim();
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (cur && (key === 'allow' || key === 'disallow') && value) cur.rules.push({ allow: key === 'allow', path: value });
    }
  }
  const name = agent.split('/')[0]!.toLowerCase();
  const group = groups.find((g) => g.agents.some((a) => a !== '*' && name.includes(a))) ?? groups.find((g) => g.agents.includes('*'));
  if (!group) return true;
  let best: Rule | null = null;
  for (const r of group.rules) {
    const pattern = new RegExp('^' + r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
    if (pattern.test(path) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  }
  return best ? best.allow : true;
}

const host = (u: string) => new URL(u).hostname.replace(/^www\./, '');
const sameSite = (url: string, base: string) => {
  const candidate = host(url);
  const origin = host(base);
  return candidate === origin || candidate.endsWith(`.${origin}`) || origin.endsWith(`.${candidate}`);
};

export class WebsiteMenuFetcher implements MenuFetcher {
  private readonly robotsCache = new Map<string, string>();
  private readonly timeoutMs: number;

  constructor(timeoutMs = 15000) {
    this.timeoutMs = timeoutMs;
  }

  private async get(url: string): Promise<Response> {
    return fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/pdf,image/*;q=0.8,*/*;q=0.5' }, redirect: 'manual', signal: AbortSignal.timeout(this.timeoutMs) });
  }

  private async follow(url: string, checkRobots: boolean, site?: string): Promise<Response | null> {
    for (let redirects = 0; redirects <= 5; redirects++) {
      if (!/^https?:\/\//.test(url) || isDeliveryPlatform(host(url))) return null;
      if (site && !sameSite(url, site)) return null;
      if (checkRobots && !(await this.allowed(url))) return null;
      const res = await this.get(url);
      if (!REDIRECT_STATUSES.has(res.status)) return res;
      const location = res.headers.get('location');
      await res.body?.cancel();
      if (!location) return null;
      url = new URL(location, url).href;
    }
    return null;
  }

  private async allowed(url: string): Promise<boolean> {
    const u = new URL(url);
    let robots = this.robotsCache.get(u.origin);
    if (robots === undefined) {
      try {
        const res = await this.follow(`${u.origin}/robots.txt`, false);
        if (!res || res.status >= 500 || res.status === 429) return false;
        robots = res.ok ? await res.text() : '';
      } catch {
        return false;
      }
      this.robotsCache.set(u.origin, robots);
    }
    return robotsAllows(robots, u.pathname + u.search);
  }

  /** Fetch only icons or images the official website exposes, subject to robots.txt on each origin. */
  async *logos(website: string): AsyncGenerator<{ url: string; bytes: Buffer }> {
    const home = await this.follow(website, true);
    if (!home) return;
    if (!home.ok || !/\bhtml\b/i.test(home.headers.get('content-type') ?? '')) {
      await home.body?.cancel();
      return;
    }
    const html = (await boundedBytes(home, LOGO_MAX_BYTES))?.toString('utf8');
    if (!html || isHostedDeliveryPage(html)) return;
    for (const url of logoLinks(html, home.url || website).slice(0, 10)) {
      try {
        const image = await this.follow(url, true);
        if (!image) continue;
        if (!image.ok || !/^image\//i.test(image.headers.get('content-type') ?? '')) {
          await image.body?.cancel();
          continue;
        }
        const bytes = await boundedBytes(image, LOGO_MAX_BYTES);
        if (bytes?.length) yield { url: image.url || url, bytes };
      } catch { /* an unavailable logo may have a declared fallback */ }
    }
  }

  async fetchMenu(r: { id: string; name: string; website: string }): Promise<MenuFetch> {
    const aggregatorLinks = new Set<string>();
    const home = r.website;
    if (isDeliveryPlatform(home)) return { skip: 'aggregator_only', detail: 'website tag points to a delivery platform', aggregatorLinks: [home] };
    if (!(await this.allowed(home))) return { skip: 'robots_disallowed', detail: 'robots.txt disallows the home page', aggregatorLinks: [] };
    let homeHtml: string;
    let homeUrl: string;
    try {
      const res = await this.follow(home, true);
      if (!res) return { skip: 'website_unreachable', detail: 'home redirects to a delivery platform or a URL robots.txt blocks', aggregatorLinks: [] };
      if (!res.ok) return { skip: 'website_unreachable', detail: `HTTP ${res.status}`, aggregatorLinks: [] };
      homeHtml = await res.text();
      homeUrl = res.url || home;
    } catch (e) {
      return { skip: 'website_unreachable', detail: String(e).slice(0, 200), aggregatorLinks: [] };
    }
    if (isHostedDeliveryPage(homeHtml)) return { skip: 'aggregator_only', detail: 'website uses a delivery platform template', aggregatorLinks: [homeUrl] };

    const pages = new Map<string, string>([[homeUrl, homeHtml]]);
    const pdfs = new Map<string, string>(); // url -> link text
    const queue: { url: string; depth: number }[] = [];
    const seen = new Set([homeUrl]);
    const consider = (html: string, base: string, depth: number) => {
      for (const l of extractLinks(html, base)) {
        if (isDeliveryPlatform(l.href)) { aggregatorLinks.add(l.href); continue; }
        const isPdf = /\.pdf(\?|$)/i.test(l.href);
        const label = `${l.href} ${l.text}`;
        if (NOT_MENU.test(label)) continue;
        if (isPdf) {
          if (MENU_WORDS.test(label) || depth > 0) pdfs.set(l.href, l.text);
        } else if (sameSite(l.href, homeUrl) && MENU_WORDS.test(label) && !seen.has(l.href) && depth < 2) {
          seen.add(l.href);
          queue.push({ url: l.href, depth: depth + 1 });
        }
      }
    };
    consider(homeHtml, homeUrl, 0);
    let visited = 0;
    while (queue.length && visited < 8) {
      const next = queue.shift()!;
      visited++;
      try {
        const res = await this.follow(next.url, true, homeUrl);
        if (!res?.ok) continue;
        const type = res.headers.get('content-type') ?? '';
        if (!type.includes('html')) {
          if (type.includes('pdf')) pdfs.set(res.url || next.url, '');
          await res.body?.cancel();
          continue;
        }
        const html = await res.text();
        if (isHostedDeliveryPage(html)) { aggregatorLinks.add(res.url || next.url); continue; }
        pages.set(res.url || next.url, html);
        consider(html, res.url || next.url, next.depth);
      } catch { /* skip page */ }
    }

    const docs: MenuDocument[] = [];
    // 1. HTML pages that look like a menu (many prices).
    const htmlPages = [...pages.entries()].map(([url, html]) => ({ url, text: htmlToText(html) }))
      .map((p) => ({ ...p, prices: countPrices(p.text) }))
      .filter((p) => p.prices >= (p.url === homeUrl && !MENU_WORDS.test(new URL(p.url).pathname) ? 6 : 1))
      .toSorted((a, b) => b.prices - a.prices);
    for (const p of htmlPages.slice(0, 2)) docs.push({ kind: 'html', url: p.url, text: p.text.slice(0, MAX_HTML_CHARS) });
    // 2. PDFs (menus, nutrition sheets).
    for (const [url] of [...pdfs.entries()].slice(0, 3)) {
      try {
        const res = await this.follow(url, true);
        if (!res?.ok) continue;
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (bytes.byteLength > MAX_PDF_BYTES || bytes.byteLength < 500) continue;
        if (String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') continue;
        docs.push({ kind: 'pdf', url: res.url || url, bytes, mediaType: 'application/pdf' });
      } catch { /* skip */ }
    }
    // 3. Menu images, only when nothing textual was found.
    if (!docs.length) {
      const imgs = [...pages.entries()].flatMap(([url, html]) => extractImages(html, url))
        .filter((i) => MENU_WORDS.test(`${i.src} ${i.alt}`) && !/logo|icon|favicon/i.test(i.src) && /\.(jpe?g|png|webp)(\?|$)/i.test(i.src));
      for (const img of imgs.slice(0, 4)) {
        try {
          const res = await this.follow(img.src, true);
          if (!res?.ok) continue;
          const type = (res.headers.get('content-type') ?? '').split(';')[0]!;
          if (!/^image\/(jpeg|png|webp)$/.test(type)) continue;
          const bytes = new Uint8Array(await res.arrayBuffer());
          if (bytes.byteLength > MAX_IMAGE_BYTES || bytes.byteLength < 20000) continue;
          docs.push({ kind: 'image', url: res.url || img.src, bytes, mediaType: type });
        } catch { /* skip */ }
      }
    }
    if (docs.length) return { docs, aggregatorLinks: [...aggregatorLinks] };
    const homeText = htmlToText(homeHtml);
    if (aggregatorLinks.size) return { skip: 'aggregator_only', detail: 'menu only on delivery platforms', aggregatorLinks: [...aggregatorLinks] };
    if (homeText.length < 300 && /<script/i.test(homeHtml)) return { skip: 'js_rendered', detail: `home page has ${homeText.length} chars of text`, aggregatorLinks: [] };
    return { skip: 'no_menu', detail: `no menu page, PDF or image found (${pages.size} pages checked)`, aggregatorLinks: [] };
  }
}

/** Static menu documents per restaurant id (tests and the spike fixture). */
export class FixtureMenuFetcher implements MenuFetcher {
  private readonly items: Map<string, MenuFetch>;
  constructor(items: Map<string, MenuFetch>) {
    this.items = items;
  }
  async fetchMenu(r: { id: string }): Promise<MenuFetch> {
    return this.items.get(r.id) ?? { skip: 'no_menu', detail: 'fixture has no menu', aggregatorLinks: [] };
  }
}
