import type { Range } from '../src/data/contract.ts'
import type { DishType } from '../src/data/dishClass.ts'
import { paths } from '../src/lib/routes.ts'
import type { Entry, Guide } from './guides.ts'

export const locales = ['de', 'en'] as const
type Locale = (typeof locales)[number]
const MAX_LISTED_DISHES = 30

export const listedEntries = (entries: Entry[]) => entries.slice(0, MAX_LISTED_DISHES)

const CATEGORY_LABELS = {
  bowl: { de: 'Bowls', en: 'Bowls' },
  salad: { de: 'Salate', en: 'Salads' },
  curry: { de: 'Currys', en: 'Curries' },
  ramen_noodles: { de: 'Nudelsuppen und Nudelgerichte', en: 'Noodle soups and noodle dishes' },
  stir_fry: { de: 'Wokgerichte', en: 'Stir-fries' },
  sushi: { de: 'Sushi', en: 'Sushi' },
  wrap: { de: 'Wraps', en: 'Wraps' },
  tacos: { de: 'Tacos', en: 'Tacos' },
  breakfast: { de: 'Frühstück', en: 'Breakfast' },
  sandwich: { de: 'Sandwiches', en: 'Sandwiches' },
  grill_plate: { de: 'Grillgerichte', en: 'Grilled dishes' },
  soup: { de: 'Suppen', en: 'Soups' },
  pasta: { de: 'Pasta', en: 'Pasta' },
  dumplings: { de: 'Dumplings', en: 'Dumplings' },
} satisfies Partial<Record<DishType, Record<Locale, string>>>

export type Category = keyof typeof CATEGORY_LABELS

export function isCategory(value: DishType): value is Category {
  return Object.hasOwn(CATEGORY_LABELS, value)
}

function guideTopic(guide: Guide, locale: Locale, inSentence = false): string {
  if (!guide.category) return guide.kiez.name
  const category = CATEGORY_LABELS[guide.category][locale]
  return `${inSentence && locale === 'en' ? category.toLowerCase() : category} in ${guide.kiez?.name ?? 'Berlin'}`
}

const COPY = {
  de: {
    breadcrumbs: 'Seitenpfad',
    description: (topic: string, dishes: number) => `${topic}: ${dishes} Gerichte mit Preisen, Kalorien und Protein im DishFit-Katalog.`,
    intro: (place: string, dishes: number, places: number, examples: string) =>
      `Diese Übersicht zeigt ${dishes} Gerichte aus ${places === 1 ? 'einem Restaurant' : `${places} Restaurants`} in ${place}, darunter ${examples}.`,
    kiezHeading: (name: string) => `Gesund essen in ${name}`,
    categoryHeading: (topic: string) => topic,
    dishes: 'Gerichte',
    preview: (shown: number, total: number) => `${shown} von ${total} Gerichten, sortiert nach DishFit-Score.`,
    related: 'Weitere Kieze und Kategorien',
    search: 'Ergebnisse in DishFit ansehen',
    missingPrice: 'Preis vor Ort',
    estimate: 'Schätzung',
    protein: 'g Protein',
    language: 'Deutsch',
    attribution: 'Restaurantdaten ©',
  },
  en: {
    breadcrumbs: 'Breadcrumbs',
    description: (topic: string, dishes: number) => `${topic}: compare prices, calories and protein for ${dishes} dishes in the DishFit catalog.`,
    intro: (place: string, dishes: number, places: number, examples: string) =>
      `This guide covers ${dishes} dishes from ${places === 1 ? 'one restaurant' : `${places} restaurants`} in ${place}, including ${examples}.`,
    kiezHeading: (name: string) => `Healthy food in ${name}`,
    categoryHeading: (topic: string) => `Where to find ${topic}`,
    dishes: 'Dishes',
    preview: (shown: number, total: number) => `${shown} of ${total} dishes, sorted by DishFit score.`,
    related: 'Explore more neighborhoods and categories',
    search: 'View results in DishFit',
    missingPrice: 'Ask for the price',
    estimate: 'Estimate',
    protein: 'g protein',
    language: 'English',
    attribution: 'Restaurant data ©',
  },
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
}

function localizedPath(guide: Guide, locale: Locale): string {
  return locale === 'en' ? `/en${guide.path}` : guide.path
}

export function alternateUrls(guide: Guide, origin: string): Record<Locale, string> {
  return { de: origin + localizedPath(guide, 'de'), en: origin + localizedPath(guide, 'en') }
}

function schema(entries: Entry[], crumbs: Array<{ name: string; path: string }>, origin: string, canonical: string): string {
  const menuItems = entries.map(({ dish }) => {
    const url = origin + paths.dish(dish.id)
    return {
      '@type': 'MenuItem',
      '@id': `${canonical}#${encodeURIComponent(dish.id)}`,
      name: dish.name,
      url,
      ...(dish.price !== null && { offers: { '@type': 'Offer', price: dish.price, priceCurrency: 'EUR' } }),
      ...(dish.nutrition.source === 'official' && {
        nutrition: {
          '@type': 'NutritionInformation',
          calories: `${dish.nutrition.kcal.value} kcal`,
          proteinContent: `${dish.nutrition.protein.value} g`,
        },
      }),
    }
  })
  const menus = Map.groupBy(entries.keys(), (index) => entries[index].restaurant)
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: crumbs.map(({ name, path }, index) => ({
          '@type': 'ListItem', position: index + 1, name, item: origin + path,
        })),
      },
      {
        '@type': 'ItemList',
        itemListElement: menuItems.map((item, index) => ({
          '@type': 'ListItem', position: index + 1, item,
        })),
      },
      ...[...menus].map(([restaurant, indexes]) => {
        const url = origin + paths.restaurant(restaurant.id)
        return {
          '@type': 'Restaurant',
          '@id': `${url}#restaurant`,
          name: restaurant.name,
          url,
          ...(restaurant.address && { address: restaurant.address }),
          hasMenu: {
            '@type': 'Menu',
            '@id': `${url}#menu`,
            hasMenuItem: indexes.map((index) => ({ '@id': menuItems[index]['@id'] })),
          },
        }
      }),
    ],
  }).replaceAll('<', '\\u003c')
}

export function renderGuide(guide: Guide, related: Guide[], locale: Locale, origin: string): string {
  const copy = COPY[locale]
  const alternate = locale === 'de' ? 'en' : 'de'
  const urls = alternateUrls(guide, origin)
  const topic = guideTopic(guide, locale, true)
  const heading = guide.category ? copy.categoryHeading(topic) : copy.kiezHeading(topic)
  const description = copy.description(heading, guide.entries.length)
  const crumbs = [{ name: 'DishFit', path: paths.start() }]
  if ('area' in guide) crumbs.push({ name: guideTopic(guide.area, locale), path: localizedPath(guide.area, locale) })
  crumbs.push({ name: heading, path: localizedPath(guide, locale) })

  const entries = listedEntries(guide.entries)
  const restaurants = new Set(guide.entries.map(({ restaurant }) => restaurant.id))
  const examples = new Intl.ListFormat(locale).format(entries.slice(0, 2).map(({ dish }) => dish.name))
  const money = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' })
  const numbers = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
  const amount = (value: Range, estimated: boolean, unit: string) =>
    `${estimated && value.min !== value.max ? `${numbers.format(value.min)}–${numbers.format(value.max)}` : numbers.format(value.value)} ${unit}`
  const filters = new URLSearchParams()
  if (guide.kiez) filters.set('kiez', guide.kiez.name)
  if (guide.category) filters.set('type', guide.category)

  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(heading)} | DishFit</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${urls[locale]}">
${locales.map((language) => `<link rel="alternate" hreflang="${language}" href="${urls[language]}">`).join('\n')}
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="stylesheet" href="/guides.css">
<script type="application/ld+json">${schema(entries, crumbs, origin, urls[locale])}</script>
</head>
<body>
<header>
  <a class="brand" href="/"><img src="/favicon.svg" width="28" height="28" alt="">DishFit</a>
  <a lang="${alternate}" hreflang="${alternate}" href="${localizedPath(guide, alternate)}">${COPY[alternate].language}</a>
</header>
<main>
  <nav aria-label="${copy.breadcrumbs}"><ol class="breadcrumbs" role="list">${crumbs.map(({ name, path }, index) => index === crumbs.length - 1
    ? `<li aria-current="page">${escapeHtml(name)}</li>`
    : `<li><a href="${path}">${escapeHtml(name)}</a></li>`).join('')}</ol></nav>
  <h1>${escapeHtml(heading)}</h1>
  <p class="intro">${escapeHtml(copy.intro(guide.kiez?.name ?? 'Berlin', guide.entries.length, restaurants.size, examples))}</p>
  <section aria-labelledby="dishes">
    <h2 id="dishes">${copy.dishes}</h2>
    ${entries.length < guide.entries.length ? `<p>${copy.preview(entries.length, guide.entries.length)}</p>` : ''}
    <ol class="dishes" role="list">${entries.map(({ dish, restaurant }) => {
      const estimated = dish.nutrition.source === 'ai'
      const price = dish.price === null ? copy.missingPrice : money.format(dish.price)
      return `<li>
        <div><a class="dish" href="${paths.dish(dish.id)}">${escapeHtml(dish.name)}</a>
        <div class="restaurant"><a href="${paths.restaurant(restaurant.id)}">${escapeHtml(restaurant.name)}</a>${restaurant.address ? ` · ${escapeHtml(restaurant.address)}` : ''}</div></div>
        <div class="metrics">${escapeHtml(price)} · ${estimated ? copy.estimate + ' · ' : ''}${amount(dish.nutrition.kcal, estimated, 'kcal')} · ${amount(dish.nutrition.protein, estimated, copy.protein)}</div>
      </li>`
    }).join('\n')}</ol>
    <p><a class="search" href="${escapeHtml(paths.search(filters.toString()))}">${copy.search}</a></p>
  </section>
  ${related.length ? `<nav aria-labelledby="related"><h2 id="related">${copy.related}</h2>
    <ul class="related" role="list">${related.map((other) => `<li><a href="${localizedPath(other, locale)}">${escapeHtml(guideTopic(other, locale))}</a></li>`).join('')}</ul>
  </nav>` : ''}
</main>
<footer>${copy.attribution} <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a></footer>
</body>
</html>
`
}
