"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildStaySearchLinkOffers = buildStaySearchLinkOffers;
const rome2rio_links_1 = require("./rome2rio-links");
function toIsoDate(value) {
    return `${value.year}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;
}
function normalizeDestinationLabel(value) {
    return value.trim() || "your destination";
}
function buildStaySearchLinkOffers(params) {
    const destinationLabel = normalizeDestinationLabel(params.destinationQuery);
    const checkInDate = toIsoDate(params.checkInDate);
    const checkOutDate = toIsoDate(params.checkOutDate);
    return [
        {
            area: destinationLabel,
            bookingUrl: (0, rome2rio_links_1.buildRome2RioHotelsUrl)({
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
    ];
}
