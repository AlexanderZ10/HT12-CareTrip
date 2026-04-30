import { getAIApiKey, callAI } from "./ai";
import { hasExplicitCurrency } from "./currency";
import type { HomeChatMessage } from "./home-chat-storage";
import type { DiscoverProfile } from "./trip-recommendations";
import type { AppLanguage } from "./translations";

export type PlannerIntakeSnapshot = {
  budget: string;
  days: string;
  destination: string;
  notes: string;
  origin: string;
  questionCount: number;
  timing: string;
  transportPreference: string;
  travelers: string;
  tripStyle: string;
};

type PlannerIntakeField =
  | "budget"
  | "days"
  | "destination"
  | "notes"
  | "origin"
  | "timing"
  | "transportPreference"
  | "travelers"
  | "tripStyle";

type PlannerIntakeResult = {
  budget?: string;
  days?: string;
  destination?: string;
  missingFields?: string[];
  nextQuestion?: string;
  notes?: string;
  origin?: string;
  questionCount?: number;
  readyToGenerate?: boolean;
  timing?: string;
  transportPreference?: string;
  travelers?: string;
  tripStyle?: string;
};

export type PlannerIntakeTurn = {
  nextQuestion: string;
  questionCount: number;
  readyToGenerate: boolean;
  snapshot: PlannerIntakeSnapshot;
};

const REQUIRED_FIELDS: PlannerIntakeField[] = [
  "origin",
  "destination",
  "timing",
  "days",
  "travelers",
  "transportPreference",
  "budget",
];

function normalizeLanguage(language?: AppLanguage) {
  if (language === "en" || language === "de" || language === "es" || language === "fr") {
    return language;
  }

  return "bg" as const;
}

function getLanguageLabel(language: AppLanguage) {
  if (language === "en") return "English";
  if (language === "de") return "German";
  if (language === "es") return "Spanish";
  if (language === "fr") return "French";
  return "Bulgarian";
}

function sanitizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseJsonObjectFromText<T>(rawText: string): T | null {
  const trimmedText = rawText.trim();

  if (!trimmedText) {
    return null;
  }

  try {
    return JSON.parse(trimmedText) as T;
  } catch {
    const fencedMatch = trimmedText.match(/```(?:json)?\s*([\s\S]*?)```/i);

    if (fencedMatch?.[1]) {
      try {
        return JSON.parse(fencedMatch[1].trim()) as T;
      } catch {
        // Continue to brace extraction below.
      }
    }

    const firstBraceIndex = trimmedText.indexOf("{");
    const lastBraceIndex = trimmedText.lastIndexOf("}");

    if (firstBraceIndex >= 0 && lastBraceIndex > firstBraceIndex) {
      try {
        return JSON.parse(
          trimmedText.slice(firstBraceIndex, lastBraceIndex + 1)
        ) as T;
      } catch {
        return null;
      }
    }

    return null;
  }
}

function parseQuestionCount(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }

  if (typeof value === "string" && value.trim()) {
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? Math.max(0, Math.round(parsedValue)) : fallback;
  }

  return fallback;
}

function summarizeProfile(profile: DiscoverProfile) {
  const interests = [
    ...profile.interests.selectedOptions,
    profile.interests.note,
  ]
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);
  const assistance = [
    ...profile.assistance.selectedOptions,
    profile.assistance.note,
  ]
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);
  const skills = [
    ...profile.skills.selectedOptions,
    profile.skills.note,
  ]
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);

  return [
    `City and country: ${profile.personalProfile.homeBase || "Not provided"}`,
    `Bio: ${profile.personalProfile.aboutMe || "Not provided"}`,
    `Travel interests: ${interests.join(", ") || "Not provided"}`,
    `Accessibility / assistance needs: ${assistance.join(", ") || "Not provided"}`,
    `Skills / ways to help while traveling: ${skills.join(", ") || "Not provided"}`,
  ].join("\n");
}

function buildConversationHistory(messages: HomeChatMessage[]) {
  return messages.slice(-12).map((message) => ({
    content: message.text,
    role: message.role,
  })) satisfies { content: string; role: "assistant" | "user" }[];
}

function hasNumber(value: string) {
  return /\d/.test(value);
}

function hasIncompleteNumericBudget(value: string) {
  return hasNumber(value) && !hasExplicitCurrency(value);
}

function resolveProfileOrigin(profile: DiscoverProfile) {
  return sanitizeString(profile.personalProfile.homeBase);
}

function isCurrentOriginLabel(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");

  return (
    normalized === "current" ||
    normalized === "current location" ||
    normalized === "current city" ||
    normalized === "present location" ||
    normalized === "profile location" ||
    normalized === "use current" ||
    normalized === "настояща" ||
    normalized === "настоящото" ||
    normalized === "текуща" ||
    normalized === "текущото" ||
    normalized === "сегашната" ||
    normalized === "сегашното" ||
    normalized === "от профила" ||
    normalized === "настоящата от профила" ||
    normalized === "текущата от профила"
  );
}

function budgetCurrencyQuestion(language: AppLanguage) {
  if (language === "en") {
    return "Which currency is that budget in: EUR, BGN, USD, or another one?";
  }

  if (language === "de") {
    return "In welcher Währung ist dieses Budget: EUR, BGN, USD oder eine andere?";
  }

  if (language === "es") {
    return "¿En qué moneda está ese presupuesto: EUR, BGN, USD u otra?";
  }

  if (language === "fr") {
    return "Dans quelle devise est ce budget : EUR, BGN, USD ou une autre ?";
  }

  return "В каква валута е този бюджет: EUR, BGN, USD или друга?";
}

function fallbackQuestion(
  language: AppLanguage,
  missingFields: PlannerIntakeField[],
  snapshot?: PlannerIntakeSnapshot,
  profile?: DiscoverProfile
) {
  if (missingFields[0] === "budget" && snapshot && hasIncompleteNumericBudget(snapshot.budget)) {
    return budgetCurrencyQuestion(language);
  }

  if (missingFields[0] === "origin") {
    const profileOrigin = profile ? resolveProfileOrigin(profile) : "";

    if (language === "en") {
      return profileOrigin
        ? `Where are you starting from? If you want, I can use your current profile location: ${profileOrigin}.`
        : "Where are you starting from?";
    }

    return profileOrigin
      ? `От къде тръгваш? Ако искаш, мога да ползвам настоящата точка от профила ти: ${profileOrigin}.`
      : "От къде тръгваш?";
  }

  const fallbackCopy = {
    bg: {
      budget: "Какъв е общият ти бюджет за пътуването?",
      days: "За колко дни искаш да е пътуването?",
      destination: "Коя е точната дестинация?",
      notes: "Има ли нещо важно, което искаш задължително да включа?",
      timing: "Кога искаш да пътуваш?",
      transportPreference: "Какъв транспорт предпочиташ?",
      travelers: "Колко човека ще пътуват?",
      tripStyle: "Какъв да е вайбът на пътуването: chill, food, culture, nightlife, nature?",
    },
    en: {
      budget: "What is your total trip budget?",
      days: "How many days should the trip be?",
      destination: "What is the exact destination?",
      notes: "Is there anything important I should definitely include?",
      origin: "Where are you starting from?",
      timing: "When do you want to travel?",
      transportPreference: "What transport do you prefer?",
      travelers: "How many people are traveling?",
      tripStyle: "What vibe should the trip have: chill, food, culture, nightlife, nature?",
    },
    de: {
      budget: "Wie hoch ist dein Gesamtbudget fur die Reise?",
      days: "Wie viele Tage soll die Reise dauern?",
      destination: "Was ist das genaue Reiseziel?",
      notes: "Gibt es etwas Wichtiges, das ich unbedingt einplanen soll?",
      origin: "Wo startest du?",
      timing: "Wann mochtest du reisen?",
      transportPreference: "Welchen Transport bevorzugst du?",
      travelers: "Wie viele Personen reisen?",
      tripStyle: "Welchen Vibe soll die Reise haben: entspannt, Food, Kultur, Nightlife, Natur?",
    },
    es: {
      budget: "Cual es tu presupuesto total para el viaje?",
      days: "Cuantos dias debe durar el viaje?",
      destination: "Cual es el destino exacto?",
      notes: "Hay algo importante que deba incluir si o si?",
      origin: "Desde dónde sales?",
      timing: "Cuando quieres viajar?",
      transportPreference: "Que transporte prefieres?",
      travelers: "Cuantas personas viajaran?",
      tripStyle: "Que vibe quieres para el viaje: chill, food, cultura, nightlife, naturaleza?",
    },
    fr: {
      budget: "Quel est ton budget total pour le voyage ?",
      days: "Combien de jours doit durer le voyage ?",
      destination: "Quelle est la destination exacte ?",
      notes: "Y a-t-il quelque chose d'important que je dois absolument inclure ?",
      origin: "D'où pars-tu ?",
      timing: "Quand veux-tu voyager ?",
      transportPreference: "Quel transport preferes-tu ?",
      travelers: "Combien de personnes voyagent ?",
      tripStyle: "Quelle ambiance veux-tu pour le voyage : chill, food, culture, nightlife, nature ?",
    },
  } as const;

  const copy = fallbackCopy[language] as Record<string, string>;
  return copy[missingFields[0] ?? "destination"] ?? copy.destination;
}

function parseMissingFields(value: unknown): PlannerIntakeField[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => sanitizeString(item))
    .filter(
      (item): item is PlannerIntakeField =>
        item === "budget" ||
        item === "days" ||
        item === "destination" ||
        item === "notes" ||
        item === "origin" ||
        item === "timing" ||
        item === "transportPreference" ||
        item === "travelers" ||
        item === "tripStyle"
    );
}

function normalizeIntentText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isOfferGenerationIntent(value: string) {
  const normalized = normalizeIntentText(value);

  return (
    normalized === "da" ||
    normalized === "yes" ||
    normalized === "ok" ||
    normalized === "okay" ||
    normalized === "generate" ||
    normalized.includes("oferta") ||
    normalized.includes("offer") ||
    normalized.includes("generate") ||
    normalized.includes("genери") ||
    normalized.includes("дай оферта") ||
    normalized.includes("дай ми оферта") ||
    normalized.includes("искам оферта") ||
    normalized.includes("napravi mi oferta") ||
    normalized.includes("vsushtnost mi dai oferta") ||
    normalized.includes("vsyshtnost mi dai oferta")
  );
}

function shouldKeepTripStyle(
  currentSnapshot: PlannerIntakeSnapshot,
  result: PlannerIntakeResult,
  latestUserInput: string
) {
  const proposedTripStyle = sanitizeString(result.tripStyle);

  if (!proposedTripStyle) {
    return currentSnapshot.tripStyle;
  }

  if (currentSnapshot.tripStyle.trim()) {
    return proposedTripStyle;
  }

  if (isOfferGenerationIntent(latestUserInput)) {
    return "";
  }

  return proposedTripStyle;
}

function mergeSnapshot(
  currentSnapshot: PlannerIntakeSnapshot,
  result: PlannerIntakeResult,
  language: AppLanguage,
  profile: DiscoverProfile,
  latestUserInput: string
) {
  const nextBudget = sanitizeString(result.budget) || currentSnapshot.budget;
  const combinedBudget =
    hasIncompleteNumericBudget(currentSnapshot.budget) &&
    hasExplicitCurrency(nextBudget) &&
    !hasNumber(nextBudget)
      ? `${currentSnapshot.budget} ${nextBudget}`
      : nextBudget;
  const rawOrigin = sanitizeString(result.origin) || currentSnapshot.origin;
  const nextOrigin =
    rawOrigin && isCurrentOriginLabel(rawOrigin) ? resolveProfileOrigin(profile) : rawOrigin;

  return {
    budget: combinedBudget,
    days: sanitizeString(result.days) || currentSnapshot.days,
    destination: sanitizeString(result.destination) || currentSnapshot.destination,
    notes: sanitizeString(result.notes) || currentSnapshot.notes,
    origin: nextOrigin,
    questionCount: parseQuestionCount(result.questionCount, currentSnapshot.questionCount),
    timing: sanitizeString(result.timing) || currentSnapshot.timing,
    transportPreference:
      sanitizeString(result.transportPreference) || currentSnapshot.transportPreference,
    travelers: sanitizeString(result.travelers) || currentSnapshot.travelers,
    tripStyle: shouldKeepTripStyle(currentSnapshot, result, latestUserInput),
  } satisfies PlannerIntakeSnapshot;
}

function getMissingRequiredFields(snapshot: PlannerIntakeSnapshot) {
  return REQUIRED_FIELDS.filter((field) => {
    if (!snapshot[field].trim()) {
      return true;
    }

    return field === "budget" && hasIncompleteNumericBudget(snapshot.budget);
  });
}

function buildSystemPrompt(language: AppLanguage) {
  return [
    "You are the CareTrip AI planner intake orchestrator.",
    `Always write in ${getLanguageLabel(language)}.`,
    "Your job is to collect enough information to generate a real travel plan with live transport and stay options.",
    "Ask at most 7 assistant questions in total.",
    "Ask only one focused question at a time, unless you are at question 6 and still missing multiple required fields, then ask one compact final question covering all remaining required items.",
    "Extract any details the user already gave, even if they answered several fields in one message.",
    "Keep questions short, natural, and practical.",
    "Do not ask for information that is already present in the profile unless it is directly needed for the trip.",
    "The user can correct any earlier answer at any time, even if you are currently asking about another field.",
    "When the latest message changes an older answer, always overwrite the old snapshot value with the new one.",
    "Use the profile City and country as the default trip origin for ticket search. If it is missing, ask where the user starts from.",
    "Always capture the trip origin as its own field named origin.",
    "Only set origin to the profile City and country when the user makes an explicit STATEMENT of intent like 'use my current location', 'use the profile location', 'настоящата', 'текущата', 'сегашната' on its own, or 'use it'. A bare standalone keyword from this list counts as a statement.",
    "If the user asks a QUESTION about their profile location (for example: 'what is my current location?', 'where am I from?', 'коя ми е сегашната точка', 'каква е настоящата ми точка', 'where is my profile location'), DO NOT set the origin. Leave origin empty, keep readyToGenerate false, and in nextQuestion answer their question by stating the profile City and country, then ask whether they want to use it as the trip origin.",
    "Treat any user message that ends with a question mark, or starts with question words like what/where/which/коя/какво/къде/каква, as a question — never treat it as a statement that sets a field.",
    "Use the profile bio as extra personalization for useful on-trip suggestions, not as a required booking field.",
    "If the user wants flights from a city without an airport, plan for a transfer to the nearest practical airport or transport hub before the flight.",
    "A numeric budget without an explicit currency is incomplete. If the user writes only a number like 1000, store budget as that number, keep budget missing, and ask which currency it is in.",
    "If the user writes a number plus currency like 1000 EUR, 1000 BGN, 1000 USD, $1000, or 1000 лв, budget is complete.",
    "Required fields: origin, destination, timing, days, travelers, transportPreference, budget.",
    "Always ask about the required fields in this exact priority order, asking only for the first one still missing: origin, then destination, then timing, then days, then travelers, then transportPreference, then budget.",
    "Your very first question must be about origin if it is missing. Your second question must be about destination if it is missing. Do not jump ahead to later fields while origin or destination are still missing.",
    "Optional fields: tripStyle, notes.",
    "If all required fields are clear, set readyToGenerate to true and leave nextQuestion empty.",
    "Return JSON only.",
  ].join("\n");
}

function buildPrompt(params: {
  language: AppLanguage;
  latestUserInput: string;
  profile: DiscoverProfile;
  snapshot: PlannerIntakeSnapshot;
}) {
  return [
    "Current structured trip snapshot:",
    JSON.stringify(params.snapshot, null, 2),
    "",
    "Travel preferences from the user's profile:",
    summarizeProfile(params.profile),
    "",
    "Latest user input:",
    params.latestUserInput,
    "",
    "Return a JSON object with this exact shape:",
    `{
  "budget": "string",
  "days": "string",
  "destination": "string",
  "timing": "string",
  "origin": "string",
  "travelers": "string",
  "transportPreference": "string",
  "tripStyle": "string",
  "notes": "string",
  "missingFields": ["destination", "timing"],
  "nextQuestion": "string",
  "questionCount": 3,
  "readyToGenerate": false
}`,
    "",
    "Rules:",
    "- Keep field values concise and user-friendly.",
    "- Preserve already known values unless the latest message clearly corrects them.",
    "- If the user gives a correction, replace the older field value.",
    "- A correction can target any earlier field, not only the field from your last question.",
    "- Treat phrases like 'actually', 'instead', 'change it to', 'no, make it', 'всъщност', 'нека е', 'смени го на', and 'не, а' as strong correction signals.",
    "- For budget, preserve the currency if the user gives one. Do not assume EUR for a bare number.",
    "- If the current budget is a number without currency and the latest user input is only a currency, combine them into one budget value.",
    "- Store the trip starting point in origin.",
    "- If the user says to use the current/profile location, set origin to the profile City and country.",
    "- Never infer tripStyle or notes from short generation commands like 'generate', 'offer', 'дай оферта', 'искам оферта', or similar intent-only messages.",
    "- questionCount should represent how many assistant intake questions have been asked after this turn.",
    "- Do not exceed 7.",
    "- If enough information is available, set readyToGenerate to true.",
    "- If readyToGenerate is true, nextQuestion must be an empty string.",
    "",
    "Correction examples:",
    '- Snapshot days is "3". User says "Всъщност 5 дни" -> set days to "5".',
    '- Snapshot destination is "Rome". User says "Change it to Madrid" -> set destination to "Madrid".',
    '- Snapshot budget is "1000 EUR". User says "No, make it 1200 USD" -> set budget to "1200 USD".',
  ].join("\n");
}

export async function runPlannerIntakeTurn(params: {
  language?: AppLanguage;
  latestUserInput: string;
  messages: HomeChatMessage[];
  profile: DiscoverProfile;
  snapshot: PlannerIntakeSnapshot;
}): Promise<PlannerIntakeTurn> {
  const language = normalizeLanguage(params.language);
  const apiKey = getAIApiKey();

  if (!apiKey) {
    const missingFields = getMissingRequiredFields(params.snapshot);

    return {
      nextQuestion: fallbackQuestion(language, missingFields, params.snapshot, params.profile),
      questionCount: Math.min(params.snapshot.questionCount + 1, 7),
      readyToGenerate: missingFields.length === 0,
      snapshot: params.snapshot,
    };
  }

  const rawJson = await callAI({
    apiKey,
    conversationHistory: buildConversationHistory(params.messages),
    jsonMode: true,
    prompt: buildPrompt({
      language,
      latestUserInput: params.latestUserInput,
      profile: params.profile,
      snapshot: params.snapshot,
    }),
    systemPrompt: buildSystemPrompt(language),
  });

  const parsedResult = parseJsonObjectFromText<PlannerIntakeResult>(rawJson);

  if (!parsedResult) {
    const missingFields = getMissingRequiredFields(params.snapshot);

    return {
      nextQuestion: fallbackQuestion(language, missingFields, params.snapshot, params.profile),
      questionCount: Math.min(params.snapshot.questionCount + 1, 7),
      readyToGenerate: missingFields.length === 0,
      snapshot: params.snapshot,
    };
  }

  const mergedSnapshot = mergeSnapshot(
    params.snapshot,
    parsedResult,
    language,
    params.profile,
    params.latestUserInput
  );
  const missingRequiredFields = getMissingRequiredFields(mergedSnapshot);
  const aiMissingFields = parseMissingFields(parsedResult.missingFields);
  const nextQuestionCount = Math.min(
    Math.max(mergedSnapshot.questionCount, params.snapshot.questionCount),
    7
  );
  const readyToGenerate =
    parsedResult.readyToGenerate === true && missingRequiredFields.length === 0;
  const fallbackNextQuestion = fallbackQuestion(
    language,
    missingRequiredFields.length > 0 ? missingRequiredFields : aiMissingFields,
    mergedSnapshot,
    params.profile
  );
  const nextQuestion =
    !readyToGenerate && nextQuestionCount >= 7 && missingRequiredFields.length > 0
      ? fallbackNextQuestion
      : sanitizeString(parsedResult.nextQuestion) || (!readyToGenerate ? fallbackNextQuestion : "");

  return {
    nextQuestion,
    questionCount:
      !readyToGenerate && nextQuestion
        ? Math.min(Math.max(nextQuestionCount, params.snapshot.questionCount + 1), 7)
        : nextQuestionCount,
    readyToGenerate,
    snapshot: {
      ...mergedSnapshot,
      questionCount:
        !readyToGenerate && nextQuestion
          ? Math.min(Math.max(nextQuestionCount, params.snapshot.questionCount + 1), 7)
          : nextQuestionCount,
    },
  };
}

export function getPlannerIntakeErrorMessage(language: AppLanguage = "bg") {
  if (language === "en") {
    return "I couldn't continue the planner chat right now. Please send your answer again.";
  }

  if (language === "de") {
    return "Ich konnte den Planner-Chat gerade nicht fortsetzen. Bitte sende deine Antwort erneut.";
  }

  if (language === "es") {
    return "No pude continuar el chat del planner ahora mismo. Envia tu respuesta otra vez.";
  }

  if (language === "fr") {
    return "Je n'ai pas pu continuer le chat du planner pour le moment. Envoie ta reponse encore une fois.";
  }

  return "Не успях да продължа planner чата в момента. Изпрати отговора си още веднъж.";
}
