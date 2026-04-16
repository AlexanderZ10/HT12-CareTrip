function normalizeLocation(value: string, fallback: string) {
  return value.trim() || fallback;
}

function toRome2RioSegment(value: string) {
  return encodeURIComponent(
    value
      .trim()
      .replace(/[,_/]+/g, " ")
      .replace(/\s+/g, "-")
  );
}

function normalizeTransportModeLabel(transportPreference?: string) {
  const normalized = (transportPreference || "").trim().toLowerCase();

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

  return "";
}

export function buildRome2RioRouteUrl(params: {
  destinationQuery: string;
  originQuery: string;
}) {
  const originLabel = normalizeLocation(params.originQuery, "your origin");
  const destinationLabel = normalizeLocation(params.destinationQuery, "your destination");

  return `https://www.rome2rio.com/s/${toRome2RioSegment(originLabel)}/${toRome2RioSegment(destinationLabel)}`;
}

export function buildRome2RioHotelsUrl(params: {
  destinationQuery: string;
  originQuery?: string;
  transportPreference?: string;
}) {
  const destinationLabel = normalizeLocation(params.destinationQuery, "your destination");
  const url = new URL(`https://www.rome2rio.com/hotels/${toRome2RioSegment(destinationLabel)}`);
  const originLabel = params.originQuery?.trim();
  const routeLabel = normalizeTransportModeLabel(params.transportPreference);

  if (originLabel) {
    url.searchParams.set("origin", originLabel.replace(/\s+/g, "-"));
  }

  if (routeLabel) {
    url.searchParams.set("route", routeLabel);
  }

  return url.toString();
}
