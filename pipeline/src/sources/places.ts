// Google Places API (New) Text Search, used only to find candidates, filter them (rating, status)
// and learn their place_id. Policy (EEA terms): nothing but the place_id is ever stored.
import type { CostLedger } from '../ledger.ts';
import { PLACES_SKUS } from '../pricing.ts';
import { distanceMeters } from '../kiez.ts';
import type { BBox, LatLng, PlacesCandidate } from '../types.ts';
import { HttpError, type Limiter, withRetry } from '../util/limiter.ts';
import type { PlacesQuota } from './places-quota.ts';

export interface TileQuery {
  bbox: BBox;
  /** IDs-only searches are free and used to probe tile saturation. */
  idsOnly: boolean;
  pageToken?: string;
  kiez?: string;
  /** Search text; default "restaurant" (the OSM-based tile scan). The healthy search passes its terms. */
  textQuery?: string;
}

export interface TilePage {
  ids: string[];
  candidates: PlacesCandidate[];
  nextPageToken: string | null;
}

/** One known restaurant (from OSM or a published seed) whose Google place id is wanted. */
export interface PlaceLookup {
  name: string;
  /** Street, house number and postcode as far as known; empty when unknown. */
  address: string;
  location: LatLng;
  kiez?: string;
  /**
   * Discovery of a new place: ask for the rating too (Enterprise SKU) with this server-side floor (the API rounds up to
   * 0.5 steps), so the caller applies the pipeline's rating rule. None when the place is already published.
   */
  minRating?: number;
  /** Ledger stage of the call. */
  stage?: 'find' | 'review';
}

export interface PlacesClient {
  searchTile(q: TileQuery): Promise<TilePage>;
  /**
   * Text Search for one known restaurant by name and address, biased to LOOKUP_RADIUS_M around it: Pro SKU (id, name,
   * location, status) without minRating, Enterprise SKU with the rating when minRating is set. Returns the candidates;
   * the caller decides on a strict match.
   */
  lookupPlace(q: PlaceLookup): Promise<PlacesCandidate[]>;
}

/** Radius of the location bias for a place lookup; matches must also lie within it. */
export const LOOKUP_RADIUS_M = 150;

export const MAX_RESULTS_PER_QUERY = 60; // 3 pages of 20; the API's hard cap
export const MIN_RATING_REQUEST = 4.0; // API rounds minRating up to 0.5 steps; filter 4.3 client-side

const FIELDS_IDS = ['places.id', 'nextPageToken'];
// Enterprise SKU (rating, website); location/displayName/businessStatus are lower tiers included in it.
const FIELDS_FULL = ['places.id', 'places.displayName', 'places.location', 'places.rating', 'places.userRatingCount', 'places.websiteUri', 'places.businessStatus', 'nextPageToken'];
// Text Search Pro (place lookups): these fields stay below the Enterprise SKU (5,000 free calls a month instead of 1,000).
const FIELDS_PRO = ['places.id', 'places.displayName', 'places.location', 'places.businessStatus'];
// Rated lookup: the Pro fields plus the rating the pipeline's 4.3 rule needs (Enterprise SKU).
const FIELDS_RATED = [...FIELDS_PRO, 'places.rating'];

interface ApiPlace {
  id: string;
  displayName?: { text: string };
  location?: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  websiteUri?: string;
  businessStatus?: string;
}

export class GooglePlaces implements PlacesClient {
  private readonly apiKey: string;
  private readonly ledger: CostLedger;
  private readonly limiter: Limiter;
  private readonly fetchImpl: typeof fetch;
  /** Free-tier guard for paid SKUs (monthly stop and daily budget); none in tests. */
  protected readonly quota: PlacesQuota | null;

  constructor(apiKey: string, ledger: CostLedger, limiter: Limiter, fetchImpl: typeof fetch = fetch, quota: PlacesQuota | null = null) {
    this.apiKey = apiKey;
    this.ledger = ledger;
    this.limiter = limiter;
    this.fetchImpl = fetchImpl;
    this.quota = quota;
  }

  async searchTile(q: TileQuery): Promise<TilePage> {
    const sku = q.idsOnly ? 'text-search-ids-only' : 'text-search-enterprise';
    const body: Record<string, unknown> = {
      textQuery: q.textQuery ?? 'restaurant',
      includedType: 'restaurant',
      minRating: MIN_RATING_REQUEST,
      languageCode: 'de',
      regionCode: 'DE',
      pageSize: 20,
      locationRestriction: { rectangle: { low: { latitude: q.bbox.south, longitude: q.bbox.west }, high: { latitude: q.bbox.north, longitude: q.bbox.east } } },
    };
    if (q.pageToken) body.pageToken = q.pageToken;
    const reservation = this.ledger.reserve(PLACES_SKUS[sku].usd);
    try {
      this.quota?.take(sku);
    } catch (e) {
      reservation.release();
      throw e;
    }
    try {
      const json = await this.limiter.run(() => withRetry(async () => {
        const res = await this.fetchImpl('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': this.apiKey, 'X-Goog-FieldMask': (q.idsOnly ? FIELDS_IDS : FIELDS_FULL).join(',') },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new HttpError(res.status, `Places searchText ${res.status}: ${text.slice(0, 300)}`);
        }
        return (await res.json()) as { places?: ApiPlace[]; nextPageToken?: string };
      }));
      if (PLACES_SKUS[sku].usd > 0) {
        await this.ledger.record({ stage: 'find', provider: 'google-places', model: sku, usd: PLACES_SKUS[sku].usd, estimated: true, kiez: q.kiez ?? null, purpose: `${q.textQuery ? `"${q.textQuery}" ` : ''}tile ${q.bbox.south.toFixed(4)},${q.bbox.west.toFixed(4)}${q.pageToken ? ' next page' : ''}` });
      }
      const places = json.places ?? [];
      return {
        ids: places.map((p) => p.id),
        candidates: q.idsOnly ? [] : places.filter((p) => p.location).map((p) => ({
          placeId: p.id,
          name: p.displayName?.text ?? '',
          location: { lat: p.location!.latitude, lng: p.location!.longitude },
          rating: p.rating ?? null,
          userRatingCount: p.userRatingCount ?? null,
          websiteUri: p.websiteUri ?? null,
          businessStatus: p.businessStatus ?? null,
        })),
        nextPageToken: json.nextPageToken ?? null,
      };
    } finally {
      reservation.release();
    }
  }

  async lookupPlace(q: PlaceLookup): Promise<PlacesCandidate[]> {
    const rated = q.minRating != null;
    const sku = rated ? 'text-search-enterprise' : 'text-search-pro';
    const body: Record<string, unknown> = {
      textQuery: [q.name, q.address].filter(Boolean).join(', '),
      languageCode: 'de',
      regionCode: 'DE',
      pageSize: 5,
      locationBias: { circle: { center: { latitude: q.location.lat, longitude: q.location.lng }, radius: LOOKUP_RADIUS_M } },
    };
    if (q.minRating != null) body.minRating = q.minRating;
    const reservation = this.ledger.reserve(PLACES_SKUS[sku].usd);
    try {
      this.quota?.take(sku);
    } catch (e) {
      reservation.release();
      throw e;
    }
    try {
      const json = await this.limiter.run(() => withRetry(async () => {
        const res = await this.fetchImpl('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': this.apiKey, 'X-Goog-FieldMask': (rated ? FIELDS_RATED : FIELDS_PRO).join(',') },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new HttpError(res.status, `Places searchText ${res.status}: ${(await res.text()).slice(0, 300)}`);
        return (await res.json()) as { places?: ApiPlace[] };
      }));
      await this.ledger.record({ stage: q.stage ?? 'find', provider: 'google-places', model: sku, usd: PLACES_SKUS[sku].usd, estimated: true, kiez: q.kiez ?? null, purpose: 'place id lookup (only the id is stored)' });
      return (json.places ?? []).filter((p) => p.location).map((p) => ({
        placeId: p.id,
        name: p.displayName?.text ?? '',
        location: { lat: p.location!.latitude, lng: p.location!.longitude },
        rating: rated ? (p.rating ?? null) : null,
        userRatingCount: null,
        websiteUri: null,
        businessStatus: p.businessStatus ?? null,
      }));
    } finally {
      reservation.release();
    }
  }
}

export interface PlacesWebsite {
  /** Place Details (websiteUri only, Enterprise SKU). The URL is used transiently and never stored. */
  website(placeId: string, kiez?: string): Promise<string | null>;
}

export class GooglePlacesWithDetails extends GooglePlaces implements PlacesWebsite {
  private readonly key: string;
  private readonly ledgerRef: CostLedger;
  private readonly lim: Limiter;

  constructor(apiKey: string, ledger: CostLedger, limiter: Limiter, quota: PlacesQuota | null = null) {
    super(apiKey, ledger, limiter, fetch, quota);
    this.key = apiKey;
    this.ledgerRef = ledger;
    this.lim = limiter;
  }

  async website(placeId: string, kiez?: string): Promise<string | null> {
    const sku = 'place-details-enterprise';
    const reservation = this.ledgerRef.reserve(PLACES_SKUS[sku].usd);
    try {
      this.quota?.take(sku);
      const json = await this.lim.run(() => withRetry(async () => {
        const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
          headers: { 'X-Goog-Api-Key': this.key, 'X-Goog-FieldMask': 'websiteUri' },
        });
        if (!res.ok) throw new HttpError(res.status, `Places details ${res.status}: ${(await res.text()).slice(0, 200)}`);
        return (await res.json()) as { websiteUri?: string };
      }));
      await this.ledgerRef.record({ stage: 'menu', provider: 'google-places', model: sku, usd: PLACES_SKUS[sku].usd, estimated: true, kiez: kiez ?? null, purpose: 'website lookup (not stored)' });
      return json.websiteUri ?? null;
    } finally {
      reservation.release();
    }
  }
}

/** In-memory Places stand-in: returns the given candidates inside the tile, paginated by 20. */
export class FixturePlaces implements PlacesClient {
  readonly calls: TileQuery[] = [];
  private readonly items: PlacesCandidate[];
  constructor(items: PlacesCandidate[]) {
    this.items = items;
  }
  async searchTile(q: TileQuery): Promise<TilePage> {
    this.calls.push(q);
    // Text match on the name stands in for Google's relevance search; "restaurant" matches everything.
    const text = (c: PlacesCandidate) => !q.textQuery || q.textQuery === 'restaurant' || c.name.toLowerCase().includes(q.textQuery.toLowerCase());
    const inside = this.items.filter((c) => text(c) && (c.rating ?? 0) >= MIN_RATING_REQUEST && c.location.lat >= q.bbox.south && c.location.lat <= q.bbox.north && c.location.lng >= q.bbox.west && c.location.lng <= q.bbox.east);
    const capped = inside.slice(0, MAX_RESULTS_PER_QUERY);
    const start = q.pageToken ? Number(q.pageToken) : 0;
    const page = capped.slice(start, start + 20);
    const next = start + 20 < capped.length ? String(start + 20) : null; // like the API: no token past 60
    return { ids: page.map((p) => p.placeId), candidates: q.idsOnly ? [] : page, nextPageToken: next };
  }
  readonly lookups: PlaceLookup[] = [];
  async lookupPlace(q: PlaceLookup): Promise<PlacesCandidate[]> {
    this.lookups.push(q);
    // Like the API's location bias with a rating floor; only a rated lookup carries the rating, never the website.
    return this.items
      .filter((c) => (q.minRating == null || (c.rating ?? 0) >= q.minRating) && distanceMeters(c.location, q.location) <= LOOKUP_RADIUS_M * 3)
      .slice(0, 5)
      .map((c) => ({ ...c, rating: q.minRating != null ? c.rating : null, userRatingCount: null, websiteUri: null }));
  }
}
