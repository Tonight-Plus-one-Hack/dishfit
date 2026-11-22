// Goal setup in the Cal AI pattern: one question per screen (goal, kcal, protein, diet, location),
// a short count-up while we pick, then "3 Gerichte, die heute zu dir passen".
// Never a gate: the bar can always close it. /onboarding?edit=<step> edits one answer and returns to Today.
import { useTranslation } from '../../i18n'
import { Suspense, useCallback, useEffect, useState } from 'react'
import { DishHeroCard, DishHeroCardSkeleton } from '../../components/DishHeroCard'
import { FlowBar, FlowFooter, Option, Question } from '../../components/Flow'
import type { ArtName } from '../../components/glyphs/Art'
import type { Kiez } from '../../data/api'
import { useSearchParams } from '../../lib/location'
import { prefersReducedMotion } from '../../lib/motion'
import { isLocationFailure, requestPosition, saveLocationKiez, usePosition } from '../../lib/position'
import { saveProfile, useProfile, type Goal, type Profile } from '../../lib/profile'
import { useResource } from '../../lib/resource'
import { back, navigate, paths } from '../../lib/routes'
import { NumberField } from './NumberField'
import { LocationKieze, LocationQuestion } from './LocationStep'
import { pickDishes, pickInput, picksKey, type PickInput } from './picks'
import {
  DEFAULT_MEAL_BUDGET,
  DIETS,
  GOAL_LABEL,
  GOAL_PHRASE,
  GOALS,
  KCAL_LIMITS,
  KCAL_SUGGESTIONS,
  PROTEIN_LIMITS,
  PROTEIN_SUGGESTIONS,
  dietChoice,
  dietOf,
  formatInt,
  inLimits,
  type DietChoice,
  type Suggestion,
} from './targets'
import { useCountUp } from './useCountUp'
import './onboarding.css'

/** Illustration per goal, from the icon set. */
const GOAL_ART: Record<Goal, ArtName> = { lose: 'onb-lose-weight', gain: 'onb-build-muscle', maintain: 'onb-eat-balanced' }

type StepId = 'goal' | 'kcal' | 'protein' | 'diet' | 'place'
type Phase = StepId | 'working' | 'result'

const STEPS: StepId[] = ['goal', 'kcal', 'protein', 'diet', 'place']

/** Count-up length and the whole working pause; together they stay under 1.5 s. */
const COUNT_MS = 1000
const WORKING_MS = 1400
const WORKING_REDUCED_MS = 500

interface Draft {
  goal: Goal | null
  kcal: number | null
  kcalCustom: boolean
  protein: number | null
  proteinCustom: boolean
  diet: DietChoice | null
  place: 'near' | 'kiez' | null
  kiez: Kiez | null
}

const isSuggested = (list: Suggestion[], value: number) => list.some((s) => s.value === value)
const recommended = (list: Suggestion[]) => (list.find((s) => s.recommended) ?? list[0]).value

function draftFrom(profile: Profile | null): Draft {
  if (!profile) {
    return { goal: null, kcal: null, kcalCustom: false, protein: null, proteinCustom: false, diet: null, place: null, kiez: null }
  }
  return {
    goal: profile.goal,
    kcal: profile.kcalTarget,
    kcalCustom: !isSuggested(KCAL_SUGGESTIONS[profile.goal], profile.kcalTarget),
    protein: profile.proteinTarget,
    proteinCustom: !isSuggested(PROTEIN_SUGGESTIONS[profile.goal], profile.proteinTarget),
    diet: dietChoice(profile.diet),
    place: profile.kiez ? 'kiez' : 'near',
    kiez: profile.kiez,
  }
}

function isValid(step: StepId, d: Draft): boolean {
  switch (step) {
    case 'goal':
      return d.goal !== null
    case 'kcal':
      return inLimits(d.kcal, KCAL_LIMITS)
    case 'protein':
      return inLimits(d.protein, PROTEIN_LIMITS)
    case 'diet':
      return d.diet !== null
    case 'place':
      return d.place === 'near' || (d.place === 'kiez' && d.kiez !== null)
  }
}

function profileFrom(d: Draft, previous: Profile | null): Profile {
  return {
    goal: d.goal!,
    kcalTarget: d.kcal!,
    proteinTarget: d.protein!,
    mealBudget: previous?.mealBudget ?? DEFAULT_MEAL_BUDGET,
    diet: dietOf(d.diet ?? 'all'),
    kiez: d.place === 'kiez' ? d.kiez : null,
    onboardedAt: new Date().toISOString(),
  }
}

export function OnboardingScreen() {
  const t = useTranslation()
  const profile = useProfile()
  const { position } = usePosition()
  const params = useSearchParams()
  const editParam = params.get('edit') as StepId | null
  const [edit] = useState<StepId | null>(() => (profile && editParam && STEPS.includes(editParam) ? editParam : null))
  const [draft, setDraft] = useState<Draft>(() => draftFrom(profile))
  const [phase, setPhase] = useState<Phase>(edit ?? 'goal')
  const [input, setInput] = useState<PickInput | null>(null)

  const toResult = useCallback(() => setPhase('result'), [])
  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
  const close = () => back(edit ? paths.today() : paths.start())

  const chooseGoal = (goal: Goal) =>
    setDraft((d) => ({
      ...d,
      goal,
      // Targets follow the goal unless the user typed their own value.
      kcal: d.kcalCustom && d.kcal !== null ? d.kcal : recommended(KCAL_SUGGESTIONS[goal]),
      kcalCustom: d.kcalCustom && d.kcal !== null,
      protein: d.proteinCustom && d.protein !== null ? d.protein : recommended(PROTEIN_SUGGESTIONS[goal]),
      proteinCustom: d.proteinCustom && d.protein !== null,
    }))

  const finish = (d: Draft) => {
    const next = profileFrom(d, profile)
    saveProfile(next)
    if (!edit || edit === 'place') saveLocationKiez(next.kiez)
    if (edit) {
      back(paths.today())
      return
    }
    setInput(pickInput(next, position))
    setPhase('working')
  }

  const advance = (d: Draft = draft) => {
    if (phase === 'working' || phase === 'result') return
    const i = STEPS.indexOf(phase)
    if (edit || i === STEPS.length - 1) finish(d)
    else setPhase(STEPS[i + 1])
  }

  if (phase === 'working' && input) {
    return (
      <div className="flow onboarding">
        <FlowBar progress={(STEPS.length + 0.5) / (STEPS.length + 1)} label={t('setup')} />
        <div className="flow__body">
          <WorkingPhase input={input} draft={draft} onDone={toResult} />
        </div>
      </div>
    )
  }

  if (phase === 'result' && input) {
    return (
      <div className="flow onboarding">
        <FlowBar progress={1} label={t('setup')} onClose={() => navigate(paths.start(), { replace: true })} />
        <div className="flow__body">
          <ResultPhase input={input} />
        </div>
      </div>
    )
  }

  const step = phase as StepId
  const index = STEPS.indexOf(step)
  const valid = isValid(step, draft)
  const last = index === STEPS.length - 1
  const goal = draft.goal ?? 'maintain'

  return (
    <div className="flow onboarding">
      <FlowBar
        progress={edit ? 1 : (index + 1) / (STEPS.length + 1)}
        label={edit ? t('editGoal') : t('question1Of2', index + 1, STEPS.length)}
        onBack={!edit && index > 0 ? () => setPhase(STEPS[index - 1]) : undefined}
        onClose={close}
      />
      <div className="flow__body" key={step}>
        {step === 'goal' && (
          <Question title={t('whatsYourGoal')} hint={t('weUseItToRankDishes')}>
            <div className="options" role="radiogroup" aria-labelledby="q-title">
              {GOALS.map((g) => (
                <Option
                  key={g.goal}
                  icon={g.icon}
                  art={GOAL_ART[g.goal]}
                  label={g.label}
                  hint={g.hint}
                  checked={draft.goal === g.goal}
                  onSelect={() => chooseGoal(g.goal)}
                />
              ))}
            </div>
            {edit && <p className="t-muted onb-note">{t('caloriesAndProteinAdjustUnlessYouve')}</p>}
          </Question>
        )}

        {step === 'kcal' && (
          <Question
            title={t('howManyCaloriesPerDay')}
            hint={t('aSuggestedTarget1YouCan', GOAL_PHRASE[goal])}
          >
            <TargetOptions
              suggestions={KCAL_SUGGESTIONS[goal]}
              unit="kcal"
              value={draft.kcal}
              custom={draft.kcalCustom}
              limits={KCAL_LIMITS}
              label={t('caloriesPerDay')}
              onPick={(kcal) => update({ kcal, kcalCustom: false })}
              onCustom={() => update({ kcalCustom: true })}
              onChange={(kcal) => update({ kcal })}
            />
          </Question>
        )}

        {step === 'protein' && (
          <Question title={t('howMuchProteinPerDay')} hint={t('proteinHelpsYouFeelFullAnd')}>
            <TargetOptions
              suggestions={PROTEIN_SUGGESTIONS[goal]}
              unit="g"
              value={draft.protein}
              custom={draft.proteinCustom}
              limits={PROTEIN_LIMITS}
              label={t('gramsOfProteinPerDay')}
              onPick={(protein) => update({ protein, proteinCustom: false })}
              onCustom={() => update({ proteinCustom: true })}
              onChange={(protein) => update({ protein })}
            />
          </Question>
        )}

        {step === 'diet' && (
          <Question title={t('howDoYouEat')} hint={t('wellShowDishesThatMatchYour')}>
            <div className="options" role="radiogroup" aria-labelledby="q-title">
              {DIETS.map((d) => (
                <Option
                  key={d.diet}
                  icon={d.icon}
                  label={d.label}
                  hint={d.hint}
                  checked={draft.diet === d.diet}
                  onSelect={() => update({ diet: d.diet })}
                />
              ))}
            </div>
          </Question>
        )}

        {step === 'place' && <PlaceStep draft={draft} update={update} />}

        <FlowFooter>
          <button className="btn btn--primary btn--wide" disabled={!valid} onClick={() => advance()}>
            {edit ? t('save') : last ? t('findDishes') : t('continue')}
          </button>
          {step === 'diet' && !edit && (
            <button
              className="btn btn--ghost btn--wide"
              onClick={() => {
                const next = { ...draft, diet: null }
                setDraft(next)
                advance(next)
              }}
            >{t('skip')}</button>
          )}
        </FlowFooter>
      </div>
    </div>
  )
}

function TargetOptions({
  suggestions,
  unit,
  value,
  custom,
  limits,
  label,
  onPick,
  onCustom,
  onChange,
}: {
  suggestions: Suggestion[]
  unit: string
  value: number | null
  custom: boolean
  limits: { min: number; max: number; step: number }
  label: string
  onPick: (value: number) => void
  onCustom: () => void
  onChange: (value: number | null) => void
}) {
  const t = useTranslation()
  return (
    <>
      <div className="options" role="radiogroup" aria-labelledby="q-title">
        {suggestions.map((s) => (
          <Option
            key={s.value}
            label={`${formatInt(s.value)} ${unit}`}
            hint={s.recommended ? t('recommended1', s.hint) : s.hint}
            checked={!custom && value === s.value}
            onSelect={() => onPick(s.value)}
          />
        ))}
        <Option label={t('customValue')} hint={t('enterYourOwn')} checked={custom} onSelect={onCustom} />
      </div>
      {custom && (
        <NumberField value={value} onChange={onChange} min={limits.min} max={limits.max} step={limits.step} unit={unit} label={label} />
      )}
    </>
  )
}

function PlaceStep({ draft, update }: { draft: Draft; update: (patch: Partial<Draft>) => void }) {
  const t = useTranslation()
  const { status } = usePosition()
  const manual = isLocationFailure(status)
  const nearHint =
    status === 'granted'
      ? t('locationAccessGranted')
      : status === 'locating'
        ? t('locating')
        : t('asksForYourLocationOnce')
  return (
    <LocationQuestion title={t('whereDoYouUsuallyLookFor')} hint={t('forDistancesAndDishesInYour')}>
      <div className="options" role="radiogroup" aria-labelledby="q-title">
        <Option
          icon="locate"
          label={t('nearMe')}
          hint={nearHint}
          checked={draft.place === 'near'}
          onSelect={() => {
            update({ place: 'near' })
            if (status !== 'granted' && status !== 'locating') requestPosition()
          }}
        />
        <Option
          icon="city"
          label={t('inANeighbourhood')}
          hint={t('withoutSharingLocation')}
          checked={draft.place === 'kiez'}
          onSelect={() => update({ place: 'kiez' })}
        />
      </div>
      {(draft.place === 'kiez' || manual) && <LocationKieze value={draft.kiez} onPick={(kiez) => update({ place: 'kiez', kiez })} />}
    </LocationQuestion>
  )
}

function WorkingPhase({ input, draft, onDone }: { input: PickInput; draft: Draft; onDone: () => void }) {
  const t = useTranslation()
  useEffect(() => {
    const t = window.setTimeout(onDone, prefersReducedMotion() ? WORKING_REDUCED_MS : WORKING_MS)
    return () => window.clearTimeout(t)
  }, [onDone])
  const steps = [
    t('count1KcalAnd2GProtein', formatInt(input.kcalTarget), input.proteinTarget),
    draft.diet && draft.diet !== 'all' ? t(draft.diet === 'vegan' ? 'onlyVeganDishes' : 'onlyVegetarianDishes') : t('allCuisines'),
    input.kiez ? t('around1', input.kiez) : t('nearYou'),
  ]
  return (
    <section className="joining onb-working" aria-live="polite">
      <div className="onb-working__head">
        <p className="t-label">{t('oneMoment')}</p>
        <h1 className="t-section">{t('findingYourDishes')}</h1>
      </div>
      <Suspense fallback={<Counter value={0} />}>
        <CheckedCounter input={input} />
      </Suspense>
      <ul className="joining__steps">
        {steps.map((s, i) => (
          <li key={s} style={{ animationDelay: `${i * 300}ms` }}>
            <span className="joining__tick" style={{ animationDelay: `${i * 300 + 200}ms` }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            {s}
          </li>
        ))}
      </ul>
    </section>
  )
}

function CheckedCounter({ input }: { input: PickInput }) {
  const { checked } = useResource(picksKey(input), () => pickDishes(input))
  return <Counter value={useCountUp(checked, COUNT_MS)} />
}

function Counter({ value }: { value: number }) {
  const t = useTranslation()
  return (
    <p className="onb-count">
      <span className="onb-count__num">{formatInt(value)}</span>
      <span className="onb-count__label">{t('dishesChecked')}</span>
    </p>
  )
}

function ResultPhase({ input }: { input: PickInput }) {
  const t = useTranslation()
  return (
    <section className="onb-result" aria-labelledby="result-title">
      <Suspense fallback={<ResultSkeleton />}>
        <ResultPicks input={input} />
      </Suspense>
      <FlowFooter>
        <button className="btn btn--primary btn--wide" onClick={() => navigate(paths.start(), { replace: true })}>{t('letsGo')}</button>
        <button className="btn btn--ghost btn--wide" onClick={() => navigate(paths.today(), { replace: true })}>{t('onboardingScreenGoToToday')}</button>
      </FlowFooter>
    </section>
  )
}

function ResultHead({ count, input }: { count: number; input: PickInput }) {
  const t = useTranslation()
  const title =
    count === 0 ? t('nothingFitsToday') : t(count === 1 ? 'dishFitsToday' : 'dishesFitToday', count)
  return (
    <header className="onb-result__head">
      <p className="t-label">{t('yourGoal')}{' '}{GOAL_LABEL[input.goal]}</p>
      <h1 className="t-section" id="result-title">
        {title}
      </h1>
      <p className="t-muted">
        {count === 0
          ? t('weDontHaveAnyMatchingDishes')
          : t('upToAbout1KcalPer', formatInt(Math.round((input.kcalTarget * 0.4) / 50) * 50))}
      </p>
    </header>
  )
}

function ResultPicks({ input }: { input: PickInput }) {
  const t = useTranslation()
  const { picks } = useResource(picksKey(input), () => pickDishes(input))
  return (
    <>
      <ResultHead count={picks.length} input={input} />
      <ul className="onb-picks">
        {picks.map((r, i) => (
          <li key={r.dish.id} className="onb-picks__item" style={{ animationDelay: `${120 + i * 90}ms` }}>
            <DishHeroCard
              result={r}
              note={t('ofProteinGoal', Math.round((r.dish.nutrition.protein.value / input.proteinTarget) * 100))}
            />
          </li>
        ))}
      </ul>
    </>
  )
}

function ResultSkeleton() {
  const t = useTranslation()
  return (
    <div className="onb-result__loading" aria-busy="true" aria-label={t('onboardingScreenLoadingDishes')}>
      <div className="skeleton onb-result__sk-title" />
      <DishHeroCardSkeleton />
    </div>
  )
}
