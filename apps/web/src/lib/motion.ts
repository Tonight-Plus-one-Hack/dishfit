// Script-driven motion timing. CSS timing and keyframes live in src/styles/motion.css; keep both in step.
export const MOTION = {
  /** Delay between letters in a headline reveal. */
  letterStaggerMs: 25,
  /** Cap on the total stagger spread, so long lines still settle quickly. */
  letterSpreadMaxMs: 600,
  /** How long each rotating word stays before the next one rises in. */
  rotateEveryMs: 2200,
  /** Minimum time the join confirmation shows its checklist. */
  joinPauseMs: 1400,
  /** Map camera move to a selected pin. */
  mapEaseMs: 600,
  /** How long "Link copied" stays before reverting. */
  copiedMs: 1800,
} as const

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
