import { HttpsError, onCall } from "firebase-functions/v2/https";

import { searchBusbudOffers } from "../../travel-providers/busbud";
import {
  searchSkyscannerFlightOffers,
  searchSkyscannerHotelOffers,
} from "../../travel-providers/skyscanner";

type SearchOffersPayload = {
  adults?: number;
  departureDate?: string;
  destinationQuery?: string;
  locale?: string;
  market?: string;
  originQuery?: string;
  returnDate?: string;
  stayStyle?: string;
  transportPreference?: string;
};

function sanitizeString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function sanitizeNumber(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return fallback;
}

function parseIsoDate(value: string) {
  const [year, month, day] = value.split("-").map((part) => Number(part));

  if (!year || !month || !day) {
    throw new HttpsError("invalid-argument", `Invalid ISO date: ${value}`);
  }

  return { day, month, year };
}

function formatMinutes(value: number | null) {
  if (value === null) {
    return "Времето се уточнява";
  }

  const hours = Math.floor(value / 60);
  const minutes = value % 60;

  if (hours <= 0) {
    return `${minutes} мин`;
  }

  if (minutes === 0) {
    return `${hours} ч`;
  }

  return `${hours} ч ${minutes} мин`;
}

function formatMoney(amount: number | null, currency: string) {
  if (amount === null) {
    return "Цена при запитване";
  }

  return `${Math.round(amount)} ${currency}`;
}

function preferTransportOrder(
  transportPreference: string,
  flights: Awaited<ReturnType<typeof searchSkyscannerFlightOffers>>,
  buses: Awaited<ReturnType<typeof searchBusbudOffers>>
) {
  const normalizedPreference = transportPreference.toLowerCase();
  const transportOffers =
    normalizedPreference.includes("автобус") || normalizedPreference.includes("влак")
      ? [...buses, ...flights]
      : normalizedPreference.includes("кола") || normalizedPreference.includes("спод")
        ? [...buses, ...flights]
        : [...flights, ...buses];

  return transportOffers.slice(0, 4).map((offer) => ({
    bookingUrl: offer.bookingUrl,
    durationMinutes: offer.durationMinutes ?? null,
    mode: offer.mode === "bus" ? "Автобус" : "Самолет",
    note:
      offer.mode === "bus"
        ? `${offer.note || "Реална автобусна оферта"} • ${formatMinutes(
            offer.durationMinutes ?? null
          )}`
        : `${offer.note || "Реална самолетна оферта"} • ${formatMinutes(
            offer.durationMinutes ?? null
          )}`,
    priceAmount: offer.priceAmount,
    priceCurrency: offer.priceCurrency,
    provider: offer.mode === "bus" ? offer.company : offer.provider,
    route: offer.route,
    sourceLabel: offer.sourceLabel,
  }));
}

function normalizeStayType(stayStyle: string, type: string) {
  if (stayStyle.toLowerCase().includes("къщи")) {
    return type || "Къща за гости";
  }

  if (stayStyle.toLowerCase().includes("бутиков")) {
    return type || "Бутиков хотел";
  }

  return type || "Хотел";
}

export const searchOffers = onCall({ region: "us-central1" }, async (request) => {
  const data = (request.data ?? {}) as SearchOffersPayload;
  const destinationQuery = sanitizeString(data.destinationQuery);
  const originQuery = sanitizeString(data.originQuery);
  const departureDate = sanitizeString(data.departureDate);
  const returnDate = sanitizeString(data.returnDate);

  if (!destinationQuery || !originQuery || !departureDate || !returnDate) {
    throw new HttpsError("invalid-argument", "Missing search inputs.");
  }

  const skyscannerApiKey = sanitizeString(process.env.SKYSCANNER_API_KEY);

  if (!skyscannerApiKey) {
    throw new HttpsError(
      "failed-precondition",
      "Missing SKYSCANNER_API_KEY in Firebase Functions environment."
    );
  }

  const adults = sanitizeNumber(data.adults, 1);
  const locale = sanitizeString(data.locale, "bg-BG");
  const market = sanitizeString(data.market, "BG");
  const currency = "EUR";
  const notes: string[] = [];

  const [flights, hotels] = await Promise.all([
    searchSkyscannerFlightOffers({
      adults,
      apiKey: skyscannerApiKey,
      checkInDate: parseIsoDate(departureDate),
      checkOutDate: parseIsoDate(returnDate),
      currency,
      destinationQuery,
      locale,
      market,
      maxResults: 4,
      originQuery,
    }),
    searchSkyscannerHotelOffers({
      adults,
      apiKey: skyscannerApiKey,
      checkInDate: parseIsoDate(departureDate),
      checkOutDate: parseIsoDate(returnDate),
      currency,
      destinationQuery,
      locale,
      market,
      maxResults: 4,
      originQuery,
    }),
  ]);

  let buses: Awaited<ReturnType<typeof searchBusbudOffers>> = [];
  const busbudEndpoint = sanitizeString(process.env.BUSBUD_SEARCH_ENDPOINT);
  const busbudApiKey = sanitizeString(process.env.BUSBUD_API_KEY);

  if (busbudEndpoint && busbudApiKey) {
    try {
      buses = await searchBusbudOffers({
        adults,
        apiKey: busbudApiKey,
        departureDate,
        destinationQuery,
        endpoint: busbudEndpoint,
        locale,
        originQuery,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Busbud search failed";
      notes.push(`Busbud not available: ${message}`);
    }
  } else {
    notes.push("Bus offers require BUSBUD_SEARCH_ENDPOINT and BUSBUD_API_KEY.");
  }

  if (flights.length === 0 && hotels.length === 0 && buses.length === 0) {
    throw new HttpsError("not-found", "No live offers were returned by the configured providers.");
  }

  return {
    notes,
    searchContext: {
      departureDate,
      nights: Math.max(
        1,
        Math.round(
          (new Date(returnDate).getTime() - new Date(departureDate).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      ),
      returnDate,
      windowLabel: `${departureDate} → ${returnDate}`,
    },
    stayOptions: hotels
      .slice(0, 4)
      .map((offer) => ({
        area: offer.area,
        bookingUrl: offer.bookingUrl,
        imageUrl: offer.imageUrl,
        name: offer.name,
        note: offer.ratingLabel ? `${offer.note} • ${offer.ratingLabel}` : offer.note,
        priceAmount: offer.priceAmount,
        priceCurrency: offer.priceCurrency,
        ratingLabel: offer.ratingLabel,
        sourceLabel: offer.sourceLabel,
        type: normalizeStayType(sanitizeString(data.stayStyle), offer.type),
      })),
    transportOptions: preferTransportOrder(
      sanitizeString(data.transportPreference),
      flights,
      buses
    ).map((offer) => ({
      ...offer,
      note: `${offer.note} • ${formatMoney(offer.priceAmount, offer.priceCurrency)}`,
    })),
  };
});
