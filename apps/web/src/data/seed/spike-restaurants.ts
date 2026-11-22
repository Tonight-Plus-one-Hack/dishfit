// The ten restaurants of the menu pipeline spike (2026-11-21): real places from OpenStreetMap
// (© OpenStreetMap contributors, ODbL), menus read from each restaurant's own website.
// Four of them yielded dishes; the others are listed without a menu yet.
// No Google matching has run yet, so placeId stays null. Google ratings, photos and price levels are never stored.
export interface SpikeRestaurant {
  id: string
  osmId: string
  name: string
  kiez: 'Mitte' | 'Kreuzberg' | 'Friedrichshain' | 'Schöneberg' | 'Charlottenburg'
  address: string
  lat: number
  lng: number
  cuisine: string[]
  hours: string | null
  website: string
  /** Key of the spike output in ./spike/<key>.text.json. */
  spike: 'dean-david' | 'feinberg-s' | 'lia-s-kitchen' | 'viet-bowl' | null
  menuUrl: string | null
  /** Note shown on the restaurant when the dishes need context. */
  menuNote?: string
}

export const SPIKE_FETCHED_AT = '2026-11-21T17:40:00+01:00'

export const SPIKE_RESTAURANTS: SpikeRestaurant[] = [
  {
    id: 'beets-and-roots-mitte',
    osmId: 'node/1860395923',
    name: 'beets&roots',
    kiez: 'Mitte',
    address: 'Große Hamburger Straße 38, 10115 Berlin',
    lat: 52.52665,
    lng: 13.3985154,
    cuisine: ['Bowls'],
    hours: 'Mo-Fr 11:00-21:30; Sa,Su 12:30-21:30',
    website: 'https://www.beetsandroots.de/',
    spike: null,
    menuUrl: null,
  },
  {
    id: 'dean-and-david-alexanderplatz',
    osmId: 'node/3607091178',
    name: 'dean&david',
    kiez: 'Mitte',
    address: 'Karl-Liebknecht-Straße 7, 10178 Berlin',
    lat: 52.5207408,
    lng: 13.4055546,
    cuisine: ['Salate', 'Bowls'],
    hours: 'Mo-Sa 10:00-21:00; Su 11:00-20:00; PH off',
    website: 'https://www.deananddavid.de/',
    spike: 'dean-david',
    menuUrl: 'https://deananddavid.com/wp-content/uploads/2026/06/2026-04-dd-Master-Menuekarte-Website-A4_DE.pdf',
    menuNote: 'Die Kette nennt Preise nur pro Filiale.',
  },
  {
    id: 'house-of-greens',
    osmId: 'node/2532898468',
    name: 'House of Greens',
    kiez: 'Charlottenburg',
    address: 'Kantstraße 105, 10627 Berlin',
    lat: 52.5065821,
    lng: 13.3041915,
    cuisine: ['Salate', 'Säfte'],
    hours: 'Tu-Sa 09:00-16:00; Su 10:00-16:00; Mo-We off',
    website: 'https://www.houseofgreens.de',
    spike: null,
    menuUrl: null,
  },
  {
    id: 'the-hummus-club',
    osmId: 'node/291797118',
    name: 'The Hummus Club',
    kiez: 'Friedrichshain',
    address: 'Boxhagener Straße 29, 10245 Berlin',
    lat: 52.5124653,
    lng: 13.4588561,
    cuisine: ['Falafel', 'Libanesisch'],
    hours: null,
    website: 'http://thehummusclub.de',
    spike: null,
    menuUrl: null,
  },
  {
    id: 'feinbergs',
    osmId: 'node/4417669603',
    name: "Feinberg's",
    kiez: 'Schöneberg',
    address: 'Fuggerstraße 35, 10777 Berlin',
    lat: 52.4990828,
    lng: 13.3418056,
    cuisine: ['Israelisch', 'Mediterran'],
    hours: 'Tu-Su 12:00-23:00',
    website: 'https://www.feinbergs.de/',
    spike: 'feinberg-s',
    menuUrl: 'https://www.feinbergs.de/_files/ugd/634bb4_39578921d89d4ee58dc4c7796ede7864.pdf',
  },
  {
    id: 'seoulkitchen',
    osmId: 'node/3750153125',
    name: 'Seoulkitchen',
    kiez: 'Friedrichshain',
    address: 'Warschauer Straße 46, 10243 Berlin',
    lat: 52.5036438,
    lng: 13.4472167,
    cuisine: ['Koreanisch'],
    hours: 'Mo,We-Fr 12:00-24:00; Tu,Sa,Su 12:00-23:00',
    website: 'http://www.seoulkitchen.de/',
    spike: null,
    menuUrl: null,
  },
  {
    id: 'viet-bowl',
    osmId: 'node/1306551401',
    name: 'Viet Bowl',
    kiez: 'Mitte',
    address: 'Zimmerstraße 69, 10117 Berlin',
    lat: 52.5079771,
    lng: 13.3929256,
    cuisine: ['Vietnamesisch'],
    hours: 'Mo-Fr 11:30-18:00',
    website: 'https://www.vietbowl.de/',
    spike: 'viet-bowl',
    menuUrl: 'https://vietbowl.de/menu/kanzleramt/speisekarte/speisekarte.pdf',
    menuNote: 'Speisekarte der Filiale am Kanzleramt.',
  },
  {
    id: 'kame',
    osmId: 'node/775862481',
    name: 'Kame',
    kiez: 'Charlottenburg',
    address: 'Leibnizstraße 45, 10629 Berlin',
    lat: 52.503825,
    lng: 13.313729,
    cuisine: ['Japanisch'],
    hours: 'Mo-Su 11:00-18:00',
    website: 'https://kame.berlin/',
    spike: null,
    menuUrl: null,
  },
  {
    id: 'lias-kitchen',
    osmId: 'node/3036860655',
    name: "Lia's Kitchen",
    kiez: 'Kreuzberg',
    address: 'Urbanstraße 32, 10967 Berlin',
    lat: 52.491379,
    lng: 13.4139775,
    cuisine: ['Vegan', 'Burger'],
    hours: 'Mo-Su 12:00-22:00',
    website: 'https://www.liaskitchen.de',
    spike: 'lia-s-kitchen',
    menuUrl: 'https://www.liaskitchen.de/',
  },
  {
    id: 'fatoush',
    osmId: 'node/1244289113',
    name: 'Fatoush',
    kiez: 'Kreuzberg',
    address: 'Falckensteinstraße 7, 10997 Berlin',
    lat: 52.4991669,
    lng: 13.4427764,
    cuisine: ['Libanesisch'],
    hours: 'Mo-Th,Su 11:00-23:00; Fr-Sa 11:00-24:00',
    website: 'https://www.fatoush.de/',
    spike: null,
    menuUrl: null,
  },
]

/**
 * Official dean&david values per portion (Nährwertübersicht, Stand 09/2026; bowls with base and sauce).
 * kcal, protein, carbs, fat. These replace the AI estimate for the matching dishes.
 */
export const DEAN_DAVID_OFFICIAL = {
  url: 'https://deananddavid.com/wp-content/uploads/2026/09/2026-09-dd-Naehrwertuebersicht.pdf',
  values: {
    'Salmon Avocado Bowl': [806, 27.0, 69.0, 45.5],
    'California Poke Bowl': [1023, 22.9, 95.7, 60.4],
    'Japanese Beef Bowl': [1053, 27.1, 92.0, 63.2],
    'Crunchy Chicken Bowl': [785, 29.0, 74.6, 39.8],
    'Chicken Teriyaki Bowl': [680, 24.8, 94.3, 21.7],
    'Avocado Chicken Bowl': [571, 23.3, 58.7, 26.4],
    'Vegan Falafel Bowl': [696, 15.5, 75.4, 35.5],
    'Veggie Buddha Bowl': [883, 19.6, 90.2, 48.3],
    'Hot Kebab Wrap': [609, 22.9, 68.3, 25.0],
    'Hot Chicken Teriyaki Wrap': [544, 23.9, 70.0, 17.0],
  } as Record<string, [number, number, number, number]>,
}
