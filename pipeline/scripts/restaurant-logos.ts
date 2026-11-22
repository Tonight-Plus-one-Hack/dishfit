// Captures first-party brand assets into deployable, content-addressed WebP tiles.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { publishedRestaurants } from '../src/coverage.ts';
import { WebsiteMenuFetcher } from '../src/sources/website.ts';
import { mapPool } from '../src/util/limiter.ts';

type Logo = { url: string; source: string };

function imageFormat(bytes: Buffer): string | null {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'jpeg';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (/^GIF8[79]a$/.test(bytes.toString('ascii', 0, 6))) return 'gif';
  if (bytes.subarray(0, 4).equals(Buffer.from([0, 0, 1, 0]))) return 'ico';
  return null;
}

function tile(bytes: Buffer): Buffer | null {
  const format = imageFormat(bytes);
  if (!format) return null;
  const converted = spawnSync('magick', [
    '-limit', 'thread', '1', '-limit', 'memory', '64MiB', '-limit', 'map', '64MiB', '-limit', 'disk', '0',
    `${format}:-[0]`, '-auto-orient', '-resize', '224x224', '-background', 'none', '-gravity', 'center',
    '-extent', '256x256', '-strip', '-quality', '85', 'webp:-',
  ], { input: bytes, timeout: 8_000, maxBuffer: 512 * 1024 });
  return converted.status === 0 && converted.stdout.length > 0 ? converted.stdout : null;
}

const { values } = parseArgs({ options: { limit: { type: 'string' }, kiez: { type: 'string' } } });
const limit = values.limit === undefined ? Infinity : Number(values.limit);
if (values.limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1)) throw new Error('--limit must be a positive integer');
if (spawnSync('magick', ['-version']).status !== 0) throw new Error('ImageMagick 7 (magick) is required');

const web = fileURLToPath(new URL('../../apps/web/', import.meta.url));
const seed = join(web, 'src/data/seed/pipeline');
const manifest = join(seed, 'logos.json');
const assets = join(web, 'public/restaurant-logos');
const logos = JSON.parse(readFileSync(manifest, 'utf8')) as Record<string, Logo>;
const pending = publishedRestaurants(join(seed, 'kiez')).filter(({ kiez, restaurant }) =>
  (!values.kiez || kiez === values.kiez) && restaurant.website && !logos[restaurant.id],
).slice(0, limit);
const crawler = new WebsiteMenuFetcher(8000);
const jobs = new Map<string, Promise<Logo | null>>();

async function capture(website: string): Promise<Logo | null> {
  for await (const asset of crawler.logos(website)) {
    const webp = tile(asset.bytes);
    if (!webp) continue;
    const name = `${createHash('sha256').update(webp).digest('hex').slice(0, 24)}.webp`;
    const file = join(assets, name);
    mkdirSync(assets, { recursive: true });
    if (!existsSync(file)) writeFileSync(file, webp, { flag: 'wx' });
    return { url: `/restaurant-logos/${name}`, source: asset.url };
  }
  return null;
}

const { errors } = await mapPool(pending, 4, async ({ restaurant }) => {
  const website = restaurant.website!;
  let job = jobs.get(website);
  if (!job) {
    job = capture(website);
    jobs.set(website, job);
  }
  const logo = await job;
  if (logo) {
    logos[restaurant.id] = logo;
    console.log(`${restaurant.id} ${logo.url}`);
  }
});
const sorted = Object.fromEntries(Object.entries(logos).toSorted(([a], [b]) => a.localeCompare(b)));
writeFileSync(`${manifest}.tmp`, `${JSON.stringify(sorted, null, 2)}\n`);
renameSync(`${manifest}.tmp`, manifest);
console.log(`${pending.length} websites checked, ${pending.filter(({ restaurant }) => logos[restaurant.id]).length} new restaurant logos, ${errors.length} website errors`);
