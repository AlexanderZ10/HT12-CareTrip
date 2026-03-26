import { type SavedTrip } from "./saved-trips";

export type GroupChatSharedTrip = {
  budget: string | null;
  destination: string;
  details: string;
  duration: string | null;
  source: "discover" | "home";
  sourceKey: string;
  summary: string;
  title: string;
};

export type GroupChatMessage = {
  createdAtMs: number | null;
  id: string;
  messageType: "text" | "shared-trip";
  senderId: string;
  senderLabel: string;
  sharedTrip: GroupChatSharedTrip | null;
  text: string;
};

function sanitizeString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function toMillis(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (
    value &&
    typeof value === "object" &&
    "toMillis" in value &&
    typeof value.toMillis === "function"
  ) {
    return value.toMillis();
  }

  return null;
}

function parseSharedTrip(value: unknown): GroupChatSharedTrip | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const data = value as Record<string, unknown>;
  const source = data.source === "home" ? "home" : data.source === "discover" ? "discover" : null;
  const title = sanitizeString(data.title);
  const destination = sanitizeString(data.destination);
  const details = sanitizeString(data.details);

  if (!source || !title || !destination || !details) {
    return null;
  }

  return {
    budget: sanitizeString(data.budget) || null,
    destination,
    details,
    duration: sanitizeString(data.duration) || null,
    source,
    sourceKey: sanitizeString(data.sourceKey),
    summary: sanitizeString(data.summary),
    title,
  };
}

export function buildGroupChatSharedTrip(trip: SavedTrip): GroupChatSharedTrip {
  return {
    budget: trip.budget,
    destination: trip.destination,
    details: trip.details,
    duration: trip.duration,
    source: trip.source,
    sourceKey: trip.sourceKey,
    summary: trip.summary,
    title: trip.title,
  };
}

export function parseGroupChatMessage(
  id: string,
  data: Record<string, unknown> | undefined
): GroupChatMessage {
  const sharedTrip = parseSharedTrip(data?.sharedTrip);

  return {
    createdAtMs: toMillis(data?.createdAt),
    id,
    messageType: data?.messageType === "shared-trip" && sharedTrip ? "shared-trip" : "text",
    senderId: sanitizeString(data?.senderId),
    senderLabel: sanitizeString(data?.senderLabel, "Traveler"),
    sharedTrip,
    text: sanitizeString(data?.text),
  };
}
