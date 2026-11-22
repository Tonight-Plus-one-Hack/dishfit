// Hero and Berlin/Hamburg artwork come from the brand kit (brand/assets); the rest is original generated artwork
// in the same blue-hour style. Saturated blue-violet stays in imagery only.
import amsterdam from './img/city-amsterdam.webp'
import bar from './img/spot-bar.webp'
import barcelona from './img/city-barcelona.webp'
import berlin from './img/city-berlin.webp'
import biergarten from './img/spot-biergarten.webp'
import cologne from './img/city-cologne.webp'
import cta from './img/cta.webp'
import hamburg from './img/city-hamburg.webp'
import heroSmall from './img/brand-hero-sm.webp'
import hero from './img/brand-hero.webp'
import lisbon from './img/city-lisbon.webp'
import munich from './img/city-munich.webp'
import nightclub from './img/spot-nightclub.webp'
import prague from './img/city-prague.webp'
import pub from './img/spot-pub.webp'
import type { SpotKind } from '../data/types'

export const CITY_IMAGES: Record<string, string> = {
  amsterdam,
  barcelona,
  berlin,
  cologne,
  hamburg,
  lisbon,
  munich,
  prague,
}

export const KIND_IMAGES: Record<SpotKind, string> = {
  bar,
  pub,
  nightclub,
  biergarten,
  cafe: bar,
  venue: nightclub,
}

export const HERO_IMAGE = { src: hero, small: heroSmall }
export const CTA_IMAGE = cta

export function cityImage(key: string): string {
  return CITY_IMAGES[key] ?? CTA_IMAGE
}
