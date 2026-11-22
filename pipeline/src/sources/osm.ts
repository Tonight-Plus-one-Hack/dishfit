// OpenStreetMap restaurant base (ODbL, "© OpenStreetMap contributors"), via the Overpass API.
import type { BBox, OsmRestaurant } from '../types.ts';
import { HttpError, Limiter, withRetry } from '../util/limiter.ts';

export interface OsmSource {
  restaurantsIn(bbox: BBox): Promise<OsmRestaurant[]>;
}

export const OSM_ATTRIBUTION = '© OpenStreetMap contributors, ODbL (https://www.openstreetmap.org/copyright)';

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export function osmElementToRestaurant(e: OverpassElement): OsmRestaurant | null {
  const t = e.tags ?? {};
  const lat = e.lat ?? e.center?.lat;
  const lng = e.lon ?? e.center?.lon;
  if (!t.name || lat == null || lng == null) return null;
  const website = t.website ?? t['contact:website'] ?? t.url ?? null;
  return {
    osmId: `${e.type}/${e.id}`,
    name: t.name,
    lat,
    lng,
    street: t['addr:street'] ?? null,
    housenumber: t['addr:housenumber'] ?? null,
    postcode: t['addr:postcode'] ?? null,
    cuisine: (t.cuisine ?? '').split(/[;,]/).map((c) => c.trim().toLowerCase()).filter(Boolean),
    openingHours: t.opening_hours ?? null,
    website: website && /^https?:\/\//i.test(website) ? website : website ? `https://${website}` : null,
    amenity: t.amenity ?? 'restaurant',
    dietVegan: t['diet:vegan'] ?? null,
    dietVegetarian: t['diet:vegetarian'] ?? null,
  };
}

/** Overpass allows a couple of slots per client: one query at a time across all Kieze of a run, 2 s apart. */
const OVERPASS = new Limiter('overpass', 1, 2000);

export class OverpassOsm implements OsmSource {
  private readonly endpoint: string;
  private readonly amenities: string[];

  constructor(endpoint = 'https://overpass-api.de/api/interpreter', amenities = ['restaurant', 'fast_food']) {
    this.endpoint = endpoint;
    this.amenities = amenities;
  }

  async restaurantsIn(b: BBox): Promise<OsmRestaurant[]> {
    const q = `[out:json][timeout:120];
nwr["amenity"~"^(${this.amenities.join('|')})$"]["name"](${b.south},${b.west},${b.north},${b.east});
out center tags;`;
    const json = await OVERPASS.run(() => withRetry(async () => {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'menu-pipeline/0.1 (restaurant nutrition research)' },
        body: new URLSearchParams({ data: q }),
      });
      if (!res.ok) throw new HttpError(res.status, `Overpass ${res.status}`);
      return (await res.json()) as { elements: OverpassElement[] };
    }, { retries: 4, baseMs: 10000 }));
    return json.elements.map(osmElementToRestaurant).filter((r): r is OsmRestaurant => r !== null);
  }
}

/** Static list of OSM restaurants (tests and the spike fixture). */
export class FixtureOsm implements OsmSource {
  private readonly items: OsmRestaurant[];
  constructor(items: OsmRestaurant[]) {
    this.items = items;
  }
  async restaurantsIn(b: BBox): Promise<OsmRestaurant[]> {
    return this.items.filter((r) => r.lat >= b.south && r.lat <= b.north && r.lng >= b.west && r.lng <= b.east);
  }
}
