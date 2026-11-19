import type { City } from "@/data/travel"

export const CONTINENTS = [
  "North America",
  "Europe",
  "Asia",
  "Oceania",
] as const

export type Continent = (typeof CONTINENTS)[number]

const COUNTRY_CONTINENT: Record<string, Continent> = {
  US: "North America",
  CA: "North America",
  AT: "Europe",
  CH: "Europe",
  CZ: "Europe",
  DE: "Europe",
  DK: "Europe",
  FI: "Europe",
  FR: "Europe",
  GB: "Europe",
  HR: "Europe",
  HU: "Europe",
  IS: "Europe",
  IT: "Europe",
  NL: "Europe",
  NO: "Europe",
  SE: "Europe",
  HK: "Asia",
  ID: "Asia",
  JP: "Asia",
  KR: "Asia",
  MY: "Asia",
  SG: "Asia",
  TH: "Asia",
  TW: "Asia",
  AU: "Oceania",
}

export function locate(city: City) {
  const continent = COUNTRY_CONTINENT[city.countryCode]
  if (!continent) {
    throw new Error(
      `No continent mapped for ${city.name} (${city.countryCode}). Add it in src/data/regions.ts.`,
    )
  }
  return continent
}
