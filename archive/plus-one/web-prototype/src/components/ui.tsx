import type { CSSProperties } from 'react'
import { KIND_IMAGES } from '../assets/images'
import { MIN_GROUP_SIZE, type Spot } from '../data/types'
import './ui.css'

function hash(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Neutral avatar tints: the iridescent hues stay soft so faces of data never read as brand color. */
const TINTS = [
  ['#e4e7fd', '#c9cffb'],
  ['#ece9fe', '#d6d0fe'],
  ['#e6eefc', '#c6d6f6'],
  ['#f0ecf8', '#ddd3ef'],
  ['#e9ebef', '#d3d6dc'],
]

export function Avatar({ nickname, size = 28, you = false }: { nickname: string; size?: number; you?: boolean }) {
  const [a, b] = TINTS[hash(nickname) % TINTS.length]
  const style = {
    width: size,
    height: size,
    fontSize: Math.round(size * 0.4),
    background: you ? 'var(--cta)' : `linear-gradient(140deg, ${a}, ${b})`,
    color: you ? 'var(--cta-ink)' : 'var(--ink)',
  } as CSSProperties
  return (
    <span className="avatar" style={style} aria-hidden="true">
      {(nickname || '?').slice(0, 1).toUpperCase()}
    </span>
  )
}

/** Overlapping initials for "N going"; the viewer, when a member, shows first in ink. */
export function AvatarStack({
  people,
  total,
  max = 4,
  size = 24,
  you,
  decorative = false,
}: {
  people: Array<{ nickname: string }>
  total: number
  max?: number
  size?: number
  you?: string | null
  /** Set when "N going" is already written next to the stack, so screen readers hear it once. */
  decorative?: boolean
}) {
  const others = you ? people.filter((p, i) => !(p.nickname === you && i === people.length - 1)) : people
  const shown = others.slice(0, you ? max - 1 : max)
  const rest = total - shown.length - (you ? 1 : 0)
  return (
    <span className="avatar-stack" {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': `${total} going` })}>
      {you && <Avatar nickname={you} size={size} you />}
      {shown.map((p, i) => (
        <Avatar key={`${p.nickname}-${i}`} nickname={p.nickname} size={size} />
      ))}
      {rest > 0 && (
        <span className="avatar avatar--more" style={{ width: size, height: size }} aria-hidden="true">
          +{rest}
        </span>
      )}
    </span>
  )
}

export function SeatsTag({
  memberCount,
  spotsLeft,
  role = null,
}: {
  memberCount: number
  spotsLeft: number
  /** The viewer's membership, if any. */
  role?: 'host' | 'member' | null
}) {
  if (role === 'host') return <span className="tag tag--dark">Hosting</span>
  if (role === 'member') return <span className="tag tag--dark">You’re in</span>
  if (spotsLeft === 0) return <span className="tag tag--outline">Full</span>
  if (memberCount < MIN_GROUP_SIZE) return <span className="tag">{MIN_GROUP_SIZE - memberCount} more to happen</span>
  return (
    <span className="tag">
      {spotsLeft} {spotsLeft === 1 ? 'seat' : 'seats'} left
    </span>
  )
}

/** Kind artwork, shifted per spot so neighbouring cards never look identical. */
export function SpotImage({ spot, className }: { spot: Pick<Spot, 'id' | 'kind'>; className?: string }) {
  const h = hash(spot.id)
  const style = {
    objectPosition: `${20 + (h % 61)}% ${25 + ((h >>> 8) % 51)}%`,
    filter: `hue-rotate(${((h >>> 16) % 31) - 15}deg) saturate(${0.9 + ((h >>> 4) % 25) / 100})`,
    transform: `scale(${1.08 + ((h >>> 12) % 30) / 100})`,
  } as CSSProperties
  return (
    <span className={`spot-image ${className ?? ''}`}>
      <img src={KIND_IMAGES[spot.kind]} alt="" loading="lazy" decoding="async" style={style} />
    </span>
  )
}

export function Meter({ going, max, min }: { going: number; max: number; min: number }) {
  return (
    <div className="meter" role="img" aria-label={`${going} of ${max} seats taken`}>
      {Array.from({ length: max }).map((_, i) => (
        <span key={i} className={`meter__seat ${i < going ? 'is-taken' : ''} ${i === min - 1 ? 'is-min' : ''}`} />
      ))}
    </div>
  )
}
