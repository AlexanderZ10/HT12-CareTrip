"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchOffers = void 0;
const https_1 = require("firebase-functions/v2/https");
const busbud_1 = require("../../travel-providers/busbud");
const booking_demand_1 = require("../../travel-providers/booking-demand");
const stay_links_1 = require("../../travel-providers/stay-links");
const skyscanner_1 = require("../../travel-providers/skyscanner");
function sanitizeString(value, fallback = "") {
    return typeof value === "string" ? value.trim() : fallback;
}
function sanitizeNumber(value, fallback) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    return fallback;
}
function parseIsoDate(value) {
    const [year, month, day] = value.split("-").map((part) => Number(part));
    if (!year || !month || !day) {
        throw new https_1.HttpsError("invalid-argument", `Invalid ISO date: ${value}`);
    }
    return { day, month, year };
}
function formatMinutes(value) {
    if (value === null) {
        return "Времето се уточнява";
    }
    const hours = Math.floor(value / 60);
    const minutes = value % 60;
    if (hours <= 0) {
        return `${minutes} мин`;
    }
    if (minutes === 0) {
        return `${hours} ч`;
    }
    return `${hours} ч ${minutes} мин`;
}
function formatMoney(amount, currency) {
    if (amount === null) {
        return "Цена при запитване";
    }
    return `${Math.round(amount)} ${currency}`;
}
function preferTransportOrder(transportPreference, flights, buses) {
    const normalizedPreference = transportPreference.toLowerCase();
    const transportOffers = normalizedPreference.includes("автобус") || normalizedPreference.includes("влак")
        ? [...buses, ...flights]
        : normalizedPreference.includes("кола") || normalizedPreference.includes("спод")
            ? [...buses, ...flights]
            : [...flights, ...buses];
    return transportOffers.slice(0, 4).map((offer) => ({
        bookingUrl: offer.bookingUrl,
        durationMinutes: offer.durationMinutes ?? null,
        mode: offer.mode === "bus" ? "Автобус" : "Самолет",
        note: offer.mode === "bus"
            ? `${offer.note || "Реална автобусна оферта"} • ${formatMinutes(offer.durationMinutes ?? null)}`
            : `${offer.note || "Реална самолетна оферта"} • ${formatMinutes(offer.durationMinutes ?? null)}`,
        priceAmount: offer.priceAmount,
        priceCurrency: offer.priceCurrency,
        provider: offer.mode === "bus" ? offer.company : offer.provider,
        route: offer.route,
        sourceLabel: offer.sourceLabel,
    }));
}
function normalizeStayType(stayStyle, type) {
    if (stayStyle.toLowerCase().includes("къщи")) {
        return type || "Къща за гости";
    }
    if (stayStyle.toLowerCase().includes("бутиков")) {
        return type || "Бутиков хотел";
    }
    return type || "Хотел";
}
function mergeStayOffers(primaryOffers, secondaryOffers) {
    const seenKeys = new Set();
    return [...primaryOffers, ...secondaryOffers].filter((offer) => {
        const key = [
            offer.providerKey || "",
            offer.providerAccommodationId || "",
            offer.providerProductId || "",
            offer.bookingUrl,
            offer.name,
            offer.area,
            offer.priceAmount ?? "",
        ]
            .join("|")
            .toLowerCase();
        if (!key || seenKeys.has(key)) {
            return false;
        }
        seenKeys.add(key);
        return true;
    });
}
exports.searchOffers = (0, https_1.onCall)({ region: "us-central1" }, async (request) => {
    const data = (request.data ?? {});
    const destinationQuery = sanitizeString(data.destinationQuery);
    const originQuery = sanitizeString(data.originQuery);
    const departureDate = sanitizeString(data.departureDate);
    const returnDate = sanitizeString(data.returnDate);
    const transportPreference = sanitizeString(data.transportPreference);
    if (!destinationQuery || !originQuery || !departureDate || !returnDate) {
        throw new https_1.HttpsError("invalid-argument", "Missing search inputs.");
    }
    const skyscannerApiKey = sanitizeString(process.env.SKYSCANNER_API_KEY);
    const bookingDemandToken = sanitizeString(process.env.BOOKING_DEMAND_API_TOKEN || process.env.BOOKING_DEMAND_TOKEN);
    const bookingAffiliateId = sanitizeString(process.env.BOOKING_AFFILIATE_ID);
    const hasSkyscanner = !!skyscannerApiKey;
    const hasBookingDemand = !!bookingDemandToken && !!bookingAffiliateId;
    const notes = [];
    if (!hasSkyscanner && !hasBookingDemand) {
        notes.push("Running with free stay sources and provider search links. Configure SKYSCANNER_API_KEY or BOOKING_DEMAND credentials for richer live offers.");
    }
    const adults = sanitizeNumber(data.adults, 1);
    const locale = sanitizeString(data.locale, "bg-BG");
    const market = sanitizeString(data.market, "BG");
    const currency = "EUR";
    const checkInDate = parseIsoDate(departureDate);
    const checkOutDate = parseIsoDate(returnDate);
    let flights = [];
    if (hasSkyscanner) {
        try {
            flights = await (0, skyscanner_1.searchSkyscannerFlightOffers)({
                adults,
                apiKey: skyscannerApiKey,
                checkInDate,
                checkOutDate,
                currency,
                destinationQuery,
                locale,
                market,
                maxResults: 4,
                originQuery,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Skyscanner flight search failed";
            notes.push(`Skyscanner flights not available: ${message}`);
        }
    }
    else {
        notes.push("Flight offers require SKYSCANNER_API_KEY.");
    }
    let skyscannerHotels = [];
    if (hasSkyscanner) {
        try {
            skyscannerHotels = await (0, skyscanner_1.searchSkyscannerHotelOffers)({
                adults,
                apiKey: skyscannerApiKey,
                checkInDate,
                checkOutDate,
                currency,
                destinationQuery,
                locale,
                market,
                maxResults: 4,
                originQuery,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Skyscanner hotel search failed";
            notes.push(`Skyscanner stays not available: ${message}`);
        }
    }
    let bookingHotels = [];
    if (hasBookingDemand) {
        try {
            bookingHotels = await (0, booking_demand_1.searchBookingDemandStayOffers)({
                adults,
                affiliateId: bookingAffiliateId,
                checkInDate,
                checkOutDate,
                currency,
                destinationQuery,
                locale,
                market,
                maxResults: 4,
                token: bookingDemandToken,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Booking.com stay search failed";
            notes.push(`Booking.com stays not available: ${message}`);
        }
    }
    else {
        notes.push("Booking.com Demand API is unavailable, so Rome2Rio hotel search fallback will be used.");
    }
    let buses = [];
    const busbudEndpoint = sanitizeString(process.env.BUSBUD_SEARCH_ENDPOINT);
    const busbudApiKey = sanitizeString(process.env.BUSBUD_API_KEY);
    if (busbudEndpoint && busbudApiKey) {
        try {
            buses = await (0, busbud_1.searchBusbudOffers)({
                adults,
                apiKey: busbudApiKey,
                departureDate,
                destinationQuery,
                endpoint: busbudEndpoint,
                locale,
                originQuery,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Busbud search failed";
            notes.push(`Busbud not available: ${message}`);
        }
    }
    else {
        notes.push("Bus offers require BUSBUD_SEARCH_ENDPOINT and BUSBUD_API_KEY.");
    }
    const hotels = mergeStayOffers(bookingHotels, skyscannerHotels);
    const staySearchLinkOffers = hotels.length === 0
        ? (0, stay_links_1.buildStaySearchLinkOffers)({
            adults,
            checkInDate,
            checkOutDate,
            currency,
            destinationQuery,
            originQuery,
            transportPreference,
        })
        : [];
    if (staySearchLinkOffers.length > 0) {
        notes.push("No verified stay inventory was returned, so provider search links were added.");
    }
    const finalStayOffers = mergeStayOffers(hotels, staySearchLinkOffers);
    if (flights.length === 0 && finalStayOffers.length === 0 && buses.length === 0) {
        throw new https_1.HttpsError("not-found", "No live offers were returned by the configured providers.");
    }
    return {
        notes,
        searchContext: {
            departureDate,
            nights: Math.max(1, Math.round((new Date(returnDate).getTime() - new Date(departureDate).getTime()) /
                (1000 * 60 * 60 * 24))),
            returnDate,
            windowLabel: `${departureDate} → ${returnDate}`,
        },
        stayOptions: finalStayOffers
            .slice(0, 4)
            .map((offer) => ({
            area: offer.area,
            bookingUrl: offer.bookingUrl,
            imageUrl: offer.imageUrl,
            name: offer.name,
            note: offer.ratingLabel ? `${offer.note} • ${offer.ratingLabel}` : offer.note,
            priceAmount: offer.priceAmount,
            priceCurrency: offer.priceCurrency,
            providerAccommodationId: "providerAccommodationId" in offer ? offer.providerAccommodationId || "" : "",
            providerKey: "providerKey" in offer ? offer.providerKey || "" : "",
            providerPaymentModes: "providerPaymentModes" in offer && Array.isArray(offer.providerPaymentModes)
                ? offer.providerPaymentModes
                : [],
            providerProductId: "providerProductId" in offer ? offer.providerProductId || "" : "",
            ratingLabel: offer.ratingLabel,
            reservationMode: "reservationMode" in offer ? offer.reservationMode || "" : "",
            sourceLabel: offer.sourceLabel,
            type: normalizeStayType(sanitizeString(data.stayStyle), offer.type),
        })),
        transportOptions: preferTransportOrder(sanitizeString(data.transportPreference), flights, buses).map((offer) => ({
            ...offer,
            note: `${offer.note} • ${formatMoney(offer.priceAmount, offer.priceCurrency)}`,
        })),
    };
});
