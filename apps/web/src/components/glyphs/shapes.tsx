// Our interface glyphs in the Cal AI manner: soft, rounded, filled shapes on a 24 px grid; inactive navigation
// uses the same shape as a 2 px rounded outline, colour follows currentColor. Drawn by us, no third-party assets.
// Macro, kcal, score and category icons come from the icon set in src/assets/icon-set (see ./Glyph).
// One component per name in GLYPHS, so a later icon set can replace entries without touching call sites.
// Render glyphs through <Glyph> from ./Glyph, which maps names to these components.
export interface GlyphProps {
  /** Solid shape (active, macro) or 2 px outline (inactive navigation). */
  filled: boolean
}

/** Details cut into a filled body (folds, hands, holes) read as the surface colour. */
const CUT = 'var(--glyph-cut, #fff)'

function Body({ d, filled }: { d: string; filled: boolean }) {
  return <path d={d} fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={filled ? 0 : 2} strokeLinejoin="round" />
}

function Detail({ d, filled, width = 2 }: { d: string; filled: boolean; width?: number }) {
  return <path d={d} fill="none" stroke={filled ? CUT : 'currentColor'} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
}

export function HomeGlyph({ filled }: GlyphProps) {
  return (
    <>
      <Body filled={filled} d="M3.8 10.4 11 4.3a1.6 1.6 0 0 1 2 0l7.2 6.1c.3.3.5.7.5 1.1v7.7a1.8 1.8 0 0 1-1.8 1.8H5.1a1.8 1.8 0 0 1-1.8-1.8v-7.7c0-.4.2-.8.5-1.1Z" />
      <Detail filled={filled} d="M9.8 20.6v-4.4a2.2 2.2 0 0 1 4.4 0v4.4" />
    </>
  )
}

export function MapGlyph({ filled }: GlyphProps) {
  return (
    <>
      <Body filled={filled} d="M3.2 6.5c0-.5.3-.9.7-1.1l4.3-1.9c.5-.2 1-.2 1.5 0l4.6 2c.5.2 1 .2 1.5 0l3.6-1.6c.8-.3 1.6.2 1.6 1.1v11.5c0 .5-.3.9-.7 1.1l-4.3 1.9c-.5.2-1 .2-1.5 0l-4.6-2c-.5-.2-1-.2-1.5 0l-3.6 1.6c-.8.3-1.6-.2-1.6-1.1V6.5Z" />
      <Detail filled={filled} d="M9 3.6v13.6M15 6.8v13.6" width={1.8} />
    </>
  )
}

export function SearchGlyph({ filled }: GlyphProps) {
  return (
    <>
      <circle cx="10.8" cy="10.8" r="6.6" fill="none" stroke="currentColor" strokeWidth={filled ? 3 : 2} />
      <path d="m16 16 4.4 4.4" fill="none" stroke="currentColor" strokeWidth={filled ? 3 : 2} strokeLinecap="round" />
    </>
  )
}

export function TodayGlyph({ filled }: GlyphProps) {
  return (
    <>
      <Body filled={filled} d="M3.6 8a3 3 0 0 1 3-3h10.8a3 3 0 0 1 3 3v10.4a3 3 0 0 1-3 3H6.6a3 3 0 0 1-3-3V8Z" />
      <path d="M8 2.8v4M16 2.8v4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <Detail filled={filled} d="M3.6 10.2h16.8M8.5 14.6h.01M12 14.6h.01M15.5 14.6h.01" />
    </>
  )
}

export function ProfileGlyph({ filled }: GlyphProps) {
  return (
    <>
      <Body filled={filled} d="M12 3.2a4.3 4.3 0 1 1 0 8.6 4.3 4.3 0 0 1 0-8.6Z" />
      <Body filled={filled} d="M4.4 19.4c.9-3.6 3.9-5.6 7.6-5.6s6.7 2 7.6 5.6c.2.8-.4 1.6-1.3 1.6H5.7c-.9 0-1.5-.8-1.3-1.6Z" />
    </>
  )
}

export function ClockGlyph({ filled }: GlyphProps) {
  return (
    <>
      <Body filled={filled} d="M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Z" />
      <Detail filled={filled} d="M12 7.6V12l3 1.9" />
    </>
  )
}

export function PinGlyph({ filled }: GlyphProps) {
  return (
    <>
      <Body filled={filled} d="M12 2.4a7.3 7.3 0 0 1 7.3 7.3c0 4.6-4.6 9.3-6.4 11a1.3 1.3 0 0 1-1.8 0c-1.8-1.7-6.4-6.4-6.4-11A7.3 7.3 0 0 1 12 2.4Z" />
      {filled ? <circle cx="12" cy="9.7" r="2.6" fill={CUT} /> : <circle cx="12" cy="9.7" r="2.4" fill="none" stroke="currentColor" strokeWidth={2} />}
    </>
  )
}

export function EuroGlyph({ filled }: GlyphProps) {
  return (
    <>
      <Body filled={filled} d="M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Z" />
      <Detail filled={filled} d="M15.2 8.6a4.3 4.3 0 1 0 0 6.8M7.6 11h5.6M7.6 13.4h5" width={1.8} />
    </>
  )
}

export function ShareGlyph({ filled }: GlyphProps) {
  return (
    <>
      <Body filled={filled} d="M5 11.6a2.6 2.6 0 0 1 2.6-2.6h8.8a2.6 2.6 0 0 1 2.6 2.6v6.8a2.6 2.6 0 0 1-2.6 2.6H7.6A2.6 2.6 0 0 1 5 18.4v-6.8Z" />
      <path d="M12 14.6V3.4m0 0L8.6 6.8M12 3.4l3.4 3.4" fill="none" stroke={filled ? 'var(--glyph-stroke, currentColor)' : 'currentColor'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {filled && <path d="M12 14.6V9.2" fill="none" stroke={CUT} strokeWidth={2} strokeLinecap="round" />}
    </>
  )
}

export function SavedGlyph({ filled }: GlyphProps) {
  return <Body filled={filled} d="M12 20.4s-7.6-4.6-7.6-10.4A4.4 4.4 0 0 1 12 7.1a4.4 4.4 0 0 1 7.6 2.9c0 5.8-7.6 10.4-7.6 10.4Z" />
}

export function RouteGlyph({ filled }: GlyphProps) {
  return (
    <>
      <path d="M6.2 18.4h9.4a3.3 3.3 0 0 0 0-6.6H8.4a3.3 3.3 0 0 1 0-6.6h9.2" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <circle cx="5.2" cy="18.4" r="2.2" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={filled ? 0 : 2} />
      <circle cx="18.8" cy="5.2" r="2.2" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={filled ? 0 : 2} />
    </>
  )
}

export function SparkGlyph({ filled }: GlyphProps) {
  return (
    <>
      <Body filled={filled} d="M11 3.6c.3-.8 1.5-.8 1.8 0l1.3 3.5c.3.9 1 1.6 1.9 1.9l3.5 1.3c.8.3.8 1.5 0 1.8l-3.5 1.3c-.9.3-1.6 1-1.9 1.9l-1.3 3.5c-.3.8-1.5.8-1.8 0l-1.3-3.5c-.3-.9-1-1.6-1.9-1.9l-3.5-1.3c-.8-.3-.8-1.5 0-1.8l3.5-1.3c.9-.3 1.6-1 1.9-1.9L11 3.6Z" />
      <Body filled={filled} d="M18.6 2.6c.1-.3.6-.3.7 0l.4 1.1c.1.3.3.5.6.6l1.1.4c.3.1.3.6 0 .7l-1.1.4c-.3.1-.5.3-.6.6l-.4 1.1c-.1.3-.6.3-.7 0l-.4-1.1c-.1-.3-.3-.5-.6-.6l-1.1-.4c-.3-.1-.3-.6 0-.7l1.1-.4c.3-.1.5-.3.6-.6l.4-1.1Z" />
    </>
  )
}

export function ForkGlyph({ filled }: GlyphProps) {
  return (
    <>
      <path d="M8 3v6.2a2.2 2.2 0 0 1-1 1.8V21M8 3v5.2M5.6 3v5.6a2.4 2.4 0 0 0 1.4 2.2M10.4 3v5.6A2.4 2.4 0 0 1 9 10.8" fill="none" stroke="currentColor" strokeWidth={filled ? 2.2 : 2} strokeLinecap="round" strokeLinejoin="round" />
      <Body filled={filled} d="M17.2 3.2c-2.1 1-3.6 3.6-3.6 6.8v3.1c0 .6.5 1.1 1.1 1.1h2.5V3.2Z" />
      <path d="M17.2 14.2V21" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" />
    </>
  )
}

export function LocateGlyph({ filled }: GlyphProps) {
  return (
    <>
      <circle cx="12" cy="12" r="6.4" fill="none" stroke="currentColor" strokeWidth={2} />
      <circle cx="12" cy="12" r={filled ? 3 : 2.4} fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={filled ? 0 : 2} />
      <path d="M12 2.6v2.8M12 18.6v2.8M2.6 12h2.8M18.6 12h2.8" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </>
  )
}
