import { createContext, useContext } from 'react'
import { parse, type Location, type Route } from './routes'

export const LocationContext = createContext<Location>({ pathname: '/', search: '', hash: '' })

export function useLocation(): Location {
  return useContext(LocationContext)
}

export function useRoute(): Route {
  return parse(useLocation().pathname)
}

export function useSearchParams(): URLSearchParams {
  return new URLSearchParams(useLocation().search)
}
