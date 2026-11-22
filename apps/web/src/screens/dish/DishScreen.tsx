// Dish detail: big numbers with ranges, health score, price and protein per euro, share of the day,
// "Wie berechnet?", source, "Wert melden", sharing and more dishes from the same restaurant.
import { dishDescription, menuSection } from '../../lib/menu-copy'
import { useTranslation } from '../../i18n'
import { Suspense, useEffect, useState, type CSSProperties } from 'react'
import { AppShell, ScreenHeader } from '../../app/AppShell'
import { CountUp } from '../../components/CountUp'
import { Glyph } from '../../components/glyphs/Glyph'
import { Icon } from '../../components/Icon'
import { HealthRing, MacroRing } from '../../components/Rings'
import { dayTargets } from '../../lib/nutrition'
import { ScreenBoundary } from '../../components/ScreenBoundary'
import { DishShareSheet, type DishShareTarget } from '../../components/DishShareSheet'
import { ConfidenceMeter, DishThumb, RestaurantName, ScoreRing, SourceBadge, TestBadge } from '../../components/ui'
import { getDish, type Dish, type NutritionEstimate, type Restaurant } from '../../data/api'
import { track } from '../../lib/analytics'
import { logDish } from '../../lib/diary'
import { formatDistance, formatNumber, formatPrice, formatRange } from '../../lib/format'
import { distance } from '../../lib/geo'
import { usePosition } from '../../lib/position'
import { DEFAULT_TARGETS, useProfile } from '../../lib/profile'
import { useResource } from '../../lib/resource'
import { Link } from '../../lib/router'
import { paths } from '../../lib/routes'
import { framer } from '../../motion'
import { DetailError, HeaderTitle } from '../restaurant/DetailParts'
import { useTitleShown } from '../restaurant/hooks'
import { formatDate, hostOf, sourceKind } from '../restaurant/info'
import { componentsOf, energySplit, portionOf, scoreBand, spreadPercent, useReported } from './breakdown'
import { ReportSheet } from './ReportSheet'
import { ConfirmDish } from '../community/ConfirmDish'
import '../restaurant/detail.css'
import './dish.css'

const { Reveal } = framer
const CONFIDENCE_WORD = { high: 'highConfidence', medium: 'mediumConfidence', low: 'lowConfidence' } as const

function Nutrition({ n, score, isTestData }: { n: NutritionEstimate; score: number; isTestData: boolean }) {
  const t = useTranslation()
  const ai = n.source !== 'official' || isTestData
  const split = energySplit(n)
  const spread = spreadPercent(n.kcal)
  const targets = dayTargets(useProfile())
  const macros = [
    { key: 'protein', r: n.protein, share: split.protein, target: targets.protein },
    { key: 'carbs', r: n.carbs, share: split.carbs, target: targets.carbs },
    { key: 'fat', r: n.fat, share: split.fat, target: targets.fat },
  ] as const
  return (
    <section className="nutri nutri--rings" aria-labelledby="nutri-title">
      <div className="nutri__head">
        <h2 id="nutri-title" className="t-label">{t('perServing')}</h2>
        <SourceBadge nutrition={n} isTestData={isTestData} compact />
      </div>
      <div className="nutri__top">
        <div>
          <p className="nutri__kcal">
            <Glyph name="flame" size={26} />
            {ai && <span className="nutri__approx">{t('approximate')}</span>}
            <span className="nutri__kcal-value">
              <CountUp value={n.kcal.value} />
            </span>
            <span className="nutri__kcal-unit">kcal</span>
          </p>
          <p className="nutri__range">{t('range')}{' '}{formatRange(n.kcal, 'kcal')}</p>
        </div>
        <HealthRing score={score} size={58} />
      </div>
      <ul className="nutri__rings">
        {macros.map((m) => (
          <li key={m.key} className="nutri__ring">
            <MacroRing macro={m.key} grams={m.r.value} target={m.target} size={88} approx={ai} />
            <span className="nutri__ring-range">{formatRange(m.r, 'g')}</span>
            <span className="nutri__ring-share">{m.share}{' '}{t('energy')}</span>
          </li>
        ))}
      </ul>
      <p className="nutri__target t-muted">{t('ringsShare')}{' '}{targets.personal ? t('ofYourDailyGoal') : t('ofAReferenceIntakeOf1', formatNumber(targets.kcal))} ({targets.protein}{' '}{t('dishScreenGProtein')}{' '}{targets.carbs}{' '}{t('gCarbs')}{' '}{targets.fat}{' '}{t('gFat')}</p>
      <p className="nutri__conf">
        <ConfidenceMeter confidence={n.confidence} />
        <span>
          {ai ? (
            <>{t('dishScreenConfidence')}{' '}<b>{t(CONFIDENCE_WORD[n.confidence])}</b>{t('theActualValueMayDifferBy')}{spread}{' '}{t('percentSuffix')}</>
          ) : (
            <>{t('dishScreenOfficialValues')}{spread}{' '}{t('toAllowForDifferencesInPortions')}</>
          )}
        </span>
      </p>
    </section>
  )
}

function Score({ score }: { score: number }) {
  const t = useTranslation()
  const band = scoreBand(score)
  return (
    <section className={`score-card score-card--${band.tone}`} aria-labelledby="score-title">
      <HealthRing score={score} size={64} />
      <div className="score-card__body">
        <h2 id="score-title" className="t-label score-card__label">
          <Glyph name="score" size={16} />{t('healthScore')}</h2>
        <p className="score-card__band">{band.label}</p>
        <div className="score-band" aria-hidden="true">
          <span className="score-band__seg score-band__seg--low" />
          <span className="score-band__seg score-band__seg--ok" />
          <span className="score-band__seg score-band__seg--good" />
          <span className="score-band__seg score-band__seg--top" />
          <span className="score-band__marker" style={{ left: `${score}%` }} />
        </div>
        <p className="score-card__note t-muted">{t('count0To100BasedOnProtein')}</p>
      </div>
    </section>
  )
}

function DayShare({ n }: { n: NutritionEstimate }) {
  const t = useTranslation()
  const profile = useProfile()
  const targets = profile ?? DEFAULT_TARGETS.maintain
  const rows = [
    { label: t('calories'), value: n.kcal.value, target: targets.kcalTarget, unit: 'kcal' },
    { label: t('protein'), value: n.protein.value, target: targets.proteinTarget, unit: 'g' },
  ]
  return (
    <section className="day-share" aria-labelledby="day-title">
      <div className="day-share__head">
        <h2 id="day-title" className="detail-title">{t('shareOfYourDailyGoal')}</h2>
        {!profile && (
          <Link to={paths.onboarding()} className="day-share__goal">{t('setGoal')}</Link>
        )}
      </div>
      {rows.map((r) => {
        const pct = Math.round((r.value / r.target) * 100)
        return (
          <div key={r.label} className="day-row">
            <div className="day-row__text">
              <span>{r.label}</span>
              <span>
                <b>{pct} %</b> <span className="t-muted">{t('by')}{' '}{formatNumber(r.target)} {r.unit}</span>
              </span>
            </div>
            <span className="day-row__track" role="img" aria-label={t('count12OfYourDailyGoal', r.label, pct)}>
              <span
                className={`day-row__fill ${r.label === 'Protein' ? 'day-row__fill--protein' : ''}`}
                style={{ '--pct': Math.min(pct, 100) / 100 } as CSSProperties}
              />
            </span>
          </div>
        )
      })}
      {!profile && <p className="day-share__fine t-muted">{t('basedOnAReferenceIntakeOf')}</p>}
    </section>
  )
}

function HowCalculated({ dish, restaurant }: { dish: Dish; restaurant: Restaurant }) {
  const t = useTranslation()
  const n = dish.nutrition
  const { items, note } = portionOf(n)
  const parts = items.length ? [] : componentsOf(dishDescription(dish) ?? '')
  return (
    <details className="how">
      <summary className="how__summary">
        <span className="how__icon" aria-hidden="true">
          <Icon name="info" size={18} />
        </span>
        <span className="how__title">{t('howIsItCalculated')}</span>
        <Icon name="chevronDown" size={18} className="how__chevron" />
      </summary>
      <div className="how__body">
        <ol className="how__steps">
          <li>
            <b>{t('menuRead')}</b>
            <span>
              {restaurant.isTestData ? t('fictionalTestData') : `${hostOf(dish.menuSource.url)} (${sourceKind(dish.menuSource)})`}{t('on')}{' '}
              {formatDate(dish.menuSource.fetchedAt)}
            </span>
          </li>
          <li>
            <b>{n.source === 'ai' ? t('estimatedPortion') : t('portionStatedByTheRestaurant')}</b>
            {items.length > 0 ? (
              <table className="how__table">
                <thead>
                  <tr>
                    <th scope="col">{t('ingredient')}</th>
                    <th scope="col">{t('amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={`${item.name}-${i}`}>
                      <td>{item.name}</td>
                      <td>{item.amount === null ? t('nA') : `${formatNumber(item.amount)} ${item.unit}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : parts.length > 0 ? (
              <>
                <span>{t('listedOnTheMenuWithoutQuantities')}</span>
                <span className="how__parts">
                  {parts.map((p) => (
                    <span key={p} className="tag tag--outline">
                      {p}
                    </span>
                  ))}
                </span>
              </>
            ) : (
              <span>{t('noIngredientListAvailable')}</span>
            )}
          </li>
          <li>
            <b>{n.source === 'ai' ? t('estimatedNutrition') : t('publishedNutritionValues')}</b>
            <span>
              {n.source === 'ai'
                ? t('ai1EstimatesCaloriesAndMacros', n.model ? ` (${n.model})` : '')
                : t('takenDirectlyFromTheRestaurantsPublished')}
            </span>
          </li>
          <li>
            <b>{t('calculatedRange')}</b>
            <span>
              ±{spreadPercent(n.kcal)}{' '}{t('dependingOnConfidenceProteinPerEuro')}</span>
          </li>
        </ol>
        {note && (
          <div className="how__note">
            <p className="t-label">{t('calculationNote')}</p>
            <p>{note}</p>
          </div>
        )}
      </div>
    </details>
  )
}

function Siblings({ restaurant, siblings }: { restaurant: Restaurant; siblings: Dish[] }) {
  const t = useTranslation()
  if (siblings.length === 0) return null
  return (
    <section className="more" aria-labelledby="more-title">
      <div className="section-head">
        <h2 id="more-title">{t('moreFrom')}{' '}{restaurant.name}</h2>
        <Link to={paths.restaurant(restaurant.id)}>{t('all')}</Link>
      </div>
      <ul className="more__rail">
        {siblings.slice(0, 8).map((d) => (
          <li key={d.id}>
            <Link to={paths.dish(d.id)} className="mini-card">
              <span className="mini-card__media">
                <DishThumb dish={d} className="mini-card__thumb" />
                <span className="mini-card__score">
                  <ScoreRing score={d.healthScore} size={32} />
                </span>
              </span>
              <span className="mini-card__name">{d.name}</span>
              <span className="mini-card__meta">
                {d.nutrition.source === 'ai' && t('approximatePrefix')}
                {d.nutrition.kcal.value}{' '}{t('kcal')}{' '}<span className="mini-card__protein">{d.nutrition.protein.value}{' '}{t('cameraScreenGProtein')}</span>
              </span>
              <span className="mini-card__price">{formatPrice(d.price)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Content({ id }: { id: string }) {
  const t = useTranslation()
  const { dish, restaurant, siblings } = useResource(`dish:${id}`, () => getDish(id))
  const { position, status } = usePosition()
  useEffect(() => track('dish_view'), [id])
  const [titleRef, titleShown] = useTitleShown()
  const [shareTarget, setShareTarget] = useState<DishShareTarget | null>(null)
  const [added, setAdded] = useState(false)
  const [reporting, setReporting] = useState(false)
  const reported = useReported(dish.id)
  const n = dish.nutrition
  const diet = dish.diet.includes('vegan') ? t('vegan') : dish.diet.includes('vegetarian') ? t('vegetarian') : null
  const section = menuSection(dish.category)
  const target: DishShareTarget = {
    dishId: dish.id,
    name: dish.name,
    text: t('letsEatHere1At2', dish.name, restaurant.name, n.source === 'ai' ? t('approximatePrefix') : '', n.kcal.value, n.protein.value, formatPrice(dish.price)),
    url: `${window.location.origin}${paths.dish(dish.id)}`,
  }
  const share = (next: DishShareTarget) => {
    track('share_tap')
    setShareTarget(next)
  }

  return (
    <>
      <ScreenHeader
        title={<HeaderTitle shown={titleShown}>{dish.name}</HeaderTitle>}
        backTo={paths.restaurant(restaurant.id)}
        actions={
          <button className="screen-head__back" onClick={() => share(target)} aria-label={t('shareDish')}>
            <Icon name="share" size={18} />
          </button>
        }
      />
      <div className="page detail">
        <Reveal className="dish-top" trigger="mount">
          <DishThumb dish={dish} className="dish-hero" />
          <header className="dish-head">
            <p className="dish-head__tags">
              <span className="tag">{section}</span>
              {diet && diet.toLowerCase() !== section.toLowerCase() && <span className="tag tag--diet">{diet}</span>}
              {dish.isTestData && <TestBadge />}
            </p>
            <h1 className="t-section" ref={titleRef}>
              {dish.name}
            </h1>
            <Link to={paths.restaurant(restaurant.id)} className="dish-head__restaurant">
              <RestaurantName restaurant={restaurant} />
              <span className="t-muted">· {restaurant.kiez}{status === 'granted' && ` · ${formatDistance(distance(position, restaurant))}`}</span>
              <Icon name="chevronRight" size={16} />
            </Link>
            {dishDescription(dish) && <p className="dish-head__desc t-muted">{dishDescription(dish)}</p>}
          </header>
        </Reveal>

        <Reveal className="dish-stats" trigger="mount" delay={60}>
          <span className="dish-stat">
            <span className="t-label">{t('price')}</span>
            <b>{formatPrice(dish.price)}</b>
          </span>
          <span className="dish-stat">
            <span className="t-label">{t('proteinPer')}</span>
            <b>{dish.proteinPerEuro === null ? t('nA') : `${formatNumber(dish.proteinPerEuro)} g`}</b>
          </span>
        </Reveal>

        <Reveal trigger="mount" delay={120}>
          <Nutrition n={n} score={dish.healthScore} isTestData={dish.isTestData} />
        </Reveal>

        <Reveal y={20}>
          <Score score={dish.healthScore} />
        </Reveal>

        <Reveal y={20}>
          <DayShare n={n} />
        </Reveal>

        <div className="dish-actions">
          <button
            className={`btn ${added ? 'btn--secondary' : 'btn--primary'} dish-actions__add`}
            onClick={() => {
              if (added) return
              logDish(dish, restaurant)
              setAdded(true)
            }}
            aria-live="polite"
          >
            <Icon name={added ? 'check' : 'plus'} size={16} />
            {added ? t('loggedForToday') : t('addToToday')}
          </button>
          <button className="btn btn--secondary dish-actions__share" onClick={() => share(target)}>
            <Icon name="share" size={16} />{t('share')}</button>
          {added && (
            <Link to={paths.today()} className="dish-actions__today">{t('viewToday')}<Icon name="arrowRight" size={14} />
            </Link>
          )}
        </div>

        <ConfirmDish dish={dish} restaurantId={restaurant.id} />

        <HowCalculated dish={dish} restaurant={restaurant} />

        <div className="dish-source">
          <p className="source-line">
            <Icon name="globe" size={14} />
            {restaurant.isTestData ? (
              <span>{t('sourceFictionalTestDataReadOn')}{' '}{formatDate(dish.menuSource.fetchedAt)}</span>
            ) : (
              <span>
                {t('source')}{' '}
                <a
                  href={dish.menuSource.url}
                  target="_blank"
                  rel="noreferrer"
                  className="source-line__link"
                  onClick={() => track('menu_tap')}
                  onAuxClick={(e) => e.button === 1 && track('menu_tap')}
                >
                  {hostOf(dish.menuSource.url)}
                  <Icon name="arrowUpRight" size={12} />
                </a>{' '}{t('readOn')}{' '}{formatDate(dish.menuSource.fetchedAt)}
              </span>
            )}
          </p>
          <button className="btn btn--ghost dish-source__report" onClick={() => setReporting(true)}>
            <Icon name="flag" size={16} />
            {reported ? t('reportedReportAgain') : t('reportAValue')}
          </button>
        </div>

        <Siblings restaurant={restaurant} siblings={siblings} />
      </div>
      <DishShareSheet target={shareTarget} onClose={() => setShareTarget(null)} />
      <ReportSheet dish={dish} open={reporting} onClose={() => setReporting(false)} />
    </>
  )
}

function Skeleton() {
  const t = useTranslation()
  return (
    <>
      <ScreenHeader title="" backTo={paths.start()} />
      <div className="page detail" aria-busy="true" aria-label={t('loadingDish')}>
        <span className="skeleton sk-hero" />
        <div className="dish-head">
          <span className="skeleton sk-line" style={{ width: 90 }} />
          <span className="skeleton sk-title" />
          <span className="skeleton sk-line" style={{ width: 180 }} />
        </div>
        <span className="skeleton sk-stats" />
        <span className="skeleton sk-card sk-card--tall" />
      </div>
    </>
  )
}

export function DishScreen({ id }: { id: string }) {
  return (
    <AppShell tab={null}>
      <ScreenBoundary keys={[`dish:${id}`]} fallback={(error, retry) => <DetailError error={error} retry={retry} what="Gericht" />}>
        <Suspense fallback={<Skeleton />}>
          <Content id={id} />
        </Suspense>
      </ScreenBoundary>
    </AppShell>
  )
}
