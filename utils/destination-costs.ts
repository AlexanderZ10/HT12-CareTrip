/**
 * Destination cost estimates — uses Gemini AI to provide daily cost breakdowns.
 */

import { callAI, getAIApiKey } from "./ai";
import { sanitizeString } from "./sanitize";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export type DestinationCostEstimate = {
  dailyFood: number;
  dailyTransport: number;
  dailyActivities: number;
  dailyShopping: number;
  dailyTotal: number;
  budgetTier: "budget" | "moderate" | "premium";
  currencyLocal: string;
  exchangeRateToEur: number;
  costComparedToHome: "cheaper" | "similar" | "more-expensive";
  tips: string[];
  /** `true` when the AI call failed and we returned hardcoded defaults. */
  isEstimate: boolean;
};

/* ------------------------------------------------------------------ */
/*  In-memory cache (1-hour TTL)                                      */
/* ------------------------------------------------------------------ */

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

type CacheEntry = {
  data: DestinationCostEstimate;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();

function cacheKey(destination: string, homeBase: string) {
  return `${destination.trim().toLowerCase()}::${homeBase.trim().toLowerCase()}`;
}

/* ------------------------------------------------------------------ */
/*  Fallback defaults                                                 */
/* ------------------------------------------------------------------ */

function buildFallback(): DestinationCostEstimate {
  return {
    dailyFood: 20,
    dailyTransport: 8,
    dailyActivities: 12,
    dailyShopping: 5,
    dailyTotal: 45,
    budgetTier: "moderate",
    currencyLocal: "EUR",
    exchangeRateToEur: 1,
    costComparedToHome: "similar",
    tips: [
      "Check local markets for affordable meals.",
      "Use public transport day-passes where available.",
    ],
    isEstimate: true,
  };
}

/* ------------------------------------------------------------------ */
/*  Prompt                                                            */
/* ------------------------------------------------------------------ */

function buildCostPrompt(destination: string, homeBase: string) {
  return [
    "You are a travel-cost expert. Provide realistic average daily costs in EUR for a traveler visiting the given destination.",
    `Destination: ${destination}`,
    `Traveler home base: ${homeBase}`,
    "",
    "Return a JSON object with exactly these fields:",
    '  dailyFood        — number (EUR) average daily food budget (street food + restaurants mix)',
    '  dailyTransport   — number (EUR) local transport per day',
    '  dailyActivities  — number (EUR) average sightseeing/activities per day',
    '  dailyShopping    — number (EUR) average daily miscellaneous spending',
    '  dailyTotal       — number (EUR) sum of all above',
    '  budgetTier       — "budget" | "moderate" | "premium"',
    '  currencyLocal    — local currency code (e.g. "THB", "USD")',
    '  exchangeRateToEur — number, approximate rate: 1 EUR = X local currency',
    '  costComparedToHome — "cheaper" | "similar" | "more-expensive" relative to the traveler home base',
    '  tips             — array of 2–3 short money-saving tips for that destination',
    "",
    "Use purchasing power parity awareness: compare the destination cost of living with the home base.",
    "Return ONLY the JSON object, no extra text.",
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/*  Sanitization                                                      */
/* ------------------------------------------------------------------ */

function sanitizeBudgetTier(value: unknown): DestinationCostEstimate["budgetTier"] {
  const s = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (s === "budget" || s === "moderate" || s === "premium") return s;
  return "moderate";
}

function sanitizeCostComparison(value: unknown): DestinationCostEstimate["costComparedToHome"] {
  const s = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (s === "cheaper" || s === "similar" || s === "more-expensive") return s;
  return "similar";
}

function sanitizePositiveNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  return fallback;
}

function sanitizeTips(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((t) => (typeof t === "string" ? t.trim() : ""))
    .filter(Boolean)
    .slice(0, 3);
}

/* ------------------------------------------------------------------ */
/*  Main fetch function                                               */
/* ------------------------------------------------------------------ */

export async function fetchDestinationCosts(
  destination: string,
  homeBase: string
): Promise<DestinationCostEstimate> {
  const key = cacheKey(destination, homeBase);

  // Check cache
  const cached = cache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }

  const apiKey = getAIApiKey();
  if (!apiKey) {
    return buildFallback();
  }

  try {
    const raw = await callAI({
      apiKey,
      prompt: buildCostPrompt(destination, homeBase),
      jsonMode: true,
    });

    const parsed: Record<string, unknown> = JSON.parse(raw);

    const dailyFood = sanitizePositiveNumber(parsed.dailyFood, 20);
    const dailyTransport = sanitizePositiveNumber(parsed.dailyTransport, 8);
    const dailyActivities = sanitizePositiveNumber(parsed.dailyActivities, 12);
    const dailyShopping = sanitizePositiveNumber(parsed.dailyShopping, 5);

    const result: DestinationCostEstimate = {
      dailyFood,
      dailyTransport,
      dailyActivities,
      dailyShopping,
      dailyTotal: sanitizePositiveNumber(
        parsed.dailyTotal,
        dailyFood + dailyTransport + dailyActivities + dailyShopping
      ),
      budgetTier: sanitizeBudgetTier(parsed.budgetTier),
      currencyLocal: sanitizeString(parsed.currencyLocal, "EUR"),
      exchangeRateToEur: sanitizePositiveNumber(parsed.exchangeRateToEur, 1),
      costComparedToHome: sanitizeCostComparison(parsed.costComparedToHome),
      tips: sanitizeTips(parsed.tips),
      isEstimate: false,
    };

    cache.set(key, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });

    return result;
  } catch {
    return buildFallback();
  }
}

/* ------------------------------------------------------------------ */
/*  Formatting helper                                                 */
/* ------------------------------------------------------------------ */

export function formatDailyCostSummary(
  costs: DestinationCostEstimate,
  language: string
): string {
  const tierLabel =
    language === "Bulgarian"
      ? { budget: "бюджетен", moderate: "умерен", premium: "премиум" }[costs.budgetTier]
      : costs.budgetTier;

  const comparisonLabel =
    language === "Bulgarian"
      ? {
          cheaper: "по-евтино от",
          similar: "подобно на",
          "more-expensive": "по-скъпо от",
        }[costs.costComparedToHome]
      : {
          cheaper: "cheaper than",
          similar: "similar to",
          "more-expensive": "more expensive than",
        }[costs.costComparedToHome];

  return `~€${Math.round(costs.dailyTotal)}/day (${tierLabel})`;
}
