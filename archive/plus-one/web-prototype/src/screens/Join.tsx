import { useState } from 'react'
import { LegalLinks } from '../components/Chrome'
import { AgeStep, FlowBar, FlowFooter, NicknameStep, Question, UnderAgeStep, Working } from '../components/Flow'
import { Icon, type IconName } from '../components/Icon'
import { ShareSheet, type ShareTarget } from '../components/ShareSheet'
import { SpotImage } from '../components/ui'
import { hangoutTitle, spotPlace } from '../components/labels'
import { ApiError, getCityTonight, getHangout, joinHangout } from '../data/api'
import { cityName } from '../data/cityMeta'
import { ABOUT_LINES } from '../data/hangouts'
import { SAFETY_HINTS } from '../data/safety'
import { KIND_IMAGES } from '../assets/images'
import { BRAND } from '../lib/brand'
import { Link } from '../lib/router'
import { navigate, paths } from '../lib/routes'
import { MOTION, prefersReducedMotion } from '../lib/motion'
import { refresh, useResource } from '../lib/resource'
import { lastNickname, rememberNickname } from '../lib/session'
import { formatTime, startWord } from '../lib/time'

type Step = 'nickname' | 'mood' | 'age' | 'under18' | 'joining' | 'done' | 'failed'
type Mood = 'chill' | 'talk' | 'dance' | 'explore'
const QUESTION_STEPS: Step[] = ['nickname', 'mood', 'age']

// The mood answer becomes the member's `about` line, which the group sees next to the nickname.
const MOODS: Array<{ id: Mood; label: string; icon: IconName; hint: string; about: string }> = [
  { id: 'chill', label: 'Chill drinks', icon: 'clock', hint: 'A drink, easy company, no agenda', about: ABOUT_LINES[0] },
  { id: 'talk', label: 'Good talks', icon: 'chat', hint: 'Real conversations with new people', about: ABOUT_LINES[1] },
  { id: 'dance', label: 'Dancing', icon: 'spark', hint: 'Warm up together, then the dance floor', about: ABOUT_LINES[2] },
  { id: 'explore', label: 'Open for anything', icon: 'city', hint: 'See where the night takes the group', about: ABOUT_LINES[3] },
]

export function JoinFlow({ id }: { id: string }) {
  const { hangout, spot, members, viewerMemberId } = useResource(`hangout:${id}`, () => getHangout(id))
  const { city } = useResource(`city:${hangout.citySlug}`, () => getCityTonight(hangout.citySlug))
  const already = members.find((m) => m.id === viewerMemberId) ?? null
  const [step, setStep] = useState<Step>(already ? 'done' : 'nickname')
  const [nickname, setNickname] = useState(() => already?.nickname ?? lastNickname())
  const [mood, setMood] = useState<Mood | null>(null)
  const [failure, setFailure] = useState('')
  const [share, setShare] = useState<ShareTarget | null>(null)
  const time = formatTime(hangout.startsAt, city.timezone)
  const when = startWord(hangout.startsAt, city.timezone)
  const title = hangoutTitle(hangout, spot.name)

  const index = QUESTION_STEPS.indexOf(step)
  const progress = step === 'joining' || step === 'done' ? 1 : step === 'under18' ? 1 : (index + 1) / (QUESTION_STEPS.length + 1)

  const back = () => {
    if (step === 'mood') setStep('nickname')
    else if (step === 'age' || step === 'under18') setStep('mood')
    else navigate(paths.hangout(hangout.id))
  }

  const confirmAdult = async () => {
    setStep('joining')
    const pause = new Promise((r) => window.setTimeout(r, prefersReducedMotion() ? 300 : MOTION.joinPauseMs))
    try {
      const about = MOODS.find((m) => m.id === mood)?.about
      await joinHangout(hangout.id, { nickname: nickname.trim(), about, ageConfirmed: true })
      rememberNickname(nickname.trim())
      await Promise.all([refresh(), pause])
      setStep('done')
    } catch (error) {
      await pause
      setFailure(
        error instanceof ApiError && error.code === 'hangout_full'
          ? 'Someone took the last seat a moment ago.'
          : 'We couldn’t save your seat. Try again in a moment.',
      )
      setStep('failed')
    }
  }

  const openShare = () =>
    setShare({
      title,
      text: `I’m going to “${title}” at ${spot.name}, ${time} ${when}. Join us on ${BRAND.name}:`,
      url: `${BRAND.url}${paths.hangout(hangout.id)}`,
      city: city.slug,
      hangout: hangout.id,
      image: KIND_IMAGES[spot.kind],
      meta: `${time} · ${spot.name}`,
    })

  return (
    <div className="flow">
      <FlowBar
        progress={progress}
        onBack={step !== 'done' && step !== 'joining' ? back : undefined}
        closeTo={paths.hangout(hangout.id)}
        label="Join progress"
      />

      <div className="flow__context">
        <SpotImage spot={spot} className="flow__context-thumb" />
        <span>
          <span className="flow__context-title">{title}</span>
          <span className="t-label">
            {time} · {spot.name}
          </span>
        </span>
      </div>

      <main className="flow__body" key={step}>
        {step === 'nickname' && <NicknameStep value={nickname} onChange={setNickname} onNext={() => setStep('mood')} />}

        {step === 'mood' && (
          <Question title="What are you in the mood for?" hint="The group sees this next to your nickname.">
            <div className="options" role="radiogroup" aria-label="Mood">
              {MOODS.map((m) => (
                <button
                  key={m.id}
                  role="radio"
                  aria-checked={mood === m.id}
                  className="option"
                  onClick={() => setMood(m.id)}
                >
                  <span className="option__icon">
                    <Icon name={m.icon} size={18} />
                  </span>
                  <span className="option__text">
                    <span className="option__label">{m.label}</span>
                    <span className="option__hint">{m.hint}</span>
                  </span>
                </button>
              ))}
            </div>
            <FlowFooter>
              <button className="btn btn--primary btn--wide" disabled={!mood} onClick={() => setStep('age')}>
                Continue
              </button>
            </FlowFooter>
          </Question>
        )}

        {step === 'age' && <AgeStep onAdult={confirmAdult} onMinor={() => setStep('under18')} />}

        {step === 'under18' && <UnderAgeStep backTo={paths.city(city.slug)} backLabel={`Back to ${cityName(city)}`} />}

        {step === 'failed' && (
          <Question title="That didn’t work" hint={failure}>
            <FlowFooter>
              <Link to={paths.city(city.slug)} className="btn btn--primary btn--wide">
                See other plans in {cityName(city)}
              </Link>
            </FlowFooter>
          </Question>
        )}

        {step === 'joining' && (
          <Working title="Joining the group" steps={['Saving your seat', 'Letting the group know', `Pulling up ${spot.name}`]} />
        )}

        {step === 'done' && (
          <section className="done" aria-labelledby="done-title">
            <span className="done__check" aria-hidden="true">
              <Icon name="check" size={28} strokeWidth={2} />
            </span>
            <h1 className="t-section done__title" id="done-title">
              You’re in, {nickname.trim()}
            </h1>
            <p className="t-lede">
              See you at {spot.name}
              {spotPlace(spot) ? ` in ${spotPlace(spot)}` : ''} at {time}.
            </p>
            <ul className="done__hints">
              {SAFETY_HINTS.map((hint, i) => (
                <li key={hint.title} className="done__hint" style={{ animationDelay: `${200 + i * 70}ms` }}>
                  <span className="icon-badge icon-badge--sm">
                    <Icon name={hint.icon} size={16} />
                  </span>
                  <span>
                    <span className="done__hint-title">{hint.title}</span>
                    <span className="t-muted done__hint-body">{hint.body}</span>
                  </span>
                </li>
              ))}
            </ul>
            <FlowFooter>
              <Link to={paths.hangout(hangout.id)} className="btn btn--primary btn--wide">
                Open hangout
              </Link>
              <button className="btn btn--secondary btn--wide" onClick={openShare}>
                <Icon name="share" size={14} /> Invite a friend
              </button>
            </FlowFooter>
          </section>
        )}
      </main>
      <LegalLinks compact />
      <ShareSheet target={share} onClose={() => setShare(null)} />
    </div>
  )
}
