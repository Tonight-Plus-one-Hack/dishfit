import type { Hangout, HangoutLanguage, Spot, SpotKind, Vibe } from '../data/types'

export const VIBE_LABEL: Record<Vibe, string> = {
  chill: 'Chill drinks',
  bar: 'Bar night',
  club: 'Dancing',
  culture: 'Music and culture',
}

export const KIND_LABEL: Record<SpotKind, string> = {
  bar: 'Bar',
  pub: 'Pub',
  nightclub: 'Club',
  biergarten: 'Beer garden',
  cafe: 'Café',
  venue: 'Venue',
}

export const LANGUAGE_LABEL: Record<HangoutLanguage, string> = {
  de: 'German',
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  it: 'Italian',
  tr: 'Turkish',
  any: 'Any language',
}

/** The host's headline when there is one (proposed field), otherwise a plain description of the plan. */
export function hangoutTitle(hangout: Pick<Hangout, 'title' | 'vibe'>, spotName: string): string {
  return hangout.title ?? `${VIBE_LABEL[hangout.vibe]} at ${spotName}`
}

/** Neighborhood when mapped, otherwise the street. */
export function spotPlace(spot: Pick<Spot, 'address'> & { neighborhood?: string | null }): string {
  return spot.neighborhood ?? spot.address?.replace(/\s+\d+[a-zA-Z-]*$/, '') ?? ''
}
