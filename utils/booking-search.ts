import { httpsCallable } from "firebase/functions";

import { functions } from "../firebase";
import type {
  LiveStayOffer,
  LiveTravelOffer,
  LiveTravelOffersResponse,
} from "./travel-offers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BookingSearchParams = {
  origin: string;
  destination: string;
  departureDate: string; // YYYY-MM-DD
  returnDate?: string;
  passengers: number;
  currency?: string;
  transportPreference?: string;
  stayStyle?: string;
};

export type TransportResult = {
  provider: string;
  mode: string;
  route: string;
  departureTime: string;
  arrivalTime: string;
  duration: string;
  price: string;
  priceValue: number;
  bookingUrl: string | null;
  logoUrl: string | null;
};

export type AccommodationResult = {
  name: string;
  type: string;
  area: string;
  pricePerNight: string;
  priceValue: number;
  rating: number | null;
  bookingUrl: string | null;
  imageUrl: string | null;
};

export type BookingSearchResult = {
  transport: TransportResult[];
  accommodation: AccommodationResult[];
  searchedAt: number;
};

// ---------------------------------------------------------------------------
// Sanitizers
// ---------------------------------------------------------------------------

function sanitizeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function sanitizeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Duration helpers
// ---------------------------------------------------------------------------

function formatDurationMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || minutes <= 0) {
    return "Duration TBD";
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours <= 0) {
    return `${remainingMinutes}m`;
  }

  if (remainingMinutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remainingMinutes}m`;
}

/**
 * Estimate an arrival time from a departure date/time and duration in minutes.
 * Returns an ISO-ish time string or a placeholder.
 */
function estimateArrivalTime(
  departureDate: string,
  durationMinutes: number | null | undefined
): string {
  if (
    durationMinutes === null ||
    durationMinutes === undefined ||
    durationMinutes <= 0
  ) {
    return "";
  }

  try {
    const departure = new Date(departureDate);

    if (isNaN(departure.getTime())) {
      return "";
    }

    const arrival = new Date(departure.getTime() + durationMinutes * 60_000);
    return arrival.toISOString();
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Converters — map LiveTravelOffer / LiveStayOffer to our result types
// ---------------------------------------------------------------------------

function convertTransportOffer(
  offer: LiveTravelOffer,
  departureDate: string,
  currency: string
): TransportResult {
  const priceValue = offer.priceAmount ?? 0;

  return {
    provider: offer.provider || offer.sourceLabel || "Provider",
    mode: offer.mode || "transport",
    route: offer.route || "",
    departureTime: departureDate,
    arrivalTime: estimateArrivalTime(departureDate, offer.durationMinutes),
    duration: formatDurationMinutes(offer.durationMinutes),
    price: formatPrice(priceValue, currency),
    priceValue,
    bookingUrl: offer.bookingUrl || null,
    logoUrl: null,
  };
}

function convertStayOffer(
  offer: LiveStayOffer,
  currency: string
): AccommodationResult {
  const priceValue = offer.priceAmount ?? 0;
  const ratingNumber = parseRatingLabel(offer.ratingLabel);

  return {
    name: offer.name || "Accommodation",
    type: offer.type || "Hotel",
    area: offer.area || "",
    pricePerNight: formatPrice(priceValue, currency),
    priceValue,
    rating: ratingNumber,
    bookingUrl: offer.bookingUrl || null,
    imageUrl: offer.imageUrl || null,
  };
}

/**
 * Attempt to extract a numeric rating from a label like "8.5/10" or "4.2".
 */
function parseRatingLabel(label: string): number | null {
  if (!label) {
    return null;
  }

  const match = label.match(/(\d+(?:\.\d+)?)/);

  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

// ---------------------------------------------------------------------------
// Default return date (next day if none provided)
// ---------------------------------------------------------------------------

function defaultReturnDate(departureDate: string): string {
  try {
    const departure = new Date(departureDate);

    if (isNaN(departure.getTime())) {
      return departureDate;
    }

    departure.setDate(departure.getDate() + 1);
    return departure.toISOString().slice(0, 10);
  } catch {
    return departureDate;
  }
}

// ---------------------------------------------------------------------------
// Main search function
// ---------------------------------------------------------------------------

/**
 * Search for transport and accommodation offers via the deployed
 * `searchOffers` Firebase Cloud Function.
 *
 * This provides a unified, normalised interface over the existing function
 * that already calls Skyscanner + Busbud under the hood.
 */
export async function searchBookings(
  params: BookingSearchParams
): Promise<BookingSearchResult> {
  const returnDate = params.returnDate || defaultReturnDate(params.departureDate);
  const currency = params.currency ?? "EUR";

  const callable = httpsCallable<
    {
      adults: number;
      departureDate: string;
      destinationQuery: string;
      locale: string;
      market: string;
      originQuery: string;
      returnDate: string;
      stayStyle: string;
      transportPreference: string;
    },
    LiveTravelOffersResponse
  >(functions, "searchOffers");

  const response = await callable({
    adults: Math.max(params.passengers, 1),
    departureDate: params.departureDate,
    destinationQuery: params.destination,
    locale: "bg-BG",
    market: "BG",
    originQuery: params.origin,
    returnDate,
    stayStyle: sanitizeString(params.stayStyle, "Mixed"),
    transportPreference: sanitizeString(params.transportPreference, "any"),
  });

  const data = response.data as unknown as Record<string, unknown>;

  // Parse transport options
  const rawTransport = Array.isArray(data.transportOptions)
    ? data.transportOptions
    : [];

  const transport: TransportResult[] = rawTransport
    .map((item: unknown) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const raw = item as Record<string, unknown>;
      const offer: LiveTravelOffer = {
        bookingUrl: sanitizeString(raw.bookingUrl),
        durationMinutes: sanitizeNumber(raw.durationMinutes),
        mode: sanitizeString(raw.mode, "transport"),
        note: sanitizeString(raw.note),
        priceAmount: sanitizeNumber(raw.priceAmount),
        priceCurrency: sanitizeString(raw.priceCurrency, currency),
        provider: sanitizeString(raw.provider, "Provider"),
        route: sanitizeString(raw.route),
        sourceLabel: sanitizeString(raw.sourceLabel, "Provider"),
      };

      return convertTransportOffer(offer, params.departureDate, currency);
    })
    .filter((item): item is TransportResult => item !== null);

  // Parse accommodation options
  const rawStay = Array.isArray(data.stayOptions) ? data.stayOptions : [];

  const accommodation: AccommodationResult[] = rawStay
    .map((item: unknown) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const raw = item as Record<string, unknown>;
      const offer: LiveStayOffer = {
        area: sanitizeString(raw.area),
        bookingUrl: sanitizeString(raw.bookingUrl),
        imageUrl: sanitizeString(raw.imageUrl),
        name: sanitizeString(raw.name, "Accommodation"),
        note: sanitizeString(raw.note),
        priceAmount: sanitizeNumber(raw.priceAmount),
        priceCurrency: sanitizeString(raw.priceCurrency, currency),
        ratingLabel: sanitizeString(raw.ratingLabel),
        sourceLabel: sanitizeString(raw.sourceLabel, "Provider"),
        type: sanitizeString(raw.type, "Hotel"),
      };

      return convertStayOffer(offer, currency);
    })
    .filter((item): item is AccommodationResult => item !== null);

  return {
    transport,
    accommodation,
    searchedAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Price formatting
// ---------------------------------------------------------------------------

/**
 * Format a numeric price with its currency code.
 */
export function formatPrice(
  value: number,
  currency: string = "EUR"
): string {
  if (value <= 0) {
    return `Price on request`;
  }

  return `${value.toFixed(0)} ${currency}`;
}

// ---------------------------------------------------------------------------
// Deep-link / fallback search URL helpers
// ---------------------------------------------------------------------------

/**
 * Build a Booking.com search URL for a given destination and date range.
 */
export function getBookingSearchUrl(
  destination: string,
  checkIn: string,
  checkOut?: string
): string {
  const params = new URLSearchParams({
    ss: destination,
    checkin: checkIn,
    ...(checkOut ? { checkout: checkOut } : {}),
  });

  return `https://www.booking.com/searchresults.html?${params.toString()}`;
}

/**
 * Build a Google Flights search URL for a given route and date.
 */
export function getFlightSearchUrl(
  origin: string,
  destination: string,
  date: string
): string {
  return `https://www.google.com/travel/flights?q=flights+from+${encodeURIComponent(
    origin
  )}+to+${encodeURIComponent(destination)}+on+${date}`;
}
