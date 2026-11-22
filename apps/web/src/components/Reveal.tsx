import { createElement, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { MOTION } from '../lib/motion'

function useInView<T extends Element>(once = true) {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(() => typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          if (once) io.disconnect()
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.01 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [once])
  return [ref, inView] as const
}

type Tag = 'h1' | 'h2' | 'h3' | 'p' | 'span' | 'div'

/**
 * Letter-by-letter rise for display type; timing comes from src/lib/motion.ts and src/styles/motion.css.
 * Reduced motion shows the final state immediately.
 */
export function RevealText({
  as = 'span',
  text,
  className,
  delay = 0,
  id,
}: {
  as?: Tag
  text: string
  className?: string
  delay?: number
  id?: string
}) {
  const [ref, inView] = useInView<HTMLElement>()
  const letters = text.replace(/\s+/g, '').length
  const step = Math.min(MOTION.letterStaggerMs, MOTION.letterSpreadMaxMs / Math.max(letters, 1))
  let i = 0
  const words = text.split(/(\s+)/)
  const style = { '--step': `${step}ms`, '--base': `${delay}ms` } as CSSProperties
  return createElement(
    as,
    { ref, className: `${className ?? ''} ${inView ? 'is-in' : ''}`.trim(), style, id },
    <span className="sr-only">{text}</span>,
    <span aria-hidden="true">
      {words.map((word, w) =>
        /^\s+$/.test(word) ? (
          ' '
        ) : (
          <span className="rv-word" key={w}>
            {Array.from(word).map((ch, c) => (
              <span className="rv-char" key={c} style={{ '--i': i++ } as CSSProperties}>
                {ch}
              </span>
            ))}
          </span>
        ),
      )}
    </span>,
  )
}

export function FadeIn({
  as = 'div',
  delay = 0,
  className,
  children,
  style,
}: {
  as?: Tag | 'section' | 'li' | 'article'
  delay?: number
  className?: string
  children: ReactNode
  style?: CSSProperties
}) {
  const [ref, inView] = useInView<HTMLElement>()
  return createElement(
    as,
    {
      ref,
      className: `fade ${inView ? 'is-in' : ''} ${className ?? ''}`.trim(),
      style: { ...style, '--delay': `${delay}ms` } as CSSProperties,
    },
    children,
  )
}
