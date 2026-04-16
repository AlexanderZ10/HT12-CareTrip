import { buildRome2RioRouteUrl } from "./rome2rio-links";

export type TransportSearchLinkOffer = {
  bookingUrl: string;
  durationMinutes: number | null;
  mode: string;
  note: string;
  priceAmount: number | null;
  priceCurrency: string;
  provider: string;
  route: string;
  sourceLabel: string;
};

function normalizeTransportModeLabel(transportPreference: string) {
  const normalized = transportPreference.trim().toLowerCase();

  if (
    normalized.includes("train") ||
    normalized.includes("влак") ||
    normalized.includes("zug") ||
    normalized.includes("tren")
  ) {
    return "Train";
  }

  if (
    normalized.includes("bus") ||
    normalized.includes("автобус") ||
    normalized.includes("coach")
  ) {
    return "Bus";
  }

  if (
    normalized.includes("flight") ||
    normalized.includes("plane") ||
    normalized.includes("самолет") ||
    normalized.includes("полет")
  ) {
    return "Flight";
  }

  return "Transit";
}

function normalizeLocation(value: string, fallback: string) {
  return value.trim() || fallback;
}

export function buildTransportSearchLinkOffers(params: {
  currency: string;
  departureDate: string;
  destinationQuery: string;
  originQuery: string;
  transportPreference: string;
}) {
  const originLabel = normalizeLocation(params.originQuery, "your origin");
  const destinationLabel = normalizeLocation(params.destinationQuery, "your destination");
  const routeLabel = `${originLabel} → ${destinationLabel}`;
  const modeLabel = normalizeTransportModeLabel(params.transportPreference);

  return [
    {
      bookingUrl: buildRome2RioRouteUrl({
        destinationQuery: destinationLabel,
        originQuery: originLabel,
      }),
      durationMinutes: null,
      mode: modeLabel,
      note: `Compare current route options and operators for ${params.departureDate}.`,
      priceAmount: null,
      priceCurrency: params.currency,
      provider: "Rome2Rio",
      route: routeLabel,
      sourceLabel: "Rome2Rio",
    },
  ] satisfies TransportSearchLinkOffer[];
}
