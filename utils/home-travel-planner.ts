import { normalizeBudgetToEuro } from "./currency";
import type { AppLanguage } from "./translations";
import { type DiscoverProfile } from "./trip-recommendations";
import { searchTravelOffers } from "./travel-offers";

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
  language?: AppLanguage;
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

function lowerText(value: string, language: AppLanguage) {
  return value.toLocaleLowerCase(language);
}

function getPlannerCopy(language: AppLanguage) {
  if (language === "en") {
    return {
      arrivalFirstWalk: (destination: string) => `An easy first walk around ${destination}`,
      arrivalTitle: "Arrival and settling in",
      budgetFallback: (budget: string) =>
        `Your budget is set to ${budget}; some live offers need to be checked directly on the provider site.`,
      budgetFit: (estimatedTotal: number, days: string, budget: string) =>
        `With ${budget}, the best visible fit starts at around ${Math.round(estimatedTotal)} EUR total for ${days}.`,
      budgetHeading: "Budget",
      dayLabel: (dayNumber: number) => `Day ${dayNumber}`,
      daysHeading: "Days",
      departureBuffer: "Leave a buffer for transport changes",
      departureCheckout: "Check out and head back",
      departureMorning: "An easy morning plan with free time",
      departureTitle: "Departure",
      dinnerNearStay: "Dinner or a local experience near your stay",
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
      fallbackFocus: "a walk and the local vibe",
      fullDayTitle: (destination: string) => `A full day in ${destination}`,
      homeCityFallback: "your city",
      hourShort: "h",
      itineraryFocus: (focus: string) => `Focus on ${lowerText(focus, language)}`,
      landmarkItem: "Main landmark or neighborhood",
      minuteShort: "min",
      priceOnRequest: "Price on request",
      profileTipAccessibility: (homeBase: string, needs: string) =>
        `Check transport and stay accessibility before booking. The search is tuned to your profile from ${homeBase} and these needs: ${needs}.`,
      profileTipDefault: (homeBase: string) =>
        `The offers are ranked around practical transport and stay options from ${homeBase}.`,
      profileTipHeading: "Profile tip",
      profileTipStayStyle: (stayStyle: string, homeBase: string) =>
        `The offers are ranked with priority for ${lowerText(stayStyle, language)} stays and practical transport from ${homeBase}.`,
      stayHeading: "Stay",
      summary: (params: {
        destination: string;
        interestLabel: string;
        stayCount: number;
        transportCount: number;
        windowLabel: string;
      }) =>
        `We found ${params.transportCount} live transport offers and ${params.stayCount} stay options for ${params.destination} in the ${params.windowLabel} window, selected around ${params.interestLabel}.`,
      titleFallback: (destination: string) => `${destination}: live travel plan`,
      titleWithInterest: (destination: string, interest: string) =>
        `${destination}: live plan for ${lowerText(interest, language)}`,
      transportCheckIn: "Check in to your selected stay",
      transportDeparture: "Depart with your selected live transport option",
      transportHeading: "Transport",
    };
  }

  if (language === "de") {
    return {
      arrivalFirstWalk: (destination: string) => `Ein erster entspannter Spaziergang in ${destination}`,
      arrivalTitle: "Ankunft und Einleben",
      budgetFallback: (budget: string) =>
        `Dein Budget ist auf ${budget} gesetzt; einige Live-Angebote mussen direkt auf der Anbieterseite gepruft werden.`,
      budgetFit: (estimatedTotal: number, days: string, budget: string) =>
        `Mit ${budget} beginnt die beste sichtbare Option bei etwa ${Math.round(estimatedTotal)} EUR gesamt fur ${days}.`,
      budgetHeading: "Budget",
      dayLabel: (dayNumber: number) => `Tag ${dayNumber}`,
      daysHeading: "Tage",
      departureBuffer: "Plane Puffer fur Transportanderungen ein",
      departureCheckout: "Check-out und Ruckreise",
      departureMorning: "Ein ruhiger Morgenplan mit Freizeit",
      departureTitle: "Abreise",
      dinnerNearStay: "Abendessen oder lokales Erlebnis in der Nahe der Unterkunft",
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
      fallbackFocus: "Spaziergang und lokales Flair",
      fullDayTitle: (destination: string) => `Ein voller Tag in ${destination}`,
      homeCityFallback: "deiner Stadt",
      hourShort: "Std",
      itineraryFocus: (focus: string) => `Fokus auf ${lowerText(focus, language)}`,
      landmarkItem: "Wichtigste Sehenswurdigkeit oder Viertel",
      minuteShort: "Min",
      priceOnRequest: "Preis auf Anfrage",
      profileTipAccessibility: (homeBase: string, needs: string) =>
        `Prufe vor der Buchung die Barrierefreiheit von Transport und Unterkunft. Die Suche ist auf dein Profil aus ${homeBase} und diese Bedurfnisse abgestimmt: ${needs}.`,
      profileTipDefault: (homeBase: string) =>
        `Die Angebote sind nach praktischen Transport- und Unterkunftsoptionen ab ${homeBase} sortiert.`,
      profileTipHeading: "Profil-Tipp",
      profileTipStayStyle: (stayStyle: string, homeBase: string) =>
        `Die Angebote sind mit Prioritat auf ${lowerText(stayStyle, language)} und praktischen Transport ab ${homeBase} sortiert.`,
      stayHeading: "Unterkunft",
      summary: (params: {
        destination: string;
        interestLabel: string;
        stayCount: number;
        transportCount: number;
        windowLabel: string;
      }) =>
        `Wir haben ${params.transportCount} Live-Transportangebote und ${params.stayCount} Unterkunftsoptionen fur ${params.destination} im Zeitraum ${params.windowLabel} gefunden, abgestimmt auf ${params.interestLabel}.`,
      titleFallback: (destination: string) => `${destination}: Live-Reiseplan`,
      titleWithInterest: (destination: string, interest: string) =>
        `${destination}: Live-Plan fur ${lowerText(interest, language)}`,
      transportCheckIn: "Check-in in die ausgewahlte Unterkunft",
      transportDeparture: "Abreise mit der ausgewahlten Live-Transportoption",
      transportHeading: "Transport",
    };
  }

  if (language === "es") {
    return {
      arrivalFirstWalk: (destination: string) => `Un primer paseo tranquilo por ${destination}`,
      arrivalTitle: "Llegada y acomodo",
      budgetFallback: (budget: string) =>
        `Tu presupuesto esta fijado en ${budget}; algunas ofertas en vivo deben revisarse directamente en la web del proveedor.`,
      budgetFit: (estimatedTotal: number, days: string, budget: string) =>
        `Con ${budget}, la mejor opcion visible empieza en unos ${Math.round(estimatedTotal)} EUR en total para ${days}.`,
      budgetHeading: "Presupuesto",
      dayLabel: (dayNumber: number) => `Dia ${dayNumber}`,
      daysHeading: "Dias",
      departureBuffer: "Deja un margen para cambios en el transporte",
      departureCheckout: "Check-out y regreso",
      departureMorning: "Una manana tranquila con tiempo libre",
      departureTitle: "Salida",
      dinnerNearStay: "Cena o experiencia local cerca del alojamiento",
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
      fallbackFocus: "paseo y ambiente local",
      fullDayTitle: (destination: string) => `Un dia completo en ${destination}`,
      homeCityFallback: "tu ciudad",
      hourShort: "h",
      itineraryFocus: (focus: string) => `Enfoque en ${lowerText(focus, language)}`,
      landmarkItem: "Punto emblematico o barrio principal",
      minuteShort: "min",
      priceOnRequest: "Precio a consultar",
      profileTipAccessibility: (homeBase: string, needs: string) =>
        `Revisa la accesibilidad del transporte y del alojamiento antes de reservar. La busqueda esta ajustada a tu perfil desde ${homeBase} y a estas necesidades: ${needs}.`,
      profileTipDefault: (homeBase: string) =>
        `Las ofertas estan ordenadas priorizando transporte practico y alojamientos desde ${homeBase}.`,
      profileTipHeading: "Consejo del perfil",
      profileTipStayStyle: (stayStyle: string, homeBase: string) =>
        `Las ofertas estan ordenadas con prioridad para ${lowerText(stayStyle, language)} y transporte practico desde ${homeBase}.`,
      stayHeading: "Alojamiento",
      summary: (params: {
        destination: string;
        interestLabel: string;
        stayCount: number;
        transportCount: number;
        windowLabel: string;
      }) =>
        `Encontramos ${params.transportCount} ofertas en vivo de transporte y ${params.stayCount} opciones de alojamiento para ${params.destination} en la ventana ${params.windowLabel}, seleccionadas segun ${params.interestLabel}.`,
      titleFallback: (destination: string) => `${destination}: plan de viaje en vivo`,
      titleWithInterest: (destination: string, interest: string) =>
        `${destination}: plan en vivo para ${lowerText(interest, language)}`,
      transportCheckIn: "Check-in en el alojamiento elegido",
      transportDeparture: "Salida con la opcion de transporte en vivo elegida",
      transportHeading: "Transporte",
    };
  }

  if (language === "fr") {
    return {
      arrivalFirstWalk: (destination: string) => `Une premiere balade tranquille dans ${destination}`,
      arrivalTitle: "Arrivee et installation",
      budgetFallback: (budget: string) =>
        `Ton budget est fixe a ${budget} ; certaines offres en direct doivent etre verifiees directement sur le site du fournisseur.`,
      budgetFit: (estimatedTotal: number, days: string, budget: string) =>
        `Avec ${budget}, la meilleure option visible commence autour de ${Math.round(estimatedTotal)} EUR au total pour ${days}.`,
      budgetHeading: "Budget",
      dayLabel: (dayNumber: number) => `Jour ${dayNumber}`,
      daysHeading: "Jours",
      departureBuffer: "Garde une marge pour les changements de transport",
      departureCheckout: "Check-out et retour",
      departureMorning: "Matinee legere avec temps libre",
      departureTitle: "Depart",
      dinnerNearStay: "Diner ou experience locale pres de l'hebergement",
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
      fallbackFocus: "balade et ambiance locale",
      fullDayTitle: (destination: string) => `Une journee complete a ${destination}`,
      homeCityFallback: "ta ville",
      hourShort: "h",
      itineraryFocus: (focus: string) => `Focus sur ${lowerText(focus, language)}`,
      landmarkItem: "Site principal ou quartier a voir",
      minuteShort: "min",
      priceOnRequest: "Prix sur demande",
      profileTipAccessibility: (homeBase: string, needs: string) =>
        `Verifie l'accessibilite du transport et de l'hebergement avant de reserver. La recherche est ajustee a ton profil depuis ${homeBase} et a ces besoins : ${needs}.`,
      profileTipDefault: (homeBase: string) =>
        `Les offres sont classees selon les options de transport et d'hebergement les plus pratiques depuis ${homeBase}.`,
      profileTipHeading: "Conseil profil",
      profileTipStayStyle: (stayStyle: string, homeBase: string) =>
        `Les offres sont classees avec priorite pour ${lowerText(stayStyle, language)} et un transport pratique depuis ${homeBase}.`,
      stayHeading: "Hebergement",
      summary: (params: {
        destination: string;
        interestLabel: string;
        stayCount: number;
        transportCount: number;
        windowLabel: string;
      }) =>
        `Nous avons trouve ${params.transportCount} offres de transport en direct et ${params.stayCount} options d'hebergement pour ${params.destination} dans la fenetre ${params.windowLabel}, selectionnees selon ${params.interestLabel}.`,
      titleFallback: (destination: string) => `${destination} : plan de voyage en direct`,
      titleWithInterest: (destination: string, interest: string) =>
        `${destination} : plan en direct pour ${lowerText(interest, language)}`,
      transportCheckIn: "Check-in dans l'hebergement choisi",
      transportDeparture: "Depart avec l'option de transport en direct choisie",
      transportHeading: "Transport",
    };
  }

  return {
    arrivalFirstWalk: (destination: string) => `Лека първа разходка в ${destination}`,
    arrivalTitle: "Пристигане и настройка",
    budgetFallback: (budget: string) =>
      `Бюджетът е зададен като ${budget}; част от live офертите изискват директна проверка в сайта на доставчика.`,
    budgetFit: (estimatedTotal: number, days: string, budget: string) =>
      `При ${budget} най-добрият видим fit стартира около ${Math.round(estimatedTotal)} EUR общо за ${days}.`,
    budgetHeading: "Бюджет",
    dayLabel: (dayNumber: number) => `Ден ${dayNumber}`,
    daysHeading: "Дни",
    departureBuffer: "Запази буфер за транспортни промени",
    departureCheckout: "Check-out и тръгване обратно",
    departureMorning: "Сутрин с лек local план и свободно време",
    departureTitle: "Отпътуване",
    dinnerNearStay: "Вечеря / локално преживяване близо до stay-а",
    durationTbd: "Времето се уточнява",
    errorGeneric: "Не успяхме да заредим live transport и stay оферти. Опитай пак.",
    errorInternal: "Backend-ът върна вътрешна грешка при зареждане на live оферти.",
    errorInvalidFallback: "Локалният fallback върна невалидни travel данни. Опитай пак.",
    errorMissingFallbackKey:
      "Локалният fallback няма AI ключ. Добави EXPO_PUBLIC_GEMINI_API_KEY или ползвай Functions backend.",
    errorMissingFunction:
      "Липсва Firebase функцията searchOffers. Deploy-ни backend-а и опитай пак.",
    errorMissingProviderKeys:
      "Backend-ът няма настроени provider ключове. Провери Firebase Functions env променливите.",
    errorUnavailable: "Live travel backend-ът е недостъпен в момента. Опитай пак след малко.",
    fallbackFocus: "разходка и локална атмосфера",
    fullDayTitle: (destination: string) => `Пълен ден в ${destination}`,
    homeCityFallback: "твоя град",
    hourShort: "ч",
    itineraryFocus: (focus: string) => `Фокус върху ${lowerText(focus, language)}`,
    landmarkItem: "Основна забележителност или квартал",
    minuteShort: "мин",
    priceOnRequest: "Цена при запитване",
    profileTipAccessibility: (homeBase: string, needs: string) =>
      `Провери преди резервация достъпността на транспорта и stay-а. Търсенето е фокусирано спрямо профила ти от ${homeBase} и нуждите: ${needs}.`,
    profileTipDefault: (homeBase: string) =>
      `Офертите са подредени с приоритет към по-практичен транспорт и stay варианти от ${homeBase}.`,
    profileTipHeading: "Съвет според профила",
    profileTipStayStyle: (stayStyle: string, homeBase: string) =>
      `Офертите са подредени с приоритет към ${lowerText(stayStyle, language)} и практичен транспорт от ${homeBase}.`,
    stayHeading: "Настаняване",
    summary: (params: {
      destination: string;
      interestLabel: string;
      stayCount: number;
      transportCount: number;
      windowLabel: string;
    }) =>
      `Намерихме ${params.transportCount} реални transport оферти и ${params.stayCount} stay оферти за ${params.destination} в прозореца ${params.windowLabel}, подбрани според ${params.interestLabel}.`,
    titleFallback: (destination: string) => `${destination}: live travel план`,
    titleWithInterest: (destination: string, interest: string) =>
      `${destination}: live план за ${lowerText(interest, language)}`,
    transportCheckIn: "Check-in в избрания stay",
    transportDeparture: "Тръгване с избрания live transport вариант",
    transportHeading: "Транспорт",
  };
}

function formatMoney(
  amount: number | null,
  currency: string,
  language: AppLanguage = "bg"
) {
  const copy = getPlannerCopy(language);

  if (amount === null) {
    return copy.priceOnRequest;
  }

  return `${Math.round(amount)} ${currency}`;
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

function getInterestSummary(profile: DiscoverProfile) {
  return profile.interests.selectedOptions
    .map((interest) => interest.replace(/^[^\p{L}\p{N}]+/u, "").trim())
    .filter(Boolean)
    .slice(0, 3);
}

function buildPlanTitle(
  destination: string,
  profile: DiscoverProfile,
  language: AppLanguage = "bg"
) {
  const copy = getPlannerCopy(language);
  const topInterest = getInterestSummary(profile)[0];

  if (topInterest) {
    return copy.titleWithInterest(destination, topInterest);
  }

  return copy.titleFallback(destination);
}

function buildPlanSummary(params: {
  destination: string;
  language?: AppLanguage;
  profile: DiscoverProfile;
  stayCount: number;
  transportCount: number;
  windowLabel: string;
}) {
  const language = normalizePlannerLanguage(params.language);
  const copy = getPlannerCopy(language);
  const topInterests = getInterestSummary(params.profile);
  const interestLabel =
    topInterests.length > 0
      ? lowerText(topInterests.join(", "), language)
      : language === "en"
        ? "your preferences"
        : language === "de"
          ? "deine Vorlieben"
          : language === "es"
            ? "tus preferencias"
            : language === "fr"
              ? "tes preferences"
              : "твоите предпочитания";

  return copy.summary({
    destination: params.destination,
    interestLabel,
    stayCount: params.stayCount,
    transportCount: params.transportCount,
    windowLabel: params.windowLabel,
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
  const travelerCount = extractCount(params.travelers, 1);
  const nights = Math.max(extractCount(params.days, 3) - 1, 1);
  const roomCount = Math.max(1, Math.ceil(travelerCount / 2));
  const cheapestTransport = extractFirstNumber(params.transportOptions[0]?.price ?? "");
  const cheapestStay = extractFirstNumber(params.stayOptions[0]?.pricePerNight ?? "");

  if (cheapestTransport === null && cheapestStay === null) {
    return copy.budgetFallback(normalizedBudget);
  }

  const estimatedTotal =
    (cheapestTransport !== null ? cheapestTransport * travelerCount : 0) +
    (cheapestStay !== null ? cheapestStay * nights * roomCount : 0);

  return copy.budgetFit(estimatedTotal, params.days, normalizedBudget);
}

function buildProfileTip(
  profile: DiscoverProfile,
  language: AppLanguage = "bg"
) {
  const copy = getPlannerCopy(language);
  const accessibilityNeeds = [
    ...profile.assistance.selectedOptions,
    profile.assistance.note,
  ]
    .map((item) => item.trim())
    .filter(Boolean);
  const stayStyle = sanitizeString(profile.personalProfile.stayStyle);
  const homeBase = sanitizeString(profile.personalProfile.homeBase);

  if (accessibilityNeeds.length > 0) {
    return copy.profileTipAccessibility(
      homeBase || copy.homeCityFallback,
      accessibilityNeeds.slice(0, 2).join(", ")
    );
  }

  if (stayStyle) {
    return copy.profileTipStayStyle(
      stayStyle,
      homeBase || copy.homeCityFallback
    );
  }

  return copy.profileTipDefault(homeBase || copy.homeCityFallback);
}

function buildDayPlans(params: {
  days: string;
  destination: string;
  language?: AppLanguage;
  profile: DiscoverProfile;
}) {
  const language = normalizePlannerLanguage(params.language);
  const copy = getPlannerCopy(language);
  const dayCount = Math.max(extractCount(params.days, 3), 1);
  const interests = getInterestSummary(params.profile);
  const fallbackFocus = interests[0] || copy.fallbackFocus;

  return Array.from({ length: dayCount }, (_, index) => {
    const dayNumber = index + 1;

    if (dayNumber === 1) {
      return {
        dayLabel: copy.dayLabel(dayNumber),
        items: [
          copy.transportDeparture,
          copy.transportCheckIn,
          copy.arrivalFirstWalk(params.destination),
        ],
        title: copy.arrivalTitle,
      } satisfies PlannerDayPlan;
    }

    if (dayNumber === dayCount) {
      return {
        dayLabel: copy.dayLabel(dayNumber),
        items: [
          copy.departureMorning,
          copy.departureCheckout,
          copy.departureBuffer,
        ],
        title: copy.departureTitle,
      } satisfies PlannerDayPlan;
    }

    const focus = interests[(dayNumber - 2) % Math.max(interests.length, 1)] || fallbackFocus;

    return {
      dayLabel: copy.dayLabel(dayNumber),
      items: [
        copy.itineraryFocus(focus),
        copy.landmarkItem,
        copy.dinnerNearStay,
      ],
      title: copy.fullDayTitle(params.destination),
    } satisfies PlannerDayPlan;
  });
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
    `${copy.profileTipHeading}: ${plan.profileTip}`,
  ]
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
  const language = normalizePlannerLanguage(params.language);
  const offers = await searchTravelOffers(params);

  const transportOptions = offers.transportOptions.map((offer) => ({
    bookingUrl: offer.bookingUrl,
    duration: formatDuration(offer.durationMinutes, language),
    mode: offer.mode,
    note: offer.note,
    price: formatMoney(offer.priceAmount, offer.priceCurrency, language),
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
    pricePerNight: formatMoney(offer.priceAmount, offer.priceCurrency, language),
    ratingLabel: offer.ratingLabel,
    sourceLabel: offer.sourceLabel,
    type: offer.type,
  })) satisfies PlannerStayOption[];

  return {
    budgetNote: buildBudgetNote({
      budget: params.budget,
      days: params.days,
      language,
      stayOptions,
      transportOptions,
      travelers: params.travelers,
    }),
    language,
    profileTip: buildProfileTip(params.profile, language),
    stayOptions,
    summary: buildPlanSummary({
      destination: params.destination,
      language,
      profile: params.profile,
      stayCount: stayOptions.length,
      transportCount: transportOptions.length,
      windowLabel: offers.searchContext.windowLabel,
    }),
    title: buildPlanTitle(params.destination, params.profile, language),
    transportOptions,
    tripDays: buildDayPlans({
      days: params.days,
      destination: params.destination,
      language,
      profile: params.profile,
    }),
  } satisfies GroundedTravelPlan;
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
