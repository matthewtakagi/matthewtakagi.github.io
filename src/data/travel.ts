import rawFlights from "@/data/flights.json"
import manualFlights from "@/data/manual-flights.json"
import { cities } from "@/data/cities"

export type { City } from "@/data/cities"

export type FlightEnd = {
  iata: string
  name: string
  city: string
  country: string
  countryCode: string
  coordinates: [number, number]
}

export type Flight = {
  id: string
  code: string
  airline: string
  aircraft: string | null
  date: string
  from: FlightEnd
  to: FlightEnd
  distanceKm: number | null
}

// manual-flights.json holds trips that are not in Flighty. A re-import leaves them in place.
export const flights = [...(rawFlights as Flight[]), ...(manualFlights as Flight[])].sort(
  (a, b) => b.date.localeCompare(a.date) || a.code.localeCompare(b.code),
)
export { cities }
