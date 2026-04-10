export type TripRequestStatus = "closed" | "open";

import { sanitizeString, sanitizeStringArray, toMillis } from "./sanitize";

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
