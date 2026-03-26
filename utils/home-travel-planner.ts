import { normalizeBudgetToEuro } from "./currency";
import { type DiscoverProfile } from "./trip-recommendations";
import { searchTravelOffers } from "./travel-offers";

export type PlannerTransportOption = {
  bookingUrl: string;
  duration: string;
  mode: string;
  note: string;
  price: string;
  provider: string;
  route: string;
  sourceLabel: string;
};

export type PlannerStayOption = {
  area: string;
  bookingUrl: string;
  imageUrl?: string;
  name: string;
  note: string;
  pricePerNight: string;
  ratingLabel?: string;
  sourceLabel: string;
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

function sanitizeString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function extractFirstNumber(value: string) {
  const match = value.match(/\d+(?:[.,]\d+)?/);

  if (!match) {
    return null;
  }

  const parsedValue = Number(match[0].replace(",", "."));
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function extractCount(value: string, fallback: number) {
  const match = value.match(/\d+/);

  if (!match) {
    return fallback;
  }

  const parsedValue = Number(match[0]);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
}

function formatMoney(amount: number | null, currency: string) {
  if (amount === null) {
    return "Цена при запитване";
  }

  return `${Math.round(amount)} ${currency}`;
}

function formatDuration(durationMinutes: number | null | undefined) {
  if (durationMinutes === null || durationMinutes === undefined) {
    return "Времето се уточнява";
  }

  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;

  if (hours <= 0) {
    return `${minutes} мин`;
  }

  if (minutes === 0) {
    return `${hours} ч`;
  }

  return `${hours} ч ${minutes} мин`;
}

function getInterestSummary(profile: DiscoverProfile) {
  return profile.interests.selectedOptions
    .map((interest) => interest.replace(/^[^\p{L}\p{N}]+/u, "").trim())
    .filter(Boolean)
    .slice(0, 3);
}

function buildPlanTitle(destination: string, profile: DiscoverProfile) {
  const topInterest = getInterestSummary(profile)[0];

  if (topInterest) {
    return `${destination}: live план за ${topInterest.toLowerCase()}`;
  }

  return `${destination}: live travel план`;
}

function buildPlanSummary(params: {
  destination: string;
  profile: DiscoverProfile;
  stayCount: number;
  transportCount: number;
  windowLabel: string;
}) {
  const topInterests = getInterestSummary(params.profile);
  const interestLabel =
    topInterests.length > 0
      ? topInterests.join(", ").toLowerCase()
      : "твоите предпочитания";

  return `Намерихме ${params.transportCount} реални transport оферти и ${params.stayCount} stay оферти за ${params.destination} в прозореца ${params.windowLabel}, подбрани според ${interestLabel}.`;
}

function buildBudgetNote(params: {
  budget: string;
  days: string;
  stayOptions: PlannerStayOption[];
  transportOptions: PlannerTransportOption[];
  travelers: string;
}) {
  const normalizedBudget = normalizeBudgetToEuro(params.budget);
  const travelerCount = extractCount(params.travelers, 1);
  const nights = Math.max(extractCount(params.days, 3) - 1, 1);
  const roomCount = Math.max(1, Math.ceil(travelerCount / 2));
  const cheapestTransport = extractFirstNumber(params.transportOptions[0]?.price ?? "");
  const cheapestStay = extractFirstNumber(params.stayOptions[0]?.pricePerNight ?? "");

  if (cheapestTransport === null && cheapestStay === null) {
    return `Бюджетът е зададен като ${normalizedBudget}; част от live офертите изискват директна проверка в сайта на доставчика.`;
  }

  const estimatedTotal =
    (cheapestTransport !== null ? cheapestTransport * travelerCount : 0) +
    (cheapestStay !== null ? cheapestStay * nights * roomCount : 0);

  return `При ${normalizedBudget} най-добрият видим fit стартира около ${Math.round(
    estimatedTotal
  )} EUR общо за ${params.days}.`;
}

function buildProfileTip(profile: DiscoverProfile) {
  const accessibilityNeeds = [
    ...profile.assistance.selectedOptions,
    profile.assistance.note,
  ]
    .map((item) => item.trim())
    .filter(Boolean);
  const stayStyle = sanitizeString(profile.personalProfile.stayStyle);
  const homeBase = sanitizeString(profile.personalProfile.homeBase);

  if (accessibilityNeeds.length > 0) {
    return `Провери преди резервация достъпността на транспорта и stay-а. Търсенето е фокусирано спрямо профила ти от ${homeBase || "твоя град"} и нуждите: ${accessibilityNeeds.slice(0, 2).join(", ")}.`;
  }

  if (stayStyle) {
    return `Офертите са подредени с приоритет към ${stayStyle.toLowerCase()} и практичен транспорт от ${homeBase || "твоя град"}.`;
  }

  return `Офертите са подредени с приоритет към по-практичен транспорт и stay варианти от ${homeBase || "твоя град"}.`;
}

function buildDayPlans(params: {
  days: string;
  destination: string;
  profile: DiscoverProfile;
}) {
  const dayCount = Math.max(extractCount(params.days, 3), 1);
  const interests = getInterestSummary(params.profile);
  const fallbackFocus = interests[0] || "разходка и локална атмосфера";

  return Array.from({ length: dayCount }, (_, index) => {
    const dayNumber = index + 1;

    if (dayNumber === 1) {
      return {
        dayLabel: `Ден ${dayNumber}`,
        items: [
          "Тръгване с избрания live transport вариант",
          "Check-in в избрания stay",
          `Лека първа разходка в ${params.destination}`,
        ],
        title: "Пристигане и настройка",
      } satisfies PlannerDayPlan;
    }

    if (dayNumber === dayCount) {
      return {
        dayLabel: `Ден ${dayNumber}`,
        items: [
          "Сутрин с лек local план и свободно време",
          "Check-out и тръгване обратно",
          "Запази буфер за транспортни промени",
        ],
        title: "Отпътуване",
      } satisfies PlannerDayPlan;
    }

    const focus = interests[(dayNumber - 2) % Math.max(interests.length, 1)] || fallbackFocus;

    return {
      dayLabel: `Ден ${dayNumber}`,
      items: [
        `Фокус върху ${focus.toLowerCase()}`,
        "Основна забележителност или квартал",
        "Вечеря / локално преживяване близо до stay-а",
      ],
      title: `Пълен ден в ${params.destination}`,
    } satisfies PlannerDayPlan;
  });
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
        `- ${option.mode}: ${option.provider} | ${option.route} | ${option.price} | ${option.duration} | ${option.sourceLabel}`
    ),
    "",
    "Stay:",
    ...plan.stayOptions.map(
      (stay) =>
        `- ${stay.name} (${stay.type}) | ${stay.area} | ${stay.pricePerNight} | ${stay.sourceLabel}`
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
  const offers = await searchTravelOffers(params);

  const transportOptions = offers.transportOptions.map((offer) => ({
    bookingUrl: offer.bookingUrl,
    duration: formatDuration(offer.durationMinutes),
    mode: offer.mode,
    note: offer.note,
    price: formatMoney(offer.priceAmount, offer.priceCurrency),
    provider: offer.provider,
    route: offer.route,
    sourceLabel: offer.sourceLabel,
  })) satisfies PlannerTransportOption[];

  const stayOptions = offers.stayOptions.map((offer) => ({
    area: offer.area,
    bookingUrl: offer.bookingUrl,
    imageUrl: offer.imageUrl,
    name: offer.name,
    note: offer.note,
    pricePerNight: formatMoney(offer.priceAmount, offer.priceCurrency),
    ratingLabel: offer.ratingLabel,
    sourceLabel: offer.sourceLabel,
    type: offer.type,
  })) satisfies PlannerStayOption[];

  return {
    budgetNote: buildBudgetNote({
      budget: params.budget,
      days: params.days,
      stayOptions,
      transportOptions,
      travelers: params.travelers,
    }),
    profileTip: buildProfileTip(params.profile),
    stayOptions,
    summary: buildPlanSummary({
      destination: params.destination,
      profile: params.profile,
      stayCount: stayOptions.length,
      transportCount: transportOptions.length,
      windowLabel: offers.searchContext.windowLabel,
    }),
    title: buildPlanTitle(params.destination, params.profile),
    transportOptions,
    tripDays: buildDayPlans({
      days: params.days,
      destination: params.destination,
      profile: params.profile,
    }),
  } satisfies GroundedTravelPlan;
}

export function getHomePlannerErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code
      : "";

  if (code.includes("functions/not-found")) {
    return "Липсва Firebase функцията searchOffers. Deploy-ни backend-а и опитай пак.";
  }

  if (code.includes("functions/failed-precondition")) {
    return "Backend-ът няма настроен SKYSCANNER_API_KEY. Добави го във Functions env.";
  }

  if (code.includes("functions/not-found") || code.includes("functions/unavailable")) {
    return "Не успяхме да стигнем backend-а за live travel оферти. Провери Functions deploy-а и мрежата.";
  }

  if (message.includes("functions/not-found")) {
    return "Липсва Firebase функцията searchOffers. Deploy-ни backend-а и опитай пак.";
  }

  if (message.includes("functions/failed-precondition")) {
    return "Backend-ът няма настроени provider ключове. Провери Firebase Functions env променливите.";
  }

  if (message.includes("functions/unavailable")) {
    return "Live travel backend-ът е недостъпен в момента. Опитай пак след малко.";
  }

  if (message.includes("functions/internal")) {
    return "Backend-ът върна вътрешна грешка при зареждане на live оферти.";
  }

  if (message.includes("functions/not-found")) {
    return "Не бяха намерени live оферти за този маршрут и период.";
  }

  return "Не успяхме да заредим live transport и stay оферти. Опитай пак.";
}
