import * as Linking from "expo-linking";

import type { AppLanguage } from "../../utils/translations";
import { normalizeBudgetToEuro } from "../../utils/currency";
import {
  formatGroundedTravelPlan,
  type PlannerTransportOption,
} from "../../utils/home-travel-planner";
import { getHomeSavedSourceKey } from "../../utils/saved-trips";
import type { DiscoverProfile } from "../../utils/trip-recommendations";
import type { HomePlannerStep, StoredHomePlan } from "../../utils/home-chat-storage";
import {
  GROUND_DESTINATIONS,
  HIGH_BUDGET_DESTINATIONS,
  LOW_BUDGET_DESTINATIONS,
  MID_BUDGET_DESTINATIONS,
  ROAD_TRIP_DESTINATIONS,
} from "./constants";

function getHomeCopy(language: AppLanguage) {
  if (language === "en") {
    return {
      autoChatPrefix: "New chat",
      budget: "Budget",
      budgetFallback: "No fixed limit",
      currentChat: "Latest chat",
      daysFallback: "5 days",
      daysQuestion: (budget: string) =>
        `Perfect. We are planning within ${budget}. How many days should the trip be?`,
      destinationFromDream: (travelers: string, timing: string, dreamDestination: string) =>
        `Nice. For ${travelers} ${timing.toLowerCase()}, tell me the destination. If you want, we can start from ${dreamDestination}.`,
      destinationGeneric: (travelers: string, timing: string) =>
        `Nice. For ${travelers} ${timing.toLowerCase()}, tell me your dream destination and I will prepare a concrete route.`,
      duration: "Duration",
      generate: "Suggestions",
      initialAssistant: (profileName: string) =>
        `Hi, ${profileName}! I am your travel assistant. Tell me about the trip you dream about. Where do you want to go?`,
      planning: "Planning",
      timingFallback: "Flexible",
      timing: "When",
      timingQuestion: (transportPreference: string) =>
        `Great. I will mainly search for options with ${transportPreference.toLowerCase()}. When do you want to travel?`,
      transportFallback: "Any transport",
      transport: "Transport",
      transportQuestion: (travelers: string) =>
        `Got it. You are traveling as ${travelers}. What transport do you prefer?`,
      travelersFallback: "2 people",
      travelers: "How many people",
      travelersQuestion: (days: string) =>
        `Sounds good. We are planning ${days}. How many people are traveling in total?`,
    } as const;
  }

  if (language === "de") {
    return {
      autoChatPrefix: "Neuer Chat",
      budget: "Budget",
      budgetFallback: "Kein festes Limit",
      currentChat: "Letzter Chat",
      daysFallback: "5 Tage",
      daysQuestion: (budget: string) =>
        `Super. Wir planen innerhalb von ${budget}. Wie viele Tage soll die Reise dauern?`,
      destinationFromDream: (travelers: string, timing: string, dreamDestination: string) =>
        `Perfekt. F\u00FCr ${travelers} ${timing.toLowerCase()} nenne mir das Ziel. Wenn du willst, starten wir mit ${dreamDestination}.`,
      destinationGeneric: (travelers: string, timing: string) =>
        `Perfekt. F\u00FCr ${travelers} ${timing.toLowerCase()} nenne mir dein Wunschziel und ich bereite eine konkrete Route vor.`,
      duration: "Dauer",
      generate: "Vorschl\u00E4ge",
      initialAssistant: (profileName: string) =>
        `Hallo, ${profileName}! Ich bin dein Reiseassistent. Erz\u00E4hl mir von der Reise, von der du tr\u00E4umst. Wohin m\u00F6chtest du fahren?`,
      planning: "Planung",
      timingFallback: "Flexibel",
      timing: "Wann",
      timingQuestion: (transportPreference: string) =>
        `Super. Ich suche vor allem nach Optionen mit ${transportPreference.toLowerCase()}. Wann m\u00F6chtet ihr reisen?`,
      transportFallback: "Beliebig",
      transport: "Transport",
      transportQuestion: (travelers: string) =>
        `Verstanden. Ihr reist zu ${travelers}. Welches Verkehrsmittel bevorzugt ihr?`,
      travelersFallback: "2 Personen",
      travelers: "Wie viele Personen",
      travelersQuestion: (days: string) =>
        `Klingt gut. Wir planen ${days}. Wie viele Personen reisen insgesamt?`,
    } as const;
  }

  if (language === "es") {
    return {
      autoChatPrefix: "Nuevo chat",
      budget: "Presupuesto",
      budgetFallback: "Sin límite fijo",
      currentChat: "\u00DAltimo chat",
      daysFallback: "5 días",
      daysQuestion: (budget: string) =>
        `Perfecto. Estamos planeando dentro de ${budget}. \u00BFCu\u00E1ntos d\u00EDas quieres que dure el viaje?`,
      destinationFromDream: (travelers: string, timing: string, dreamDestination: string) =>
        `Genial. Para ${travelers} ${timing.toLowerCase()}, dime el destino. Si quieres, podemos empezar con ${dreamDestination}.`,
      destinationGeneric: (travelers: string, timing: string) =>
        `Genial. Para ${travelers} ${timing.toLowerCase()}, dime el destino deseado y preparar\u00E9 una ruta concreta.`,
      duration: "Duraci\u00F3n",
      generate: "Sugerencias",
      initialAssistant: (profileName: string) =>
        `Hola, ${profileName}. Soy tu asistente de viajes. Cu\u00E9ntame sobre el viaje con el que sue\u00F1as. \u00BAd\u00F3nde quieres ir?`,
      planning: "Planificaci\u00F3n",
      timingFallback: "Flexible",
      timing: "Cu\u00E1ndo",
      timingQuestion: (transportPreference: string) =>
        `Perfecto. Buscar\u00E9 sobre todo opciones con ${transportPreference.toLowerCase()}. \u00BFCu\u00E1ndo quieres viajar?`,
      transportFallback: "Sin preferencia",
      transport: "Transporte",
      transportQuestion: (travelers: string) =>
        `Entendido. Viajan ${travelers}. \u00BFQu\u00E9 transporte prefieren?`,
      travelersFallback: "2 personas",
      travelers: "Cu\u00E1ntas personas",
      travelersQuestion: (days: string) =>
        `Muy bien. Estamos planeando ${days}. \u00BFCu\u00E1ntas personas viajan en total?`,
    } as const;
  }

  if (language === "fr") {
    return {
      autoChatPrefix: "Nouveau chat",
      budget: "Budget",
      budgetFallback: "Sans limite fixe",
      currentChat: "Dernier chat",
      daysFallback: "5 jours",
      daysQuestion: (budget: string) =>
        `Parfait. On planifie dans la limite de ${budget}. Combien de jours doit durer le voyage ?`,
      destinationFromDream: (travelers: string, timing: string, dreamDestination: string) =>
        `Super. Pour ${travelers} ${timing.toLowerCase()}, dis-moi la destination. Si tu veux, on peut partir de ${dreamDestination}.`,
      destinationGeneric: (travelers: string, timing: string) =>
        `Super. Pour ${travelers} ${timing.toLowerCase()}, dis-moi la destination souhait\u00E9e et je pr\u00E9parerai un itin\u00E9raire concret.`,
      duration: "Dur\u00E9e",
      generate: "Suggestions",
      initialAssistant: (profileName: string) =>
        `Salut, ${profileName} ! Je suis ton assistant voyage. Parle-moi du voyage dont tu r\u00EAves. O\u00F9 veux-tu aller ?`,
      planning: "Planification",
      timingFallback: "Flexible",
      timing: "Quand",
      timingQuestion: (transportPreference: string) =>
        `Parfait. Je vais surtout chercher des options avec ${transportPreference.toLowerCase()}. Quand voulez-vous voyager ?`,
      transportFallback: "Sans préférence",
      transport: "Transport",
      transportQuestion: (travelers: string) =>
        `Compris. Vous voyagez \u00E0 ${travelers}. Quel transport pr\u00E9f\u00E9rez-vous ?`,
      travelersFallback: "2 personnes",
      travelers: "Combien de personnes",
      travelersQuestion: (days: string) =>
        `Parfait. On planifie ${days}. Combien de personnes voyagent au total ?`,
    } as const;
  }

  return {
    autoChatPrefix: "Нов чат",
    budget: "Бюджет",
    budgetFallback: "Без фиксиран лимит",
    currentChat: "Последен чат",
    daysFallback: "5 дни",
    daysQuestion: (budget: string) =>
      `Супер. Планираме в рамките на ${budget}. За колко дни да е пътуването?`,
    destinationFromDream: (travelers: string, timing: string, dreamDestination: string) =>
      `Чудесно. За ${travelers} ${timing.toLowerCase()} кажи ми дестинация. Ако искаш, можем да стъпим на ${dreamDestination}.`,
    destinationGeneric: (travelers: string, timing: string) =>
      `Чудесно. За ${travelers} ${timing.toLowerCase()} кажи ми желаната дестинация и ще подготвя конкретен маршрут.`,
    duration: "Продължителност",
    generate: "Предложения",
    initialAssistant: (profileName: string) =>
      `Здравей, ${profileName}! Аз съм твоят travel асистент. Разкажи ми за пътуването, за което мечтаеш – накъде искаш да отидеш?`,
    planning: "Планиране",
    timingFallback: "Гъвкаво",
    timing: "Кога",
    timingQuestion: (transportPreference: string) =>
      `Супер. Ще търся варианти основно с ${transportPreference.toLowerCase()}. Кога искате да е пътуването?`,
    transportFallback: "Без значение",
    transport: "Транспорт",
    transportQuestion: (travelers: string) =>
      `Разбрах. Пътувате ${travelers}. Какъв транспорт предпочитате?`,
    travelersFallback: "2 човека",
    travelers: "Колко човека",
    travelersQuestion: (days: string) =>
      `Чудесно. Планираме ${days}. Колко човека ще пътуват общо?`,
  } as const;
}

export function buildInitialAssistantMessage(
  profileName: string,
  language: AppLanguage = "bg"
) {
  return getHomeCopy(language).initialAssistant(profileName);
}

export function buildDaysQuestion(budget: string, language: AppLanguage = "bg") {
  return getHomeCopy(language).daysQuestion(budget);
}

export function buildTravelersQuestion(days: string, language: AppLanguage = "bg") {
  return getHomeCopy(language).travelersQuestion(days);
}

export function buildTransportQuestion(
  travelers: string,
  language: AppLanguage = "bg"
) {
  return getHomeCopy(language).transportQuestion(travelers);
}

export function buildTimingQuestion(
  transportPreference: string,
  language: AppLanguage = "bg"
) {
  return getHomeCopy(language).timingQuestion(transportPreference);
}

export function buildDestinationQuestion(
  profile: DiscoverProfile,
  timing: string,
  travelers: string,
  language: AppLanguage = "bg"
) {
  const copy = getHomeCopy(language);
  const dreamDestination = profile.personalProfile.dreamDestinations
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)[0];

  if (dreamDestination) {
    return copy.destinationFromDream(travelers, timing, dreamDestination);
  }

  return copy.destinationGeneric(travelers, timing);
}

export function normalizeDaysLabel(value: string) {
  const trimmedValue = value.trim();
  const match = trimmedValue.match(/\d+/);

  if (!match) {
    return trimmedValue;
  }

  const dayCount = Number(match[0]);

  if (!Number.isFinite(dayCount) || dayCount <= 0) {
    return trimmedValue;
  }

  return `${dayCount} дни`;
}

export function normalizeTravelersLabel(value: string) {
  const trimmedValue = value.trim();
  const match = trimmedValue.match(/\d+/);

  if (!match) {
    return trimmedValue;
  }

  const count = Number(match[0]);

  if (!Number.isFinite(count) || count <= 0) {
    return trimmedValue;
  }

  if (count === 1) {
    return "1 човек";
  }

  return `${count} човека`;
}

export function extractBudgetCap(value: string) {
  const matches = value.match(/\d+(?:[.,]\d+)?/g);

  if (!matches) {
    return null;
  }

  const numbers = matches
    .map((item) => Number(item.replace(",", ".")))
    .filter((item) => Number.isFinite(item));

  if (numbers.length === 0) {
    return null;
  }

  return Math.max(...numbers);
}

export function getDestinationSuggestions(
  profile: DiscoverProfile | null,
  budget: string,
  transportPreference: string
) {
  const homeBase = profile?.personalProfile.homeBase.toLowerCase() ?? "";
  const dreamDestinations = profile?.personalProfile.dreamDestinations
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean) ?? [];

  const budgetCap = extractBudgetCap(normalizeBudgetToEuro(budget));
  const normalizedTransport = transportPreference.toLowerCase();
  let baseSuggestions = HIGH_BUDGET_DESTINATIONS;

  if (
    normalizedTransport.includes("автобус") ||
    normalizedTransport.includes("влак")
  ) {
    baseSuggestions = GROUND_DESTINATIONS;
  } else if (
    normalizedTransport.includes("спод") ||
    normalizedTransport.includes("кола")
  ) {
    baseSuggestions = ROAD_TRIP_DESTINATIONS;
  } else if (budgetCap !== null && budgetCap <= 500) {
    baseSuggestions = LOW_BUDGET_DESTINATIONS;
  } else if (budgetCap !== null && budgetCap <= 1300) {
    baseSuggestions = MID_BUDGET_DESTINATIONS;
  }

  const regionSuggestion =
    homeBase.includes("соф")
      ? ["Истанбул"]
      : homeBase.includes("варн")
        ? ["Букурещ"]
        : homeBase.includes("пловдив")
          ? ["Солун"]
          : [];

  return [...dreamDestinations, ...regionSuggestion, ...baseSuggestions]
    .filter((item, index, array) => item && array.indexOf(item) === index)
    .slice(0, 4);
}

export function getTransportIconName(option: PlannerTransportOption) {
  const mode = option.mode.toLowerCase();

  if (mode.includes("автобус") || mode.includes("bus")) {
    return "directions-bus";
  }

  if (mode.includes("rideshare") || mode.includes("спод") || mode.includes("car")) {
    return "emoji-transportation";
  }

  if (mode.includes("train") || mode.includes("влак")) {
    return "train";
  }

  if (mode.includes("flight") || mode.includes("полет")) {
    return "flight";
  }

  return "route";
}

export function getPaymentMethodIcon(method: string) {
  if (method.includes("Apple")) {
    return "phone-iphone";
  }

  if (method.includes("Google")) {
    return "android";
  }

  return "credit-card";
}

export function getPaymentMethodDisplayLabel(method: string) {
  if (method.includes("Apple")) {
    return "Apple Pay";
  }

  if (method.includes("Google")) {
    return "Google Pay";
  }

  return "Visa •••• 4242";
}

export function formatCheckoutReference(value: string) {
  const compactValue = value
    .replace(/^pi_/, "")
    .replace(/^local_/, "")
    .replace(/^fallback_/, "")
    .replace(/^mock_/, "")
    .replace(/_secret.*$/, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(-10)
    .toUpperCase();

  return `BK-${compactValue || "2475A1F9"}`;
}

export function parseCheckoutReturnState(url: string) {
  const parsedUrl = Linking.parse(url);
  const rawCheckoutValue = parsedUrl.queryParams?.checkout;
  const rawSessionIdValue = parsedUrl.queryParams?.session_id;

  return {
    checkout:
      typeof rawCheckoutValue === "string"
        ? rawCheckoutValue
        : Array.isArray(rawCheckoutValue)
          ? rawCheckoutValue[0] ?? ""
          : "",
    sessionId:
      typeof rawSessionIdValue === "string"
        ? rawSessionIdValue
        : Array.isArray(rawSessionIdValue)
          ? rawSessionIdValue[0] ?? ""
          : "",
  };
}

export function normalizeLatestPlan(plan: StoredHomePlan): StoredHomePlan {
  if (!plan) {
    return null;
  }

  const formattedPlanText = plan.formattedPlanText || formatGroundedTravelPlan(plan.plan);

  return {
    ...plan,
    formattedPlanText,
    sourceKey:
      plan.sourceKey ||
      getHomeSavedSourceKey({
        budget: plan.budget,
        days: plan.days,
        destination: plan.destination,
        formattedPlanText,
      }),
  };
}

export function getStepTitle(step: HomePlannerStep, language: AppLanguage = "bg") {
  const copy = getHomeCopy(language);

  if (step === "chatting") return copy.planning;
  if (step === "budget") return copy.budget;
  if (step === "days") return copy.duration;
  if (step === "travelers") return copy.travelers;
  if (step === "transport") return copy.transport;
  if (step === "timing") return copy.timing;
  return copy.generate;
}

export function getDefaultChatTitle(chatCount: number, language: AppLanguage = "bg") {
  const prefix = getHomeCopy(language).autoChatPrefix;
  return chatCount <= 0 ? prefix : `${prefix} ${chatCount + 1}`;
}

export function getAutoChatTitle(
  currentTitle: string,
  destination: string,
  planTitle: string,
  language: AppLanguage = "bg"
) {
  const { autoChatPrefix, currentChat } = getHomeCopy(language);
  const isDefaultTitle =
    currentTitle.trim().startsWith(autoChatPrefix) || currentTitle.trim() === currentChat;

  if (!isDefaultTitle) {
    return currentTitle;
  }

  return planTitle || destination || currentTitle;
}

export function getPlannerGenerationDefaults(language: AppLanguage = "bg") {
  const copy = getHomeCopy(language);

  return {
    budget: copy.budgetFallback,
    days: copy.daysFallback,
    timing: copy.timingFallback,
    transportPreference: copy.transportFallback,
    travelers: copy.travelersFallback,
  };
}

export function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
