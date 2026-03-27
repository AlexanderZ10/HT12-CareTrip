import {
  extractPersonalProfile,
  type PersonalProfileInfo,
} from "./profile-info";

export const GEMINI_MODEL = "gemini-2.5-flash";
export const DEFAULT_SETTLEMENT_MAP_ZOOM = 7;

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
  generatedAtMs: number | null;
  lastRefreshDateKey: string | null;
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

function sanitizeString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizeComparableText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sanitizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);
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

function getResponseText(responsePayload: any) {
  const parts = responsePayload?.candidates?.[0]?.content?.parts;

  if (!Array.isArray(parts)) {
    return "";
  }

  return parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

async function callGeminiGenerateContent(params: {
  apiKey: string;
  generationConfig?: Record<string, unknown>;
  prompt: string;
  tools?: Record<string, unknown>[];
}) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": params.apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: params.prompt,
              },
            ],
          },
        ],
        ...(params.generationConfig
          ? { generationConfig: params.generationConfig }
          : {}),
        ...(params.tools ? { tools: params.tools } : {}),
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`gemini-request-failed:${response.status}:${errorText}`);
  }

  const responsePayload = await response.json();
  const text = getResponseText(responsePayload);

  if (!text) {
    throw new Error("empty-gemini-response");
  }

  return text;
}

function normalizeTrip(
  rawTrip: RawSettlementRecommendation,
  index: number,
  imageUrls: string[]
): TripRecommendation {
  const title = sanitizeString(rawTrip.title, `Settlement ${index + 1}`);
  const country = sanitizeString(rawTrip.country);
  const destination = sanitizeString(
    rawTrip.destination,
    country ? `${title}, ${country}` : title
  );

  return {
    accessibilityNotes: sanitizeString(
      rawTrip.accessibilityNotes,
      "Провери локалната достъпност предварително."
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
      "Има активен интерес от посетители и разнообразни неща за правене."
    ),
    title,
    whyItFits: sanitizeString(
      rawTrip.whyItFits,
      "Подбрано според интересите и профила на потребителя."
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

  return fetchWikipediaSummaryImage(candidates);
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

export function parseStoredDiscoverData(profileData: Record<string, unknown>) {
  const discover = profileData.discover;

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
            : []
      )
    );

  return {
    generatedAtMs:
      typeof rawDiscover.generatedAtMs === "number" ? rawDiscover.generatedAtMs : null,
    lastRefreshDateKey:
      typeof rawDiscover.lastRefreshDateKey === "string"
        ? rawDiscover.lastRefreshDateKey
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
  previousTrips: TripRecommendation[]
) {
  const previousSettlementHints =
    previousTrips.length > 0
      ? `Avoid repeating these settlements: ${previousTrips
          .map((trip) => trip.destination)
          .join("; ")}.`
      : "This is the first settlement set for this user.";

  return [
    "You are researching travel-friendly settlements for a mobile app discover screen.",
    "Answer in Bulgarian.",
    "Use Google Search grounding to find real villages, small towns, and settlements around the world.",
    "Return research notes only. No intro. No filler.",
    "Focus on settlements that are often visited, have tourism activity, and offer several things to do plus notable attractions.",
    "Prefer places with a strong mix of scenery, culture, food, craft, history, or outdoor activities depending on the user profile.",
    "Use the user's accessibility needs and interests carefully.",
    previousSettlementHints,
    "Structure the notes with these headings exactly:",
    "SETTLEMENTS",
    "SUMMARY",
    "",
    `Username: ${profile.username ?? "Unknown"}`,
    `Email: ${profile.email ?? "Unknown"}`,
    `Full name: ${profile.personalProfile.fullName || "Not provided"}`,
    `Home base: ${profile.personalProfile.homeBase || "Not provided"}`,
    `About me: ${profile.personalProfile.aboutMe || "Not provided"}`,
    `Dream destinations: ${profile.personalProfile.dreamDestinations || "Not provided"}`,
    `Travel pace: ${profile.personalProfile.travelPace || "Not provided"}`,
    `Stay style: ${profile.personalProfile.stayStyle || "Not provided"}`,
    `Interests: ${profile.interests.selectedOptions.join(", ") || "None provided"}`,
    `Interests note: ${profile.interests.note || "None"}`,
    `Accessibility / assistance needs: ${
      profile.assistance.selectedOptions.join(", ") || "None provided"
    }`,
    `Assistance note: ${profile.assistance.note || "None"}`,
    `Skills / ways to help: ${profile.skills.selectedOptions.join(", ") || "None provided"}`,
    `Skills note: ${profile.skills.note || "None"}`,
  ].join("\n");
}

function buildStructuredDiscoverPrompt(params: {
  groundedNotes: string;
  profile: DiscoverProfile;
}) {
  return [
    "Convert the grounded research notes below into a compact structured discover feed in Bulgarian.",
    "Use only the grounded notes for factual claims.",
    "Return exactly 8 settlements.",
    "Each settlement must be a real village, small town, or settlement with tourism activity.",
    "Every settlement must be unique.",
    "Do not repeat the same place under alternate names, nearby district labels, or slightly different spellings.",
    "Prefer places that are often visited and have several things to do plus notable attractions.",
    "Use concise mobile-friendly copy.",
    "For latitude and longitude, include best-effort coordinates for the settlement center.",
    "For wikipediaTitle, use the most likely English Wikipedia article title for image lookup.",
    "",
    `Profile interests: ${params.profile.interests.selectedOptions.join(", ") || "None"}`,
    `Accessibility needs: ${
      params.profile.assistance.selectedOptions.join(", ") || "None"
    }`,
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
  previousTrips: TripRecommendation[]
) {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("missing-api-key");
  }

  const groundedNotes = await callGeminiGenerateContent({
    apiKey,
    prompt: buildGroundedSettlementResearchPrompt(profile, previousTrips),
    tools: [
      {
        google_search: {},
      },
    ],
  });

  const structuredJsonText = await callGeminiGenerateContent({
    apiKey,
    prompt: buildStructuredDiscoverPrompt({
      groundedNotes,
      profile,
    }),
    generationConfig: {
      responseMimeType: "application/json",
      responseJsonSchema: DISCOVER_RESPONSE_SCHEMA,
    },
  });

  const parsedResponse = JSON.parse(structuredJsonText) as Partial<StructuredDiscoverResult>;

  if (
    !Array.isArray(parsedResponse.settlements) ||
    parsedResponse.settlements.length === 0
  ) {
    throw new Error("invalid-gemini-response");
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
        imageUrls
      );
    })
  );

  const uniqueTrips = dedupeTripRecommendations(trips, previousTrips).slice(0, 6);

  return {
    summary: sanitizeString(
      parsedResponse.summary,
      "Подбрахме популярни селища с интересни активности и забележителности според профила ти."
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

export function getTripGenerationErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return "Не успяхме да генерираме нови предложения. Опитай отново.";
  }

  if (error.message === "missing-api-key") {
    return "Липсва EXPO_PUBLIC_GEMINI_API_KEY. Добави Gemini API ключ и рестартирай приложението.";
  }

  if (error.message.startsWith("gemini-request-failed:429")) {
    return "Gemini достигна лимит за заявки. Опитай отново по-късно.";
  }

  if (error.message.startsWith("gemini-request-failed:")) {
    return "Gemini не успя да върне grounded settlements. Провери мрежата и лимитите.";
  }

  if (
    error.message === "empty-gemini-response" ||
    error.message === "invalid-gemini-response"
  ) {
    return "Gemini върна невалиден отговор. Опитай нов refresh.";
  }

  if (error instanceof SyntaxError) {
    return "Gemini върна неочакван формат. Опитай отново.";
  }

  return "Не успяхме да генерираме нови предложения. Опитай отново.";
}
