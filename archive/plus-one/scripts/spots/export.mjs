import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { areas } from './areas.mjs';
import { curate } from './curate.mjs';

const dataDir = fileURLToPath(new URL('../../data/spots/', import.meta.url));
const endpoint = 'https://ovp.dresel.systems/api/interpreter';
const userAgent = 'Wohin-Spot-Exporter/1.0 (one-off OSM city venue snapshots)';
const categories = ['bar', 'pub', 'nightclub', 'biergarten'];

async function fetchSpots(relation) {
  const query = `[out:json][timeout:30];
rel(${relation});
map_to_area -> .city;
nwr["amenity"~"^(${categories.join('|')})$"]["name"](area.city);
out center;`;
  const response = await fetch(endpoint, {
    method: 'POST',
    body: new URLSearchParams({ data: query }),
    headers: { 'User-Agent': userAgent },
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`Overpass returned HTTP ${response.status}`);
  const result = await response.json();
  if (result.remark || !Array.isArray(result.elements) || result.elements.length === 0) {
    throw new Error(result.remark || 'Overpass returned no venues');
  }
  return result;
}

async function writeJson(path, value) {
  const pending = `${path}.${process.pid}.tmp`;
  await writeFile(pending, `${JSON.stringify(value, null, 2)}\n`);
  await rename(pending, path);
}

async function main() {
  const { values, positionals } = parseArgs({
    options: { 'cache-dir': { type: 'string' }, offline: { type: 'boolean' } },
    allowPositionals: true,
  });
  const cities = JSON.parse(await readFile(join(dataDir, 'cities.json'), 'utf8'));
  const slugs = new Set(cities.map(({ slug }) => slug));
  for (const slug of positionals) {
    if (!slugs.has(slug)) throw new Error(`Unknown city slug: ${slug}`);
  }
  const cacheDir = values['cache-dir'] && resolve(values['cache-dir']);
  if (values.offline && !cacheDir) throw new Error('--offline requires --cache-dir');
  if (cacheDir && !values.offline) await mkdir(cacheDir, { recursive: true });

  const selected = cities.filter(({ slug }) => !positionals.length || positionals.includes(slug));
  for (const [index, city] of selected.entries()) {
    if (!values.offline && index > 0) await pause(5_000);
    const area = areas[city.slug];
    const cachePath = cacheDir && join(cacheDir, `${city.slug}.json`);
    try {
      let result;
      if (values.offline) {
        result = JSON.parse(await readFile(cachePath, 'utf8'));
      } else {
        result = await fetchSpots(area.relation);
        if (cachePath) await writeJson(cachePath, result);
      }
      const spots = curate(result.elements, area.districts);
      const featured = spots.filter(({ curated }) => curated).length;
      if (featured < 25) throw new Error(`Only ${featured} venues qualify for curation`);
      await writeJson(join(dataDir, `${city.slug}.json`), spots);
      console.log(`${city.slug}: ${spots.length} exported, ${featured} curated (OSM data ${result.osm3s?.timestamp_osm_base ?? 'timestamp unavailable'})`);
    } catch (error) {
      throw new Error(`${city.slug}: ${error.message}`, { cause: error });
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
