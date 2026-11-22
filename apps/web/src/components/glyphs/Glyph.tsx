// <Glyph name="…" />: the one entry point for every icon. Two sources, both swappable by name:
// - the icon set (style A, picked by the captain): macro, kcal, score and category icons as 2-tone SVG
//   from src/assets/icon-set/svg, inlined so they stay crisp at 16 to 24 px;
// - our interface glyphs (./shapes.tsx) for navigation and actions, following currentColor.
// Larger artwork from the same set (WebP) renders through <Art> in ./Art.
import type { CSSProperties, ReactNode } from 'react'
import './glyph.css'
import {
  ClockGlyph,
  EuroGlyph,
  ForkGlyph,
  HomeGlyph,
  LocateGlyph,
  MapGlyph,
  PinGlyph,
  ProfileGlyph,
  RouteGlyph,
  SavedGlyph,
  SearchGlyph,
  ShareGlyph,
  SparkGlyph,
  TodayGlyph,
  type GlyphProps,
} from './shapes'

/** One component per name; swap entries to change the set. */
const GLYPHS = {
  home: HomeGlyph,
  map: MapGlyph,
  search: SearchGlyph,
  today: TodayGlyph,
  profile: ProfileGlyph,
  clock: ClockGlyph,
  pin: PinGlyph,
  euro: EuroGlyph,
  share: ShareGlyph,
  saved: SavedGlyph,
  route: RouteGlyph,
  spark: SparkGlyph,
  fork: ForkGlyph,
  locate: LocateGlyph,
} satisfies Record<string, (props: GlyphProps) => ReactNode>

/** Icon-set SVGs by file name, inlined as markup. */
const SET = import.meta.glob<string>('../../assets/icon-set/svg/*.svg', { query: '?raw', import: 'default', eager: true })

/** Glyph names drawn by the icon set, and their file. */
const FROM_SET = {
  flame: 'kcal',
  protein: 'protein',
  carbs: 'carbs',
  fat: 'fat',
  score: 'score-badge',
  'cat-bowl': 'cat-bowl',
  'cat-salad': 'cat-salad',
  'cat-burger': 'cat-burger',
  'cat-cafe': 'cat-cafe',
  'cat-asian': 'cat-asian',
  'cat-vegan': 'cat-vegan',
  'cat-bakery': 'cat-bakery',
  'cat-pizza': 'cat-pizza',
} as const

export type GlyphName = keyof typeof GLYPHS | keyof typeof FROM_SET

function setSvg(name: GlyphName): string | undefined {
  const file = (FROM_SET as Record<string, string>)[name]
  if (!file) return undefined
  // The wrapper carries the accessible name; the file's own label stays out of the tree.
  return SET[`../../assets/icon-set/svg/${file}.svg`]?.replace(/ role="img" aria-label="[^"]*"/, ' aria-hidden="true" focusable="false"')
}

export function Glyph({
  name,
  size = 20,
  filled = true,
  className,
  label,
  style,
}: {
  name: GlyphName
  size?: number
  filled?: boolean
  className?: string
  /** Accessible name; omit for decorative glyphs next to text. */
  label?: string
  style?: CSSProperties
}) {
  const svg = setSvg(name)
  if (svg) {
    return (
      <span
        className={`glyph glyph--set glyph--${name} ${className ?? ''}`}
        style={{ width: size, height: size, ...style }}
        role={label ? 'img' : undefined}
        aria-label={label}
        aria-hidden={label ? undefined : true}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    )
  }
  const Shape = GLYPHS[name as keyof typeof GLYPHS]
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`glyph glyph--${name} ${className ?? ''}`}
      style={style}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <Shape filled={filled} />
    </svg>
  )
}
