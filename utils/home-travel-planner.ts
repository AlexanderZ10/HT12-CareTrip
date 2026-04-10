import { normalizeBudgetToEuro } from "./currency";
import { sanitizeString, sanitizeStringArray } from "./sanitize";
import type { AppLanguage } from "./translations";
import { type DiscoverProfile } from "./trip-recommendations";
import { callAI, getAIApiKey } from "./ai";
import { fetchDestinationCosts, formatDailyCostSummary } from "./destination-costs";

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
        fallbackMessage: "Got it! When do you want to travel?",
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
        fallbackMessage: "Verstanden! Wann möchtest du reisen?",
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
        fallbackMessage: "¡Entendido! ¿Cuándo quieres viajar?",
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
        fallbackMessage: "Compris ! Quand veux-tu voyager ?",
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
        fallbackMessage: "Разбрах! Кога искаш да пътуваш?",
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

function extractJsonObject(text: string) {
  const trimmedText = text.trim();

  if (!trimmedText) {
    throw new Error("empty-json-response");
  }

  const fencedMatch = trimmedText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const directCandidate = fencedMatch?.[1]?.trim() || trimmedText;

  try {
    return JSON.parse(directCandidate) as Record<string, unknown>;
  } catch {
    // Fall through to balanced-object extraction.
  }

  let depth = 0;
  let startIndex = -1;

  for (let index = 0; index < directCandidate.length; index += 1) {
    const character = directCandidate[index];

    if (character === "{") {
      if (depth === 0) {
        startIndex = index;
      }
      depth += 1;
    } else if (character === "}") {
      depth -= 1;

      if (depth === 0 && startIndex !== -1) {
        const possibleJson = directCandidate.slice(startIndex, index + 1);
        return JSON.parse(possibleJson) as Record<string, unknown>;
      }
    }
  }

  throw new Error("invalid-json-response");
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
    `Trip origin / home base: """${homeBase}"""`,
    `Budget (EUR): """${normalizedBudget}"""`,
    `Trip length: """${days}"""`,
    `Travelers count: """${travelers}"""`,
    `Preferred transport: """${transportPreference}"""`,
    `Timing / period: """${timing}"""`,
    `Destination: """${destination}"""`,
    `Username: """${profile.username || "Not provided"}"""`,
    `Email: """${profile.email || "Not provided"}"""`,
    `Full name: """${profile.personalProfile.fullName || "Not provided"}"""`,
    `About me: """${profile.personalProfile.aboutMe || "Not provided"}"""`,
    `Dream destinations: """${profile.personalProfile.dreamDestinations || "Not provided"}"""`,
    `Travel pace: """${profile.personalProfile.travelPace || "Not provided"}"""`,
    `Stay style: """${profile.personalProfile.stayStyle || "Not provided"}"""`,
    `Interests: """${profile.interests.selectedOptions.join(", ") || "None provided"}"""`,
    `Interests note: """${profile.interests.note || "None"}"""`,
    `Accessibility / assistance needs: """${
      profile.assistance.selectedOptions.join(", ") || "None provided"
    }"""`,
    `Assistance note: """${profile.assistance.note || "None"}"""`,
    `Skills / ways to help: """${profile.skills.selectedOptions.join(", ") || "None provided"}"""`,
    `Skills note: """${profile.skills.note || "None"}"""`,
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

  const homeBase = profile.personalProfile.homeBase || "Sofia, Bulgaria";
  const normalizedBudget = normalizeBudgetToEuro(budget);

  return [
    `Generate a complete structured travel plan in ${params.language || "English"}.`,
    "",
    "TRIP DETAILS:",
    `- Destination: ${destination}`,
    `- Origin / home base: ${homeBase}`,
    `- Budget: ${normalizedBudget} EUR total`,
    `- Duration: ${days} days`,
    `- Travelers: ${travelers}`,
    `- Preferred transport: ${transportPreference}`,
    `- Timing: ${timing}`,
    "",
    "YOU MUST GENERATE ALL OF THESE (never leave empty):",
    "",
    "transportOptions (MINIMUM 2 items): Real transport options from the origin to destination.",
    `Example for ${homeBase} → ${destination}:`,
    "- Include the user's preferred transport mode first",
    "- Add 1-2 alternative options (bus, train, flight, car as applicable)",
    "- Each must have: mode, provider (real company name), route (e.g. 'Sofia → Plovdiv'), duration, price in EUR, note",
    "- Use realistic prices and real operator names (e.g. Union Ivkoni, BlaBlaCar, Ryanair, FlixBus, BDZ)",
    "",
    "stayOptions (MINIMUM 2 items): Real accommodation options at the destination.",
    `Example for ${destination}:`,
    "- Include a budget option and a mid-range option",
    "- Each must have: name (real or realistic hotel/hostel name), type (hotel/hostel/guesthouse/Airbnb), area (neighborhood), pricePerNight in EUR, note",
    "- Use realistic prices for the destination",
    "",
    `tripDays (EXACTLY ${days} items — one per day): Day-by-day itinerary.`,
    "- Each day must have: dayLabel (e.g. 'Day 1'), title (short theme), items (2-4 specific activities with real place names)",
    "- Include specific restaurant/cafe names, museum names, landmark names — be concrete",
    "",
    "Also provide:",
    "- title: catchy trip title",
    "- summary: 2 sentences describing the trip",
    "- budgetNote: 1 sentence about how the budget fits",
    "- profileTip: 2 sentences personalized to the traveler",
    "",
    "All prices in EUR. Be specific with real names, not generic descriptions.",
    groundedNotes ? `\nAdditional research notes (use if helpful):\n${groundedNotes}` : "",
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
  const apiKey = getAIApiKey();

  if (!apiKey) {
    throw new Error("missing-api-key");
  }

  // Skip research step entirely — go straight to structured plan generation.
  // This halves the API calls and avoids rate limits.
  const structuredPrompt = buildStructuredPlanPrompt({
    ...params,
    groundedNotes: "",
  });

  const structuredJsonText = await callAI({
    apiKey,
    prompt: structuredPrompt,
    systemPrompt: [
      "You are a travel plan generator. Return ONLY valid JSON matching this exact schema.",
      "transportOptions: array of {mode, provider, route, duration, price, note} — MINIMUM 2 items",
      "stayOptions: array of {name, type, area, pricePerNight, note} — MINIMUM 2 items",
      "tripDays: array of {dayLabel, title, items: string[]} — one per day",
      "Also: title (string), summary (string), budgetNote (string), profileTip (string)",
      "ALL fields are required. NEVER return empty arrays.",
    ].join("\n"),
    jsonMode: true,
  });

  const parsedPlan = extractJsonObject(structuredJsonText) as RawGroundedTravelPlan;
  const plan = normalizePlan(parsedPlan, params);

  // Append daily cost estimate to the budget note when possible.
  try {
    const homeBase = params.profile.personalProfile.homeBase || "Europe";
    const costs = await fetchDestinationCosts(params.destination, homeBase);
    const costLine = `Daily expenses estimate: ${formatDailyCostSummary(costs, params.language || "English")}`;
    plan.budgetNote = plan.budgetNote ? `${plan.budgetNote}\n${costLine}` : costLine;
  } catch {
    // Cost enrichment is best-effort; do not block plan generation.
  }

  return plan;
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
  const apiKey = getAIApiKey();

  if (!apiKey) {
    throw new Error("missing-api-key");
  }

  return callAI({
    apiKey,
    prompt: buildPlannerFollowUpPrompt(params),
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

function buildConversationalSystemPrompt(params: {
  language?: string;
  profile: DiscoverProfile;
}) {
  const { profile } = params;
  const homeBase = profile.personalProfile.homeBase || "Unknown";
  const lang = params.language || "Bulgarian";

  return [
    `You are a travel planning assistant. Answer ONLY in ${lang}.`,
    "",
    "You ask the user 7 questions, ONE per message, in this exact order:",
    "",
    "Q1: Where do you want to go? (already asked — the user's first message is their answer)",
    "Q2: When do you want to travel?",
    "Q3: How many days?",
    "Q4: How many people are going? Solo, couple, friends, family?",
    "Q5: What is your budget in EUR?",
    "Q6: How do you want to get there? Flight, bus, train, car?",
    "Q7: What do you want to do there? Beach, museums, food, nightlife, hiking?",
    "",
    "FORMAT OF EACH RESPONSE:",
    '- Acknowledge the user\'s answer in 3-5 words (e.g. "Plovdiv, great choice!") then ask the NEXT question.',
    "- Keep it to 1-2 short sentences total.",
    "- Ask exactly ONE question per message.",
    "",
    "EXAMPLES of good responses:",
    `- User says "Barcelona" → you reply: "Barcelona, great choice! When do you want to travel?"`,
    `- User says "July" → you reply: "July it is! How many days should the trip be?"`,
    `- User says "5" → you reply: "5 days, perfect. How many people are going — solo, couple, friends?"`,
    `- User says "2 friends" → you reply: "A trip with friends! What's your total budget in EUR?"`,
    `- User says "500" → you reply: "€500 total, got it. How do you want to get there — flight, bus, train, car?"`,
    `- User says "bus" → you reply: "Bus it is! What do you want to do there — relax on the beach, visit museums, try local food, nightlife, hiking?"`,
    `- User says "food and museums" → you reply with a summary and ask to confirm.`,
    "",
    "CRITICAL RULE ABOUT readyToGenerate:",
    "- readyToGenerate MUST be false in EVERY response UNLESS the user's LAST message is an explicit confirmation like 'yes', 'go', 'generate', 'да', 'давай', 'ok', 'sure'.",
    "- You MUST ask ALL 7 questions FIRST. After Q7 is answered, present a summary and ask for confirmation.",
    "- If fewer than 5 extractedInfo fields are filled, readyToGenerate MUST be false. No exceptions.",
    "- The ONLY time readyToGenerate can be true is when you already showed a summary AND the user confirmed.",
    "",
    "EXTRACTEDINFO RULES:",
    "- Fill fields ONLY with what the user explicitly said. Empty string for unknown fields.",
    "- interests = what they want to do. accommodation = their preferred stay type. specialNeeds = dietary/accessibility.",
    `- User's profile: home base = "${homeBase}", stay style = "${profile.personalProfile.stayStyle || ""}", interests from profile = "${profile.interests.selectedOptions.join(", ") || ""}"`,
    "- Use profile info to pre-fill accommodation/specialNeeds if relevant, but NEVER skip asking the user questions.",
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
  const apiKey = getAIApiKey();

  if (!apiKey) {
    throw new Error("missing-api-key");
  }

  const systemPrompt = buildConversationalSystemPrompt({
    language: params.language,
    profile: params.profile,
  });

  // Pass all messages EXCEPT the last one as conversationHistory,
  // because callAI appends `prompt` as the final user message.
  const allMessages = params.conversationHistory;
  const historyForApi = allMessages.slice(0, -1).map((m) => ({
    role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
    content: m.text,
  }));
  const lastUserMessage = allMessages[allMessages.length - 1]?.text || "Hello";

  const jsonSchema = [
    "You MUST respond with a JSON object with exactly these fields:",
    '{ "message": "your reply text (the next question or summary)", "extractedInfo": { "destination": "", "budget": "", "days": "", "travelers": "", "transportPreference": "", "timing": "", "interests": "", "accommodation": "", "specialNeeds": "" }, "readyToGenerate": false }',
    "Fill extractedInfo fields ONLY with values the user has explicitly stated. Use empty string for unknown fields.",
    "readyToGenerate must be false unless the user just confirmed they want to generate.",
  ].join("\n");

  const text = await callAI({
    apiKey,
    prompt: lastUserMessage,
    systemPrompt: systemPrompt + "\n\n" + jsonSchema,
    conversationHistory: historyForApi,
    jsonMode: true,
  });

  const parsed = extractJsonObject(text);
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
      ? "API key is missing. Add EXPO_PUBLIC_GEMINI_API_KEY and restart the app."
      : language === "de"
        ? "API-Schlüssel fehlt. Füge EXPO_PUBLIC_GEMINI_API_KEY hinzu und starte die App neu."
        : language === "es"
          ? "Falta la clave API. Añade EXPO_PUBLIC_GEMINI_API_KEY y reinicia la app."
          : language === "fr"
            ? "Clé API manquante. Ajoute EXPO_PUBLIC_GEMINI_API_KEY et redémarre l’application."
            : "Липсва API ключ. Добави EXPO_PUBLIC_GEMINI_API_KEY и рестартирай приложението.";
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

  if (error.message.startsWith("ai-request-failed:")) {
    return language === "en"
      ? "We couldn't fetch fresh travel data. Check the key and your network."
      : language === "de"
        ? "Wir konnten keine aktuellen Reisedaten abrufen. Prüfe Schlüssel und Netzwerk."
        : language === "es"
          ? "No pudimos obtener datos de viaje actualizados. Revisa la clave y la red."
          : language === "fr"
            ? "Nous n'avons pas pu récupérer les données de voyage récentes. Vérifie la clé et le réseau."
            : "Не успяхме да вземем актуални данни за пътуване. Провери ключа и мрежата.";
  }

  if (error.message === "empty-ai-response" || error.message === "empty-grounded-response") {
    return language === "en"
      ? "AI didn't return a route. Please try again."
      : language === "de"
        ? "KI hat keine Route zurückgegeben. Bitte versuche es erneut."
        : language === "es"
          ? "La IA no devolvió una ruta. Inténtalo de nuevo."
          : language === "fr"
            ? "L'IA n'a pas renvoyé d'itinéraire. Réessaie."
            : "AI не върна маршрут. Опитай отново.";
  }

  if (error instanceof SyntaxError) {
    return language === "en"
      ? "AI returned an unexpected format. Please try again."
      : language === "de"
        ? "KI hat ein unerwartetes Format zurückgegeben. Bitte versuche es erneut."
        : language === "es"
          ? "La IA devolvió un formato inesperado. Inténtalo de nuevo."
          : language === "fr"
            ? "L'IA a renvoyé un format inattendu. Réessaie."
            : "AI върна неочакван формат. Опитай пак.";
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
