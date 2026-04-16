"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchBookingDemandStayOffers = searchBookingDemandStayOffers;
const BOOKING_DEMAND_BASE_URL = "https://demandapi.booking.com/3.2";
function isRecord(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
}
function asRecord(value) {
    return isRecord(value) ? value : {};
}
function asArray(value) {
    return Array.isArray(value) ? value : [];
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
function toIsoDate(value) {
    return `${value.year}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;
}
async function callBookingDemand(params, path, body) {
    const response = await fetch(`${BOOKING_DEMAND_BASE_URL}${path}`, {
        body: JSON.stringify(body),
        headers: {
            Authorization: `Bearer ${params.token}`,
            "Content-Type": "application/json",
            "X-Affiliate-Id": params.affiliateId,
        },
        method: "POST",
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`booking-demand-request-failed:${response.status}:${errorText}`);
    }
    return (await response.json());
}
async function geocodeSettlement(searchTerm) {
    const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(searchTerm)}&count=1&language=en&format=json`);
    if (!response.ok) {
        throw new Error(`booking-demand-geocode-failed:${response.status}`);
    }
    const payload = (await response.json());
    const firstResult = payload.results?.find((result) => typeof result?.latitude === "number" &&
        Number.isFinite(result.latitude) &&
        typeof result?.longitude === "number" &&
        Number.isFinite(result.longitude));
    if (!firstResult) {
        throw new Error(`booking-demand-geocode-missing:${searchTerm}`);
    }
    return {
        latitude: firstResult.latitude,
        longitude: firstResult.longitude,
    };
}
function normalizeType(value) {
    return value.replaceAll("_", " ").trim();
}
function extractFirstImageUrl(value) {
    const firstPhoto = asRecord(asArray(value)[0]);
    return (asString(firstPhoto.url) ||
        asString(firstPhoto.square60) ||
        asString(firstPhoto.max300) ||
        asString(firstPhoto.max500) ||
        asString(firstPhoto.main_photo_url) ||
        asString(firstPhoto.photo_max_url));
}
function buildFallbackBookingUrl(params) {
    const url = new URL("https://www.booking.com/searchresults.html");
    url.searchParams.set("ss", params.destinationQuery);
    url.searchParams.set("checkin", params.checkInDate);
    url.searchParams.set("checkout", params.checkOutDate);
    url.searchParams.set("group_adults", String(Math.max(params.adults, 1)));
    url.searchParams.set("no_rooms", String(Math.max(params.rooms, 1)));
    url.searchParams.set("selected_currency", params.currency);
    return url.toString();
}
function buildStayArea(detail, searchRow, fallback) {
    const addressRecord = asRecord(detail.address);
    const locationRecord = asRecord(detail.location);
    const areaParts = [
        asString(addressRecord.city),
        asString(addressRecord.district),
        asString(addressRecord.address_line),
        asString(locationRecord.city),
        asString(locationRecord.region),
        asString(searchRow.city_name),
        asString(searchRow.district),
    ].filter(Boolean);
    if (areaParts.length === 0) {
        return fallback;
    }
    return areaParts.join(", ");
}
function buildRatingLabel(detail, searchRow) {
    const reviewScore = asNumber(detail.review_score) ??
        asNumber(asRecord(detail.review_score_details).score) ??
        asNumber(searchRow.review_score) ??
        asNumber(asRecord(searchRow.review_score_details).score);
    const reviewCount = asNumber(detail.review_nr) ??
        asNumber(detail.review_count) ??
        asNumber(searchRow.review_nr) ??
        asNumber(searchRow.review_count);
    const stars = asNumber(detail.class) ??
        asNumber(detail.stars) ??
        asNumber(searchRow.class) ??
        asNumber(searchRow.stars);
    const labelParts = [];
    if (reviewScore !== null) {
        labelParts.push(`${reviewScore}/10`);
    }
    if (reviewCount !== null) {
        labelParts.push(`${Math.round(reviewCount)} reviews`);
    }
    if (stars !== null) {
        labelParts.push(`${Math.round(stars)}★`);
    }
    return labelParts.join(" • ");
}
function buildStayNote(searchRow) {
    const firstProduct = asRecord(asArray(searchRow.products)[0]);
    const policies = asRecord(firstProduct.policies);
    const cancellation = asRecord(policies.cancellation);
    const mealPlan = asRecord(policies.meal_plan);
    const payment = asRecord(policies.payment);
    const paymentTypes = asArray(payment.types)
        .map((item) => asString(item))
        .filter(Boolean);
    const noteParts = [
        asString(firstProduct.room_name),
        asString(cancellation.type).replaceAll("_", " "),
        asString(mealPlan.plan).replaceAll("_", " "),
        paymentTypes.length > 0 ? `Payment: ${paymentTypes.join(", ")}` : "",
    ].filter(Boolean);
    return noteParts.join(" • ");
}
function extractPaymentModes(searchRow) {
    const firstProduct = asRecord(asArray(searchRow.products)[0]);
    const payment = asRecord(asRecord(firstProduct.policies).payment);
    return asArray(payment.types)
        .map((item) => asString(item))
        .filter(Boolean);
}
function indexDetailsRows(value) {
    const rows = asArray(asRecord(value).data);
    const detailMap = new Map();
    rows.forEach((row) => {
        const normalizedRow = asRecord(row);
        const id = asString(normalizedRow.id) || String(asNumber(normalizedRow.id) ?? "");
        if (id) {
            detailMap.set(id, normalizedRow);
        }
    });
    return detailMap;
}
async function searchBookingDemandStayOffers(params) {
    const coordinates = await geocodeSettlement(params.destinationQuery);
    const rooms = Math.max(1, Math.ceil(params.adults / 2));
    const checkInDate = toIsoDate(params.checkInDate);
    const checkOutDate = toIsoDate(params.checkOutDate);
    const searchResponse = await callBookingDemand({
        affiliateId: params.affiliateId,
        token: params.token,
    }, "/accommodations/search", {
        booker: {
            country: params.market.toLowerCase(),
            platform: "ios",
            travel_purpose: "leisure",
        },
        checkin: checkInDate,
        checkout: checkOutDate,
        coordinates: {
            latitude: coordinates.latitude,
            longitude: coordinates.longitude,
            radius: 20,
        },
        currency: params.currency,
        extras: ["products", "extra_charges"],
        guests: {
            number_of_adults: Math.max(params.adults, 1),
            number_of_rooms: rooms,
        },
        rows: Math.min(Math.max(params.maxResults ?? 6, 4), 10),
        sort: {
            by: "price",
            direction: "ascending",
        },
    });
    const searchRows = asArray(searchResponse.data)
        .map((row) => asRecord(row))
        .filter((row) => {
        const id = asString(row.id) || String(asNumber(row.id) ?? "");
        return !!id;
    })
        .slice(0, params.maxResults ?? 6);
    if (searchRows.length === 0) {
        return [];
    }
    let detailsById = new Map();
    try {
        const detailResponse = await callBookingDemand({
            affiliateId: params.affiliateId,
            token: params.token,
        }, "/accommodations/details", {
            accommodations: searchRows
                .map((row) => asNumber(row.id))
                .filter((id) => id !== null)
                .slice(0, params.maxResults ?? 6),
        });
        detailsById = indexDetailsRows(detailResponse);
    }
    catch { }
    return searchRows
        .map((searchRow) => {
        const id = asString(searchRow.id) || String(asNumber(searchRow.id) ?? "");
        const detail = detailsById.get(id) ?? {};
        const price = asRecord(searchRow.price);
        const bookingUrl = asString(searchRow.url) ||
            asString(searchRow.deep_link_url) ||
            buildFallbackBookingUrl({
                adults: params.adults,
                checkInDate,
                checkOutDate,
                currency: params.currency,
                destinationQuery: params.destinationQuery,
                rooms,
            });
        const amount = asNumber(price.book) ??
            asNumber(price.total) ??
            asNumber(price.base);
        const firstProduct = asRecord(asArray(searchRow.products)[0]);
        const stayType = normalizeType(asString(detail.accommodation_type_name) ||
            asString(detail.type) ||
            asString(searchRow.accommodation_type_name) ||
            asString(searchRow.type)) || "Hotel";
        return {
            area: buildStayArea(detail, searchRow, params.destinationQuery),
            bookingUrl,
            imageUrl: extractFirstImageUrl(detail.photos) ||
                extractFirstImageUrl(searchRow.photos) ||
                asString(detail.main_photo_url) ||
                asString(searchRow.main_photo_url),
            name: asString(detail.name) ||
                asString(detail.property_name) ||
                asString(searchRow.name) ||
                asString(searchRow.property_name) ||
                "Booking.com stay",
            note: buildStayNote(searchRow) || "Live Booking.com stay offer",
            priceAmount: amount,
            priceCurrency: asString(searchRow.currency, params.currency),
            providerAccommodationId: id,
            providerKey: "booking",
            providerPaymentModes: extractPaymentModes(searchRow),
            providerProductId: asString(firstProduct.id) ||
                String(asNumber(firstProduct.id) ?? ""),
            ratingLabel: buildRatingLabel(detail, searchRow),
            reservationMode: "provider_redirect",
            sourceLabel: "Booking.com",
            type: stayType,
        };
    })
        .filter((offer) => !!offer.bookingUrl)
        .sort((left, right) => (left.priceAmount ?? Number.MAX_SAFE_INTEGER) -
        (right.priceAmount ?? Number.MAX_SAFE_INTEGER))
        .slice(0, params.maxResults ?? 4);
}
