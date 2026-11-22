import { describe, expect, it } from 'vitest'
import { formatCuisine } from './cuisine'

const shipped = import.meta.glob('../data/seed/pipeline/kiez/*.json', { eager: true, import: 'default' })

function cuisineKeys(node: unknown, keys: Set<string>) {
  if (Array.isArray(node)) node.forEach((item) => cuisineKeys(item, keys))
  else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === 'cuisine' && Array.isArray(value)) value.forEach((tag) => typeof tag === 'string' && keys.add(tag))
      else cuisineKeys(value, keys)
    }
  }
}

const GERMAN: Record<string, string> = {
  arab: 'Arabisch', asian: 'Asiatisch', austrian: 'Österreichisch', balkan: 'Balkan', barbecue: 'Grillgerichte', bowl: 'Bowls',
  breakfast: 'Frühstück', burger: 'Burger', cake: 'Kuchen', ceylon: 'Sri-lankisch', chicken: 'Hähnchen', chinese: 'Chinesisch',
  croatian: 'Kroatisch', deli: 'Feinkost', european: 'Europäisch', falafel: 'Falafel', fish: 'Fisch', french: 'Französisch',
  german: 'Deutsch', greek: 'Griechisch',
  indian: 'Indisch', international: 'International', israeli: 'Israelisch', italian: 'Italienisch', japanese: 'Japanisch', kebab: 'Kebab',
  korean: 'Koreanisch', lao: 'Laotisch', lebanese: 'Libanesisch', local: 'Lokale Küche', mediterranean: 'Mediterran',
  mexican: 'Mexikanisch', middle_eastern: 'Nahöstlich', noodles: 'Nudelgerichte', oriental: 'Orientalisch', pasta: 'Pasta',
  peruvian: 'Peruanisch', pizza: 'Pizza', poke: 'Poke',
  quiche: 'Quiche', ramen: 'Ramen', regional: 'Regional', salad: 'Salat', sandwich: 'Sandwiches', soul_food: 'Soul Food', soup: 'Suppe',
  spanish: 'Spanisch', steak_house: 'Steakhouse', sushi: 'Sushi', tapas: 'Tapas', tea: 'Tee', thai: 'Thailändisch',
  tunisian: 'Tunesisch', turkish: 'Türkisch',
  uzbek: 'Usbekisch', vietnamese: 'Vietnamesisch', wrap: 'Wraps', yakitori: 'Yakitori',
}

describe('formatCuisine', () => {
  it('uses German labels in the original order', () => {
    expect(formatCuisine(['sushi', 'vietnamese', 'middle_eastern', 'austrian'])).toBe('Sushi, Vietnamesisch, Nahöstlich, Österreichisch')
  })

  it('keeps unmatched tags as they are and skips empty ones', () => {
    expect(formatCuisine(['', 'Modern deutsch', 'œufs cocotte'])).toBe('Modern deutsch, œufs cocotte')
    expect(formatCuisine([])).toBe('')
  })

  it('labels every cuisine tag in the shipped restaurant data', () => {
    const keys = new Set<string>()
    cuisineKeys(Object.values(shipped), keys)
    expect(keys.size).toBeGreaterThan(30)
    expect([...keys].filter((key) => !(key in GERMAN))).toEqual([])
    for (const key of keys) expect(formatCuisine([key])).toBe(GERMAN[key])
  })
})
