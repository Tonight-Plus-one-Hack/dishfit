import type { City } from './types'

// Contract City rows. Slugs and time zones match data/spots/cities.json on branch fm/t1-spots.
export const CITIES: City[] = [
  { slug: 'berlin', name: 'Berlin', nameEn: null, countryCode: 'DE', timezone: 'Europe/Berlin', sortOrder: 1, lat: 52.52, lng: 13.405 },
  { slug: 'hamburg', name: 'Hamburg', nameEn: null, countryCode: 'DE', timezone: 'Europe/Berlin', sortOrder: 2, lat: 53.5507, lng: 9.993 },
  { slug: 'munich', name: 'München', nameEn: 'Munich', countryCode: 'DE', timezone: 'Europe/Berlin', sortOrder: 3, lat: 48.1374, lng: 11.5755 },
  { slug: 'cologne', name: 'Köln', nameEn: 'Cologne', countryCode: 'DE', timezone: 'Europe/Berlin', sortOrder: 4, lat: 50.9384, lng: 6.9603 },
  { slug: 'amsterdam', name: 'Amsterdam', nameEn: null, countryCode: 'NL', timezone: 'Europe/Amsterdam', sortOrder: 5, lat: 52.3731, lng: 4.8926 },
  { slug: 'barcelona', name: 'Barcelona', nameEn: null, countryCode: 'ES', timezone: 'Europe/Madrid', sortOrder: 6, lat: 41.3874, lng: 2.1686 },
  { slug: 'lisbon', name: 'Lisboa', nameEn: 'Lisbon', countryCode: 'PT', timezone: 'Europe/Lisbon', sortOrder: 7, lat: 38.7223, lng: -9.1393 },
  { slug: 'prague', name: 'Praha', nameEn: 'Prague', countryCode: 'CZ', timezone: 'Europe/Prague', sortOrder: 8, lat: 50.0875, lng: 14.4214 },
]
