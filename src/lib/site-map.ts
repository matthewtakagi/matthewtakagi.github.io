import { Map, NavigationControl, setWorkerUrl } from "maplibre-gl"
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url"
import { routeView, type LatLon } from "@/lib/geo"

setWorkerUrl(workerUrl)

export const MAP_STYLES = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
} as const

export type MapTheme = keyof typeof MAP_STYLES

export function siteTheme(): MapTheme {
  const root = document.documentElement
  if (root.dataset.theme === "dark" || root.dataset.theme === "light") {
    return root.dataset.theme
  }
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

export function mapInk(theme: MapTheme) {
  if (theme === "dark") {
    return {
      upcoming: "#e2b39a",
      past: "#8eacc4",
      city: "#8eacc4",
      cityLine: "#d5e2ee",
      hotel: "#e2b39a",
      restaurant: "#9dceb0",
      place: "#c9b8e2",
      pinStroke: "#141414",
    }
  }
  return {
    upcoming: "#8a4630",
    past: "#2f5674",
    city: "#2f5674",
    cityLine: "#1c3c56",
    hotel: "#8a4630",
    restaurant: "#2a6846",
    place: "#5a5270",
    pinStroke: "#fbfbfb",
  }
}

export function createSiteMap(container: HTMLElement) {
  const map = new Map({
    container,
    style: MAP_STYLES[siteTheme()],
    attributionControl: true,
    cooperativeGestures: true,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    fadeDuration: 0,
  })
  map.addControl(new NavigationControl({ showCompass: false }), "top-right")
  return map
}

/** Re-apply layers when the site theme changes. `draw` must be safe to call again. */
export function followTheme(map: Map, draw: () => void) {
  let current = siteTheme()
  const onChange = () => {
    const next = siteTheme()
    if (next === current) return
    current = next
    map.setStyle(MAP_STYLES[next])
    map.once("style.load", draw)
  }
  new MutationObserver(onChange).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  })
  matchMedia("(prefers-color-scheme: dark)").addEventListener(
    "change",
    onChange,
  )
}

export function framePaths(map: Map, paths: LatLon[][], animate: boolean) {
  const view = routeView(paths)
  if (!view) {
    map.jumpTo({ center: [0, 20], zoom: 1 })
    return
  }
  const rect = map.getContainer().getBoundingClientRect()
  const width = rect.width || 640
  const height = rect.height || 420
  const pad = 1.35
  const lonZoom = Math.log2(((width / 512) * 360) / (view.lonSpan * pad))
  const latZoom = Math.log2(((height / 512) * 170) / (view.latSpan * pad))
  const zoom = Math.max(0.4, Math.min(11, Math.min(lonZoom, latZoom)))
  const camera = {
    center: [view.center[1], view.center[0]] as [number, number],
    zoom,
  }
  if (animate) map.easeTo({ ...camera, duration: 700 })
  else map.jumpTo(camera)
}
