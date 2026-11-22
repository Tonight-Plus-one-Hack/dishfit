import { useEffect, useState } from 'react'
import { prefersReducedMotion } from '../../lib/motion'

/** Counts from 0 to `to` with an ease-out over `ms`; reduced motion shows the final value at once. */
export function useCountUp(to: number, ms: number): number {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? to : 0))
  useEffect(() => {
    if (prefersReducedMotion()) return
    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms)
      setValue(Math.round(to * (1 - (1 - t) ** 3)))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [to, ms])
  return value
}
