import {
  extractPersonalProfile,
  type PersonalProfileInfo,
} from "./profile-info";
import { sanitizeString, sanitizeStringArray } from "./sanitize";
import type { AppLanguage } from "./translations";
import { callAI, getAIApiKey, AI_MODEL } from "./ai";

export { AI_MODEL as GEMINI_MODEL } from "./ai";
const GEMINI_MODEL = AI_MODEL;
export const DEFAULT_SETTLEMENT_MAP_ZOOM = 5;

type OnboardingSection = {
  note: string;
  selectedOptions: string[];
};

type RawProfileData = {
  email?: string | null;
  preferences?: {
    onboarding?: {
      assistance?: Partial<OnboardingSection>;
      interests?: Partial<OnboardingSection>;
      skills?: Partial<OnboardingSection>;
    };
  };
  profileInfo?: Partial<PersonalProfileInfo>;
  username?: string | null;
};

export type DiscoverProfile = {
  assistance: OnboardingSection;
  email: string | null;
  interests: OnboardingSection;
  personalProfile: PersonalProfileInfo;
  skills: OnboardingSection;
  username: string | null;
};

export type DiscoverSettlementType = "city" | "village";

export type DiscoverSearchFilters = {
  countries: string[];
  destinationQuery: string;
  maxDistanceKm: number | null;
  minDistanceKm: number | null;
  originLabel: string;
  originLatitude: number | null;
  originLongitude: number | null;
  settlementTypes: DiscoverSettlementType[];
};

export type TripRecommendation = {
  accessibilityNotes: string;
  attractions: string[];
  country: string;
  destination: string;
  highlights: string[];
  id: string;
  imageUrl: string;
  imageUrls: string[];
  latitude: number | null;
  longitude: number | null;
  popularityNote: string;
  title: string;
  whyItFits: string;
  wikipediaTitle: string;
};

export type StoredDiscoverData = {
  filters: DiscoverSearchFilters;
  generatedAtMs: number | null;
  language: string | null;
  lastRefreshDateKey: string | null;
  refreshCountForDate: number;
  profileSignature: string | null;
  sourceModel: string;
  summary: string;
  trips: TripRecommendation[];
};

type RawSettlementRecommendation = Partial<Omit<TripRecommendation, "id" | "imageUrl">>;

type StructuredDiscoverResult = {
  settlements: RawSettlementRecommendation[];
  summary: string;
};

type SettlementCoordinates = {
  latitude: number | null;
  longitude: number | null;
};

function getLanguageVariant(language?: string): AppLanguage {
  const normalized = (language || "").trim().toLowerCase();

  if (normalized === "en" || normalized === "english") return "en";
  if (normalized === "de" || normalized === "german" || normalized === "deutsch") return "de";
  if (normalized === "es" || normalized === "spanish" || normalized === "español") return "es";
  if (normalized === "fr" || normalized === "french" || normalized === "français") return "fr";
  return "bg";
}

function getDiscoverCopy(language?: string) {
  switch (getLanguageVariant(language)) {
    case "en":
      return {
        accessibilityNotes: "Check local accessibility in advance.",
        genericError: "We couldn't generate new suggestions. Please try again.",
        invalidResponse: "AI returned an unexpected format. Please try refresh again.",
        missingApiKey:
          "API key is missing. Add EXPO_PUBLIC_GEMINI_API_KEY and restart the app.",
        popularityNote: "Popular with visitors and packed with things to do.",
        requestFailed:
          "AI could not return destination data. Check your network and limits.",
        summary:
          "We selected popular places with interesting activities and landmarks based on your profile.",
        whyItFits: "Selected based on your interests and profile.",
      } as const;
    case "de":
      return {
        accessibilityNotes: "Prüfe die lokale Barrierefreiheit im Voraus.",
        genericError:
          "Wir konnten keine neuen Vorschläge generieren. Bitte versuche es erneut.",
        invalidResponse:
          "KI hat ein unerwartetes Format zurückgegeben. Bitte versuche die Aktualisierung erneut.",
        missingApiKey:
          "API-Schlüssel fehlt. Füge EXPO_PUBLIC_GEMINI_API_KEY hinzu und starte die App neu.",
        popularityNote: "Beliebt bei Besuchern und mit vielen Aktivitäten.",
        requestFailed:
          "KI konnte keine Zieldaten liefern. Prüfe Netzwerk und Limits.",
        summary:
          "Wir haben beliebte Orte mit interessanten Aktivitäten und Sehenswürdigkeiten passend zu deinem Profil ausgewählt.",
        whyItFits: "Passend zu deinen Interessen und deinem Profil ausgewählt.",
      } as const;
    case "es":
      return {
        accessibilityNotes: "Revisa la accesibilidad local con antelación.",
        genericError:
          "No pudimos generar nuevas sugerencias. Inténtalo de nuevo.",
        invalidResponse:
          "La IA devolvió un formato inesperado. Intenta actualizar otra vez.",
        missingApiKey:
          "Falta la clave API. Añade EXPO_PUBLIC_GEMINI_API_KEY y reinicia la app.",
        popularityNote: "Popular entre visitantes y con muchas cosas para hacer.",
        requestFailed:
          "La IA no pudo devolver datos del destino. Revisa tu red y los límites.",
        summary:
          "Seleccionamos lugares populares con actividades y atracciones interesantes según tu perfil.",
        whyItFits: "Seleccionado según tus intereses y tu perfil.",
      } as const;
    case "fr":
      return {
        accessibilityNotes: "Vérifie l’accessibilité locale à l’avance.",
        genericError:
          "Nous n'avons pas pu générer de nouvelles suggestions. Réessaie.",
        invalidResponse:
          "L'IA a renvoyé un format inattendu. Essaie de rafraîchir à nouveau.",
        missingApiKey:
          "Clé API manquante. Ajoute EXPO_PUBLIC_GEMINI_API_KEY et redémarre l’application.",
        popularityNote: "Très apprécié des visiteurs avec beaucoup de choses à faire.",
        requestFailed:
          "L’IA n’a pas pu renvoyer des données sur les destinations. Vérifie le réseau et les limites.",
        summary:
          "Nous avons sélectionné des lieux populaires avec des activités et des attractions intéressantes selon ton profil.",
        whyItFits: "Sélectionné selon tes intérêts et ton profil.",
      } as const;
    default:
      return {
        accessibilityNotes: "Провери локалната достъпност предварително.",
        genericError: "Не успяхме да генерираме нови предложения. Опитай отново.",
        invalidResponse: "AI върна неочакван формат. Опитай нов refresh.",
        missingApiKey:
          "Липсва API ключ. Добави EXPO_PUBLIC_GEMINI_API_KEY и рестартирай приложението.",
        popularityNote:
          "Има активен интерес от посетители и разнообразни неща за правене.",
        requestFailed:
          "AI не успя да върне данни за дестинации. Провери мрежата и лимитите.",
        summary:
          "Подбрахме популярни селища с интересни активности и забележителности според профила ти.",
        whyItFits: "Подбрано според интересите и профила на потребителя.",
      } as const;
  }
}

function normalizeComparableText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sanitizeImageUrls(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item, index, array) => /^https?:\/\//i.test(item) && array.indexOf(item) === index)
    .slice(0, 6);
}

function sanitizeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return null;
}

function sanitizeSettlementTypes(value: unknown): DiscoverSettlementType[] {
  if (!Array.isArray(value)) {
    return ["city", "village"];
  }

  const types = value
    .filter((item): item is DiscoverSettlementType => item === "city" || item === "village")
    .filter((item, index, array) => array.indexOf(item) === index);

  return types.length === 0 ? ["city", "village"] : types;
}

function sanitizeDiscoverSearchFilters(
  value: unknown,
  fallbackOriginLabel = ""
): DiscoverSearchFilters {
  const rawFilters =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return {
    countries: sanitizeStringArray(rawFilters.countries)
      .map((country) => country.trim())
      .filter((country, index, array) => country && array.indexOf(country) === index),
    destinationQuery: sanitizeString(rawFilters.destinationQuery),
    maxDistanceKm: sanitizeNumber(rawFilters.maxDistanceKm),
    minDistanceKm: sanitizeNumber(rawFilters.minDistanceKm),
    originLabel: sanitizeString(rawFilters.originLabel, fallbackOriginLabel),
    originLatitude: sanitizeNumber(rawFilters.originLatitude),
    originLongitude: sanitizeNumber(rawFilters.originLongitude),
    settlementTypes: sanitizeSettlementTypes(rawFilters.settlementTypes),
  };
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function parseJsonValueFromText(rawText: string) {
  const trimmedText = rawText.trim();

  if (!trimmedText) {
    return null;
  }

  try {
    return JSON.parse(trimmedText) as unknown;
  } catch {
    const fencedMatch = trimmedText.match(/```(?:json)?\s*([\s\S]*?)```/i);

    if (fencedMatch?.[1]) {
      try {
        return JSON.parse(fencedMatch[1].trim()) as unknown;
      } catch {
        // Continue to brace extraction below.
      }
    }

    const firstBraceIndex = trimmedText.indexOf("{");
    const lastBraceIndex = trimmedText.lastIndexOf("}");

    if (firstBraceIndex >= 0 && lastBraceIndex > firstBraceIndex) {
      try {
        return JSON.parse(trimmedText.slice(firstBraceIndex, lastBraceIndex + 1)) as unknown;
      } catch {
        return null;
      }
    }

    return null;
  }
}

function parseStructuredDiscoverResult(rawText: string): Partial<StructuredDiscoverResult> {
  const parsedValue = parseJsonValueFromText(rawText);

  if (Array.isArray(parsedValue)) {
    return {
      settlements: parsedValue as RawSettlementRecommendation[],
      summary: "",
    };
  }

  if (!parsedValue || typeof parsedValue !== "object") {
    return {};
  }

  const rawObject = parsedValue as Record<string, unknown>;
  const settlements =
    rawObject.settlements ||
    rawObject.trips ||
    rawObject.destinations ||
    rawObject.places ||
    rawObject.recommendations;

  return {
    settlements: Array.isArray(settlements)
      ? (settlements as RawSettlementRecommendation[])
      : [],
    summary: sanitizeString(rawObject.summary),
  };
}

function hasCoordinates(latitude: number | null, longitude: number | null) {
  return latitude !== null && longitude !== null;
}

function dedupeCandidates(candidates: string[]) {
  return candidates
    .map((candidate) => candidate.trim())
    .filter((candidate, index, array) => candidate && array.indexOf(candidate) === index);
}

function buildTripIdentityKeys(trip: {
  country?: string;
  destination?: string;
  latitude?: number | null;
  longitude?: number | null;
  title?: string;
  wikipediaTitle?: string;
}) {
  const title = normalizeComparableText(sanitizeString(trip.title));
  const country = normalizeComparableText(sanitizeString(trip.country));
  const destination = normalizeComparableText(sanitizeString(trip.destination));
  const wikipediaTitle = normalizeComparableText(sanitizeString(trip.wikipediaTitle));
  const roundedLatitude =
    typeof trip.latitude === "number" ? Math.round(trip.latitude * 10) / 10 : null;
  const roundedLongitude =
    typeof trip.longitude === "number" ? Math.round(trip.longitude * 10) / 10 : null;

  return [
    destination,
    wikipediaTitle,
    title,
    destination && country ? `${destination}|${country}` : "",
    title && destination ? `${title}|${destination}` : "",
    title && country ? `${title}|${country}` : "",
    wikipediaTitle && country ? `${wikipediaTitle}|${country}` : "",
    title && destination && country ? `${title}|${destination}|${country}` : "",
    roundedLatitude !== null && roundedLongitude !== null
      ? `${roundedLatitude}|${roundedLongitude}`
      : "",
  ]
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index);
}

export function dedupeTripRecommendations(
  trips: TripRecommendation[],
  existingTrips: TripRecommendation[] = []
) {
  const seenKeys = new Set(existingTrips.flatMap((trip) => buildTripIdentityKeys(trip)));

  return trips.filter((trip) => {
    const identityKeys = buildTripIdentityKeys(trip);
    const isDuplicate = identityKeys.some((key) => seenKeys.has(key));

    if (isDuplicate) {
      return false;
    }

    identityKeys.forEach((key) => seenKeys.add(key));
    return true;
  });
}

function getSection(section: Partial<OnboardingSection> | undefined): OnboardingSection {
  return {
    note: sanitizeString(section?.note),
    selectedOptions: sanitizeStringArray(section?.selectedOptions),
  };
}

function normalizeTrip(
  rawTrip: RawSettlementRecommendation,
  index: number,
  imageUrls: string[],
  language?: string
): TripRecommendation {
  const copy = getDiscoverCopy(language);
  const title = sanitizeString(rawTrip.title, `Settlement ${index + 1}`);
  const country = sanitizeString(rawTrip.country);
  const destination = sanitizeString(
    rawTrip.destination,
    country ? `${title}, ${country}` : title
  );

  return {
    accessibilityNotes: sanitizeString(
      rawTrip.accessibilityNotes,
      copy.accessibilityNotes
    ),
    attractions: sanitizeStringArray(rawTrip.attractions),
    country,
    destination,
    highlights: sanitizeStringArray(rawTrip.highlights),
    id: `settlement-${Date.now()}-${index}`,
    imageUrl: imageUrls[0] ?? "",
    imageUrls,
    latitude: sanitizeNumber(rawTrip.latitude),
    longitude: sanitizeNumber(rawTrip.longitude),
    popularityNote: sanitizeString(
      rawTrip.popularityNote,
      copy.popularityNote
    ),
    title,
    whyItFits: sanitizeString(
      rawTrip.whyItFits,
      copy.whyItFits
    ),
    wikipediaTitle: sanitizeString(rawTrip.wikipediaTitle, title),
  };
}

function isUsefulWikipediaImageTitle(title: string) {
  const normalizedTitle = title.toLowerCase();

  return (
    normalizedTitle.startsWith("file:") &&
    !normalizedTitle.endsWith(".svg") &&
    !normalizedTitle.includes("map") &&
    !normalizedTitle.includes("locator") &&
    !normalizedTitle.includes("flag") &&
    !normalizedTitle.includes("coat of arms") &&
    !normalizedTitle.includes("logo") &&
    !normalizedTitle.includes("symbol") &&
    !normalizedTitle.includes("seal")
  );
}

async function fetchWikipediaSummaryImage(candidates: string[]) {
  for (const trimmedCandidate of dedupeCandidates(candidates)) {
    if (!trimmedCandidate) {
      continue;
    }

    try {
      const response = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
          trimmedCandidate
        )}`
      );

      if (!response.ok) {
        continue;
      }

      const payload = (await response.json()) as {
        originalimage?: { source?: string };
        thumbnail?: { source?: string };
      };

      const imageUrl =
        payload.originalimage?.source || payload.thumbnail?.source || "";

      if (imageUrl) {
        return [imageUrl];
      }
    } catch {}
  }

  return [] as string[];
}

async function fetchWikipediaImages(candidates: string[]) {
  // Try the summary API first — returns a single direct image URL (most reliable on mobile)
  const summaryImages = await fetchWikipediaSummaryImage(candidates);

  if (summaryImages.length > 0) {
    return summaryImages;
  }

  // Fallback: query API for multiple images
  for (const trimmedCandidate of dedupeCandidates(candidates)) {
    if (!trimmedCandidate) {
      continue;
    }

    try {
      const response = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(
          trimmedCandidate
        )}&prop=images&imlimit=12&format=json&origin=*`
      );

      if (!response.ok) {
        continue;
      }

      const payload = (await response.json()) as {
        query?: {
          pages?: Record<
            string,
            {
              images?: { title?: string }[];
            }
          >;
        };
      };

      const fileTitles = Object.values(payload.query?.pages ?? {})
        .flatMap((page) => page.images ?? [])
        .map((image) => sanitizeString(image.title))
        .filter((title) => isUsefulWikipediaImageTitle(title))
        .slice(0, 8);

      if (fileTitles.length === 0) {
        continue;
      }

      const imageInfoResponse = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(
          fileTitles.join("|")
        )}&prop=imageinfo&iiprop=url&iiurlwidth=1200&format=json&origin=*`
      );

      if (!imageInfoResponse.ok) {
        continue;
      }

      const imageInfoPayload = (await imageInfoResponse.json()) as {
        query?: {
          pages?: Record<
            string,
            {
              imageinfo?: { thumburl?: string; url?: string }[];
            }
          >;
        };
      };

      const imageUrls = Object.values(imageInfoPayload.query?.pages ?? {})
        .flatMap((page) => page.imageinfo ?? [])
        .map((image) => image.thumburl || image.url || "")
        .filter((url, index, array) => url && array.indexOf(url) === index)
        .slice(0, 4);

      if (imageUrls.length > 0) {
        return imageUrls;
      }
    } catch {}
  }

  return [] as string[];
}

async function fetchSettlementCoordinates(candidates: string[]) {
  for (const trimmedCandidate of dedupeCandidates(candidates)) {
    if (!trimmedCandidate) {
      continue;
    }

    try {
      const response = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
          trimmedCandidate
        )}&count=1&language=en&format=json`
      );

      if (!response.ok) {
        continue;
      }

      const payload = (await response.json()) as {
        results?: {
          latitude?: number;
          longitude?: number;
        }[];
      };

      const firstResult = payload.results?.find((item) =>
        hasCoordinates(
          sanitizeNumber(item.latitude),
          sanitizeNumber(item.longitude)
        )
      );

      if (firstResult) {
        return {
          latitude: sanitizeNumber(firstResult.latitude),
          longitude: sanitizeNumber(firstResult.longitude),
        } satisfies SettlementCoordinates;
      }
    } catch {}
  }

  return {
    latitude: null,
    longitude: null,
  } satisfies SettlementCoordinates;
}

export async function resolveDiscoverOriginCoordinates(originLabel: string) {
  const trimmedOriginLabel = sanitizeString(originLabel);

  if (!trimmedOriginLabel) {
    return {
      latitude: null,
      longitude: null,
    } satisfies SettlementCoordinates;
  }

  const parts = trimmedOriginLabel
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  return fetchSettlementCoordinates(
    dedupeCandidates([trimmedOriginLabel, ...parts])
  );
}

export function getDiscoverSearchFiltersSignature(filters: DiscoverSearchFilters) {
  return JSON.stringify({
    countries: [...filters.countries].sort((left, right) => left.localeCompare(right)),
    destinationQuery: filters.destinationQuery,
    maxDistanceKm: filters.maxDistanceKm,
    minDistanceKm: filters.minDistanceKm,
    originLabel: filters.originLabel,
    settlementTypes: [...filters.settlementTypes].sort(),
  });
}

export function calculateDistanceKm(
  originLatitude: number,
  originLongitude: number,
  targetLatitude: number,
  targetLongitude: number
) {
  const earthRadiusKm = 6371;
  const latitudeDelta = toRadians(targetLatitude - originLatitude);
  const longitudeDelta = toRadians(targetLongitude - originLongitude);
  const startLatitude = toRadians(originLatitude);
  const endLatitude = toRadians(targetLatitude);

  const haversine =
    Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2) +
    Math.cos(startLatitude) *
      Math.cos(endLatitude) *
      Math.sin(longitudeDelta / 2) *
      Math.sin(longitudeDelta / 2);

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function filterDiscoverTripsByFilters(
  trips: TripRecommendation[],
  filters: DiscoverSearchFilters
) {
  const hasCountryFilter = filters.countries.length > 0;
  const countrySet = new Set(
    filters.countries.map((country) => normalizeComparableText(country))
  );
  const hasDistanceFilter =
    (typeof filters.minDistanceKm === "number" && Number.isFinite(filters.minDistanceKm)) ||
    (typeof filters.maxDistanceKm === "number" && Number.isFinite(filters.maxDistanceKm));
  const canMeasureDistance =
    hasDistanceFilter &&
    hasCoordinates(filters.originLatitude, filters.originLongitude);

  return trips.filter((trip) => {
    if (hasCountryFilter) {
      const normalizedCountry = normalizeComparableText(trip.country);
      if (!countrySet.has(normalizedCountry)) {
        return false;
      }
    }

    if (canMeasureDistance) {
      if (!hasCoordinates(trip.latitude, trip.longitude)) {
        return false;
      }

      const distanceKm = calculateDistanceKm(
        filters.originLatitude as number,
        filters.originLongitude as number,
        trip.latitude as number,
        trip.longitude as number
      );

      if (
        typeof filters.minDistanceKm === "number" &&
        Number.isFinite(filters.minDistanceKm) &&
        distanceKm < filters.minDistanceKm
      ) {
        return false;
      }

      if (
        typeof filters.maxDistanceKm === "number" &&
        Number.isFinite(filters.maxDistanceKm) &&
        distanceKm > filters.maxDistanceKm
      ) {
        return false;
      }
    }

    return true;
  });
}

export function buildSettlementMapUrl(
  latitude: number | null,
  longitude: number | null,
  variant: "preview" | "expanded" = "preview",
  zoom = DEFAULT_SETTLEMENT_MAP_ZOOM
) {
  if (latitude === null || longitude === null) {
    return "";
  }

  const size = variant === "expanded" ? "650,450" : "650,360";
  const roundedZoom = Math.min(Math.max(Math.round(zoom), 1), 17);
  const marker = `${longitude},${latitude},pm2rdm`;

  return `https://static-maps.yandex.ru/1.x/?lang=en_US&ll=${longitude},${latitude}&z=${roundedZoom}&size=${size}&l=map&pt=${marker}`;
}

export function buildSettlementMapEmbedUrl(
  latitude: number | null,
  longitude: number | null,
  zoom = DEFAULT_SETTLEMENT_MAP_ZOOM
) {
  if (latitude === null || longitude === null) {
    return "";
  }

  const zoomFactor = Math.pow(2, DEFAULT_SETTLEMENT_MAP_ZOOM - zoom);
  const latitudeDelta = Math.min(Math.max(0.85 * zoomFactor, 0.01), 65);
  const longitudeDelta = Math.min(Math.max(1.25 * zoomFactor, 0.02), 130);
  const bbox = [
    longitude - longitudeDelta,
    latitude - latitudeDelta,
    longitude + longitudeDelta,
    latitude + latitudeDelta,
  ].join(",");

  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(
    bbox
  )}&layer=mapnik&marker=${encodeURIComponent(`${latitude},${longitude}`)}`;
}

export function extractDiscoverProfile(profileData: RawProfileData): DiscoverProfile | null {
  const onboarding = profileData.preferences?.onboarding;

  if (!onboarding) {
    return null;
  }

  return {
    assistance: getSection(onboarding.assistance),
    email: typeof profileData.email === "string" ? profileData.email : null,
    interests: getSection(onboarding.interests),
    personalProfile: extractPersonalProfile(profileData),
    skills: getSection(onboarding.skills),
    username: typeof profileData.username === "string" ? profileData.username : null,
  };
}

export function getDiscoverProfileSignature(
  profile: DiscoverProfile,
  filters?: DiscoverSearchFilters | null
) {
  return JSON.stringify({
    aboutMe: profile.personalProfile.aboutMe,
    filters: filters ? JSON.parse(getDiscoverSearchFiltersSignature(filters)) : null,
    homeBase: profile.personalProfile.homeBase,
  });
}

export function parseStoredDiscoverData(profileData: Record<string, unknown>) {
  const discover = profileData.discover;
  const fallbackOriginLabel =
    extractPersonalProfile(profileData as RawProfileData).homeBase || "";

  if (!discover || typeof discover !== "object") {
    return null;
  }

  const rawDiscover = discover as Record<string, unknown>;
  const rawTrips = Array.isArray(rawDiscover.trips) ? rawDiscover.trips : [];

  const trips = rawTrips
    .filter((trip): trip is Record<string, unknown> => !!trip && typeof trip === "object")
    .map((trip, index) =>
      normalizeTrip(
        {
          accessibilityNotes: sanitizeString(trip.accessibilityNotes),
          attractions: Array.isArray(trip.attractions) ? trip.attractions : [],
          country: sanitizeString(trip.country),
          destination: sanitizeString(trip.destination),
          highlights: Array.isArray(trip.highlights) ? trip.highlights : [],
          latitude: sanitizeNumber(trip.latitude),
          longitude: sanitizeNumber(trip.longitude),
          popularityNote: sanitizeString(trip.popularityNote),
          title: sanitizeString(trip.title),
          whyItFits: sanitizeString(trip.whyItFits),
          wikipediaTitle: sanitizeString(trip.wikipediaTitle),
        },
        index,
        sanitizeImageUrls(trip.imageUrls).length > 0
          ? sanitizeImageUrls(trip.imageUrls)
          : sanitizeString(trip.imageUrl)
            ? [sanitizeString(trip.imageUrl)]
            : [],
        typeof rawDiscover.language === "string" ? rawDiscover.language : undefined
      )
    );

  return {
    filters: sanitizeDiscoverSearchFilters(rawDiscover.filters, fallbackOriginLabel),
    generatedAtMs:
      typeof rawDiscover.generatedAtMs === "number" ? rawDiscover.generatedAtMs : null,
    language:
      typeof rawDiscover.language === "string" ? rawDiscover.language : null,
    lastRefreshDateKey:
      typeof rawDiscover.lastRefreshDateKey === "string"
        ? rawDiscover.lastRefreshDateKey
        : null,
    refreshCountForDate:
      typeof rawDiscover.refreshCountForDate === "number" &&
      Number.isFinite(rawDiscover.refreshCountForDate)
        ? Math.max(0, Math.floor(rawDiscover.refreshCountForDate))
        : 0,
    profileSignature:
      typeof rawDiscover.profileSignature === "string"
        ? rawDiscover.profileSignature
        : null,
    sourceModel:
      typeof rawDiscover.sourceModel === "string"
        ? rawDiscover.sourceModel
        : GEMINI_MODEL,
    summary: sanitizeString(rawDiscover.summary),
    trips: dedupeTripRecommendations(trips).slice(0, 6),
  } satisfies StoredDiscoverData;
}

export function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildGroundedSettlementResearchPrompt(
  profile: DiscoverProfile,
  previousTrips: TripRecommendation[],
  filters: DiscoverSearchFilters,
  language = "Bulgarian"
) {
  const previousSettlementHints =
    previousTrips.length > 0
      ? `Avoid repeating these settlements: ${previousTrips
          .map((trip) => trip.destination)
          .join("; ")}.`
      : "This is the first settlement set for this user.";
  const countryFilterHint =
    filters.countries.length > 0
      ? `Return settlements only from these countries: ${filters.countries.join(", ")}.`
      : "You may use any country when it matches the rest of the constraints.";
  const settlementTypeFilterHint =
    filters.settlementTypes.length === 1
      ? filters.settlementTypes[0] === "city"
        ? "Return ONLY cities and small towns. Do not include villages, hamlets, or rural settlements."
        : "Return ONLY villages, hamlets, and small rural settlements. Do not include cities or larger towns."
      : "Mix cities, small towns, and villages.";
  const destinationQueryHint = filters.destinationQuery
    ? `Match this destination style or theme as a hard preference: ${filters.destinationQuery}.`
    : "No custom destination style or theme was provided.";
  const distanceFilterHint =
    filters.originLabel &&
    (filters.minDistanceKm !== null || filters.maxDistanceKm !== null)
      ? `Use ${filters.originLabel} as the starting point. Return only settlements whose straight-line distance is ${
          filters.minDistanceKm !== null ? `at least ${filters.minDistanceKm} km` : ""
        }${
          filters.minDistanceKm !== null && filters.maxDistanceKm !== null ? " and " : ""
        }${
          filters.maxDistanceKm !== null ? `at most ${filters.maxDistanceKm} km` : ""
        } from that starting point. Exclude any settlement that does not match the distance range.`
      : filters.originLabel
        ? `Use ${filters.originLabel} as the starting point context for distance and route practicality.`
        : "No explicit starting point was provided beyond the user's profile.";

  return [
    "You are researching travel-friendly settlements for a mobile app discover screen.",
    `Answer in ${language}.`,
    "Use Google Search grounding to find real villages, small towns, and settlements around the world.",
    "Return research notes only. No intro. No filler.",
    "Focus on settlements that are often visited, have tourism activity, and offer several things to do plus notable attractions.",
    "Prefer places with a strong mix of scenery, culture, food, craft, history, or outdoor activities depending on the user's bio.",
    "Use the user's city/country only as soft context for travel taste unless explicit search filters override it.",
    countryFilterHint,
    distanceFilterHint,
    settlementTypeFilterHint,
    destinationQueryHint,
    "If explicit search filters are present, treat them as hard constraints.",
    "When no country filter is present, return a geographically varied set from multiple countries when possible.",
    "Use only the user's About You profile fields for personalization, not as a location filter.",
    previousSettlementHints,
    "Structure the notes with these headings exactly:",
    "SETTLEMENTS",
    "SUMMARY",
    "",
    `Username: ${profile.username ?? "Unknown"}`,
    `Email: ${profile.email ?? "Unknown"}`,
    `City and country: ${profile.personalProfile.homeBase || "Not provided"}`,
    `Bio: ${profile.personalProfile.aboutMe || "Not provided"}`,
    `Search origin: ${filters.originLabel || "Not provided"}`,
    `Search distance min km: ${filters.minDistanceKm ?? "Not provided"}`,
    `Search distance max km: ${filters.maxDistanceKm ?? "Not provided"}`,
    `Search countries: ${
      filters.countries.length > 0 ? filters.countries.join(", ") : "Not provided"
    }`,
    `Search destination style: ${filters.destinationQuery || "Not provided"}`,
  ].join("\n");
}

function buildStructuredDiscoverPrompt(params: {
  filters: DiscoverSearchFilters;
  groundedNotes: string;
  language?: string;
  profile: DiscoverProfile;
}) {
  return [
    `Convert the grounded research notes below into a compact structured discover feed in ${
      params.language || "Bulgarian"
    }.`,
    "Use only the grounded notes for factual claims.",
    "Return exactly 8 settlements.",
    "Each settlement must be a real village, small town, or settlement with tourism activity.",
    params.filters.settlementTypes.length === 1
      ? params.filters.settlementTypes[0] === "city"
        ? "Only include cities and small towns. Exclude villages, hamlets, and rural settlements."
        : "Only include villages, hamlets, and small rural settlements. Exclude cities and larger towns."
      : "Mix cities, small towns, and villages so the feed feels varied.",
    "Every settlement must be unique.",
    "Do not repeat the same place under alternate names, nearby district labels, or slightly different spellings.",
    "Prefer places that are often visited and have several things to do plus notable attractions.",
    params.filters.countries.length > 0
      ? `Only include settlements from these countries: ${params.filters.countries.join(", ")}.`
      : "Keep the final feed geographically varied and include settlements from multiple countries when the grounded notes allow it.",
    params.filters.destinationQuery
      ? `Strongly match this destination style or travel theme: ${params.filters.destinationQuery}.`
      : "No extra destination style filter was provided.",
    params.filters.originLabel &&
    (params.filters.minDistanceKm !== null || params.filters.maxDistanceKm !== null)
      ? `Only include settlements whose straight-line distance from ${params.filters.originLabel} is ${
          params.filters.minDistanceKm !== null
            ? `at least ${params.filters.minDistanceKm} km`
            : ""
        }${
          params.filters.minDistanceKm !== null &&
          params.filters.maxDistanceKm !== null
            ? " and "
            : ""
        }${
          params.filters.maxDistanceKm !== null
            ? `at most ${params.filters.maxDistanceKm} km`
            : ""
        }.`
      : "Distance filtering is optional unless the grounded notes mention one.",
    "Use concise mobile-friendly copy.",
    "For latitude and longitude, include best-effort coordinates for the settlement center.",
    "For wikipediaTitle, use the most likely English Wikipedia article title for image lookup.",
    "",
    "About You profile:",
    `City and country: ${params.profile.personalProfile.homeBase || "Not provided"}`,
    `Bio: ${params.profile.personalProfile.aboutMe || "Not provided"}`,
    `Search origin: ${params.filters.originLabel || "Not provided"}`,
    `Search distance min km: ${params.filters.minDistanceKm ?? "Not provided"}`,
    `Search distance max km: ${params.filters.maxDistanceKm ?? "Not provided"}`,
    `Search countries: ${
      params.filters.countries.length > 0
        ? params.filters.countries.join(", ")
        : "Not provided"
    }`,
    `Search destination style: ${params.filters.destinationQuery || "Not provided"}`,
    "",
    "Grounded notes:",
    params.groundedNotes,
  ].join("\n");
}

const DISCOVER_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "string",
    },
    settlements: {
      type: "array",
      items: {
        type: "object",
        properties: {
          accessibilityNotes: { type: "string" },
          attractions: {
            type: "array",
            items: { type: "string" },
          },
          country: { type: "string" },
          destination: { type: "string" },
          highlights: {
            type: "array",
            items: { type: "string" },
          },
          latitude: { type: "number" },
          longitude: { type: "number" },
          popularityNote: { type: "string" },
          title: { type: "string" },
          whyItFits: { type: "string" },
          wikipediaTitle: { type: "string" },
        },
        required: [
          "accessibilityNotes",
          "attractions",
          "country",
          "destination",
          "highlights",
          "latitude",
          "longitude",
          "popularityNote",
          "title",
          "whyItFits",
          "wikipediaTitle",
        ],
      },
      minItems: 8,
      maxItems: 8,
    },
  },
  required: ["summary", "settlements"],
} as const;

export async function generateTripsWithGemini(
  profile: DiscoverProfile,
  previousTrips: TripRecommendation[],
  filters: DiscoverSearchFilters,
  language = "Bulgarian"
) {
  const apiKey = getAIApiKey();

  if (!apiKey) {
    throw new Error("missing-api-key");
  }

  const groundedNotes = await callAI({
    apiKey,
    prompt: buildGroundedSettlementResearchPrompt(profile, previousTrips, filters, language),
  });

  const structuredJsonText = await callAI({
    apiKey,
    prompt: buildStructuredDiscoverPrompt({
      filters,
      groundedNotes,
      language,
      profile,
    }),
    jsonMode: true,
    responseSchema: DISCOVER_RESPONSE_SCHEMA,
  });

  const parsedResponse = parseStructuredDiscoverResult(structuredJsonText);

  if (
    !Array.isArray(parsedResponse.settlements) ||
    parsedResponse.settlements.length === 0
  ) {
    throw new Error("invalid-ai-response");
  }

  const trips = await Promise.all(
    parsedResponse.settlements.slice(0, 8).map(async (trip, index) => {
      const [imageUrls, coordinates] = await Promise.all([
        fetchWikipediaImages([
          sanitizeString(trip.wikipediaTitle),
          sanitizeString(trip.destination),
          sanitizeString(trip.title),
        ]),
        hasCoordinates(sanitizeNumber(trip.latitude), sanitizeNumber(trip.longitude))
          ? Promise.resolve({
              latitude: sanitizeNumber(trip.latitude),
              longitude: sanitizeNumber(trip.longitude),
            } satisfies SettlementCoordinates)
          : fetchSettlementCoordinates([
              sanitizeString(trip.destination),
              sanitizeString(trip.wikipediaTitle),
              sanitizeString(trip.title),
            ]),
      ]);

      return normalizeTrip(
        {
          ...trip,
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
        },
        index,
        imageUrls,
        language
      );
    })
  );

  const uniqueTrips = dedupeTripRecommendations(trips, previousTrips).slice(0, 6);

  return {
    summary: sanitizeString(
      parsedResponse.summary,
      getDiscoverCopy(language).summary
    ),
    trips: uniqueTrips,
  };
}

export async function enrichDiscoverTrips(trips: TripRecommendation[]) {
  const enrichedTrips = await Promise.all(
    trips.map(async (trip) => {
      let nextTrip = trip;
      let changed = false;

      if ((trip.imageUrls?.length ?? 0) === 0 && !trip.imageUrl) {
        const imageUrls = await fetchWikipediaImages([
          trip.wikipediaTitle,
          trip.destination,
          trip.title,
        ]);

        if (imageUrls.length > 0) {
          nextTrip = {
            ...nextTrip,
            imageUrl: imageUrls[0] ?? "",
            imageUrls,
          };
          changed = true;
        }
      }

      if (!hasCoordinates(trip.latitude, trip.longitude)) {
        const coordinates = await fetchSettlementCoordinates([
          trip.destination,
          trip.wikipediaTitle,
          trip.title,
        ]);

        if (hasCoordinates(coordinates.latitude, coordinates.longitude)) {
          nextTrip = {
            ...nextTrip,
            latitude: coordinates.latitude,
            longitude: coordinates.longitude,
          };
          changed = true;
        }
      }

      return {
        changed,
        trip: nextTrip,
      };
    })
  );

  return {
    changed: enrichedTrips.some((entry) => entry.changed),
    trips: enrichedTrips.map((entry) => entry.trip),
  };
}

export function isTripGenerationError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message === "missing-api-key" ||
    error.message.startsWith("ai-request-failed:") ||
    error.message === "empty-ai-response" ||
    error.message === "invalid-ai-response" ||
    error instanceof SyntaxError
  );
}

export function getTripGenerationErrorMessage(
  error: unknown,
  language: AppLanguage = "bg"
) {
  const copy = getDiscoverCopy(language);

  if (!(error instanceof Error)) {
    return copy.genericError;
  }

  if (error.message === "missing-api-key") {
    return copy.missingApiKey;
  }

  if (error.message.startsWith("ai-request-failed:429")) {
    return language === "en"
      ? "AI hit the request limit. Please try again later."
      : language === "de"
        ? "KI hat das Anfrage-Limit erreicht. Bitte versuche es später erneut."
        : language === "es"
          ? "La IA alcanzó el límite de solicitudes. Inténtalo más tarde."
          : language === "fr"
            ? "L'IA a atteint la limite de requêtes. Réessaie plus tard."
            : "AI достигна лимит за заявки. Опитай отново по-късно.";
  }

  if (error.message.startsWith("ai-request-failed:503")) {
    return language === "en"
      ? "Gemini is under heavy load right now. Please try again in a moment."
      : language === "de"
        ? "Gemini ist gerade stark ausgelastet. Bitte versuche es gleich noch einmal."
        : language === "es"
          ? "Gemini tiene mucha carga en este momento. Inténtalo de nuevo en un momento."
          : language === "fr"
            ? "Gemini est très chargé en ce moment. Réessaie dans un instant."
            : "Gemini е претоварен в момента. Опитай пак след малко.";
  }

  if (error.message.startsWith("ai-request-failed:")) {
    return copy.requestFailed;
  }

  if (
    error.message === "empty-ai-response" ||
    error.message === "invalid-ai-response"
  ) {
    return copy.invalidResponse;
  }

  if (error instanceof SyntaxError) {
    return copy.invalidResponse;
  }

  return copy.genericError;
}
