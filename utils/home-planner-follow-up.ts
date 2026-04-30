import { callAI, getAIApiKey } from "./ai";
import type { HomeChatMessage, StoredHomePlan } from "./home-chat-storage";
import type { PlannerIntakeSnapshot } from "./home-planner-intake";
import type { DiscoverProfile } from "./trip-recommendations";
import type { AppLanguage } from "./translations";

type PlannerFollowUpResult = {
  assistantText?: string;
  budget?: string;
  days?: string;
  destination?: string;
  notes?: string;
  timing?: string;
  transportPreference?: string;
  travelers?: string;
  tripStyle?: string;
};

export type PlannerFollowUpTurn = {
  assistantText: string;
  snapshot: PlannerIntakeSnapshot;
};

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
      } catch {}
    }

    const firstBraceIndex = trimmedText.indexOf("{");
    const lastBraceIndex = trimmedText.lastIndexOf("}");

    if (firstBraceIndex >= 0 && lastBraceIndex > firstBraceIndex) {
      try {
        return JSON.parse(trimmedText.slice(firstBraceIndex, lastBraceIndex + 1)) as T;
      } catch {
        return null;
      }
    }

    return null;
  }
}

function buildConversationHistory(
  messages: HomeChatMessage[],
  followUpMessages: HomeChatMessage[]
) {
  return [...messages.slice(-8), ...followUpMessages.slice(-10)].map((message) => ({
    content: message.text,
    role: message.role,
  })) satisfies { content: string; role: "assistant" | "user" }[];
}

function summarizePlan(plan: StoredHomePlan) {
  if (!plan) {
    return "No generated plan yet.";
  }

  const transports = plan.plan.transportOptions
    .slice(0, 4)
    .map((option) =>
      [
        option.mode,
        option.provider,
        option.route,
        option.price,
        option.duration,
        option.sourceLabel ? `booking site: ${option.sourceLabel}` : "",
      ]
        .filter(Boolean)
        .join(" | ")
    );
  const stays = plan.plan.stayOptions
    .slice(0, 4)
    .map((stay) =>
      [
        stay.name,
        stay.type,
        stay.area,
        stay.pricePerNight,
        stay.sourceLabel ? `booking site: ${stay.sourceLabel}` : "",
        stay.directBookingUrl ? `hotel site: ${stay.directBookingUrl}` : "",
      ]
        .filter(Boolean)
        .join(" | ")
    );

  return [
    `Title: ${plan.plan.title}`,
    `Destination: ${plan.destination}`,
    `Dates/timing: ${plan.timing}`,
    `Days: ${plan.days}`,
    `Budget: ${plan.budget}`,
    `Travelers: ${plan.travelers}`,
    `Transport preference: ${plan.transportPreference}`,
    `Summary: ${plan.plan.summary}`,
    "Transport options:",
    transports.length > 0 ? transports.map((item) => `- ${item}`).join("\n") : "- none",
    "Stay options:",
    stays.length > 0 ? stays.map((item) => `- ${item}`).join("\n") : "- none",
  ].join("\n");
}

function summarizeProfile(profile: DiscoverProfile) {
  return [
    `Home base: ${profile.personalProfile.homeBase || "Not provided"}`,
    `Travel pace: ${profile.personalProfile.travelPace || "Not provided"}`,
    `Stay style: ${profile.personalProfile.stayStyle || "Not provided"}`,
  ].join("\n");
}

function buildSystemPrompt(language: AppLanguage) {
  return [
    "You are CareTrip's post-plan chat assistant.",
    `Always write in ${getLanguageLabel(language)}.`,
    "The user already has a generated trip plan visible in the app.",
    "Do not regenerate, replace, hide, or remove the plan.",
    "Continue the chat naturally and help the user refine details.",
    "If the user asks whether they can fix details, say yes and ask what they want to change.",
    "If the user requests a specific flight company, hotel, budget, date, or preference, acknowledge it and update the structured fields for the next regeneration.",
    "Tell the user that the current plan stays visible, and that recalculated live prices/options require an explicit 'generate again' request.",
    "Avoid refusal-style ticket price answers. Ticket/fare price requests should be handled by the live offer search.",
    "Do not invent new live prices, availability, booking URLs, or provider facts.",
    "Return JSON only.",
  ].join("\n");
}

function buildPrompt(params: {
  latestPlan: StoredHomePlan;
  latestUserInput: string;
  profile: DiscoverProfile;
  snapshot: PlannerIntakeSnapshot;
}) {
  return [
    "Current structured trip snapshot:",
    JSON.stringify(params.snapshot, null, 2),
    "",
    "Current generated plan:",
    summarizePlan(params.latestPlan),
    "",
    "Traveler profile:",
    summarizeProfile(params.profile),
    "",
    "Latest user input:",
    params.latestUserInput,
    "",
    "Return this exact JSON shape:",
    `{
  "assistantText": "short natural answer",
  "budget": "string",
  "days": "string",
  "destination": "string",
  "timing": "string",
  "travelers": "string",
  "transportPreference": "string",
  "tripStyle": "string",
  "notes": "string"
}`,
    "",
    "Rules:",
    "- Preserve existing fields unless the latest user message clearly changes them.",
    "- Put requested carrier/hotel/date/budget/detail changes into the relevant field or notes.",
    "- assistantText should be conversational, not a plan.",
    "- Do not say you have regenerated anything.",
  ].join("\n");
}

function mergeSnapshot(
  currentSnapshot: PlannerIntakeSnapshot,
  result: PlannerFollowUpResult
) {
  return {
    budget: sanitizeString(result.budget) || currentSnapshot.budget,
    days: sanitizeString(result.days) || currentSnapshot.days,
    destination: sanitizeString(result.destination) || currentSnapshot.destination,
    notes: sanitizeString(result.notes) || currentSnapshot.notes,
    origin: currentSnapshot.origin,
    questionCount: currentSnapshot.questionCount,
    timing: sanitizeString(result.timing) || currentSnapshot.timing,
    transportPreference:
      sanitizeString(result.transportPreference) || currentSnapshot.transportPreference,
    travelers: sanitizeString(result.travelers) || currentSnapshot.travelers,
    tripStyle: sanitizeString(result.tripStyle) || currentSnapshot.tripStyle,
  } satisfies PlannerIntakeSnapshot;
}

function looksLikeGenericEditQuestion(value: string) {
  const normalized = value.trim().toLowerCase();

  return (
    normalized.includes("can i fix") ||
    normalized.includes("can i change") ||
    normalized.includes("може ли") ||
    normalized.includes("мога ли") ||
    normalized.includes("peux-je") ||
    normalized.includes("puedo") ||
    normalized.includes("kann ich")
  );
}

function buildFallbackText(language: AppLanguage, latestUserInput: string) {
  const isQuestion = looksLikeGenericEditQuestion(latestUserInput);

  if (language === "en") {
    return isQuestion
      ? "Yes. Tell me exactly what you want to change and I’ll keep the current plan visible. When you want fresh live options, say “generate again”."
      : "Got it. I’ll keep that as a requested change while the current plan stays visible. Say “generate again” when you want me to rebuild it with fresh live options.";
  }

  if (language === "de") {
    return isQuestion
      ? "Ja. Sag mir genau, was du ändern willst; der aktuelle Plan bleibt sichtbar. Wenn du neue Live-Optionen willst, schreibe „generate again“."
      : "Verstanden. Ich merke das als gewünschte Änderung, der aktuelle Plan bleibt sichtbar. Schreibe „generate again“, wenn ich ihn mit neuen Live-Optionen neu bauen soll.";
  }

  if (language === "es") {
    return isQuestion
      ? "Sí. Dime exactamente qué quieres cambiar y mantendré el plan actual visible. Cuando quieras opciones en vivo nuevas, escribe “generate again”."
      : "Entendido. Lo guardaré como cambio pedido y el plan actual seguirá visible. Escribe “generate again” cuando quieras reconstruirlo con opciones en vivo.";
  }

  if (language === "fr") {
    return isQuestion
      ? "Oui. Dis-moi exactement ce que tu veux changer et je garde le plan actuel visible. Pour de nouvelles options live, écris « generate again »."
      : "Compris. Je garde ça comme changement demandé pendant que le plan actuel reste visible. Écris « generate again » pour le reconstruire avec des options live.";
  }

  return isQuestion
    ? "Да. Кажи ми точно какво искаш да промениш и ще оставя текущия план видим. Когато искаш нови live опции, напиши “generate again”."
    : "Разбрах. Ще го запазя като желана промяна, а текущият план остава видим. Напиши “generate again”, когато искаш да го прегенерирам с нови live опции.";
}

function appendFallbackNote(snapshot: PlannerIntakeSnapshot, latestUserInput: string) {
  if (looksLikeGenericEditQuestion(latestUserInput)) {
    return snapshot;
  }

  const nextNote = `Requested change after plan: ${latestUserInput}`;

  return {
    ...snapshot,
    notes: [snapshot.notes, nextNote].filter(Boolean).join("\n"),
  } satisfies PlannerIntakeSnapshot;
}

export async function runPlannerFollowUpTurn(params: {
  followUpMessages: HomeChatMessage[];
  language?: AppLanguage;
  latestPlan: StoredHomePlan;
  latestUserInput: string;
  messages: HomeChatMessage[];
  profile: DiscoverProfile;
  snapshot: PlannerIntakeSnapshot;
}): Promise<PlannerFollowUpTurn> {
  const language = normalizeLanguage(params.language);
  const apiKey = getAIApiKey();

  if (!apiKey) {
    return {
      assistantText: buildFallbackText(language, params.latestUserInput),
      snapshot: appendFallbackNote(params.snapshot, params.latestUserInput),
    };
  }

  const rawJson = await callAI({
    apiKey,
    conversationHistory: buildConversationHistory(params.messages, params.followUpMessages),
    jsonMode: true,
    prompt: buildPrompt({
      latestPlan: params.latestPlan,
      latestUserInput: params.latestUserInput,
      profile: params.profile,
      snapshot: params.snapshot,
    }),
    systemPrompt: buildSystemPrompt(language),
  });

  const parsedResult = parseJsonObjectFromText<PlannerFollowUpResult>(rawJson);

  if (!parsedResult) {
    return {
      assistantText: buildFallbackText(language, params.latestUserInput),
      snapshot: appendFallbackNote(params.snapshot, params.latestUserInput),
    };
  }

  return {
    assistantText:
      sanitizeString(parsedResult.assistantText) ||
      buildFallbackText(language, params.latestUserInput),
    snapshot: mergeSnapshot(params.snapshot, parsedResult),
  };
}

export function getPlannerFollowUpErrorMessage(language: AppLanguage = "bg") {
  if (language === "en") {
    return "I couldn't continue the plan chat right now. Please send that change again.";
  }

  if (language === "de") {
    return "Ich konnte den Plan-Chat gerade nicht fortsetzen. Bitte sende die Änderung erneut.";
  }

  if (language === "es") {
    return "No pude continuar el chat del plan ahora mismo. Envia ese cambio otra vez.";
  }

  if (language === "fr") {
    return "Je n'ai pas pu continuer le chat du plan pour le moment. Envoie ce changement encore une fois.";
  }

  return "Не успях да продължа чата по плана в момента. Изпрати промяната още веднъж.";
}
