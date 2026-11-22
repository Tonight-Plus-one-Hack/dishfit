// The screen's filter state, kept in step with the URL query.
// Updates apply locally at once (chips respond instantly) and replace the URL, so the list stays shareable
// without filling the back stack. Back, forward and links that change the query reload the state from the URL.
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { track } from '../../lib/analytics'
import { useLocation } from '../../lib/location'
import { navigate, paths } from '../../lib/routes'
import { EMPTY_STATE, parseSearch, serializeSearch, type SearchState } from './searchState'

export type SearchUpdate = SearchState | ((current: SearchState) => SearchState)

const filterKey = (state: SearchState) => serializeSearch({ ...state, q: '', sort: EMPTY_STATE.sort })

export function useSearchState(): [SearchState, (update: SearchUpdate) => void] {
  const { search } = useLocation()
  const [state, setState] = useState(() => parseSearch(search))
  const [seen, setSeen] = useState(search)
  const [written, setWritten] = useState<string | null>(null)
  // The newest state, also between a call and the next render, so delayed callers (the search debounce) never undo a chip.
  const latest = useRef(state)

  // A URL change we did not write ourselves (back, forward, a link, the tab bar) wins over local state.
  if (search !== seen) {
    setSeen(search)
    if (search !== written) setState(parseSearch(search))
  }

  useLayoutEffect(() => {
    latest.current = state
  }, [state])

  const update = useCallback((change: SearchUpdate) => {
    const next = typeof change === 'function' ? change(latest.current) : change
    if (filterKey(next) !== filterKey(latest.current)) track('filter_change')
    latest.current = next
    const query = serializeSearch(next)
    setState(next)
    setWritten(query ? `?${query}` : '')
    navigate(paths.search(query), { replace: true })
  }, [])

  return [state, update]
}
