export const PLACE_GROUPS = [
  { kind: "hotel", label: "Hotels" },
  { kind: "restaurant", label: "Restaurants" },
  { kind: "place", label: "Places" },
] as const

export type PlaceKind = (typeof PLACE_GROUPS)[number]["kind"]

export type Place = {
  slug: string
  name: string
  kind: PlaceKind
  /** ISO date, YYYY-MM-DD. */
  date: string
  city: string
  note?: string
  /** [latitude, longitude]. */
  coordinates: [number, number]
}

/**
 * Stays and meals. `city` must match a city name on the map. The pin is
 * drawn with that city; the name shows in the list once the city is clicked.
 *
 * Example:
 *
 * {
 *   slug: "park-hyatt-tokyo",
 *   name: "Park Hyatt Tokyo",
 *   kind: "hotel",
 *   date: "2024-11-03",
 *   city: "Tokyo",
 *   note: "Three nights.",
 *   coordinates: [35.6856, 139.6907],
 * }
 */
export const places: Place[] = []
