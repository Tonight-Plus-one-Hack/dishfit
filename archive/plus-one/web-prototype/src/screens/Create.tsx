import { useMemo, useState } from 'react'
import { cityImage } from '../assets/images'
import { LegalLinks } from '../components/Chrome'
import { AgeStep, FlowBar, FlowFooter, NicknameStep, Question, UnderAgeStep, Working } from '../components/Flow'
import { Icon, type IconName } from '../components/Icon'
import { KIND_LABEL, LANGUAGE_LABEL, VIBE_LABEL, hangoutTitle, spotPlace } from '../components/labels'
import { ShareActions, type ShareTarget } from '../components/ShareSheet'
import { Meter, SpotImage } from '../components/ui'
import { ApiError, createHangout, listCities, listSpots } from '../data/api'
import { CITY_META, cityName } from '../data/cityMeta'
import {
  MAX_GROUP_SIZE,
  MIN_GROUP_SIZE,
  type CreateHangoutResponse,
  type HangoutLanguage,
  type Spot,
  type Vibe,
} from '../data/types'
import { BRAND } from '../lib/brand'
import { useLocation } from '../lib/location'
import { MOTION, prefersReducedMotion } from '../lib/motion'
import { refresh, useResource } from '../lib/resource'
import { Link } from '../lib/router'
import { navigate, paths } from '../lib/routes'
import { lastNickname, rememberNickname } from '../lib/session'
import { anchorTimes, capitalize, formatTime, nightAt, nightWord, startSlots, startWord } from '../lib/time'
import './create.css'

type QuestionId = 'vibe' | 'spot' | 'time' | 'group' | 'nickname' | 'age'
type Step = QuestionId | 'under18' | 'creating' | 'share' | 'failed'

// Display order: the easiest night first.
const VIBE_ORDER: Vibe[] = ['chill', 'bar', 'club', 'culture']
const VIBE_OPTIONS: Record<Vibe, { icon: IconName; hint: string }> = {
  chill: { icon: 'chat', hint: 'A drink and easy conversation' },
  bar: { icon: 'users', hint: 'Cocktails or pints, a round or two' },
  club: { icon: 'spark', hint: 'Warm up together, then the dance floor' },
  culture: { icon: 'ticket', hint: 'Live music, jazz or a show' },
}
const LANGUAGES: HangoutLanguage[] = ['en', 'de', 'any', 'es', 'fr', 'it', 'tr']
const SIZES = Array.from({ length: MAX_GROUP_SIZE - MIN_GROUP_SIZE + 1 }, (_, i) => MIN_GROUP_SIZE + i)
const SHOWN_SPOTS = 8

function presets(search: string) {
  const query = new URLSearchParams(search)
  return { time: query.get('time') ?? undefined, spot: query.get('spot') ?? undefined }
}

/** /new and /c/:slug/new: start a hangout in about 20 seconds, then share the link to fill it. */
export function CreateFlow({ city }: { city: string | null }) {
  return city ? <CreateInCity slug={city} /> : <PickCity />
}

function PickCity() {
  const { search } = useLocation()
  const { cities } = useResource('cities', listCities)
  return (
    <div className="flow">
      <FlowBar progress={1 / 8} closeTo={paths.cities()} label="Start a hangout progress" />
      <main className="flow__body">
        <Question title="Where are you going out?" hint="Pick your city. Plans and spots are local to it.">
          <div className="options" role="list">
            {cities.map((c) => (
              <button
                key={c.slug}
                role="listitem"
                className="option"
                onClick={() => navigate(paths.create(c.slug, presets(search)), { replace: true })}
              >
                <img className="option__thumb" src={cityImage(CITY_META[c.slug]?.image ?? '')} alt="" />
                <span className="option__text">
                  <span className="option__label">{cityName(c)}</span>
                  <span className="option__hint">
                    {c.openHangouts === 0
                      ? 'No plans yet, start the first'
                      : `${c.openHangouts} open ${c.openHangouts === 1 ? 'plan' : 'plans'}`}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </Question>
      </main>
      <LegalLinks compact />
    </div>
  )
}

function CreateInCity({ slug }: { slug: string }) {
  const { search } = useLocation()
  const { city, spots } = useResource(`spots:${slug}`, () => listSpots(slug))
  const name = cityName(city)
  const slots = useMemo(() => startSlots(city.timezone), [city.timezone])
  const preset = useMemo(() => {
    const p = presets(search)
    return {
      time: p.time && slots.includes(p.time) ? p.time : undefined,
      spot: p.spot && spots.some((s) => s.id === p.spot) ? p.spot : undefined,
    }
  }, [search, slots, spots])

  // Preset answers skip their question, so a "Start here" from a spot card or a time chip is even shorter.
  const questions = useMemo<QuestionId[]>(
    () => (['vibe', 'spot', 'time', 'group', 'nickname', 'age'] as const).filter((q) => !(q === 'spot' && preset.spot) && !(q === 'time' && preset.time)),
    [preset],
  )
  const [step, setStep] = useState<Step>(questions[0])
  const [vibe, setVibe] = useState<Vibe | null>(null)
  const [spotId, setSpotId] = useState<string | null>(preset.spot ?? null)
  const [time, setTime] = useState<string | null>(preset.time ?? null)
  const [size, setSize] = useState(6)
  const [language, setLanguage] = useState<HangoutLanguage>('en')
  const [nickname, setNickname] = useState(lastNickname)
  const [created, setCreated] = useState<CreateHangoutResponse | null>(null)
  const [failure, setFailure] = useState('')

  const spot = spots.find((s) => s.id === spotId) ?? null
  const index = questions.indexOf(step as QuestionId)
  const progress = index >= 0 ? (index + 1) / (questions.length + 1) : 1
  const next = (from: QuestionId) => setStep(questions[questions.indexOf(from) + 1] ?? 'age')
  const back = () => {
    if (step === 'under18') setStep('age')
    else if (index > 0) setStep(questions[index - 1])
    else navigate(paths.city(slug))
  }

  const create = async () => {
    if (!vibe || !spot || !time) return
    setStep('creating')
    const pause = new Promise((r) => window.setTimeout(r, prefersReducedMotion() ? 300 : MOTION.joinPauseMs))
    try {
      const result = await createHangout({
        citySlug: city.slug,
        spotId: spot.id,
        startsAt: nightAt(city.timezone, time),
        vibe,
        maxSize: size,
        language,
        host: { nickname: nickname.trim(), ageConfirmed: true },
      })
      rememberNickname(nickname.trim())
      await Promise.all([refresh(), pause])
      setCreated(result)
      setStep('share')
    } catch (error) {
      await pause
      setFailure(
        error instanceof ApiError && error.code === 'bad_request'
          ? error.message
          : 'We couldn’t save your plan. Try again in a moment.',
      )
      setStep('failed')
    }
  }

  // The context card only repeats answers already given.
  const answered = (q: QuestionId) => !questions.includes(q) || index < 0 || index > questions.indexOf(q)
  const contextTitle = vibe && spot ? hangoutTitle({ vibe }, spot.name) : spot ? spot.name : `New hangout in ${name}`
  const contextMeta = [
    answered('time') ? time : null,
    answered('group') ? `up to ${size}` : null,
    answered('group') ? LANGUAGE_LABEL[language] : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="flow">
      <FlowBar
        progress={progress}
        onBack={step === 'creating' || step === 'share' ? undefined : back}
        closeTo={created ? paths.hangout(created.hangout.id) : paths.city(slug)}
        label="Start a hangout progress"
      />

      {step !== 'share' && (
        <div className="flow__context">
          {spot ? (
            <SpotImage spot={spot} className="flow__context-thumb" />
          ) : (
            <img className="flow__context-thumb flow__context-thumb--city" src={cityImage(CITY_META[slug]?.image ?? '')} alt="" />
          )}
          <span>
            <span className="flow__context-title">{contextTitle}</span>
            <span className="t-label">{contextMeta || `${capitalize(nightWord(city.timezone))} in ${name} · about 20 seconds`}</span>
          </span>
        </div>
      )}

      <main className="flow__body" key={step}>
        {step === 'vibe' && (
          <Question title="What kind of night?" hint="Pick the mood. We suggest spots that fit it.">
            <div className="options" role="radiogroup" aria-label="Vibe">
              {VIBE_ORDER.map((v) => (
                <button
                  key={v}
                  role="radio"
                  aria-checked={vibe === v}
                  className="option"
                  data-testid={`create-vibe-${v}`}
                  onClick={() => {
                    setVibe(v)
                    next('vibe')
                  }}
                >
                  <span className="option__icon">
                    <Icon name={VIBE_OPTIONS[v].icon} size={18} />
                  </span>
                  <span className="option__text">
                    <span className="option__label">{VIBE_LABEL[v]}</span>
                    <span className="option__hint">{VIBE_OPTIONS[v].hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </Question>
        )}

        {step === 'spot' && vibe && (
          <SpotStep
            spots={spots}
            vibe={vibe}
            selected={spotId}
            onPick={(id) => {
              setSpotId(id)
              next('spot')
            }}
          />
        )}

        {step === 'time' && (
          <TimeStep
            timeZone={city.timezone}
            cityLabel={name}
            slots={slots}
            selected={time}
            backTo={paths.city(slug)}
            onPick={(t) => {
              setTime(t)
              next('time')
            }}
          />
        )}

        {step === 'group' && (
          <Question title="How big can the group get?" hint="Groups start at three and never go past eight. You count as one.">
            <div className="size" role="radiogroup" aria-label="Group size">
              {SIZES.map((n) => (
                <button key={n} role="radio" aria-checked={size === n} className="size__option" onClick={() => setSize(n)}>
                  {n}
                </button>
              ))}
            </div>
            <p className="t-muted size__note">
              Up to {size} people. The group is on once {MIN_GROUP_SIZE} are in.
            </p>
            <p className="t-label flow-label" id="language-label">
              Language at the table
            </p>
            <div className="flow-chips" role="group" aria-labelledby="language-label">
              {LANGUAGES.map((l) => (
                <button key={l} className="chip" aria-pressed={language === l} onClick={() => setLanguage(l)}>
                  {LANGUAGE_LABEL[l]}
                </button>
              ))}
            </div>
            <FlowFooter>
              <button className="btn btn--primary btn--wide" onClick={() => next('group')} data-testid="create-group-next">
                Continue
              </button>
            </FlowFooter>
          </Question>
        )}

        {step === 'nickname' && (
          <NicknameStep
            value={nickname}
            onChange={setNickname}
            onNext={() => next('nickname')}
            hint="You’re the host. A first name or nickname is enough, never your full name."
          />
        )}

        {step === 'age' && <AgeStep onAdult={create} onMinor={() => setStep('under18')} />}

        {step === 'under18' && <UnderAgeStep backTo={paths.city(slug)} backLabel={`Back to ${name}`} />}

        {step === 'creating' && spot && (
          <Working
            title="Starting your group"
            steps={['Saving the plan', `Pinning ${spot.name} on the map`, 'Getting your invite link ready']}
          />
        )}

        {step === 'failed' && (
          <Question title="That didn’t work" hint={failure}>
            <FlowFooter>
              <button className="btn btn--primary btn--wide" onClick={() => setStep(questions[0])}>
                Try again
              </button>
              <Link to={paths.city(slug)} className="btn btn--secondary btn--wide">
                Back to {name}
              </Link>
            </FlowFooter>
          </Question>
        )}

        {step === 'share' && created && spot && (
          <ShareStep result={created} spot={spot} timeZone={city.timezone} citySlug={city.slug} />
        )}
      </main>
      <LegalLinks compact />
    </div>
  )
}

function SpotStep({
  spots,
  vibe,
  selected,
  onPick,
}: {
  spots: Spot[]
  vibe: Vibe
  selected: string | null
  onPick: (id: string) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const ordered = useMemo(
    () => [...spots.filter((s) => s.vibes.includes(vibe)), ...spots.filter((s) => !s.vibes.includes(vibe))],
    [spots, vibe],
  )
  const matches = spots.filter((s) => s.vibes.includes(vibe)).length
  const shown = showAll ? ordered : ordered.slice(0, SHOWN_SPOTS)
  return (
    <Question
      title="Where do you meet?"
      hint={`Public places from our curated list${matches ? `, the best fits for ${VIBE_LABEL[vibe].toLowerCase()} first` : ''}. No private addresses.`}
    >
      <div className="options" role="radiogroup" aria-label="Spot">
        {shown.map((s) => (
          <button
            key={s.id}
            role="radio"
            aria-checked={selected === s.id}
            className="option option--spot"
            onClick={() => onPick(s.id)}
          >
            <SpotImage spot={s} className="option__thumb" />
            <span className="option__text">
              <span className="option__label">{s.name}</span>
              <span className="option__hint">
                {KIND_LABEL[s.kind]}
                {spotPlace(s) ? ` · ${spotPlace(s)}` : ''}
              </span>
            </span>
          </button>
        ))}
      </div>
      {!showAll && ordered.length > shown.length && (
        <button className="btn btn--ghost btn--wide flow-more" onClick={() => setShowAll(true)}>
          Show all {ordered.length} spots
        </button>
      )}
      <p className="t-label flow-attribution">Venues © OpenStreetMap contributors</p>
    </Question>
  )
}

function TimeStep({
  timeZone,
  cityLabel,
  slots,
  selected,
  backTo,
  onPick,
}: {
  timeZone: string
  cityLabel: string
  slots: string[]
  selected: string | null
  backTo: string
  onPick: (time: string) => void
}) {
  const anchors = anchorTimes(timeZone)
  const word = capitalize(nightWord(timeZone))
  if (slots.length === 0) {
    return (
      <Question title="It’s late for a new plan" hint={`New hangouts in ${cityLabel} can start until 03:30. Come back this afternoon.`}>
        <FlowFooter>
          <Link to={backTo} className="btn btn--secondary btn--wide">
            See what’s on
          </Link>
        </FlowFooter>
      </Question>
    )
  }
  return (
    <Question title="When do you meet?" hint={`${word} in ${cityLabel}, local time. Plans disappear at 06:00.`}>
      <div className="options" role="radiogroup" aria-label="Start time">
        {anchors.map((a) => (
          <button
            key={a.at}
            role="radio"
            aria-checked={selected === a.at}
            className="option option--plain"
            onClick={() => onPick(a.at)}
            data-testid={`create-time-${a.at}`}
          >
            <span className="option__label">{a.label}</span>
            <span className="option__time">{a.at}</span>
          </button>
        ))}
      </div>
      <label className="t-label flow-label" htmlFor="other-time">
        Another time
      </label>
      <div className="flow-select">
        <select
          id="other-time"
          value={selected && !anchors.some((a) => a.at === selected) ? selected : ''}
          onChange={(e) => e.target.value && onPick(e.target.value)}
        >
          <option value="">Pick a time</option>
          {slots.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <Icon name="chevronRight" size={16} />
      </div>
    </Question>
  )
}

function ShareStep({
  result,
  spot,
  timeZone,
  citySlug,
}: {
  result: CreateHangoutResponse
  spot: Spot
  timeZone: string
  citySlug: string
}) {
  const { hangout } = result
  const time = formatTime(hangout.startsAt, timeZone)
  const when = startWord(hangout.startsAt, timeZone)
  const needed = Math.max(0, MIN_GROUP_SIZE - hangout.memberCount)
  const title = hangoutTitle(hangout, spot.name)
  const target: ShareTarget = {
    title,
    text: `I’m starting a small group at ${spot.name}, ${when} at ${time}. ${needed > 0 ? `${needed} more and it’s on.` : 'Seats are still open.'} Want to come?`,
    url: `${BRAND.url}${paths.hangout(hangout.id)}`,
    city: citySlug,
    hangout: hangout.id,
  }
  return (
    <section className="done created" aria-labelledby="created-title">
      <span className="done__check" aria-hidden="true">
        <Icon name="check" size={28} strokeWidth={2} />
      </span>
      <h1 className="t-section done__title" id="created-title">
        {needed > 0 ? `${needed} more and the group is on` : 'Your group is on'}
      </h1>
      <p className="t-lede">
        Your plan is live. Send the link to friends, your hostel or a group chat. Anyone can join with a nickname.
      </p>
      <div className="created__card">
        <SpotImage spot={spot} className="created__thumb" />
        <span className="created__text">
          <span className="created__title">{title}</span>
          <span className="t-label">
            {capitalize(when)} {time} · {spot.name}
          </span>
        </span>
        <span className="created__meter">
          <Meter going={hangout.memberCount} max={hangout.maxSize} min={MIN_GROUP_SIZE} />
          <span className="t-label">
            {hangout.memberCount} going · {hangout.spotsLeft} {hangout.spotsLeft === 1 ? 'seat' : 'seats'} left
          </span>
        </span>
      </div>
      <FlowFooter>
        <ShareActions target={target} variant="stack" />
        <Link to={paths.hangout(hangout.id)} className="btn btn--ghost btn--wide" data-testid="create-open-hangout">
          Open your hangout
        </Link>
      </FlowFooter>
    </section>
  )
}
