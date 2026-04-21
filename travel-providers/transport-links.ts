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

function buildGoogleMapsTransitUrl(params: {
  destinationQuery: string;
  originQuery: string;
}) {
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("origin", params.originQuery);
  url.searchParams.set("destination", params.destinationQuery);
  url.searchParams.set("travelmode", "transit");
  return url.toString();
}

function buildGoogleFlightsUrl(params: {
  departureDate: string;
  destinationQuery: string;
  originQuery: string;
}) {
  const url = new URL("https://www.google.com/travel/flights");
  url.searchParams.set(
    "q",
    `Flights from ${params.originQuery} to ${params.destinationQuery} on ${params.departureDate}`
  );
  return url.toString();
}

function buildOmioSearchUrl(params: {
  departureDate: string;
  destinationQuery: string;
  originQuery: string;
}) {
  const url = new URL("https://www.omio.com/search");
  url.searchParams.set("departure_fk", params.originQuery);
  url.searchParams.set("arrival_fk", params.destinationQuery);
  url.searchParams.set("departure_date", params.departureDate);
  url.searchParams.set("adults", "1");
  return url.toString();
}

function shouldIncludeFlights(transportPreference: string) {
  const normalized = transportPreference.trim().toLowerCase();

  return (
    !normalized ||
    normalized.includes("any") ||
    normalized.includes("all") ||
    normalized.includes("flight") ||
    normalized.includes("plane") ||
    normalized.includes("самолет") ||
    normalized.includes("полет")
  );
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
  const offers: TransportSearchLinkOffer[] = [
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
    {
      bookingUrl: buildGoogleMapsTransitUrl({
        destinationQuery: destinationLabel,
        originQuery: originLabel,
      }),
      durationMinutes: null,
      mode: "Transit",
      note: `Open live public transport and driving directions for ${params.departureDate}.`,
      priceAmount: null,
      priceCurrency: params.currency,
      provider: "Google Maps",
      route: routeLabel,
      sourceLabel: "Google Maps",
    },
    {
      bookingUrl: buildOmioSearchUrl({
        departureDate: params.departureDate,
        destinationQuery: destinationLabel,
        originQuery: originLabel,
      }),
      durationMinutes: null,
      mode: modeLabel === "Flight" ? "Transit" : modeLabel,
      note: `Check train, bus, and mixed route availability for ${params.departureDate}.`,
      priceAmount: null,
      priceCurrency: params.currency,
      provider: "Omio",
      route: routeLabel,
      sourceLabel: "Omio",
    },
  ];

  if (shouldIncludeFlights(params.transportPreference)) {
    offers.push({
      bookingUrl: buildGoogleFlightsUrl({
        departureDate: params.departureDate,
        destinationQuery: destinationLabel,
        originQuery: originLabel,
      }),
      durationMinutes: null,
      mode: "Flight",
      note: `Compare flight availability for ${params.departureDate}.`,
      priceAmount: null,
      priceCurrency: params.currency,
      provider: "Google Flights",
      route: routeLabel,
      sourceLabel: "Google Flights",
    });
  }

  return offers.slice(0, 4) satisfies TransportSearchLinkOffer[];
}
