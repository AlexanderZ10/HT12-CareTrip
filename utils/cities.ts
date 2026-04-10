import { City as CSCCity } from "country-state-city";

export type CityItem = {
  name: string;
  stateCode: string;
};

let cache: Record<string, CityItem[]> = {};

export function getCitiesForCountry(countryCode: string): CityItem[] {
  if (cache[countryCode]) return cache[countryCode];

  const raw = CSCCity.getCitiesOfCountry(countryCode) ?? [];
  const cities: CityItem[] = raw.map((c) => ({
    name: c.name,
    stateCode: c.stateCode,
  }));

  cache[countryCode] = cities;
  return cities;
}
