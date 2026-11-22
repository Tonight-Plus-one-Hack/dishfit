// Build steps for sharing, discovery and offline use, run once per production build:
// 1. share/dishes/<id>.json and share/dishes.json: every dish the public app serves, as it shows it (name,
//    restaurant, Kiez, price, nutrition, hashed image URL). The Worker reads one dish's file from the static
//    assets for share cards and link previews, so the app's seed stays the one source of dish data.
// 2. sw.js: the service worker gets this build's asset list to precache and a version derived from it,
//    so an installed app opens offline with the seed data, and a new deploy replaces the old cache.
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createServer, type Plugin } from 'vite'
import type { Dish, Restaurant } from '../src/data/contract.ts'
import { guideFiles } from './guides.ts'

/** One dish in share/dishes.json. Keep in sync with worker/src/share/dishes.ts (ShareDish). */
export interface ShareIndexDish {
  name: string
  restaurant: string
  kiez: string
  price: number | null
  kcal: number
  protein: number
  carbs: number
  fat: number
  score: number
  estimate: boolean
  image: string | null
}

type Seed = { restaurants: Restaurant[]; dishes: Dish[] }

/**
 * Loads the seed exactly as the public app serves it (healthy dishes only, confidence-weighted scores, no
 * test data) through Vite, since the seed modules use import.meta.glob.
 */
async function loadCatalog(root: string): Promise<{ seed: Seed }> {
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'error',
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  })
  try {
    const { SEED: all } = (await server.ssrLoadModule('/src/data/seed/index.ts')) as { SEED: Seed }
    const { servedSeed } = (await server.ssrLoadModule('/src/data/seed/visible.ts')) as { servedSeed: (seed: Seed) => Seed }
    const seed = servedSeed({ restaurants: all.restaurants.filter((r) => !r.isTestData), dishes: all.dishes.filter((d) => !d.isTestData) })
    return { seed }
  } finally {
    await server.close()
  }
}

export function pwaShare(canonicalUrl?: string): Plugin {
  let root = ''
  let outDir = ''
  const emittedBySource = new Map<string, string>()
  const precache: string[] = []

  return {
    name: 'dishfit:pwa-share',
    apply: 'build',
    configResolved(config) {
      root = config.root
      outDir = path.resolve(config.root, config.build.outDir)
    },
    async generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type === 'asset') {
          for (const source of file.originalFileNames) emittedBySource.set(path.resolve(root, source), `/${file.fileName}`)
        }
        // App code and styles are precached; images load on demand and are cached as they are seen.
        if (/\.(js|css)$/.test(file.fileName)) precache.push(`/${file.fileName}`)
      }

      const { seed } = await loadCatalog(root)
      const restaurants = new Map(seed.restaurants.map((r) => [r.id, r]))
      const dishes: Record<string, ShareIndexDish> = {}
      for (const d of seed.dishes) {
        const r = restaurants.get(d.restaurantId)
        if (!r) continue
        // In SSR the image ref is the source path (/src/...); the client build hashed it into /assets/.
        const image = d.image ? (emittedBySource.get(path.join(root, d.image.ref)) ?? null) : null
        dishes[d.id] = {
          name: d.name,
          restaurant: r.name,
          kiez: r.kiez,
          price: d.price,
          kcal: Math.round(d.nutrition.kcal.value),
          protein: Math.round(d.nutrition.protein.value),
          carbs: Math.round(d.nutrition.carbs.value),
          fat: Math.round(d.nutrition.fat.value),
          score: d.healthScore,
          estimate: d.nutrition.source !== 'official',
          image,
        }
      }
      // One small file per dish for the Worker, which then never parses more than the dish it needs (a cold
      // parse of the whole index alone takes about the 10 ms CPU of a Workers Free request), and the whole
      // index for the card renderer (worker/scripts/render-cards.ts).
      for (const [id, dish] of Object.entries(dishes)) {
        if (/^[\w.-]{1,128}$/.test(id)) this.emitFile({ type: 'asset', fileName: `share/dishes/${id}.json`, source: JSON.stringify(dish) })
      }
      for (const r of seed.restaurants) {
        if (/^[\w.-]{1,128}$/.test(r.id)) this.emitFile({ type: 'asset', fileName: `share/restaurants/${r.id}.json`, source: '{}' })
      }
      this.emitFile({ type: 'asset', fileName: 'share/dishes.json', source: JSON.stringify({ v: 1, dishes }) })

      for (const [fileName, source] of guideFiles(seed, canonicalUrl)) {
        this.emitFile({ type: 'asset', fileName, source })
      }
      const tokens = await readFile(path.join(root, 'src/styles/tokens.css'), 'utf8')
      const styles = await readFile(path.join(root, 'build/guides.css'), 'utf8')
      this.emitFile({ type: 'asset', fileName: 'guides.css', source: tokens + styles })
    },
    async writeBundle() {
      // public/sw.js was copied as is; give it this build's asset list and a version derived from it.
      const swPath = path.join(outDir, 'sw.js')
      const source = await readFile(swPath, 'utf8')
      const list = precache.toSorted()
      const version = createHash('sha256').update(list.join('\n')).digest('hex').slice(0, 12)
      const next = source
        .replace("const VERSION = 'dev'", `const VERSION = '${version}'`)
        .replace('const PRECACHE = []', `const PRECACHE = ${JSON.stringify(list)}`)
      if (next === source) throw new Error('sw.js placeholders not found (VERSION, PRECACHE)')
      await writeFile(swPath, next)
    },
  }
}
