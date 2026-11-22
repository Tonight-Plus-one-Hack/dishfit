// Search field plus the filter sheet button. Typing commits to the URL after a short pause.
import { useTranslation } from '../../i18n'
import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../components/Icon'

const COMMIT_DELAY_MS = 220

export function SearchBar({
  query,
  onQuery,
  filterCount,
  onOpenFilters,
}: {
  query: string
  onQuery: (q: string) => void
  filterCount: number
  onOpenFilters: () => void
}) {
  const t = useTranslation()
  const [text, setText] = useState(query)
  const [committed, setCommitted] = useState(query)
  const timer = useRef<number | undefined>(undefined)

  // The query changed from outside (back, a chip, the empty state): show it.
  if (query !== committed) {
    setCommitted(query)
    setText(query)
  }

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const commit = (value: string) => {
    window.clearTimeout(timer.current)
    const q = value.trim()
    if (q === committed) return
    setCommitted(q)
    onQuery(q)
  }

  const change = (value: string) => {
    setText(value)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => commit(value), COMMIT_DELAY_MS)
  }

  return (
    <div className="search-bar">
      <form
        className="search-field"
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          commit(text)
          ;(document.activeElement as HTMLElement | null)?.blur()
        }}
      >
        <Icon name="search" size={18} className="search-field__icon" />
        <label htmlFor="search-input" className="sr-only">{t('searchDishesAndRestaurants')}</label>
        <input
          id="search-input"
          className="search-field__input"
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder={t('dishOrRestaurant')}
          value={text}
          onChange={(e) => change(e.target.value)}
        />
        {text && (
          <button
            type="button"
            className="search-field__clear"
            aria-label={t('clearSearch')}
            onClick={() => {
              setText('')
              commit('')
              document.getElementById('search-input')?.focus()
            }}
          >
            <Icon name="close" size={16} />
          </button>
        )}
      </form>
      <button
        type="button"
        className={`filter-button ${filterCount ? 'is-active' : ''}`}
        onClick={onOpenFilters}
        aria-haspopup="dialog"
        aria-label={filterCount ? t('filters1Active', filterCount) : t('filters')}
      >
        <Icon name="sliders" size={20} />
        {filterCount > 0 && (
          <span className="filter-button__count" aria-hidden="true">
            {filterCount}
          </span>
        )}
      </button>
    </div>
  )
}
