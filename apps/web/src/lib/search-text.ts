import type { Restaurant } from '../data/contract'
import { formatCuisine } from './cuisine'

function spellings(text: string) {
  const decomposed = text.toLowerCase().normalize('NFKD').replaceAll('ß', 'ss')
  return {
    plain: decomposed.replace(/\p{M}/gu, ''),
    german: decomposed.replace(/([aou])\u0308/g, '$1e').replace(/\p{M}/gu, ''),
  }
}

/** Every query word must match, allowing both plain vowels and German umlaut spellings. */
export function searchMatcher(query: string): (text: string) => boolean {
  const words = query.trim().split(/\s+/).map(spellings).filter((word) => word.plain)
  if (words.length === 0) return () => true

  return (text) => {
    const candidate = spellings(text)
    return words.every(({ plain, german }) => candidate.plain.includes(plain) || candidate.german.includes(german))
  }
}

export function restaurantSearchText(restaurant: Pick<Restaurant, 'name' | 'cuisine' | 'kiez'>): string {
  return `${restaurant.name} ${restaurant.cuisine.join(' ')} ${restaurant.kiez}`
}

export function matchingRestaurants<T extends Pick<Restaurant, 'name' | 'cuisine' | 'kiez'>>(restaurants: T[], query: string): T[] {
  const matches = searchMatcher(query)
  return restaurants.filter((r) => matches(restaurantRowSearchText(r)))
}

function restaurantRowSearchText(restaurant: Pick<Restaurant, 'name' | 'cuisine' | 'kiez'>): string {
  return `${restaurantSearchText(restaurant)} ${formatCuisine(restaurant.cuisine)}`
}
