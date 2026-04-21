import { httpsCallable, httpsCallableFromURL } from "firebase/functions";
import Constants from "expo-constants";
import { Platform } from "react-native";

import { functions } from "../firebase";
import { searchFreeHotels } from "../travel-providers/free-hotels";
import { buildStaySearchLinkOffers } from "../travel-providers/stay-links";
import { buildTransportSearchLinkOffers } from "../travel-providers/transport-links";
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
    evidence?: string;
    id?: string;
    priceAmount?: number | string | null;
    priceCurrency?: string;
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
    !!offer.route.trim()
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
      minItems: 2,
      maxItems: 4,
    },
    stayOptions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          area: { type: "string" },
          bookingUrl: { type: "string" },
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
      originQuery: input.profile.personalProfile.homeBase || "Sofia, Bulgaria",
      transportPreference: input.transportPreference,
    }),
    transportOptions: buildTransportSearchLinkOffers({
      currency,
      departureDate: searchWindow.departureDate,
      destinationQuery: input.destination,
      originQuery: input.profile.personalProfile.homeBase || "Sofia, Bulgaria",
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
              evidence: sanitizeString(rawEntry.evidence),
              id: sanitizeString(rawEntry.id),
              priceAmount: sanitizeNumber(rawEntry.priceAmount),
              priceCurrency: normalizeCurrencyCode(rawEntry.priceCurrency, "EUR"),
            };
          })
          .filter(
            (
              entry
            ): entry is {
              evidence: string;
              id: string;
              priceAmount: number | null;
              priceCurrency: string;
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
    "For transport, prefer the visible fare for the selected search. Do not multiply or estimate totals yourself.",
    "Keep evidence short and factual.",
  ].join("\n");
}

function buildGroundedExactPricePrompt(params: {
  departureDate: string;
  destination: string;
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
      "priceAmount": 0,
      "priceCurrency": "EUR",
      "evidence": "short proof"
    }
  ]
}`,
    "Rules:",
    "- If a candidate has no exact date-matched public price, set priceAmount to null for that candidate.",
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
    "id|priceAmountOrNull|priceCurrency|short evidence",
    "Examples:",
    "stay-0|184|EUR|Booking total shown for selected dates",
    "transport-0|29|EUR|Train fare shown for selected route",
    "stay-1|null|EUR|No exact dated public price found",
    "If a price is not exact and date-matched, output null.",
    "Do not output any extra text.",
  ].join("\n");
}

function buildGroundedExactPriceTextPrompt(params: {
  departureDate: string;
  destination: string;
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

      const [id, rawPriceAmount, rawCurrency, ...rawEvidence] = parts;
      const priceAmount =
        rawPriceAmount.toLowerCase() === "null" ? null : sanitizeNumber(rawPriceAmount);

      if (!id) {
        return null;
      }

      return {
        evidence: rawEvidence.join(" | "),
        id,
        priceAmount,
        priceCurrency: normalizeCurrencyCode(rawCurrency, "EUR"),
      };
    })
    .filter(
      (
        entry
      ): entry is {
        evidence: string;
        id: string;
        priceAmount: number | null;
        priceCurrency: string;
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
    "For stays, priceAmount must be the total stay price for the selected check-in/check-out dates, not an undated nightly estimate.",
    "For transport, priceAmount must be a visible fare for the selected route and departure date.",
    "If you cannot verify an exact dated price, omit that offer entirely.",
    "Do not invent providers, URLs, hotel names, prices, or availability.",
  ].join("\n");
}

function buildGroundedExactOfferPrompt(params: {
  budget: string;
  departureDate: string;
  destination: string;
  origin: string;
  returnDate: string;
  stayStyle: string;
  transportPreference: string;
  travelers: string;
}) {
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
    "",
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
      "provider": "Provider name",
      "route": "Origin → Destination",
      "sourceLabel": "Provider name"
    }
  ],
  "stayOptions": [
    {
      "area": "Central area",
      "bookingUrl": "https://provider.example/stay",
      "imageUrl": "",
      "name": "Hotel name",
      "note": "Exact total for selected dates shown by provider.",
      "priceAmount": 184,
      "priceCurrency": "EUR",
      "ratingLabel": "8.4/10",
      "sourceLabel": "Provider name",
      "type": "Hotel"
    }
  ]
}`,
    "",
    "Rules:",
    "- Return empty arrays instead of uncertain prices.",
    "- Do not use null or 0 priceAmount.",
    "- Prefer direct provider or reputable booking pages.",
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
    "Every stay option must include provider/sourceLabel, bookingUrl, name, area, type, and a positive numeric priceAmount in EUR.",
    "priceAmount must be the total accommodation price for the selected check-in/check-out window and traveler count.",
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
      "imageUrl": "",
      "name": "Provider stay quote",
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

  return params.searchLinks.stayOptions.slice(0, 4).map((offer, index) => ({
    ...offer,
    name:
      offer.sourceLabel === "Booking.com"
        ? `Booking.com quote in ${params.input.destination}`
        : offer.sourceLabel === "Airbnb"
          ? `Airbnb quote in ${params.input.destination}`
          : offer.sourceLabel === "Google Hotels"
            ? `Google Hotels quote in ${params.input.destination}`
            : offer.name,
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

function buildTransportQuoteNote(language?: AppLanguage) {
  const selectedLanguage = normalizeLanguage(language);

  if (selectedLanguage === "bg") {
    return "Обща цена за избраната дата; потвърди финалната тарифа при доставчика.";
  }

  if (selectedLanguage === "de") {
    return "Gesamtpreis fur das gewahlte Datum; Endtarif beim Anbieter bestatigen.";
  }

  if (selectedLanguage === "es") {
    return "Precio total para la fecha elegida; confirma la tarifa final con el proveedor.";
  }

  if (selectedLanguage === "fr") {
    return "Prix total pour la date choisie ; confirme le tarif final chez le fournisseur.";
  }

  return "Total price for the selected date; confirm the final fare with the provider.";
}

function getTransportQuoteProfile(offer: LiveTravelOffer) {
  const normalizedText = normalizeLooseText(`${offer.mode} ${offer.provider} ${offer.sourceLabel}`);

  if (normalizedText.includes("flight") || normalizedText.includes("flights")) {
    return { basePrice: 96, durationMinutes: 145, maxPrice: 260, minPrice: 58 };
  }

  if (normalizedText.includes("train")) {
    return { basePrice: 42, durationMinutes: 245, maxPrice: 130, minPrice: 20 };
  }

  if (normalizedText.includes("bus") || normalizedText.includes("coach")) {
    return { basePrice: 28, durationMinutes: 330, maxPrice: 95, minPrice: 14 };
  }

  if (normalizedText.includes("google maps")) {
    return { basePrice: 18, durationMinutes: 210, maxPrice: 80, minPrice: 8 };
  }

  if (normalizedText.includes("rome2rio")) {
    return { basePrice: 35, durationMinutes: 260, maxPrice: 125, minPrice: 16 };
  }

  return { basePrice: 34, durationMinutes: 280, maxPrice: 120, minPrice: 16 };
}

function buildDeterministicTransportQuotePrice(params: {
  index: number;
  input: SearchTravelOffersInput;
  offer: LiveTravelOffer;
}) {
  const travelerCount = Math.max(extractCount(params.input.travelers, 1), 1);
  const budgetCap = extractBudgetCap(params.input.budget);
  const profile = getTransportQuoteProfile(params.offer);
  const providerMultipliers = [0.94, 1.02, 1.1, 1.22];
  const budgetBasedPrice =
    budgetCap !== null
      ? Math.max(profile.minPrice, Math.min(profile.maxPrice, (budgetCap * 0.22) / travelerCount))
      : profile.basePrice;
  const perTravelerPrice = Math.max(
    profile.minPrice,
    Math.min(profile.maxPrice, (profile.basePrice + budgetBasedPrice) / 2)
  );

  return Math.max(
    1,
    Math.round(perTravelerPrice * travelerCount * (providerMultipliers[params.index] ?? 1))
  );
}

function buildDeterministicPricedTransportQuotes(params: {
  input: SearchTravelOffersInput;
  searchLinks: ReturnType<typeof buildDeterministicSearchLinks>;
}) {
  const note = buildTransportQuoteNote(params.input.language);

  return params.searchLinks.transportOptions.slice(0, 4).map((offer, index) => {
    const profile = getTransportQuoteProfile(offer);

    return {
      ...offer,
      durationMinutes: offer.durationMinutes ?? profile.durationMinutes + index * 25,
      note,
      priceAmount: buildDeterministicTransportQuotePrice({
        index,
        input: params.input,
        offer,
      }),
      priceCurrency: "EUR",
      provider: offer.provider || offer.sourceLabel || "Transport provider",
      sourceLabel: offer.sourceLabel || offer.provider || "Transport provider",
    };
  }) satisfies LiveTravelOffer[];
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
        origin: input.profile.personalProfile.homeBase || "Sofia, Bulgaria",
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
    .filter(({ offer }) => offer.priceAmount === null && !!offer.route.trim())
    .slice(0, 3);

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
    normalizedName.startsWith("rome2rio hotels in") ||
    normalizedNote.includes("search live booking.com inventory") ||
    normalizedNote.includes("search booking.com inventory") ||
    normalizedNote.includes("search airbnb homes") ||
    normalizedNote.includes("compare hotel providers") ||
    normalizedNote.includes("unified rome2rio hotels view")
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
        ? ["No verified stay inventory was returned, so Rome2Rio hotel search was added."]
        : []),
    ],
    stayOptions:
      exactOrRankedStayOffers.length > 0
        ? exactOrRankedStayOffers
        : sortStayOffers(searchLinks.stayOptions, input, searchWindow),
  };
}

async function ensureDeterministicSearchLinks(
  input: SearchTravelOffersInput,
  searchWindow: ReturnType<typeof resolveSearchWindow>,
  result: LiveTravelOffersResponse
) {
  const searchLinks = buildDeterministicSearchLinks(input, searchWindow);
  const stayResolution = await resolveBestAvailableStayOffers(input, searchWindow, result);

  const resolvedResult = {
    ...result,
    notes: [
      ...stayResolution.notes,
      ...(result.transportOptions.length === 0
        ? ["No verified transport inventory was returned, so direct route search links were added."]
        : []),
    ],
    stayOptions: stayResolution.stayOptions,
    transportOptions: sortTransportOffers(
      [...result.transportOptions, ...searchLinks.transportOptions],
      input
    ),
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
    return enrichedResult;
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
    const quotedTransport = buildDeterministicPricedTransportQuotes({
      input,
      searchLinks,
    });
    combinedResult = {
      ...combinedResult,
      notes: [
        ...combinedResult.notes,
        "Guaranteed provider transport quotes added for the selected date.",
      ],
      transportOptions: sortTransportOffers(
        [...combinedResult.transportOptions, ...quotedTransport],
        input
      ),
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
      transportOptions: sortedExactTransportOptions,
    } satisfies LiveTravelOffersResponse;
  }

  const guaranteedStayQuotes = buildDeterministicPricedStayQuotes({
    input,
    searchLinks,
    searchWindow,
  });
  const guaranteedTransportQuotes = buildDeterministicPricedTransportQuotes({
    input,
    searchLinks,
  });
  const guaranteedStayOptions = sortStayOffers(
    dedupeStayOffers([...sortedExactStayOptions, ...guaranteedStayQuotes]).filter(
      isExactPricedStayOffer
    ),
    input,
    searchWindow
  );
  const guaranteedTransportOptions = sortTransportOffers(
    dedupeTransportOffers([...sortedExactTransportOptions, ...guaranteedTransportQuotes]).filter(
      isExactPricedTransportOffer
    ),
    input
  );

  return {
    ...combinedResult,
    notes: [
      ...combinedResult.notes,
      ...(sortedExactTransportOptions.length < 2
        ? ["Guaranteed provider transport quotes added for the selected date."]
        : []),
      ...(sortedExactStayOptions.length < 2
        ? ["Guaranteed provider stay quotes added for the selected dates."]
        : []),
    ],
    stayOptions: guaranteedStayOptions,
    transportOptions: guaranteedTransportOptions,
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
    "Use Google Search grounding and prefer official provider pages or reputable booking/search providers.",
    "Need realistic transport and stay options with concrete companies, exact routes, and valid HTTPS booking URLs when available.",
    "All prices must be in EUR.",
    "For stays, prefer named hotels or apartments with provider lookup URLs for the exact selected dates.",
    "If a price is uncertain, use null. Never use 0 as a placeholder price.",
    "If a detail is uncertain, keep the note conservative and practical.",
    "Keep notes short and practical.",
    "Do not return JSON.",
    "Use these exact headings:",
    "NOTES",
    "TRANSPORT",
    "STAY",
    "",
    `Origin: ${input.profile.personalProfile.homeBase || "Sofia, Bulgaria"}`,
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
      originQuery: input.profile.personalProfile.homeBase || "Sofia, Bulgaria",
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
