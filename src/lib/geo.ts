/** [latitude, longitude] in degrees. */
export type LatLon = [number, number]

const toRad = (degrees: number) => (degrees * Math.PI) / 180
const toDeg = (radians: number) => (radians * 180) / Math.PI

function interpolate(a: LatLon, b: LatLon, steps: number): LatLon[] {
  const lat1 = toRad(a[0])
  const lon1 = toRad(a[1])
  const lat2 = toRad(b[0])
  const lon2 = toRad(b[1])
  const sinLat1 = Math.sin(lat1)
  const cosLat1 = Math.cos(lat1)
  const sinLat2 = Math.sin(lat2)
  const cosLat2 = Math.cos(lat2)
  const d =
    2 *
    Math.asin(
      Math.min(
        1,
        Math.sqrt(
          Math.sin((lat2 - lat1) / 2) ** 2 +
            cosLat1 * cosLat2 * Math.sin((lon2 - lon1) / 2) ** 2,
        ),
      ),
    )

  if (d < 1e-9) return [a]

  const points: LatLon[] = []
  for (let i = 0; i <= steps; i++) {
    const f = i / steps
    const A = Math.sin((1 - f) * d) / Math.sin(d)
    const B = Math.sin(f * d) / Math.sin(d)
    const x = A * cosLat1 * Math.cos(lon1) + B * cosLat2 * Math.cos(lon2)
    const y = A * cosLat1 * Math.sin(lon1) + B * cosLat2 * Math.sin(lon2)
    const z = A * sinLat1 + B * sinLat2
    points.push([
      toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))),
      toDeg(Math.atan2(y, x)),
    ])
  }
  return points
}

function densify(path: LatLon[], steps: number): LatLon[] {
  if (path.length < 2) return path
  const out: LatLon[] = []
  for (let i = 0; i < path.length - 1; i++) {
    const segment = interpolate(path[i], path[i + 1], steps)
    if (i > 0) segment.shift()
    out.push(...segment)
  }
  return out
}

/** Keep longitudes continuous so a route can cross the antimeridian. */
function unwrapLongitudes(path: LatLon[]): LatLon[] {
  if (path.length === 0) return path
  const out: LatLon[] = [[path[0][0], path[0][1]]]
  for (let i = 1; i < path.length; i++) {
    let lon = path[i][1]
    const prev = out[i - 1][1]
    while (lon - prev > 180) lon -= 360
    while (prev - lon > 180) lon += 360
    out.push([path[i][0], lon])
  }
  return out
}

/**
 * Pieces of a great-circle route that each stay inside ±180°.
 * Leaflet draws a straight jump across the world if a line crosses the date line in one piece.
 */
export function routeSegments(path: LatLon[], steps = 48): LatLon[][] {
  const points = densify(path, steps)
  if (points.length === 0) return []
  const segments: LatLon[][] = [[points[0]]]
  for (let i = 1; i < points.length; i++) {
    const [lat, lon] = points[i]
    const [prevLat, prevLon] = points[i - 1]
    if (Math.abs(lon - prevLon) <= 180) {
      segments[segments.length - 1].push([lat, lon])
      continue
    }
    const toEdge = prevLon >= 0 ? 180 - prevLon : 180 + prevLon
    const fromEdge = lon >= 0 ? 180 - lon : 180 + lon
    const t = toEdge / (toEdge + fromEdge || 1)
    const crossingLat = prevLat + (lat - prevLat) * t
    segments[segments.length - 1].push([crossingLat, prevLon >= 0 ? 180 : -180])
    segments.push([
      [crossingLat, lon >= 0 ? 180 : -180],
      [lat, lon],
    ])
  }
  return segments
}

const wrapLon = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180

export type RouteView = {
  center: LatLon
  latSpan: number
  lonSpan: number
}

/** Camera framing that follows the short way around, including across the date line. */
export function routeView(paths: LatLon[][], steps = 24): RouteView | null {
  const pieces = paths
    .filter((path) => path.length > 0)
    .map((path) => unwrapLongitudes(densify(path, steps)))
  if (pieces.length === 0) return null

  const meanLon = (pts: LatLon[]) =>
    pts.reduce((sum, point) => sum + point[1], 0) / pts.length
  const base = meanLon(pieces[0])
  let minLat = 90
  let maxLat = -90
  let minLon = Number.POSITIVE_INFINITY
  let maxLon = Number.NEGATIVE_INFINITY

  for (const piece of pieces) {
    let shift = 0
    const mid = meanLon(piece)
    while (mid + shift - base > 180) shift -= 360
    while (base - (mid + shift) > 180) shift += 360
    for (const [lat, lon] of piece) {
      const shifted = lon + shift
      minLat = Math.min(minLat, lat)
      maxLat = Math.max(maxLat, lat)
      minLon = Math.min(minLon, shifted)
      maxLon = Math.max(maxLon, shifted)
    }
  }

  return {
    center: [(minLat + maxLat) / 2, wrapLon((minLon + maxLon) / 2)],
    latSpan: Math.max(maxLat - minLat, 0.05),
    lonSpan: Math.max(maxLon - minLon, 0.05),
  }
}
