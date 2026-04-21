import { buildRome2RioHotelsUrl } from "./rome2rio-links";
import type { TravelDateParts } from "./skyscanner";

export type StaySearchLinkOffer = {
  area: string;
  bookingUrl: string;
  imageUrl: string;
  name: string;
  note: string;
  priceAmount: number | null;
  priceCurrency: string;
  providerAccommodationId: string;
  providerKey: "airbnb" | "booking" | "google-hotels" | "rome2rio";
  providerPaymentModes: string[];
  providerProductId: string;
  ratingLabel: string;
  reservationMode: "provider_redirect";
  sourceLabel: string;
  type: string;
};

function toIsoDate(value: TravelDateParts) {
  return `${value.year}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;
}

function normalizeDestinationLabel(value: string) {
  return value.trim() || "your destination";
}

function buildBookingSearchUrl(params: {
  adults: number;
  checkInDate: string;
  checkOutDate: string;
  currency: string;
  destinationQuery: string;
}) {
  const rooms = Math.max(1, Math.ceil(params.adults / 2));
  const url = new URL("https://www.booking.com/searchresults.html");
  url.searchParams.set("ss", params.destinationQuery);
  url.searchParams.set("checkin", params.checkInDate);
  url.searchParams.set("checkout", params.checkOutDate);
  url.searchParams.set("group_adults", String(params.adults));
  url.searchParams.set("no_rooms", String(rooms));
  url.searchParams.set("selected_currency", params.currency);
  return url.toString();
}

function buildAirbnbSearchUrl(params: {
  adults: number;
  checkInDate: string;
  checkOutDate: string;
  destinationQuery: string;
}) {
  const url = new URL(`https://www.airbnb.com/s/${encodeURIComponent(params.destinationQuery)}/homes`);
  url.searchParams.set("checkin", params.checkInDate);
  url.searchParams.set("checkout", params.checkOutDate);
  url.searchParams.set("adults", String(params.adults));
  return url.toString();
}

function buildGoogleHotelsUrl(params: {
  adults: number;
  checkInDate: string;
  checkOutDate: string;
  destinationQuery: string;
}) {
  const url = new URL(`https://www.google.com/travel/hotels/${encodeURIComponent(params.destinationQuery)}`);
  url.searchParams.set("checkin", params.checkInDate);
  url.searchParams.set("checkout", params.checkOutDate);
  url.searchParams.set("adults", String(params.adults));
  return url.toString();
}

export function buildStaySearchLinkOffers(params: {
  adults: number;
  checkInDate: TravelDateParts;
  checkOutDate: TravelDateParts;
  currency: string;
  destinationQuery: string;
  originQuery?: string;
  transportPreference?: string;
}) {
  const destinationLabel = normalizeDestinationLabel(params.destinationQuery);
  const checkInDate = toIsoDate(params.checkInDate);
  const checkOutDate = toIsoDate(params.checkOutDate);

  return [
    {
      area: destinationLabel,
      bookingUrl: buildBookingSearchUrl({
        adults: params.adults,
        checkInDate,
        checkOutDate,
        currency: params.currency,
        destinationQuery: destinationLabel,
      }),
      imageUrl: "",
      name: `Booking.com stays in ${destinationLabel}`,
      note: `Search Booking.com inventory for ${checkInDate} → ${checkOutDate}.`,
      priceAmount: null,
      priceCurrency: params.currency,
      providerAccommodationId: "",
      providerKey: "booking",
      providerPaymentModes: [],
      providerProductId: "",
      ratingLabel: "",
      reservationMode: "provider_redirect",
      sourceLabel: "Booking.com",
      type: "Hotel search",
    },
    {
      area: destinationLabel,
      bookingUrl: buildAirbnbSearchUrl({
        adults: params.adults,
        checkInDate,
        checkOutDate,
        destinationQuery: destinationLabel,
      }),
      imageUrl: "",
      name: `Airbnb homes in ${destinationLabel}`,
      note: `Search apartment and home stays for ${checkInDate} → ${checkOutDate}.`,
      priceAmount: null,
      priceCurrency: params.currency,
      providerAccommodationId: "",
      providerKey: "airbnb",
      providerPaymentModes: [],
      providerProductId: "",
      ratingLabel: "",
      reservationMode: "provider_redirect",
      sourceLabel: "Airbnb",
      type: "Home search",
    },
    {
      area: destinationLabel,
      bookingUrl: buildGoogleHotelsUrl({
        adults: params.adults,
        checkInDate,
        checkOutDate,
        destinationQuery: destinationLabel,
      }),
      imageUrl: "",
      name: `Google Hotels in ${destinationLabel}`,
      note: `Compare hotel providers for ${checkInDate} → ${checkOutDate}.`,
      priceAmount: null,
      priceCurrency: params.currency,
      providerAccommodationId: "",
      providerKey: "google-hotels",
      providerPaymentModes: [],
      providerProductId: "",
      ratingLabel: "",
      reservationMode: "provider_redirect",
      sourceLabel: "Google Hotels",
      type: "Hotel comparison",
    },
    {
      area: destinationLabel,
      bookingUrl: buildRome2RioHotelsUrl({
        destinationQuery: destinationLabel,
        originQuery: params.originQuery,
        transportPreference: params.transportPreference,
      }),
      imageUrl: "",
      name: `Rome2Rio hotels in ${destinationLabel}`,
      note: `Open a unified Rome2Rio hotels view for ${checkInDate} → ${checkOutDate}.`,
      priceAmount: null,
      priceCurrency: params.currency,
      providerAccommodationId: "",
      providerKey: "rome2rio",
      providerPaymentModes: [],
      providerProductId: "",
      ratingLabel: "",
      reservationMode: "provider_redirect",
      sourceLabel: "Rome2Rio",
      type: "Hotel search",
    },
  ] satisfies StaySearchLinkOffer[];
}
