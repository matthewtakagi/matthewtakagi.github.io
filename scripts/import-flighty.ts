/**
 * Copy Matt's own flights out of the local Flighty database into src/data/flights.json.
 *
 * Flighty has no public API. https://github.com/LukasHaas/flighty-mcp reads the
 * macOS app's SQLite file, and so does this script. It writes the route, date,
 * airline, aircraft type, and distance only — not seats, booking codes,
 * gates, tail numbers, or friends. Flights Flighty did not mark as his
 * are left out.
 *
 *   bun run import:flighty
 */
import { Database } from "bun:sqlite"
import { writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const dbPath =
  process.env.FLIGHTY_DB_PATH ??
  join(
    homedir(),
    "Library/Containers/com.flightyapp.flighty/Data/Documents/MainFlightyDatabase.db",
  )

const outPath = join(import.meta.dir, "../src/data/flights.json")

type Row = {
  id: string
  flight_number: string
  airline_name: string
  airline_iata: string | null
  equipment_icao: string | null
  equipment_iata: string | null
  dep_iata: string
  dep_name: string
  dep_city: string
  dep_country: string | null
  dep_country_code: string | null
  dep_lat: number | null
  dep_lon: number | null
  dep_tz: string | null
  arr_iata: string
  arr_name: string
  arr_city: string
  arr_country: string | null
  arr_country_code: string | null
  arr_lat: number | null
  arr_lon: number | null
  departure: number | null
  distance_km: number | null
}

const localDate = (unix: number, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(unix * 1000))

let db: Database
try {
  db = new Database(dbPath, { readonly: true })
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Could not open the Flighty database at ${dbPath}`)
  console.error(message)
  console.error(
    "Open Flighty once so it creates its database, then run this again.",
  )
  process.exit(1)
}

const owner = (() => {
  try {
    const row = db
      .query<{ userId: string }, []>(
        `SELECT userId FROM (
           SELECT senderUserId AS userId FROM ConnectedFriendRelationship WHERE deleted IS NULL
           UNION ALL
           SELECT receiverUserId AS userId FROM ConnectedFriendRelationship WHERE deleted IS NULL
         )
         GROUP BY userId ORDER BY COUNT(*) DESC LIMIT 1`,
      )
      .get()
    if (row?.userId) return row.userId
  } catch {
    // Older databases may not have the friends table.
  }
  const fallback = db
    .query<{ userId: string }, []>(
      `SELECT userId FROM UserFlight
       WHERE deleted IS NULL
       GROUP BY userId ORDER BY COUNT(*) DESC LIMIT 1`,
    )
    .get()
  if (!fallback?.userId) {
    console.error("Could not tell which Flighty user owns this database.")
    process.exit(1)
  }
  return fallback.userId
})()

const rows = db
  .query<Row, [string]>(
    `SELECT
       f.id AS id,
       f.number AS flight_number,
       al.name AS airline_name,
       al.iata AS airline_iata,
       f.equipmentIcao AS equipment_icao,
       f.equipmentIata AS equipment_iata,
       dep.iata AS dep_iata,
       dep.name AS dep_name,
       dep.city AS dep_city,
       dep.country AS dep_country,
       dep.countryCode AS dep_country_code,
       dep.latitude AS dep_lat,
       dep.longitude AS dep_lon,
       dep.timeZoneIdentifier AS dep_tz,
       arr.iata AS arr_iata,
       arr.name AS arr_name,
       arr.city AS arr_city,
       arr.country AS arr_country,
       arr.countryCode AS arr_country_code,
       arr.latitude AS arr_lat,
       arr.longitude AS arr_lon,
       f.departureScheduleGateOriginal AS departure,
       f.distance AS distance_km
     FROM Flight f
     JOIN Airport dep ON f.departureAirportId = dep.id
     JOIN Airport arr ON f.scheduledArrivalAirportId = arr.id
     JOIN Airline al ON f.airlineId = al.id
     JOIN UserFlight uf ON f.id = uf.flightId
     WHERE uf.deleted IS NULL
       AND f.deleted IS NULL
       AND uf.userId = ?
       AND uf.isMyFlight = 1
       AND (f.isCancelled IS NULL OR f.isCancelled = 0)
     GROUP BY f.id`,
  )
  .all(owner)

const flights = rows.flatMap((row) => {
  if (
    row.departure == null ||
    row.dep_lat == null ||
    row.dep_lon == null ||
    row.arr_lat == null ||
    row.arr_lon == null
  ) {
    return []
  }
  const code = `${row.airline_iata ?? ""}${row.flight_number}`.replace(
    /\s/g,
    "",
  )
  return [
    {
      id: String(row.id),
      code,
      airline: row.airline_name,
      aircraft: row.equipment_icao || row.equipment_iata || null,
      date: localDate(row.departure, row.dep_tz || "UTC"),
      from: {
        iata: row.dep_iata,
        name: row.dep_name,
        city: row.dep_city,
        country: row.dep_country ?? "",
        countryCode: row.dep_country_code ?? "",
        coordinates: [row.dep_lat, row.dep_lon],
      },
      to: {
        iata: row.arr_iata,
        name: row.arr_name,
        city: row.arr_city,
        country: row.arr_country ?? "",
        countryCode: row.arr_country_code ?? "",
        coordinates: [row.arr_lat, row.arr_lon],
      },
      distanceKm: row.distance_km,
    },
  ]
})

flights.sort(
  (a, b) => b.date.localeCompare(a.date) || a.code.localeCompare(b.code),
)
writeFileSync(outPath, `${JSON.stringify(flights, null, 2)}\n`)
console.log(`Wrote ${flights.length} flights to src/data/flights.json`)
