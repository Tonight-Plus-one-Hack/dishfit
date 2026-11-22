import { lazy, Suspense } from 'react'
import type { MapViewProps } from './MapView'

const MapView = lazy(() => import('./MapView'))

export function LazyMap(props: MapViewProps) {
  return (
    <Suspense fallback={<div className={`map map--loading ${props.className ?? ''}`} aria-busy="true" />}>
      <MapView {...props} />
    </Suspense>
  )
}
