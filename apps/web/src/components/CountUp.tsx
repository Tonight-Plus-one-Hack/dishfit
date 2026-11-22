// A number that counts up to its value in step with the ring drawing beside it (Cal AI), and from the old to the new value when it
// changes. Reduced motion shows the value at once.
import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from '../lib/motion'

/** Same duration and curve as the ring draw (rings.css: ring-draw, 900 ms, cubic-bezier(0.22, 1, 0.36, 1)). */
const DURATION_MS = 900

/** cubic-bezier(0.22, 1, 0.36, 1) is close to an ease-out quint. */
const easeOut = (t: number) => 1 - (1 - t) ** 5

function useCountUp(value: number): number {
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? value : 0))
  const from = useRef(0)
  useEffect(() => {
    const start = from.current
    from.current = value
    if (prefersReducedMotion() || start === value) {
      setShown(value)
      return
    }
    let frame = 0
    const t0 = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / DURATION_MS)
      setShown(Math.round(start + (value - start) * easeOut(t)))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value])
  return shown
}

export function CountUp({ value, format = String }: { value: number; format?: (n: number) => string }) {
  return <>{format(useCountUp(value))}</>
}
