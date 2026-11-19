/**
 * Download city limits for the cities in src/data/cities.ts.
 * That file is the list. This script does not read Flighty, and it does
 * not add or remove cities. Outlines are cached in src/data/city-boundaries.json.
 *
 *   bun run import:cities
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { cities, type City } from "../src/data/cities.ts"

type Position = [number, number]
type Geometry = { type: string; coordinates: unknown }
type NominatimResult = {
  lat: string
  lon: string
  display_name: string
  geojson?: Geometry
}

const root = join(import.meta.dir, "..")

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function sqDist(a: Position, b: Position) {
  const dx = a[0] - b[0]
  const dy = a[1] - b[1]
  return dx * dx + dy * dy
}

function segmentDistance(point: Position, start: Position, end: Position) {
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  const len = dx * dx + dy * dy
  if (len === 0) return Math.sqrt(sqDist(point, start))
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / len,
    ),
  )
  return Math.sqrt(sqDist(point, [start[0] + t * dx, start[1] + t * dy]))
}

function simplify(points: Position[], tolerance: number): Position[] {
  if (points.length < 3) return points
  let max = 0
  let index = 0
  const last = points.length - 1
  for (let i = 1; i < last; i++) {
    const distance = segmentDistance(points[i], points[0], points[last])
    if (distance > max) {
      max = distance
      index = i
    }
  }
  if (max <= tolerance) return [points[0], points[last]]
  const left = simplify(points.slice(0, index + 1), tolerance)
  const right = simplify(points.slice(index), tolerance)
  return left.slice(0, -1).concat(right)
}

function eachPosition(geometry: Geometry, visit: (position: Position) => void) {
  const walk = (value: unknown) => {
    if (!Array.isArray(value)) return
    if (typeof value[0] === "number") {
      visit(value as Position)
      return
    }
    for (const child of value) walk(child)
  }
  walk(geometry.coordinates)
}

function spanOf(geometry: Geometry) {
  let minLon = 180
  let maxLon = -180
  let minLat = 90
  let maxLat = -90
  eachPosition(geometry, ([lon, lat]) => {
    minLon = Math.min(minLon, lon)
    maxLon = Math.max(maxLon, lon)
    minLat = Math.min(minLat, lat)
    maxLat = Math.max(maxLat, lat)
  })
  return Math.max(maxLon - minLon, maxLat - minLat)
}

function round(position: Position): Position {
  return [
    Math.round(position[0] * 1e4) / 1e4,
    Math.round(position[1] * 1e4) / 1e4,
  ]
}

function simplifyRing(ring: Position[]): Position[] {
  if (ring.length < 4) return []
  let open = ring.slice(0, -1)
  if (open.length > 4000) {
    const step = Math.ceil(open.length / 4000)
    open = open.filter((_, index) => index % step === 0)
  }
  const span = spanOf({ type: "LineString", coordinates: open })
  const tolerance =
    span > 1 ? 0.02 : span > 0.3 ? 0.008 : span > 0.05 ? 0.003 : span / 25
  const simplified = simplify(open, tolerance).map(round)
  if (simplified.length < 3) return []
  simplified.push(simplified[0])
  return simplified
}

function simplifyGeometry(geometry: Geometry): Geometry | null {
  if (geometry.type === "Polygon") {
    const coordinates = (geometry.coordinates as Position[][])
      .map(simplifyRing)
      .filter((ring) => ring.length >= 4)
    return coordinates.length ? { type: "Polygon", coordinates } : null
  }
  if (geometry.type === "MultiPolygon") {
    const coordinates = (geometry.coordinates as Position[][][])
      .map((polygon) =>
        polygon.map(simplifyRing).filter((ring) => ring.length >= 4),
      )
      .filter((polygon) => polygon.length > 0)
    return coordinates.length ? { type: "MultiPolygon", coordinates } : null
  }
  return null
}

function nearCenter(
  geometry: Geometry,
  center: [number, number],
  radius: number,
): Geometry | null {
  const close = (polygon: Position[][]) => {
    const ring = polygon[0]
    if (!ring?.length) return false
    let lat = 0
    let lon = 0
    for (const [x, y] of ring) {
      lon += x
      lat += y
    }
    return (
      Math.hypot(
        lat / ring.length - center[0],
        lon / ring.length - center[1],
      ) <= radius
    )
  }
  if (geometry.type === "Polygon") {
    return close(geometry.coordinates as Position[][]) ? geometry : null
  }
  if (geometry.type === "MultiPolygon") {
    const coordinates = (geometry.coordinates as Position[][][]).filter(close)
    return coordinates.length ? { type: "MultiPolygon", coordinates } : null
  }
  return null
}

async function nominatim(
  params: Record<string, string>,
): Promise<NominatimResult[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search")
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, value)
  url.searchParams.set("format", "jsonv2")
  url.searchParams.set("polygon_geojson", "1")
  url.searchParams.set("limit", "5")
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "matthewtakagi.github.io (personal travel map)",
        Accept: "application/json",
      },
    })
    if (response.status === 429 || response.status === 503) {
      await sleep(5000)
      continue
    }
    if (!response.ok) throw new Error(`${response.status} for ${params.q}`)
    return (await response.json()) as NominatimResult[]
  }
  return []
}

function chooseGeometry(
  results: NominatimResult[],
  city: City,
): Geometry | null {
  const county = /county/i.test(city.outline ?? "")
  const maxSpan = county ? 6 : 4
  const candidates: { geometry: Geometry; distance: number; span: number }[] =
    []
  for (const result of results) {
    if (county && !/county/i.test(result.display_name)) continue
    let geometry = result.geojson
    if (
      !geometry ||
      (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon")
    ) {
      continue
    }
    const center: [number, number] = [Number(result.lat), Number(result.lon)]
    let span = spanOf(geometry)
    if (!county && span > maxSpan) {
      const trimmed = nearCenter(geometry, center, 0.9)
      if (!trimmed || spanOf(trimmed) > maxSpan) continue
      geometry = trimmed
      span = spanOf(geometry)
    }
    if (span > maxSpan) continue
    const distance = Math.hypot(
      center[0] - city.coordinates[0],
      center[1] - city.coordinates[1],
    )
    if (distance > (county ? 6 : 2.5)) continue
    candidates.push({ geometry, distance, span })
  }
  let usable = candidates
  if (!county) {
    const substantial = usable.filter((item) => item.span >= 0.015)
    if (substantial.length) usable = substantial
    const citySized = usable.filter((item) => item.span <= 0.8)
    if (citySized.length && usable.some((item) => item.span > 0.8))
      usable = citySized
  }
  usable.sort((a, b) => a.distance - b.distance || a.span - b.span)
  const best = usable[0]
  if (!best) return null
  return simplifyGeometry(best.geometry)
}

function mergeGeometries(parts: Geometry[]): Geometry | null {
  const polygons: Position[][][] = []
  for (const geometry of parts) {
    if (geometry.type === "Polygon")
      polygons.push(geometry.coordinates as Position[][])
    else if (geometry.type === "MultiPolygon")
      polygons.push(...(geometry.coordinates as Position[][][]))
  }
  if (polygons.length === 0) return null
  if (polygons.length === 1) return { type: "Polygon", coordinates: polygons[0] }
  return { type: "MultiPolygon", coordinates: polygons }
}

function clipRing(
  ring: Position[],
  box: [number, number, number, number],
): Position[] | null {
  if (ring.length < 4) return null
  const [west, south, east, north] = box
  const first = ring[0]
  const last = ring[ring.length - 1]
  let output =
    first[0] === last[0] && first[1] === last[1] ? ring.slice(0, -1) : [...ring]
  const edges: {
    inside: (point: Position) => boolean
    cross: (start: Position, end: Position) => Position
  }[] = [
    {
      inside: (point) => point[0] >= west,
      cross: (start, end) => {
        const t = (west - start[0]) / (end[0] - start[0] || 1e-12)
        return [west, start[1] + t * (end[1] - start[1])]
      },
    },
    {
      inside: (point) => point[0] <= east,
      cross: (start, end) => {
        const t = (east - start[0]) / (end[0] - start[0] || 1e-12)
        return [east, start[1] + t * (end[1] - start[1])]
      },
    },
    {
      inside: (point) => point[1] >= south,
      cross: (start, end) => {
        const t = (south - start[1]) / (end[1] - start[1] || 1e-12)
        return [start[0] + t * (end[0] - start[0]), south]
      },
    },
    {
      inside: (point) => point[1] <= north,
      cross: (start, end) => {
        const t = (north - start[1]) / (end[1] - start[1] || 1e-12)
        return [start[0] + t * (end[0] - start[0]), north]
      },
    },
  ]
  for (const edge of edges) {
    if (output.length === 0) return null
    const input = output
    const next: Position[] = []
    for (let index = 0; index < input.length; index++) {
      const current = input[index]
      const previous = input[(index + input.length - 1) % input.length]
      const currentIn = edge.inside(current)
      const previousIn = edge.inside(previous)
      if (currentIn) {
        if (!previousIn) next.push(edge.cross(previous, current))
        next.push(current)
      } else if (previousIn) next.push(edge.cross(previous, current))
    }
    output = next
  }
  if (output.length < 3) return null
  output.push([output[0][0], output[0][1]])
  return output
}

function clipGeometry(
  geometry: Geometry,
  box: [number, number, number, number],
): Geometry | null {
  const polygons =
    geometry.type === "Polygon"
      ? [geometry.coordinates as Position[][]]
      : geometry.type === "MultiPolygon"
        ? (geometry.coordinates as Position[][][])
        : []
  const kept: Position[][][] = []
  for (const polygon of polygons) {
    const outer = clipRing(polygon[0], box)
    if (!outer) continue
    const holes = polygon
      .slice(1)
      .map((ring) => clipRing(ring, box))
      .filter((ring): ring is Position[] => ring !== null)
    kept.push([outer, ...holes])
  }
  if (kept.length === 0) return null
  return simplifyGeometry(
    kept.length === 1
      ? { type: "Polygon", coordinates: kept[0] }
      : { type: "MultiPolygon", coordinates: kept },
  )
}

async function searchCity(city: City): Promise<Geometry | null> {
  const countrycodes = city.countryCode.toLowerCase()
  const label = city.lookup ?? city.outline ?? city.name
  const attempts = [
    { q: `${label}, ${city.country}`, countrycodes },
    { q: `${label} municipality, ${city.country}`, countrycodes },
    { q: label, countrycodes },
  ]
  for (const params of attempts) {
    const geometry = chooseGeometry(await nominatim(params), city)
    await sleep(1200)
    if (geometry) return geometry
  }
  return null
}

async function outlineFor(city: City): Promise<Geometry | null> {
  if (!city.areas?.length) {
    const geometry = await searchCity(city)
    return city.clip && geometry ? clipGeometry(geometry, city.clip) : geometry
  }
  const parts: Geometry[] = []
  for (const label of city.areas) {
    const geometry = await searchCity({
      ...city,
      lookup: label,
      outline: /county/i.test(label) ? label : undefined,
    })
    if (geometry) parts.push(geometry)
    else console.log(`\n  missing ${label}`)
  }
  const merged = mergeGeometries(parts)
  if (!merged) return null
  return city.clip ? clipGeometry(merged, city.clip) : merged
}

const boundariesPath = join(root, "src/data/city-boundaries.json")
const cached = existsSync(boundariesPath)
  ? (JSON.parse(readFileSync(boundariesPath, "utf8")) as {
      features: {
        type: "Feature"
        properties: { id: string; name: string; outline?: string }
        geometry: Geometry
      }[]
    })
  : { features: [] }
const cachedById = new Map(
  cached.features.map((feature) => [feature.properties.id, feature]),
)

const features: {
  type: "Feature"
  properties: { id: string; name: string; outline?: string }
  geometry: Geometry
}[] = []

for (const [index, city] of cities.entries()) {
  process.stdout.write(
    `(${index + 1}/${cities.length}) ${city.name}, ${city.country} `,
  )
  const saved = cachedById.get(city.id)
  if (saved && (saved.properties.outline ?? "") === (city.outline ?? "")) {
    features.push(saved)
    console.log("— cached")
    continue
  }
  try {
    const geometry = await outlineFor(city)
    if (!geometry) {
      console.log("— no outline")
    } else {
      features.push({
        type: "Feature",
        properties: {
          id: city.id,
          name: city.name,
          ...(city.outline ? { outline: city.outline } : {}),
        },
        geometry,
      })
      console.log("— ok")
    }
  } catch (error) {
    console.log(`— ${error instanceof Error ? error.message : error}`)
  }
}

writeFileSync(
  join(root, "src/data/city-boundaries.json"),
  JSON.stringify({ type: "FeatureCollection", features }),
)
console.log(`Wrote ${features.length} city outlines`)
