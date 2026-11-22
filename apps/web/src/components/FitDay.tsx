// "Passt zu deinem Tag": one button, then a sheet with up to three dishes that are open now, about ten minutes away
// and fit what is left of today's kcal and protein. Healthy dishes only. Rules live in lib/fitDay.ts.
// Uses the position already shared from a location control, or Moritzplatz.
import { useTranslation, LanguageContext, translatorFor, type Language } from '../i18n'
import { Component, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { filtersKey, topDishes, type LatLng } from '../data/api'
import { useDiary } from '../lib/diary'
import {
  DAY_FULL_KCAL,
  DEFAULT_MINUTES,
  fitDay,
  fitDayFilters,
  picksLine,
  RELAXED_MINUTES,
  remainingLine,
  remainingToday,
  SHOWN,
  type FitPick,
  type Remaining,
} from '../lib/fitDay'
import { formatPrice } from '../lib/format'
import { dayTargets } from '../lib/nutrition'
import { usePosition } from '../lib/position'
import { useProfile } from '../lib/profile'
import { roundNear } from '../lib/ranking'
import { useResource } from '../lib/resource'
import { useLocation } from '../lib/location'
import { Link } from '../lib/router'
import { paths } from '../lib/routes'
import { Art } from './glyphs/Art'
import { Glyph } from './glyphs/Glyph'
import { Icon } from './Icon'
import { DishThumb, RestaurantName, ScoreRing } from './ui'
import './fit-day.css'

type Origin = { near: LatLng; real: boolean }

function useOrigin(): Origin {
  const { position, status } = usePosition()
  return { near: position, real: status === 'granted' }
}

function PickCard({ pick, rank }: { pick: FitPick; rank: number }) {
  const t = useTranslation()
  const { dish, restaurant } = pick.result
  return (
    <li>
      <Link
        to={paths.dish(dish.id)}
        className="fit-pick"
        aria-label={t('rank12At34', rank, dish.name, restaurant.name, restaurant.isTestData ? t('testData') : '')}
      >
        <span className="fit-pick__media">
          <DishThumb dish={dish} className="fit-pick__thumb" />
          <span className="fit-pick__score">
            <ScoreRing score={dish.healthScore} size={32} />
          </span>
        </span>
        <span className="fit-pick__body">
          <span className="fit-pick__head">
            <span className="fit-pick__name">{dish.name}</span>
            <span className="fit-pick__price">{formatPrice(dish.price)}</span>
          </span>
          <span className="fit-pick__place">
            <RestaurantName restaurant={restaurant} />
            <span className="fit-pick__kiez">
              <Icon name="pin" size={12} strokeWidth={2} />
              {restaurant.kiez}
            </span>
          </span>
          <ul className="fit-pick__reasons">
            {pick.reasons.map((r, i) => (
              <li key={r} className={i === 0 ? 'is-protein' : undefined}>
                <Icon name="check" size={14} strokeWidth={2.2} />
                {r}
              </li>
            ))}
          </ul>
        </span>
      </Link>
    </li>
  )
}

function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="fit-empty" role="status">
      <Art name="empty-no-results" size={96} />
      <p className="fit-empty__title">{title}</p>
      <p className="t-muted">{body}</p>
      {action}
    </div>
  )
}

function Picks({ origin, remaining, minutes, onRelax }: { origin: Origin; remaining: Remaining; minutes: number; onRelax: () => void }) {
  const t = useTranslation()
  const profile = useProfile()
  const entries = useDiary()
  const filters = fitDayFilters(roundNear(origin.near), minutes, profile?.diet)
  const candidates = useResource(`fitday:${filtersKey(filters)}`, () => topDishes(filters))
  const picks = fitDay(candidates, { remaining, minutes, eatenDishIds: new Set(entries.flatMap((e) => (e.dishId ? [e.dishId] : []))) })

  if (picks.length === 0) {
    const relaxed = minutes >= RELAXED_MINUTES
    return (
      <>
        <h2 className="fit-sheet__title" id="fit-title">
          {remainingLine(remaining)}
        </h2>
        <Empty
          title={relaxed ? t('nothingFitsHereRightNow') : t('nothingWithin1MinutesFitsRight', minutes)}
          body={
            relaxed
              ? t('noHealthyDishesAtOpenRestaurants')
              : t('youMightFindSomethingALittle', RELAXED_MINUTES)
          }
          action={
            relaxed ? (
              <Link to={paths.map()} className="btn btn--secondary">{t('viewMap')}</Link>
            ) : (
              <button type="button" className="btn btn--primary" onClick={onRelax}>{t('expandSearchRadius', RELAXED_MINUTES)}</button>
            )
          }
        />
      </>
    )
  }

  return (
    <>
      <h2 className="fit-sheet__title" id="fit-title">
        {remainingLine(remaining)} <span className="fit-sheet__arrow">→</span> {picksLine(picks.length)}
      </h2>
      <ol className="fit-picks">
        {picks.map((p, i) => (
          <PickCard key={p.result.dish.id} pick={p} rank={i + 1} />
        ))}
      </ol>
      {picks.length < SHOWN && minutes < RELAXED_MINUTES && (
        <button type="button" className="btn btn--secondary btn--wide" onClick={onRelax}>{t('showMoreWithin', RELAXED_MINUTES)}</button>
      )}
    </>
  )
}

class PicksBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  static contextType = LanguageContext
  declare context: Language
  private translate = translatorFor(() => this.context)
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (this.state.failed) return <Empty title={this.translate('loadFailed')} body={this.translate('checkConnection')} />
    return this.props.children
  }
}

function PicksSkeleton() {
  const t = useTranslation()
  return (
    <div className="fit-picks" aria-busy="true" aria-label={t('findingDishes')}>
      {[0, 1, 2].map((i) => (
        <span key={i} className="fit-pick fit-pick--skeleton">
          <span className="fit-pick__media skeleton" />
          <span className="fit-pick__body">
            <span className="skeleton fit-skel fit-skel--title" />
            <span className="skeleton fit-skel" />
            <span className="skeleton fit-skel" />
          </span>
        </span>
      ))}
    </div>
  )
}

export function FitDaySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslation()
  const ref = useRef<HTMLDialogElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const profile = useProfile()
  const entries = useDiary()
  const origin = useOrigin()
  const [minutes, setMinutes] = useState(DEFAULT_MINUTES)
  const targets = dayTargets(profile)
  const remaining = remainingToday(entries, targets)
  const dayFull = remaining.kcal < DAY_FULL_KCAL

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      setMinutes(DEFAULT_MINUTES)
      dialog.showModal()
      panelRef.current?.focus()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className="fit-sheet"
      aria-labelledby="fit-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {open && (
        <div className="fit-sheet__panel" ref={panelRef} tabIndex={-1}>
          <span className="fit-sheet__grabber" aria-hidden="true" />
          <div className="fit-sheet__top">
            <span className="fit-sheet__eyebrow">
              <Glyph name="flame" size={16} />{t('fitsYourDay')}</span>
            <button type="button" className="btn btn--secondary btn--icon fit-sheet__close" aria-label={t('close')} onClick={onClose}>
              <Icon name="close" size={18} />
            </button>
          </div>

          {dayFull ? (
            <>
              <h2 className="fit-sheet__title" id="fit-title">{t('yourDayIsFull')}</h2>
              <Empty
                title={t('only1KcalLeft', Math.max(0, remaining.kcal))}
                body={t('theresNoRoomForAnotherMeal')}
                action={
                  <Link to={paths.today()} className="btn btn--secondary">{t('goToToday')}</Link>
                }
              />
            </>
          ) : (
            <PicksBoundary>
              <Suspense
                fallback={
                  <>
                    <h2 className="fit-sheet__title" id="fit-title">
                      {remainingLine(remaining)}
                    </h2>
                    <PicksSkeleton />
                  </>
                }
              >
                <Picks origin={origin} remaining={remaining} minutes={minutes} onRelax={() => setMinutes(RELAXED_MINUTES)} />
              </Suspense>
            </PicksBoundary>
          )}

          <p className="fit-sheet__note">
            {!dayFull && t('openNowUpToAbout1', minutes)}{t('travelTimesAreEstimatedFromStraight')}{!origin.real ? t('usingMoritzplatzAsAStartingPoint') : ''}.
            {!targets.personal && (
              <>
                {' '}{t('weUseStandardTargetsUntilYou')}{' '}<Link to={paths.onboarding()}>{t('setGoal')}</Link>
              </>
            )}
          </p>
        </div>
      )}
    </dialog>
  )
}

/** The entry point. `card` is the big button on the phone home screen, `chip` sits in the desktop filter bar. */
export function FitDayButton({ variant }: { variant: 'card' | 'chip' }) {
  const t = useTranslation()
  // The sheet belongs to the page it was opened on: picking a dish or following a link closes it. On the phone the
  // home screen unmounts anyway; the desktop top bar stays, and the sheet would otherwise cover the new panel.
  const { pathname, search } = useLocation()
  const here = pathname + search
  const [openedAt, setOpenedAt] = useState<string | null>(null)
  const open = openedAt === here
  const setOpen = (next: boolean) => setOpenedAt(next ? here : null)
  const profile = useProfile()
  const entries = useDiary()
  const remaining = remainingToday(entries, dayTargets(profile))

  return (
    <>
      {variant === 'chip' ? (
        <button type="button" className="fit-chip" aria-haspopup="dialog" onClick={() => setOpen(true)}>
          <Glyph name="flame" size={17} />{t('fitsYourDay')}</button>
      ) : (
        <button type="button" className="fit-card" aria-haspopup="dialog" onClick={() => setOpen(true)}>
          <span className="fit-card__icon" aria-hidden="true">
            <Glyph name="flame" size={22} />
          </span>
          <span className="fit-card__text">
            <span className="fit-card__title">{t('fitsYourDay')}</span>
            <span className="fit-card__sub">
              {remaining.kcal < DAY_FULL_KCAL ? t('yourDayIsFull') : t('count1OpenNow2Min', remainingLine(remaining), DEFAULT_MINUTES)}
            </span>
          </span>
          <Icon name="arrowRight" size={18} />
        </button>
      )}
      <FitDaySheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}
