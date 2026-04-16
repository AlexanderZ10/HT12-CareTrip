"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildTransportSearchLinkOffers = buildTransportSearchLinkOffers;
const rome2rio_links_1 = require("./rome2rio-links");
function normalizeTransportModeLabel(transportPreference) {
    const normalized = transportPreference.trim().toLowerCase();
    if (normalized.includes("train") ||
        normalized.includes("влак") ||
        normalized.includes("zug") ||
        normalized.includes("tren")) {
        return "Train";
    }
    if (normalized.includes("bus") ||
        normalized.includes("автобус") ||
        normalized.includes("coach")) {
        return "Bus";
    }
    if (normalized.includes("flight") ||
        normalized.includes("plane") ||
        normalized.includes("самолет") ||
        normalized.includes("полет")) {
        return "Flight";
    }
    return "Transit";
}
function normalizeLocation(value, fallback) {
    return value.trim() || fallback;
}
function buildTransportSearchLinkOffers(params) {
    const originLabel = normalizeLocation(params.originQuery, "your origin");
    const destinationLabel = normalizeLocation(params.destinationQuery, "your destination");
    const routeLabel = `${originLabel} → ${destinationLabel}`;
    const modeLabel = normalizeTransportModeLabel(params.transportPreference);
    return [
        {
            bookingUrl: (0, rome2rio_links_1.buildRome2RioRouteUrl)({
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
    ];
}
