import { type SavedTrip } from "./saved-trips";
import { type PlannerDayPlan } from "./home-travel-planner";
import { sanitizeString, sanitizeStringArray, toMillis } from "./sanitize";

export type GroupChatLinkedTransport = {
  amountLabel: string;
  amountValue: number;
  bookingUrl: string;
  duration: string;
  itemKey: string;
  provider: string;
  route: string;
  sourceLabel: string;
  title: string;
};

export type GroupChatSharedTrip = {
  budget: string | null;
  destination: string;
  details: string;
  duration: string | null;
  latitude: number | null;
  linkedTransports: GroupChatLinkedTransport[];
  longitude: number | null;
  source: "discover" | "home";
  sourceKey: string;
  summary: string;
  title: string;
  tripDays: PlannerDayPlan[];
};

export type GroupChatExpense = {
  amountLabel: string;
  amountValue: number;
  collectionMode: "group-payment" | "reimbursement";
  linkedBookingUrl: string | null;
  linkedItemKey: string | null;
  linkedSourceKey: string | null;
  paidById: string;
  paidByLabel: string;
  participantCount: number;
  participantIds: string[];
  title: string;
};

export type GroupChatPhoto = {
  caption: string;
  imageUri: string;
};

export type GroupChatMessage = {
  createdAtMs: number | null;
  expense: GroupChatExpense | null;
  id: string;
  messageType: "expense" | "photo" | "text" | "shared-trip";
  photo: GroupChatPhoto | null;
  senderAvatarUrl: string;
  senderId: string;
  senderLabel: string;
  sharedTrip: GroupChatSharedTrip | null;
  text: string;
};

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

function formatExpenseAmountLabel(amountValue: number) {
  const normalizedValue = Number.isInteger(amountValue)
    ? amountValue.toFixed(0)
    : amountValue.toFixed(2);

  return `${normalizedValue} EUR`;
}

function parseLinkedTransport(value: unknown): GroupChatLinkedTransport | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const data = value as Record<string, unknown>;
  const itemKey = sanitizeString(data.itemKey);
  const title = sanitizeString(data.title);
  const bookingUrl = sanitizeString(data.bookingUrl);
  const amountValue = sanitizeNumber(data.amountValue);

  if (!itemKey || !title || !bookingUrl || !amountValue || amountValue <= 0) {
    return null;
  }

  return {
    amountLabel: sanitizeString(data.amountLabel) || formatExpenseAmountLabel(amountValue),
    amountValue,
    bookingUrl,
    duration: sanitizeString(data.duration),
    itemKey,
    provider: sanitizeString(data.provider),
    route: sanitizeString(data.route),
    sourceLabel: sanitizeString(data.sourceLabel),
    title,
  };
}

function parseLinkedTransports(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => parseLinkedTransport(entry))
    .filter((entry): entry is GroupChatLinkedTransport => !!entry)
    .slice(0, 4);
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
    latitude: sanitizeNumber(data.latitude),
    linkedTransports: parseLinkedTransports(data.linkedTransports),
    longitude: sanitizeNumber(data.longitude),
    source,
    sourceKey: sanitizeString(data.sourceKey),
    summary: sanitizeString(data.summary),
    title,
    tripDays: parseTripDays(data.tripDays),
  };
}

function parseExpense(value: unknown): GroupChatExpense | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const data = value as Record<string, unknown>;
  const title = sanitizeString(data.title);
  const paidById = sanitizeString(data.paidById);
  const paidByLabel = sanitizeString(data.paidByLabel);
  const participantIds = sanitizeStringArray(data.participantIds);
  const amountValue = sanitizeNumber(data.amountValue);
  const participantCountValue = sanitizeNumber(data.participantCount);

  if (!title || !paidById || !paidByLabel || !amountValue || amountValue <= 0 || participantIds.length === 0) {
    return null;
  }

  return {
    amountLabel: sanitizeString(data.amountLabel) || formatExpenseAmountLabel(amountValue),
    amountValue,
    collectionMode: data.collectionMode === "group-payment" ? "group-payment" : "reimbursement",
    linkedBookingUrl: sanitizeString(data.linkedBookingUrl) || null,
    linkedItemKey: sanitizeString(data.linkedItemKey) || null,
    linkedSourceKey: sanitizeString(data.linkedSourceKey) || null,
    paidById,
    paidByLabel,
    participantCount:
      participantCountValue && participantCountValue >= participantIds.length
        ? participantCountValue
        : participantIds.length,
    participantIds,
    title,
  };
}

function parsePhoto(value: unknown): GroupChatPhoto | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const data = value as Record<string, unknown>;
  const imageUri = sanitizeString(data.imageUri);

  if (!imageUri) {
    return null;
  }

  return {
    caption: sanitizeString(data.caption),
    imageUri,
  };
}

export function buildGroupChatSharedTrip(
  trip: SavedTrip,
  options?: {
    linkedTransports?: GroupChatLinkedTransport[];
  }
): GroupChatSharedTrip {
  return {
    budget: trip.budget,
    destination: trip.destination,
    details: trip.details,
    duration: trip.duration,
    latitude: trip.latitude,
    linkedTransports: options?.linkedTransports?.slice(0, 4) ?? [],
    longitude: trip.longitude,
    source: trip.source,
    sourceKey: trip.sourceKey,
    summary: trip.summary,
    title: trip.title,
    tripDays: trip.tripDays,
  };
}

export function buildGroupChatExpense(input: {
  amountValue: number;
  collectionMode?: "group-payment" | "reimbursement";
  linkedBookingUrl?: string | null;
  linkedItemKey?: string | null;
  linkedSourceKey?: string | null;
  paidById: string;
  paidByLabel: string;
  participantIds: string[];
  title: string;
}): GroupChatExpense {
  return {
    amountLabel: formatExpenseAmountLabel(input.amountValue),
    amountValue: input.amountValue,
    collectionMode: input.collectionMode ?? "reimbursement",
    linkedBookingUrl: input.linkedBookingUrl?.trim() || null,
    linkedItemKey: input.linkedItemKey?.trim() || null,
    linkedSourceKey: input.linkedSourceKey?.trim() || null,
    paidById: input.paidById,
    paidByLabel: input.paidByLabel,
    participantCount: input.participantIds.length,
    participantIds: input.participantIds,
    title: input.title.trim(),
  };
}

export function parseGroupChatMessage(
  id: string,
  data: Record<string, unknown> | undefined
): GroupChatMessage {
  const sharedTrip = parseSharedTrip(data?.sharedTrip);
  const expense = parseExpense(data?.expense);
  const photo = parsePhoto(data?.photo);
  let messageType: GroupChatMessage["messageType"] = "text";

  if (data?.messageType === "shared-trip" && sharedTrip) {
    messageType = "shared-trip";
  } else if (data?.messageType === "expense" && expense) {
    messageType = "expense";
  } else if (data?.messageType === "photo" && photo) {
    messageType = "photo";
  }

  return {
    createdAtMs: toMillis(data?.createdAt),
    expense,
    id,
    messageType,
    photo,
    senderAvatarUrl: sanitizeString(data?.senderAvatarUrl),
    senderId: sanitizeString(data?.senderId),
    senderLabel: sanitizeString(data?.senderLabel, "Traveler"),
    sharedTrip,
    text: sanitizeString(data?.text),
  };
}
