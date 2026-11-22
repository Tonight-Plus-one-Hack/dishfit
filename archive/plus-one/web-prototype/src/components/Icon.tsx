// Stroke icon set on a 24 × 24 grid with 1.5 stroke. city, clock, users and pin follow brand/assets/icons.svg.
const PATHS = {
  arrowLeft: 'M19 12H5m6-6-6 6 6 6',
  arrowRight: 'M5 12h14m-6-6 6 6-6 6',
  arrowUpRight: 'M7 17 17 7M8 7h9v9',
  chevronRight: 'm9 6 6 6-6 6',
  close: 'M6 6l12 12M18 6 6 18',
  share: 'M12 15V3m0 0L8 7m4-4 4 4M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8',
  link: 'M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1',
  heart:
    'M12 20s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 10c0 5.65-7 10-7 10Z',
  pin: 'M19 10c0 5.25-7 10.5-7 10.5S5 15.25 5 10a7 7 0 1 1 14 0ZM10 10a2 2 0 1 0 4 0 2 2 0 1 0-4 0',
  clock: 'M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0M12 8v4l3 2',
  city: 'M2 21h20M4 21V10h7v11m0-16h7v16m0-8h4v8M5 14h1m6-5h1m-1 5h1',
  users: 'M7 9a3 3 0 1 0 6 0 3 3 0 1 0-6 0M4 19v-1a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v1m2-12a3 3 0 0 1 0 5m3 7v-1a4 4 0 0 0-2-3.5',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  shield: 'M12 21s7-3.5 7-9.5V5.5L12 3 5 5.5v6c0 6 7 9.5 7 9.5Z',
  shieldCheck: 'M12 21s7-3.5 7-9.5V5.5L12 3 5 5.5v6c0 6 7 9.5 7 9.5Zm-3-9.5 2 2 4-4',
  map: 'M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5L9 4Zm0 0v13.5m6-11V20',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-9-9h18M12 3c2.5 2.4 3.75 5.4 3.75 9S14.5 18.6 12 21c-2.5-2.4-3.75-5.4-3.75-9S9.5 5.4 12 3Z',
  spark: 'M12 3v4m0 10v4M3 12h4m10 0h4M6.3 6.3l2.5 2.5m6.4 6.4 2.5 2.5m0-11.4-2.5 2.5m-6.4 6.4-2.5 2.5',
  plus: 'M12 5v14M5 12h14',
  door: 'M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l4-4-4-4m4 4H4',
  chat: 'M20 12a8 8 0 0 1-11.6 7.15L4 20l.9-4.1A8 8 0 1 1 20 12Z',
  menu: 'M4 8h16M4 16h16',
  ticket: 'M4 8a2 2 0 0 0 0 4v0a2 2 0 0 1 0 4v2h16v-2a2 2 0 0 1 0-4 2 2 0 0 1 0-4V6H4v2Zm10-2v12',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  flag: 'M5 21V4m0 0h12l-2.5 4L17 12H5',
  send: 'M5 12h13m-5-6 6 6-6 6',
  alert: 'M12 9v4m0 4h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
} as const

export type IconName = keyof typeof PATHS

export function Icon({
  name,
  size = 16,
  filled = false,
  className,
  strokeWidth = 1.5,
}: {
  name: IconName
  size?: number
  filled?: boolean
  className?: string
  strokeWidth?: number
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={PATHS[name]} />
    </svg>
  )
}

export function WhatsAppGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12.04 2a9.9 9.9 0 0 0-8.5 14.98L2 22l5.17-1.5A9.9 9.9 0 1 0 12.04 2Zm0 18.1a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.07.9.92-3-.2-.31a8.2 8.2 0 1 1 6.83 3.74Zm4.5-6.13c-.25-.12-1.46-.72-1.69-.8-.23-.09-.39-.13-.55.12-.17.24-.64.8-.78.96-.15.17-.29.19-.53.06a6.7 6.7 0 0 1-3.36-2.93c-.25-.44.25-.4.72-1.34.08-.16.04-.3-.02-.43-.06-.12-.55-1.33-.76-1.82-.2-.48-.4-.41-.55-.42h-.47a.9.9 0 0 0-.65.3 2.7 2.7 0 0 0-.85 2.02c0 1.19.87 2.34.99 2.5.12.16 1.7 2.6 4.13 3.65 1.54.66 2.14.72 2.9.6.47-.07 1.46-.6 1.66-1.17.2-.58.2-1.07.15-1.17-.06-.11-.22-.17-.47-.29Z" />
    </svg>
  )
}
