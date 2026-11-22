// Small sculpted glyphs built from soft grey pills, used as card emblems on the landing page.
const PILLS = {
  group: [
    { cx: 14, cy: 10, rx: 4.2, ry: 6.5, r: 0 },
    { cx: 24, cy: 8, rx: 4.2, ry: 6.5, r: 0 },
    { cx: 34, cy: 10, rx: 4.2, ry: 6.5, r: 0 },
    { cx: 24, cy: 30, rx: 9, ry: 3.6, r: 0, outline: true },
  ],
  spot: [
    { cx: 24, cy: 12, rx: 7.5, ry: 7.5, r: 0 },
    { cx: 17, cy: 29, rx: 3.4, ry: 6.5, r: -28 },
    { cx: 31, cy: 29, rx: 3.4, ry: 6.5, r: 28 },
  ],
  night: [
    { cx: 15, cy: 20, rx: 3.6, ry: 9, r: 0 },
    { cx: 24, cy: 14, rx: 3.6, ry: 9, r: 0 },
    { cx: 33, cy: 20, rx: 3.6, ry: 9, r: 0 },
  ],
} as const

export type GlyphName = keyof typeof PILLS

export function Glyph({ name, size = 48 }: { name: GlyphName; size?: number }) {
  const id = `g-${name}`
  return (
    <svg width={size} height={size * 0.85} viewBox="0 0 48 40" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8b8e96" />
          <stop offset="0.55" stopColor="#5e626b" />
          <stop offset="1" stopColor="#3f4249" />
        </linearGradient>
      </defs>
      {PILLS[name].map((p, i) =>
        'outline' in p && p.outline ? (
          <ellipse key={i} cx={p.cx} cy={p.cy} rx={p.rx} ry={p.ry} fill="none" stroke="#60646c" strokeWidth="1.2" strokeDasharray="2.2 2" />
        ) : (
          <ellipse
            key={i}
            cx={p.cx}
            cy={p.cy}
            rx={p.rx}
            ry={p.ry}
            fill={`url(#${id})`}
            transform={p.r ? `rotate(${p.r} ${p.cx} ${p.cy})` : undefined}
          />
        ),
      )}
    </svg>
  )
}
