import type { IconName } from '../components/Icon'

/** Shown after joining and on a joined hangout. */
export const SAFETY_HINTS: Array<{ icon: IconName; title: string; body: string }> = [
  { icon: 'pin', title: 'Meet inside the venue', body: 'Find the group at the spot itself, not on a corner outside.' },
  { icon: 'chat', title: 'Tell a friend', body: 'Share the plan with someone you trust before you head out.' },
  { icon: 'door', title: 'Leave whenever you want', body: 'No explanation needed. Say bye and head out, the group carries on.' },
  { icon: 'alert', title: 'Report anything off', body: 'Use the report link on this page. Nobody sees who reported, and reported messages and plans are hidden automatically.' },
]
