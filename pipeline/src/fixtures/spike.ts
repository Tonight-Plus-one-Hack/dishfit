// Fixture adapters built from the 10-restaurant menu spike (data/menu-spike outside the repo):
// OSM records from its Overpass export, synthetic Places hits (rating 4.5, marked fixture) and the
// menu documents the spike downloaded from each restaurant's own website.
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { FixtureOsm, osmElementToRestaurant } from '../sources/osm.ts';
import { FixturePlaces } from '../sources/places.ts';
import { FixtureMenuFetcher, type MenuDocument, type MenuFetch } from '../sources/website.ts';
import type { OsmRestaurant, PlacesCandidate } from '../types.ts';

export function defaultSpikeDir(): string {
  return process.env.PIPELINE_SPIKE_DIR ?? join(homedir(), '.firstmate-secondmate-launchlab', 'data', 'menu-spike');
}

interface FetchResult { osm: string; name: string; slug: string; format: string; sources?: string[]; aggregator_links?: string[] }
interface Job { slug: string; mode: string; files: string[]; source: string }

const NUTRITION_OR_MENU = /(menu|men[uü]e|speisekarte|karte|naehrwert|nährwert|nutrition)/i;

export function loadSpikeFixture(dir = defaultSpikeDir()) {
  if (!existsSync(join(dir, 'raw', 'fetch_results.json'))) throw new Error(`spike data not found in ${dir} (set PIPELINE_SPIKE_DIR)`);
  const results = JSON.parse(readFileSync(join(dir, 'raw', 'fetch_results.json'), 'utf8')) as FetchResult[];
  const jobs = (JSON.parse(readFileSync(join(dir, 'jobs.json'), 'utf8')) as Job[]).filter((j) => j.mode === 'text');
  const overpass = JSON.parse(readFileSync(join(dir, 'raw', 'overpass.json'), 'utf8')) as { elements: Parameters<typeof osmElementToRestaurant>[0][] };
  const byOsm = new Map(overpass.elements.map((e) => [`${e.type}/${e.id}`, e]));

  const osm: OsmRestaurant[] = [];
  const places: PlacesCandidate[] = [];
  const menus = new Map<string, MenuFetch>();
  for (const r of results) {
    const el = byOsm.get(r.osm);
    const rec = el ? osmElementToRestaurant(el) : null;
    if (!rec) continue;
    osm.push(rec);
    // Synthetic Places hit ~10 m away so stage 1 matching is exercised; not a real Google rating.
    places.push({ placeId: `fixture-${r.slug}`, name: r.name, location: { lat: rec.lat + 0.00008, lng: rec.lng + 0.00005 }, rating: 4.5, userRatingCount: 100, websiteUri: rec.website, businessStatus: 'OPERATIONAL' });
    const id = `osm:${rec.osmId}`;
    const aggregatorLinks = r.aggregator_links ?? [];
    const raw = join(dir, 'raw', r.slug);
    const docs: MenuDocument[] = [];
    for (const j of jobs.filter((x) => x.slug === r.slug)) {
      for (const f of j.files) docs.push({ kind: f.endsWith('.pdf.txt') ? 'pdf' : 'html', url: j.source, text: readFileSync(join(raw, basename(f)), 'utf8') });
    }
    if (r.format.startsWith('pdf')) {
      (r.sources ?? []).forEach((src, i) => {
        const f = join(raw, `menu${i}.pdf.txt`);
        const already = docs.some((d) => d.url === src);
        if (!already && existsSync(f) && (NUTRITION_OR_MENU.test(src) || !docs.length) && !/allergen/i.test(src)) docs.push({ kind: 'pdf', url: src, text: readFileSync(f, 'utf8') });
      });
    }
    if (!docs.length && r.format === 'html' && existsSync(join(raw, 'menu.txt'))) docs.push({ kind: 'html', url: r.sources?.[0] ?? rec.website ?? '', text: readFileSync(join(raw, 'menu.txt'), 'utf8') });
    if (docs.length) menus.set(id, { docs, aggregatorLinks });
    else if (r.format === 'unreachable') menus.set(id, { skip: 'website_unreachable', detail: 'spike: HTTP error', aggregatorLinks });
    else if (r.format === 'js-shell') menus.set(id, { skip: 'js_rendered', detail: 'spike: JS shell', aggregatorLinks });
    else menus.set(id, { skip: aggregatorLinks.length ? 'aggregator_only' : 'no_menu', detail: 'spike: no menu on own website', aggregatorLinks });
  }
  return { osm: new FixtureOsm(osm), places: new FixturePlaces(places), menus: new FixtureMenuFetcher(menus), count: osm.length };
}
