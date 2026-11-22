// Draggable bottom sheet over the map: collapsed it shows only its header, expanded the ranked list.
// Drag starts on the header only, so the list scrolls normally. Springs come from the motion system.
import { useTranslation } from '../../i18n'
import { animate, motion, useDragControls, useMotionValue, useReducedMotion, type PanInfo } from 'framer-motion'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import { s, spring } from '../../motion/tokens'

/** A duration-based spring from the motion tokens, typed for animate() on a single value. */
function springTo(name: 'appear' | 'state', delayMs = 0) {
  const token = spring[name]
  return { type: 'spring' as const, duration: token.duration, bounce: token.bounce, delay: s(delayMs) }
}

export function RankSheet({
  expanded,
  onExpandedChange,
  header,
  children,
  onHeaderHeight,
}: {
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  header: ReactNode
  children: ReactNode
  /** Reports the collapsed height, so the map and carousel can keep clear of it. */
  onHeaderHeight: (height: number) => void
}) {
  const t = useTranslation()
  const sheetRef = useRef<HTMLDivElement>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ sheet: 0, head: 0 })
  const y = useMotionValue(10000)
  const controls = useDragControls()
  const reduce = useReducedMotion()
  const entered = useRef(false)
  const dragged = useRef(false)
  const collapsedY = Math.max(0, size.sheet - size.head)

  useLayoutEffect(() => {
    const sheet = sheetRef.current
    const head = headRef.current
    if (!sheet || !head) return
    const measure = () => setSize({ sheet: sheet.offsetHeight, head: head.offsetHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(sheet)
    ro.observe(head)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    onHeaderHeight(size.head)
  }, [size.head, onHeaderHeight])

  // Move to the current snap point: rise in on first measure, spring between snaps afterwards.
  useEffect(() => {
    if (size.sheet === 0) return
    const target = expanded ? 0 : collapsedY
    if (!entered.current) {
      entered.current = true
      if (reduce) {
        y.set(target)
        return
      }
      y.set(size.sheet)
      const run = animate(y, target, springTo('appear', 120))
      return () => run.stop()
    }
    if (reduce) {
      y.set(target)
      return
    }
    const run = animate(y, target, springTo('state'))
    return () => run.stop()
  }, [expanded, collapsedY, size.sheet, reduce, y])

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const current = y.get()
    const flick = Math.abs(info.velocity.y) > 400
    const open = flick ? info.velocity.y < 0 : current < collapsedY / 2
    if (open === expanded) {
      animate(y, open ? 0 : collapsedY, reduce ? { duration: 0 } : springTo('state'))
    } else {
      onExpandedChange(open)
    }
  }

  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExpandedChange(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded, onExpandedChange])

  return (
    <motion.section
      ref={sheetRef}
      className={`rank-sheet ${expanded ? 'is-expanded' : ''}`}
      style={{ y }}
      drag="y"
      dragControls={controls}
      dragListener={false}
      dragConstraints={{ top: 0, bottom: collapsedY }}
      dragElastic={0.06}
      dragMomentum={false}
      onDragStart={() => {
        dragged.current = true
      }}
      onDragEnd={onDragEnd}
      aria-label={t('rankings')}
    >
      <div
        ref={headRef}
        className="rank-sheet__head"
        onPointerDown={(e) => {
          dragged.current = false
          controls.start(e)
        }}
        onClick={(e) => {
          if (dragged.current) return
          if ((e.target as HTMLElement).closest('a')) return
          onExpandedChange(!expanded)
        }}
      >
        <span className="rank-sheet__handle" aria-hidden="true" />
        <div className="rank-sheet__head-row">
          <div className="rank-sheet__title">{header}</div>
          <button
            type="button"
            className="rank-sheet__toggle"
            aria-expanded={expanded}
            aria-label={expanded ? t('closeList') : t('openList')}
          >
            <Icon name="chevronRight" size={18} className="rank-sheet__chevron" />
          </button>
        </div>
      </div>
      <div className="rank-sheet__body" inert={!expanded}>
        {children}
      </div>
    </motion.section>
  )
}
