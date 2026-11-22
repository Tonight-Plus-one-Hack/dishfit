// Shared pieces of the community screens: the nickname avatar and the badge medal.
import type { BadgeKey } from '../../data/api'
import { Icon } from '../../components/Icon'
import { BADGE_ART } from './community'

const AVATAR_TONES = ['#ef5b4c', '#f5a524', '#3d9df6', '#4b5fe0', '#1f9d6b', '#c05bd6']

/** Round initials avatar; the colour is stable per nickname. */
export function Avatar({ name, size = 40, me = false }: { name: string; size?: number; me?: boolean }) {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  const initials = name
    .split(' ')
    .filter((w) => /\p{L}/u.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
  return (
    <span
      className={`cm-avatar ${me ? 'cm-avatar--me' : ''}`}
      style={{ width: size, height: size, fontSize: size * 0.38, background: AVATAR_TONES[h % AVATAR_TONES.length] }}
      aria-hidden="true"
    >
      {initials || '?'}
    </span>
  )
}

export function BadgeMedal({ badge, locked = false, size = 56 }: { badge: BadgeKey; locked?: boolean; size?: number }) {
  const art = BADGE_ART[badge]
  return (
    <span
      className={`cm-medal ${locked ? 'cm-medal--locked' : ''}`}
      style={{ width: size, height: size, ['--medal' as string]: art.tone }}
      aria-hidden="true"
    >
      <Icon name={art.icon} size={Math.round(size * 0.42)} strokeWidth={2} />
    </span>
  )
}
