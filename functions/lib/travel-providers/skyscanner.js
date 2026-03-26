"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.autosuggestFlightPlace = autosuggestFlightPlace;
exports.autosuggestHotelPlace = autosuggestHotelPlace;
exports.searchSkyscannerFlightOffers = searchSkyscannerFlightOffers;
exports.searchSkyscannerHotelOffers = searchSkyscannerHotelOffers;
const SKYSCANNER_BASE_URL = "https://partners.api.skyscanner.net";
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
function getMapEntries(value) {
    return Object.entries(asRecord(value));
}
function formatDuration(durationMinutes) {
    if (durationMinutes === null) {
        return "Времето се уточнява";
    }
    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;
    if (hours <= 0) {
        return `${minutes} мин`;
    }
    if (minutes === 0) {
        return `${hours} ч`;
    }
    return `${hours} ч ${minutes} мин`;
}
async function callSkyscanner(apiKey, path, body) {
    const response = await fetch(`${SKYSCANNER_BASE_URL}${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
        },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`skyscanner-request-failed:${response.status}:${errorText}`);
    }
    return (await response.json());
}
function buildFlightPlaceId(place) {
    if (place.entityId) {
        return { entityId: place.entityId };
    }
    if (place.iataCode) {
        return { iata: place.iataCode };
    }
    throw new Error("skyscanner-place-missing-id");
}
function toDateParts(value) {
    return {
        day: value.day,
        month: value.month,
        year: value.year,
    };
}
async function autosuggestFlightPlace(params) {
    const response = await callSkyscanner(params.apiKey, "/apiservices/v3/autosuggest/flights", {
        query: {
            locale: params.locale,
            market: params.market,
            searchTerm: params.searchTerm,
        },
        limit: 5,
        isDestination: false,
    });
    const places = Array.isArray(response.places) ? response.places : [];
    const firstPlace = places
        .map((place) => asRecord(place))
        .find((place) => asString(place.entityId) || asString(place.iataCode));
    if (!firstPlace) {
        throw new Error(`skyscanner-place-not-found:${params.searchTerm}`);
    }
    return {
        cityName: asString(firstPlace.cityName),
        displayLabel: asString(firstPlace.name) ||
            asString(firstPlace.cityName) ||
            params.searchTerm,
        entityId: asString(firstPlace.entityId) ||
            asString(asRecord(firstPlace.airportInformation).entityId),
        iataCode: asString(firstPlace.iataCode) ||
            asString(asRecord(firstPlace.airportInformation).iataCode),
        name: asString(firstPlace.name, params.searchTerm),
    };
}
async function autosuggestHotelPlace(params) {
    const response = await callSkyscanner(params.apiKey, "/apiservices/v3/autosuggest/hotels", {
        query: {
            locale: params.locale,
            market: params.market,
            searchTerm: params.searchTerm,
        },
        limit: 5,
    });
    const places = Array.isArray(response.places) ? response.places : [];
    const firstPlace = places.map((place) => asRecord(place)).find((place) => asString(place.entityId));
    if (!firstPlace) {
        throw new Error(`skyscanner-hotel-place-not-found:${params.searchTerm}`);
    }
    return {
        cityName: asString(firstPlace.cityName),
        displayLabel: asString(firstPlace.name) ||
            asString(firstPlace.cityName) ||
            params.searchTerm,
        entityId: asString(firstPlace.entityId),
        iataCode: "",
        name: asString(firstPlace.name, params.searchTerm),
    };
}
function resolveFlightResults(payload) {
    const content = asRecord(asRecord(payload).content);
    const results = asRecord(content.results);
    return {
        agents: asRecord(results.agents),
        carriers: asRecord(results.carriers),
        itineraries: asRecord(results.itineraries),
        legs: asRecord(results.legs),
        places: asRecord(results.places),
        status: asString(asRecord(payload).status),
    };
}
function describeLeg(legIds, legs, places, carriers) {
    const legSummaries = legIds
        .map((legId) => asRecord(legs[legId]))
        .filter((leg) => Object.keys(leg).length > 0)
        .map((leg) => {
        const originPlace = asRecord(places[asString(leg.originPlaceId)]);
        const destinationPlace = asRecord(places[asString(leg.destinationPlaceId)]);
        const marketingCarriers = Array.isArray(leg.marketingCarrierIds)
            ? leg.marketingCarrierIds
            : Array.isArray(leg.carrierIds)
                ? leg.carrierIds
                : [];
        const carrierName = marketingCarriers
            .map((carrierId) => asString(asRecord(carriers[asString(carrierId)]).name))
            .find(Boolean) || "Авиокомпания";
        return {
            carrierName,
            durationMinutes: asNumber(leg.durationInMinutes),
            originLabel: asString(originPlace.name) ||
                asString(originPlace.displayCode) ||
                asString(leg.originPlaceId),
            destinationLabel: asString(destinationPlace.name) ||
                asString(destinationPlace.displayCode) ||
                asString(leg.destinationPlaceId),
        };
    });
    if (legSummaries.length === 0) {
        return {
            durationMinutes: null,
            provider: "Skyscanner",
            route: "Маршрутът се уточнява",
        };
    }
    return {
        durationMinutes: legSummaries.reduce((total, leg) => total + (leg.durationMinutes ?? 0), 0),
        provider: legSummaries.map((leg) => leg.carrierName).filter(Boolean).join(" + "),
        route: legSummaries
            .map((leg) => `${leg.originLabel} → ${leg.destinationLabel}`)
            .join(" • "),
    };
}
async function searchSkyscannerFlightOffers(params) {
    const [originPlace, destinationPlace] = await Promise.all([
        autosuggestFlightPlace({
            apiKey: params.apiKey,
            locale: params.locale,
            market: params.market,
            searchTerm: params.originQuery,
        }),
        autosuggestFlightPlace({
            apiKey: params.apiKey,
            locale: params.locale,
            market: params.market,
            searchTerm: params.destinationQuery,
        }),
    ]);
    const createPayload = {
        query: {
            adults: params.adults,
            cabinClass: "CABIN_CLASS_ECONOMY",
            currency: params.currency,
            locale: params.locale,
            market: params.market,
            queryLegs: [
                {
                    date: toDateParts(params.checkInDate),
                    destinationPlaceId: buildFlightPlaceId(destinationPlace),
                    originPlaceId: buildFlightPlaceId(originPlace),
                },
                {
                    date: toDateParts(params.checkOutDate),
                    destinationPlaceId: buildFlightPlaceId(originPlace),
                    originPlaceId: buildFlightPlaceId(destinationPlace),
                },
            ],
        },
    };
    const createResponse = await callSkyscanner(params.apiKey, "/apiservices/v3/flights/live/search/create", createPayload);
    const sessionToken = asString(createResponse.sessionToken);
    if (!sessionToken) {
        throw new Error("skyscanner-flight-session-missing");
    }
    let latestPayload = createResponse;
    let status = asString(createResponse.status);
    for (let index = 0; index < 3 && status !== "RESULT_STATUS_COMPLETE" && status !== "completed"; index += 1) {
        await new Promise((resolve) => setTimeout(resolve, 700));
        const pollResponse = await callSkyscanner(params.apiKey, `/apiservices/v3/flights/live/search/poll/${sessionToken}`, {});
        latestPayload = pollResponse;
        status = asString(asRecord(pollResponse).status);
    }
    const { agents, carriers, itineraries, legs, places } = resolveFlightResults(latestPayload);
    return getMapEntries(itineraries)
        .map(([, itinerary]) => asRecord(itinerary))
        .map((itinerary) => {
        const pricingOptions = Array.isArray(itinerary.pricingOptions)
            ? itinerary.pricingOptions
            : [];
        const firstPricingOption = asRecord(pricingOptions[0]);
        const firstPricingItem = asRecord(Array.isArray(firstPricingOption.items) ? firstPricingOption.items[0] : undefined);
        const firstAgentId = asString(firstPricingItem.agentId) ||
            asString(Array.isArray(firstPricingOption.agentIds) ? firstPricingOption.agentIds[0] : "");
        const firstAgent = asRecord(agents[firstAgentId]);
        const legIds = Array.isArray(itinerary.legIds)
            ? itinerary.legIds.map((legId) => asString(legId)).filter(Boolean)
            : [];
        const describedLeg = describeLeg(legIds, legs, places, carriers);
        const rawAmount = asNumber(asRecord(firstPricingOption.price).amount) ??
            asNumber(asRecord(firstPricingItem.price).amount);
        const priceCurrency = asString(asRecord(firstPricingOption.price).unit, params.currency);
        return {
            bookingUrl: asString(firstPricingItem.deepLink) ||
                asString(firstPricingOption.deepLink),
            durationMinutes: describedLeg.durationMinutes,
            mode: "flight",
            note: describedLeg.provider === "Skyscanner"
                ? "Live flight offer from Skyscanner."
                : "Live flight offer with current supplier pricing.",
            priceAmount: rawAmount,
            priceCurrency: priceCurrency && priceCurrency !== "PRICE_UNIT_UNSPECIFIED"
                ? priceCurrency
                : params.currency,
            provider: describedLeg.provider ||
                asString(firstAgent.name) ||
                "Skyscanner flight partner",
            route: describedLeg.route,
            sourceLabel: asString(firstAgent.name, "Skyscanner"),
        };
    })
        .filter((offer) => offer.bookingUrl || offer.priceAmount !== null)
        .sort((left, right) => (left.priceAmount ?? Number.MAX_SAFE_INTEGER) - (right.priceAmount ?? Number.MAX_SAFE_INTEGER))
        .slice(0, params.maxResults ?? 4)
        .map((offer) => ({
        ...offer,
        note: `${offer.note} ${formatDuration(offer.durationMinutes)}`.trim(),
    }));
}
function resolveHotelResults(payload) {
    const content = asRecord(payload);
    return {
        agents: asRecord(content.agents),
        hotelContent: asRecord(content.hotelContent),
        hotelInfo: asRecord(content.hotelInfo),
        hotelsPricingOptions: asRecord(content.hotelsPricingOptions),
        status: asString(content.status),
    };
}
async function searchSkyscannerHotelOffers(params) {
    const destinationPlace = await autosuggestHotelPlace({
        apiKey: params.apiKey,
        locale: params.locale,
        market: params.market,
        searchTerm: params.destinationQuery,
    });
    const createResponse = await callSkyscanner(params.apiKey, "/apiservices/v1/hotels/live/search/create", {
        initialPageSize: params.maxResults ?? 6,
        query: {
            adults: params.adults,
            checkinDate: toDateParts(params.checkInDate),
            checkoutDate: toDateParts(params.checkOutDate),
            currency: params.currency,
            entityId: destinationPlace.entityId,
            locale: params.locale,
            market: params.market,
        },
    });
    const sessionToken = asString(createResponse.sessionToken);
    if (!sessionToken) {
        throw new Error("skyscanner-hotel-session-missing");
    }
    let latestPayload = createResponse;
    let status = asString(createResponse.status);
    for (let index = 0; index < 4 && status !== "completed"; index += 1) {
        await new Promise((resolve) => setTimeout(resolve, 700));
        const pollResponse = await callSkyscanner(params.apiKey, `/apiservices/v1/hotels/live/search/poll/${sessionToken}`, {
            pageIndex: 0,
            pageSize: params.maxResults ?? 6,
        });
        latestPayload = pollResponse;
        status = asString(asRecord(pollResponse).status);
        if (status === "completed") {
            break;
        }
    }
    const { agents, hotelContent, hotelInfo, hotelsPricingOptions } = resolveHotelResults(latestPayload);
    return getMapEntries(hotelsPricingOptions)
        .flatMap(([, pricingOption]) => {
        const normalizedOption = asRecord(pricingOption);
        const hotelId = asString(normalizedOption.hotelId);
        const hotelDetails = asRecord(hotelContent[hotelId]);
        const hotelMeta = asRecord(hotelInfo[hotelId]);
        const agent = asRecord(agents[asString(normalizedOption.agentId)]);
        const price = asRecord(normalizedOption.price);
        const amount = asNumber(price.price);
        const currency = asString(price.currency, params.currency);
        const imageCandidates = Array.isArray(hotelDetails.hotelImages)
            ? hotelDetails.hotelImages
            : [];
        const firstImage = asRecord(imageCandidates[0]);
        const rating = asRecord(hotelDetails.guestRating);
        const distance = asRecord(hotelMeta.distanceFromTarget);
        return [
            {
                area: asString(hotelDetails.address, asString(distance.value, destinationPlace.displayLabel || params.destinationQuery)),
                bookingUrl: asString(normalizedOption.deeplink) ||
                    asString(hotelMeta.deeplink),
                imageUrl: asString(firstImage.fullUrl) ||
                    asString(firstImage.galleryUrl) ||
                    asString(firstImage.thumbnailUrl),
                name: asString(hotelDetails.hotelName, "Hotel option"),
                note: [
                    asString(normalizedOption.roomName),
                    asString(normalizedOption.mealPlan),
                    asString(normalizedOption.cancellationPolicy),
                ]
                    .filter(Boolean)
                    .join(" • ") || "Live hotel offer",
                priceAmount: amount,
                priceCurrency: currency,
                ratingLabel: rating.score !== undefined
                    ? `${asNumber(rating.score) ?? 0}/5 • ${asNumber(rating.reviewCount) ?? 0} reviews`
                    : "",
                sourceLabel: asString(agent.name, "Skyscanner Hotels"),
                type: asString(hotelDetails.accommodationType, "Настаняване").replaceAll("_", " "),
            },
        ];
    })
        .filter((offer) => offer.bookingUrl || offer.priceAmount !== null)
        .sort((left, right) => (left.priceAmount ?? Number.MAX_SAFE_INTEGER) - (right.priceAmount ?? Number.MAX_SAFE_INTEGER))
        .slice(0, params.maxResults ?? 4);
}
