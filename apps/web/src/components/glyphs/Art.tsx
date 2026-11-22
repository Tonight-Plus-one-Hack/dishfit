// Larger artwork from the icon set (style A) as WebP: 3D category icons, the score badge, empty states and
// onboarding illustrations. One entry per name, so another set can replace the files without touching call sites.
import './glyph.css'

const ART = import.meta.glob<string>('../../assets/icon-set/art/*.webp', { query: '?url', import: 'default', eager: true })

export type ArtName =
  | 'cat-bowl'
  | 'cat-salad'
  | 'cat-burger'
  | 'cat-cafe'
  | 'cat-asian'
  | 'cat-vegan'
  | 'cat-bakery'
  | 'cat-pizza'
  | 'cat-poke'
  | 'cat-curry'
  | 'cat-wrap'
  | 'cat-fish'
  | 'cat-grill'
  | 'score-badge'
  | 'empty-no-results'
  | 'empty-no-saved'
  | 'empty-no-menu'
  | 'onb-lose-weight'
  | 'onb-build-muscle'
  | 'onb-eat-balanced'
  | 'onb-location'

/** Decorative by default: the text next to it carries the meaning. */
export function Art({ name, size, className, alt = '' }: { name: ArtName; size: number; className?: string; alt?: string }) {
  const src = ART[`../../assets/icon-set/art/${name}.webp`]
  if (!src) return null
  return <img src={src} width={size} height={size} alt={alt} aria-hidden={alt ? undefined : true} loading="lazy" decoding="async" className={`art ${className ?? ''}`} />
}
