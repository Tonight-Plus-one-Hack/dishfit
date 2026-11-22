// "Hat das gestimmt?" on the dish page: yes or no (with an optional correction), one changeable vote per
// device, shown to everyone as "von N bestätigt". Hidden when the Worker is not reachable.
import { useTranslation, translate } from '../../i18n'
import { useEffect, useState } from 'react'
import { ApiRequestError, confirmDish, getConfirmations, type Badge, type ConfirmationTally } from '../../data/api'
import { Icon } from '../../components/Icon'
import { BadgeMoment } from './BadgeMoment'
import './community.css'

type Phase = 'idle' | 'correcting' | 'thanks'

function confirmErrorText(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 429) return translate('confirmRateLimited')
    if (error.status === 422) return translate('confirmCorrectionRejected')
  }
  return translate('confirmDishSomethingWentWrongTryAgain')
}

export function ConfirmDish({ dish, restaurantId }: { dish: { id: string; name: string }; restaurantId: string }) {
  const t = useTranslation()
  const [tally, setTally] = useState<ConfirmationTally | null>(null)
  const [offline, setOffline] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [sending, setSending] = useState(false)
  const [correction, setCorrection] = useState('')
  const [error, setError] = useState<{ text: () => string } | null>(null)
  const [badges, setBadges] = useState<Badge[]>([])

  useEffect(() => {
    let live = true
    getConfirmations(dish.id).then(
      (t) => {
        if (!live) return
        setTally(t)
        setCorrection(t.mine?.correction ?? '')
      },
      () => live && setOffline(true),
    )
    return () => {
      live = false
    }
  }, [dish.id])

  if (offline) return null

  const send = async (verdict: 'yes' | 'no') => {
    setSending(true)
    setError(null)
    try {
      const next = await confirmDish(dish.id, {
        verdict,
        correction: verdict === 'no' ? correction.trim() || undefined : undefined,
        dishName: dish.name,
        restaurantId,
      })
      setTally(next)
      setPhase('thanks')
      if (next.newBadges?.length) setBadges(next.newBadges)
    } catch (e) {
      setError({ text: () => confirmErrorText(e) })
    } finally {
      setSending(false)
    }
  }

  const mine = tally?.mine?.verdict ?? null
  const yes = tally?.yes ?? 0
  const no = tally?.no ?? 0

  return (
    <section className="cm-confirm" aria-labelledby="cm-confirm-title">
      <div className="cm-confirm__head">
        <div>
          <h2 className="cm-confirm__title" id="cm-confirm-title">{t('wasThisAccurate')}</h2>
          <p className="cm-confirm__sub">
            {tally === null ? (
              <span className="skeleton cm-confirm__sk" />
            ) : yes > 0 ? (
              <>
                <Icon name="shieldCheck" size={14} />{' '}{t(yes === 1 ? 'confirmOneVote' : 'confirmManyVotes', yes)}{no > 0 && <span className="cm-confirm__no"> · {no}{' '}{t('disagree')}</span>}
              </>
            ) : no > 0 ? (
              t(no === 1 ? 'disagreeOneVote' : 'disagreeManyVotes', no)
            ) : (
              t('haveYouEatenHereTellUs')
            )}
          </p>
        </div>
      </div>

      {phase === 'thanks' ? (
        <div className="cm-confirm__thanks" role="status">
          <span className="cm-confirm__check">
            <Icon name="check" size={18} strokeWidth={2.2} />
          </span>
          <span>
            <b>{t('thanks')}</b> {mine === 'yes' ? t('yourConfirmationHasBeenCounted') : t('wellLookIntoIt')}
          </span>
          <button className="cm-confirm__change" onClick={() => setPhase('idle')}>{t('change')}</button>
        </div>
      ) : (
        <>
          <div className="cm-confirm__buttons" role="group" aria-label={t('wasThisAccurate')}>
            <button
              className="cm-vote cm-vote--yes"
              aria-pressed={mine === 'yes'}
              disabled={sending}
              onClick={() => void send('yes')}
            >
              <Icon name="check" size={16} strokeWidth={2.2} />{t('yesItsAccurate')}</button>
            <button
              className="cm-vote cm-vote--no"
              aria-pressed={mine === 'no' || phase === 'correcting'}
              disabled={sending}
              onClick={() => setPhase('correcting')}
            >
              <Icon name="close" size={16} strokeWidth={2.2} />{t('no')}</button>
          </div>
          {phase === 'correcting' && (
            <form
              className="cm-correct"
              onSubmit={(e) => {
                e.preventDefault()
                void send('no')
              }}
            >
              <label className="cm-correct__label" htmlFor="cm-correction">{t('whatWasDifferent')}{' '}<span className="t-muted">{t('optional')}</span>
              </label>
              <textarea
                id="cm-correction"
                className="cm-correct__input"
                maxLength={200}
                rows={2}
                placeholder={t('eGNowCosts1290')}
                value={correction}
                onChange={(e) => setCorrection(e.target.value)}
              />
              <div className="cm-correct__row">
                <span className="cm-correct__count t-muted">{correction.length}/200</span>
                <button type="button" className="btn btn--ghost" onClick={() => setPhase('idle')}>{t('cancel')}</button>
                <button type="submit" className="btn btn--primary cm-pill" disabled={sending}>{t('send')}</button>
              </div>
            </form>
          )}
        </>
      )}
      {error && (
        <p className="cm-confirm__error" role="alert">
          {error.text()}
        </p>
      )}
      {badges.length > 0 && <BadgeMoment badges={badges} onClose={() => setBadges([])} />}
    </section>
  )
}
