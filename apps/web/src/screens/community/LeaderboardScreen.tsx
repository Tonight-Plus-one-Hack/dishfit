// Kiez leaderboard (/bestenliste?k=<kiez>&p=week|all): scanners ranked by menu photos that went online.
import { useTranslation } from '../../i18n'
import { AppShell, ScreenHeader } from '../../app/AppShell'
import { Icon } from '../../components/Icon'
import { getLeaderboard, type LeaderboardPeriod, type LeaderboardView } from '../../data/api'
import { useLocation } from '../../lib/location'
import { Link } from '../../lib/router'
import { navigate, paths } from '../../lib/routes'
import { KIEZ_NAMES, useLoaded } from './community'
import { Avatar } from './shared'
import './community.css'

const KIEZ_ORDER = Object.keys(KIEZ_NAMES)

function useBoardQuery(): { kiez: string | null; period: LeaderboardPeriod } {
  const { search } = useLocation()
  const q = new URLSearchParams(search)
  const k = q.get('k')
  return { kiez: k && k in KIEZ_NAMES ? k : null, period: q.get('p') === 'all' ? 'all' : 'week' }
}

function hrefFor(kiez: string | null, period: LeaderboardPeriod) {
  const q = new URLSearchParams()
  if (kiez) q.set('k', kiez)
  if (period === 'all') q.set('p', 'all')
  const s = q.toString()
  return s ? `/bestenliste?${s}` : '/bestenliste'
}

function Board({ board, kiez }: { board: LeaderboardView; kiez: string | null }) {
  const t = useTranslation()
  const where = kiez ? KIEZ_NAMES[kiez] : t('berlin')
  if (board.entries.length === 0) {
    return (
      <div className="cm-card cm-board-empty">
        <span className="cm-board-empty__icon">
          <Icon name="camera" size={26} strokeWidth={1.8} />
        </span>
        <h2 className="cm-card__title">{t('noLeaderboardEntries', where)}</h2>
        <p className="t-muted">
          {t(board.period === 'week' ? 'firstMenuThisWeek' : 'firstMenuInNeighbourhood')}</p>
        <Link to={paths.snap()} className="btn btn--primary cm-pill">{t('scanAMenu')}</Link>
      </div>
    )
  }
  const top = board.entries[0]!.scans
  return (
    <ol className="cm-card cm-board">
      {board.entries.map((e) => (
        <li key={`${e.rank}-${e.nickname}`} className={`cm-rank ${e.isMe ? 'cm-rank--me' : ''} ${e.rank <= 3 ? `cm-rank--top cm-rank--${e.rank}` : ''}`}>
          <span className="cm-rank__pos">{e.rank}</span>
          <Avatar name={e.nickname} size={40} me={e.isMe} />
          <span className="cm-rank__main">
            <span className="cm-rank__name">
              {e.nickname}
              {e.isMe && <span className="cm-you">{t('you')}</span>}
            </span>
            <span className="cm-rank__bar" aria-hidden="true">
              <span style={{ width: `${Math.max(8, (e.scans / top) * 100)}%` }} />
            </span>
          </span>
          <span className="cm-rank__score">
            <b>{e.scans}</b>
            <span>{e.scans === 1 ? t('map') : t('menus')}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}

export function LeaderboardScreen() {
  const t = useTranslation()
  const { kiez, period } = useBoardQuery()
  const [board, reload] = useLoaded(`${kiez}:${period}`, () => getLeaderboard(kiez, period))
  return (
    <AppShell tab={null}>
      <ScreenHeader title={t('neighbourhoodLeaderboard')} backTo={paths.me()} />
      <div className="page cm-page">
        <header className="cm-board-head">
          <p className="cm-board-head__eyebrow">{t('whoScansTheMostMenus')}</p>
          <h1 className="cm-board-head__title">{kiez ? KIEZ_NAMES[kiez] : t('allOfBerlin')}</h1>
          <div className="cm-seg cm-seg--wide" role="tablist" aria-label={t('timePeriod')}>
            {(['week', 'all'] as const).map((p) => (
              <button key={p} role="tab" aria-selected={period === p} onClick={() => navigate(hrefFor(kiez, p), { replace: true })}>
                {p === 'week' ? t('last7Days') : t('allTime')}
              </button>
            ))}
          </div>
        </header>

        <div className="cm-kieze" role="tablist" aria-label={t('neighbourhood')}>
          {[null, ...KIEZ_ORDER].map((k) => (
            <button
              key={k ?? 'all'}
              role="tab"
              className="chip"
              aria-selected={kiez === k}
              onClick={() => navigate(hrefFor(k, period), { replace: true })}
            >
              {k ? KIEZ_NAMES[k] : t('allOfBerlin')}
            </button>
          ))}
        </div>

        {board.state === 'loading' && <span className="skeleton cm-sk-card" aria-busy="true" />}
        {board.state === 'error' && (
          <div className="cm-card cm-board-empty">
            <h2 className="cm-card__title">{t('leaderboardCurrentlyUnavailable')}</h2>
            <button className="btn btn--secondary cm-pill" onClick={reload}>{t('tryAgain')}</button>
          </div>
        )}
        {board.state === 'ok' && <Board board={board.data} kiez={kiez} />}
        {board.state === 'ok' && board.data.me && (
          <p className="cm-note">
            <Icon name="user" size={14} />{t('leaderboardScreenYou')}{' '}{board.data.me.scans} {board.data.me.scans === 1 ? t('map') : t('menus')}{' '}{t('publishedInThisPeriod')}</p>
        )}
        <p className="cm-note">
          <Icon name="info" size={14} />{t('onlyMenusPublishedAfterReviewCount')}</p>
      </div>
    </AppShell>
  )
}
