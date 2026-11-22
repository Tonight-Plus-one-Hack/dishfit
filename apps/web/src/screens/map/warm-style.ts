// Calm, Apple-Maps-like tint for OpenFreeMap's Positron style: soft beige-grey land, white roads, gentle green parks,
// clear light-blue water and few labels. Applied as paint overrides after the style loads, so tiles stay OpenFreeMap's.
import type { Map as MlMap } from 'maplibre-gl'

export const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'
export const LAND = '#f3f1ec'

const ROAD = '#ffffff'
const CASING = '#dedad2'
const RAIL = '#dcd8d1'
const LABEL = '#6e7178'
const HALO = '#f6f5f1'
const WATER = '#a7d1f2'

const PAINT: Record<string, Record<string, string>> = {
  background: { 'background-color': LAND },
  park: { 'fill-color': '#d3ebc5' },
  landcover_wood: { 'fill-color': '#cae5b9' },
  water: { 'fill-color': WATER },
  waterway: { 'line-color': WATER },
  landuse_residential: { 'fill-color': '#efede7' },
  building: { 'fill-color': '#e7e4dd', 'fill-outline-color': '#dcd8cf' },
  road_area_pier: { 'fill-color': LAND },
  road_pier: { 'line-color': LAND },
  'aeroway-area': { 'fill-color': ROAD },
  highway_path: { 'line-color': '#e9e6df' },
  highway_minor: { 'line-color': ROAD },
  highway_major_casing: { 'line-color': CASING },
  highway_major_inner: { 'line-color': ROAD },
  highway_major_subtle: { 'line-color': '#e8e5de' },
  highway_motorway_casing: { 'line-color': '#e6d9a8' },
  highway_motorway_inner: { 'line-color': '#fdf1c4' },
  highway_motorway_subtle: { 'line-color': '#eee6c8' },
  highway_motorway_bridge_casing: { 'line-color': '#e6d9a8' },
  highway_motorway_bridge_inner: { 'line-color': '#fdf1c4' },
  tunnel_motorway_casing: { 'line-color': CASING },
  tunnel_motorway_inner: { 'line-color': '#f4f1ea' },
  railway: { 'line-color': RAIL },
  railway_dashline: { 'line-color': '#f7f6f2' },
  railway_transit: { 'line-color': RAIL },
  railway_transit_dashline: { 'line-color': '#f7f6f2' },
  railway_service: { 'line-color': RAIL },
  railway_service_dashline: { 'line-color': '#f7f6f2' },
  boundary_2: { 'line-color': '#cfcbc3' },
  boundary_3: { 'line-color': '#cfcbc3' },
  waterway_line_label: { 'text-color': '#4f86b8', 'text-halo-color': HALO },
  water_name_point_label: { 'text-color': '#4f86b8', 'text-halo-color': HALO },
  water_name_line_label: { 'text-color': '#4f86b8', 'text-halo-color': HALO },
  'highway-name-minor': { 'text-color': LABEL, 'text-halo-color': HALO },
  'highway-name-major': { 'text-color': LABEL, 'text-halo-color': HALO },
  label_village: { 'text-color': '#55585e', 'text-halo-color': HALO },
  label_town: { 'text-color': '#55585e', 'text-halo-color': HALO },
}

/** Few labels, like Apple Maps: the page names the city, and footpath and minor place names only crowd the pins. */
const HIDDEN = ['label_city', 'label_city_capital', 'airport', 'highway-name-path', 'label_other']

export function applyWarmStyle(map: MlMap) {
  for (const [id, paint] of Object.entries(PAINT)) {
    if (!map.getLayer(id)) continue
    for (const [prop, value] of Object.entries(paint)) {
      try {
        map.setPaintProperty(id, prop as Parameters<MlMap['setPaintProperty']>[1], value)
      } catch {
        // A style update renamed a property: keep OpenFreeMap's colour.
      }
    }
  }
  for (const id of HIDDEN) {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none')
  }
}
