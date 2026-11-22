// Matches transient Google Places hits to stored OSM restaurants by name, distance and website domain.
import { distanceMeters } from './kiez.ts';
import type { PlacesCandidate } from './types.ts';

export interface OsmRow { id: string; name: string; lat: number; lng: number; website: string | null }

const STOP = new Set(['restaurant', 'restaurante', 'ristorante', 'berlin', 'gmbh', 'ug', 'the', 'und', 'and', 'cafe', 'café', 'bar', 'imbiss', 'kitchen', 'grill', 'bistro', 'by', 'am', 'im', 'an', 'der', 'die', 'das', 'de', 'la', 'le']);

export function normName(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w && !STOP.has(w)).join(' ');
}

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  const t = s.replace(/ /g, '');
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

/** Dice coefficient on character bigrams of normalised names, boosted when one name contains the other. */
export function nameSimilarity(a: string, b: string): number {
  const na = normName(a);
  const nb = normName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ga = bigrams(na);
  const gb = bigrams(nb);
  let inter = 0;
  let total = 0;
  for (const [g, n] of ga) { inter += Math.min(n, gb.get(g) ?? 0); total += n; }
  for (const n of gb.values()) total += n;
  const dice = total ? (2 * inter) / total : 0;
  const contained = na.replace(/ /g, '').includes(nb.replace(/ /g, '')) || nb.replace(/ /g, '').includes(na.replace(/ /g, ''));
  return contained ? Math.max(dice, 0.85) : dice;
}

export function domainOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(/^https?:/i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

export interface Match { placeId: string; osmId: string; score: number; distance: number; nameSim: number }

/** Greedy one-to-one matching; a pair needs to be close and similarly named (or share the website domain). */
export function matchCandidates(cands: PlacesCandidate[], osm: OsmRow[], maxDistance = 150): Match[] {
  const pairs: Match[] = [];
  for (const c of cands) {
    for (const o of osm) {
      const distance = distanceMeters(c.location, o);
      if (distance > maxDistance) continue;
      const nameSim = nameSimilarity(c.name, o.name);
      const sameDomain = !!domainOf(c.websiteUri) && domainOf(c.websiteUri) === domainOf(o.website);
      const ok = nameSim >= 0.6 || (sameDomain && nameSim >= 0.3) || (distance <= 30 && nameSim >= 0.45);
      if (!ok) continue;
      pairs.push({ placeId: c.placeId, osmId: o.id, distance, nameSim, score: nameSim + (sameDomain ? 0.3 : 0) + 0.2 * (1 - distance / maxDistance) });
    }
  }
  pairs.sort((a, b) => b.score - a.score);
  const usedP = new Set<string>();
  const usedO = new Set<string>();
  const out: Match[] = [];
  for (const p of pairs) {
    if (usedP.has(p.placeId) || usedO.has(p.osmId)) continue;
    usedP.add(p.placeId);
    usedO.add(p.osmId);
    out.push(p);
  }
  return out;
}

/**
 * The one Places hit that is the given restaurant: within maxDistance and a name similarity of at least 0.6
 * (no website or proximity shortcut, since the lookup carries neither), best name first, then nearest.
 * A name of under four letters must match exactly, since containment alone would match it inside any other name.
 */
export function strictPlaceMatch(cands: PlacesCandidate[], place: { name: string; lat: number; lng: number }, maxDistance = 150): PlacesCandidate | null {
  const own = normName(place.name).replace(/ /g, '');
  const sameEnough = (name: string) => {
    const other = normName(name).replace(/ /g, '');
    return Math.min(own.length, other.length) >= 4 || own === other;
  };
  const scored = cands
    .map((c) => ({ c, distance: distanceMeters(c.location, place), nameSim: nameSimilarity(c.name, place.name) }))
    .filter((x) => x.distance < maxDistance && x.nameSim >= 0.6 && sameEnough(x.c.name))
    .toSorted((a, b) => b.nameSim - a.nameSim || a.distance - b.distance);
  return scored[0]?.c ?? null;
}
