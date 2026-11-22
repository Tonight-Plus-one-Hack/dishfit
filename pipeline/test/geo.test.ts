import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { distanceMeters, KIEZE, kiezAt, kiezShapes, pointInShape, splitTile, tileGrid } from '../src/kiez.ts';
import { domainOf, matchCandidates, nameSimilarity, normName } from '../src/match.ts';
import type { PlacesCandidate } from '../src/types.ts';

describe('Kieze', () => {
  it('has a boundary for every configured Kiez, waves of five', () => {
    const shapes = kiezShapes();
    for (const k of KIEZE) assert.ok(shapes.has(k.slug), k.slug);
    assert.equal(KIEZE.filter((k) => k.wave === 1).length, 5);
    assert.equal(KIEZE.filter((k) => k.wave === 2).length, 5);
  });

  it('locates landmarks in the right Kiez', () => {
    assert.equal(kiezAt({ lat: 52.5219, lng: 13.4132 }), 'mitte'); // Alexanderplatz
    assert.equal(kiezAt({ lat: 52.5025, lng: 13.4186 }), 'kreuzberg'); // Oranienplatz
    assert.equal(kiezAt({ lat: 52.5373, lng: 13.4178 }), 'prenzlauer-berg'); // Kollwitzplatz
    assert.equal(kiezAt({ lat: 52.5121, lng: 13.4594 }), 'friedrichshain'); // Boxhagener Platz
    assert.equal(kiezAt({ lat: 52.4729, lng: 13.4447 }), 'neukoelln'); // Richardplatz
    assert.equal(kiezAt({ lat: 52.4900, lng: 13.3500 }), 'schoeneberg'); // Winterfeldtplatz area
    assert.equal(kiezAt({ lat: 52.4000, lng: 13.2000 }), null); // Wannsee
  });

  it('tiles cover every point of the Kiez and quarter cleanly', () => {
    const shape = kiezShapes().get('kreuzberg')!;
    const tiles = tileGrid(shape, 800);
    assert.ok(tiles.length > 5 && tiles.length < 80, `${tiles.length} tiles`);
    for (const p of [{ lat: 52.5025, lng: 13.4186 }, { lat: 52.4935, lng: 13.3895 }, { lat: 52.4990, lng: 13.4440 }]) {
      assert.ok(pointInShape(p, shape));
      assert.ok(tiles.some((t) => p.lat >= t.south && p.lat <= t.north && p.lng >= t.west && p.lng <= t.east), `point ${p.lat},${p.lng} not covered`);
    }
    const kids = splitTile(tiles[0]!);
    assert.equal(kids.length, 4);
    assert.equal(kids[0]!.south, tiles[0]!.south);
    assert.equal(kids[3]!.north, tiles[0]!.north);
  });

  it('measures distances in metres', () => {
    const d = distanceMeters({ lat: 52.5, lng: 13.4 }, { lat: 52.501, lng: 13.4 });
    assert.ok(Math.abs(d - 110.5) < 1);
  });
});

const cand = (placeId: string, name: string, lat: number, lng: number, websiteUri: string | null = null): PlacesCandidate =>
  ({ placeId, name, location: { lat, lng }, rating: 4.5, userRatingCount: 10, websiteUri, businessStatus: 'OPERATIONAL' });

describe('Places to OSM matching', () => {

  it('normalises names and scores similarity', () => {
    assert.equal(normName("Lia's Kitchen Berlin"), 'lia s');
    assert.equal(nameSimilarity('dean&david', 'dean & david Alexanderplatz'), 0.85);
    assert.ok(nameSimilarity('Feinbergs', "Feinberg's") > 0.8);
    assert.ok(nameSimilarity('Burgermeister', 'Pho Viet') < 0.3);
    assert.equal(domainOf('https://www.liaskitchen.de/menu'), 'liaskitchen.de');
  });

  it('matches one to one by name, distance and domain', () => {
    const osm = [
      { id: 'osm:node/1', name: "Lia's Kitchen", lat: 52.4914, lng: 13.414, website: 'https://www.liaskitchen.de' },
      { id: 'osm:node/2', name: 'Kame', lat: 52.4915, lng: 13.4141, website: null },
      { id: 'osm:node/3', name: 'Far Away Pizza', lat: 52.5, lng: 13.5, website: null },
    ];
    const m = matchCandidates([
      cand('p1', "Lia's Kitchen - 100% vegan", 52.49142, 13.41405, 'https://liaskitchen.de/'),
      cand('p2', 'Kame Japanese Bites', 52.49151, 13.41412),
      cand('p3', 'Far Away Pizza', 52.4, 13.3), // too far
      cand('p4', "Lia's Kitchen", 52.49143, 13.41402), // duplicate name, loses to p1
    ], osm);
    const byOsm = Object.fromEntries(m.map((x) => [x.osmId, x.placeId]));
    assert.equal(byOsm['osm:node/1'], 'p1');
    assert.equal(byOsm['osm:node/2'], 'p2');
    assert.equal(byOsm['osm:node/3'], undefined);
    assert.equal(m.length, 2);
  });
});
