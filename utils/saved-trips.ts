import { doc, runTransaction } from "firebase/firestore";

import { db } from "../firebase";
import { normalizeBudgetToEuro } from "./currency";
import { sanitizeString } from "./sanitize";
import {
  formatGroundedTravelPlan,
  type GroundedTravelPlan,
  type PlannerDayPlan,
} from "./home-travel-planner";
import { type TripRecommendation } from "./trip-recommendations";

export type SavedTrip = {
  budget: string | null;
  createdAtMs: number;
  destination: string;
  details: string;
  duration: string | null;
  id: string;
  latitude: number | null;
  longitude: number | null;
  source: "discover" | "home";
  sourceKey: string;
  summary: string;
  title: string;
  tripDays: PlannerDayPlan[];
};

function dedupeDetailLines(lines: string[], excludedValues: string[] = []) {
  const excluded = new Set(
    excludedValues
      .map((value) => sanitizeString(value).toLowerCase())
      .filter(Boolean)
  );
  const seen = new Set<string>();

  return lines.filter((line) => {
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      return true;
    }

    const normalized = trimmedLine.toLowerCase();

    if (excluded.has(normalized) || seen.has(normalized)) {
      return false;
    }

    seen.add(normalized);
    return true;
  });
}

function hashValue(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash).toString(36);
}

function sanitizeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseTripDays(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item, index): PlannerDayPlan => ({
      dayLabel: sanitizeString(item.dayLabel, `Day ${index + 1}`),
      items: Array.isArray(item.items)
        ? item.items
            .map((entry) => sanitizeString(entry))
            .filter(Boolean)
            .slice(0, 8)
        : [],
      title: sanitizeString(item.title, `Day ${index + 1}`),
    }))
    .filter((day) => day.title || day.items.length > 0);
}

export function getDiscoverSavedSourceKey(trip: TripRecommendation) {
  return `discover:${trip.id}`;
}

export function buildSavedTripFromDiscover(trip: TripRecommendation): SavedTrip {
  const details = dedupeDetailLines(
    [
      "Activities:",
      ...trip.highlights.map((highlight) => `- ${highlight}`),
      "",
      "Attractions:",
      ...trip.attractions.map((attraction) => `- ${attraction}`),
      "",
      `Popularity: ${trip.popularityNote}`,
      `Accessibility: ${trip.accessibilityNotes}`,
    ],
    [trip.whyItFits, trip.title, trip.destination]
  ).join("\n");
  const tripDays: PlannerDayPlan[] = [
    {
      dayLabel: "Day 1",
      items: uniqueItems([`Arrive in ${trip.destination}`, ...trip.highlights.slice(0, 1)]),
      title: "Arrival",
    },
    {
      dayLabel: "Day 2",
      items: uniqueItems([...trip.highlights.slice(1, 3), ...trip.attractions.slice(0, 1)]),
      title: "Explore",
    },
    {
      dayLabel: "Day 3",
      items: uniqueItems([...trip.attractions.slice(1, 3), "Capture your favorite memory"]),
      title: "Favorites",
    },
  ].filter((day) => day.items.length > 0);

  return {
    budget: null,
    createdAtMs: Date.now(),
    destination: trip.destination,
    details,
    duration: null,
    id: `saved-discover-${trip.id}`,
    latitude: trip.latitude,
    longitude: trip.longitude,
    source: "discover",
    sourceKey: getDiscoverSavedSourceKey(trip),
    summary: trip.whyItFits,
    title: trip.title,
    tripDays,
  };
}

function uniqueItems(items: string[]) {
  const seen = new Set<string>();

  return items.filter((item) => {
    const normalizedItem = item.trim().toLowerCase();

    if (!normalizedItem || seen.has(normalizedItem)) {
      return false;
    }

    seen.add(normalizedItem);
    return true;
  });
}

export function getHomeSavedSourceKey(params: {
  budget: string;
  days: string;
  destination: string;
  formattedPlanText: string;
}) {
  const normalizedBudget = normalizeBudgetToEuro(params.budget);

  return `home:${hashValue(
    `${params.destination.trim().toLowerCase()}|${normalizedBudget
      .trim()
      .toLowerCase()}|${params.days.trim().toLowerCase()}|${params.formattedPlanText.trim()}`
  )}`;
}

export function buildSavedTripFromHome(params: {
  budget: string;
  days: string;
  destination: string;
  plan: GroundedTravelPlan;
}) {
  const formattedPlanText = formatGroundedTravelPlan(params.plan);

  return {
    budget: normalizeBudgetToEuro(params.budget),
    createdAtMs: Date.now(),
    destination: params.destination.trim(),
    details: formattedPlanText,
    duration: params.days.trim(),
    id: `saved-home-${Date.now()}`,
    latitude: null,
    longitude: null,
    source: "home",
    sourceKey: getHomeSavedSourceKey({
      budget: params.budget,
      days: params.days,
      destination: params.destination,
      formattedPlanText,
    }),
    summary: `${params.days.trim()} • ${normalizeBudgetToEuro(params.budget)}`,
    title: params.plan.title || `Plan for ${params.destination.trim()}`,
    tripDays: params.plan.tripDays,
  } satisfies SavedTrip;
}

export function parseSavedTrips(profileData: Record<string, unknown>) {
  const rawSavedTrips = Array.isArray(profileData.savedTrips) ? profileData.savedTrips : [];

  return rawSavedTrips
    .filter(
      (item): item is Record<string, unknown> => !!item && typeof item === "object"
    )
    .map(
      (item, index): SavedTrip => ({
        budget: normalizeBudgetToEuro(sanitizeString(item.budget)) || null,
        createdAtMs:
          typeof item.createdAtMs === "number" ? item.createdAtMs : Date.now() - index,
        destination: sanitizeString(item.destination, "Unknown destination"),
        details: sanitizeString(item.details),
        duration: sanitizeString(item.duration) || null,
        id: sanitizeString(item.id, `saved-${index}`),
        latitude: sanitizeNumber(item.latitude),
        longitude: sanitizeNumber(item.longitude),
        source: item.source === "home" ? "home" : "discover",
        sourceKey: sanitizeString(item.sourceKey, `saved-key-${index}`),
        summary: sanitizeString(item.summary),
        title: sanitizeString(item.title, "Trip"),
        tripDays: parseTripDays(item.tripDays),
      })
    )
    .sort((left, right) => right.createdAtMs - left.createdAtMs);
}

export async function saveTripForUser(userId: string, trip: SavedTrip) {
  const profileRef = doc(db, "profiles", userId);

  let nextSavedTrips: SavedTrip[] = [];

  await runTransaction(db, async (transaction) => {
    const profileSnapshot = await transaction.get(profileRef);
    const profileData = profileSnapshot.exists()
      ? (profileSnapshot.data() as Record<string, unknown>)
      : {};

    const currentSavedTrips = parseSavedTrips(profileData);

    if (currentSavedTrips.some((currentTrip) => currentTrip.sourceKey === trip.sourceKey)) {
      nextSavedTrips = currentSavedTrips;
      return;
    }

    nextSavedTrips = [trip, ...currentSavedTrips].slice(0, 50);

    transaction.set(
      profileRef,
      {
        savedTrips: nextSavedTrips,
        savedTripsUpdatedAtMs: Date.now(),
      },
      { merge: true }
    );
  });

  return nextSavedTrips;
}

export async function removeSavedTripForUser(userId: string, sourceKey: string) {
  const profileRef = doc(db, "profiles", userId);

  let nextSavedTrips: SavedTrip[] = [];

  await runTransaction(db, async (transaction) => {
    const profileSnapshot = await transaction.get(profileRef);
    const profileData = profileSnapshot.exists()
      ? (profileSnapshot.data() as Record<string, unknown>)
      : {};

    const currentSavedTrips = parseSavedTrips(profileData);
    nextSavedTrips = currentSavedTrips.filter((trip) => trip.sourceKey !== sourceKey);

    transaction.set(
      profileRef,
      {
        savedTrips: nextSavedTrips,
        savedTripsUpdatedAtMs: Date.now(),
      },
      { merge: true }
    );
  });

  return nextSavedTrips;
}
