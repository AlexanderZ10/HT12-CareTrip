import { normalizeBudgetToEuro } from "./currency";
import type { AppLanguage } from "./translations";
import { GEMINI_MODEL, type DiscoverProfile } from "./trip-recommendations";

export type PlannerTransportOption = {
  bookingUrl?: string;
  duration: string;
  mode: string;
  note: string;
  price: string;
  provider: string;
  route: string;
  sourceLabel?: string;
};

export type PlannerStayOption = {
  area: string;
  bookingUrl?: string;
  imageUrl?: string;
  name: string;
  note: string;
  pricePerNight: string;
  ratingLabel?: string;
  sourceLabel?: string;
  type: string;
};

export type PlannerDayPlan = {
  dayLabel: string;
  items: string[];
  title: string;
};

export type GroundedTravelPlan = {
  budgetNote: string;
  profileTip: string;
  stayOptions: PlannerStayOption[];
  summary: string;
  title: string;
  transportOptions: PlannerTransportOption[];
  tripDays: PlannerDayPlan[];
};

type RawGroundedTravelPlan = Partial<GroundedTravelPlan>;

const HOME_PLAN_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    budgetNote: { type: "string" },
    profileTip: { type: "string" },
    transportOptions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          mode: { type: "string" },
          provider: { type: "string" },
          route: { type: "string" },
          duration: { type: "string" },
          price: { type: "string" },
          note: { type: "string" },
        },
        required: ["mode", "provider", "route", "duration", "price", "note"],
      },
      minItems: 2,
      maxItems: 4,
    },
    stayOptions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          type: { type: "string" },
          area: { type: "string" },
          pricePerNight: { type: "string" },
          note: { type: "string" },
        },
        required: ["name", "type", "area", "pricePerNight", "note"],
      },
      minItems: 2,
      maxItems: 3,
    },
    tripDays: {
      type: "array",
      items: {
        type: "object",
        properties: {
          dayLabel: { type: "string" },
          title: { type: "string" },
          items: {
            type: "array",
            items: { type: "string" },
            minItems: 2,
            maxItems: 4,
          },
        },
        required: ["dayLabel", "title", "items"],
      },
      minItems: 2,
      maxItems: 10,
    },
  },
  required: [
    "title",
    "summary",
    "budgetNote",
    "profileTip",
    "transportOptions",
    "stayOptions",
    "tripDays",
  ],
} as const;

function sanitizeString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function getPlannerLanguageVariant(language?: string): AppLanguage {
  const normalized = (language || "").trim().toLowerCase();

  if (normalized === "en" || normalized === "english") return "en";
  if (normalized === "de" || normalized === "german" || normalized === "deutsch") return "de";
  if (normalized === "es" || normalized === "spanish" || normalized === "español") return "es";
  if (normalized === "fr" || normalized === "french" || normalized === "français") return "fr";
  return "bg";
}

function getPlannerCopy(language?: string) {
  switch (getPlannerLanguageVariant(language)) {
    case "en":
      return {
        altOption: "Alternative option",
        availabilityNote: "Check availability before booking.",
        budgetFallback: "We are planning within the available budget and trip duration.",
        dayLabel: (index: number) => `Day ${index + 1}`,
        dayPlan: "Daily plan",
        durationPending: "Duration to be confirmed",
        fallbackMessage: "Tell me more about the trip you're planning.",
        flexiblePlan:
          "A practical trip plan focused on realistic transport, stay and a compact itinerary.",
        mainOption: "Main option",
        noProvider: "Check the latest operator",
        priceOnRequest: "Price on request",
        profileTip:
          "We picked a more focused route with practical transport and stay options.",
        routePending: "Route to be confirmed",
        stayOption: "Stay option",
        stayType: "Stay",
        summary:
          "Compact plan focused on concrete transport, stay and short itinerary.",
        centralArea: "Central area",
        stayNote: "Confirm the conditions before booking.",
        unknownDestinationTitle: (destination: string) => `Trip plan for ${destination}`,
      } as const;
    case "de":
      return {
        altOption: "Alternative Option",
        availabilityNote: "Prüfe die Verfügbarkeit vor der Buchung.",
        budgetFallback:
          "Wir planen im verfügbaren Budgetrahmen und innerhalb der Reisedauer.",
        dayLabel: (index: number) => `Tag ${index + 1}`,
        dayPlan: "Tagesplan",
        durationPending: "Dauer wird noch bestätigt",
        fallbackMessage: "Erzähl mir mehr über die Reise, die du planst.",
        flexiblePlan:
          "Ein praktischer Reiseplan mit Fokus auf realistischem Transport, Unterkunft und kompaktem Ablauf.",
        mainOption: "Hauptoption",
        noProvider: "Prüfe den aktuellen Anbieter",
        priceOnRequest: "Preis auf Anfrage",
        profileTip:
          "Wir haben eine fokussiertere Route mit praktischem Transport und Unterkunft ausgewählt.",
        routePending: "Route wird noch bestätigt",
        stayOption: "Unterkunftsoption",
        stayType: "Unterkunft",
        summary:
          "Kompakter Plan mit Fokus auf konkretem Transport, Unterkunft und kurzem Ablauf.",
        centralArea: "Zentrale Lage",
        stayNote: "Bestätige die Bedingungen vor der Buchung.",
        unknownDestinationTitle: (destination: string) => `Reiseplan für ${destination}`,
      } as const;
    case "es":
      return {
        altOption: "Opción alternativa",
        availabilityNote: "Comprueba la disponibilidad antes de reservar.",
        budgetFallback:
          "Estamos planificando dentro del presupuesto disponible y la duración del viaje.",
        dayLabel: (index: number) => `Día ${index + 1}`,
        dayPlan: "Plan diario",
        durationPending: "Duración por confirmar",
        fallbackMessage: "Cuéntame más sobre el viaje que estás planeando.",
        flexiblePlan:
          "Un plan de viaje práctico centrado en transporte realista, alojamiento e itinerario compacto.",
        mainOption: "Opción principal",
        noProvider: "Consulta el operador actual",
        priceOnRequest: "Precio a consultar",
        profileTip:
          "Elegimos una ruta más enfocada con transporte y alojamiento más prácticos.",
        routePending: "Ruta por confirmar",
        stayOption: "Opción de alojamiento",
        stayType: "Alojamiento",
        summary:
          "Plan compacto centrado en transporte concreto, alojamiento e itinerario corto.",
        centralArea: "Zona céntrica",
        stayNote: "Confirma las condiciones antes de reservar.",
        unknownDestinationTitle: (destination: string) => `Plan para ${destination}`,
      } as const;
    case "fr":
      return {
        altOption: "Option alternative",
        availabilityNote: "Vérifie la disponibilité avant de réserver.",
        budgetFallback:
          "Nous planifions dans le budget disponible et la durée du voyage.",
        dayLabel: (index: number) => `Jour ${index + 1}`,
        dayPlan: "Plan du jour",
        durationPending: "Durée à confirmer",
        fallbackMessage: "Parle-moi davantage du voyage que tu prépares.",
        flexiblePlan:
          "Un plan de voyage pratique axé sur un transport réaliste, l’hébergement et un itinéraire compact.",
        mainOption: "Option principale",
        noProvider: "Vérifie l’opérateur actuel",
        priceOnRequest: "Prix sur demande",
        profileTip:
          "Nous avons choisi un itinéraire plus ciblé avec des options de transport et d’hébergement plus pratiques.",
        routePending: "Itinéraire à confirmer",
        stayOption: "Option d’hébergement",
        stayType: "Hébergement",
        summary:
          "Plan compact axé sur un transport concret, l’hébergement et un itinéraire court.",
        centralArea: "Zone centrale",
        stayNote: "Confirme les conditions avant de réserver.",
        unknownDestinationTitle: (destination: string) => `Itinéraire pour ${destination}`,
      } as const;
    default:
      return {
        altOption: "Алтернативен вариант",
        availabilityNote: "Провери наличността преди резервация.",
        budgetFallback: "Планираме в рамките на наличния бюджет и продължителността на пътуването.",
        dayLabel: (index: number) => `Ден ${index + 1}`,
        dayPlan: "Дневен план",
        durationPending: "Времето се уточнява",
        fallbackMessage: "Разкажи ми повече за пътуването, което планираш.",
        flexiblePlan:
          "Стегнат план с фокус върху реалистичен транспорт, настаняване и компактен маршрут.",
        mainOption: "Основен вариант",
        noProvider: "Провери актуалния оператор",
        priceOnRequest: "Цена при запитване",
        profileTip:
          "Избрахме по-стегнат маршрут с приоритет на по-практичен транспорт и stay.",
        routePending: "Маршрутът се уточнява",
        stayOption: "Настаняване",
        stayType: "Настаняване",
        summary:
          "Стегнат план за дестинацията с фокус върху конкретен транспорт, stay и кратък itinerary.",
        centralArea: "Централна зона",
        stayNote: "Потвърди условията преди резервация.",
        unknownDestinationTitle: (destination: string) => `Маршрут за ${destination}`,
      } as const;
  }
}

function sanitizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4);
}

function dedupeByKey<T>(items: T[], getKey: (item: T) => string) {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = getKey(item).trim().toLowerCase();

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function dedupeTextLines(lines: string[]) {
  const seen = new Set<string>();

  return lines.filter((line, index, array) => {
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      return Boolean(array[index - 1]?.trim()) && Boolean(array[index + 1]?.trim());
    }

    const normalized = trimmedLine.toLowerCase();

    if (seen.has(normalized)) {
      return false;
    }

    seen.add(normalized);
    return true;
  });
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
    throw new Error(`gemini-grounded-request-failed:${response.status}:${errorText}`);
  }

  const responsePayload = await response.json();
  const text = getResponseText(responsePayload);

  if (!text) {
    throw new Error("empty-grounded-response");
  }

  return text;
}

function normalizeTransportOption(
  item: Partial<PlannerTransportOption>,
  index: number,
  language?: string
) {
  const copy = getPlannerCopy(language);

  return {
    bookingUrl: sanitizeString(item.bookingUrl),
    duration: sanitizeString(item.duration, copy.durationPending),
    mode: sanitizeString(item.mode, index === 0 ? copy.mainOption : copy.altOption),
    note: sanitizeString(item.note, copy.availabilityNote),
    price: sanitizeString(item.price, copy.priceOnRequest),
    provider: sanitizeString(item.provider, copy.noProvider),
    route: sanitizeString(item.route, copy.routePending),
    sourceLabel: sanitizeString(item.sourceLabel),
  } satisfies PlannerTransportOption;
}

function normalizeStayOption(
  item: Partial<PlannerStayOption>,
  index: number,
  language?: string
) {
  const copy = getPlannerCopy(language);

  return {
    area: sanitizeString(item.area, copy.centralArea),
    bookingUrl: sanitizeString(item.bookingUrl),
    imageUrl: sanitizeString(item.imageUrl),
    name: sanitizeString(item.name, `${copy.stayOption} ${index + 1}`),
    note: sanitizeString(item.note, copy.stayNote),
    pricePerNight: sanitizeString(item.pricePerNight, copy.priceOnRequest),
    ratingLabel: sanitizeString(item.ratingLabel),
    sourceLabel: sanitizeString(item.sourceLabel),
    type: sanitizeString(item.type, copy.stayType),
  } satisfies PlannerStayOption;
}

function normalizeDayPlan(
  item: Partial<PlannerDayPlan>,
  index: number,
  language?: string
) {
  const copy = getPlannerCopy(language);

  return {
    dayLabel: sanitizeString(item.dayLabel, copy.dayLabel(index)),
    items: sanitizeStringArray(item.items).slice(0, 4),
    title: sanitizeString(item.title, copy.dayPlan),
  } satisfies PlannerDayPlan;
}

function buildFallbackPlan(params: {
  budget: string;
  days: string;
  destination: string;
  language?: string;
}): GroundedTravelPlan {
  const copy = getPlannerCopy(params.language);

  return {
    budgetNote: `${copy.budgetFallback} ${normalizeBudgetToEuro(params.budget)} / ${params.days}.`,
    profileTip: copy.profileTip,
    stayOptions: [],
    summary: `${copy.summary} ${params.destination}.`,
    title: copy.unknownDestinationTitle(params.destination),
    transportOptions: [],
    tripDays: [],
  };
}

function normalizePlan(
  rawPlan: RawGroundedTravelPlan,
  params: { budget: string; days: string; destination: string; language?: string }
) {
  const transportOptions = dedupeByKey(
    Array.isArray(rawPlan.transportOptions)
      ? rawPlan.transportOptions.map((item, index) =>
          normalizeTransportOption(item, index, params.language)
        )
      : [],
    (item) => `${item.mode}|${item.provider}|${item.route}|${item.price}|${item.duration}`
  );
  const stayOptions = dedupeByKey(
    Array.isArray(rawPlan.stayOptions)
      ? rawPlan.stayOptions.map((item, index) =>
          normalizeStayOption(item, index, params.language)
        )
      : [],
    (item) => `${item.name}|${item.type}|${item.area}|${item.pricePerNight}`
  );
  const tripDays = dedupeByKey(
    Array.isArray(rawPlan.tripDays)
      ? rawPlan.tripDays.map((item, index) => {
          const normalizedDay = normalizeDayPlan(item, index, params.language);

          return {
            ...normalizedDay,
            items: dedupeByKey(normalizedDay.items, (value) => value),
          };
        })
      : [],
    (item) => `${item.dayLabel}|${item.title}|${item.items.join("|")}`
  );
  const fallbackPlan = buildFallbackPlan(params);

  return {
    ...fallbackPlan,
    budgetNote: sanitizeString(
      rawPlan.budgetNote,
      fallbackPlan.budgetNote
    ),
    profileTip: sanitizeString(
      rawPlan.profileTip,
      fallbackPlan.profileTip
    ),
    stayOptions,
    summary: sanitizeString(rawPlan.summary, fallbackPlan.summary),
    title: sanitizeString(rawPlan.title, fallbackPlan.title),
    transportOptions,
    tripDays,
  } satisfies GroundedTravelPlan;
}

function buildPlannerPrompt(params: {
  budget: string;
  days: string;
  destination: string;
  language?: string;
  timing: string;
  transportPreference: string;
  travelers: string;
  profile: DiscoverProfile;
}) {
  const {
    budget,
    days,
    destination,
    timing,
    transportPreference,
    travelers,
    profile,
  } = params;
  const normalizedBudget = normalizeBudgetToEuro(budget);
  const homeBase = profile.personalProfile.homeBase || "Unknown";

  return [
    "You are preparing grounded travel research notes for a second planning step.",
    "You are a premium travel planning assistant inside a mobile app.",
    `Answer in ${params.language || "Bulgarian"}.`,
    "Use Google Search grounding to incorporate current travel information where possible.",
    "Return concise factual research notes only. No intro. No filler.",
    "Use EUR for all prices, estimates, totals, and suggestions.",
    "Treat the user's home base as the trip origin.",
    "Always research realistic transport from the user's home base to the destination.",
    "Include bus options and shared transport / rideshare when relevant.",
    "Include flights only when they are a realistic fit, not by default.",
    "Respect the user's preferred transport. If it is not practical, note the closest viable fallback.",
    "Adapt transport and stay suggestions to the total number of travelers.",
    "Use the timing window to prefer seasonally appropriate and realistically bookable options.",
    "Mention operator, airport, station, route, or platform names when grounding gives enough evidence.",
    "Prefer guesthouses and boutique stays first, then hotels if needed.",
    "Keep notes compact and highly concrete.",
    "Do not repeat the same recommendation, route, or sentence in different sections.",
    "Structure the notes with these headings exactly:",
    "TRANSPORT",
    "STAY",
    "DAYS",
    "BUDGET_FIT",
    "PROFILE_TIP",
    "",
    `Trip origin / home base: ${homeBase}`,
    `Budget (EUR): ${normalizedBudget}`,
    `Trip length: ${days}`,
    `Travelers count: ${travelers}`,
    `Preferred transport: ${transportPreference}`,
    `Timing / period: ${timing}`,
    `Destination: ${destination}`,
    `Username: ${profile.username || "Not provided"}`,
    `Email: ${profile.email || "Not provided"}`,
    `Full name: ${profile.personalProfile.fullName || "Not provided"}`,
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

function buildStructuredPlanPrompt(params: {
  budget: string;
  days: string;
  destination: string;
  language?: string;
  timing: string;
  transportPreference: string;
  travelers: string;
  profile: DiscoverProfile;
  groundedNotes: string;
}) {
  const {
    budget,
    days,
    destination,
    timing,
    transportPreference,
    travelers,
    profile,
    groundedNotes,
  } = params;

  return [
    `Convert the grounded travel research below into a compact structured travel plan in ${params.language || "Bulgarian"}.`,
    "Use only the grounded notes for factual claims.",
    "Do not add long explanations or generic travel advice.",
    "Keep summary to max 2 sentences.",
    "Keep budgetNote to max 1 sentence.",
    "Keep profileTip to max 2 sentences.",
    "All prices must stay in EUR.",
    "The itinerary must match the requested number of days.",
    "If the budget is too low, say so briefly in budgetNote, but still provide the best realistic fit.",
    "Prefer guesthouses first when they fit.",
    "Avoid duplicated points or near-identical wording across sections.",
    "",
    `Budget: ${normalizeBudgetToEuro(budget)}`,
    `Days: ${days}`,
    `Travelers: ${travelers}`,
    `Preferred transport: ${transportPreference}`,
    `Timing: ${timing}`,
    `Destination: ${destination}`,
    `Home base: ${profile.personalProfile.homeBase || "Unknown"}`,
    "",
    "Grounded notes:",
    groundedNotes,
  ].join("\n");
}

export function formatGroundedTravelPlan(plan: GroundedTravelPlan) {
  return dedupeTextLines([
    plan.title,
    "",
    plan.summary,
    plan.budgetNote ? `\nBudget: ${plan.budgetNote}` : "",
    "",
    "Transport:",
    ...plan.transportOptions.map(
      (option) =>
        `- ${option.mode}: ${option.provider} | ${option.route} | ${option.price} | ${option.duration}`
    ),
    "",
    "Stay:",
    ...plan.stayOptions.map(
      (stay) =>
        `- ${stay.name} (${stay.type}) | ${stay.area} | ${stay.pricePerNight}`
    ),
    "",
    "Days:",
    ...plan.tripDays.map(
      (day) => `- ${day.dayLabel}: ${day.title} | ${day.items.join(" • ")}`
    ),
    "",
    `Profile tip: ${plan.profileTip}`,
  ])
    .filter(Boolean)
    .join("\n");
}

export async function generateGroundedTravelPlan(params: {
  budget: string;
  days: string;
  destination: string;
  language?: string;
  timing: string;
  transportPreference: string;
  travelers: string;
  profile: DiscoverProfile;
}) {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("missing-api-key");
  }

  const groundedNotes = await callGeminiGenerateContent({
    apiKey,
    prompt: buildPlannerPrompt(params),
    tools: [
      {
        google_search: {},
      },
    ],
  });

  const structuredJsonText = await callGeminiGenerateContent({
    apiKey,
    prompt: buildStructuredPlanPrompt({
      ...params,
      groundedNotes,
    }),
    generationConfig: {
      responseMimeType: "application/json",
      responseJsonSchema: HOME_PLAN_RESPONSE_SCHEMA,
    },
  });

  const parsedPlan = JSON.parse(structuredJsonText) as RawGroundedTravelPlan;
  return normalizePlan(parsedPlan, params);
}

function buildPlannerFollowUpPrompt(params: {
  budget: string;
  days: string;
  destination: string;
  language?: string;
  timing: string;
  transportPreference: string;
  travelers: string;
  profile: DiscoverProfile;
  currentPlanText: string;
  recentMessages: { role: "assistant" | "user"; text: string }[];
  userRequest: string;
}) {
  const {
    budget,
    currentPlanText,
    days,
    destination,
    profile,
    recentMessages,
    timing,
    transportPreference,
    travelers,
    userRequest,
  } = params;

  const recentConversation =
    recentMessages.length > 0
      ? recentMessages
          .slice(-6)
          .map((message) => `${message.role === "assistant" ? "AI" : "User"}: ${message.text}`)
          .join("\n")
      : "No previous follow-up messages.";

  return [
    "You are continuing an existing travel planning chat inside a mobile app.",
    `Answer in ${params.language || "Bulgarian"}.`,
    "Use Google Search grounding when helpful for current transport, stay, timing, or pricing details.",
    "The user already has a travel plan. Answer only the follow-up request.",
    "If the user wants changes, propose the revised direction clearly and concretely.",
    "If exact live prices are unclear, say they are approximate instead of inventing certainty.",
    "Do not repeat the full old plan unless it is necessary.",
    "Avoid repeated bullets, repeated recommendations, and near-identical phrasing.",
    "Keep the answer concise, practical, and easy to scan on mobile.",
    "You may use short paragraphs or a few short bullet points.",
    "",
    `Budget: ${normalizeBudgetToEuro(budget)}`,
    `Days: ${days}`,
    `Destination: ${destination}`,
    `Travelers: ${travelers}`,
    `Preferred transport: ${transportPreference}`,
    `Timing: ${timing}`,
    `Username: ${profile.username || "Not provided"}`,
    `Email: ${profile.email || "Not provided"}`,
    `Home base: ${profile.personalProfile.homeBase || "Unknown"}`,
    `Travel pace: ${profile.personalProfile.travelPace || "Not provided"}`,
    `Stay style: ${profile.personalProfile.stayStyle || "Not provided"}`,
    `About me: ${profile.personalProfile.aboutMe || "Not provided"}`,
    `Dream destinations: ${profile.personalProfile.dreamDestinations || "Not provided"}`,
    `Interests: ${profile.interests.selectedOptions.join(", ") || "None provided"}`,
    `Accessibility / assistance needs: ${
      profile.assistance.selectedOptions.join(", ") || "None provided"
    }`,
    "",
    "Current plan:",
    currentPlanText,
    "",
    "Recent conversation:",
    recentConversation,
    "",
    `Latest user request: ${userRequest}`,
  ].join("\n");
}

export async function generateGroundedTravelFollowUp(params: {
  budget: string;
  days: string;
  destination: string;
  language?: string;
  timing: string;
  transportPreference: string;
  travelers: string;
  profile: DiscoverProfile;
  currentPlanText: string;
  recentMessages: { role: "assistant" | "user"; text: string }[];
  userRequest: string;
}) {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("missing-api-key");
  }

  return callGeminiGenerateContent({
    apiKey,
    prompt: buildPlannerFollowUpPrompt(params),
    tools: [
      {
        google_search: {},
      },
    ],
  });
}

export type ConversationalExtractedInfo = {
  destination: string;
  budget: string;
  days: string;
  travelers: string;
  transportPreference: string;
  timing: string;
  interests: string;
  accommodation: string;
  specialNeeds: string;
};

export type ConversationalResponse = {
  message: string;
  extractedInfo: ConversationalExtractedInfo;
  readyToGenerate: boolean;
};

const CONVERSATIONAL_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    message: { type: "string" },
    extractedInfo: {
      type: "object",
      properties: {
        destination: { type: "string" },
        budget: { type: "string" },
        days: { type: "string" },
        travelers: { type: "string" },
        transportPreference: { type: "string" },
        timing: { type: "string" },
        interests: { type: "string" },
        accommodation: { type: "string" },
        specialNeeds: { type: "string" },
      },
      required: [
        "destination",
        "budget",
        "days",
        "travelers",
        "transportPreference",
        "timing",
        "interests",
        "accommodation",
        "specialNeeds",
      ],
    },
    readyToGenerate: { type: "boolean" },
  },
  required: ["message", "extractedInfo", "readyToGenerate"],
} as const;

function buildConversationalPrompt(params: {
  conversationHistory: { role: "assistant" | "user"; text: string }[];
  language?: string;
  profile: DiscoverProfile;
}) {
  const { conversationHistory, profile } = params;
  const homeBase = profile.personalProfile.homeBase || "Unknown";

  const historyText =
    conversationHistory.length > 0
      ? conversationHistory
          .map((m) => `${m.role === "assistant" ? "Assistant" : "User"}: ${m.text}`)
          .join("\n")
      : "No messages yet.";

  return [
    "You are a friendly, conversational travel planning assistant inside a mobile app called CareTrip.",
    "Your job is to chat naturally with the user to understand their dream trip.",
    `Answer ONLY in ${params.language || "Bulgarian"}.`,
    "",
    "You must gather the following information through natural, engaging conversation:",
    "1. Destination – Where they want to go",
    "2. Budget – How much they want to spend (in EUR)",
    "3. Duration – How many days the trip should be",
    "4. Travelers – How many people are going",
    "5. Transport – How they prefer to travel",
    "6. Timing – When they want to travel",
    "7. Interests / activities – What they enjoy doing on a trip",
    "8. Accommodation – Which type of stay they prefer (hotel, guesthouse, Airbnb, etc.)",
    "9. Special needs – Dietary, accessibility, or any other needs",
    "",
    "RULES:",
    "- Ask ONE question at a time. Never ask multiple questions in the same message.",
    "- Be warm, conversational and natural – like a friend helping plan a trip, not a form.",
    "- Build on the user's previous answers. Reference what they said.",
    "- If the user gives multiple pieces of info in one answer, acknowledge them all and move on.",
    "- Don't re-ask for information the user has already clearly provided.",
    "- If the user gives very short or vague answers, ask a friendly follow-up to get more detail.",
    "- Keep your messages short (1-3 sentences max).",
    "- Use the user's profile context to personalize questions (e.g. mention their dream destinations, home base, interests).",
    "- For extractedInfo, fill in only what you've clearly learned. Use empty string for unknown fields.",
    "- Normalize budget to EUR when possible.",
    "",
    "IMPORTANT — when to generate the trip plan:",
    "- NEVER set readyToGenerate to true on your own. You must ALWAYS ask the user for confirmation first.",
    "- After you have gathered at least 7 of the 9 key details, send a short summary of everything you know about their trip and ask if you should prepare the itinerary with those details.",
    "- Only set readyToGenerate to true when the user EXPLICITLY confirms in their own language.",
    "- If the user says no or wants to change something, continue the conversation and adjust the extracted info.",
    "- readyToGenerate must ONLY be true in the response AFTER the user has confirmed.",
    "",
    "User profile context:",
    `Home base: ${homeBase}`,
    `Name: ${profile.personalProfile.fullName || "Not provided"}`,
    `Dream destinations: ${profile.personalProfile.dreamDestinations || "Not provided"}`,
    `Travel pace: ${profile.personalProfile.travelPace || "Not provided"}`,
    `Stay style: ${profile.personalProfile.stayStyle || "Not provided"}`,
    `Interests: ${profile.interests.selectedOptions.join(", ") || "None provided"}`,
    `Accessibility needs: ${profile.assistance.selectedOptions.join(", ") || "None provided"}`,
    "",
    "Conversation so far:",
    historyText,
  ].join("\n");
}

function sanitizeConversationalResponse(
  raw: Record<string, unknown>,
  language?: string
): ConversationalResponse {
  const info = (raw.extractedInfo && typeof raw.extractedInfo === "object"
    ? raw.extractedInfo
    : {}) as Record<string, unknown>;
  const copy = getPlannerCopy(language);

  return {
    message: sanitizeString(raw.message, copy.fallbackMessage),
    extractedInfo: {
      destination: sanitizeString(info.destination),
      budget: sanitizeString(info.budget),
      days: sanitizeString(info.days),
      travelers: sanitizeString(info.travelers),
      transportPreference: sanitizeString(info.transportPreference),
      timing: sanitizeString(info.timing),
      interests: sanitizeString(info.interests),
      accommodation: sanitizeString(info.accommodation),
      specialNeeds: sanitizeString(info.specialNeeds),
    },
    readyToGenerate: raw.readyToGenerate === true,
  };
}

export async function generateConversationalResponse(params: {
  conversationHistory: { role: "assistant" | "user"; text: string }[];
  language?: string;
  profile: DiscoverProfile;
}): Promise<ConversationalResponse> {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("missing-api-key");
  }

  const text = await callGeminiGenerateContent({
    apiKey,
    prompt: buildConversationalPrompt(params),
    generationConfig: {
      responseMimeType: "application/json",
      responseJsonSchema: CONVERSATIONAL_RESPONSE_SCHEMA,
    },
  });

  const parsed = JSON.parse(text) as Record<string, unknown>;
  return sanitizeConversationalResponse(parsed, params.language);
}

export function getHomePlannerErrorMessage(
  error: unknown,
  language: AppLanguage = "bg"
) {
  if (!(error instanceof Error)) {
    return language === "en"
      ? "We couldn't generate a route. Please try again."
      : language === "de"
        ? "Wir konnten keine Route generieren. Bitte versuche es erneut."
        : language === "es"
          ? "No pudimos generar la ruta. Inténtalo de nuevo."
          : language === "fr"
            ? "Nous n'avons pas pu générer l'itinéraire. Réessaie."
            : "Не успяхме да генерираме маршрут. Опитай пак.";
  }

  if (error.message === "missing-api-key") {
    return language === "en"
      ? "EXPO_PUBLIC_GEMINI_API_KEY is missing. Add a Gemini API key and restart the app."
      : language === "de"
        ? "EXPO_PUBLIC_GEMINI_API_KEY fehlt. Füge einen Gemini-API-Schlüssel hinzu und starte die App neu."
        : language === "es"
          ? "Falta EXPO_PUBLIC_GEMINI_API_KEY. Añade una clave de Gemini y reinicia la app."
          : language === "fr"
            ? "EXPO_PUBLIC_GEMINI_API_KEY est manquant. Ajoute une clé Gemini puis redémarre l’application."
            : "Липсва EXPO_PUBLIC_GEMINI_API_KEY. Добави Gemini API ключ и рестартирай приложението.";
  }

  if (error.message.startsWith("gemini-grounded-request-failed:429")) {
    return language === "en"
      ? "Gemini hit the request limit. Please try again later."
      : language === "de"
        ? "Gemini hat das Anfrage-Limit erreicht. Bitte versuche es später erneut."
        : language === "es"
          ? "Gemini alcanzó el límite de solicitudes. Inténtalo más tarde."
          : language === "fr"
            ? "Gemini a atteint la limite de requêtes. Réessaie plus tard."
            : "Gemini достигна лимит за заявки. Опитай отново по-късно.";
  }

  if (error.message.startsWith("gemini-grounded-request-failed:")) {
    return language === "en"
      ? "We couldn't fetch fresh travel data from Gemini. Check the key and your network."
      : language === "de"
        ? "Wir konnten keine aktuellen Reisedaten von Gemini abrufen. Prüfe Schlüssel und Netzwerk."
        : language === "es"
          ? "No pudimos obtener datos de viaje actualizados de Gemini. Revisa la clave y la red."
          : language === "fr"
            ? "Nous n'avons pas pu récupérer les données de voyage récentes depuis Gemini. Vérifie la clé et le réseau."
            : "Не успяхме да вземем актуални travel данни от Gemini. Провери ключа и мрежата.";
  }

  if (error.message === "empty-grounded-response") {
    return language === "en"
      ? "Gemini didn't return a route. Please try again."
      : language === "de"
        ? "Gemini hat keine Route zurückgegeben. Bitte versuche es erneut."
        : language === "es"
          ? "Gemini no devolvió una ruta. Inténtalo de nuevo."
          : language === "fr"
            ? "Gemini n'a pas renvoyé d'itinéraire. Réessaie."
            : "Gemini не върна маршрут. Опитай отново.";
  }

  if (error instanceof SyntaxError) {
    return language === "en"
      ? "Gemini returned an unexpected format. Please try again."
      : language === "de"
        ? "Gemini hat ein unerwartetes Format zurückgegeben. Bitte versuche es erneut."
        : language === "es"
          ? "Gemini devolvió un formato inesperado. Inténtalo de nuevo."
          : language === "fr"
            ? "Gemini a renvoyé un format inattendu. Réessaie."
            : "Gemini върна неочакван формат. Опитай пак.";
  }

  return language === "en"
    ? "We couldn't generate a route. Please try again."
    : language === "de"
      ? "Wir konnten keine Route generieren. Bitte versuche es erneut."
      : language === "es"
        ? "No pudimos generar la ruta. Inténtalo de nuevo."
        : language === "fr"
          ? "Nous n'avons pas pu générer l'itinéraire. Réessaie."
          : "Не успяхме да генерираме маршрут. Опитай пак.";
}
