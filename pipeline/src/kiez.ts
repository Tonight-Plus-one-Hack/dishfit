// Kiez definitions, boundaries (data/kieze.geojson) and the search tile grid.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isKiezSlug } from '../../packages/contract/src/kieze.ts';
import type { BBox, LatLng } from './types.ts';

export interface KiezDef {
  slug: string;
  name: string;
  /** Exact Ortsteil name in the Berlin ALKIS data. */
  ortsteil: string;
  /**
   * 1-3: OSM restaurant scan; 4: healthy-term search (Google text search for healthy places, see stages/find-healthy.ts);
   * 5: every other Berlin Ortsteil, same healthy search plus the OSM places tagged with a healthy cuisine (Berlin-wide).
   */
  wave: 1 | 2 | 3 | 4 | 5;
  /** GitHub handle of the teammate who reviews this Kiez in stage 6 (docs/team-prompts/README.md). */
  reviewer: string;
}

export const KIEZE: KiezDef[] = [
  { slug: 'mitte', name: 'Mitte', ortsteil: 'Mitte', wave: 1, reviewer: 'Kalvarez09' },
  { slug: 'kreuzberg', name: 'Kreuzberg', ortsteil: 'Kreuzberg', wave: 1, reviewer: 'Kalvarez09' },
  { slug: 'prenzlauer-berg', name: 'Prenzlauer Berg', ortsteil: 'Prenzlauer Berg', wave: 1, reviewer: 'vinaynaik432-debug' },
  { slug: 'friedrichshain', name: 'Friedrichshain', ortsteil: 'Friedrichshain', wave: 1, reviewer: 'Malek1414' },
  { slug: 'neukoelln', name: 'Neukölln', ortsteil: 'Neukölln', wave: 1, reviewer: 'Malek1414' },
  { slug: 'charlottenburg', name: 'Charlottenburg', ortsteil: 'Charlottenburg', wave: 2, reviewer: 'vinaynaik432-debug' },
  { slug: 'schoeneberg', name: 'Schöneberg', ortsteil: 'Schöneberg', wave: 2, reviewer: 'Malek1414' },
  { slug: 'wedding', name: 'Wedding', ortsteil: 'Wedding', wave: 2, reviewer: 'Kalvarez09' },
  { slug: 'moabit', name: 'Moabit', ortsteil: 'Moabit', wave: 2, reviewer: 'Kalvarez09' },
  { slug: 'wilmersdorf', name: 'Wilmersdorf', ortsteil: 'Wilmersdorf', wave: 2, reviewer: 'vinaynaik432-debug' },
  { slug: 'pankow', name: 'Pankow', ortsteil: 'Pankow', wave: 3, reviewer: 'vinaynaik432-debug' },
  { slug: 'tempelhof', name: 'Tempelhof', ortsteil: 'Tempelhof', wave: 3, reviewer: 'vinaynaik432-debug' },
  { slug: 'steglitz', name: 'Steglitz', ortsteil: 'Steglitz', wave: 4, reviewer: 'Kalvarez09' },
  { slug: 'zehlendorf', name: 'Zehlendorf', ortsteil: 'Zehlendorf', wave: 4, reviewer: 'Kalvarez09' },
  { slug: 'treptow', name: 'Treptow', ortsteil: 'Alt-Treptow', wave: 4, reviewer: 'Malek1414' },
  { slug: 'lichtenberg', name: 'Lichtenberg', ortsteil: 'Lichtenberg', wave: 4, reviewer: 'Malek1414' },
  { slug: 'spandau', name: 'Spandau', ortsteil: 'Spandau', wave: 4, reviewer: 'vinaynaik432-debug' },
  { slug: 'reinickendorf', name: 'Reinickendorf', ortsteil: 'Reinickendorf', wave: 4, reviewer: 'vinaynaik432-debug' },
  { slug: 'tiergarten', name: 'Tiergarten', ortsteil: 'Tiergarten', wave: 4, reviewer: 'Kalvarez09' },
  // Wave 5: the remaining Berlin Ortsteile, so the healthy search covers the whole city.
  { slug: 'adlershof', name: 'Adlershof', ortsteil: 'Adlershof', wave: 5, reviewer: 'Kalvarez09' },
  { slug: 'alt-hohenschoenhausen', name: 'Alt-Hohenschönhausen', ortsteil: 'Alt-Hohenschönhausen', wave: 5, reviewer: 'Malek1414' },
  { slug: 'altglienicke', name: 'Altglienicke', ortsteil: 'Altglienicke', wave: 5, reviewer: 'vinaynaik432-debug' },
  { slug: 'baumschulenweg', name: 'Baumschulenweg', ortsteil: 'Baumschulenweg', wave: 5, reviewer: 'Kalvarez09' },
  { slug: 'biesdorf', name: 'Biesdorf', ortsteil: 'Biesdorf', wave: 5, reviewer: 'Malek1414' },
  { slug: 'blankenburg', name: 'Blankenburg', ortsteil: 'Blankenburg', wave: 5, reviewer: 'vinaynaik432-debug' },
  { slug: 'blankenfelde', name: 'Blankenfelde', ortsteil: 'Blankenfelde', wave: 5, reviewer: 'Kalvarez09' },
  { slug: 'bohnsdorf', name: 'Bohnsdorf', ortsteil: 'Bohnsdorf', wave: 5, reviewer: 'Malek1414' },
  { slug: 'borsigwalde', name: 'Borsigwalde', ortsteil: 'Borsigwalde', wave: 5, reviewer: 'vinaynaik432-debug' },
  { slug: 'britz', name: 'Britz', ortsteil: 'Britz', wave: 5, reviewer: 'Kalvarez09' },
  { slug: 'buch', name: 'Buch', ortsteil: 'Buch', wave: 5, reviewer: 'Malek1414' },
  { slug: 'buckow', name: 'Buckow', ortsteil: 'Buckow', wave: 5, reviewer: 'vinaynaik432-debug' },
  { slug: 'charlottenburg-nord', name: 'Charlottenburg-Nord', ortsteil: 'Charlottenburg-Nord', wave: 5, reviewer: 'Kalvarez09' },
  { slug: 'dahlem', name: 'Dahlem', ortsteil: 'Dahlem', wave: 5, reviewer: 'Malek1414' },
  { slug: 'falkenberg', name: 'Falkenberg', ortsteil: 'Falkenberg', wave: 5, reviewer: 'vinaynaik432-debug' },
  { slug: 'falkenhagener-feld', name: 'Falkenhagener Feld', ortsteil: 'Falkenhagener Feld', wave: 5, reviewer: 'Kalvarez09' },
  { slug: 'fennpfuhl', name: 'Fennpfuhl', ortsteil: 'Fennpfuhl', wave: 5, reviewer: 'Malek1414' },
  { slug: 'franzoesisch-buchholz', name: 'Französisch Buchholz', ortsteil: 'Französisch Buchholz', wave: 5, reviewer: 'vinaynaik432-debug' },
  { slug: 'friedenau', name: 'Friedenau', ortsteil: 'Friedenau', wave: 5, reviewer: 'Kalvarez09' },
  { slug: 'friedrichsfelde', name: 'Friedrichsfelde', ortsteil: 'Friedrichsfelde', wave: 5, reviewer: 'Malek1414' },
  { slug: 'friedrichshagen', name: 'Friedrichshagen', ortsteil: 'Friedrichshagen', wave: 5, reviewer: 'vinaynaik432-debug' },
  { slug: 'frohnau', name: 'Frohnau', ortsteil: 'Frohnau', wave: 5, reviewer: 'Kalvarez09' },
  { slug: 'gatow', name: 'Gatow', ortsteil: 'Gatow', wave: 5, reviewer: 'Malek1414' },
  { slug: 'gesundbrunnen', name: 'Gesundbrunnen', ortsteil: 'Gesundbrunnen', wave: 5, reviewer: 'vinaynaik432-debug' },
  { slug: 'gropiusstadt', name: 'Gropiusstadt', ortsteil: 'Gropiusstadt', wave: 5, reviewer: 'Kalvarez09' },
  { slug: 'grunewald', name: 'Grunewald', ortsteil: 'Grunewald', wave: 5, reviewer: 'Malek1414' },
  { slug: 'gruenau', name: 'Grünau', ortsteil: 'Grünau', wave: 5, reviewer: 'vinaynaik432-debug' },
  { slug: 'hakenfelde', name: 'Hakenfelde', ortsteil: 'Hakenfelde', wave: 5, reviewer: 'Kalvarez09' },
  { slug: 'halensee', name: 'Halensee', ortsteil: 'Halensee', wave: 5, reviewer: 'Malek1414' },
  { slug: 'hansaviertel', name: 'Hansaviertel', ortsteil: 'Hansaviertel', wave: 5, reviewer: 'vinaynaik432-debug' },
  { slug: 'haselhorst', name: 'Haselhorst', ortsteil: 'Haselhorst', wave: 5, reviewer: 'Kalvarez09' },
  { slug: 'heiligensee', name: 'Heiligensee', ortsteil: 'Heiligensee', wave: 5, reviewer: 'Malek1414' },
  { slug: 'heinersdorf', name: 'Heinersdorf', ortsteil: 'Heinersdorf', wave: 5, reviewer: 'vinaynaik432-debug' },
  { slug: 'hellersdorf', name: 'Hellersdorf', ortsteil: 'Hellersdorf', wave: 5, reviewer: 'Kalvarez09' },
  { slug: 'hermsdorf', name: 'Hermsdorf', ortsteil: 'Hermsdorf', wave: 5, reviewer: 'Malek1414' },
  { slug: 'johannisthal', name: 'Johannisthal', ortsteil: 'Johannisthal', wave: 5, reviewer: 'vinaynaik432-debug' },
  { slug: 'karlshorst', name: 'Karlshorst', ortsteil: 'Karlshorst', wave: 5, reviewer: 'Kalvarez09' },
  { slug: 'karow', name: 'Karow', ortsteil: 'Karow', wave: 5, reviewer: 'Malek1414' },
  { slug: 'kaulsdorf', name: 'Kaulsdorf', ortsteil: 'Kaulsdorf', wave: 5, reviewer: 'vinaynaik432-debug' },
  { slug: 'kladow', name: 'Kladow', ortsteil: 'Kladow', wave: 5, reviewer: 'Kalvarez09' },
  { slug: 'konradshoehe', name: 'Konradshöhe', ortsteil: 'Konradshöhe', wave: 5, reviewer: 'Malek1414' },
  { slug: 'koepenick', name: 'Köpenick', ortsteil: 'Köpenick', wave: 5, reviewer: 'vinaynaik432-debug' },
  { slug: 'lankwitz', name: 'Lankwitz', ortsteil: 'Lankwitz', wave: 5, reviewer: 'Kalvarez09' },
  { slug: 'lichtenrade', name: 'Lichtenrade', ortsteil: 'Lichtenrade', wave: 5, reviewer: 'Malek1414' },
  { slug: 'lichterfelde', name: 'Lichterfelde', ortsteil: 'Lichterfelde', wave: 5, reviewer: 'vinaynaik432-debug' },
  { slug: 'luebars', name: 'Lübars', ortsteil: 'Lübars', wave: 5, reviewer: 'Kalvarez09' },
  { slug: 'mahlsdorf', name: 'Mahlsdorf', ortsteil: 'Mahlsdorf', wave: 5, reviewer: 'Malek1414' },
  { slug: 'malchow', name: 'Malchow', ortsteil: 'Malchow', wave: 5, reviewer: 'vinaynaik432-debug' },
  { slug: 'mariendorf', name: 'Mariendorf', ortsteil: 'Mariendorf', wave: 5, reviewer: 'Kalvarez09' },
  { slug: 'marienfelde', name: 'Marienfelde', ortsteil: 'Marienfelde', wave: 5, reviewer: 'Malek1414' },
  { slug: 'marzahn', name: 'Marzahn', ortsteil: 'Marzahn', wave: 5, reviewer: 'vinaynaik432-debug' },
  { slug: 'maerkisches-viertel', name: 'Märkisches Viertel', ortsteil: 'Märkisches Viertel', wave: 5, reviewer: 'Kalvarez09' },
  { slug: 'mueggelheim', name: 'Müggelheim', ortsteil: 'Müggelheim', wave: 5, reviewer: 'Malek1414' },
  { slug: 'neu-hohenschoenhausen', name: 'Neu-Hohenschönhausen', ortsteil: 'Neu-Hohenschönhausen', wave: 5, reviewer: 'vinaynaik432-debug' },
  { slug: 'niederschoeneweide', name: 'Niederschöneweide', ortsteil: 'Niederschöneweide', wave: 5, reviewer: 'Kalvarez09' },
  { slug: 'niederschoenhausen', name: 'Niederschönhausen', ortsteil: 'Niederschönhausen', wave: 5, reviewer: 'Malek1414' },
  { slug: 'nikolassee', name: 'Nikolassee', ortsteil: 'Nikolassee', wave: 5, reviewer: 'vinaynaik432-debug' },
  { slug: 'oberschoeneweide', name: 'Oberschöneweide', ortsteil: 'Oberschöneweide', wave: 5, reviewer: 'Kalvarez09' },
  { slug: 'plaenterwald', name: 'Plänterwald', ortsteil: 'Plänterwald', wave: 5, reviewer: 'Malek1414' },
  { slug: 'rahnsdorf', name: 'Rahnsdorf', ortsteil: 'Rahnsdorf', wave: 5, reviewer: 'vinaynaik432-debug' },
  { slug: 'rosenthal', name: 'Rosenthal', ortsteil: 'Rosenthal', wave: 5, reviewer: 'Kalvarez09' },
  { slug: 'rudow', name: 'Rudow', ortsteil: 'Rudow', wave: 5, reviewer: 'Malek1414' },
  { slug: 'rummelsburg', name: 'Rummelsburg', ortsteil: 'Rummelsburg', wave: 5, reviewer: 'vinaynaik432-debug' },
  { slug: 'schlachtensee', name: 'Schlachtensee', ortsteil: 'Schlachtensee', wave: 5, reviewer: 'Kalvarez09' },
  { slug: 'schmargendorf', name: 'Schmargendorf', ortsteil: 'Schmargendorf', wave: 5, reviewer: 'Malek1414' },
  { slug: 'schmoeckwitz', name: 'Schmöckwitz', ortsteil: 'Schmöckwitz', wave: 5, reviewer: 'vinaynaik432-debug' },
  { slug: 'siemensstadt', name: 'Siemensstadt', ortsteil: 'Siemensstadt', wave: 5, reviewer: 'Kalvarez09' },
  { slug: 'staaken', name: 'Staaken', ortsteil: 'Staaken', wave: 5, reviewer: 'Malek1414' },
  { slug: 'stadtrandsiedlung-malchow', name: 'Stadtrandsiedlung Malchow', ortsteil: 'Stadtrandsiedlung Malchow', wave: 5, reviewer: 'vinaynaik432-debug' },
  { slug: 'tegel', name: 'Tegel', ortsteil: 'Tegel', wave: 5, reviewer: 'Kalvarez09' },
  { slug: 'waidmannslust', name: 'Waidmannslust', ortsteil: 'Waidmannslust', wave: 5, reviewer: 'Malek1414' },
  { slug: 'wannsee', name: 'Wannsee', ortsteil: 'Wannsee', wave: 5, reviewer: 'vinaynaik432-debug' },
  { slug: 'wartenberg', name: 'Wartenberg', ortsteil: 'Wartenberg', wave: 5, reviewer: 'Kalvarez09' },
  { slug: 'weissensee', name: 'Weißensee', ortsteil: 'Weißensee', wave: 5, reviewer: 'Malek1414' },
  { slug: 'westend', name: 'Westend', ortsteil: 'Westend', wave: 5, reviewer: 'vinaynaik432-debug' },
  { slug: 'wilhelmsruh', name: 'Wilhelmsruh', ortsteil: 'Wilhelmsruh', wave: 5, reviewer: 'Kalvarez09' },
  { slug: 'wilhelmstadt', name: 'Wilhelmstadt', ortsteil: 'Wilhelmstadt', wave: 5, reviewer: 'Malek1414' },
  { slug: 'wittenau', name: 'Wittenau', ortsteil: 'Wittenau', wave: 5, reviewer: 'vinaynaik432-debug' },
];

export function kiezBySlug(slug: string): KiezDef {
  const k = KIEZE.find((x) => x.slug === slug);
  if (!k) throw new Error(`unknown Kiez "${slug}" (known: ${KIEZE.map((x) => x.slug).join(', ')})`);
  return k;
}

/** Discovery covers every Ortsteil; only a Kiez of the shared app catalog (packages/contract/src/kieze.ts) may be published. */
export function assertPublishableKiez(slug: string): void {
  if (!isKiezSlug(slug)) {
    throw new Error(`${slug} is not in the app's Kiez catalog (packages/contract/src/kieze.ts), so its restaurants would have no filter, API or community support. Add it there first, then publish.`);
  }
}

export function kiezeForWave(wave: number): KiezDef[] {
  return KIEZE.filter((k) => k.wave === wave);
}

type Polygon = number[][][]; // rings of [lng, lat]
export interface KiezShape { slug: string; polygons: Polygon[]; bbox: BBox }

let shapes: Map<string, KiezShape> | null = null;

export interface KiezFeatureCollection { features: { properties: { slug: string }; geometry: { coordinates: Polygon[] } }[] }

function shapesFrom(fc: KiezFeatureCollection): Map<string, KiezShape> {
  const out = new Map<string, KiezShape>();
  for (const f of fc.features) {
    const polygons = f.geometry.coordinates;
    let south = 90, west = 180, north = -90, east = -180;
    for (const poly of polygons) for (const [lng, lat] of poly[0]!) {
      south = Math.min(south, lat!); north = Math.max(north, lat!);
      west = Math.min(west, lng!); east = Math.max(east, lng!);
    }
    out.set(f.properties.slug, { slug: f.properties.slug, polygons, bbox: { south, west, north, east } });
  }
  return out;
}

/**
 * Provides the boundaries directly instead of reading data/kieze.geojson from disk, for runtimes
 * without a file system (the Worker's community review imports the GeoJSON and calls this once).
 */
export function useKiezShapes(fc: KiezFeatureCollection): void {
  shapes = shapesFrom(fc);
}

export function kiezShapes(): Map<string, KiezShape> {
  if (!shapes) {
    const path = fileURLToPath(new URL('../data/kieze.geojson', import.meta.url).href);
    shapes = shapesFrom(JSON.parse(readFileSync(path, 'utf8')) as KiezFeatureCollection);
  }
  return shapes;
}

function inRing(p: LatLng, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if ((yi! > p.lat) !== (yj! > p.lat) && p.lng < ((xj! - xi!) * (p.lat - yi!)) / (yj! - yi!) + xi!) inside = !inside;
  }
  return inside;
}

export function pointInShape(p: LatLng, shape: KiezShape): boolean {
  return shape.polygons.some((poly) => inRing(p, poly[0]!) && !poly.slice(1).some((hole) => inRing(p, hole)));
}

/** The Kiez containing a point, among all known Kieze, or null. */
export function kiezAt(p: LatLng): string | null {
  for (const s of kiezShapes().values()) if (pointInShape(p, s)) return s.slug;
  return null;
}

const M_PER_DEG_LAT = 110540;
const mPerDegLng = (lat: number) => 111320 * Math.cos((lat * Math.PI) / 180);

export function bboxIntersectsShape(b: BBox, s: KiezShape): boolean {
  if (b.east < s.bbox.west || b.west > s.bbox.east || b.north < s.bbox.south || b.south > s.bbox.north) return false;
  // Any corner or the centre inside, or any polygon vertex inside the box.
  const pts: LatLng[] = [
    { lat: b.south, lng: b.west }, { lat: b.south, lng: b.east }, { lat: b.north, lng: b.west },
    { lat: b.north, lng: b.east }, { lat: (b.south + b.north) / 2, lng: (b.west + b.east) / 2 },
  ];
  if (pts.some((p) => pointInShape(p, s))) return true;
  for (const poly of s.polygons) for (const [lng, lat] of poly[0]!) {
    if (lat! >= b.south && lat! <= b.north && lng! >= b.west && lng! <= b.east) return true;
  }
  return false;
}

/** Square-ish tiles of ~cellMeters covering the Kiez (only tiles that touch the boundary or interior). */
export function tileGrid(shape: KiezShape, cellMeters: number): BBox[] {
  const { south, west, north, east } = shape.bbox;
  const dLat = cellMeters / M_PER_DEG_LAT;
  const dLng = cellMeters / mPerDegLng((south + north) / 2);
  const tiles: BBox[] = [];
  for (let lat = south; lat < north; lat += dLat) {
    for (let lng = west; lng < east; lng += dLng) {
      const t = { south: round6(lat), west: round6(lng), north: round6(Math.min(lat + dLat, north)), east: round6(Math.min(lng + dLng, east)) };
      if (bboxIntersectsShape(t, shape)) tiles.push(t);
    }
  }
  return tiles;
}

export function splitTile(b: BBox): BBox[] {
  const midLat = round6((b.south + b.north) / 2);
  const midLng = round6((b.west + b.east) / 2);
  return [
    { south: b.south, west: b.west, north: midLat, east: midLng },
    { south: b.south, west: midLng, north: midLat, east: b.east },
    { south: midLat, west: b.west, north: b.north, east: midLng },
    { south: midLat, west: midLng, north: b.north, east: b.east },
  ];
}

export function tileId(b: BBox): string {
  return `${b.south.toFixed(5)},${b.west.toFixed(5)},${b.north.toFixed(5)},${b.east.toFixed(5)}`;
}

export function distanceMeters(a: LatLng, b: LatLng): number {
  const dy = (a.lat - b.lat) * M_PER_DEG_LAT;
  const dx = (a.lng - b.lng) * mPerDegLng((a.lat + b.lat) / 2);
  return Math.hypot(dx, dy);
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
