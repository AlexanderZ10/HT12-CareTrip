import { callAI, getAIApiKey } from "./ai";
import { normalizeBudgetToEuro } from "./currency";
import type { AppLanguage } from "./translations";
import { type DiscoverProfile } from "./trip-recommendations";
import { searchTravelOffers, type LiveTravelOffersResponse } from "./travel-offers";

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
  providerAccommodationId?: string;
  providerKey?: string;
  providerPaymentModes?: string[];
  providerProductId?: string;
  ratingLabel?: string;
  reservationMode?: string;
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
  language?: AppLanguage;
  profileTip: string;
  stayOptions: PlannerStayOption[];
  summary: string;
  title: string;
  transportOptions: PlannerTransportOption[];
  tripDays: PlannerDayPlan[];
};

type StructuredPlannerNarrative = {
  summary?: string;
  title?: string;
  tripDays?: Array<{
    dayLabel?: string;
    items?: string[];
    title?: string;
  }>;
  verificationNote?: string;
};

function sanitizeString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
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

function normalizePlannerLanguage(language?: string): AppLanguage {
  if (
    language === "en" ||
    language === "de" ||
    language === "es" ||
    language === "fr"
  ) {
    return language;
  }

  return "bg";
}

function getPlannerLanguageLabel(language: AppLanguage) {
  if (language === "en") return "English";
  if (language === "de") return "German";
  if (language === "es") return "Spanish";
  if (language === "fr") return "French";
  return "Bulgarian";
}

function normalizeLooseText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCurrencyCode(value: string) {
  const normalizedValue = sanitizeString(value, "EUR").trim().toUpperCase();

  if (!normalizedValue) {
    return "EUR";
  }

  if (normalizedValue === "€" || normalizedValue === "EURO") {
    return "EUR";
  }

  if (normalizedValue === "$" || normalizedValue === "US$") {
    return "USD";
  }

  if (normalizedValue === "£") {
    return "GBP";
  }

  if (normalizedValue === "ЛВ" || normalizedValue === "BGN") {
    return "BGN";
  }

  const compactCode = normalizedValue.replace(/[^A-Z]/g, "");
  return compactCode.length >= 3 ? compactCode.slice(0, 3) : "EUR";
}

function getLocaleForPlannerLanguage(language: AppLanguage) {
  if (language === "en") return "en-GB";
  if (language === "de") return "de-DE";
  if (language === "es") return "es-ES";
  if (language === "fr") return "fr-FR";
  return "bg-BG";
}

function formatPlannerDate(value: string, language: AppLanguage) {
  const trimmedValue = sanitizeString(value);

  if (!trimmedValue) {
    return "";
  }

  const parsedDate = new Date(`${trimmedValue}T12:00:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    return trimmedValue;
  }

  try {
    return new Intl.DateTimeFormat(getLocaleForPlannerLanguage(language), {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(parsedDate);
  } catch {
    return trimmedValue;
  }
}

function formatPlannerWindowLabel(value: string, language: AppLanguage) {
  const normalizedValue = sanitizeString(value);

  if (!normalizedValue.includes("→")) {
    return formatPlannerDate(normalizedValue, language);
  }

  const [departureDate, returnDate] = normalizedValue.split("→").map((item) => item.trim());
  return `${formatPlannerDate(departureDate, language)} → ${formatPlannerDate(returnDate, language)}`;
}

const GENERIC_ROUTE_LABELS = new Set([
  "bulgaria",
  "българия",
  "romania",
  "румъния",
  "germany",
  "германия",
  "france",
  "франция",
  "spain",
  "испания",
  "italy",
  "италия",
  "greece",
  "гърция",
  "turkey",
  "турция",
]);

function cleanTransportRouteLabel(route: string, destination: string, language: AppLanguage) {
  const trimmedRoute = sanitizeString(route);

  if (!trimmedRoute) {
    return "";
  }

  const normalizedRoute = normalizeLooseText(trimmedRoute);

  if (
    normalizedRoute === "маршрутът се уточнява" ||
    normalizedRoute === "route tbd" ||
    normalizedRoute === "route to be confirmed"
  ) {
    return "";
  }

  const routeParts = trimmedRoute.split("→").map((item) => item.trim()).filter(Boolean);

  if (routeParts.length === 2) {
    const [originLabel, destinationLabel] = routeParts;
    const normalizedOrigin = normalizeLooseText(originLabel);
    const normalizedDestination = normalizeLooseText(destinationLabel);
    const normalizedRequestedDestination = normalizeLooseText(destination);

    if (
      GENERIC_ROUTE_LABELS.has(normalizedOrigin) &&
      normalizedDestination.includes(normalizedRequestedDestination)
    ) {
      return language === "bg" ? `До ${destinationLabel}` : `To ${destinationLabel}`;
    }
  }

  return trimmedRoute;
}

function sanitizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => sanitizeString(item))
    .filter(Boolean);
}

function getPlannerCopy(language: AppLanguage) {
  if (language === "en") {
    return {
      arrivalTitle: "Arrival and settling in",
      verificationHeading: "Verified data",
      budgetFallback: (budget: string) =>
        `Your budget is set to ${budget}; some live offers need to be checked directly on the provider site.`,
      budgetFit: (estimatedTotal: number, days: string, budget: string) =>
        `With ${budget}, the best visible exact total currently starts at around ${Math.round(estimatedTotal)} EUR for the selected dates.`,
      budgetHeading: "Budget",
      dayLabel: (dayNumber: number) => `Day ${dayNumber}`,
      daysHeading: "Trip structure",
      exactStay: (name: string, area: string, price: string) =>
        `Verified stay option: ${name}${area ? `, ${area}` : ""}${price ? `, ${price}` : ""}`,
      exactTransport: (provider: string, route: string, price: string) =>
        `Verified transport option: ${provider}${route ? `, ${route}` : ""}${price ? `, ${price}` : ""}`,
      noVerifiedActivities: "No verified activity schedule is included yet.",
      openDayArea: (area: string) => `Stay base for the day: ${area}`,
      openDayTitle: (destination: string) => `Open day in ${destination}`,
      plannedDepartureDate: (date: string) => `Planned departure date: ${date}`,
      plannedReturnDate: (date: string) => `Planned return date: ${date}`,
      plannerNote: (notes: string) => `Traveler note: ${notes}`,
      departureTitle: "Departure",
      durationTbd: "Duration to be confirmed",
      errorGeneric: "We couldn't load live transport and stay offers. Please try again.",
      errorInternal: "The backend returned an internal error while loading live offers.",
      errorInvalidFallback: "The local fallback returned invalid travel data. Try again.",
      errorMissingFallbackKey:
        "The local fallback is missing an AI key. Add EXPO_PUBLIC_GEMINI_API_KEY or use the Functions backend.",
      errorMissingFunction:
        "The Firebase function searchOffers is missing. Deploy the backend and try again.",
      errorMissingProviderKeys:
        "The backend is missing provider keys for live travel offers. Check Firebase Functions env.",
      errorUnavailable: "The live travel backend is unavailable right now. Try again in a moment.",
      hourShort: "h",
      minuteShort: "min",
      priceOnRequest: "Price on request",
      verificationNoLiveResults:
        "No provider-linked live booking results are available for this search yet.",
      verificationSomeMissing:
        "Only provider-linked live results are shown. Missing sections were left empty instead of using guessed data.",
      verificationReady:
        "Only provider-linked live transport and stay results are shown below. Activities remain open until you add verified details.",
      stayHeading: "Stay",
      summary: (params: {
        destination: string;
        stayCount: number;
        transportCount: number;
        travelers: string;
        windowLabel: string;
      }) =>
        `Verified search for ${params.destination} in the ${params.windowLabel} window for ${params.travelers}: ${params.transportCount} transport result(s) and ${params.stayCount} stay result(s).`,
      titleFallback: (destination: string) => `${destination}: verified travel plan`,
      transportHeading: "Transport",
    };
  }

  if (language === "de") {
    return {
      arrivalTitle: "Ankunft und Einleben",
      verificationHeading: "Verifizierte Daten",
      budgetFallback: (budget: string) =>
        `Dein Budget ist auf ${budget} gesetzt; einige Live-Angebote mussen direkt auf der Anbieterseite gepruft werden.`,
      budgetFit: (estimatedTotal: number, days: string, budget: string) =>
        `Mit ${budget} beginnt die beste sichtbare exakte Gesamtsumme aktuell bei etwa ${Math.round(estimatedTotal)} EUR fur die gewahlten Daten.`,
      budgetHeading: "Budget",
      dayLabel: (dayNumber: number) => `Tag ${dayNumber}`,
      daysHeading: "Reisestruktur",
      exactStay: (name: string, area: string, price: string) =>
        `Verifizierte Unterkunft: ${name}${area ? `, ${area}` : ""}${price ? `, ${price}` : ""}`,
      exactTransport: (provider: string, route: string, price: string) =>
        `Verifizierter Transport: ${provider}${route ? `, ${route}` : ""}${price ? `, ${price}` : ""}`,
      noVerifiedActivities: "Es gibt noch keinen verifizierten Aktivitatsplan.",
      openDayArea: (area: string) => `Basis fur den Tag: ${area}`,
      openDayTitle: (destination: string) => `Offener Tag in ${destination}`,
      plannedDepartureDate: (date: string) => `Geplantes Abreisedatum: ${date}`,
      plannedReturnDate: (date: string) => `Geplantes Ruckreisedatum: ${date}`,
      plannerNote: (notes: string) => `Reisehinweis: ${notes}`,
      departureTitle: "Abreise",
      durationTbd: "Dauer wird noch bestatigt",
      errorGeneric: "Live-Transport- und Unterkunftsangebote konnten nicht geladen werden. Bitte versuche es erneut.",
      errorInternal: "Das Backend hat beim Laden der Live-Angebote einen internen Fehler zuruckgegeben.",
      errorInvalidFallback: "Der lokale Fallback hat ungueltige Reisedaten zuruckgegeben. Bitte erneut versuchen.",
      errorMissingFallbackKey:
        "Dem lokalen Fallback fehlt ein AI-Schlussel. Fuge EXPO_PUBLIC_GEMINI_API_KEY hinzu oder nutze das Functions-Backend.",
      errorMissingFunction:
        "Die Firebase-Funktion searchOffers fehlt. Deploye das Backend und versuche es erneut.",
      errorMissingProviderKeys:
        "Dem Backend fehlen Provider-Schlussel fur Live-Reiseangebote. Prufe die Firebase-Functions-Umgebung.",
      errorUnavailable: "Das Live-Reise-Backend ist gerade nicht verfugbar. Bitte gleich noch einmal versuchen.",
      hourShort: "Std",
      minuteShort: "Min",
      priceOnRequest: "Preis auf Anfrage",
      verificationNoLiveResults:
        "Fur diese Suche gibt es noch keine verifizierten Live-Buchungsergebnisse mit Anbieter-Link.",
      verificationSomeMissing:
        "Es werden nur Live-Ergebnisse mit Anbieter-Link angezeigt. Fehlende Bereiche bleiben leer statt geraten zu werden.",
      verificationReady:
        "Unten werden nur Live-Ergebnisse mit Anbieter-Link angezeigt. Aktivitaten bleiben offen, bis du verifizierte Details hinzufugst.",
      stayHeading: "Unterkunft",
      summary: (params: {
        destination: string;
        stayCount: number;
        transportCount: number;
        travelers: string;
        windowLabel: string;
      }) =>
        `Verifizierte Suche fur ${params.destination} im Zeitraum ${params.windowLabel} fur ${params.travelers}: ${params.transportCount} Transportergebnis(se) und ${params.stayCount} Unterkunftsergebnis(se).`,
      titleFallback: (destination: string) => `${destination}: verifizierter Reiseplan`,
      transportHeading: "Transport",
    };
  }

  if (language === "es") {
    return {
      arrivalTitle: "Llegada y acomodo",
      verificationHeading: "Datos verificados",
      budgetFallback: (budget: string) =>
        `Tu presupuesto esta fijado en ${budget}; algunas ofertas en vivo deben revisarse directamente en la web del proveedor.`,
      budgetFit: (estimatedTotal: number, days: string, budget: string) =>
        `Con ${budget}, el mejor total exacto visible ahora empieza en unos ${Math.round(estimatedTotal)} EUR para las fechas seleccionadas.`,
      budgetHeading: "Presupuesto",
      dayLabel: (dayNumber: number) => `Dia ${dayNumber}`,
      daysHeading: "Estructura del viaje",
      exactStay: (name: string, area: string, price: string) =>
        `Alojamiento verificado: ${name}${area ? `, ${area}` : ""}${price ? `, ${price}` : ""}`,
      exactTransport: (provider: string, route: string, price: string) =>
        `Transporte verificado: ${provider}${route ? `, ${route}` : ""}${price ? `, ${price}` : ""}`,
      noVerifiedActivities: "Aun no hay un plan de actividades verificado.",
      openDayArea: (area: string) => `Base del dia: ${area}`,
      openDayTitle: (destination: string) => `Dia abierto en ${destination}`,
      plannedDepartureDate: (date: string) => `Fecha prevista de salida: ${date}`,
      plannedReturnDate: (date: string) => `Fecha prevista de regreso: ${date}`,
      plannerNote: (notes: string) => `Nota del viajero: ${notes}`,
      departureTitle: "Salida",
      durationTbd: "Duracion por confirmar",
      errorGeneric: "No pudimos cargar ofertas en vivo de transporte y alojamiento. Intentalo de nuevo.",
      errorInternal: "El backend devolvio un error interno al cargar las ofertas en vivo.",
      errorInvalidFallback: "El fallback local devolvio datos de viaje invalidos. Intentalo de nuevo.",
      errorMissingFallbackKey:
        "Al fallback local le falta una clave de AI. Agrega EXPO_PUBLIC_GEMINI_API_KEY o usa el backend de Functions.",
      errorMissingFunction:
        "Falta la funcion de Firebase searchOffers. Despliega el backend e intentalo de nuevo.",
      errorMissingProviderKeys:
        "Al backend le faltan claves de proveedor para ofertas de viaje en vivo. Revisa el entorno de Firebase Functions.",
      errorUnavailable: "El backend de viajes en vivo no esta disponible ahora mismo. Intentalo en un momento.",
      hourShort: "h",
      minuteShort: "min",
      priceOnRequest: "Precio a consultar",
      verificationNoLiveResults:
        "Todavia no hay resultados de reserva en vivo verificados con enlace de proveedor para esta busqueda.",
      verificationSomeMissing:
        "Solo se muestran resultados en vivo con enlace de proveedor. Las secciones faltantes quedan vacias en lugar de inventarse.",
      verificationReady:
        "Abajo solo se muestran resultados en vivo con enlace de proveedor. Las actividades quedan abiertas hasta que agregues detalles verificados.",
      stayHeading: "Alojamiento",
      summary: (params: {
        destination: string;
        stayCount: number;
        transportCount: number;
        travelers: string;
        windowLabel: string;
      }) =>
        `Busqueda verificada para ${params.destination} en la ventana ${params.windowLabel} para ${params.travelers}: ${params.transportCount} resultado(s) de transporte y ${params.stayCount} resultado(s) de alojamiento.`,
      titleFallback: (destination: string) => `${destination}: plan verificado`,
      transportHeading: "Transporte",
    };
  }

  if (language === "fr") {
    return {
      arrivalTitle: "Arrivee et installation",
      verificationHeading: "Donnees verifiees",
      budgetFallback: (budget: string) =>
        `Ton budget est fixe a ${budget} ; certaines offres en direct doivent etre verifiees directement sur le site du fournisseur.`,
      budgetFit: (estimatedTotal: number, days: string, budget: string) =>
        `Avec ${budget}, le meilleur total exact visible commence actuellement autour de ${Math.round(estimatedTotal)} EUR pour les dates choisies.`,
      budgetHeading: "Budget",
      dayLabel: (dayNumber: number) => `Jour ${dayNumber}`,
      daysHeading: "Structure du voyage",
      exactStay: (name: string, area: string, price: string) =>
        `Hebergement verifie : ${name}${area ? `, ${area}` : ""}${price ? `, ${price}` : ""}`,
      exactTransport: (provider: string, route: string, price: string) =>
        `Transport verifie : ${provider}${route ? `, ${route}` : ""}${price ? `, ${price}` : ""}`,
      noVerifiedActivities: "Aucun programme d'activites verifie n'est encore inclus.",
      openDayArea: (area: string) => `Base de la journee : ${area}`,
      openDayTitle: (destination: string) => `Journee ouverte a ${destination}`,
      plannedDepartureDate: (date: string) => `Date de depart prevue : ${date}`,
      plannedReturnDate: (date: string) => `Date de retour prevue : ${date}`,
      plannerNote: (notes: string) => `Note du voyageur : ${notes}`,
      departureTitle: "Depart",
      durationTbd: "Duree a confirmer",
      errorGeneric: "Nous n'avons pas pu charger les offres en direct de transport et d'hebergement. Reessaie.",
      errorInternal: "Le backend a renvoye une erreur interne pendant le chargement des offres en direct.",
      errorInvalidFallback: "Le fallback local a renvoye des donnees de voyage invalides. Reessaie.",
      errorMissingFallbackKey:
        "Le fallback local n'a pas de cle AI. Ajoute EXPO_PUBLIC_GEMINI_API_KEY ou utilise le backend Functions.",
      errorMissingFunction:
        "La fonction Firebase searchOffers est manquante. Deploie le backend puis reessaie.",
      errorMissingProviderKeys:
        "Le backend n'a pas les cles fournisseur pour les offres de voyage en direct. Verifie l'environnement Firebase Functions.",
      errorUnavailable: "Le backend de voyage en direct est indisponible pour le moment. Reessaie dans un instant.",
      hourShort: "h",
      minuteShort: "min",
      priceOnRequest: "Prix sur demande",
      verificationNoLiveResults:
        "Aucun resultat de reservation en direct verifie avec lien fournisseur n'est disponible pour cette recherche pour le moment.",
      verificationSomeMissing:
        "Seuls les resultats en direct avec lien fournisseur sont affiches. Les sections manquantes restent vides au lieu d'etre inventees.",
      verificationReady:
        "Seuls les resultats en direct avec lien fournisseur sont affiches ci-dessous. Les activites restent ouvertes jusqu'a l'ajout de details verifies.",
      stayHeading: "Hebergement",
      summary: (params: {
        destination: string;
        stayCount: number;
        transportCount: number;
        travelers: string;
        windowLabel: string;
      }) =>
        `Recherche verifiee pour ${params.destination} dans la fenetre ${params.windowLabel} pour ${params.travelers} : ${params.transportCount} resultat(s) transport et ${params.stayCount} resultat(s) hebergement.`,
      titleFallback: (destination: string) => `${destination} : plan verifie`,
      transportHeading: "Transport",
    };
  }

  return {
    arrivalTitle: "Пристигане и настройка",
    verificationHeading: "Проверени данни",
    budgetFallback: (budget: string) =>
      `Бюджетът е зададен като ${budget}; част от live офертите изискват директна проверка в сайта на доставчика.`,
    budgetFit: (estimatedTotal: number, days: string, budget: string) =>
      `При ${budget} най-добрият видим точен общ разход в момента започва от около ${Math.round(estimatedTotal)} EUR за избраните дати.`,
    budgetHeading: "Бюджет",
    dayLabel: (dayNumber: number) => `Ден ${dayNumber}`,
    daysHeading: "Структура на пътуването",
    exactStay: (name: string, area: string, price: string) =>
      `Проверен вариант за настаняване: ${name}${area ? `, ${area}` : ""}${price ? `, ${price}` : ""}`,
    exactTransport: (provider: string, route: string, price: string) =>
      `Проверен транспортен вариант: ${provider}${route ? `, ${route}` : ""}${price ? `, ${price}` : ""}`,
    noVerifiedActivities: "Все още няма включена проверена програма с активности.",
    openDayArea: (area: string) => `База за деня: ${area}`,
    openDayTitle: (destination: string) => `Свободен ден в ${destination}`,
    plannedDepartureDate: (date: string) => `Планирана дата на тръгване: ${date}`,
    plannedReturnDate: (date: string) => `Планирана дата на връщане: ${date}`,
    plannerNote: (notes: string) => `Бележка от пътуващия: ${notes}`,
    departureTitle: "Отпътуване",
    durationTbd: "Времето се уточнява",
    errorGeneric: "Не успяхме да заредим live транспорт и настаняване. Опитай пак.",
    errorInternal: "Backend-ът върна вътрешна грешка при зареждане на live оферти.",
    errorInvalidFallback: "Локалният fallback върна невалидни данни за пътуването. Опитай пак.",
    errorMissingFallbackKey:
      "Локалният fallback няма AI ключ. Добави EXPO_PUBLIC_GEMINI_API_KEY или ползвай Functions backend.",
    errorMissingFunction:
      "Липсва Firebase функцията searchOffers. Deploy-ни backend-а и опитай пак.",
    errorMissingProviderKeys:
      "Backend-ът няма настроени provider ключове. Провери Firebase Functions env променливите.",
    errorUnavailable: "Live travel backend-ът е недостъпен в момента. Опитай пак след малко.",
    hourShort: "ч",
    minuteShort: "мин",
    priceOnRequest: "Цена при запитване",
    verificationNoLiveResults:
      "За това търсене все още няма проверени live booking резултати с provider линк.",
    verificationSomeMissing:
      "Показвам само live резултати с provider линк. Липсващите секции остават празни, вместо да се запълват с предположения.",
    verificationReady:
      "По-долу показвам само live транспорт и настаняване с provider линк. Активностите остават отворени, докато не добавиш проверени детайли.",
    stayHeading: "Настаняване",
    summary: (params: {
      destination: string;
      stayCount: number;
      transportCount: number;
      travelers: string;
      windowLabel: string;
    }) =>
      `Проверено търсене за ${params.destination} в прозореца ${params.windowLabel} за ${params.travelers}: ${params.transportCount} транспортни резултата и ${params.stayCount} варианта за настаняване.`,
    titleFallback: (destination: string) => `${destination}: проверен план за пътуване`,
    transportHeading: "Транспорт",
  };
}

function formatMoney(
  amount: number | null,
  currency: string,
  language: AppLanguage = "bg"
) {
  if (amount === null) {
    return "";
  }

  return `${Math.round(amount)} ${normalizeCurrencyCode(currency)}`;
}

function formatDuration(
  durationMinutes: number | null | undefined,
  language: AppLanguage = "bg"
) {
  const copy = getPlannerCopy(language);

  if (durationMinutes === null || durationMinutes === undefined) {
    return copy.durationTbd;
  }

  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;

  if (hours <= 0) {
    return `${minutes} ${copy.minuteShort}`;
  }

  if (minutes === 0) {
    return `${hours} ${copy.hourShort}`;
  }

  return `${hours} ${copy.hourShort} ${minutes} ${copy.minuteShort}`;
}

function buildNotesDayItem(language: AppLanguage, notes?: string) {
  const normalizedNotes = sanitizeString(notes);
  const copy = getPlannerCopy(language);

  if (!normalizedNotes) {
    return "";
  }

  return copy.plannerNote(normalizedNotes);
}

function buildPlanTitle(
  destination: string,
  language: AppLanguage = "bg"
) {
  const copy = getPlannerCopy(language);
  return copy.titleFallback(destination);
}

function buildPlanSummary(params: {
  destination: string;
  language?: AppLanguage;
  stayCount: number;
  transportCount: number;
  travelers: string;
  windowLabel: string;
}) {
  const language = normalizePlannerLanguage(params.language);
  const copy = getPlannerCopy(language);
  return copy.summary({
    destination: params.destination,
    stayCount: params.stayCount,
    transportCount: params.transportCount,
    travelers: params.travelers,
    windowLabel: formatPlannerWindowLabel(params.windowLabel, language),
  });
}

function buildBudgetNote(params: {
  budget: string;
  days: string;
  language?: AppLanguage;
  stayOptions: PlannerStayOption[];
  transportOptions: PlannerTransportOption[];
  travelers: string;
}) {
  const language = normalizePlannerLanguage(params.language);
  const copy = getPlannerCopy(language);
  const normalizedBudget = normalizeBudgetToEuro(params.budget);
  const cheapestTransport = extractFirstNumber(params.transportOptions[0]?.price ?? "");
  const cheapestStay = extractFirstNumber(params.stayOptions[0]?.pricePerNight ?? "");

  if (cheapestTransport === null && cheapestStay === null) {
    return copy.budgetFallback(normalizedBudget);
  }

  const estimatedTotal =
    (cheapestTransport !== null ? cheapestTransport : 0) +
    (cheapestStay !== null ? cheapestStay : 0);

  return copy.budgetFit(estimatedTotal, params.days, normalizedBudget);
}

function buildVerificationNote(
  language: AppLanguage,
  transportCount: number,
  stayCount: number
) {
  const copy = getPlannerCopy(language);

  if (transportCount === 0 && stayCount === 0) {
    return copy.verificationNoLiveResults;
  }

  if (transportCount === 0 || stayCount === 0) {
    return copy.verificationSomeMissing;
  }

  return copy.verificationReady;
}

function buildDayPlans(params: {
  days: string;
  destination: string;
  departureDate: string;
  language?: AppLanguage;
  notes?: string;
  returnDate: string;
  stayOptions: PlannerStayOption[];
  transportOptions: PlannerTransportOption[];
}) {
  const language = normalizePlannerLanguage(params.language);
  const copy = getPlannerCopy(language);
  const dayCount = Math.max(extractCount(params.days, 3), 1);
  const notesItem = buildNotesDayItem(language, params.notes);
  const primaryTransport = params.transportOptions[0];
  const primaryStay = params.stayOptions[0];
  const departureDateLabel = formatPlannerDate(params.departureDate, language);
  const returnDateLabel = formatPlannerDate(params.returnDate, language);
  const exactTransport =
    primaryTransport && (primaryTransport.provider || primaryTransport.route || primaryTransport.price)
      ? copy.exactTransport(
          primaryTransport.provider,
          cleanTransportRouteLabel(primaryTransport.route, params.destination, language),
          primaryTransport.price
        )
      : "";
  const exactStay =
    primaryStay && (primaryStay.name || primaryStay.area || primaryStay.pricePerNight)
      ? copy.exactStay(primaryStay.name, primaryStay.area, primaryStay.pricePerNight)
      : "";
  const areaItem = primaryStay?.area ? copy.openDayArea(primaryStay.area) : "";

  if (dayCount === 1) {
    return [
      {
        dayLabel: copy.dayLabel(1),
        items: [
          copy.plannedDepartureDate(departureDateLabel),
          exactTransport,
          exactStay,
          copy.plannedReturnDate(returnDateLabel),
          notesItem,
        ].filter(Boolean),
        title: copy.arrivalTitle,
      } satisfies PlannerDayPlan,
    ];
  }

  return Array.from({ length: dayCount }, (_, index) => {
    const dayNumber = index + 1;

    if (dayNumber === 1) {
      return {
        dayLabel: copy.dayLabel(dayNumber),
        items: [
          copy.plannedDepartureDate(departureDateLabel),
          exactTransport,
          exactStay,
          notesItem,
        ].filter(Boolean),
        title: copy.arrivalTitle,
      } satisfies PlannerDayPlan;
    }

    if (dayNumber === dayCount) {
      return {
        dayLabel: copy.dayLabel(dayNumber),
        items: [
          copy.plannedReturnDate(returnDateLabel),
          areaItem,
          copy.noVerifiedActivities,
        ],
        title: copy.departureTitle,
      } satisfies PlannerDayPlan;
    }

    return {
      dayLabel: copy.dayLabel(dayNumber),
      items: [
        areaItem,
        copy.noVerifiedActivities,
        notesItem,
      ].filter(Boolean),
      title: copy.openDayTitle(params.destination),
    } satisfies PlannerDayPlan;
  });
}

function summarizeProfile(profile: DiscoverProfile) {
  const interests = profile.interests.selectedOptions.filter(Boolean).slice(0, 4).join(", ");
  const accessibility = [
    ...profile.assistance.selectedOptions,
    profile.assistance.note,
  ]
    .map((item) => sanitizeString(item))
    .filter(Boolean)
    .slice(0, 3)
    .join(", ");

  return [
    `Home base: ${sanitizeString(profile.personalProfile.homeBase, "Not provided")}`,
    `Dream destinations: ${sanitizeString(profile.personalProfile.dreamDestinations, "Not provided")}`,
    `Travel pace: ${sanitizeString(profile.personalProfile.travelPace, "Not provided")}`,
    `Stay style: ${sanitizeString(profile.personalProfile.stayStyle, "Not provided")}`,
    `About traveler: ${sanitizeString(profile.personalProfile.aboutMe, "Not provided")}`,
    `Interests: ${interests || "Not provided"}`,
    `Accessibility or support: ${accessibility || "Not provided"}`,
  ].join("\n");
}

function buildTransportContext(options: PlannerTransportOption[]) {
  if (options.length === 0) {
    return "- No verified transport offers yet.";
  }

  return options
    .slice(0, 3)
    .map(
      (option, index) =>
        `${index + 1}. ${option.mode} | ${option.provider} | ${option.route} | ${option.price} | ${option.duration}${option.sourceLabel ? ` | ${option.sourceLabel}` : ""}`
    )
    .join("\n");
}

function buildStayContext(options: PlannerStayOption[]) {
  if (options.length === 0) {
    return "- No verified stay offers yet.";
  }

  return options
    .slice(0, 3)
    .map(
      (option, index) =>
        `${index + 1}. ${option.name} | ${option.type} | ${option.area} | ${option.pricePerNight}${option.ratingLabel ? ` | ${option.ratingLabel}` : ""}${option.sourceLabel ? ` | ${option.sourceLabel}` : ""}`
    )
    .join("\n");
}

function buildGroundedResearchSystemPrompt(language: AppLanguage) {
  return [
    "You are CareTrip's travel research analyst.",
    `Always write in ${getPlannerLanguageLabel(language)}.`,
    "Use Google Search grounding to research recent, public, factual travel information.",
    "Use the provided verified transport and stay options only as anchors. Never invent or overwrite provider names, prices, booking URLs, or availability.",
    "If something is uncertain, seasonal, or requires direct checking, say so plainly.",
    "Keep the output compact, practical, and useful for building a trip plan.",
  ].join("\n");
}

function buildGroundedResearchPrompt(params: {
  budget: string;
  destination: string;
  notes?: string;
  offers: LiveTravelOffersResponse;
  profile: DiscoverProfile;
  stayOptions: PlannerStayOption[];
  timing: string;
  transportOptions: PlannerTransportOption[];
  travelers: string;
  tripStyle?: string;
}) {
  const searchNotes = params.offers.notes.slice(0, 4).join("\n- ");

  return [
    "Traveler request:",
    `- Destination: ${params.destination}`,
    `- Timing: ${params.timing}`,
    `- Search window: ${params.offers.searchContext.windowLabel}`,
    `- Departure date: ${params.offers.searchContext.departureDate}`,
    `- Return date: ${params.offers.searchContext.returnDate}`,
    `- Travelers: ${params.travelers}`,
    `- Budget: ${params.budget}`,
    `- Trip style: ${sanitizeString(params.tripStyle, "Not specified")}`,
    `- Extra notes: ${sanitizeString(params.notes, "None")}`,
    "",
    "Traveler profile:",
    summarizeProfile(params.profile),
    "",
    "Verified transport anchors:",
    buildTransportContext(params.transportOptions),
    "",
    "Verified stay anchors:",
    buildStayContext(params.stayOptions),
    "",
    "Provider and search notes:",
    searchNotes ? `- ${searchNotes}` : "- No provider notes.",
    "",
    "Research this trip and return a short brief with these sections:",
    "1. Reality check for this destination and timing",
    "2. Best area or base to focus on for this short trip",
    "3. Good activity mix for this trip length",
    "4. Timing, weather, or logistics notes that matter",
    "5. One honest caution or thing that still needs direct provider or local verification",
    "",
    "Important rules:",
    "- Use grounded web knowledge for areas, attractions, local logistics, seasonality, and practical pacing.",
    "- Do not invent prices, transport providers, hotel providers, or booking facts.",
    "- Do not mention any booking link unless it was already provided in the verified options.",
    "- Stay concise and factual.",
  ].join("\n");
}

function buildStructuredNarrativeSystemPrompt(language: AppLanguage) {
  return [
    "You are CareTrip's trip brief formatter.",
    `Always write in ${getPlannerLanguageLabel(language)}.`,
    "Return only a valid JSON object.",
    "Use grounded research only for factual destination guidance, realistic neighborhoods, and activity ideas.",
    "Use verified transport and stay options as the only source of truth for providers, stay names, prices, and durations.",
    "Never invent booking links, live prices, availability, or provider names.",
    "Keep the result concise, polished, and practical.",
  ].join("\n");
}

function buildStructuredNarrativePrompt(params: {
  baselinePlan: GroundedTravelPlan;
  destination: string;
  groundedNotes: string;
  offers: LiveTravelOffersResponse;
  transportOptions: PlannerTransportOption[];
  stayOptions: PlannerStayOption[];
}) {
  return [
    "Baseline deterministic plan:",
    JSON.stringify(
      {
        title: params.baselinePlan.title,
        summary: params.baselinePlan.summary,
        verificationNote: params.baselinePlan.profileTip,
        tripDays: params.baselinePlan.tripDays,
      },
      null,
      2
    ),
    "",
    "Grounded research notes:",
    params.groundedNotes,
    "",
    "Verified transport anchors:",
    buildTransportContext(params.transportOptions),
    "",
    "Verified stay anchors:",
    buildStayContext(params.stayOptions),
    "",
    "Search context:",
    JSON.stringify(params.offers.searchContext, null, 2),
    "",
    "Return a JSON object with this exact shape:",
    `{
  "title": "string",
  "summary": "string",
  "verificationNote": "string",
  "tripDays": [
    {
      "dayLabel": "string",
      "title": "string",
      "items": ["string"]
    }
  ]
}`,
    "",
    "Rules:",
    `- Keep the title destination-first and concise for ${params.destination}.`,
    "- Keep summary to 2 or 3 sentences max.",
    "- The verificationNote must stay honest: grounded destination guidance plus verified provider-linked transport/stay offers only.",
    `- Return exactly ${params.baselinePlan.tripDays.length} tripDays.`,
    "- Preserve day labels unless there is a strong localization reason to improve them.",
    "- Keep each day title short.",
    "- Keep each day items practical and concise.",
    "- If you mention transport or stay, only use the verified options above.",
    "- Do not mention prices or availability that are not present in the verified options.",
  ].join("\n");
}

function sanitizeStructuredTripDays(
  value: unknown,
  fallbackTripDays: PlannerDayPlan[]
) {
  if (!Array.isArray(value)) {
    return fallbackTripDays;
  }

  const nextTripDays = fallbackTripDays.map((fallbackDay, index) => {
    const rawDay = value[index];

    if (!rawDay || typeof rawDay !== "object") {
      return fallbackDay;
    }

    const dayRecord = rawDay as Record<string, unknown>;
    const items = sanitizeStringArray(dayRecord.items).slice(0, 6);

    return {
      dayLabel: sanitizeString(dayRecord.dayLabel) || fallbackDay.dayLabel,
      items: items.length > 0 ? items : fallbackDay.items,
      title: sanitizeString(dayRecord.title) || fallbackDay.title,
    } satisfies PlannerDayPlan;
  });

  return nextTripDays.length > 0 ? nextTripDays : fallbackTripDays;
}

function buildDeterministicPlan(params: {
  budget: string;
  days: string;
  destination: string;
  language: AppLanguage;
  notes?: string;
  offers: LiveTravelOffersResponse;
  stayOptions: PlannerStayOption[];
  transportOptions: PlannerTransportOption[];
  travelers: string;
}) {
  return {
    budgetNote: buildBudgetNote({
      budget: params.budget,
      days: params.days,
      language: params.language,
      stayOptions: params.stayOptions,
      transportOptions: params.transportOptions,
      travelers: params.travelers,
    }),
    language: params.language,
    profileTip: buildVerificationNote(
      params.language,
      params.transportOptions.length,
      params.stayOptions.length
    ),
    stayOptions: params.stayOptions,
    summary: buildPlanSummary({
      destination: params.destination,
      language: params.language,
      stayCount: params.stayOptions.length,
      transportCount: params.transportOptions.length,
      travelers: params.travelers,
      windowLabel: params.offers.searchContext.windowLabel,
    }),
    title: buildPlanTitle(params.destination, params.language),
    transportOptions: params.transportOptions,
    tripDays: buildDayPlans({
      days: params.days,
      departureDate: params.offers.searchContext.departureDate,
      destination: params.destination,
      language: params.language,
      notes: params.notes,
      returnDate: params.offers.searchContext.returnDate,
      stayOptions: params.stayOptions,
      transportOptions: params.transportOptions,
    }),
  } satisfies GroundedTravelPlan;
}

export function formatGroundedTravelPlan(
  plan: GroundedTravelPlan,
  language?: AppLanguage
) {
  const selectedLanguage = normalizePlannerLanguage(language ?? plan.language);
  const copy = getPlannerCopy(selectedLanguage);

  return [
    plan.title,
    "",
    plan.summary,
    plan.budgetNote ? `\n${copy.budgetHeading}: ${plan.budgetNote}` : "",
    "",
    `${copy.transportHeading}:`,
    ...plan.transportOptions.map(
      (option) =>
        `- ${option.mode}: ${option.provider} | ${option.route} | ${option.price} | ${option.duration} | ${option.sourceLabel || ""}`
    ),
    "",
    `${copy.stayHeading}:`,
    ...plan.stayOptions.map(
      (stay) =>
        `- ${stay.name} (${stay.type}) | ${stay.area} | ${stay.pricePerNight} | ${stay.sourceLabel || ""}`
    ),
    "",
    `${copy.daysHeading}:`,
    ...plan.tripDays.map(
      (day) => `- ${day.dayLabel}: ${day.title} | ${day.items.join(" • ")}`
    ),
    "",
    `${copy.verificationHeading}: ${plan.profileTip}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function generateGroundedTravelPlan(params: {
  budget: string;
  days: string;
  destination: string;
  language?: AppLanguage;
  notes?: string;
  timing: string;
  transportPreference: string;
  travelers: string;
  profile: DiscoverProfile;
  tripStyle?: string;
}) {
  const language = normalizePlannerLanguage(params.language);
  const offers = await searchTravelOffers(params);
  const presentedStayOffers: LiveTravelOffersResponse["stayOptions"] = offers.stayOptions.filter(
    (offer) => typeof offer.priceAmount === "number" && offer.priceAmount > 0
  );
  const presentedTransportOffers: LiveTravelOffersResponse["transportOptions"] =
    offers.transportOptions.filter(
      (offer) => typeof offer.priceAmount === "number" && offer.priceAmount > 0
    );
  const presentedOffers = {
    ...offers,
    stayOptions: presentedStayOffers,
    transportOptions: presentedTransportOffers,
  } satisfies LiveTravelOffersResponse;

  const transportOptions = presentedOffers.transportOptions.map((offer) => ({
    bookingUrl: offer.bookingUrl,
    duration: formatDuration(offer.durationMinutes, language),
    mode: offer.mode,
    note: offer.note,
    price: formatMoney(offer.priceAmount, offer.priceCurrency, language),
    provider: offer.provider,
    route: cleanTransportRouteLabel(offer.route, params.destination, language),
    sourceLabel: offer.sourceLabel,
  })) satisfies PlannerTransportOption[];

  const stayOptions = presentedOffers.stayOptions.map((offer) => ({
    area: offer.area,
    bookingUrl: offer.bookingUrl,
    imageUrl: offer.imageUrl,
    name: offer.name,
    note: offer.note,
    pricePerNight: formatMoney(offer.priceAmount, offer.priceCurrency, language),
    providerAccommodationId: offer.providerAccommodationId,
    providerKey: offer.providerKey,
    providerPaymentModes: offer.providerPaymentModes,
    providerProductId: offer.providerProductId,
    ratingLabel: offer.ratingLabel,
    reservationMode: offer.reservationMode,
    sourceLabel: offer.sourceLabel,
    type: offer.type,
  })) satisfies PlannerStayOption[];

  const deterministicPlan = buildDeterministicPlan({
    budget: params.budget,
      days: params.days,
      destination: params.destination,
      language,
      notes: params.notes,
      offers: presentedOffers,
      stayOptions,
      transportOptions,
      travelers: params.travelers,
  });

  const apiKey = getAIApiKey();

  if (!apiKey) {
    return deterministicPlan;
  }

  try {
    const groundedNotes = await callAI({
      apiKey,
      googleSearchGrounding: true,
      prompt: buildGroundedResearchPrompt({
        budget: params.budget,
        destination: params.destination,
        notes: params.notes,
        offers: presentedOffers,
        profile: params.profile,
        stayOptions,
        timing: params.timing,
        transportOptions,
        travelers: params.travelers,
        tripStyle: params.tripStyle,
      }),
      systemPrompt: buildGroundedResearchSystemPrompt(language),
    });

    const structuredJsonText = await callAI({
      apiKey,
      jsonMode: true,
      prompt: buildStructuredNarrativePrompt({
        baselinePlan: deterministicPlan,
        destination: params.destination,
        groundedNotes,
        offers: presentedOffers,
        stayOptions,
        transportOptions,
      }),
      systemPrompt: buildStructuredNarrativeSystemPrompt(language),
    });

    const structuredNarrative = parseJsonObjectFromText<StructuredPlannerNarrative>(
      structuredJsonText
    );

    if (!structuredNarrative) {
      throw new Error("structured-narrative-invalid-json");
    }

    return {
      ...deterministicPlan,
      profileTip:
        sanitizeString(structuredNarrative.verificationNote) ||
        deterministicPlan.profileTip,
      summary: sanitizeString(structuredNarrative.summary) || deterministicPlan.summary,
      title: sanitizeString(structuredNarrative.title) || deterministicPlan.title,
      tripDays: sanitizeStructuredTripDays(
        structuredNarrative.tripDays,
        deterministicPlan.tripDays
      ),
    } satisfies GroundedTravelPlan;
  } catch {
    return deterministicPlan;
  }
}

export function getHomePlannerErrorMessage(
  error: unknown,
  language: AppLanguage = "bg"
) {
  const copy = getPlannerCopy(language);
  const message = error instanceof Error ? error.message : "";
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code
      : "";

  if (code.includes("functions/not-found")) {
    return copy.errorMissingFunction;
  }

  if (code.includes("functions/failed-precondition") || message.includes("functions/failed-precondition")) {
    return copy.errorMissingProviderKeys;
  }

  if (
    code.includes("functions/unavailable") ||
    message.includes("functions/unavailable") ||
    message.includes("Failed to fetch") ||
    message.includes("CORS")
  ) {
    return copy.errorUnavailable;
  }

  if (message.includes("missing-ai-fallback-key")) {
    return copy.errorMissingFallbackKey;
  }

  if (message.includes("fallback-invalid-json")) {
    return copy.errorInvalidFallback;
  }

  if (message.includes("functions/internal")) {
    return copy.errorInternal;
  }

  return copy.errorGeneric;
}
