import { normalizeBudgetToEuro } from "./currency";
import { GEMINI_MODEL, type DiscoverProfile } from "./trip-recommendations";

export type PlannerTransportOption = {
  duration: string;
  mode: string;
  note: string;
  price: string;
  provider: string;
  route: string;
};

export type PlannerStayOption = {
  area: string;
  name: string;
  note: string;
  pricePerNight: string;
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
  tools?: Array<Record<string, unknown>>;
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

function normalizeTransportOption(item: Partial<PlannerTransportOption>, index: number) {
  return {
    duration: sanitizeString(item.duration, "Времето се уточнява"),
    mode: sanitizeString(item.mode, index === 0 ? "Основен вариант" : "Алтернативен вариант"),
    note: sanitizeString(item.note, "Провери наличността преди резервация."),
    price: sanitizeString(item.price, "Цена при запитване"),
    provider: sanitizeString(item.provider, "Провери актуалния оператор"),
    route: sanitizeString(item.route, "Маршрутът се уточнява"),
  } satisfies PlannerTransportOption;
}

function normalizeStayOption(item: Partial<PlannerStayOption>, index: number) {
  return {
    area: sanitizeString(item.area, "Централна зона"),
    name: sanitizeString(item.name, `Stay option ${index + 1}`),
    note: sanitizeString(item.note, "Потвърди условията преди резервация."),
    pricePerNight: sanitizeString(item.pricePerNight, "Цена при запитване"),
    type: sanitizeString(item.type, "Настаняване"),
  } satisfies PlannerStayOption;
}

function normalizeDayPlan(item: Partial<PlannerDayPlan>, index: number) {
  return {
    dayLabel: sanitizeString(item.dayLabel, `Ден ${index + 1}`),
    items: sanitizeStringArray(item.items).slice(0, 4),
    title: sanitizeString(item.title, "Дневен план"),
  } satisfies PlannerDayPlan;
}

function buildFallbackPlan(params: {
  budget: string;
  days: string;
  destination: string;
}): GroundedTravelPlan {
  return {
    budgetNote: `Планираме в рамките на ${normalizeBudgetToEuro(params.budget)} за ${params.days}.`,
    profileTip: "Избрахме по-стегнат маршрут с приоритет на по-практичен транспорт и stay.",
    stayOptions: [],
    summary: `Стегнат план за ${params.destination} с фокус върху конкретен транспорт, stay и кратък itinerary.`,
    title: `Маршрут за ${params.destination}`,
    transportOptions: [],
    tripDays: [],
  };
}

function normalizePlan(
  rawPlan: RawGroundedTravelPlan,
  params: { budget: string; days: string; destination: string }
) {
  const transportOptions = Array.isArray(rawPlan.transportOptions)
    ? rawPlan.transportOptions.map((item, index) =>
        normalizeTransportOption(item, index)
      )
    : [];
  const stayOptions = Array.isArray(rawPlan.stayOptions)
    ? rawPlan.stayOptions.map((item, index) => normalizeStayOption(item, index))
    : [];
  const tripDays = Array.isArray(rawPlan.tripDays)
    ? rawPlan.tripDays.map((item, index) => normalizeDayPlan(item, index))
    : [];

  return {
    ...buildFallbackPlan(params),
    budgetNote: sanitizeString(
      rawPlan.budgetNote,
      buildFallbackPlan(params).budgetNote
    ),
    profileTip: sanitizeString(
      rawPlan.profileTip,
      buildFallbackPlan(params).profileTip
    ),
    stayOptions,
    summary: sanitizeString(rawPlan.summary, buildFallbackPlan(params).summary),
    title: sanitizeString(rawPlan.title, buildFallbackPlan(params).title),
    transportOptions,
    tripDays,
  } satisfies GroundedTravelPlan;
}

function buildPlannerPrompt(params: {
  budget: string;
  days: string;
  destination: string;
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
    "Answer in Bulgarian.",
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
    "Convert the grounded travel research below into a compact structured travel plan in Bulgarian.",
    "Use only the grounded notes for factual claims.",
    "Do not add long explanations or generic travel advice.",
    "Keep summary to max 2 sentences.",
    "Keep budgetNote to max 1 sentence.",
    "Keep profileTip to max 2 sentences.",
    "All prices must stay in EUR.",
    "The itinerary must match the requested number of days.",
    "If the budget is too low, say so briefly in budgetNote, but still provide the best realistic fit.",
    "Prefer guesthouses first when they fit.",
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
  return [
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
  ]
    .filter(Boolean)
    .join("\n");
}

export async function generateGroundedTravelPlan(params: {
  budget: string;
  days: string;
  destination: string;
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

export function getHomePlannerErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return "Не успяхме да генерираме маршрут. Опитай пак.";
  }

  if (error.message === "missing-api-key") {
    return "Липсва EXPO_PUBLIC_GEMINI_API_KEY. Добави Gemini API ключ и рестартирай приложението.";
  }

  if (error.message.startsWith("gemini-grounded-request-failed:429")) {
    return "Gemini достигна лимит за заявки. Опитай отново по-късно.";
  }

  if (error.message.startsWith("gemini-grounded-request-failed:")) {
    return "Не успяхме да вземем актуални travel данни от Gemini. Провери ключа и мрежата.";
  }

  if (error.message === "empty-grounded-response") {
    return "Gemini не върна маршрут. Опитай отново.";
  }

  if (error instanceof SyntaxError) {
    return "Gemini върна неочакван формат. Опитай пак.";
  }

  return "Не успяхме да генерираме маршрут. Опитай пак.";
}
