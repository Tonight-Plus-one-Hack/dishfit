import { KIEZE, type Kiez } from '../../../packages/contract/src/kieze.ts'
import { distanceMeters } from '../../../packages/contract/src/geo.ts'
import type { Dish, Restaurant } from '../src/data/contract.ts'
import { alternateUrls, isCategory, listedEntries, locales, renderGuide, type Category } from './guide-page.ts'

const DEFAULT_CANONICAL_URL = 'https://dishfit.caniberk.dev'
const MIN_DISHES = 5

export type Entry = { dish: Dish; restaurant: Restaurant }

interface Listing {
  path: string
  entries: Entry[]
}

type KiezGuide = Listing & { kiez: Kiez; category?: never }
type CategoryGuide = Listing & { kiez?: never; category: Category }
type Combination = Listing & { kiez: Kiez; category: Category; area: KiezGuide; categoryGuide?: CategoryGuide }
export type Guide = KiezGuide | CategoryGuide | Combination

const byDishCount = (a: Guide, b: Guide) => b.entries.length - a.entries.length
const categorySlug = (category: Category) => category.replaceAll('_', '-')

function canonicalOrigin(value: string): string {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password || url.href !== `${url.origin}/`) {
    throw new Error('DISHFIT_CANONICAL_URL must be an HTTPS origin without a path, credentials, query or fragment')
  }
  return url.origin
}

export function guideFiles(
  seed: { dishes: Dish[]; restaurants: Restaurant[] },
  canonicalUrl = DEFAULT_CANONICAL_URL,
): Map<string, string> {
  const origin = canonicalOrigin(canonicalUrl)
  const restaurants = new Map(seed.restaurants.filter((r) => !r.isTestData).map((r) => [r.id, r]))
  // Match the whole meals shown by the app search. Reuse the already filtered and deduplicated public seed.
  const entries = seed.dishes.toSorted((a, b) => b.healthScore - a.healthScore || a.id.localeCompare(b.id)).flatMap((dish) => {
    const restaurant = restaurants.get(dish.restaurantId)
    return restaurant && !dish.isTestData && dish.dishClass?.isFullMeal ? [{ dish, restaurant }] : []
  })

  const byKiez = Map.groupBy(entries, (entry) => entry.restaurant.kiez)
  const byCategory = Map.groupBy(entries, (entry) => entry.dish.dishClass?.dishType)
  const published = new Set<string>()
  const isDistinct = (dishes: Entry[]) => {
    const key = listedEntries(dishes).map(({ dish }) => dish.id).join('\n')
    if (published.has(key)) return false
    published.add(key)
    return true
  }
  const kieze: KiezGuide[] = []
  const candidates: CategoryGuide[] = []
  const combinations: Combination[] = []

  for (const kiez of KIEZE) {
    const dishes = byKiez.get(kiez.name) ?? []
    if (dishes.length >= MIN_DISHES && isDistinct(dishes)) kieze.push({ path: `/kiez/${kiez.slug}`, kiez, entries: dishes })
  }
  for (const [category, dishes] of byCategory) {
    if (category && isCategory(category) && dishes.length >= MIN_DISHES) candidates.push({ path: `/kategorie/${categorySlug(category)}`, category, entries: dishes })
  }
  const categories = candidates.filter(({ entries }) => isDistinct(entries))
  for (const area of kieze) {
    for (const candidate of candidates) {
      const { category } = candidate
      const dishes = area.entries.filter(({ dish }) => dish.dishClass?.dishType === category)
      if (dishes.length >= MIN_DISHES && isDistinct(dishes)) {
        combinations.push({
          path: `${area.path}/${categorySlug(category)}`,
          kiez: area.kiez,
          category,
          area,
          categoryGuide: categories.includes(candidate) ? candidate : undefined,
          entries: dishes,
        })
      }
    }
  }

  const centers = new Map(kieze.map(({ kiez, entries }) => {
    const places = [...new Set(entries.map(({ restaurant }) => restaurant))]
    return [kiez, {
      lat: places.reduce((sum, r) => sum + r.lat, 0) / places.length,
      lng: places.reduce((sum, r) => sum + r.lng, 0) / places.length,
    }]
  }))
  function nearby(kiez: Kiez, candidates: (KiezGuide | Combination)[]): Guide[] {
    const center = centers.get(kiez)!
    const distance = (other: KiezGuide | Combination) => distanceMeters(center, centers.get(other.kiez)!)
    return candidates.filter((other) => other.kiez !== kiez)
      .toSorted((a, b) => distance(a) - distance(b)).slice(0, 4)
  }

  const categoryPlaces = new Map(categories.map((guide) => [guide, new Set(guide.entries.map(({ restaurant }) => restaurant.id))]))
  function related(guide: Guide): Guide[] {
    if ('area' in guide) {
      const here = combinations.filter((item) => item.kiez === guide.kiez && item !== guide).toSorted(byDishCount)
      const sameType = combinations.filter((item) => item.category === guide.category)
      return [...(guide.categoryGuide ? [guide.categoryGuide] : []), ...here.slice(0, 4), ...nearby(guide.kiez, sameType)]
    }
    if (guide.kiez) {
      const here = combinations.filter((item) => item.kiez === guide.kiez).toSorted(byDishCount)
      return [...here, ...nearby(guide.kiez, kieze)]
    }
    const inArea = combinations.filter((item) => item.category === guide.category).toSorted(byDishCount)
    const places = categoryPlaces.get(guide)!
    const others = categories.filter((item) => item !== guide)
      .map((item) => ({ item, overlap: places.intersection(categoryPlaces.get(item)!).size }))
      .toSorted((a, b) => b.overlap - a.overlap)
    return [...inArea.slice(0, 8), ...others.slice(0, 4).map(({ item }) => item)]
  }

  if (!kieze.some(({ path }) => path === '/kiez/kreuzberg')) throw new Error('The app links to /kiez/kreuzberg, which has no guide')
  const files = new Map<string, string>()
  const sitemapEntries: string[] = [`  <url><loc>${origin}/</loc></url>`]
  for (const guide of [...kieze, ...categories, ...combinations]) {
    const links = related(guide)
    const urls = alternateUrls(guide, origin)
    for (const locale of locales) {
      const url = new URL(urls[locale])
      files.set(`${url.pathname.slice(1)}.html`, renderGuide(guide, links, locale, origin))
      sitemapEntries.push(`  <url><loc>${url.href}</loc>${locales.map((language) =>
        `<xhtml:link rel="alternate" hreflang="${language}" href="${urls[language]}"/>`,
      ).join('')}</url>`)
    }
  }
  files.set('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${sitemapEntries.join('\n')}\n</urlset>\n`)
  files.set('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`)
  return files
}
