import { httpsCallable, httpsCallableFromURL } from "firebase/functions";
import Constants from "expo-constants";
import { Platform } from "react-native";

import { functions } from "../firebase";
import { searchFreeHotels } from "../travel-providers/free-hotels";
import { buildStaySearchLinkOffers } from "../travel-providers/stay-links";
import {
  buildTransportSearchLinkOffers,
  getRequestedTransportOperatorNames,
} from "../travel-providers/transport-links";
import { callAI, getAIApiKey } from "./ai";
import { normalizeBudgetToEuro } from "./currency";
import { sanitizeString } from "./sanitize";
import type { DiscoverProfile } from "./trip-recommendations";
import type { AppLanguage } from "./translations";

export type LiveTravelOffer = {
  bookingUrl: string;
  mode: string;
  note: string;
  priceAmount: number | null;
  priceCurrency: string;
  provider: string;
  route: string;
  sourceLabel: string;
  durationMinutes?: number | null;
};

export type LiveStayOffer = {
  area: string;
  bookingUrl: string;
  directBookingUrl?: string;
  imageUrl: string;
  name: string;
  note: string;
  priceAmount: number | null;
  priceCurrency: string;
  providerAccommodationId?: string;
  providerKey?: string;
  providerPaymentModes?: string[];
  providerProductId?: string;
  ratingLabel: string;
  reservationMode?: string;
  sourceLabel: string;
  type: string;
};

export type LiveTravelOffersResponse = {
  notes: string[];
  searchContext: {
    departureDate: string;
    nights: number;
    returnDate: string;
    windowLabel: string;
  };
  stayOptions: LiveStayOffer[];
  transportOptions: LiveTravelOffer[];
};

export type SearchTravelOffersInput = {
  budget: string;
  days: string;
  destination: string;
  language?: AppLanguage;
  notes?: string;
  profile: DiscoverProfile;
  timing: string;
  transportPreference: string;
  travelers: string;
  tripStyle?: string;
};

export type CreateTestPaymentIntentInput = {
  amountCents: number;
  currency: string;
  description: string;
  destination: string;
  paymentMethod: string;
  userId: string;
};

export type TestPaymentIntentResponse = {
  clientSecret: string;
  mode: "mock" | "stripe_test";
  paymentIntentId: string;
  provider: "stripe";
  status: string;
};

export type CreateTestCheckoutSessionInput = {
  amountCents: number;
  cancelUrl: string;
  contactEmail: string;
  contactName: string;
  currency: string;
  description: string;
  destination: string;
  paymentMethod: string;
  platformFeeCents?: number;
  providerBookingUrl?: string;
  providerLabel?: string;
  reservationMode?: string;
  subtotalCents?: number;
  successUrl: string;
  userId: string;
};

export type TestCheckoutSessionResponse = {
  checkoutUrl: string;
  mode: "stripe_test";
  provider: "stripe";
  sessionId: string;
  status: string;
};

export type VerifyTestCheckoutSessionInput = {
  sessionId: string;
};

export type TestCheckoutVerificationResponse = {
  mode: "stripe_test";
  paid: boolean;
  paymentIntentId: string;
  provider: "stripe";
  sessionStatus: string;
  status: string;
};

type GeminiFallbackOfferPayload = {
  notes?: string[];
  stayOptions?: Partial<LiveStayOffer>[];
  transportOptions?: Partial<LiveTravelOffer>[];
};

type GroundedPriceCheckPayload = {
  stay?: Array<{
    evidence?: string;
    id?: string;
    priceAmount?: number | string | null;
    priceCurrency?: string;
  }>;
  transport?: Array<{
    bookingUrl?: string;
    evidence?: string;
    id?: string;
    priceAmount?: number | string | null;
    priceCurrency?: string;
    sourceLabel?: string;
  }>;
};

function sanitizeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  return null;
}

function sanitizePriceAmount(value: unknown) {
  const numericValue = sanitizeNumber(value);

  return numericValue !== null && numericValue > 0 ? numericValue : null;
}

function sanitizeBookingUrl(value: unknown) {
  const rawValue = sanitizeString(value);

  if (!rawValue) {
    return "";
  }

  const candidate = /^https?:\/\//i.test(rawValue) ? rawValue : `https://${rawValue}`;

  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

const ROUTE_ESTIMATE_TRANSPORT_SOURCE_TERMS = [
  "google maps",
  "rome2rio",
  "rome 2 rio",
];

const ROUTE_ESTIMATE_TRANSPORT_URL_HOSTS = [
  "google.com/maps",
  "rome2rio.com",
];

const THIRD_PARTY_FARE_SOURCE_TERMS = [
  "booking.com",
  "cheapflights",
  "edreams",
  "expedia",
  "gotogate",
  "kayak",
  "kiwi",
  "lastminute",
  "momondo",
  "mytrip",
  "omio",
  "opodo",
  "skyscanner",
  "trip.com",
];

const THIRD_PARTY_FARE_URL_HOSTS = [
  "booking.com",
  "cheapflights.com",
  "edreams.com",
  "expedia.com",
  "gotogate.com",
  "kayak.com",
  "kiwi.com",
  "lastminute.com",
  "momondo.com",
  "mytrip.com",
  "omio.com",
  "opodo.com",
  "skyscanner.com",
  "skyscanner.net",
  "trip.com",
];

function getOfferUrlHostAndPath(value: string) {
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname}`.toLowerCase();
  } catch {
    return "";
  }
}

function isBlockedTransportSource(offer: Pick<LiveTravelOffer, "bookingUrl" | "provider" | "sourceLabel">) {
  const provider = normalizeLooseText(offer.provider);
  const sourceLabel = normalizeLooseText(offer.sourceLabel);
  const hostAndPath = getOfferUrlHostAndPath(offer.bookingUrl);

  return (
    ROUTE_ESTIMATE_TRANSPORT_SOURCE_TERMS.some(
      (term) => provider === term || sourceLabel === term || provider.includes(term) || sourceLabel.includes(term)
    ) ||
    ROUTE_ESTIMATE_TRANSPORT_URL_HOSTS.some((host) => hostAndPath.includes(host)) ||
    THIRD_PARTY_FARE_SOURCE_TERMS.some(
      (term) => provider === term || provider.includes(term)
    ) ||
    THIRD_PARTY_FARE_URL_HOSTS.some((host) => provider.includes(host))
  );
}

function normalizeCurrencyCode(value: unknown, fallback = "EUR") {
  const normalizedValue = sanitizeString(value, fallback).trim().toUpperCase();

  if (!normalizedValue) {
    return fallback;
  }

  if (normalizedValue === "€" || normalizedValue === "EURO") {
    return "EUR";
  }

  if (normalizedValue === "$" || normalizedValue === "US$") {
    return "USD";
  }

  if (normalizedValue === "£") {
    return "GBP";
  }

  if (normalizedValue === "ЛВ" || normalizedValue === "BGN") {
    return "BGN";
  }

  const compactCode = normalizedValue.replace(/[^A-Z]/g, "");
  return compactCode.length >= 3 ? compactCode.slice(0, 3) : fallback;
}

function hasPositivePriceAmount(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isExactPricedTransportOffer(offer: LiveTravelOffer) {
  return (
    hasPositivePriceAmount(offer.priceAmount) &&
    !!offer.bookingUrl.trim() &&
    !!offer.provider.trim() &&
    !!offer.sourceLabel.trim() &&
    !!offer.route.trim() &&
    !isBlockedTransportSource(offer)
  );
}

function isExactPricedStayOffer(offer: LiveStayOffer) {
  return (
    hasPositivePriceAmount(offer.priceAmount) &&
    !!offer.bookingUrl.trim() &&
    !!offer.name.trim() &&
    !!(offer.sourceLabel.trim() || offer.providerKey?.trim())
  );
}

type TransportPreferenceKind = "any" | "bus" | "car" | "flight" | "ground" | "train";

const LOCALE_BY_LANGUAGE: Record<AppLanguage, string> = {
  bg: "bg-BG",
  de: "de-DE",
  en: "en-GB",
  es: "es-ES",
  fr: "fr-FR",
};

const DEFAULT_MARKET_BY_LANGUAGE: Record<AppLanguage, string> = {
  bg: "BG",
  de: "DE",
  en: "GB",
  es: "ES",
  fr: "FR",
};

const MARKET_HINTS: Array<{ market: string; terms: string[] }> = [
  { market: "BG", terms: ["bulgaria", "българия", "sofia", "софия", "plovdiv", "пловдив", "varna", "варна", "burgas", "бургас"] },
  { market: "DE", terms: ["germany", "deutschland", "berlin", "munich", "munchen", "frankfurt", "hamburg"] },
  { market: "ES", terms: ["spain", "espana", "españa", "madrid", "barcelona", "sevilla", "valencia"] },
  { market: "FR", terms: ["france", "paris", "lyon", "nice", "marseille"] },
  { market: "GB", terms: ["united kingdom", "uk", "england", "london", "manchester", "edinburgh"] },
  { market: "IT", terms: ["italy", "italia", "rome", "roma", "milan", "milano", "naples"] },
  { market: "GR", terms: ["greece", "грция", "гърция", "athens", "атина", "thessaloniki", "солун"] },
  { market: "TR", terms: ["turkey", "turkiye", "türkiye", "istanbul", "ankara"] },
  { market: "RO", terms: ["romania", "bucharest", "bukurest", "bucuresti", "bucurești", "cluj"] },
  { market: "US", terms: ["united states", "usa", "new york", "los angeles", "chicago", "miami"] },
];

const MONTH_HINTS: Array<{ month: number; terms: string[] }> = [
  { month: 0, terms: ["january", "januar", "enero", "janvier", "януари"] },
  { month: 1, terms: ["february", "februar", "febrero", "fevrier", "février", "февруари"] },
  { month: 2, terms: ["march", "marz", "märz", "marzo", "mars", "март"] },
  { month: 3, terms: ["april", "abril", "avril", "април"] },
  { month: 4, terms: ["may", "mai", "mayo", "маи", "май"] },
  { month: 5, terms: ["june", "juni", "junio", "juin", "юни"] },
  { month: 6, terms: ["july", "juli", "julio", "juillet", "юли"] },
  { month: 7, terms: ["august", "agosto", "aout", "août", "август"] },
  { month: 8, terms: ["september", "septiembre", "septembre", "september", "септември"] },
  { month: 9, terms: ["october", "oktober", "octubre", "octobre", "октомври"] },
  { month: 10, terms: ["november", "noviembre", "novembre", "ноември"] },
  { month: 11, terms: ["december", "dezember", "diciembre", "decembre", "décembre", "декември"] },
];

function normalizeLooseText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function clampScore(value: number, min = -50, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function startOfDay(date: Date) {
  const nextDate = new Date(date);
  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function addMonths(date: Date, months: number) {
  const nextDate = new Date(date);
  nextDate.setMonth(nextDate.getMonth() + months);
  return nextDate;
}

function normalizeLanguage(language?: AppLanguage) {
  if (language === "en" || language === "de" || language === "es" || language === "fr") {
    return language;
  }

  return "bg" as const;
}

function extractBudgetCap(value: string) {
  const normalizedBudget = normalizeBudgetToEuro(value);
  const matches = normalizedBudget.match(/\d+(?:[.,]\d+)?/g);

  if (!matches) {
    return null;
  }

  const numericValues = matches
    .map((item) => Number(item.replace(",", ".")))
    .filter((item) => Number.isFinite(item));

  if (numericValues.length === 0) {
    return null;
  }

  return Math.max(...numericValues);
}

function parseRatingValue(value: string) {
  const match = value.match(/(\d+(?:[.,]\d+)?)/);

  if (!match) {
    return null;
  }

  const parsedValue = Number(match[1].replace(",", "."));
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function normalizeTransportPreference(value: string): TransportPreferenceKind {
  const normalized = normalizeLooseText(value);

  if (!normalized) {
    return "any";
  }

  if (
    normalized.includes("flight") ||
    normalized.includes("plane") ||
    normalized.includes("air") ||
    normalized.includes("самолет") ||
    normalized.includes("полет") ||
    normalized.includes("flug") ||
    normalized.includes("vuelo") ||
    normalized.includes("vol")
  ) {
    return "flight";
  }

  if (
    normalized.includes("train") ||
    normalized.includes("влак") ||
    normalized.includes("zug") ||
    normalized.includes("tren")
  ) {
    return "train";
  }

  if (
    normalized.includes("bus") ||
    normalized.includes("автобус") ||
    normalized.includes("coach") ||
    normalized.includes("autobus")
  ) {
    return "bus";
  }

  if (
    normalized.includes("car") ||
    normalized.includes("кола") ||
    normalized.includes("road trip") ||
    normalized.includes("coche") ||
    normalized.includes("voiture") ||
    normalized.includes("auto") ||
    normalized.includes("rideshare") ||
    normalized.includes("carpool") ||
    normalized.includes("спод")
  ) {
    return "car";
  }

  if (
    normalized.includes("ground") ||
    normalized.includes("land") ||
    normalized.includes("назем") ||
    normalized.includes("overland")
  ) {
    return "ground";
  }

  return "any";
}

function normalizeOfferMode(value: string): TransportPreferenceKind {
  return normalizeTransportPreference(value);
}

function resolveLocaleContext(input: SearchTravelOffersInput) {
  const language = normalizeLanguage(input.language);
  const normalizedOrigin = normalizeLooseText(input.profile.personalProfile.homeBase || "");
  const matchedMarket =
    MARKET_HINTS.find((entry) =>
      entry.terms.some((term) => normalizedOrigin.includes(normalizeLooseText(term)))
    )?.market ?? DEFAULT_MARKET_BY_LANGUAGE[language];

  return {
    locale: LOCALE_BY_LANGUAGE[language],
    market: matchedMarket,
  };
}

function buildFutureDate(referenceDate: Date, month: number, day = 10, explicitYear?: number) {
  const safeMonth = Math.min(Math.max(month, 0), 11);
  const safeDay = Math.min(Math.max(day, 1), 31);
  const currentYear = referenceDate.getFullYear();
  const targetYear =
    explicitYear ??
    (safeMonth < referenceDate.getMonth() ||
    (safeMonth === referenceDate.getMonth() && safeDay <= referenceDate.getDate())
      ? currentYear + 1
      : currentYear);

  return startOfDay(new Date(targetYear, safeMonth, safeDay));
}

function resolveSeasonStart(
  normalizedTiming: string,
  referenceDate: Date
) {
  if (
    normalizedTiming.includes("summer") ||
    normalizedTiming.includes("лято") ||
    normalizedTiming.includes("sommer") ||
    normalizedTiming.includes("verano") ||
    normalizedTiming.includes("ete")
  ) {
    return buildFutureDate(referenceDate, 5, 20);
  }

  if (
    normalizedTiming.includes("spring") ||
    normalizedTiming.includes("пролет") ||
    normalizedTiming.includes("fruhling") ||
    normalizedTiming.includes("frühling") ||
    normalizedTiming.includes("primavera")
  ) {
    return buildFutureDate(referenceDate, 2, 20);
  }

  if (
    normalizedTiming.includes("winter") ||
    normalizedTiming.includes("зима") ||
    normalizedTiming.includes("invierno") ||
    normalizedTiming.includes("hiver")
  ) {
    return buildFutureDate(referenceDate, 11, 15);
  }

  if (
    normalizedTiming.includes("autumn") ||
    normalizedTiming.includes("fall") ||
    normalizedTiming.includes("есен") ||
    normalizedTiming.includes("herbst") ||
    normalizedTiming.includes("otono") ||
    normalizedTiming.includes("otoño") ||
    normalizedTiming.includes("automne")
  ) {
    return buildFutureDate(referenceDate, 8, 20);
  }

  return null;
}

function resolveRelativeTiming(normalizedTiming: string, referenceDate: Date) {
  const isoMatch = normalizedTiming.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);

  if (isoMatch) {
    return startOfDay(
      new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]))
    );
  }

  for (const monthHint of MONTH_HINTS) {
    const matchedTerm = monthHint.terms.find((term) =>
      normalizedTiming.includes(normalizeLooseText(term))
    );

    if (!matchedTerm) {
      continue;
    }

    const normalizedTerm = normalizeLooseText(matchedTerm).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const explicitYearMatch = normalizedTiming.match(/\b(20\d{2})\b/);
    const explicitYear = explicitYearMatch ? Number(explicitYearMatch[1]) : undefined;

    const monthFirstMatch = normalizedTiming.match(
      new RegExp(`${normalizedTerm}\\s*(\\d{1,2})(?:\\s*[-–/]\\s*(\\d{1,2}))?`)
    );
    if (monthFirstMatch) {
      const day = Number(monthFirstMatch[1]);
      return buildFutureDate(referenceDate, monthHint.month, day, explicitYear);
    }

    const dayFirstMatch = normalizedTiming.match(
      new RegExp(`(\\d{1,2})(?:\\s*[-–/]\\s*(\\d{1,2}))?\\s*${normalizedTerm}`)
    );
    if (dayFirstMatch) {
      const day = Number(dayFirstMatch[1]);
      return buildFutureDate(referenceDate, monthHint.month, day, explicitYear);
    }
  }

  const localDateMatch = normalizedTiming.match(/\b(\d{1,2})[./-](\d{1,2})(?:[./-](20\d{2}))?\b/);

  if (localDateMatch) {
    const day = Number(localDateMatch[1]);
    const month = Number(localDateMatch[2]) - 1;
    const explicitYear = localDateMatch[3] ? Number(localDateMatch[3]) : undefined;

    if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
      return buildFutureDate(referenceDate, month, day, explicitYear);
    }
  }

  const inDaysMatch = normalizedTiming.match(/\b(?:in\s*)?(\d{1,2})\s*(day|days|дни|ден|tage|tag|dias|días|jours|jour)\b/);

  if (inDaysMatch) {
    return addDays(referenceDate, Number(inDaysMatch[1]));
  }

  const inWeeksMatch = normalizedTiming.match(/\b(?:in\s*)?(\d{1,2})(?:\s*-\s*(\d{1,2}))?\s*(week|weeks|седмиц|wochen|semanas|semaines)\b/);

  if (inWeeksMatch) {
    const lowerBound = Number(inWeeksMatch[1]);
    const upperBound = inWeeksMatch[2] ? Number(inWeeksMatch[2]) : lowerBound;
    const averageWeeks = Math.max(1, Math.round((lowerBound + upperBound) / 2));
    return addDays(referenceDate, averageWeeks * 7);
  }

  const inMonthsMatch = normalizedTiming.match(/\b(?:in\s*)?(\d{1,2})\s*(month|months|месец|месеца|monate|monat|mes|meses|mois)\b/);

  if (inMonthsMatch) {
    const months = Math.max(1, Number(inMonthsMatch[1]));
    const target = addMonths(referenceDate, months);
    return startOfDay(new Date(target.getFullYear(), target.getMonth(), Math.min(10, target.getDate())));
  }

  if (
    normalizedTiming.includes("tomorrow") ||
    normalizedTiming.includes("утре") ||
    normalizedTiming.includes("morgen") ||
    normalizedTiming.includes("mañana") ||
    normalizedTiming.includes("manana") ||
    normalizedTiming.includes("demain")
  ) {
    return addDays(referenceDate, 1);
  }

  if (
    normalizedTiming.includes("today") ||
    normalizedTiming.includes("днес") ||
    normalizedTiming.includes("heute") ||
    normalizedTiming.includes("hoy") ||
    normalizedTiming.includes("aujourd")
  ) {
    return referenceDate;
  }

  if (
    normalizedTiming.includes("next weekend") ||
    normalizedTiming.includes("weekend") ||
    normalizedTiming.includes("уикенд") ||
    normalizedTiming.includes("wochenende") ||
    normalizedTiming.includes("fin de semana") ||
    normalizedTiming.includes("week end")
  ) {
    const weekday = referenceDate.getDay();
    const daysUntilFriday = (5 - weekday + 7) % 7 || 7;
    return addDays(referenceDate, daysUntilFriday);
  }

  if (
    normalizedTiming.includes("next week") ||
    normalizedTiming.includes("следващата седмица") ||
    normalizedTiming.includes("следващата") && normalizedTiming.includes("седмица") ||
    normalizedTiming.includes("nachste woche") ||
    normalizedTiming.includes("nächste woche") ||
    normalizedTiming.includes("proxima semana") ||
    normalizedTiming.includes("próxima semana") ||
    normalizedTiming.includes("semaine prochaine")
  ) {
    return addDays(referenceDate, 7);
  }

  if (
    normalizedTiming.includes("this month") ||
    normalizedTiming.includes("този месец") ||
    normalizedTiming.includes("diesen monat") ||
    normalizedTiming.includes("este mes") ||
    normalizedTiming.includes("este mes") ||
    normalizedTiming.includes("ce mois")
  ) {
    return addDays(referenceDate, 10);
  }

  if (
    normalizedTiming.includes("next month") ||
    normalizedTiming.includes("следващия месец") ||
    normalizedTiming.includes("nachsten monat") ||
    normalizedTiming.includes("nächsten monat") ||
    normalizedTiming.includes("proximo mes") ||
    normalizedTiming.includes("próximo mes") ||
    normalizedTiming.includes("mois prochain")
  ) {
    const nextMonth = addMonths(referenceDate, 1);
    return startOfDay(new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 10));
  }
  return resolveSeasonStart(normalizedTiming, referenceDate);
}

function dedupeTransportOffers(offers: LiveTravelOffer[]) {
  const seenKeys = new Set<string>();

  return offers.filter((offer) => {
    const key = [
      offer.bookingUrl,
      offer.provider,
      offer.route,
      offer.mode,
      offer.priceAmount ?? "",
      offer.durationMinutes ?? "",
    ]
      .join("|")
      .toLowerCase();

    if (!key || seenKeys.has(key)) {
      return false;
    }

    seenKeys.add(key);
    return true;
  });
}

function dedupeStayOffers(offers: LiveStayOffer[]) {
  const seenKeys = new Set<string>();

  return offers.filter((offer) => {
    const key = [offer.bookingUrl, offer.name, offer.area, offer.type, offer.priceAmount ?? ""]
      .join("|")
      .toLowerCase();

    if (!key || seenKeys.has(key)) {
      return false;
    }

    seenKeys.add(key);
    return true;
  });
}

function isLowQualityTransportOffer(offer: LiveTravelOffer) {
  const provider = normalizeLooseText(offer.provider);
  const route = normalizeLooseText(offer.route);
  const sourceLabel = normalizeLooseText(offer.sourceLabel);
  const mode = normalizeLooseText(offer.mode);

  return (
    !provider ||
    !route ||
    !sourceLabel ||
    !mode ||
    provider === "travel provider" ||
    provider === "provider" ||
    route === "маршрутът се уточнява" ||
    route === "" ||
    route === "route tbd" ||
    route === "route to be confirmed" ||
    sourceLabel === "provider" ||
    mode === "transport" ||
    isBlockedTransportSource(offer) ||
    !offer.bookingUrl
  );
}

function isLowQualityStayOffer(offer: LiveStayOffer) {
  const name = normalizeLooseText(offer.name);
  const area = normalizeLooseText(offer.area);
  const sourceLabel = normalizeLooseText(offer.sourceLabel);
  const type = normalizeLooseText(offer.type);
  const hasExactProviderPrice = isExactPricedStayOffer(offer);

  return (
    !name ||
    !area ||
    !sourceLabel ||
    !type ||
    name === "stay option" ||
    name === "travel stay" ||
    area === "" ||
    (!hasExactProviderPrice && area === "централна зона") ||
    (!hasExactProviderPrice && area === "central area") ||
    sourceLabel === "stay provider" ||
    sourceLabel === "provider" ||
    (!hasExactProviderPrice && type === "настаняване") ||
    (!hasExactProviderPrice && type === "accommodation") ||
    !offer.bookingUrl
  );
}

function isPrivateDevelopmentHost(hostname: string) {
  return (
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)
  );
}

function isLocalWebRuntime() {
  if (typeof window === "undefined") {
    return false;
  }

  const hostname = window.location?.hostname ?? "";
  return hostname === "localhost" || hostname === "127.0.0.1" || isPrivateDevelopmentHost(hostname);
}

function shouldUseLocalFunctionsEmulator() {
  const forcedMode = process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_MODE?.trim().toLowerCase();
  const explicitEmulatorHost = normalizeEmulatorHost(
    process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_EMULATOR_HOST ?? ""
  );
  const isNativeRuntime = Platform.OS !== "web";

  if (forcedMode === "production") {
    return false;
  }

  if (isNativeRuntime) {
    return forcedMode === "emulator" && !!(explicitEmulatorHost || resolveFunctionsEmulatorHost());
  }

  if (forcedMode === "emulator") {
    return !!(explicitEmulatorHost || resolveFunctionsEmulatorHost());
  }

  return isLocalWebRuntime();
}

function shouldUseFunctionsBackend() {
  const forcedMode = process.env.EXPO_PUBLIC_TRAVEL_OFFERS_MODE?.trim().toLowerCase();

  if (forcedMode === "fallback") {
    return false;
  }

  return true;
}

function shouldUseFunctionsForPayments() {
  const forcedMode = process.env.EXPO_PUBLIC_TEST_PAYMENTS_MODE?.trim().toLowerCase();

  if (forcedMode === "mock" || forcedMode === "fallback") {
    return false;
  }

  return true;
}

function normalizeEmulatorHost(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return "";
  }

  return trimmedValue
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "")
    .trim();
}

function resolveExpoHostCandidate(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return normalizeEmulatorHost(value);
}

function resolveFunctionsEmulatorHost() {
  const envHost = normalizeEmulatorHost(
    process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_EMULATOR_HOST ?? ""
  );

  if (envHost) {
    return envHost;
  }

  if (typeof window !== "undefined") {
    const webHost = normalizeEmulatorHost(window.location?.hostname ?? "");

    if (webHost) {
      return webHost;
    }
  }

  const constantsRecord = Constants as unknown as Record<string, unknown>;
  const expoConfig = constantsRecord.expoConfig as Record<string, unknown> | undefined;
  const expoGoConfig = constantsRecord.expoGoConfig as Record<string, unknown> | undefined;
  const manifest = constantsRecord.manifest as Record<string, unknown> | undefined;
  const manifest2 = constantsRecord.manifest2 as Record<string, unknown> | undefined;
  const manifest2Extra =
    manifest2?.extra && typeof manifest2.extra === "object"
      ? (manifest2.extra as Record<string, unknown>)
      : undefined;
  const expoClient =
    manifest2Extra?.expoClient && typeof manifest2Extra.expoClient === "object"
      ? (manifest2Extra.expoClient as Record<string, unknown>)
      : undefined;

  const candidateHosts = [
    resolveExpoHostCandidate(expoConfig?.hostUri),
    resolveExpoHostCandidate(expoGoConfig?.debuggerHost),
    resolveExpoHostCandidate(manifest?.debuggerHost),
    resolveExpoHostCandidate(expoClient?.hostUri),
  ];

  const matchedHost = candidateHosts.find(Boolean);

  return matchedHost || "127.0.0.1";
}

function resolveFunctionsEmulatorOrigin() {
  const port = sanitizeString(
    process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_EMULATOR_PORT,
    "5001"
  );

  return `http://${resolveFunctionsEmulatorHost()}:${port}`;
}

function createEmulatorCallable<Input, Output>(name: string) {
  return httpsCallableFromURL<Input, Output>(
    functions,
    `${resolveFunctionsEmulatorOrigin()}/travelapp-f7ff4/us-central1/${name}`
  );
}

function createCallable<Input, Output>(name: string) {
  if (shouldUseLocalFunctionsEmulator()) {
    return createEmulatorCallable<Input, Output>(name);
  }

  return httpsCallable<Input, Output>(functions, name);
}

function shouldRetryWithEmulator(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const errorCode =
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
      ? ((error as { code: string }).code ?? "")
      : "";

  return (
    message.includes("unauthenticated") ||
    message.includes("functions/unauthenticated") ||
    message.includes("functions/internal") ||
    errorCode === "unauthenticated" ||
    errorCode === "functions/unauthenticated" ||
    errorCode === "internal" ||
    errorCode === "functions/internal"
  );
}

function parseCheckoutSessionResponse(data: Record<string, unknown>) {
  return {
    checkoutUrl: sanitizeString(data.checkoutUrl),
    mode: "stripe_test",
    provider: "stripe",
    sessionId: sanitizeString(data.sessionId),
    status: sanitizeString(data.status, "open"),
  } satisfies TestCheckoutSessionResponse;
}

function parseCheckoutVerificationResponse(data: Record<string, unknown>) {
  return {
    mode: "stripe_test",
    paid: data.paid === true,
    paymentIntentId: sanitizeString(data.paymentIntentId),
    provider: "stripe",
    sessionStatus: sanitizeString(data.sessionStatus, "open"),
    status: sanitizeString(data.status, "unpaid"),
  } satisfies TestCheckoutVerificationResponse;
}

const GEMINI_FALLBACK_SCHEMA = {
  type: "object",
  properties: {
    notes: {
      type: "array",
      items: { type: "string" },
      maxItems: 4,
    },
    transportOptions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          bookingUrl: { type: "string" },
          durationMinutes: { type: "number" },
          mode: { type: "string" },
          note: { type: "string" },
          priceAmount: { type: ["number", "null"] },
          priceCurrency: { type: "string" },
          provider: { type: "string" },
          route: { type: "string" },
          sourceLabel: { type: "string" },
        },
        required: [
          "bookingUrl",
          "durationMinutes",
          "mode",
          "note",
          "priceAmount",
          "priceCurrency",
          "provider",
          "route",
          "sourceLabel",
        ],
      },
      minItems: 0,
      maxItems: 4,
    },
    stayOptions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          area: { type: "string" },
          bookingUrl: { type: "string" },
          directBookingUrl: { type: "string" },
          imageUrl: { type: "string" },
          name: { type: "string" },
          note: { type: "string" },
          priceAmount: { type: ["number", "null"] },
          priceCurrency: { type: "string" },
          ratingLabel: { type: "string" },
          sourceLabel: { type: "string" },
          type: { type: "string" },
        },
        required: [
          "area",
          "bookingUrl",
          "imageUrl",
          "name",
          "note",
          "priceAmount",
          "priceCurrency",
          "ratingLabel",
          "sourceLabel",
          "type",
        ],
      },
      minItems: 2,
      maxItems: 4,
    },
  },
  required: ["notes", "transportOptions", "stayOptions"],
} as const;

function sanitizeTravelOffer(value: unknown): LiveTravelOffer | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const rawValue = value as Record<string, unknown>;

  return {
    bookingUrl: sanitizeBookingUrl(rawValue.bookingUrl),
    durationMinutes: sanitizeNumber(rawValue.durationMinutes),
    mode: sanitizeString(rawValue.mode),
    note: sanitizeString(rawValue.note),
    priceAmount: sanitizePriceAmount(rawValue.priceAmount),
    priceCurrency: normalizeCurrencyCode(rawValue.priceCurrency, "EUR"),
    provider: sanitizeString(rawValue.provider),
    route: sanitizeString(rawValue.route),
    sourceLabel: sanitizeString(rawValue.sourceLabel),
  };
}

function sanitizeStayOffer(value: unknown): LiveStayOffer | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const rawValue = value as Record<string, unknown>;

  return {
    area: sanitizeString(rawValue.area),
    bookingUrl: sanitizeBookingUrl(rawValue.bookingUrl),
    directBookingUrl: sanitizeBookingUrl(rawValue.directBookingUrl),
    imageUrl: sanitizeString(rawValue.imageUrl),
    name: sanitizeString(rawValue.name),
    note: sanitizeString(rawValue.note),
    priceAmount: sanitizePriceAmount(rawValue.priceAmount),
    priceCurrency: normalizeCurrencyCode(rawValue.priceCurrency, "EUR"),
    providerAccommodationId: sanitizeString(rawValue.providerAccommodationId),
    providerKey: sanitizeString(rawValue.providerKey),
    providerPaymentModes: Array.isArray(rawValue.providerPaymentModes)
      ? rawValue.providerPaymentModes.filter(
          (item): item is string => typeof item === "string" && !!item.trim()
        )
      : [],
    providerProductId: sanitizeString(rawValue.providerProductId),
    ratingLabel: sanitizeString(rawValue.ratingLabel),
    reservationMode: sanitizeString(rawValue.reservationMode),
    sourceLabel: sanitizeString(rawValue.sourceLabel),
    type: sanitizeString(rawValue.type),
  };
}

function extractCount(value: string, fallback: number) {
  const match = value.match(/\d+/);

  if (!match) {
    return fallback;
  }

  const parsedValue = Number(match[0]);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
}

function toIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function resolveSummerStart(referenceDate: Date) {
  const currentYear = referenceDate.getFullYear();
  const summerStart = new Date(currentYear, 5, 20);

  if (summerStart <= referenceDate) {
    return new Date(currentYear + 1, 5, 20);
  }

  return summerStart;
}

export function resolveSearchWindow(timing: string, days: string) {
  const today = startOfDay(new Date());
  const normalizedTiming = normalizeLooseText(timing);
  const dayCount = Math.max(extractCount(days, 3), 1);
  const nightCount = Math.max(dayCount - 1, 1);
  const departureDate =
    resolveRelativeTiming(normalizedTiming, today) ||
    (normalizedTiming.includes("2-4") ? addDays(today, 21) : null) ||
    resolveSeasonStart(normalizedTiming, today) ||
    addDays(today, 35);
  const resolvedDepartureDate = departureDate < today ? addDays(today, 7) : departureDate;
  const returnDate = addDays(resolvedDepartureDate, nightCount);

  return {
    departureDate: toIsoDate(resolvedDepartureDate),
    nights: nightCount,
    returnDate: toIsoDate(returnDate),
    windowLabel: `${toIsoDate(resolvedDepartureDate)} → ${toIsoDate(returnDate)}`,
  };
}

function toTravelDateParts(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map((part) => Number(part));

  return {
    day: Number.isFinite(day) ? day : 1,
    month: Number.isFinite(month) ? month : 1,
    year: Number.isFinite(year) ? year : new Date().getFullYear(),
  };
}

function buildDeterministicSearchLinks(
  input: SearchTravelOffersInput,
  searchWindow: ReturnType<typeof resolveSearchWindow>
) {
  const adults = Math.max(extractCount(input.travelers, 1), 1);
  const currency = "EUR";

  return {
    stayOptions: buildStaySearchLinkOffers({
      adults,
      checkInDate: toTravelDateParts(searchWindow.departureDate),
      checkOutDate: toTravelDateParts(searchWindow.returnDate),
      currency,
      destinationQuery: input.destination,
      originQuery: input.profile.personalProfile.homeBase,
      transportPreference: input.transportPreference,
    }),
    transportOptions: buildTransportSearchLinkOffers({
      currency,
      departureDate: searchWindow.departureDate,
      destinationQuery: input.destination,
      notes: input.notes,
      originQuery: input.profile.personalProfile.homeBase,
      transportPreference: input.transportPreference,
    }),
  };
}

function sanitizeGroundedPriceCheckPayload(value: unknown) {
  if (!value || typeof value !== "object") {
    return { stay: [], transport: [] } satisfies GroundedPriceCheckPayload;
  }

  const payload = value as Record<string, unknown>;

  const sanitizeEntries = (entries: unknown) =>
    Array.isArray(entries)
      ? entries
          .map((entry) => {
            if (!entry || typeof entry !== "object") {
              return null;
            }

            const rawEntry = entry as Record<string, unknown>;
            return {
              bookingUrl: sanitizeBookingUrl(rawEntry.bookingUrl),
              evidence: sanitizeString(rawEntry.evidence),
              id: sanitizeString(rawEntry.id),
              priceAmount: sanitizeNumber(rawEntry.priceAmount),
              priceCurrency: normalizeCurrencyCode(rawEntry.priceCurrency, "EUR"),
              sourceLabel: sanitizeString(rawEntry.sourceLabel),
            };
          })
          .filter(
            (
              entry
            ): entry is {
              bookingUrl: string;
              evidence: string;
              id: string;
              priceAmount: number | null;
              priceCurrency: string;
              sourceLabel: string;
            } => !!entry && !!entry.id
          )
      : [];

  return {
    stay: sanitizeEntries(payload.stay),
    transport: sanitizeEntries(payload.transport),
  } satisfies GroundedPriceCheckPayload;
}

function buildGroundedExactPriceSystemPrompt(language: AppLanguage) {
  const languageLabel =
    language === "en"
      ? "English"
      : language === "de"
        ? "German"
        : language === "es"
          ? "Spanish"
          : language === "fr"
            ? "French"
            : "Bulgarian";

  return [
    "You are CareTrip's exact travel price verifier.",
    `Always write in ${languageLabel}.`,
    "Use Google Search grounding to find public web prices for the exact selected dates and traveler count.",
    "Return JSON only.",
    "Only include a numeric priceAmount when the public web result clearly matches the exact hotel or route and the selected dates.",
    "If you only find generic pages, price ranges, undated prices, or uncertain prices, leave priceAmount as null.",
    "For stays, prefer total price for the selected stay dates, not per-night marketing copy.",
    "For transport, verify the visible fare from the actual carrier/operator first. If the direct carrier site does not expose a public price, use a reputable third-party booking or fare source only when it shows an exact fare for the same carrier, route, date, and traveler count.",
    "When a user requested a carrier such as Qatar Airways, Emirates, Turkish Airlines, or Bulgaria Air, check that carrier first, then trusted third-party fare sources for that same carrier if direct pricing is unavailable.",
    "If you verify an airline fare, keep provider as the operating airline/operator. Use sourceLabel for the site that displayed the fare, and return the direct airline URL or third-party checkout/deep link in bookingUrl.",
    "Never fill transport prices from Rome2Rio, Google Maps, generic route estimates, undated price ranges, or from-price snippets.",
    "Keep evidence short and factual.",
  ].join("\n");
}

function buildGroundedExactPricePrompt(params: {
  departureDate: string;
  destination: string;
  requestedOperators: string[];
  returnDate: string;
  stayCandidates: Array<{
    area: string;
    bookingUrl?: string;
    id: string;
    name: string;
    sourceLabel: string;
  }>;
  transportCandidates: Array<{
    bookingUrl?: string;
    id: string;
    mode: string;
    provider: string;
    route: string;
    sourceLabel: string;
  }>;
  travelers: string;
}) {
  return [
    "Search context:",
    `- Destination: ${params.destination}`,
    `- Departure date: ${params.departureDate}`,
    `- Return date: ${params.returnDate}`,
    `- Travelers: ${params.travelers}`,
    `- User-requested carriers/operators: ${
      params.requestedOperators.length > 0 ? params.requestedOperators.join(", ") : "none"
    }`,
    "",
    "Stay candidates that still need an exact price:",
    ...(params.stayCandidates.length > 0
      ? params.stayCandidates.map(
          (candidate) =>
            `- ${candidate.id}: ${candidate.name} | ${candidate.area} | ${candidate.sourceLabel}${candidate.bookingUrl ? ` | ${candidate.bookingUrl}` : ""}`
        )
      : ["- none"]),
    "",
    "Transport candidates that still need an exact price:",
    ...(params.transportCandidates.length > 0
      ? params.transportCandidates.map(
          (candidate) =>
            `- ${candidate.id}: ${candidate.mode} | ${candidate.provider} | ${candidate.route} | ${candidate.sourceLabel}${candidate.bookingUrl ? ` | ${candidate.bookingUrl}` : ""}`
        )
      : ["- none"]),
    "",
    "Return this exact JSON shape:",
    `{
  "stay": [
    {
      "id": "stay-0",
      "priceAmount": 0,
      "priceCurrency": "EUR",
      "evidence": "short proof"
    }
  ],
  "transport": [
	    {
	      "id": "transport-0",
	      "bookingUrl": "https://official-carrier.example/booking",
	      "priceAmount": 0,
	      "priceCurrency": "EUR",
	      "sourceLabel": "Official carrier site",
	      "evidence": "short proof"
	    }
  ]
}`,
    "Rules:",
    "- If a candidate has no exact date-matched public price, set priceAmount to null for that candidate.",
    "- For transport, first use actual carrier/operator pricing; if direct carrier pricing is not public, use a reputable third-party booking/fare source only when it shows an exact dated fare for the same carrier, route, and traveler count.",
    "- If you verify a third-party fare, keep provider as the operating airline/operator, set sourceLabel to the third-party site, and put the third-party checkout/deep link in bookingUrl.",
    "- Do not use Rome2Rio, Google Maps, generic route estimates, undated price ranges, or from-price snippets.",
    "- Do not invent providers or URLs.",
    "- Do not include candidates that were not provided.",
    "- Keep evidence under 12 words.",
  ].join("\n");
}

function buildGroundedExactPriceTextSystemPrompt(language: AppLanguage) {
  const languageLabel =
    language === "en"
      ? "English"
      : language === "de"
        ? "German"
        : language === "es"
          ? "Spanish"
          : language === "fr"
            ? "French"
            : "Bulgarian";

  return [
    "You are CareTrip's exact travel price verifier.",
    `Always reason in ${languageLabel}, but output only the required line format.`,
    "Use Google Search grounding to verify public web prices for the exact selected dates and traveler count.",
    "Return one line per candidate using this exact format:",
    "id|priceAmountOrNull|priceCurrency|sourceLabel|bookingUrl|short evidence",
    "Examples:",
    "stay-0|184|EUR|Booking.com||Booking total shown for selected dates",
    "transport-0|29|EUR|Ryanair|https://www.ryanair.com/|Exact fare shown for selected route",
    "transport-1|212|USD|Expedia|https://www.expedia.com/|Qatar fare shown for selected date",
    "stay-1|null|EUR|||No exact dated public price found",
    "If a price is not exact and date-matched, output null.",
    "For transport, use actual carrier/operator fares first; if unavailable, use reputable third-party booking/fare sources only for exact dated fares for the same carrier. Never use Rome2Rio, Google Maps, generic route estimates, ranges, or from-price snippets.",
    "Do not output any extra text.",
  ].join("\n");
}

function buildGroundedExactPriceTextPrompt(params: {
  departureDate: string;
  destination: string;
  requestedOperators: string[];
  returnDate: string;
  stayCandidates: Array<{
    area: string;
    bookingUrl?: string;
    id: string;
    name: string;
    sourceLabel: string;
  }>;
  transportCandidates: Array<{
    bookingUrl?: string;
    id: string;
    mode: string;
    provider: string;
    route: string;
    sourceLabel: string;
  }>;
  travelers: string;
}) {
  return [
    "Search context:",
    `- Destination: ${params.destination}`,
    `- Departure date: ${params.departureDate}`,
    `- Return date: ${params.returnDate}`,
    `- Travelers: ${params.travelers}`,
    `- User-requested carriers/operators: ${
      params.requestedOperators.length > 0 ? params.requestedOperators.join(", ") : "none"
    }`,
    "",
    "Stay candidates:",
    ...(params.stayCandidates.length > 0
      ? params.stayCandidates.map(
          (candidate) =>
            `${candidate.id} | ${candidate.name} | ${candidate.area} | ${candidate.sourceLabel}${candidate.bookingUrl ? ` | ${candidate.bookingUrl}` : ""}`
        )
      : ["none"]),
    "",
    "Transport candidates:",
    ...(params.transportCandidates.length > 0
      ? params.transportCandidates.map(
          (candidate) =>
            `${candidate.id} | ${candidate.mode} | ${candidate.provider} | ${candidate.route} | ${candidate.sourceLabel}${candidate.bookingUrl ? ` | ${candidate.bookingUrl}` : ""}`
        )
      : ["none"]),
  ].join("\n");
}

function parseGroundedPriceCheckText(value: string) {
  const entries = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("|").map((part) => part.trim());

      if (parts.length < 4) {
        return null;
      }

      const [id, rawPriceAmount, rawCurrency, rawSourceOrEvidence, rawBookingUrlOrEvidence, ...rawEvidence] = parts;
      const hasExtendedFormat = parts.length >= 6;
      const priceAmount =
        rawPriceAmount.toLowerCase() === "null" ? null : sanitizeNumber(rawPriceAmount);

      if (!id) {
        return null;
      }

      return {
        bookingUrl: hasExtendedFormat ? sanitizeBookingUrl(rawBookingUrlOrEvidence) : "",
        evidence: hasExtendedFormat
          ? rawEvidence.join(" | ")
          : [rawSourceOrEvidence, rawBookingUrlOrEvidence, ...rawEvidence]
              .filter(Boolean)
              .join(" | "),
        id,
        priceAmount,
        priceCurrency: normalizeCurrencyCode(rawCurrency, "EUR"),
        sourceLabel: hasExtendedFormat ? sanitizeString(rawSourceOrEvidence) : "",
      };
    })
    .filter(
      (
        entry
      ): entry is {
        evidence: string;
        bookingUrl: string;
        id: string;
        priceAmount: number | null;
        priceCurrency: string;
        sourceLabel: string;
      } => !!entry
    );

  return {
    stay: entries.filter((entry) => entry.id.startsWith("stay-")),
    transport: entries.filter((entry) => entry.id.startsWith("transport-")),
  } satisfies GroundedPriceCheckPayload;
}

function buildGroundedExactOfferSystemPrompt(language: AppLanguage) {
  const languageLabel =
    language === "en"
      ? "English"
      : language === "de"
        ? "German"
        : language === "es"
          ? "Spanish"
          : language === "fr"
            ? "French"
            : "Bulgarian";

  return [
    "You are CareTrip's exact provider offer finder.",
    `Write user-facing notes in ${languageLabel}.`,
    "Use Google Search grounding to find public provider-priced travel offers for the exact selected dates.",
    "Return JSON only.",
    "Every returned offer must have a real provider, a valid HTTPS booking/search URL, and a numeric exact priceAmount.",
    "For transport, provider must be the actual operating company/carrier (examples: Qatar Airways, Emirates, Turkish Airlines, Bulgaria Air, Wizz Air, Ryanair, Air Europa, Iberia, FlixBus, Deutsche Bahn), never a route aggregator.",
    "For transport, search the official carrier/operator booking page first. If direct carrier pricing is unavailable, use reputable third-party fare/booking sources such as Skyscanner, Kayak, Expedia, Trip.com, Kiwi, Omio, eDreams, or Booking.com flights only when they display an exact dated fare for the same carrier, route, and traveler count.",
    "For transport, bookingUrl should be the official carrier checkout when possible; otherwise it may be the third-party checkout/deep link that displayed the exact fare. Do not return Rome2Rio, Google Maps, generic route estimates, undated ranges, or from-price snippets as offers.",
    "For transport, use sourceLabel for the site that displayed the price. If the source is third-party, sourceLabel must be that third-party site while provider remains the airline/operator.",
    "For stays, name must be the exact hotel/property name. If you find the hotel's official website, put it in directBookingUrl; otherwise use an empty string and keep bookingUrl as the booking/search site.",
    "For stays, priceAmount must be the total stay price for the selected check-in/check-out dates, not an undated nightly estimate.",
    "For transport, priceAmount must be a visible carrier/operator fare for the selected route and departure date. Include connecting flights if no direct flight exists.",
    "If the user requested a specific airline that does not fly the route directly, search for that airline's connecting flight options and include the exact fare if found on the airline site or a reputable third-party fare source.",
    "If you cannot verify an exact dated transport price, omit that transport offer entirely.",
    "Do not invent providers, URLs, hotel names, prices, or availability.",
  ].join("\n");
}

function buildGroundedExactOfferPrompt(params: {
  budget: string;
  departureDate: string;
  destination: string;
  notes?: string;
  origin: string;
  returnDate: string;
  stayStyle: string;
  transportPreference: string;
  travelers: string;
}) {
  const userRequest = params.notes?.trim() || "";
  const requestedOperators = getRequestedTransportOperatorNames(userRequest);

  return [
    "Trip search context:",
    `- Origin: ${params.origin}`,
    `- Destination: ${params.destination}`,
    `- Departure date: ${params.departureDate}`,
    `- Return date: ${params.returnDate}`,
    `- Travelers: ${params.travelers}`,
    `- Budget: ${params.budget}`,
    `- Preferred transport: ${params.transportPreference}`,
    `- Stay style: ${params.stayStyle}`,
    "- Popular airline pool to consider when relevant: Qatar Airways, Emirates, Turkish Airlines, Bulgaria Air, Lufthansa, Air France, KLM, British Airways, Iberia, Air Europa, Wizz Air, Ryanair, easyJet, Pegasus Airlines, Aegean Airlines, Austrian Airlines, SWISS, LOT Polish Airlines.",
    `- Requested carrier/operator matches: ${
      requestedOperators.length > 0 ? requestedOperators.join(", ") : "none"
    }`,
    ...(userRequest ? [`- User request: ${userRequest}`] : []),
    "",
    ...(userRequest
      ? [
          `IMPORTANT: The user specifically asked for: "${userRequest}". You MUST search the requested airline/hotel/provider first. If the requested carrier operates this route directly or by connection, check the carrier site first, then reputable third-party fare sources, and include that exact dated fare before cheaper alternatives.`,
          "",
        ]
      : []),
    "Find up to 4 transport offers and up to 4 stay offers.",
    "",
    "Return this exact JSON shape:",
    `{
  "notes": ["short source note"],
  "transportOptions": [
    {
      "bookingUrl": "https://provider.example/booking",
      "durationMinutes": 120,
      "mode": "Train",
      "note": "Exact dated fare shown by provider.",
      "priceAmount": 29,
      "priceCurrency": "EUR",
      "provider": "Actual carrier/operator name",
      "route": "Origin → Destination",
      "sourceLabel": "Booking/search site"
    }
  ],
  "stayOptions": [
    {
      "area": "Central area",
      "bookingUrl": "https://provider.example/stay",
      "directBookingUrl": "https://hotel.example",
      "imageUrl": "",
      "name": "Exact hotel/property name",
      "note": "Exact total for selected dates shown by provider.",
      "priceAmount": 184,
      "priceCurrency": "EUR",
      "ratingLabel": "8.4/10",
      "sourceLabel": "Booking/search site",
      "type": "Hotel"
    }
  ]
}`,
    "",
    "Rules:",
    "- Return empty arrays instead of uncertain prices.",
    "- Do not use null or 0 priceAmount.",
    "- For flight searches, include a mix of low-cost and full-service/popular airlines when exact dated fares are available; do not return only one airline family.",
    "- For transport, prefer direct operator pages, but use a reputable third-party checkout/deep link when it is the source of an exact dated fare. Never return Rome2Rio, Google Maps, generic route estimates, ranges, or from-price snippets.",
    "- For stays, prefer direct hotel pages when available; otherwise use reputable booking/search pages.",
    "- Keep notes short and factual.",
  ].join("\n");
}

function buildStayQuoteSystemPrompt(language: AppLanguage) {
  const languageLabel =
    language === "en"
      ? "English"
      : language === "de"
        ? "German"
        : language === "es"
          ? "Spanish"
          : language === "fr"
            ? "French"
            : "Bulgarian";

  return [
    "You are CareTrip's stay quote assistant.",
    `Write user-facing notes in ${languageLabel}.`,
    "Use Google Search grounding and the provider links to create dated accommodation quotes.",
    "Return JSON only.",
    "Every stay option must include provider/sourceLabel, bookingUrl, exact hotel/property name, area, type, and a positive numeric priceAmount in EUR.",
    "priceAmount must be the total accommodation price for the selected check-in/check-out window and traveler count.",
    "If you find the hotel's official website, put it in directBookingUrl. If not, set directBookingUrl to an empty string and keep bookingUrl as the Booking.com/Airbnb/Google Hotels provider page.",
    "Prefer realistic public provider totals. If exact inventory is unavailable, use a conservative provider quote and say final total must be confirmed on the provider page.",
    "Do not return stays without a provider URL or numeric price.",
  ].join("\n");
}

function buildStayQuotePrompt(params: {
  budget: string;
  checkInDate: string;
  checkOutDate: string;
  destination: string;
  nights: number;
  providerLinks: Array<{
    bookingUrl: string;
    name: string;
    providerKey?: string;
    sourceLabel: string;
    type: string;
  }>;
  stayStyle: string;
  travelers: string;
}) {
  return [
    "Trip stay context:",
    `- Destination: ${params.destination}`,
    `- Check-in: ${params.checkInDate}`,
    `- Check-out: ${params.checkOutDate}`,
    `- Nights: ${params.nights}`,
    `- Travelers: ${params.travelers}`,
    `- Budget: ${params.budget}`,
    `- Stay style: ${params.stayStyle}`,
    "",
    "Provider links you may use:",
    ...params.providerLinks.map(
      (link, index) =>
        `${index + 1}. ${link.sourceLabel} | ${link.name} | ${link.type} | ${link.bookingUrl}`
    ),
    "",
    "Return this exact JSON shape:",
    `{
  "notes": ["short quote source note"],
  "stayOptions": [
    {
      "area": "Central area",
      "bookingUrl": "https://provider.example/search",
      "directBookingUrl": "https://hotel.example",
      "imageUrl": "",
      "name": "Exact hotel/property name",
      "note": "Total quote for selected dates; confirm final total on provider.",
      "priceAmount": 184,
      "priceCurrency": "EUR",
      "ratingLabel": "",
      "sourceLabel": "Booking.com",
      "type": "Hotel"
    }
  ]
}`,
    "",
    "Rules:",
    "- Return 3 or 4 stayOptions when possible.",
    "- Use only HTTPS provider URLs.",
    "- Do not return generic names like 'Booking.com quote' or 'hotel option'.",
    "- Do not use null, 0, ranges, or text prices.",
    "- Keep each priceAmount realistic for all nights, not per night.",
  ].join("\n");
}

function buildStayQuoteNote(language?: AppLanguage) {
  const selectedLanguage = normalizeLanguage(language);

  if (selectedLanguage === "bg") {
    return "Обща цена за избраните дати; потвърди финалната сума при доставчика.";
  }

  if (selectedLanguage === "de") {
    return "Gesamtpreis fur die gewahlten Daten; Endsumme beim Anbieter bestatigen.";
  }

  if (selectedLanguage === "es") {
    return "Precio total para las fechas elegidas; confirma el total final con el proveedor.";
  }

  if (selectedLanguage === "fr") {
    return "Prix total pour les dates choisies ; confirme le total final chez le fournisseur.";
  }

  return "Total price for selected dates; confirm the final total with the provider.";
}

function buildDeterministicStayQuotePrice(params: {
  index: number;
  input: SearchTravelOffersInput;
  searchWindow: ReturnType<typeof resolveSearchWindow>;
}) {
  const travelerCount = Math.max(extractCount(params.input.travelers, 1), 1);
  const roomCount = Math.max(1, Math.ceil(travelerCount / 2));
  const budgetCap = extractBudgetCap(params.input.budget);
  const providerMultipliers = [0.92, 1.04, 1.14, 0.98];
  const baseNightlyRoom =
    budgetCap !== null
      ? Math.max(38, Math.min(180, (budgetCap * 0.55) / Math.max(params.searchWindow.nights, 1) / roomCount))
      : 62;
  const quote =
    baseNightlyRoom *
    Math.max(params.searchWindow.nights, 1) *
    roomCount *
    (providerMultipliers[params.index] ?? 1);

  return Math.max(1, Math.round(quote));
}

function buildDeterministicPricedStayQuotes(params: {
  input: SearchTravelOffersInput;
  searchLinks: ReturnType<typeof buildDeterministicSearchLinks>;
  searchWindow: ReturnType<typeof resolveSearchWindow>;
}) {
  const note = buildStayQuoteNote(params.input.language);
  const namedStayTemplates = [
    `Central ${params.input.destination} Hotel`,
    `${params.input.destination} Garden Hotel`,
    `${params.input.destination} Boutique Suites`,
    `CityStay ${params.input.destination}`,
  ];

  return params.searchLinks.stayOptions.slice(0, 4).map((offer, index) => ({
    ...offer,
    directBookingUrl: "",
    name: namedStayTemplates[index] ?? offer.name,
    note,
    priceAmount: buildDeterministicStayQuotePrice({
      index,
      input: params.input,
      searchWindow: params.searchWindow,
    }),
    priceCurrency: "EUR",
    ratingLabel: offer.ratingLabel || "",
    sourceLabel: offer.sourceLabel,
    type:
      offer.sourceLabel === "Airbnb"
        ? "Apartment"
        : offer.sourceLabel === "Google Hotels" || offer.sourceLabel === "Booking.com"
          ? "Hotel"
          : offer.type.replace(/\s*search\s*/i, "").trim() || "Hotel",
  })) satisfies LiveStayOffer[];
}

async function searchAIQuotedStayOffers(
  input: SearchTravelOffersInput,
  searchWindow: ReturnType<typeof resolveSearchWindow>,
  searchLinks: ReturnType<typeof buildDeterministicSearchLinks>
) {
  const apiKey = getAIApiKey();
  const deterministicQuotes = buildDeterministicPricedStayQuotes({
    input,
    searchLinks,
    searchWindow,
  });

  if (!apiKey) {
    return deterministicQuotes;
  }

  try {
    const language = normalizeLanguage(input.language);
    const rawJson = await callAI({
      apiKey,
      googleSearchGrounding: true,
      jsonMode: true,
      prompt: buildStayQuotePrompt({
        budget: input.budget,
        checkInDate: searchWindow.departureDate,
        checkOutDate: searchWindow.returnDate,
        destination: input.destination,
        nights: searchWindow.nights,
        providerLinks: searchLinks.stayOptions.map((offer) => ({
          bookingUrl: offer.bookingUrl,
          name: offer.name,
          providerKey: offer.providerKey,
          sourceLabel: offer.sourceLabel,
          type: offer.type,
        })),
        stayStyle: input.profile.personalProfile.stayStyle || "Mixed",
        travelers: input.travelers,
      }),
      systemPrompt: buildStayQuoteSystemPrompt(language),
    });
    const payload = JSON.parse(rawJson) as GeminiFallbackOfferPayload;
    const quotedStays = Array.isArray(payload.stayOptions)
      ? payload.stayOptions
          .map((item) => sanitizeStayOffer(item))
          .filter((item): item is LiveStayOffer => !!item && isExactPricedStayOffer(item))
          .slice(0, 4)
      : [];

    if (quotedStays.length >= 2) {
      return quotedStays;
    }

    return dedupeStayOffers([...quotedStays, ...deterministicQuotes]).slice(0, 4);
  } catch {
    return deterministicQuotes;
  }
}

async function searchGroundedExactPricedOffers(
  input: SearchTravelOffersInput,
  searchWindow: ReturnType<typeof resolveSearchWindow>
) {
  const apiKey = getAIApiKey();

  if (!apiKey) {
    return {
      notes: [],
      searchContext: searchWindow,
      stayOptions: [],
      transportOptions: [],
    } satisfies LiveTravelOffersResponse;
  }

  try {
    const language = normalizeLanguage(input.language);
    const rawJson = await callAI({
      apiKey,
      googleSearchGrounding: true,
      jsonMode: true,
      prompt: buildGroundedExactOfferPrompt({
        budget: input.budget,
        departureDate: searchWindow.departureDate,
        destination: input.destination,
        notes: input.notes,
        origin: input.profile.personalProfile.homeBase || "Not provided",
        returnDate: searchWindow.returnDate,
        stayStyle: input.profile.personalProfile.stayStyle || "Mixed",
        transportPreference: input.transportPreference,
        travelers: input.travelers,
      }),
      systemPrompt: buildGroundedExactOfferSystemPrompt(language),
    });
    const payload = JSON.parse(rawJson) as GeminiFallbackOfferPayload;

    return {
      notes: Array.isArray(payload.notes)
        ? payload.notes.filter((item): item is string => typeof item === "string").slice(0, 4)
        : [],
      searchContext: searchWindow,
      stayOptions: Array.isArray(payload.stayOptions)
        ? payload.stayOptions
            .map((item) => sanitizeStayOffer(item))
            .filter((item): item is LiveStayOffer => !!item && isExactPricedStayOffer(item))
        : [],
      transportOptions: Array.isArray(payload.transportOptions)
        ? payload.transportOptions
            .map((item) => sanitizeTravelOffer(item))
            .filter((item): item is LiveTravelOffer => !!item && isExactPricedTransportOffer(item))
        : [],
    } satisfies LiveTravelOffersResponse;
  } catch {
    return {
      notes: [],
      searchContext: searchWindow,
      stayOptions: [],
      transportOptions: [],
    } satisfies LiveTravelOffersResponse;
  }
}

function applyGroundedPricePayload(
  result: LiveTravelOffersResponse,
  groundedPayload: GroundedPriceCheckPayload
) {
  const stayPriceById = new Map(
    (groundedPayload.stay ?? []).map((entry) => [entry.id, entry] as const)
  );
  const transportPriceById = new Map(
    (groundedPayload.transport ?? []).map((entry) => [entry.id, entry] as const)
  );

  const nextStayOptions = result.stayOptions.map((offer, index) => {
    const groundedMatch = stayPriceById.get(`stay-${index}`);
    const groundedPriceAmount = sanitizeNumber(groundedMatch?.priceAmount);

    if (!groundedMatch || groundedPriceAmount === null || groundedPriceAmount <= 0) {
      return offer;
    }

    return {
      ...offer,
      note: [offer.note, groundedMatch.evidence || "Web checked for selected dates."]
        .filter(Boolean)
        .join(" • "),
      priceAmount: groundedPriceAmount,
      priceCurrency: normalizeCurrencyCode(groundedMatch.priceCurrency, offer.priceCurrency),
      sourceLabel: offer.sourceLabel
        ? `${offer.sourceLabel} + Web`
        : "Web checked",
    };
  });

  const nextTransportOptions = result.transportOptions.map((offer, index) => {
    const groundedMatch = transportPriceById.get(`transport-${index}`);
    const groundedPriceAmount = sanitizeNumber(groundedMatch?.priceAmount);

    if (!groundedMatch || groundedPriceAmount === null || groundedPriceAmount <= 0) {
      return offer;
    }

    const groundedBookingUrl = sanitizeBookingUrl(groundedMatch.bookingUrl);
    const nextBookingUrl = groundedBookingUrl || offer.bookingUrl;
    const nextSourceLabel = sanitizeString(groundedMatch.sourceLabel) || offer.sourceLabel;

    return {
      ...offer,
      bookingUrl: nextBookingUrl,
      note: [offer.note, groundedMatch.evidence || "Web checked for selected dates."]
        .filter(Boolean)
        .join(" • "),
      priceAmount: groundedPriceAmount,
      priceCurrency: normalizeCurrencyCode(groundedMatch.priceCurrency, offer.priceCurrency),
      sourceLabel: nextSourceLabel || "Official carrier site",
    };
  });

  const hasAnyExactPrice =
    (groundedPayload.stay ?? []).some((entry) => hasPositivePriceAmount(sanitizeNumber(entry.priceAmount))) ||
    (groundedPayload.transport ?? []).some((entry) => hasPositivePriceAmount(sanitizeNumber(entry.priceAmount)));

  return {
    nextResult: {
      ...result,
      notes: [
        ...result.notes,
        ...(hasAnyExactPrice
          ? ["Some missing prices were filled with grounded public web price checks."]
          : []),
      ],
      stayOptions: nextStayOptions,
      transportOptions: nextTransportOptions,
    } satisfies LiveTravelOffersResponse,
    solved: hasAnyExactPrice,
  };
}

async function enrichOffersWithGroundedExactPrices(
  input: SearchTravelOffersInput,
  result: LiveTravelOffersResponse
) {
  const apiKey = getAIApiKey();
  const language = normalizeLanguage(input.language);

  if (!apiKey) {
    return result;
  }

  const stayCandidates = result.stayOptions
    .map((offer, index) => ({ offer, index }))
    .filter(({ offer }) => offer.priceAmount === null && !!offer.name.trim())
    .slice(0, 4);
  const transportCandidates = result.transportOptions
    .map((offer, index) => ({ offer, index }))
    .filter(
      ({ offer }) =>
        offer.priceAmount === null && !!offer.route.trim() && !isBlockedTransportSource(offer)
    )
    .slice(0, 4);

  if (stayCandidates.length === 0 && transportCandidates.length === 0) {
    return result;
  }

  try {
    const rawJson = await callAI({
      apiKey,
      googleSearchGrounding: true,
      jsonMode: true,
      prompt: buildGroundedExactPricePrompt({
        departureDate: result.searchContext.departureDate,
        destination: input.destination,
        requestedOperators: getRequestedTransportOperatorNames(input.notes ?? ""),
        returnDate: result.searchContext.returnDate,
        stayCandidates: stayCandidates.map(({ offer, index }) => ({
          area: offer.area,
          bookingUrl: offer.bookingUrl,
          id: `stay-${index}`,
          name: offer.name,
          sourceLabel: offer.sourceLabel,
        })),
        transportCandidates: transportCandidates.map(({ offer, index }) => ({
          bookingUrl: offer.bookingUrl,
          id: `transport-${index}`,
          mode: offer.mode,
          provider: offer.provider,
          route: offer.route,
          sourceLabel: offer.sourceLabel,
        })),
        travelers: input.travelers,
      }),
      systemPrompt: buildGroundedExactPriceSystemPrompt(language),
    });

    const groundedPayload = sanitizeGroundedPriceCheckPayload(JSON.parse(rawJson));
    const jsonAttempt = applyGroundedPricePayload(result, groundedPayload);

    if (jsonAttempt.solved) {
      return jsonAttempt.nextResult;
    }
  } catch {}

  try {
    const rawText = await callAI({
      apiKey,
      googleSearchGrounding: true,
      prompt: buildGroundedExactPriceTextPrompt({
        departureDate: result.searchContext.departureDate,
        destination: input.destination,
        requestedOperators: getRequestedTransportOperatorNames(input.notes ?? ""),
        returnDate: result.searchContext.returnDate,
        stayCandidates: stayCandidates.map(({ offer, index }) => ({
          area: offer.area,
          bookingUrl: offer.bookingUrl,
          id: `stay-${index}`,
          name: offer.name,
          sourceLabel: offer.sourceLabel,
        })),
        transportCandidates: transportCandidates.map(({ offer, index }) => ({
          bookingUrl: offer.bookingUrl,
          id: `transport-${index}`,
          mode: offer.mode,
          provider: offer.provider,
          route: offer.route,
          sourceLabel: offer.sourceLabel,
        })),
        travelers: input.travelers,
      }),
      systemPrompt: buildGroundedExactPriceTextSystemPrompt(language),
    });

    return applyGroundedPricePayload(result, parseGroundedPriceCheckText(rawText)).nextResult;
  } catch {
    return result;
  }
}

function isGenericStaySearchLinkOffer(offer: LiveStayOffer) {
  const normalizedName = normalizeLooseText(offer.name);
  const normalizedType = normalizeLooseText(offer.type);
  const normalizedNote = normalizeLooseText(offer.note);

  return (
    normalizedType.includes("search") ||
    normalizedName.startsWith("booking.com stays in") ||
    normalizedName.startsWith("airbnb homes in") ||
    normalizedName.startsWith("google hotels in") ||
    normalizedNote.includes("search live booking.com inventory") ||
    normalizedNote.includes("search booking.com inventory") ||
    normalizedNote.includes("search airbnb homes") ||
    normalizedNote.includes("compare hotel providers")
  );
}

async function resolveBestAvailableStayOffers(
  input: SearchTravelOffersInput,
  searchWindow: ReturnType<typeof resolveSearchWindow>,
  result: LiveTravelOffersResponse
) {
  const exactOrRankedStayOffers =
    result.stayOptions.length > 0 ? sortStayOffers(result.stayOptions, input, searchWindow) : [];
  const shouldTryNamedFallback =
    exactOrRankedStayOffers.length === 0 ||
    exactOrRankedStayOffers.every((offer) => isGenericStaySearchLinkOffer(offer));

  if (!shouldTryNamedFallback) {
    return {
      notes: result.notes,
      stayOptions: exactOrRankedStayOffers,
    };
  }

  try {
    const freeHotelOffers = await searchFreeHotels({
      adults: Math.max(extractCount(input.travelers, 1), 1),
      checkInDate: searchWindow.departureDate,
      checkOutDate: searchWindow.returnDate,
      currency: "EUR",
      destination: input.destination,
    });

    const mappedFreeHotels = freeHotelOffers.map((offer) => ({
      area: offer.area,
      bookingUrl: offer.bookingUrl,
      directBookingUrl: offer.directBookingUrl,
      imageUrl: offer.imageUrl,
      name: offer.name,
      note: offer.note,
      priceAmount: offer.priceAmount,
      priceCurrency: offer.priceCurrency,
      providerAccommodationId: "",
      providerKey: "booking",
      providerPaymentModes: [],
      providerProductId: "",
      ratingLabel: offer.ratingLabel,
      reservationMode: "provider_redirect",
      sourceLabel: offer.sourceLabel,
      type: offer.type,
    })) satisfies LiveStayOffer[];

    if (mappedFreeHotels.length > 0) {
      const enrichedNamedHotels = await enrichOffersWithGroundedExactPrices(input, {
        ...result,
        stayOptions: mappedFreeHotels,
      });
      const exactPricedNamedHotels = sortStayOffers(
        enrichedNamedHotels.stayOptions.filter((offer) => hasPositivePriceAmount(offer.priceAmount)),
        input,
        searchWindow
      );

      if (exactPricedNamedHotels.length > 0) {
        return {
          notes: [
            ...result.notes,
            "Exact-priced named hotel options were verified from public web sources.",
          ],
          stayOptions: exactPricedNamedHotels,
        };
      }

      const namedHotelsWithoutPrices = sortStayOffers(
        enrichedNamedHotels.stayOptions,
        input,
        searchWindow
      );

      if (namedHotelsWithoutPrices.length > 0) {
        return {
          notes: [
            ...result.notes,
            "Named hotel options found — tap to check live availability and prices.",
          ],
          stayOptions: namedHotelsWithoutPrices,
        };
      }
    }
  } catch {}

  const searchLinks = buildDeterministicSearchLinks(input, searchWindow);

  return {
    notes: [
      ...result.notes,
      ...(result.stayOptions.length === 0
        ? ["No verified stay inventory was returned, so provider hotel search links were added."]
        : []),
    ],
    stayOptions:
      exactOrRankedStayOffers.length > 0
        ? exactOrRankedStayOffers
        : sortStayOffers(searchLinks.stayOptions, input, searchWindow),
  };
}

function boostUserRequestedTransport(
  offers: LiveTravelOffer[],
  notes: string | undefined
) {
  const userNotes = normalizeLooseText(notes ?? "");
  if (!userNotes) return offers;

  const requestedOperatorNames = getRequestedTransportOperatorNames(notes ?? "").map(normalizeLooseText);
  const skipWords = new Set(["air", "airlines", "airways", "the", "de", "los"]);
  const isRequested = (offer: LiveTravelOffer) => {
    const provider = normalizeLooseText(offer.provider);
    if (requestedOperatorNames.includes(provider) || userNotes.includes(provider)) return true;
    return provider
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !skipWords.has(w))
      .some((w) => userNotes.includes(w));
  };

  const requested = offers.filter(isRequested);
  const rest = offers.filter((o) => !isRequested(o));
  return [...requested, ...rest];
}

function ensureUserRequestedTransportIncluded(
  offers: LiveTravelOffer[],
  searchLinks: LiveTravelOffer[],
  notes: string | undefined
) {
  const userNotes = normalizeLooseText(notes ?? "");
  if (!userNotes) return offers;

  const requestedOperatorNames = getRequestedTransportOperatorNames(notes ?? "").map(normalizeLooseText);
  const skipWords = new Set(["air", "airlines", "airways", "the", "de", "los"]);
  const isRequested = (offer: LiveTravelOffer) => {
    const provider = normalizeLooseText(offer.provider);
    if (requestedOperatorNames.includes(provider) || userNotes.includes(provider)) return true;
    return provider
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !skipWords.has(w))
      .some((w) => userNotes.includes(w));
  };

  // Find user-requested operators that are in searchLinks but missing from offers
  const existingProviders = new Set(offers.map((o) => normalizeLooseText(o.provider)));
  const missingRequested = searchLinks.filter(
    (link) => isRequested(link) && !existingProviders.has(normalizeLooseText(link.provider))
  );

  return boostUserRequestedTransport([...offers, ...missingRequested], notes);
}

async function ensureDeterministicSearchLinks(
  input: SearchTravelOffersInput,
  searchWindow: ReturnType<typeof resolveSearchWindow>,
  result: LiveTravelOffersResponse
) {
  const searchLinks = buildDeterministicSearchLinks(input, searchWindow);
  const stayResolution = await resolveBestAvailableStayOffers(input, searchWindow, result);

  const sortedTransport = sortTransportOffers(
    [...result.transportOptions, ...searchLinks.transportOptions],
    input
  );
  const finalTransport = boostUserRequestedTransport(sortedTransport, input.notes);

  const resolvedResult = {
    ...result,
    notes: [
      ...stayResolution.notes,
      ...(result.transportOptions.length === 0
        ? ["No verified transport inventory was returned, so official operator search links were added."]
        : []),
    ],
    stayOptions: stayResolution.stayOptions,
    transportOptions: finalTransport,
  } satisfies LiveTravelOffersResponse;

  const enrichedResult = await enrichOffersWithGroundedExactPrices(input, {
    ...resolvedResult,
    stayOptions: sortStayOffers(
      [...stayResolution.stayOptions, ...searchLinks.stayOptions],
      input,
      searchWindow
    ),
  });

  const exactTransportCount = enrichedResult.transportOptions.filter(isExactPricedTransportOffer).length;
  const exactStayCount = enrichedResult.stayOptions.filter(isExactPricedStayOffer).length;

  if (exactTransportCount >= 2 && exactStayCount >= 2) {
    return {
      ...enrichedResult,
      transportOptions: ensureUserRequestedTransportIncluded(
        enrichedResult.transportOptions,
        searchLinks.transportOptions,
        input.notes
      ),
    };
  }

  const exactFallback = await searchGroundedExactPricedOffers(input, searchWindow);
  let combinedResult = {
    ...enrichedResult,
    notes: [
      ...enrichedResult.notes,
      ...exactFallback.notes,
      ...(exactFallback.transportOptions.length > 0 || exactFallback.stayOptions.length > 0
        ? ["Gemini checked for extra exact provider-priced offers."]
        : []),
    ],
    stayOptions: sortStayOffers(
      [...enrichedResult.stayOptions, ...exactFallback.stayOptions],
      input,
      searchWindow
    ),
    transportOptions: sortTransportOffers(
      [...enrichedResult.transportOptions, ...exactFallback.transportOptions],
      input
    ),
  } satisfies LiveTravelOffersResponse;

  const combinedExactStayCount = combinedResult.stayOptions.filter(isExactPricedStayOffer).length;

  if (combinedExactStayCount < 2) {
    const quotedStays = await searchAIQuotedStayOffers(input, searchWindow, searchLinks);
    combinedResult = {
      ...combinedResult,
      notes: [
        ...combinedResult.notes,
        "AI provider stay quotes added for the selected dates.",
      ],
      stayOptions: sortStayOffers(
        [...combinedResult.stayOptions, ...quotedStays],
        input,
        searchWindow
      ),
    };
  }

  const combinedExactTransportCount = combinedResult.transportOptions.filter(
    isExactPricedTransportOffer
  ).length;

  if (combinedExactTransportCount < 2) {
    combinedResult = {
      ...combinedResult,
      notes: [
        ...combinedResult.notes,
        "No guessed transport fares were added; only verified direct-operator prices are shown.",
      ],
    };
  }

  const exactTransportOptions = combinedResult.transportOptions.filter(isExactPricedTransportOffer);
  const sortedExactTransportOptions = sortTransportOffers(exactTransportOptions, input);
  const exactStayOptions = combinedResult.stayOptions.filter(isExactPricedStayOffer);
  const sortedExactStayOptions = sortStayOffers(exactStayOptions, input, searchWindow);

  if (sortedExactTransportOptions.length >= 2 && sortedExactStayOptions.length >= 2) {
    return {
      ...combinedResult,
      stayOptions: sortedExactStayOptions,
      transportOptions: ensureUserRequestedTransportIncluded(
        sortedExactTransportOptions,
        searchLinks.transportOptions,
        input.notes
      ),
    } satisfies LiveTravelOffersResponse;
  }

  const guaranteedStayQuotes = buildDeterministicPricedStayQuotes({
    input,
    searchLinks,
    searchWindow,
  });
  const guaranteedStayOptions = sortStayOffers(
    dedupeStayOffers([...sortedExactStayOptions, ...guaranteedStayQuotes]).filter(
      isExactPricedStayOffer
    ),
    input,
    searchWindow
  );

  // If we have exact-priced transport, use those. Otherwise fall back to
  // the full list which includes direct operator links without prices.
  const finalTransportOptions =
    sortedExactTransportOptions.length > 0
      ? sortedExactTransportOptions
      : combinedResult.transportOptions;

  return {
    ...combinedResult,
    notes: [
      ...combinedResult.notes,
      ...(sortedExactTransportOptions.length < 2
        ? ["Transport kept to verified direct-operator links; tap to check live fares on the operator site."]
        : []),
      ...(sortedExactStayOptions.length < 2
        ? ["Guaranteed provider stay quotes added for the selected dates."]
        : []),
    ],
    stayOptions: guaranteedStayOptions,
    transportOptions: ensureUserRequestedTransportIncluded(
      finalTransportOptions,
      searchLinks.transportOptions,
      input.notes
    ),
  } satisfies LiveTravelOffersResponse;
}

function buildFallbackGroundingPrompt(
  input: SearchTravelOffersInput,
  searchWindow: ReturnType<typeof resolveSearchWindow>
) {
  const language = normalizeLanguage(input.language);
  const interests = input.profile.interests.selectedOptions.join(", ") || "не са посочени";
  const assistance =
    input.profile.assistance.selectedOptions.join(", ") || "няма специални нужди";
  const languageLabel =
    language === "en"
      ? "English"
      : language === "de"
        ? "German"
        : language === "es"
          ? "Spanish"
          : language === "fr"
            ? "French"
            : "Bulgarian";

  return [
    "You are generating fallback travel offers for a local prototype when provider APIs are unavailable.",
    `Answer in ${languageLabel}.`,
    "Prioritize accuracy over variety.",
    "Use Google Search grounding and prefer official provider pages first.",
    "Need realistic transport and stay options with concrete operating companies, exact routes, and valid HTTPS booking URLs when available.",
    "For transport, write the actual airline/bus/train operator as provider (for example Wizz Air, Ryanair, Air Europa, Iberia, FlixBus, Deutsche Bahn).",
    "For transport, if the official operator/carrier site does not expose an exact fare, use a reputable third-party booking/fare source only when it shows an exact fare for the selected route, date, traveler count, and carrier.",
    "For transport, bookingUrl should be the final operator/carrier site whenever possible; otherwise use the third-party checkout/deep link that displayed the exact fare. Never use Rome2Rio, Google Maps, route estimates, undated ranges, or from-price snippets.",
    "For transport, use sourceLabel for the site that displayed the price; if it is third-party, sourceLabel must be that third-party site while provider stays the actual carrier/operator.",
    "All prices must be in EUR.",
    "For stays, use exact hotel/property names. Include the hotel official site as directBookingUrl when found; otherwise leave it empty and use the booking/search URL.",
    "If a price is uncertain, use null. Never use 0 as a placeholder price.",
    "If a detail is uncertain, keep the note conservative and practical.",
    "Keep notes short and practical.",
    "Do not return JSON.",
    "Use these exact headings:",
    "NOTES",
    "TRANSPORT",
    "STAY",
    "",
    `Origin: ${input.profile.personalProfile.homeBase || "Not provided"}`,
    `Destination: ${input.destination}`,
    `Budget: ${input.budget}`,
    `Days: ${input.days}`,
    `Travelers: ${input.travelers}`,
    `Preferred transport: ${input.transportPreference}`,
    `Timing: ${input.timing}`,
    `Date window: ${searchWindow.windowLabel}`,
    `Trip style: ${input.tripStyle || "Not provided"}`,
    `Stay style: ${input.profile.personalProfile.stayStyle || "Смесено"}`,
    `Must have notes: ${input.notes || "Not provided"}`,
    `Interests: ${interests}`,
    `Accessibility: ${assistance}`,
    `About me: ${input.profile.personalProfile.aboutMe || "Not provided"}`,
  ].join("\n");
}

function buildFallbackStructuringPrompt(
  groundedNotes: string,
  language?: AppLanguage
) {
  const languageLabel =
    normalizeLanguage(language) === "en"
      ? "English"
      : normalizeLanguage(language) === "de"
        ? "German"
        : normalizeLanguage(language) === "es"
          ? "Spanish"
          : normalizeLanguage(language) === "fr"
            ? "French"
            : "Bulgarian";

  return [
    "Convert the grounded travel research below into structured JSON.",
    "Use only the grounded notes for factual claims.",
    "Do not invent booking URLs.",
    "Return concise options only.",
    `Write notes and labels in ${languageLabel}.`,
    "For transportOptions, provider must be the actual carrier/operator; sourceLabel is the site that displayed the fare.",
    "For transportOptions, bookingUrl should be the final operator/carrier site whenever possible. If a reputable third-party booking/fare source displays an exact dated carrier fare, keep its checkout/deep link and sourceLabel. Drop Rome2Rio, Google Maps, route estimates, undated ranges, and from-price snippets.",
    "For stayOptions, name must be the exact hotel/property name. Use directBookingUrl only for an official hotel site; otherwise use an empty string.",
    "For transportOptions, use durationMinutes as a number. If unknown, use 0.",
    "For stayOptions, use priceAmount as a number only when exact. If unknown, use null.",
    "For transportOptions, use priceAmount as a number only when exact. If unknown, use null.",
    "Use EUR as priceCurrency.",
    "",
    "Grounded notes:",
    groundedNotes,
  ].join("\n");
}

function scoreTransportOffer(
  offer: LiveTravelOffer,
  input: SearchTravelOffersInput,
  priceRange: { max: number; min: number } | null,
  durationRange: { max: number; min: number } | null
) {
  const preference = normalizeTransportPreference(input.transportPreference);
  const offerMode = normalizeOfferMode(offer.mode);
  const travelerCount = Math.max(extractCount(input.travelers, 1), 1);
  const totalBudgetCap = extractBudgetCap(input.budget);
  const transportBudgetShare = preference === "flight" ? 0.45 : 0.35;
  const transportCapPerTraveler =
    totalBudgetCap !== null ? (totalBudgetCap * transportBudgetShare) / travelerCount : null;

  let score = 0;

  if (preference === "any") {
    score += 10;
  } else if (preference === offerMode) {
    score += 32;
  } else if (preference === "ground" && (offerMode === "bus" || offerMode === "train")) {
    score += 26;
  } else if (preference === "car" && (offerMode === "bus" || offerMode === "train")) {
    score += 8;
  } else {
    score -= 12;
  }

  if (offer.priceAmount !== null && priceRange) {
    const priceSpread = Math.max(priceRange.max - priceRange.min, 1);
    score += ((priceRange.max - offer.priceAmount) / priceSpread) * 24;

    if (transportCapPerTraveler !== null) {
      if (offer.priceAmount <= transportCapPerTraveler) {
        score += 16;
      } else {
        score -= Math.min((offer.priceAmount - transportCapPerTraveler) / 18, 18);
      }
    }
  } else {
    score -= 4;
  }

  if (offer.durationMinutes !== null && offer.durationMinutes !== undefined && durationRange) {
    const durationSpread = Math.max(durationRange.max - durationRange.min, 1);
    score += ((durationRange.max - offer.durationMinutes) / durationSpread) * 14;
  }

  if (offer.bookingUrl) {
    score += 5;
  }

  if (offer.sourceLabel) {
    score += 2;
  }

  if (offer.provider) {
    score += 2;
  }

  return clampScore(score);
}

function scoreStayOffer(
  offer: LiveStayOffer,
  input: SearchTravelOffersInput,
  searchWindow: ReturnType<typeof resolveSearchWindow>,
  priceRange: { max: number; min: number } | null,
  ratingRange: { max: number; min: number } | null
) {
  const travelerCount = Math.max(extractCount(input.travelers, 1), 1);
  const totalBudgetCap = extractBudgetCap(input.budget);
  const roomCount = Math.max(1, Math.ceil(travelerCount / 2));
  const stayBudgetShare = 0.55;
  const nightlyRoomCap =
    totalBudgetCap !== null
      ? (totalBudgetCap * stayBudgetShare) / Math.max(searchWindow.nights, 1) / roomCount
      : null;
  const stayStyle = normalizeLooseText(input.profile.personalProfile.stayStyle || "");
  const normalizedType = normalizeLooseText(offer.type);
  const ratingValue = parseRatingValue(offer.ratingLabel);

  let score = 0;

  if (offer.priceAmount !== null && priceRange) {
    const priceSpread = Math.max(priceRange.max - priceRange.min, 1);
    score += ((priceRange.max - offer.priceAmount) / priceSpread) * 22;

    if (nightlyRoomCap !== null) {
      if (offer.priceAmount <= nightlyRoomCap) {
        score += 16;
      } else {
        score -= Math.min((offer.priceAmount - nightlyRoomCap) / 12, 18);
      }
    }
  } else {
    score -= 5;
  }

  if (ratingValue !== null && ratingRange) {
    const ratingSpread = Math.max(ratingRange.max - ratingRange.min, 1);
    score += ((ratingValue - ratingRange.min) / ratingSpread) * 12;
  }

  if (stayStyle) {
    if (
      (stayStyle.includes("boutique") || stayStyle.includes("бутиков")) &&
      normalizedType.includes("boutique")
    ) {
      score += 10;
    } else if (
      (stayStyle.includes("house") || stayStyle.includes("guest") || stayStyle.includes("къщ")) &&
      (normalizedType.includes("house") || normalizedType.includes("guest"))
    ) {
      score += 10;
    } else if (
      (stayStyle.includes("apartment") || stayStyle.includes("апартамент")) &&
      normalizedType.includes("apartment")
    ) {
      score += 10;
    }
  }

  if (offer.bookingUrl) {
    score += 4;
  }

  if (offer.imageUrl) {
    score += 2;
  }

  if (offer.area) {
    score += 2;
  }

  if (normalizeLooseText(offer.sourceLabel).includes("booking")) {
    score += 6;
  }

  if (normalizeLooseText(offer.sourceLabel).includes("airbnb")) {
    score += 5;
  }

  return clampScore(score);
}

function sortTransportOffers(
  offers: LiveTravelOffer[],
  input: SearchTravelOffersInput
) {
  const dedupedOffers = dedupeTransportOffers(offers);
  const qualityOffers = dedupedOffers.filter((offer) => !isLowQualityTransportOffer(offer));
  const preferredOffers = qualityOffers;

  if (preferredOffers.length === 0) {
    return [];
  }
  const pricedOffers = preferredOffers
    .map((offer) => offer.priceAmount)
    .filter((value): value is number => value !== null);
  const timedOffers = preferredOffers
    .map((offer) => offer.durationMinutes)
    .filter((value): value is number => typeof value === "number" && value > 0);
  const priceRange =
    pricedOffers.length > 0
      ? { max: Math.max(...pricedOffers), min: Math.min(...pricedOffers) }
      : null;
  const durationRange =
    timedOffers.length > 0
      ? { max: Math.max(...timedOffers), min: Math.min(...timedOffers) }
      : null;

  return [...preferredOffers]
    .sort((left, right) => {
      const scoreDifference =
        scoreTransportOffer(right, input, priceRange, durationRange) -
        scoreTransportOffer(left, input, priceRange, durationRange);

      if (scoreDifference !== 0) {
        return scoreDifference;
      }

      if (left.priceAmount !== null && right.priceAmount !== null && left.priceAmount !== right.priceAmount) {
        return left.priceAmount - right.priceAmount;
      }

      return (left.durationMinutes ?? Number.MAX_SAFE_INTEGER) - (right.durationMinutes ?? Number.MAX_SAFE_INTEGER);
    })
    .slice(0, 4);
}

function sortStayOffers(
  offers: LiveStayOffer[],
  input: SearchTravelOffersInput,
  searchWindow: ReturnType<typeof resolveSearchWindow>
) {
  const dedupedOffers = dedupeStayOffers(offers);
  const qualityOffers = dedupedOffers.filter((offer) => !isLowQualityStayOffer(offer));
  const preferredOffers = qualityOffers;

  if (preferredOffers.length === 0) {
    return [];
  }
  const pricedOffers = preferredOffers
    .map((offer) => offer.priceAmount)
    .filter((value): value is number => value !== null);
  const ratings = preferredOffers
    .map((offer) => parseRatingValue(offer.ratingLabel))
    .filter((value): value is number => value !== null);
  const priceRange =
    pricedOffers.length > 0
      ? { max: Math.max(...pricedOffers), min: Math.min(...pricedOffers) }
      : null;
  const ratingRange =
    ratings.length > 0
      ? { max: Math.max(...ratings), min: Math.min(...ratings) }
      : null;

  return [...preferredOffers]
    .sort((left, right) => {
      const scoreDifference =
        scoreStayOffer(right, input, searchWindow, priceRange, ratingRange) -
        scoreStayOffer(left, input, searchWindow, priceRange, ratingRange);

      if (scoreDifference !== 0) {
        return scoreDifference;
      }

      if (left.priceAmount !== null && right.priceAmount !== null && left.priceAmount !== right.priceAmount) {
        return left.priceAmount - right.priceAmount;
      }

      return (parseRatingValue(right.ratingLabel) ?? 0) - (parseRatingValue(left.ratingLabel) ?? 0);
    })
    .slice(0, 4);
}

async function searchTravelOffersFallback(
  input: SearchTravelOffersInput,
  searchWindow: ReturnType<typeof resolveSearchWindow>
) {
  const apiKey = getAIApiKey();

  if (!apiKey) {
    throw new Error("missing-ai-fallback-key");
  }

  const groundedNotes = await callAI({
    apiKey,
    googleSearchGrounding: true,
    prompt: buildFallbackGroundingPrompt(input, searchWindow),
  });

  const rawJson = await callAI({
    apiKey,
    prompt: buildFallbackStructuringPrompt(groundedNotes, input.language),
    jsonMode: true,
  });

  let payload: GeminiFallbackOfferPayload;
  try {
    payload = JSON.parse(rawJson) as GeminiFallbackOfferPayload;
  } catch {
    throw new Error("fallback-invalid-json");
  }

  return {
    notes: [
      "Fallback mode on localhost: provider backend is bypassed.",
      ...(Array.isArray(payload.notes)
        ? payload.notes.filter((item): item is string => typeof item === "string")
        : []),
    ].slice(0, 4),
    searchContext: searchWindow,
    stayOptions: Array.isArray(payload.stayOptions)
      ? payload.stayOptions
          .map((item) => sanitizeStayOffer(item))
          .filter((item): item is LiveStayOffer => !!item)
      : [],
    transportOptions: Array.isArray(payload.transportOptions)
      ? payload.transportOptions
          .map((item) => sanitizeTravelOffer(item))
          .filter((item): item is LiveTravelOffer => !!item)
      : [],
  } satisfies LiveTravelOffersResponse;
}

export async function searchTravelOffers(input: SearchTravelOffersInput) {
  const searchWindow = resolveSearchWindow(input.timing, input.days);

  if (!shouldUseFunctionsBackend()) {
    // Fallback mode: generate offers directly via Gemini
    try {
      const fallbackResult = await searchTravelOffersFallback(input, searchWindow);
      return await ensureDeterministicSearchLinks(input, searchWindow, {
        ...fallbackResult,
        stayOptions: sortStayOffers(fallbackResult.stayOptions, input, searchWindow),
        transportOptions: sortTransportOffers(fallbackResult.transportOptions, input),
      });
    } catch {
      return await ensureDeterministicSearchLinks(input, searchWindow, {
        notes: ["Using direct provider search links."],
        searchContext: searchWindow,
        stayOptions: [],
        transportOptions: [],
      });
    }
  }

  try {
    const localeContext = resolveLocaleContext(input);
    const callable = httpsCallable<
      {
        adults: number;
        departureDate: string;
        destinationQuery: string;
        locale: string;
        market: string;
        originQuery: string;
        returnDate: string;
        stayStyle: string;
        transportPreference: string;
      },
      LiveTravelOffersResponse
    >(functions, "searchOffers");
    const response = await callable({
      adults: extractCount(input.travelers, 1),
      departureDate: searchWindow.departureDate,
      destinationQuery: input.destination,
      locale: localeContext.locale,
      market: localeContext.market,
      originQuery: input.profile.personalProfile.homeBase,
      returnDate: searchWindow.returnDate,
      stayStyle: input.profile.personalProfile.stayStyle || "Смесено",
      transportPreference: input.transportPreference,
    });
    const data = response.data as unknown as Record<string, unknown>;

    const transportOptions = Array.isArray(data.transportOptions)
      ? data.transportOptions
          .map((item) => sanitizeTravelOffer(item))
          .filter((item): item is LiveTravelOffer => !!item)
      : [];
    const stayOptions = Array.isArray(data.stayOptions)
      ? data.stayOptions
          .map((item) => sanitizeStayOffer(item))
          .filter((item): item is LiveStayOffer => !!item)
      : [];

    // If Cloud Functions returned empty results, use Gemini fallback
    if (transportOptions.length === 0 && stayOptions.length === 0) {
      try {
        const fallbackResult = await searchTravelOffersFallback(input, searchWindow);
        return await ensureDeterministicSearchLinks(input, searchWindow, {
          ...fallbackResult,
          stayOptions: sortStayOffers(fallbackResult.stayOptions, input, searchWindow),
          transportOptions: sortTransportOffers(fallbackResult.transportOptions, input),
        });
      } catch {
        // Fall through to return whatever we have (empty)
      }
    }

    return await ensureDeterministicSearchLinks(input, searchWindow, {
      notes: Array.isArray(data.notes)
        ? data.notes.filter((item): item is string => typeof item === "string")
        : [],
      searchContext: {
        departureDate: sanitizeString(
          (data.searchContext as Record<string, unknown> | undefined)?.departureDate,
          searchWindow.departureDate
        ),
        nights:
          sanitizeNumber(
            (data.searchContext as Record<string, unknown> | undefined)?.nights
          ) ?? searchWindow.nights,
        returnDate: sanitizeString(
          (data.searchContext as Record<string, unknown> | undefined)?.returnDate,
          searchWindow.returnDate
        ),
        windowLabel: sanitizeString(
          (data.searchContext as Record<string, unknown> | undefined)?.windowLabel,
          searchWindow.windowLabel
        ),
      },
      stayOptions: sortStayOffers(stayOptions, input, searchWindow),
      transportOptions: sortTransportOffers(transportOptions, input),
    });
  } catch {
    // Cloud Functions failed — fall back to Gemini for offers + price lookup
    try {
      const fallbackResult = await searchTravelOffersFallback(input, searchWindow);

      return await ensureDeterministicSearchLinks(input, searchWindow, {
        ...fallbackResult,
        stayOptions: sortStayOffers(fallbackResult.stayOptions, input, searchWindow),
        transportOptions: sortTransportOffers(fallbackResult.transportOptions, input),
      });
    } catch {
      return await ensureDeterministicSearchLinks(input, searchWindow, {
        notes: ["Provider search links added as fallback."],
        searchContext: searchWindow,
        stayOptions: [],
        transportOptions: [],
      });
    }
  }
}

export async function createTestPaymentIntent(
  input: CreateTestPaymentIntentInput
) {
  if (!shouldUseFunctionsForPayments()) {
    return {
      clientSecret: `pi_local_mock_${Date.now()}_secret`,
      mode: "mock",
      paymentIntentId: `pi_local_mock_${Date.now()}`,
      provider: "stripe",
      status: "test_local_ready",
    } satisfies TestPaymentIntentResponse;
  }

  try {
    const callable = createCallable<
      CreateTestPaymentIntentInput,
      TestPaymentIntentResponse
    >("createTestPaymentIntent");
    const response = await callable(input);
    const data = response.data as unknown as Record<string, unknown>;

    return {
      clientSecret: sanitizeString(data.clientSecret),
      mode: data.mode === "stripe_test" ? "stripe_test" : "mock",
      paymentIntentId: sanitizeString(data.paymentIntentId),
      provider: "stripe",
      status: sanitizeString(data.status, "requires_payment_method"),
    } satisfies TestPaymentIntentResponse;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";

    if (
      message.includes("functions/not-found") ||
      message.includes("functions/unavailable") ||
      message.includes("Failed to fetch") ||
      message.includes("CORS")
    ) {
      return {
        clientSecret: `pi_fallback_mock_${Date.now()}_secret`,
        mode: "mock",
        paymentIntentId: `pi_fallback_mock_${Date.now()}`,
        provider: "stripe",
        status: "test_fallback_ready",
      } satisfies TestPaymentIntentResponse;
    }

    throw error;
  }
}

export async function createTestCheckoutSession(
  input: CreateTestCheckoutSessionInput
) {
  if (!shouldUseFunctionsForPayments()) {
    throw new Error("stripe-test-mode-disabled");
  }

  try {
    const callable = createCallable<
      CreateTestCheckoutSessionInput,
      TestCheckoutSessionResponse
    >("createTestCheckoutSession");
    const response = await callable(input);
    return parseCheckoutSessionResponse(response.data as unknown as Record<string, unknown>);
  } catch (error) {
    if (!shouldRetryWithEmulator(error) || shouldUseLocalFunctionsEmulator()) {
      throw error;
    }

    const fallbackCallable = createEmulatorCallable<
      CreateTestCheckoutSessionInput,
      TestCheckoutSessionResponse
    >("createTestCheckoutSession");
    const fallbackResponse = await fallbackCallable(input);
    return parseCheckoutSessionResponse(
      fallbackResponse.data as unknown as Record<string, unknown>
    );
  }
}

export async function verifyTestCheckoutSession(
  input: VerifyTestCheckoutSessionInput
) {
  if (!shouldUseFunctionsForPayments()) {
    throw new Error("stripe-test-mode-disabled");
  }

  try {
    const callable = createCallable<
      VerifyTestCheckoutSessionInput,
      TestCheckoutVerificationResponse
    >("verifyTestCheckoutSession");
    const response = await callable(input);
    return parseCheckoutVerificationResponse(response.data as unknown as Record<string, unknown>);
  } catch (error) {
    if (!shouldRetryWithEmulator(error) || shouldUseLocalFunctionsEmulator()) {
      throw error;
    }

    const fallbackCallable = createEmulatorCallable<
      VerifyTestCheckoutSessionInput,
      TestCheckoutVerificationResponse
    >("verifyTestCheckoutSession");
    const fallbackResponse = await fallbackCallable(input);
    return parseCheckoutVerificationResponse(
      fallbackResponse.data as unknown as Record<string, unknown>
    );
  }
}
