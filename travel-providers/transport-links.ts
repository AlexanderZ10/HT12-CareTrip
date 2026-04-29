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

type DirectOperatorTemplate = {
  aliases?: string[];
  bookingUrl: string;
  mode: "Bus" | "Flight" | "Train";
  provider: string;
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

function shouldIncludeGroundTransport(transportPreference: string) {
  const normalized = transportPreference.trim().toLowerCase();

  return (
    !normalized ||
    normalized.includes("any") ||
    normalized.includes("all") ||
    normalized.includes("ground") ||
    normalized.includes("land") ||
    normalized.includes("train") ||
    normalized.includes("влак") ||
    normalized.includes("bus") ||
    normalized.includes("автобус") ||
    normalized.includes("coach")
  );
}

function shouldIncludeBus(transportPreference: string) {
  const normalized = transportPreference.trim().toLowerCase();

  return (
    !normalized ||
    normalized.includes("any") ||
    normalized.includes("all") ||
    normalized.includes("ground") ||
    normalized.includes("land") ||
    normalized.includes("bus") ||
    normalized.includes("автобус") ||
    normalized.includes("coach")
  );
}

function shouldIncludeTrain(transportPreference: string) {
  const normalized = transportPreference.trim().toLowerCase();

  return (
    !normalized ||
    normalized.includes("any") ||
    normalized.includes("all") ||
    normalized.includes("ground") ||
    normalized.includes("land") ||
    normalized.includes("train") ||
    normalized.includes("влак")
  );
}

const DIRECT_FLIGHT_OPERATORS: DirectOperatorTemplate[] = [
  // Low-cost carriers
  { aliases: ["wizz"], bookingUrl: "https://wizzair.com/en-gb", mode: "Flight", provider: "Wizz Air" },
  { bookingUrl: "https://www.ryanair.com/gb/en", mode: "Flight", provider: "Ryanair" },
  { bookingUrl: "https://www.easyjet.com/en", mode: "Flight", provider: "easyJet" },
  { bookingUrl: "https://www.vueling.com/en", mode: "Flight", provider: "Vueling" },
  { bookingUrl: "https://www.eurowings.com/en.html", mode: "Flight", provider: "Eurowings" },
  { aliases: ["norwegian air"], bookingUrl: "https://www.norwegian.com/en/", mode: "Flight", provider: "Norwegian" },
  { aliases: ["pegasus"], bookingUrl: "https://www.flypgs.com/en", mode: "Flight", provider: "Pegasus Airlines" },
  { bookingUrl: "https://www.sunexpress.com/en/", mode: "Flight", provider: "SunExpress" },
  { bookingUrl: "https://www.transavia.com/en-EU/home/", mode: "Flight", provider: "Transavia" },
  // European flag carriers
  { bookingUrl: "https://www.lufthansa.com/", mode: "Flight", provider: "Lufthansa" },
  { aliases: ["turkish", "thy"], bookingUrl: "https://www.turkishairlines.com/", mode: "Flight", provider: "Turkish Airlines" },
  { bookingUrl: "https://www.airfrance.com/", mode: "Flight", provider: "Air France" },
  { bookingUrl: "https://www.klm.com/", mode: "Flight", provider: "KLM" },
  { bookingUrl: "https://www.britishairways.com/", mode: "Flight", provider: "British Airways" },
  { bookingUrl: "https://www.iberia.com/", mode: "Flight", provider: "Iberia" },
  { bookingUrl: "https://www.aireuropa.com/en/flights", mode: "Flight", provider: "Air Europa" },
  { bookingUrl: "https://www.austrian.com/", mode: "Flight", provider: "Austrian Airlines" },
  { bookingUrl: "https://www.swiss.com/", mode: "Flight", provider: "SWISS" },
  { bookingUrl: "https://www.lot.com/", mode: "Flight", provider: "LOT Polish Airlines" },
  { bookingUrl: "https://www.aegeanair.com/", mode: "Flight", provider: "Aegean Airlines" },
  { bookingUrl: "https://www.tap.pt/", mode: "Flight", provider: "TAP Air Portugal" },
  { bookingUrl: "https://www.sas.se/en/", mode: "Flight", provider: "SAS" },
  { bookingUrl: "https://www.finnair.com/", mode: "Flight", provider: "Finnair" },
  { bookingUrl: "https://www.airbaltic.com/", mode: "Flight", provider: "airBaltic" },
  { aliases: ["bulgaria airlines", "fb"], bookingUrl: "https://air.bg/en", mode: "Flight", provider: "Bulgaria Air" },
  { bookingUrl: "https://www.airmoldova.md/", mode: "Flight", provider: "Air Moldova" },
  { bookingUrl: "https://www.airserbia.com/en", mode: "Flight", provider: "Air Serbia" },
  { bookingUrl: "https://www.ita-airways.com/en_en/", mode: "Flight", provider: "ITA Airways" },
  { bookingUrl: "https://www.brusselsairlines.com/", mode: "Flight", provider: "Brussels Airlines" },
  { bookingUrl: "https://www.croatiaairlines.com/", mode: "Flight", provider: "Croatia Airlines" },
  { bookingUrl: "https://www.tarom.ro/en", mode: "Flight", provider: "TAROM" },
  // Gulf carriers
  { aliases: ["qatar", "qr"], bookingUrl: "https://www.qatarairways.com/en/book.html", mode: "Flight", provider: "Qatar Airways" },
  { aliases: ["emirates airlines", "ek"], bookingUrl: "https://www.emirates.com/english/book/", mode: "Flight", provider: "Emirates" },
  { bookingUrl: "https://www.etihad.com/", mode: "Flight", provider: "Etihad Airways" },
  { bookingUrl: "https://www.flydubai.com/", mode: "Flight", provider: "flydubai" },
  { bookingUrl: "https://www.gulfair.com/", mode: "Flight", provider: "Gulf Air" },
  { bookingUrl: "https://www.omanair.com/", mode: "Flight", provider: "Oman Air" },
  { bookingUrl: "https://www.kuwaitairways.com/", mode: "Flight", provider: "Kuwait Airways" },
  { bookingUrl: "https://www.saudia.com/", mode: "Flight", provider: "Saudia" },
  { bookingUrl: "https://www.egyptair.com/", mode: "Flight", provider: "Egyptair" },
  { bookingUrl: "https://www.rj.com/", mode: "Flight", provider: "Royal Jordanian" },
  // Americas & Asia-Pacific
  { bookingUrl: "https://www.delta.com/", mode: "Flight", provider: "Delta Air Lines" },
  { bookingUrl: "https://www.united.com/", mode: "Flight", provider: "United Airlines" },
  { bookingUrl: "https://www.aa.com/", mode: "Flight", provider: "American Airlines" },
  { bookingUrl: "https://www.aircanada.com/", mode: "Flight", provider: "Air Canada" },
  { bookingUrl: "https://www.jetblue.com/", mode: "Flight", provider: "JetBlue" },
  { bookingUrl: "https://www.singaporeair.com/", mode: "Flight", provider: "Singapore Airlines" },
  { bookingUrl: "https://www.cathaypacific.com/", mode: "Flight", provider: "Cathay Pacific" },
  { bookingUrl: "https://www.ana.co.jp/en/us/", mode: "Flight", provider: "ANA" },
  { bookingUrl: "https://www.jal.co.jp/ar/en/", mode: "Flight", provider: "Japan Airlines" },
  { bookingUrl: "https://www.koreanair.com/", mode: "Flight", provider: "Korean Air" },
  { bookingUrl: "https://www.qantas.com/", mode: "Flight", provider: "Qantas" },
];

const DIRECT_BUS_OPERATORS: DirectOperatorTemplate[] = [
  { bookingUrl: "https://www.flixbus.com/", mode: "Bus", provider: "FlixBus" },
  { bookingUrl: "https://union-ivkoni.com/en", mode: "Bus", provider: "Union Ivkoni" },
  { bookingUrl: "https://www.alsa.com/en/web/bus/home", mode: "Bus", provider: "ALSA" },
  { bookingUrl: "https://www.avanzabus.com/", mode: "Bus", provider: "Avanza" },
];

const DIRECT_TRAIN_OPERATORS: DirectOperatorTemplate[] = [
  { bookingUrl: "https://www.renfe.com/es/en", mode: "Train", provider: "Renfe" },
  { bookingUrl: "https://www.bahn.com/en", mode: "Train", provider: "Deutsche Bahn" },
  { bookingUrl: "https://www.oebb.at/en/", mode: "Train", provider: "OBB" },
  { bookingUrl: "https://www.bdz.bg/en", mode: "Train", provider: "BDZ" },
];

function getDirectOperatorTemplates(transportPreference: string, preferredMode: string) {
  if (preferredMode === "Flight") {
    return DIRECT_FLIGHT_OPERATORS;
  }

  if (preferredMode === "Bus") {
    return DIRECT_BUS_OPERATORS;
  }

  if (preferredMode === "Train") {
    return DIRECT_TRAIN_OPERATORS;
  }

  const operators: DirectOperatorTemplate[] = [];

  if (shouldIncludeFlights(transportPreference)) {
    operators.push(...DIRECT_FLIGHT_OPERATORS);
  }

  if (shouldIncludeBus(transportPreference)) {
    operators.push(...DIRECT_BUS_OPERATORS);
  }

  if (shouldIncludeTrain(transportPreference)) {
    operators.push(...DIRECT_TRAIN_OPERATORS);
  }

  if (operators.length === 0 && shouldIncludeGroundTransport(transportPreference)) {
    operators.push(...DIRECT_BUS_OPERATORS, ...DIRECT_TRAIN_OPERATORS);
  }

  return operators.length > 0 ? operators : DIRECT_FLIGHT_OPERATORS;
}

function normalizeOperatorText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesUserRequest(operator: DirectOperatorTemplate, notes: string) {
  const providerLower = normalizeOperatorText(operator.provider);
  const aliases = (operator.aliases ?? []).map(normalizeOperatorText);

  if ([providerLower, ...aliases].some((name) => name && notes.includes(name))) {
    return true;
  }

  const skipWords = new Set(["air", "airline", "airlines", "airways", "the", "de", "los"]);
  return providerLower
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !skipWords.has(word))
    .some((word) => notes.includes(word));
}

function findRequestedOperators(notes: string) {
  if (!notes) return [];

  const normalized = normalizeOperatorText(notes);
  return [
    ...DIRECT_FLIGHT_OPERATORS,
    ...DIRECT_BUS_OPERATORS,
    ...DIRECT_TRAIN_OPERATORS,
  ].filter((op) => matchesUserRequest(op, normalized));
}

export function getRequestedTransportOperatorNames(notes: string) {
  return findRequestedOperators(notes).map((operator) => operator.provider);
}

export function buildTransportSearchLinkOffers(params: {
  currency: string;
  departureDate: string;
  destinationQuery: string;
  notes?: string;
  originQuery: string;
  transportPreference: string;
}) {
  const originLabel = normalizeLocation(params.originQuery, "your origin");
  const destinationLabel = normalizeLocation(params.destinationQuery, "your destination");
  const routeLabel = `${originLabel} → ${destinationLabel}`;
  const modeLabel = normalizeTransportModeLabel(params.transportPreference);

  // If the user explicitly asked for a specific airline, put it first
  const requestedOperators = findRequestedOperators(params.notes ?? "");
  const baseOperators = getDirectOperatorTemplates(params.transportPreference, modeLabel);

  // Deduplicate: requested first, then remaining from base list
  const requestedProviderNames = new Set(requestedOperators.map((op) => op.provider));
  const remainingOperators = baseOperators.filter((op) => !requestedProviderNames.has(op.provider));
  const allOperators = [...requestedOperators, ...remainingOperators];

  const offers = allOperators.map(
    (operator) =>
      ({
        bookingUrl: operator.bookingUrl,
        durationMinutes: null,
        mode: operator.mode,
        note: `Open the official ${operator.provider} site and confirm the exact fare for ${routeLabel} on ${params.departureDate}.`,
        priceAmount: null,
        priceCurrency: params.currency,
        provider: operator.provider,
        route: routeLabel,
        sourceLabel: operator.provider,
      }) satisfies TransportSearchLinkOffer
  );

  return offers.slice(0, 8) satisfies TransportSearchLinkOffer[];
}
