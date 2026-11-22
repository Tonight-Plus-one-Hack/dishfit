// Builds the contract objects from the raw seed files. Only src/data/mock.ts imports this.
import type { Confidence, Dish, NutritionEstimate, Restaurant } from '../contract'
import { parseOsmHours } from '../hours'
import { OFFICIAL_SPREAD, RANGE_SPREAD, healthScore, proteinPerEuro, range } from '../scoring'
import deanDavid from './spike/dean-david.text.json'
import feinbergs from './spike/feinberg-s.text.json'
import liasKitchen from './spike/lia-s-kitchen.text.json'
import vietBowl from './spike/viet-bowl.text.json'
import { DEAN_DAVID_OFFICIAL, SPIKE_FETCHED_AT, SPIKE_RESTAURANTS } from './spike-restaurants'
import { TEST_RESTAURANTS } from './test-restaurants'
import { dishName, displayName } from '../../lib/format'
import { PIPELINE_SEED } from './pipeline'
import { stripMenuNumber } from '../dishClass'

interface SpikeDish {
  name: string
  description: string
  section: string
  price_eur: number | null
  portion_assumption: string
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  confidence: Confidence
  assumptions: string
}

interface SpikeOutput {
  model: string
  result: { dishes: SpikeDish[] }
}

const SPIKE: Record<string, SpikeOutput> = {
  'dean-david': deanDavid as SpikeOutput,
  'feinberg-s': feinbergs as SpikeOutput,
  'lia-s-kitchen': liasKitchen as SpikeOutput,
  'viet-bowl': vietBowl as SpikeOutput,
}

const TEST_FETCHED_AT = '2026-11-21T12:00:00+01:00'

function slug(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Menus in capitals ("20 UDON KRÄUTERSEITLING SUPPE") read better in title case, without the menu number. */
function tidy(input: string): string {
  const text = stripMenuNumber(input)
  if (text !== text.toUpperCase()) return text
  return text.toLowerCase().replace(/(^|[\s(/-])(\p{L})/gu, (_m, pre: string, ch: string) => pre + ch.toUpperCase())
}

function estimate(
  [kcal, protein, carbs, fat]: [number, number, number, number],
  confidence: Confidence,
  source: NutritionEstimate['source'],
  method: string,
  model?: string,
): NutritionEstimate {
  const spread = source === 'official' ? OFFICIAL_SPREAD : RANGE_SPREAD[confidence]
  return {
    kcal: range(kcal, spread),
    protein: range(protein, spread),
    carbs: range(carbs, spread),
    fat: range(fat, spread),
    confidence: source === 'official' ? 'high' : confidence,
    source,
    method,
    model,
  }
}

function dietOf(text: string, restaurantVegan: boolean): Dish['diet'] {
  if (restaurantVegan || /\bvegan/i.test(text)) return ['vegan', 'vegetarian']
  if (/\b(veggie|vegetari)/i.test(text)) return ['vegetarian']
  return []
}

function uniqueId(base: string, taken: Set<string>): string {
  let id = base
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`
  taken.add(id)
  return id
}

function build(): { restaurants: Restaurant[]; dishes: Dish[] } {
  const restaurants: Restaurant[] = []
  const dishes: Dish[] = []
  const ids = new Set<string>()

  for (const r of SPIKE_RESTAURANTS) {
    const menu = r.menuUrl ? { url: r.menuUrl, fetchedAt: SPIKE_FETCHED_AT, kind: 'website' as const } : null
    restaurants.push({
      id: r.id,
      placeId: null,
      osmId: r.osmId,
      name: r.name,
      kiez: r.kiez,
      address: r.address,
      lat: r.lat,
      lng: r.lng,
      cuisine: r.cuisine,
      openingHours: r.hours ? parseOsmHours(r.hours) : null,
      baseSource: 'osm',
      website: r.website,
      menu,
      isTestData: false,
    })
    if (!r.spike || !menu) continue
    const out = SPIKE[r.spike]
    for (const d of out.result.dishes) {
      const name = tidy(d.name)
      const official = r.spike === 'dean-david' ? DEAN_DAVID_OFFICIAL.values[d.name] : undefined
      const nutrition = official
        ? estimate(
            official,
            'high',
            'official',
            'Offizielle Nährwerte der Kette pro Portion, inklusive Basis und Soße.',
          )
        : estimate(
            [d.kcal, d.protein_g, d.carbs_g, d.fat_g],
            d.confidence,
            'ai',
            `Portion: ${d.portion_assumption}. ${d.assumptions}`,
            out.model,
          )
      dishes.push({
        id: uniqueId(`${r.id}--${slug(name)}`, ids),
        restaurantId: r.id,
        name,
        description: d.description,
        price: d.price_eur,
        category: tidy(d.section),
        nutrition,
        healthScore: healthScore(nutrition),
        proteinPerEuro: proteinPerEuro(nutrition.protein.min, d.price_eur),
        diet: dietOf(`${d.name} ${d.description} ${d.section}`, r.cuisine.includes('Vegan')),
        menuSource: official ? { url: DEAN_DAVID_OFFICIAL.url, fetchedAt: SPIKE_FETCHED_AT, kind: 'website' } : menu,
        image: null,
        isTestData: false,
      })
    }
  }

  for (const r of TEST_RESTAURANTS) {
    const menu = { url: `https://example.com/testdaten/${r.id}`, fetchedAt: TEST_FETCHED_AT, kind: 'website' as const }
    restaurants.push({
      id: r.id,
      placeId: null,
      osmId: null,
      name: r.name,
      kiez: r.kiez,
      address: r.address,
      lat: r.lat,
      lng: r.lng,
      cuisine: r.cuisine,
      openingHours: parseOsmHours(r.hours),
      baseSource: 'test',
      website: null,
      menu,
      isTestData: true,
    })
    for (const [name, description, category, price, protein, carbs, fat, confidence, diet] of r.dishes) {
      const kcal = Math.round((protein * 4 + carbs * 4 + fat * 9) / 10) * 10
      const nutrition = estimate(
        [kcal, protein, carbs, fat],
        confidence,
        r.source,
        'Testdaten: erfundene Werte, so dargestellt wie eine KI-Schätzung aus der Speisekarte.',
      )
      dishes.push({
        id: uniqueId(`${r.id}--${slug(name)}`, ids),
        restaurantId: r.id,
        name,
        description,
        price,
        category,
        nutrition,
        healthScore: healthScore(nutrition),
        proteinPerEuro: proteinPerEuro(nutrition.protein.min, price),
        diet: diet.includes('vegan') ? ['vegan', 'vegetarian'] : diet,
        menuSource: menu,
        image: null,
        isTestData: true,
      })
    }
  }

  // Real pipeline data (wave 1), appended last. A place already present above keeps its record (and gains the pipeline Place ID).
  const knownOsm = new Map(restaurants.flatMap((r) => (r.osmId ? [[r.osmId, r] as const] : [])))
  const skipped = new Set<string>()
  for (const r of PIPELINE_SEED.restaurants) {
    const known = r.osmId ? knownOsm.get(r.osmId) : undefined
    if (known || ids.has(r.id)) {
      // The kept record adopts the verified pipeline Place ID, so its live Google photo shows.
      if (known && !known.isTestData) {
        if (!known.placeId && r.placeId) known.placeId = r.placeId
        if (!known.logoUrl && r.logoUrl) known.logoUrl = r.logoUrl
      }
      skipped.add(r.id)
      continue
    }
    ids.add(r.id)
    restaurants.push(r)
  }
  for (const d of PIPELINE_SEED.dishes) {
    if (!skipped.has(d.restaurantId) && !ids.has(d.id)) {
      ids.add(d.id)
      dishes.push(d)
    }
  }

  // Names and menu sections set in capitals on signs and menus ("PHO HA NOI") read in title case everywhere they show.
  return {
    restaurants: restaurants.map((r) => ({ ...r, name: displayName(r.name) })),
    dishes: dishes.map((d) => ({ ...d, name: dishName(d.name), category: displayName(d.category) })),
  }
}

export const SEED = build()
