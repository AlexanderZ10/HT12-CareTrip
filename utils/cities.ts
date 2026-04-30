import { City as CSCCity } from "country-state-city";

export type CityItem = {
  name: string;
  stateCode: string;
};

let cache: Record<string, CityItem[]> = {};

const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "yo",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sht",
  ъ: "a",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
  є: "ye",
  і: "i",
  ї: "yi",
  ґ: "g",
};

const CITY_SEARCH_ALIASES: Record<string, string[]> = {
  athens: ["atina", "атина"],
  belgrade: ["beograd", "белград"],
  bucharest: ["bucuresti", "bucurești", "букурещ"],
  cologne: ["koln", "koeln", "köln", "кьолн"],
  copenhagen: ["kobenhavn", "københavn", "копенхаген"],
  florence: ["firenze", "флоренция"],
  lisbon: ["lisboa", "лисабон"],
  london: ["лондон"],
  milan: ["milano", "милано"],
  munich: ["munchen", "muenchen", "münchen", "мюнхен"],
  naples: ["napoli", "неапол"],
  paris: ["parizh", "париж"],
  prague: ["praha", "praga", "прага"],
  rome: ["roma", "rim", "рим"],
  sofia: ["sofiya", "софия"],
  thessaloniki: ["solun", "солун"],
  venice: ["venezia", "венеция"],
  vienna: ["wien", "v iena", "viena", "виена"],
  warsaw: ["warszawa", "варшава"],
};

function transliterateCyrillic(value: string) {
  return Array.from(value.toLowerCase())
    .map((char) => CYRILLIC_TO_LATIN[char] ?? char)
    .join("");
}

function normalizeSearchText(value: string) {
  return transliterateCyrillic(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function buildSearchForms(value: string) {
  const normalized = normalizeSearchText(value);
  const compact = normalized.replace(/\s+/g, "");
  const phonetic = compact
    .replace(/iya/g, "ia")
    .replace(/iy/g, "i")
    .replace(/y(?=[aeiou])/g, "");

  return new Set([normalized, compact, phonetic].filter(Boolean));
}

function getCitySearchForms(cityName: string) {
  const forms = buildSearchForms(cityName);
  const normalizedCityName = normalizeSearchText(cityName).replace(/\s+/g, "");
  const aliases = CITY_SEARCH_ALIASES[normalizedCityName] ?? [];

  aliases.forEach((alias) => {
    buildSearchForms(alias).forEach((form) => forms.add(form));
  });

  return forms;
}

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

export function cityMatchesSearch(cityName: string, search: string) {
  const queryForms = buildSearchForms(search);

  if (queryForms.size === 0) {
    return true;
  }

  const cityForms = getCitySearchForms(cityName);

  for (const query of queryForms) {
    for (const city of cityForms) {
      if (city.includes(query) || query.includes(city)) {
        return true;
      }
    }
  }

  return false;
}
