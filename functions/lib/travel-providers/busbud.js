"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchBusbudOffers = searchBusbudOffers;
function isRecord(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
}
function asRecord(value) {
    return isRecord(value) ? value : {};
}
function asString(value, fallback = "") {
    return typeof value === "string" ? value.trim() : fallback;
}
function asNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string" && value.trim()) {
        const parsedValue = Number(value);
        return Number.isFinite(parsedValue) ? parsedValue : null;
    }
    return null;
}
async function searchBusbudOffers(params) {
    if (!params.endpoint) {
        throw new Error("busbud-endpoint-missing");
    }
    const response = await fetch(params.endpoint, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${params.apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            adults: params.adults,
            departureDate: params.departureDate,
            destination: params.destinationQuery,
            locale: params.locale,
            origin: params.originQuery,
        }),
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`busbud-request-failed:${response.status}:${errorText}`);
    }
    const payload = (await response.json());
    const rawOffers = Array.isArray(payload.offers)
        ? payload.offers
        : Array.isArray(payload.trips)
            ? payload.trips
            : [];
    return rawOffers
        .map((offer) => asRecord(offer))
        .map((offer) => ({
        bookingUrl: asString(offer.bookingUrl) || asString(offer.deepLink),
        company: asString(offer.company) || asString(offer.operator) || "Busbud partner",
        departureTime: asString(offer.departureTime),
        durationMinutes: asNumber(offer.durationMinutes),
        mode: "bus",
        note: asString(offer.note) ||
            `${asString(offer.departureTime)}${asString(offer.arrivalTime) ? ` → ${asString(offer.arrivalTime)}` : ""}`.trim(),
        priceAmount: asNumber(offer.priceAmount) ?? asNumber(offer.price),
        priceCurrency: asString(offer.priceCurrency, "EUR"),
        route: asString(offer.route) ||
            `${params.originQuery} → ${params.destinationQuery}`,
        sourceLabel: asString(offer.sourceLabel, "Busbud"),
    }))
        .filter((offer) => offer.bookingUrl || offer.priceAmount !== null)
        .slice(0, 4);
}
