import { LanguageSwitch } from '../../components/LanguageSwitch'
// Top bar of the desktop frame: search, the global filters (map routes only) and the goal.
// Filters live in the URL query of the map (/); search hands them over in the search screen's own query keys.
import { useTranslation } from '../../i18n'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { FitDayButton } from '../../components/FitDay'
import { Glyph, type GlyphName } from '../../components/glyphs/Glyph'
import { Icon } from '../../components/Icon'
import { KIEZE, type Kiez } from '../../data/api'
import { formatPrice } from '../../lib/format'
import { openLocationPrompt, usePosition } from '../../lib/position'
import { useProfile } from '../../lib/profile'
import { BUDGET_EUR, PROTEIN_GOAL_G } from '../../lib/ranking'
import { Link } from '../../lib/router'
import { navigate, paths, type Route } from '../../lib/routes'
import { searchHref, useGlobalFilters } from './globalFilters'

function Chip({ pressed, onClick, icon, children }: { pressed: boolean; onClick: () => void; icon: GlyphName; children: ReactNode }) {
  return (
    <button type="button" className={`fchip fchip--${icon}`} aria-pressed={pressed} onClick={onClick}>
      <Glyph name={icon} size={17} />
      {children}
    </button>
  )
}

function KiezMenu({ value, onChange }: { value: Kiez | null; onChange: (kiez: Kiez | null) => void }) {
  const t = useTranslation()
  const [open, setOpen] = useState(false)
  const { status } = usePosition()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const pick = (kiez: Kiez | null) => {
    setOpen(false)
    if (kiez === null && status !== 'granted') openLocationPrompt()
    else onChange(kiez)
  }

  return (
    <div className="kiez-menu" ref={ref}>
      <button type="button" className="fchip" aria-pressed={value !== null} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Glyph name="pin" size={17} />
        {value ?? t('nearby')}
        <Icon name="chevronDown" size={14} strokeWidth={2} className="fchip__caret" />
      </button>
      {open && (
        <ul className="kiez-menu__list" role="listbox" aria-label={t('neighbourhood')}>
          {[null, ...KIEZE].map((k) => (
            <li key={k ?? 'near'}>
              <button type="button" role="option" aria-selected={value === k} className="kiez-menu__option" onClick={() => pick(k)}>
                {k ?? t('nearby')}
                {value === k && <Icon name="check" size={16} strokeWidth={2} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function SearchField({ onSubmit }: { onSubmit: (q: string) => void }) {
  const t = useTranslation()
  const input = useRef<HTMLInputElement>(null)
  const [q, setQ] = useState('')

  // "/" focuses search from anywhere, unless the user is typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.key !== '/' || e.metaKey || e.ctrlKey || t.closest('input, textarea, select, [contenteditable="true"]')) return
      e.preventDefault()
      input.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    onSubmit(q)
  }

  return (
    <form className="topbar__search" role="search" onSubmit={submit}>
      <Glyph name="search" size={18} filled={false} />
      <input
        ref={input}
        type="search"
        name="q"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('dishOrRestaurant')}
        aria-label={t('searchDishesAndRestaurants')}
        enterKeyHint="search"
      />
      <kbd className="topbar__kbd" aria-hidden="true">
        /
      </kbd>
    </form>
  )
}

function GoalPill() {
  const t = useTranslation()
  const profile = useProfile()
  if (!profile) {
    return (
      <Link to={paths.onboarding()} className="goal-pill goal-pill--cta">
        <Glyph name="flame" size={16} />{t('setGoal')}</Link>
    )
  }
  return (
    <Link to={paths.today()} className="goal-pill" aria-label={t('dailyGoal1Kcal2G', profile.kcalTarget, profile.proteinTarget)}>
      <span className="goal-pill__stat">
        <Glyph name="flame" size={16} />
        <b>{profile.kcalTarget}</b> kcal
      </span>
      <span className="goal-pill__stat goal-pill__stat--protein">
        <Glyph name="protein" size={16} />
        <b>{profile.proteinTarget}</b> g
      </span>
    </Link>
  )
}

export function TopBar({ route, leading }: { route: Route; leading?: ReactNode }) {
  const t = useTranslation()
  const [filters, setFilters] = useGlobalFilters()
  const showFilters = route.name === 'map' || route.name === 'restaurant' || route.name === 'dish'
  const showSearch = route.name !== 'search'

  return (
    <header className="topbar">
      {leading}
      {showSearch && <SearchField onSubmit={(q) => navigate(searchHref(q, filters))} />}
      <FitDayButton variant="chip" />
      {showFilters && (
        <div className="topbar__filters" role="toolbar" aria-label={t('filters')}>
          <Chip icon="clock" pressed={filters.openNow} onClick={() => setFilters({ openNow: !filters.openNow })}>{t('openNow')}</Chip>
          <Chip icon="euro" pressed={filters.underBudget} onClick={() => setFilters({ underBudget: !filters.underBudget })}>{t('underBudget', formatPrice(BUDGET_EUR, 0))}
          </Chip>
          <Chip icon="protein" pressed={filters.proteinPlus} onClick={() => setFilters({ proteinPlus: !filters.proteinPlus })}>
            {t('count1GProtein', PROTEIN_GOAL_G)}</Chip>
          <KiezMenu value={filters.kiez} onChange={(kiez) => setFilters({ kiez })} />
        </div>
      )}
      <div className="topbar__end">
        <LanguageSwitch />
        <GoalPill />
      </div>
    </header>
  )
}
