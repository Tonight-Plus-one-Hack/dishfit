// Habit pieces of the Today tab (Cal AI manner): streak, camera entry points, recently eaten, weekly progress
// and my photographed menus. All device-local; see src/lib/diary.ts and src/lib/cards.ts.
import { localizedFormatter, useTranslation } from '../../i18n'
import { useEffect, useState, type CSSProperties } from 'react'
import { Glyph } from '../../components/glyphs/Glyph'
import { Icon } from '../../components/Icon'
import { recentEntries, relog, streakOf, weekTotals, type DiaryEntry } from '../../lib/diary'
import { removeCard, syncCards, useCards } from '../../lib/cards'
import { MOTION } from '../../lib/motion'
import { Link } from '../../lib/router'
import { paths } from '../../lib/routes'
import { livePhoto } from '../../data/scans'
import { AiBadge, MenuDishes, ScanPhotoNote } from '../camera/CameraScreen'
import { formatInt } from '../onboarding/targets'
import '../camera/camera.css'
import './habits.css'

const weekdayShort = localizedFormatter((lang) => new Intl.DateTimeFormat(lang, { timeZone: 'UTC', weekday: 'short' }))
const dateShort = localizedFormatter((lang) => new Intl.DateTimeFormat(lang, { timeZone: 'Europe/Berlin', day: 'numeric', month: 'short' }))
const timeOf = localizedFormatter((lang) => new Intl.DateTimeFormat(lang, { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }))

export function StreakPill({ entries, today }: { entries: DiaryEntry[]; today: string }) {
  const t = useTranslation()
  const streak = streakOf(entries, today)
  return (
    <span className={`streak ${streak > 0 ? 'is-on' : ''}`} aria-label={streak === 1 ? t('count1DayInARow') : t('count1DaysInARow', streak)}>
      <Glyph name="flame" size={16} />
      <b>{streak}</b>
    </span>
  )
}

export function CameraTiles() {
  const t = useTranslation()
  return (
    <div className="cam-tiles">
      <Link to={paths.camera('plate')} className="cam-tile">
        <span className="cam-tile__icon">
          <Icon name="camera" size={20} />
        </span>
        <span className="cam-tile__text">
          <span className="cam-tile__title">{t('scanAMeal')}</span>
          <span className="cam-tile__body">{t('takeAPhotoGetAnAi')}</span>
        </span>
      </Link>
      <Link to={paths.camera('menu')} className="cam-tile">
        <span className="cam-tile__icon">
          <Icon name="list" size={20} />
        </span>
        <span className="cam-tile__text">
          <span className="cam-tile__title">{t('scanAMenu')}</span>
          <span className="cam-tile__body">{t('readDishesAndSavePrivately')}</span>
        </span>
      </Link>
    </div>
  )
}

export function RecentRail({ entries }: { entries: DiaryEntry[] }) {
  const t = useTranslation()
  const recent = recentEntries(entries)
  if (recent.length === 0) return null
  return (
    <section className="today__section" aria-labelledby="recent-title">
      <div className="section-head">
        <h2 id="recent-title">{t('recentlyEaten')}</h2>
        <span className="t-label">{t('tapToLog')}</span>
      </div>
      <ul className="recent">
        {recent.map((e) => (
          <RecentCard key={e.id} entry={e} />
        ))}
      </ul>
    </section>
  )
}

/** A private scan photo from the Worker; renders nothing once it is gone (deleted, expired, other browser). */
function ScanThumb({ src, alt, className }: { src: string; alt: string; className: string }) {
  const [failed, setFailed] = useState(false)
  return failed ? null : <img className={className} src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} />
}

function RecentCard({ entry }: { entry: DiaryEntry }) {
  const t = useTranslation()
  const [added, setAdded] = useState(false)
  const [photoFailed, setPhotoFailed] = useState(false)
  const camera = entry.source === 'plate' || entry.source === 'menu'
  const photo = entry.photo && livePhoto(entry) ? entry.photo : null
  return (
    <li className="recent__card">
      <div className="recent__top">
        {photo && !photoFailed ? (
          <img className="recent__kind recent__kind--photo" src={photo.url} alt="" loading="lazy" decoding="async" onError={() => setPhotoFailed(true)} />
        ) : (
          <span className="recent__kind" aria-hidden="true">
            <Icon name={entry.source === 'plate' ? 'camera' : entry.source === 'menu' ? 'list' : 'leaf'} size={16} />
          </span>
        )}
        <span className="recent__time">
          {dateShort().format(new Date(entry.at))}, {timeOf().format(new Date(entry.at))}
        </span>
      </div>
      <p className="recent__name">{entry.name}</p>
      <p className="recent__place">{entry.restaurantName}</p>
      <p className="recent__kcal">
        <Glyph name="flame" size={14} />
        {entry.range ? `${formatInt(entry.range.low)}-${formatInt(entry.range.high)}` : `${entry.isEstimate ? t('approximatePrefix') : ''}${formatInt(entry.kcal)}`} kcal
      </p>
      <p className="recent__macros">
        <span className="recent__m recent__m--protein">{entry.protein}{' '}{t('gP')}</span>
        <span className="recent__m recent__m--carbs">{entry.carbs}{' '}{t('gC')}</span>
        <span className="recent__m recent__m--fat">{entry.fat}{' '}{t('gF')}</span>
      </p>
      {camera && <AiBadge />}
      {photo && <ScanPhotoNote scan={{ id: photo.scanId, photo }} />}
      <button
        className={`recent__add ${added ? 'is-done' : ''}`}
        onClick={() => {
          relog(entry)
          setAdded(true)
          window.setTimeout(() => setAdded(false), MOTION.copiedMs)
        }}
        aria-label={t('log1AgainToday', entry.name)}
      >
        <Icon name={added ? 'check' : 'plus'} size={18} strokeWidth={2} />
      </button>
    </li>
  )
}

export function WeekProgress({ entries, today, kcalTarget, proteinTarget }: { entries: DiaryEntry[]; today: string; kcalTarget: number; proteinTarget: number }) {
  const t = useTranslation()
  const days = weekTotals(entries, today)
  const logged = days.filter((d) => d.logged)
  const onTarget = logged.filter((d) => d.kcal <= kcalTarget * 1.1 && d.kcal >= kcalTarget * 0.6).length
  const avg = (key: 'kcal' | 'protein') => (logged.length ? Math.round(logged.reduce((s, d) => s + d[key], 0) / logged.length) : 0)
  const max = Math.max(kcalTarget * 1.25, ...days.map((d) => d.kcal))
  return (
    <section className="today__section" aria-labelledby="week-title">
      <div className="section-head">
        <h2 id="week-title">{t('weeklyProgress')}</h2>
        <span className="t-label">
          {logged.length === 0 ? t('noEntriesYet') : t('onTarget1Of23', onTarget, logged.length, logged.length === 1 ? t('day') : t('days'))}
        </span>
      </div>
      <div className="week-card">
        <div className="week-card__stats">
          <p>
            <b>{formatInt(avg('kcal'))}</b>
            <span>{t('avgKcalPerDay')}</span>
          </p>
          <p>
            <b>{formatInt(avg('protein'))} g</b>
            <span>{t('avgProteinGoal', formatInt(proteinTarget))}</span>
          </p>
          <p>
            <b>{logged.length}/7</b>
            <span>{t('daysLogged')}</span>
          </p>
        </div>
        <ol className="week-bars" style={{ '--goal': kcalTarget / max } as CSSProperties} aria-label={t('dailyCaloriesThisWeek')}>
          {days.map((d) => {
            const over = d.kcal > kcalTarget * 1.1
            return (
              <li key={d.day} className={`week-bars__day ${d.day === today ? 'is-today' : ''} ${d.day > today ? 'is-future' : ''}`}>
                <span className="week-bars__track">
                  <span className={`week-bars__fill ${over ? 'is-over' : ''}`} style={{ '--h': d.kcal / max } as CSSProperties} />
                </span>
                <span className="week-bars__label">{weekdayShort().format(new Date(`${d.day}T12:00:00Z`)).replace('.', '')}</span>
                <span className="sr-only">
                  {d.logged ? `${formatInt(d.kcal)} kcal` : t('nothingLogged')}
                </span>
              </li>
            )
          })}
          <span className="week-bars__goal" aria-hidden="true">
            <span>{t('goal')}</span>
          </span>
        </ol>
      </div>
    </section>
  )
}

export function MyCards() {
  const t = useTranslation()
  const cards = useCards()
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => void syncCards(), [])
  return (
    <section className="today__section" aria-labelledby="cards-title">
      <div className="section-head">
        <h2 id="cards-title">{t('myMenus')}</h2>
        {cards.length > 0 && <span className="t-label">{t('privateJustForYou')}</span>}
      </div>
      {cards.length === 0 ? (
        <div className="empty-card">
          <span className="icon-badge">
            <Icon name="camera" size={18} />
          </span>
          <p className="empty-card__title">{t('noSavedMenusYet')}</p>
          <p className="t-muted empty-card__body">{t('habitsTakeAPhotoOfAMenu')}</p>
          <Link to={paths.camera('menu')} className="btn btn--secondary today__btn">{t('scanAMenu')}</Link>
        </div>
      ) : (
        <ul className="cards">
          {cards.map((c) => {
            const place = c.menu.restaurantName ?? t('myMenu')
            const isOpen = open === c.id
            return (
              <li key={c.id} className={`cards__item ${isOpen ? 'is-open' : ''}`}>
                <button className="cards__head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : c.id)}>
                  <span className="cards__icon" aria-hidden="true">
                    <Icon name="list" size={18} />
                  </span>
                  <span className="cards__text">
                    <span className="cards__name">{place}</span>
                    <span className="cards__meta">
                      {c.menu.dishes.length}{' '}{t('habitsDishes')}{' '}{dateShort().format(new Date(c.createdAt))}
                    </span>
                  </span>
                  <Icon name="chevronDown" size={16} className="cards__chevron" />
                </button>
                {isOpen && (
                  <div className="cards__body">
                    {livePhoto(c) && <ScanThumb className="cards__photo" src={livePhoto(c)!.url} alt={t('menuPhoto1', place)} />}
                    <ScanPhotoNote scan={c} />
                    <AiBadge />
                    <MenuDishes dishes={c.menu.dishes} place={place} />
                    <button className="btn btn--ghost cards__delete" onClick={() => void removeCard(c.id)}>
                      <Icon name="trash" size={16} />{t('deleteMenu')}</button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
