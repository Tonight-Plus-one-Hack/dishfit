// Today / Me: what I ate today against my goal, saved dishes, goal edits and deleting my data.
// Everything here is device-local; dishes load through src/data/api.ts.
import { localizedFormatter, useTranslation } from '../../i18n'
import { Suspense, useState, type CSSProperties, type ReactNode } from 'react'
import { AppShell, ScreenHeader } from '../../app/AppShell'
import { CountUp } from '../../components/CountUp'
import { DishHeroCard, DishHeroCardSkeleton } from '../../components/DishHeroCard'
import { Art, type ArtName } from '../../components/glyphs/Art'
import { Glyph } from '../../components/glyphs/Glyph'
import { Icon, type IconName } from '../../components/Icon'
import { LanguageSwitch } from '../../components/LanguageSwitch'
import { LegalLinks } from '../../components/LegalLinks'
import { EnergyRing, MacroRing } from '../../components/Rings'
import { dayTargets, type Macro } from '../../lib/nutrition'
import { WeekStrip } from '../../components/WeekStrip'
import { SourceBadge, TestBadge } from '../../components/ui'
import { getDish, isNotFound, type DishDetail } from '../../data/api'
import { isOpenAt } from '../../data/hours'
import { berlinDay, diaryStore, logDish, removeEntry, useDiary, type DiaryEntry } from '../../lib/diary'
import { useStore } from '../../lib/store'
import { cardsStore } from '../../lib/cards'
import { formatPrice } from '../../lib/format'
import { distance } from '../../lib/geo'
import { MOTION } from '../../lib/motion'
import { resetPosition, usePosition } from '../../lib/position'
import { clearProfile, useProfile, type Profile } from '../../lib/profile'
import { refresh, useResource } from '../../lib/resource'
import { Link } from '../../lib/router'
import { paths } from '../../lib/routes'
import { clearSaved, unsave, useSaved } from '../../lib/saved'
import { DIET_LABEL, GOAL_LABEL, MEALS_PER_DAY, dayBudget, dietChoice, formatInt } from '../onboarding/targets'
import { ConfirmSheet } from './ConfirmSheet'
import { Guard } from './Guard'
import { CameraTiles, MyCards, RecentRail, StreakPill, WeekProgress } from './Habits'
import { AiBadge } from '../camera/CameraScreen'
import './today.css'

const euro = localizedFormatter((lang) => new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }))
const euroCents = localizedFormatter((lang) => new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR' }))
const timeOf = localizedFormatter((lang) => new Intl.DateTimeFormat(lang, { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }))
const dayLabel = localizedFormatter((lang) => new Intl.DateTimeFormat(lang, { timeZone: 'Europe/Berlin', weekday: 'long', day: 'numeric', month: 'long' }))

const inDelay = (ms: number) => ({ '--delay': `${ms}ms` }) as CSSProperties
const dishKey = (id: string) => `dish:${id}`
const useDish = (id: string): DishDetail => useResource(dishKey(id), () => getDish(id))

export function TodayScreen() {
  const t = useTranslation()
  const profile = useProfile()
  const entries = useDiary()
  const all = useStore(diaryStore)
  const [now] = useState(() => new Date())
  const today = berlinDay(now)
  const targets = dayTargets(profile)
  const [confirming, setConfirming] = useState(false)
  const [deleted, setDeleted] = useState(false)

  const deleteAll = () => {
    clearProfile()
    clearSaved()
    diaryStore.set([])
    cardsStore.set([])
    resetPosition()
    setConfirming(false)
    setDeleted(true)
  }

  return (
    <AppShell tab="today">
      <ScreenHeader large eyebrow={dayLabel().format(now)} title={t('yourDay')} actions={<StreakPill entries={all} today={today} />} />
      <div className="page today">
        {!profile && (
          <Link to={paths.onboarding()} className="tailor-card today-in">
              <span className="tailor-card__text">
                <span className="tailor-card__title">{t('personalise')}</span>
                <span className="tailor-card__body">{t('answerFiveQuickQuestionsAboutYour')}</span>
              </span>
              <span className="tailor-card__arrow">
                <Icon name="arrowRight" size={18} />
              </span>
          </Link>
        )}

        <DaySummary entries={entries} profile={profile} now={now} />

        <div className="today-in today__wide" style={inDelay(60)}>
          <CameraTiles />
        </div>

        <section className="today__section today-in" style={inDelay(80)} aria-labelledby="eaten-title">
          <div className="section-head">
            <h2 id="eaten-title">{t('eatenToday')}</h2>
            {entries.length > 0 && <span className="t-label">{entries.length === 1 ? t('count1Dish') : t('count1Dishes', entries.length)}</span>}
          </div>
          {entries.length === 0 ? (
            <EmptyCard
              icon="today"
              title={t('nothingLoggedYet')}
              body={t('openADishAndTapAdd')}
              action={
                <Link to={paths.discover()} className="btn btn--secondary today__btn">{t('findADish')}</Link>
              }
            />
          ) : (
            <ul className="eaten">
              {entries.map((e) => (
                <EatenRow key={e.id} entry={e} />
              ))}
            </ul>
          )}
        </section>

        <div className="today-in" style={inDelay(100)}>
          <WeekProgress entries={all} today={today} kcalTarget={targets.kcal} proteinTarget={targets.protein} />
        </div>

        {all.length > 0 && (
          <div className="today-in today__wide" style={inDelay(110)}>
            <RecentRail entries={all} />
          </div>
        )}

        <div className="today-in" style={inDelay(115)}>
          <MyCards />
        </div>

        <SavedSection />

        {profile && <GoalSection profile={profile} />}

        <section className="today__section today-in" style={inDelay(200)} aria-labelledby="data-title">
          <div className="section-head">
            <h2 id="data-title">{t('yourData')}</h2>
            <LanguageSwitch />
          </div>
          <p className="t-muted today__fine">{t('yourGoalDiarySavedDishesAnd')}</p>
          <div className="today__data-row">
            <button className="btn btn--secondary today__btn today__delete" onClick={() => setConfirming(true)}>
              <Icon name="trash" size={16} />{t('deleteMyData')}</button>
            {deleted && (
              <p className="today__status" role="status">
                <Icon name="check" size={14} strokeWidth={2} />{' '}{t('allDataDeleted')}</p>
            )}
          </div>
        </section>

        <LegalLinks />
      </div>

      <ConfirmSheet
        open={confirming}
        title={t('deleteAllData')}
        body={t('thisPermanentlyRemovesYourGoalDiary')}
        confirm={t('deleteEverything')}
        onConfirm={deleteAll}
        onClose={() => setConfirming(false)}
      />
    </AppShell>
  )
}

// ---------- Summary ----------

function DaySummary({ entries, profile, now }: { entries: DiaryEntry[]; profile: Profile | null; now: Date }) {
  const t = useTranslation()
  const sum = (key: 'kcal' | 'protein' | 'carbs' | 'fat') => entries.reduce((s, e) => s + e[key], 0)
  const kcal = sum('kcal')
  const spent = entries.reduce((s, e) => s + (e.price ?? 0), 0)
  const estimate = entries.some((e) => e.isEstimate)
  const unpriced = entries.some((e) => e.price === null)
  const approx = estimate ? t('approximatePrefix') : ''
  const targets = dayTargets(profile)
  const left = targets.kcal - kcal
  const macros: Array<{ macro: Macro; label: string }> = [
    { macro: 'protein', label: t('protein') },
    { macro: 'carbs', label: t('carbs') },
    { macro: 'fat', label: t('fat') },
  ]

  return (
    <section className="day-board today-in" style={inDelay(40)} aria-labelledby="day-title">
      <h2 className="sr-only" id="day-title">{t('todaySoFar')}</h2>
      <WeekStrip now={now} kcalTarget={targets.kcal} />
      <div className="day-board__grid">
        <div className="day-kcal">
          <div className="day-kcal__text">
            <p className="day-kcal__big">
              {estimate && <small className="day-kcal__approx">~</small>}
              <CountUp value={kcal} format={formatInt} />
              <small className="day-kcal__of"> / {formatInt(targets.kcal)}</small>
            </p>
            <p className="day-kcal__label">
              <Glyph name="flame" size={16} />{t('caloriesEaten')}</p>
            <p className="day-kcal__left">
              {!targets.personal
                ? t('referenceIntakeUntilYouSetA')
                : left >= 0
                  ? t('count12KcalLeft', approx, formatInt(left))
                  : t('count12KcalOverYourGoal', approx, formatInt(-left))}
            </p>
          </div>
          <EnergyRing value={kcal / targets.kcal} size={124} over={targets.personal && left < 0} />
        </div>
        <ul className="day-macros">
          {macros.map(({ macro, label }) => (
            <li key={macro} className="day-macro">
              <p className="day-macro__value">
                {estimate && <small>~</small>}
                <CountUp value={sum(macro)} format={formatInt} />
                <small> g</small>
              </p>
              <p className="day-macro__of">{t('by')}{' '}{formatInt(targets[macro])} g</p>
              <p className="day-macro__label">
                {label}
                <span className="sr-only">{' '}{t('eaten')}</span>
              </p>
              <MacroRing macro={macro} grams={sum(macro)} target={targets[macro]} size={72} inside="glyph" approx={estimate} />
            </li>
          ))}
        </ul>
      </div>
      <div className="day-spend">
        <Meter
          label={t('spending')}
          tone="euro"
          value={spent}
          target={profile ? dayBudget(profile) : null}
          show={(v) => euroCents().format(v)}
          showTarget={(t) => euro().format(t)}
        />
      </div>
      <p className="day-card__note">
        {[
          !targets.personal && t('withoutAPersonalGoalWeUse'),
          t('carbsAndFatAccountFor45'),
          estimate && t('valuesMarkedWithIncludeAiEstimates'),
          unpriced && t('dishesWithoutAListedPriceCount'),
          profile && t('budget1MealsAt2Each', MEALS_PER_DAY, euro().format(profile.mealBudget)),
        ]
          .filter(Boolean)
          .join(' ')}
      </p>
    </section>
  )
}

function Meter({
  label,
  tone,
  value,
  target,
  show,
  showTarget,
}: {
  label: string
  tone: 'protein' | 'euro'
  value: number
  target: number | null
  show: (v: number) => string
  showTarget: (t: number) => string
}) {
  const t = useTranslation()
  const ratio = target ? Math.min(1, value / target) : 0
  return (
    <div className="meter">
      <div className="meter__row">
        <span className="meter__label">{label}</span>
        <span className="meter__value">
          <b>{show(value)}</b>
          {target !== null && <span> / {showTarget(target)}</span>}
        </span>
      </div>
      <div
        className="meter__track"
        role="progressbar"
        aria-label={target === null ? label : t('count12Of3', label, show(value), showTarget(target))}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
      >
        <span className={`meter__fill meter__fill--${tone}`} style={{ '--ratio': ratio } as CSSProperties} />
      </div>
    </div>
  )
}

// ---------- Eaten ----------

function EatenRow({ entry }: { entry: DiaryEntry }) {
  const t = useTranslation()
  const dishId = entry.dishId
  const body = (
    <>
        <span className="eaten__name">{entry.name}</span>
        <span className="eaten__meta">
          <span className="eaten__time">{timeOf().format(new Date(entry.at))}</span>
          <span>{entry.restaurantName}</span>
        </span>
        <span className="eaten__macros">
          <span>
            <b>
              {entry.isEstimate && t('approximatePrefix')}
              {formatInt(entry.kcal)}
            </b>{' '}
            kcal
          </span>
          <span>
            <b>
              {entry.isEstimate && t('approximatePrefix')}
              {entry.protein} g
            </b>{' '}{t('protein')}</span>
          <span className="eaten__price">{formatPrice(entry.price)}</span>
        </span>
        {entry.range && (
          <span className="eaten__range">{t('range')}{' '}{formatInt(entry.range.low)}-{formatInt(entry.range.high)} kcal
          </span>
        )}
        {dishId ? (
          <Guard fallback={() => null}>
            <Suspense fallback={null}>
              <EntryBadges dishId={dishId} />
            </Suspense>
          </Guard>
        ) : (
          <span className="eaten__badges">
            <AiBadge />
          </span>
        )}
    </>
  )
  return (
    <li className="eaten__row">
      {dishId ? (
        <Link to={paths.dish(dishId)} className="eaten__body">
          {body}
        </Link>
      ) : (
        <div className="eaten__body">{body}</div>
      )}
      <button className="eaten__remove" onClick={() => removeEntry(entry.id)} aria-label={t('remove1', entry.name)}>
        <Icon name="close" size={18} />
      </button>
    </li>
  )
}

/** Estimate and test-data labels come from the current dish, so older entries get them too. */
function EntryBadges({ dishId }: { dishId: string }) {
  const { dish, restaurant } = useDish(dishId)
  return (
    <span className="eaten__badges">
      <SourceBadge nutrition={dish.nutrition} isTestData={dish.isTestData} compact />
      {(dish.isTestData || restaurant.isTestData) && <TestBadge />}
    </span>
  )
}

// ---------- Saved ----------

function SavedSection() {
  const t = useTranslation()
  const saved = useSaved()
  return (
    <section className="today__section today-in" style={inDelay(120)} aria-labelledby="saved-title">
      <div className="section-head">
        <h2 id="saved-title">{t('savedDishes')}</h2>
        {saved.length > 0 && <span className="t-label">{saved.length === 1 ? t('count1Dish') : t('count1Dishes', saved.length)}</span>}
      </div>
      {saved.length === 0 ? (
        <EmptyCard
          icon="heart"
          art="empty-no-saved"
          title={t('nothingSavedYet')}
          body={t('tapTheHeartOnADish')}
          action={
            <Link to={paths.discover()} className="btn btn--secondary today__btn">{t('discover')}</Link>
          }
        />
      ) : (
        <ul className="saved-rail">
          {saved.map((s) => (
            <li key={s.dishId} className="saved-rail__item">
              <Guard fallback={(error, reset) => <SavedError dishId={s.dishId} error={error} reset={reset} />}>
                <Suspense fallback={<DishHeroCardSkeleton />}>
                  <SavedCard dishId={s.dishId} />
                </Suspense>
              </Guard>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function SavedCard({ dishId }: { dishId: string }) {
  const t = useTranslation()
  const { dish, restaurant } = useDish(dishId)
  const { position } = usePosition()
  const [now] = useState(() => new Date())
  const [added, setAdded] = useState(false)
  const add = () => {
    logDish(dish, restaurant)
    setAdded(true)
    window.setTimeout(() => setAdded(false), MOTION.copiedMs)
  }
  return (
    <DishHeroCard
      result={{ dish, restaurant, distance: distance(position, restaurant), openNow: isOpenAt(restaurant.openingHours, now) }}
      actions={
        <button className="btn btn--secondary today__btn today__add" onClick={add} aria-live="polite">
          <Icon name={added ? 'check' : 'plus'} size={16} />
          {added ? t('logged') : t('eatenToday')}
        </button>
      }
    />
  )
}

function SavedError({ dishId, error, reset }: { dishId: string; error: unknown; reset: () => void }) {
  const t = useTranslation()
  const gone = isNotFound(error)
  return (
    <div className="saved-error">
      <Icon name="alert" size={20} />
      <p className="saved-error__title">{gone ? t('thisDishIsNoLongerAvailable') : t('couldntLoad')}</p>
      <p className="t-muted saved-error__body">
        {gone ? t('theMenuHasChanged') : t('todayScreenCheckYourConnectionAndTryAgain')}
      </p>
      {gone ? (
        <button className="btn btn--secondary today__btn" onClick={() => unsave(dishId)}>{t('remove')}</button>
      ) : (
        <button
          className="btn btn--secondary today__btn"
          onClick={async () => {
            await refresh((key) => key === dishKey(dishId))
            reset()
          }}
        >{t('resultsBoundaryTryAgain')}</button>
      )}
    </div>
  )
}

// ---------- Goal ----------

function GoalSection({ profile }: { profile: Profile }) {
  const t = useTranslation()
  const rows: Array<{ label: string; value: string; edit: string }> = [
    { label: t('goal'), value: GOAL_LABEL[profile.goal], edit: 'goal' },
    { label: t('calories'), value: t('count1KcalPerDay', formatInt(profile.kcalTarget)), edit: 'kcal' },
    { label: t('protein'), value: t('count1GPerDay', formatInt(profile.proteinTarget)), edit: 'protein' },
    { label: t('diet'), value: DIET_LABEL[dietChoice(profile.diet)], edit: 'diet' },
    { label: t('location'), value: profile.kiez ?? t('nearMe'), edit: 'place' },
  ]
  return (
    <section className="today__section today-in" style={inDelay(160)} aria-labelledby="goal-title">
      <div className="section-head">
        <h2 id="goal-title">{t('todayScreenYourGoal')}</h2>
        <Link to={paths.onboarding()} className="today__link">{t('setUpAgain')}</Link>
      </div>
      <ul className="settings">
        {rows.map((r) => (
          <li key={r.edit}>
            <Link to={`${paths.onboarding()}?edit=${r.edit}`} className="settings__row" aria-label={t('count12Change', r.label, r.value)}>
              <span className="settings__label">{r.label}</span>
              <span className="settings__value">{r.value}</span>
              <Icon name="chevronRight" size={16} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

// ---------- Shared bits ----------

function EmptyCard({ icon, art, title, body, action }: { icon: IconName; art?: ArtName; title: string; body: string; action?: ReactNode }) {
  return (
    <div className={`empty-card ${art ? 'empty-card--art' : ''}`}>
      {art ? (
        <Art name={art} size={112} className="empty-card__art" />
      ) : (
        <span className="icon-badge">
          <Icon name={icon} size={18} />
        </span>
      )}
      <p className="empty-card__title">{title}</p>
      <p className="t-muted empty-card__body">{body}</p>
      {action}
    </div>
  )
}
