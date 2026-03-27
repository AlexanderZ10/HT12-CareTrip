export type TripRequestStatus = "closed" | "open";

export type TripRequest = {
  budgetLabel: string;
  createdAtMs: number | null;
  creatorId: string;
  creatorLabel: string;
  destination: string;
  groupId: string | null;
  id: string;
  interestedUserIds: string[];
  note: string;
  status: TripRequestStatus;
  timingLabel: string;
  travelersLabel: string;
  updatedAtMs: number | null;
};

function sanitizeString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function sanitizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => sanitizeString(entry))
    .filter(Boolean);
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

export function parseTripRequest(
  id: string,
  data: Record<string, unknown> | undefined
): TripRequest {
  return {
    budgetLabel: sanitizeString(data?.budgetLabel, "Open budget"),
    createdAtMs: toMillis(data?.createdAt),
    creatorId: sanitizeString(data?.creatorId),
    creatorLabel: sanitizeString(data?.creatorLabel, "Traveler"),
    destination: sanitizeString(data?.destination, "Untitled trip"),
    groupId: sanitizeString(data?.groupId) || null,
    id,
    interestedUserIds: sanitizeStringArray(data?.interestedUserIds),
    note: sanitizeString(data?.note),
    status: data?.status === "closed" ? "closed" : "open",
    timingLabel: sanitizeString(data?.timingLabel, "Flexible timing"),
    travelersLabel: sanitizeString(data?.travelersLabel, "2-4 people"),
    updatedAtMs: toMillis(data?.updatedAt),
  };
}

export function sortTripRequestsByActivity(requests: TripRequest[]) {
  return [...requests].sort((left, right) => {
    const leftValue = left.updatedAtMs ?? left.createdAtMs ?? 0;
    const rightValue = right.updatedAtMs ?? right.createdAtMs ?? 0;
    return rightValue - leftValue;
  });
}
