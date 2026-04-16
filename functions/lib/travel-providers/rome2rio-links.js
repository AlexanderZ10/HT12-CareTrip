"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildRome2RioRouteUrl = buildRome2RioRouteUrl;
exports.buildRome2RioHotelsUrl = buildRome2RioHotelsUrl;
function normalizeLocation(value, fallback) {
    return value.trim() || fallback;
}
function toRome2RioSegment(value) {
    return encodeURIComponent(value
        .trim()
        .replace(/[,_/]+/g, " ")
        .replace(/\s+/g, "-"));
}
function normalizeTransportModeLabel(transportPreference) {
    const normalized = (transportPreference || "").trim().toLowerCase();
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
    return "";
}
function buildRome2RioRouteUrl(params) {
    const originLabel = normalizeLocation(params.originQuery, "your origin");
    const destinationLabel = normalizeLocation(params.destinationQuery, "your destination");
    return `https://www.rome2rio.com/s/${toRome2RioSegment(originLabel)}/${toRome2RioSegment(destinationLabel)}`;
}
function buildRome2RioHotelsUrl(params) {
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
