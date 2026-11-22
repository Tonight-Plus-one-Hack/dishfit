// Builds pipeline/data/kieze.geojson from the official Berlin Ortsteile boundaries.
// Source: Geoportal Berlin, "ALKIS Berlin Ortsteile" WFS, licence dl-de/zero-2.0 (no restrictions).
//
// Usage:
//   curl -o ortsteile.json "https://gdi.berlin.de/services/wfs/alkis_ortsteile?service=WFS&version=2.0.0&request=GetFeature&typeNames=alkis_ortsteile:ortsteile&outputFormat=application/json&srsName=EPSG:4326"
//   node scripts/build-kieze.ts ortsteile.json
//
// Keeps only the Kieze the pipeline covers, simplifies each ring (Douglas-Peucker, ~10 m) and rounds
// to 5 decimals (~1 m) so the file stays small enough to commit.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KIEZE } from '../src/kiez.ts';

type Ring = [number, number][];

function perpDist(p: [number, number], a: [number, number], b: [number, number]): number {
  // Equirectangular metres around Berlin (lat ~52.5).
  const kx = 111320 * Math.cos((52.5 * Math.PI) / 180);
  const ky = 110540;
  const [px, py] = [p[0] * kx, p[1] * ky];
  const [ax, ay] = [a[0] * kx, a[1] * ky];
  const [bx, by] = [b[0] * kx, b[1] * ky];
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function simplify(ring: Ring, tol: number): Ring {
  if (ring.length < 4) return ring;
  const keep = new Uint8Array(ring.length);
  keep[0] = 1;
  keep[ring.length - 1] = 1;
  const stack: [number, number][] = [[0, ring.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let maxD = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = perpDist(ring[i]!, ring[s]!, ring[e]!);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (idx > 0 && maxD > tol) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return ring.filter((_, i) => keep[i]);
}

const r5 = (n: number) => Math.round(n * 1e5) / 1e5;

function main() {
  const src = process.argv[2];
  if (!src) throw new Error('usage: node scripts/build-kieze.ts <ortsteile.json>');
  const fc = JSON.parse(readFileSync(src, 'utf8')) as { features: { properties: { nam: string; sch: string }; geometry: { type: string; coordinates: number[][][][] } }[] };
  const features = KIEZE.map((k) => {
    const f = fc.features.find((x) => x.properties.nam === k.ortsteil);
    if (!f) throw new Error(`Ortsteil not found: ${k.ortsteil}`);
    if (f.geometry.type !== 'MultiPolygon') throw new Error(`unexpected geometry ${f.geometry.type}`);
    const polys = f.geometry.coordinates.map((poly) => poly.map((ring) => simplify(ring as Ring, 10).map(([x, y]) => [r5(x), r5(y)])));
    return { type: 'Feature', properties: { slug: k.slug, name: k.name, ortsteilKey: f.properties.sch }, geometry: { type: 'MultiPolygon', coordinates: polys } };
  });
  const out = {
    type: 'FeatureCollection',
    attribution: 'Geoportal Berlin / ALKIS Berlin Ortsteile, dl-de/zero-2.0 (https://gdi.berlin.de/services/wfs/alkis_ortsteile); simplified ~10 m',
    features,
  };
  const here = dirname(fileURLToPath(import.meta.url));
  writeFileSync(join(here, '..', 'data', 'kieze.geojson'), JSON.stringify(out) + '\n');
  for (const f of features) console.log(f.properties.slug, f.geometry.coordinates.reduce((a, p) => a + p.reduce((b, r) => b + r.length, 0), 0), 'points');
}

main();
