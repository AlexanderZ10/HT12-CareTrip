import { type SavedTrip } from "./saved-trips";

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
  linkedTransports: GroupChatLinkedTransport[];
  source: "discover" | "home";
  sourceKey: string;
  summary: string;
  title: string;
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

export type GroupChatMessage = {
  createdAtMs: number | null;
  expense: GroupChatExpense | null;
  id: string;
  messageType: "expense" | "text" | "shared-trip";
  senderAvatarUrl: string;
  senderId: string;
  senderLabel: string;
  sharedTrip: GroupChatSharedTrip | null;
  text: string;
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

function sanitizeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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
    linkedTransports: parseLinkedTransports(data.linkedTransports),
    source,
    sourceKey: sanitizeString(data.sourceKey),
    summary: sanitizeString(data.summary),
    title,
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
    linkedTransports: options?.linkedTransports?.slice(0, 4) ?? [],
    source: trip.source,
    sourceKey: trip.sourceKey,
    summary: trip.summary,
    title: trip.title,
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
  let messageType: GroupChatMessage["messageType"] = "text";

  if (data?.messageType === "shared-trip" && sharedTrip) {
    messageType = "shared-trip";
  } else if (data?.messageType === "expense" && expense) {
    messageType = "expense";
  }

  return {
    createdAtMs: toMillis(data?.createdAt),
    expense,
    id,
    messageType,
    senderAvatarUrl: sanitizeString(data?.senderAvatarUrl),
    senderId: sanitizeString(data?.senderId),
    senderLabel: sanitizeString(data?.senderLabel, "Traveler"),
    sharedTrip,
    text: sanitizeString(data?.text),
  };
}
