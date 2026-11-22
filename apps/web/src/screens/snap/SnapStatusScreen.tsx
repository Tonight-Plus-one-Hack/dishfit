// /scan/:id: what became of a menu photo. Polls the Worker while the review runs ("Wird geprüft"),
// then shows "Online" with the dish count or "Abgelehnt: Grund". The thank-you moment counts the restaurants
// this device added menus for (contributions.ts).
import { rejectionText } from './messages'
import { localizedFormatter, useTranslation } from '../../i18n'
import { useCallback, useEffect, useRef, useState } from 'react'
import { FlowBar, FlowFooter } from '../../components/Flow'
import { Icon } from '../../components/Icon'
import { ApiRequestError, getSubmission, type SubmissionView } from '../../data/api'
import { Link } from '../../lib/router'
import { navigate, paths } from '../../lib/routes'
import { UnseenBadges } from '../community/BadgeMoment'
import '../community/community.css'
import { contributedRestaurants, dropContribution, restaurantKey } from './contributions'
import './snap.css'

const POLL_MS = 3000
const POLL_FOR_MS = 2 * 60_000

const isFinal = (s: SubmissionView) => s.status === 'published' || s.status === 'rejected'
const dateTime = localizedFormatter((lang) => new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }))

type Load = { state: 'loading' } | { state: 'ok'; submission: SubmissionView } | { state: 'error'; notFound: boolean }

function useSubmission(id: string) {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [polling, setPolling] = useState(true)
  const started = useRef(0)

  const fetchOnce = useCallback(async () => {
    try {
      const submission = await getSubmission(id)
      setLoad({ state: 'ok', submission })
      return submission
    } catch (error) {
      setLoad((prev) =>
        prev.state === 'ok' ? prev : { state: 'error', notFound: error instanceof ApiRequestError && error.status === 404 },
      )
      return null
    }
  }, [id])

  useEffect(() => {
    let timer: number | undefined
    let live = true
    started.current = Date.now()
    const tick = async () => {
      const s = await fetchOnce()
      if (!live) return
      const expired = Date.now() - started.current > POLL_FOR_MS
      if ((s && isFinal(s)) || expired) {
        setPolling(false)
        return
      }
      timer = window.setTimeout(tick, POLL_MS)
    }
    void tick()
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [fetchOnce])

  return { load, polling, refresh: fetchOnce }
}

function ThankYou({ count }: { count: number }) {
  const t = useTranslation()
  return (
    <div className="snap-thanks">
      <span className="done__check">
        <Icon name="check" size={26} strokeWidth={2} />
      </span>
      <p className="t-label">{t('thanks')}</p>
      <p className="snap-thanks__num">{count}</p>
      <p className="snap-thanks__label">{t('addedRestaurants', count === 1 ? t('count1Restaurant') : t('count1Restaurants', count))}</p>
      <Link to={paths.me()} className="cm-thanks-link">{t('yourContributionsAndBadges')}<Icon name="arrowRight" size={14} />
      </Link>
    </div>
  )
}

function StatusCard({ submission, polling, onRefresh }: { submission: SubmissionView; polling: boolean; onRefresh: () => void }) {
  const t = useTranslation()
  const { status, restaurant } = submission
  if (status === 'published') {
    return (
      <section className="snap-status snap-status--online" aria-live="polite">
        <p className="snap-status__state">
          <span className="snap-status__dot" />{t('published')}</p>
        <h2 className="snap-status__title">
          {submission.dishCount === 1 ? t('count1DishIsNowOnline') : t('count1DishesAreNowOnline', submission.dishCount)}
        </h2>
        <p className="t-muted">
          {restaurant.name}{t('withACommunityLabelAndDate')}</p>
      </section>
    )
  }
  if (status === 'rejected') {
    return (
      <section className="snap-status snap-status--rejected" aria-live="polite">
        <p className="snap-status__state">
          <span className="snap-status__dot" />{t('unpublished')}</p>
        <h2 className="snap-status__title">{t('snapStatusScreenRejected')}{' '}{rejectionText(submission.reason)}</h2>
        <p className="t-muted">{t('youCanTakeAnotherPhotoKeep')}</p>
      </section>
    )
  }
  return (
    <section className="snap-status snap-status--checking" aria-live="polite">
      <p className="snap-status__state">
        <span className="snap-status__pulse" aria-hidden="true" />{t('underReview')}</p>
      <h2 className="snap-status__title">{restaurant.name}</h2>
      <p className="t-muted">
        {status === 'review' || restaurant.isNew
          ? t('aTeamMemberIsStillReviewing')
          : t('ourReviewAgentIsReadingThe')}
      </p>
      {!polling && (
        <button type="button" className="btn btn--secondary snap-status__refresh" onClick={onRefresh}>{t('refresh')}</button>
      )}
    </section>
  )
}

export function SnapStatusScreen({ id }: { id: string }) {
  const t = useTranslation()
  const { load, polling, refresh } = useSubmission(id)
  const submission = load.state === 'ok' ? load.submission : null
  const rejected = submission?.status === 'rejected'

  useEffect(() => {
    if (rejected) dropContribution(id)
  }, [rejected, id])

  const close = () => navigate(submission?.restaurant.id ? paths.restaurant(submission.restaurant.id) : paths.map(), { replace: true })
  const count = submission ? contributedRestaurants(rejected ? null : restaurantKey(submission.restaurant)) : 1

  return (
    <div className="flow snap">
      <FlowBar progress={1} label={t('menuSubmitted')} onClose={close} />
      <div className="flow__body">
        {load.state === 'loading' && (
          <section className="snap-status snap-status--checking" aria-busy="true">
            <p className="snap-status__state">
              <span className="snap-status__pulse" aria-hidden="true" />{t('loadingStatus')}</p>
          </section>
        )}

        {load.state === 'error' && (
          <div className="snap-status-wrap">
            <section className="snap-status snap-status--rejected" role="alert">
              <h2 className="snap-status__title">{load.notFound ? t('thisContributionDoesntExist') : t('statusCurrentlyUnavailable')}</h2>
              <p className="t-muted">
                {load.notFound ? t('theLinkIsIncorrectOrThe') : t('checkYourConnectionAndTryAgain')}
              </p>
              {!load.notFound && (
                <button type="button" className="btn btn--secondary snap-status__refresh" onClick={() => void refresh()}>{t('refresh')}</button>
              )}
            </section>
          </div>
        )}

        {submission && (
          <div className="snap-status-wrap">
            {rejected ? (
              <div className="snap-thanks">
                <p className="t-label">{t('thanksForContributing')}</p>
                <h1 className="snap-thanks__label">{t('thisPhotoWasntPublished')}</h1>
              </div>
            ) : (
              <ThankYou count={count} />
            )}
            <StatusCard submission={submission} polling={polling} onRefresh={() => void refresh()} />
            <p className="snap-small t-muted">{t('submittedOn')}{' '}{dateTime().format(new Date(submission.createdAt))}</p>
          </div>
        )}
        {submission && <UnseenBadges />}

        <FlowFooter>
          {submission?.status === 'published' && submission.restaurant.id && (
            <button className="btn btn--primary btn--wide" onClick={() => navigate(paths.restaurant(submission.restaurant.id!))}>{t('viewRestaurant')}<Icon name="arrowRight" size={16} />
            </button>
          )}
          {rejected && (
            <button
              className="btn btn--primary btn--wide"
              onClick={() =>
                navigate(
                  submission.restaurant.id
                    ? paths.snap({ id: submission.restaurant.id, name: submission.restaurant.name })
                    : paths.snap(),
                )
              }
            >
              <Icon name="camera" size={16} />{t('sendAnotherPhoto')}</button>
          )}
          {(!submission || !isFinal(submission)) && (
            <button className="btn btn--secondary btn--wide" onClick={close}>{t('keepExploring')}</button>
          )}
        </FlowFooter>
      </div>
    </div>
  )
}
