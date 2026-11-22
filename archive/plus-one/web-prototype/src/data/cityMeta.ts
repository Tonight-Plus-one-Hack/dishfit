import type { City } from './types'

// Presentation data the API does not carry: artwork, copy and region tab per city.
export interface CityMeta {
  image: string
  blurb: string
  region: 'germany' | 'europe'
  countryName: string
}

export const CITY_META: Record<string, CityMeta> = {
  berlin: {
    image: 'berlin',
    blurb:
      'Kiez bars, beer gardens and clubs that open when other cities close. Most hangouts start in Kreuzberg, Neukölln and Prenzlauer Berg.',
    region: 'germany',
    countryName: 'Germany',
  },
  hamburg: {
    image: 'hamburg',
    blurb:
      'Harbour air, St. Pauli music bars and beach clubs on the Elbe.',
    region: 'germany',
    countryName: 'Germany',
  },
  munich: {
    image: 'munich',
    blurb:
      'Beer gardens under chestnut trees and late bars around Gärtnerplatz.',
    region: 'germany',
    countryName: 'Germany',
  },
  cologne: {
    image: 'cologne',
    blurb:
      'Kölsch in small glasses, Ehrenfeld clubs and the friendliest bar counters in Germany.',
    region: 'germany',
    countryName: 'Germany',
  },
  amsterdam: {
    image: 'amsterdam',
    blurb:
      'Brown cafés on the canals, jazz on Leidseplein and terraces until late.',
    region: 'europe',
    countryName: 'Netherlands',
  },
  barcelona: {
    image: 'barcelona',
    blurb:
      'Dinner at ten, vermouth bars in El Born and dancing after midnight.',
    region: 'europe',
    countryName: 'Spain',
  },
  lisbon: {
    image: 'lisbon',
    blurb:
      'Bairro Alto street bars, miradouros at sunset and jazz in the old town.',
    region: 'europe',
    countryName: 'Portugal',
  },
  prague: {
    image: 'prague',
    blurb:
      'Pivnice with long tables, jazz cellars and beer gardens above the river.',
    region: 'europe',
    countryName: 'Czechia',
  },
}

/** English display name. */
export function cityName(city: Pick<City, 'name' | 'nameEn'>): string {
  return city.nameEn ?? city.name
}
