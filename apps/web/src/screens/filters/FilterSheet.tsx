// Filter sheet: a modal <dialog> with a bottom sheet on phones (drag the handle down to close) and a centred panel
// from 768 px. Changes stay a draft until "n Gerichte zeigen"; the count updates live while the old one stays visible.
// Motion: the Thayon "state" spring from src/motion for entering and leaving; reduced motion shows and hides at once.
import { useTranslation } from '../../i18n'
import { Suspense, useDeferredValue, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { motion, useAnimationControls, useDragControls, useReducedMotion, type PanInfo } from 'framer-motion'
import { Icon } from '../../components/Icon'
import { KIEZE, type DishSort, type Kiez, type LatLng } from '../../data/api'
import { formatDistance, formatNumber } from '../../lib/format'
import { openLocationPrompt, usePosition } from '../../lib/position'
import { springTransition } from '../../motion'
import { useDishResults } from './queries'
import {
  DISTANCE_STEPS,
  KCAL_STEPS,
  PRICE_STEPS,
  PROTEIN_STEPS,
  SCORE_STEPS,
  SORTS,
  clearFilters,
  sameState,
  toFilters,
  type Diet,
  type SearchState,
} from './searchState'

const DESKTOP = '(min-width: 768px)'
/** Drag distance or speed past which letting go closes the sheet. */
const DISMISS_OFFSET = 120
const DISMISS_VELOCITY = 600

function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
  )
}

/** The fixed steps plus a value from a shared link that is not one of them. */
function withValue(steps: number[], value: number | undefined): number[] {
  return value === undefined || steps.includes(value) ? steps : [...steps, value].sort((a, b) => a - b)
}

function Group({ legend, children, hint }: { legend: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <fieldset className="sheet-group">
      <legend className="t-label sheet-group__legend">{legend}</legend>
      <div className="sheet-group__options">{children}</div>
      {hint}
    </fieldset>
  )
}

function Option({
  type = 'radio',
  name,
  label,
  checked,
  onChange,
}: {
  type?: 'radio' | 'checkbox'
  name: string
  label: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <label className="sheet-option">
      <input className="sheet-option__input" type={type} name={name} checked={checked} onChange={onChange} />
      <span className="chip sheet-option__chip">{label}</span>
    </label>
  )
}

/** "Egal" plus one option per step, for a single optional number. */
function Steps({
  name,
  steps,
  value,
  format,
  onChange,
}: {
  name: string
  steps: number[]
  value: number | undefined
  format: (n: number) => string
  onChange: (value: number | undefined) => void
}) {
  const t = useTranslation()
  return (
    <>
      <Option name={name} label={t('any')} checked={value === undefined} onChange={() => onChange(undefined)} />
      {withValue(steps, value).map((step) => (
        <Option key={step} name={name} label={format(step)} checked={value === step} onChange={() => onChange(step)} />
      ))}
    </>
  )
}

function PositionHint() {
  const t = useTranslation()
  const { status } = usePosition()
  if (status === 'granted') return null
  return (
    <p className="sheet-hint">
      <Icon name="locate" size={16} />
      <span>{status === 'locating' ? t('locating') : t('distancesAreMeasuredFromMoritzplatz')}</span>
      {status !== 'locating' && (
        <button type="button" className="sheet-hint__action" onClick={openLocationPrompt}>
          {status === 'denied' ? t('locationAccessBlocked') : t('useDeviceLocation')}
        </button>
      )}
    </p>
  )
}

export function FilterSheet({
  initial,
  near,
  onApply,
  onClose,
}: {
  initial: SearchState
  near: LatLng
  onApply: (next: SearchState) => void
  onClose: () => void
}) {
  const t = useTranslation()
  const dialog = useRef<HTMLDialogElement>(null)
  const panel = useAnimationControls()
  const dragControls = useDragControls()
  const reduced = useReducedMotion() ?? false
  const desktop = useMedia(DESKTOP)
  const closing = useRef(false)
  const [draft, setDraft] = useState(initial)
  const shown = useDeferredValue(draft)
  const set = (patch: Partial<SearchState>) => setDraft((d) => ({ ...d, ...patch }))

  const hidden = desktop ? { opacity: 0, y: 16, scale: 0.98 } : { opacity: 1, y: '100%', scale: 1 }

  // The parent mounts the sheet to open it.
  useEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal()
    void panel.start({ opacity: 1, y: 0, scale: 1, transition: reduced ? { duration: 0 } : springTransition('state') })
  }, [panel, reduced])

  const close = async (apply?: SearchState) => {
    if (closing.current) return
    closing.current = true
    if (apply) onApply(apply)
    dialog.current?.classList.add('is-closing')
    if (!reduced) await panel.start({ ...hidden, transition: springTransition('state') })
    dialog.current?.close()
    onClose()
  }

  const dragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > DISMISS_OFFSET || info.velocity.y > DISMISS_VELOCITY) void close()
  }

  const toggleKiez = (k: Kiez) =>
    set({ kiez: draft.kiez.includes(k) ? draft.kiez.filter((x) => x !== k) : KIEZE.filter((x) => x === k || draft.kiez.includes(x)) })
  const cleared = clearFilters(draft)

  return (
    <dialog
      ref={dialog}
      className="filter-sheet"
      aria-labelledby="filter-sheet-title"
      onCancel={(e) => {
        e.preventDefault()
        void close()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) void close()
      }}
    >
      <motion.div
        className="filter-sheet__panel"
        initial={reduced ? false : hidden}
        animate={panel}
        drag={desktop ? false : 'y'}
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 1 }}
        onDragEnd={dragEnd}
        tabIndex={-1}
        autoFocus
      >
        <div
          className="filter-sheet__head"
          onPointerDown={(e) => {
            if (!desktop && !(e.target as Element).closest('button')) dragControls.start(e)
          }}
        >
          <div className="filter-sheet__grabber" aria-hidden="true" />
          <div className="filter-sheet__title-row">
            <h2 id="filter-sheet-title" className="filter-sheet__title">{t('filters')}</h2>
            <button type="button" className="sheet-close" onClick={() => void close()} aria-label={t('close')}>
              <Icon name="close" size={20} />
            </button>
          </div>
        </div>

        <div className="filter-sheet__body">
          <Group legend={t('sortOptions')}>
            {SORTS.map((s) => (
              <Option
                key={s.value}
                name="sort"
                label={s.label}
                checked={draft.sort === s.value}
                onChange={() => set({ sort: s.value as DishSort })}
              />
            ))}
          </Group>

          <Group legend={t('maximumPrice')}>
            <Steps name="priceMax" steps={PRICE_STEPS} value={draft.priceMax} format={(n) => `${formatNumber(n)} €`} onChange={(priceMax) => set({ priceMax })} />
          </Group>

          <Group legend={t('maximumCalories')}>
            <Steps name="kcalMax" steps={KCAL_STEPS} value={draft.kcalMax} format={(n) => `${formatNumber(n)} kcal`} onChange={(kcalMax) => set({ kcalMax })} />
          </Group>

          <Group legend={t('minimumProtein')}>
            <Steps name="proteinMin" steps={PROTEIN_STEPS} value={draft.proteinMin} format={(n) => `${formatNumber(n)} g`} onChange={(proteinMin) => set({ proteinMin })} />
          </Group>

          <Group
            legend={t('scoreAtLeast')}
            hint={<p className="sheet-note">{t('count0To100HighProteinA')}</p>}
          >
            <Steps name="scoreMin" steps={SCORE_STEPS} value={draft.scoreMin} format={formatNumber} onChange={(scoreMin) => set({ scoreMin })} />
          </Group>

          <Group legend={t('diet')}>
            {([undefined, 'vegetarian', 'vegan'] as Array<Diet | undefined>).map((d) => (
              <Option
                key={d ?? 'all'}
                name="diet"
                label={d === 'vegan' ? t('vegan') : d === 'vegetarian' ? t('vegetarian') : t('filterSheetAll')}
                checked={draft.diet === d}
                onChange={() => set({ diet: d })}
              />
            ))}
          </Group>

          <fieldset className="sheet-group">
            <legend className="t-label sheet-group__legend">{t('openingHours')}</legend>
            <label className="switch-row">
              <span className="switch-row__text">
                <span>{t('openNowOnly')}</span>
                <span className="sheet-note">{t('basedOnHoursFromOpenstreetmapOr')}</span>
              </span>
              <input
                type="checkbox"
                role="switch"
                className="switch"
                checked={draft.open}
                onChange={(e) => set({ open: e.target.checked })}
              />
            </label>
          </fieldset>

          <Group legend={t('distance')} hint={<PositionHint />}>
            <Steps name="dist" steps={DISTANCE_STEPS} value={draft.dist} format={formatDistance} onChange={(dist) => set({ dist })} />
          </Group>

          <Group legend={t('neighbourhood')}>
            {KIEZE.map((k) => (
              <Option key={k} type="checkbox" name="kiez" label={k} checked={draft.kiez.includes(k)} onChange={() => toggleKiez(k)} />
            ))}
          </Group>
        </div>

        <div className="filter-sheet__foot">
          <button
            type="button"
            className="btn btn--secondary filter-sheet__reset"
            onClick={() => setDraft(cleared)}
            disabled={sameState(cleared, draft)}
          >{t('reset')}</button>
          <Suspense
            fallback={
              <button type="button" className="btn btn--primary filter-sheet__apply" disabled>{t('showDishes')}</button>
            }
          >
            <ApplyButton draft={draft} shown={shown} near={near} onApply={() => void close(draft)} />
          </Suspense>
        </div>
      </motion.div>
    </dialog>
  )
}

function ApplyButton({
  draft,
  shown,
  near,
  onApply,
}: {
  draft: SearchState
  shown: SearchState
  near: LatLng
  onApply: () => void
}) {
  const t = useTranslation()
  const count = useDishResults(toFilters(shown, near)).length
  const stale = shown !== draft
  return (
    <button
      type="button"
      className={`btn btn--primary filter-sheet__apply ${stale ? 'is-stale' : ''}`}
      onClick={onApply}
      disabled={count === 0 && !stale}
    >
      {count === 0 ? t('noMatchingDishes') : count === 1 ? t('show1Dish') : t('show1Dishes', count)}
    </button>
  )
}
