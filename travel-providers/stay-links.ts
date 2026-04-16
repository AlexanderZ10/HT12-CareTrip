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
  providerKey: "airbnb" | "booking" | "rome2rio";
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
