// Real restaurants from the data pipeline (pipeline/): OpenStreetMap base data
// (© OpenStreetMap contributors, ODbL), menus read from each restaurant's own website, nutrition
// computed from USDA FoodData Central, checked per Kiez, and AI dish illustrations ("KI-Bild").
// One file per Kiez in ./pipeline/kiez/<slug>.json, written by `npm run scan -- --kiez <slug>` in pipeline/,
// so teammates scanning different Kieze never touch the same file. A place that appears in two files
// (same Google place id or OSM element) is kept once, from the first file in alphabetical order.
// The JSON is compact (dishes nested, numbers as arrays, string tables); this module expands it into contract objects.
import type { Confidence, Dish, Ingredient, Kiez, MenuSource, NutritionSource, OpeningHours, Range, Restaurant } from '../contract'
import { stripMenuNumber, unpackDishClass, type CompactDishClass } from '../dishClass'
import restaurantLogos from './pipeline/logos.json'

const LOGOS: Record<string, { url: string }> = restaurantLogos

interface WebSeedDish {
  id: string
  name: string
  description: string
  descriptionEn?: string | null
  price: number | null
  category: string
  n: number[]
  confidence: Confidence
  source: NutritionSource
  method: number
  model: string | null
  ingredients: [number, number][]
  healthScore: number
  proteinPerEuro: number | null
  diet: Array<'vegan' | 'vegetarian'>
  image: string | null
  /** [course, dishType, cuisine, flags, confidence] from the pipeline classifier. */
  c?: CompactDishClass
}

interface WebSeedRestaurant {
  id: string
  placeId: string | null
  osmId: string | null
  name: string
  kiez: string
  address: string
  lat: number
  lng: number
  cuisine: string[]
  openingHours: OpeningHours | null
  website: string | null
  menu: MenuSource
  dishes: WebSeedDish[]
}

interface WebSeed {
  v: 1
  generatedAt: string
  attribution: string[]
  methods: string[]
  ingredientNames: string[]
  restaurants: WebSeedRestaurant[]
}

/** KI-Bild files bundled by Vite, keyed by file name without extension. */
const IMAGES: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>('./pipeline/images/*.{jpg,webp}', { eager: true, query: '?url', import: 'default' }),
  ).map(([path, url]) => [path.replace(/^.*\//, '').replace(/\.[a-z]+$/, ''), url]),
)

function triple(n: number[], i: number): Range {
  return { value: n[i * 3], min: n[i * 3 + 1], max: n[i * 3 + 2] }
}

export function expandPipelineSeed(seed: WebSeed): { restaurants: Restaurant[]; dishes: Dish[] } {
  const restaurants: Restaurant[] = []
  const dishes: Dish[] = []
  for (const r of seed.restaurants) {
    restaurants.push({
      id: r.id,
      placeId: r.placeId,
      osmId: r.osmId,
      name: r.name,
      kiez: r.kiez as Kiez,
      address: r.address,
      lat: r.lat,
      lng: r.lng,
      cuisine: r.cuisine,
      openingHours: r.openingHours,
      baseSource: 'osm',
      website: r.website,
      logoUrl: LOGOS[r.id]?.url,
      menu: r.menu,
      isTestData: false,
    })
    for (const d of r.dishes) {
      const ingredients: Ingredient[] = d.ingredients.map(([name, grams]) => ({
        name: seed.ingredientNames[name],
        amount: grams,
        unit: 'g',
      }))
      const image = d.image ? IMAGES[d.image] : undefined
      dishes.push({
        id: d.id,
        restaurantId: r.id,
        name: stripMenuNumber(d.name),
        description: d.description,
        ...(d.descriptionEn ? { descriptionEn: d.descriptionEn } : {}),
        price: d.price,
        category: d.category,
        nutrition: {
          kcal: triple(d.n, 0),
          protein: triple(d.n, 1),
          carbs: triple(d.n, 2),
          fat: triple(d.n, 3),
          confidence: d.confidence,
          source: d.source,
          method: seed.methods[d.method],
          ...(d.model ? { model: d.model } : {}),
          ingredients,
        },
        healthScore: d.healthScore,
        proteinPerEuro: d.proteinPerEuro,
        diet: d.diet,
        menuSource: r.menu,
        image: image ? { kind: 'ai', ref: image, alt: `KI-Bild: ${d.name}` } : null,
        isTestData: false,
        ...(d.c ? { dishClass: unpackDishClass(d.c) } : {}),
      })
    }
  }
  return { restaurants, dishes }
}

/** Every per-Kiez file, in file-name order. */
const KIEZ_FILES = import.meta.glob<WebSeed>('./pipeline/kiez/*.json', { eager: true, import: 'default' })

export function mergePipelineSeeds(seeds: WebSeed[]): { restaurants: Restaurant[]; dishes: Dish[] } {
  const restaurants: Restaurant[] = []
  const dishes: Dish[] = []
  const seen = new Set<string>()
  const dishIds = new Set<string>()
  for (const seed of seeds) {
    const part = expandPipelineSeed(seed)
    const kept = new Set<string>()
    for (const r of part.restaurants) {
      const keys = [`id:${r.id}`, r.placeId ? `place:${r.placeId}` : '', r.osmId ? `osm:${r.osmId}` : ''].filter(Boolean)
      if (keys.some((k) => seen.has(k))) continue
      keys.forEach((k) => seen.add(k))
      kept.add(r.id)
      restaurants.push(r)
    }
    for (const d of part.dishes) {
      if (kept.has(d.restaurantId) && !dishIds.has(d.id)) {
        dishIds.add(d.id)
        dishes.push(d)
      }
    }
  }
  return { restaurants, dishes }
}

export const PIPELINE_SEED = mergePipelineSeeds(
  Object.keys(KIEZ_FILES)
    .toSorted()
    .map((path) => KIEZ_FILES[path]),
)
