import AsyncStorage from "@react-native-async-storage/async-storage";

const OFFLINE_TRIPS_KEY = "caretrip_offline_trips";

export type OfflineTrip = {
  id: string;
  title: string;
  destination: string;
  summary: string;
  details: string;
  duration: string | null;
  budget: string | null;
  source: "home" | "discover";
  savedAtMs: number;
};

function parseStoredTrips(raw: string | null): OfflineTrip[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (item: unknown): item is OfflineTrip =>
        !!item &&
        typeof item === "object" &&
        typeof (item as Record<string, unknown>).id === "string" &&
        typeof (item as Record<string, unknown>).title === "string"
    );
  } catch {
    return [];
  }
}

export async function saveTripsForOffline(trips: OfflineTrip[]): Promise<void> {
  const existing = await getOfflineTrips();
  const existingById = new Map(existing.map((trip) => [trip.id, trip]));

  for (const trip of trips) {
    existingById.set(trip.id, trip);
  }

  const merged = Array.from(existingById.values()).sort(
    (a, b) => b.savedAtMs - a.savedAtMs
  );

  await AsyncStorage.setItem(OFFLINE_TRIPS_KEY, JSON.stringify(merged));
}

export async function getOfflineTrips(): Promise<OfflineTrip[]> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_TRIPS_KEY);
    return parseStoredTrips(raw);
  } catch {
    return [];
  }
}

export async function removeOfflineTrip(tripId: string): Promise<void> {
  const existing = await getOfflineTrips();
  const filtered = existing.filter((trip) => trip.id !== tripId);
  await AsyncStorage.setItem(OFFLINE_TRIPS_KEY, JSON.stringify(filtered));
}

export async function isAvailableOffline(tripId: string): Promise<boolean> {
  const existing = await getOfflineTrips();
  return existing.some((trip) => trip.id === tripId);
}

export async function downloadTripForOffline(trip: OfflineTrip): Promise<void> {
  await saveTripsForOffline([trip]);
}
