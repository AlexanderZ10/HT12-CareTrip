import { type GroupChatExpense, type GroupChatMessage, type GroupChatSharedTrip } from "./group-chat";
import { type GroupExpenseRepayment } from "./group-expense-repayments";
import { type PlannerDayPlan } from "./home-travel-planner";
import { type JournalPhoto } from "./photo-journal";
import { type TravelGroup } from "./groups";
import { sanitizeString, sanitizeStringArray, toMillis } from "./sanitize";
import { type TripRequest } from "./trip-requests";

export type TripPresenceStatus = "airport" | "checked-in" | "exploring" | "in-transit";
export type ItineraryBookingState = "open" | "claimed" | "booked";
export type SmartTripAlertKind =
  | "trip-countdown"
  | "weather-check"
  | "dream-destination"
  | "booking-assigned";

export type GroupTripPresence = {
  avatarUrl: string;
  createdAtMs: number | null;
  id: string;
  label: string;
  latitude: number | null;
  longitude: number | null;
  note: string;
  sharingEnabled: boolean;
  status: TripPresenceStatus;
  updatedAtMs: number | null;
  userId: string;
};

export type GroupItineraryItem = {
  assignedLabel: string;
  assignedUserId: string | null;
  bookingState: ItineraryBookingState;
  id: string;
  note: string;
  title: string;
  voterIds: string[];
};

export type GroupItineraryDay = {
  dayLabel: string;
  id: string;
  items: GroupItineraryItem[];
  title: string;
};

export type GroupItineraryBoard = {
  createdAtMs: number | null;
  destination: string;
  endDateKey: string;
  entryCount: number;
  id: string;
  latitude: number | null;
  longitude: number | null;
  startDateKey: string;
  title: string;
  tripDays: GroupItineraryDay[];
  updatedAtMs: number | null;
  updatedById: string;
  updatedByLabel: string;
};

export type GroupTripRecap = {
  chatHighlights: string[];
  coverCaption: string;
  coverImageUri: string;
  createdAtMs: number | null;
  destination: string;
  id: string;
  memberCount: number;
  photoMoments: string[];
  spendSummaryLabel: string;
  title: string;
  totalExpenses: number;
  totalPhotos: number;
  visitedPlaces: string[];
};

export type SmartTripAlert = {
  body: string;
  groupId: string | null;
  id: string;
  kind: SmartTripAlertKind;
  requestId: string | null;
  title: string;
};

function sanitizeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function createCollaborationId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function relabelTripDays(days: GroupItineraryDay[]) {
  return days.map((day, index) => ({
    ...day,
    dayLabel: `Day ${index + 1}`,
  }));
}

function parseItineraryItem(value: unknown, index: number): GroupItineraryItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const data = value as Record<string, unknown>;
  const title = sanitizeString(data.title);

  if (!title) {
    return null;
  }

  const bookingState =
    data.bookingState === "claimed"
      ? "claimed"
      : data.bookingState === "booked"
        ? "booked"
        : "open";

  return {
    assignedLabel: sanitizeString(data.assignedLabel),
    assignedUserId: sanitizeString(data.assignedUserId) || null,
    bookingState,
    id: sanitizeString(data.id, `item-${index}`),
    note: sanitizeString(data.note),
    title,
    voterIds: sanitizeStringArray(data.voterIds).slice(0, 40),
  };
}

function parseItineraryDay(value: unknown, index: number): GroupItineraryDay | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const data = value as Record<string, unknown>;
  const title = sanitizeString(data.title);

  if (!title) {
    return null;
  }

  return {
    dayLabel: sanitizeString(data.dayLabel, `Day ${index + 1}`),
    id: sanitizeString(data.id, `day-${index}`),
    items: Array.isArray(data.items)
      ? data.items
          .map((item, itemIndex) => parseItineraryItem(item, itemIndex))
          .filter((item): item is GroupItineraryItem => !!item)
      : [],
    title,
  };
}

export function parseTripPresenceStatus(value: unknown): TripPresenceStatus {
  return value === "airport" ||
    value === "checked-in" ||
    value === "exploring" ||
    value === "in-transit"
    ? value
    : "exploring";
}

export function getTripPresenceStatusLabel(status: TripPresenceStatus) {
  switch (status) {
    case "airport":
      return "At airport";
    case "checked-in":
      return "Checked in";
    case "in-transit":
      return "In transit";
    case "exploring":
    default:
      return "Exploring";
  }
}

export function parseGroupTripPresence(
  id: string,
  data: Record<string, unknown> | undefined
): GroupTripPresence | null {
  const userId = sanitizeString(data?.userId, id);

  if (!userId) {
    return null;
  }

  return {
    avatarUrl: sanitizeString(data?.avatarUrl),
    createdAtMs: toMillis(data?.createdAtMs ?? data?.createdAt),
    id,
    label: sanitizeString(data?.label, "Traveler"),
    latitude: sanitizeNumber(data?.latitude),
    longitude: sanitizeNumber(data?.longitude),
    note: sanitizeString(data?.note),
    sharingEnabled: data?.sharingEnabled !== false,
    status: parseTripPresenceStatus(data?.status),
    updatedAtMs: toMillis(data?.updatedAtMs ?? data?.updatedAt),
    userId,
  };
}

export function parseGroupItineraryBoard(
  id: string,
  data: Record<string, unknown> | undefined
): GroupItineraryBoard | null {
  const title = sanitizeString(data?.title);
  const destination = sanitizeString(data?.destination);

  if (!title || !destination) {
    return null;
  }

  const tripDays = Array.isArray(data?.tripDays)
    ? data.tripDays
        .map((day, index) => parseItineraryDay(day, index))
        .filter((day): day is GroupItineraryDay => !!day)
    : [];

  return {
    createdAtMs: toMillis(data?.createdAtMs ?? data?.createdAt),
    destination,
    endDateKey: sanitizeString(data?.endDateKey),
    entryCount:
      typeof data?.entryCount === "number" && Number.isFinite(data.entryCount)
        ? data.entryCount
        : countItineraryEntries(tripDays),
    id,
    latitude: sanitizeNumber(data?.latitude),
    longitude: sanitizeNumber(data?.longitude),
    startDateKey: sanitizeString(data?.startDateKey),
    title,
    tripDays: relabelTripDays(tripDays),
    updatedAtMs: toMillis(data?.updatedAtMs ?? data?.updatedAt),
    updatedById: sanitizeString(data?.updatedById),
    updatedByLabel: sanitizeString(data?.updatedByLabel, "Traveler"),
  };
}

export function parseGroupTripRecap(
  id: string,
  data: Record<string, unknown> | undefined
): GroupTripRecap | null {
  const title = sanitizeString(data?.title);

  if (!title) {
    return null;
  }

  return {
    chatHighlights: sanitizeStringArray(data?.chatHighlights).slice(0, 4),
    coverCaption: sanitizeString(data?.coverCaption),
    coverImageUri: sanitizeString(data?.coverImageUri),
    createdAtMs: toMillis(data?.createdAtMs ?? data?.createdAt),
    destination: sanitizeString(data?.destination),
    id,
    memberCount:
      typeof data?.memberCount === "number" && Number.isFinite(data.memberCount)
        ? data.memberCount
        : 0,
    photoMoments: sanitizeStringArray(data?.photoMoments).slice(0, 4),
    spendSummaryLabel: sanitizeString(data?.spendSummaryLabel),
    title,
    totalExpenses:
      typeof data?.totalExpenses === "number" && Number.isFinite(data.totalExpenses)
        ? data.totalExpenses
        : 0,
    totalPhotos:
      typeof data?.totalPhotos === "number" && Number.isFinite(data.totalPhotos)
        ? data.totalPhotos
        : 0,
    visitedPlaces: sanitizeStringArray(data?.visitedPlaces).slice(0, 6),
  };
}

export function countItineraryEntries(days: GroupItineraryDay[]) {
  return days.reduce((total, day) => total + day.items.length, 0);
}

function buildFallbackTripDays(sharedTrip: GroupChatSharedTrip): GroupItineraryDay[] {
  const detailLines = sharedTrip.details
    .split("\n")
    .map((line) => line.replace(/^[-•]\s*/, "").trim())
    .filter((line) => line.length > 0)
    .slice(0, 6);

  const exploreItems = detailLines.length > 0 ? detailLines.slice(0, 3) : [`Explore ${sharedTrip.destination}`];
  const stayItems =
    detailLines.length > 3
      ? detailLines.slice(3, 6)
      : ["Check in and settle", "Find a favorite local spot"];

  return relabelTripDays([
    {
      dayLabel: "Day 1",
      id: createCollaborationId("day"),
      items: [
        {
          assignedLabel: "",
          assignedUserId: null,
          bookingState: "open",
          id: createCollaborationId("item"),
          note: "",
          title: `Arrive in ${sharedTrip.destination}`,
          voterIds: [],
        },
        {
          assignedLabel: "",
          assignedUserId: null,
          bookingState: "open",
          id: createCollaborationId("item"),
          note: "",
          title: "Airport transfer",
          voterIds: [],
        },
      ],
      title: "Arrival",
    },
    {
      dayLabel: "Day 2",
      id: createCollaborationId("day"),
      items: exploreItems.map((item) => ({
        assignedLabel: "",
        assignedUserId: null,
        bookingState: "open" as const,
        id: createCollaborationId("item"),
        note: "",
        title: item,
        voterIds: [],
      })),
      title: "Explore",
    },
    {
      dayLabel: "Day 3",
      id: createCollaborationId("day"),
      items: stayItems.map((item) => ({
        assignedLabel: "",
        assignedUserId: null,
        bookingState: "open" as const,
        id: createCollaborationId("item"),
        note: "",
        title: item,
        voterIds: [],
      })),
      title: "Wrap-up",
    },
  ]);
}

export function buildGroupItineraryBoardFromSharedTrip(input: {
  sharedTrip: GroupChatSharedTrip;
  updatedById: string;
  updatedByLabel: string;
}) {
  const tripDays =
    input.sharedTrip.tripDays.length > 0
      ? relabelTripDays(
          input.sharedTrip.tripDays.map((day, index) => ({
            dayLabel: day.dayLabel || `Day ${index + 1}`,
            id: createCollaborationId("day"),
            items: day.items.map((item) => ({
              assignedLabel: "",
              assignedUserId: null,
              bookingState: "open" as const,
              id: createCollaborationId("item"),
              note: "",
              title: item,
              voterIds: [],
            })),
            title: day.title || `Day ${index + 1}`,
          }))
        )
      : buildFallbackTripDays(input.sharedTrip);

  const now = Date.now();

  return {
    createdAtMs: now,
    destination: input.sharedTrip.destination,
    endDateKey: "",
    entryCount: countItineraryEntries(tripDays),
    id: "active",
    latitude: input.sharedTrip.latitude,
    longitude: input.sharedTrip.longitude,
    startDateKey: "",
    title: input.sharedTrip.title,
    tripDays,
    updatedAtMs: now,
    updatedById: input.updatedById,
    updatedByLabel: input.updatedByLabel,
  } satisfies GroupItineraryBoard;
}

export function updateBoardMetadata(
  board: GroupItineraryBoard,
  input: {
    updatedById: string;
    updatedByLabel: string;
  }
) {
  return {
    ...board,
    entryCount: countItineraryEntries(board.tripDays),
    tripDays: relabelTripDays(board.tripDays),
    updatedAtMs: Date.now(),
    updatedById: input.updatedById,
    updatedByLabel: input.updatedByLabel,
  };
}

export function createItineraryDay(title: string): GroupItineraryDay {
  return {
    dayLabel: "Day 1",
    id: createCollaborationId("day"),
    items: [],
    title: title.trim() || "New day",
  };
}

export function createItineraryItem(title: string): GroupItineraryItem {
  return {
    assignedLabel: "",
    assignedUserId: null,
    bookingState: "open",
    id: createCollaborationId("item"),
    note: "",
    title: title.trim(),
    voterIds: [],
  };
}

function formatAmount(value: number) {
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2)} EUR`;
}

function getExpensePerPerson(expense: GroupChatExpense) {
  return expense.participantCount > 0 ? expense.amountValue / expense.participantCount : expense.amountValue;
}

function getOutstandingExpenseAmount(
  expenseMessageId: string,
  expense: GroupChatExpense,
  payerUserId: string,
  expenseRepaymentsByKey: Record<string, GroupExpenseRepayment>
) {
  if (
    !expense.participantIds.includes(payerUserId) ||
    (expense.collectionMode !== "group-payment" && payerUserId === expense.paidById)
  ) {
    return 0;
  }

  const existingRepayment = expenseRepaymentsByKey[`${expenseMessageId}__${payerUserId}`];
  const alreadyPaidAmount = existingRepayment?.amountValue ?? 0;
  const shareAmount = getExpensePerPerson(expense);

  return Math.max(shareAmount - alreadyPaidAmount, 0);
}

function startOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

export function normalizeDateKey(value: string) {
  const trimmedValue = value.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedValue)) {
    return "";
  }

  return trimmedValue;
}

export function parseDateKey(value: string) {
  const normalizedValue = normalizeDateKey(value);

  if (!normalizedValue) {
    return null;
  }

  const [year, month, day] = normalizedValue.split("-").map((part) => Number(part));

  if (!year || !month || !day) {
    return null;
  }

  const parsedValue = new Date(year, month - 1, day);
  return Number.isNaN(parsedValue.getTime()) ? null : parsedValue;
}

export function getDaysUntilDateKey(value: string, nowMs = Date.now()) {
  const parsedDate = parseDateKey(value);

  if (!parsedDate) {
    return null;
  }

  const now = startOfLocalDay(new Date(nowMs));
  const target = startOfLocalDay(parsedDate);
  return Math.round((target.getTime() - now.getTime()) / 86400000);
}

function uniqueStrings(values: string[], maxCount: number) {
  const seen = new Set<string>();
  const nextValues: string[] = [];

  for (const value of values) {
    const trimmedValue = value.trim();
    const key = trimmedValue.toLowerCase();

    if (!trimmedValue || seen.has(key)) {
      continue;
    }

    seen.add(key);
    nextValues.push(trimmedValue);

    if (nextValues.length >= maxCount) {
      break;
    }
  }

  return nextValues;
}

export function buildGroupTripRecap(input: {
  expenses: GroupChatMessage[];
  expenseRepayments: GroupExpenseRepayment[];
  group: TravelGroup;
  journalPhotos: JournalPhoto[];
  messages: GroupChatMessage[];
  tripBoard: GroupItineraryBoard | null;
}) {
  const meaningfulTexts = input.messages
    .filter((message) => message.messageType === "text")
    .map((message) => sanitizeString(message.text))
    .filter((message) => message.length >= 12);
  const chatPhotoMessages = input.messages
    .filter((message) => message.messageType === "photo" && !!message.photo)
    .sort((left, right) => (right.createdAtMs ?? 0) - (left.createdAtMs ?? 0));
  const photoMoments = [
    ...input.journalPhotos.map(
      (photo) => sanitizeString(photo.caption) || sanitizeString(photo.location)
    ),
    ...chatPhotoMessages.map((message) => sanitizeString(message.photo?.caption)),
  ]
    .filter(Boolean);
  const sharedTripDestinations = input.messages
    .map((message) => sanitizeString(message.sharedTrip?.destination))
    .filter(Boolean);
  const visitedPlaces = uniqueStrings(
    [
      sanitizeString(input.tripBoard?.destination),
      ...sharedTripDestinations,
      ...input.journalPhotos.map((photo) => sanitizeString(photo.location)),
    ],
    6
  );
  const totalExpenses = input.expenses.reduce(
    (sum, message) => sum + (message.expense?.amountValue ?? 0),
    0
  );
  const topJournalPhoto = [...input.journalPhotos].sort(
    (left, right) => (right.createdAtMs ?? 0) - (left.createdAtMs ?? 0)
  )[0];
  const topChatPhoto = chatPhotoMessages[0];
  const now = Date.now();

  return {
    chatHighlights: uniqueStrings(meaningfulTexts.slice(-6).reverse(), 3),
    coverCaption:
      sanitizeString(topJournalPhoto?.caption) ||
      sanitizeString(topJournalPhoto?.location) ||
      sanitizeString(topChatPhoto?.photo?.caption) ||
      `${input.group.name} wrapped up another trip.`,
    coverImageUri:
      sanitizeString(topJournalPhoto?.imageUri) ||
      sanitizeString(topChatPhoto?.photo?.imageUri),
    createdAtMs: now,
    destination:
      sanitizeString(input.tripBoard?.destination) ||
      sharedTripDestinations[0] ||
      input.group.name,
    id: "latest",
    memberCount: input.group.memberCount,
    photoMoments: uniqueStrings(photoMoments, 3),
    spendSummaryLabel:
      totalExpenses > 0
        ? `${formatAmount(totalExpenses)} across ${input.expenses.length} shared expense${input.expenses.length === 1 ? "" : "s"}`
        : "No shared expenses were logged.",
    title: `${input.group.name} recap`,
    totalExpenses,
    totalPhotos: input.journalPhotos.length + chatPhotoMessages.length,
    visitedPlaces,
  } satisfies GroupTripRecap;
}

function buildDreamDestinationTokens(rawValue: string) {
  return uniqueStrings(
    rawValue
      .split(/[,\n]/)
      .map((value) => normalizeText(value))
      .filter(Boolean),
    20
  );
}

function matchesDreamDestination(dreamDestinations: string, destination: string) {
  const normalizedDestination = normalizeText(destination);

  if (!normalizedDestination) {
    return false;
  }

  return buildDreamDestinationTokens(dreamDestinations).some(
    (dreamDestination) =>
      normalizedDestination.includes(dreamDestination) || dreamDestination.includes(normalizedDestination)
  );
}

export function buildSmartTripAlerts(input: {
  currentUserId: string;
  dreamDestinations: string;
  groupBoardsByGroupId: Record<string, GroupItineraryBoard>;
  groups: TravelGroup[];
  nowMs?: number;
  tripRequests: TripRequest[];
}) {
  const nowMs = input.nowMs ?? Date.now();
  const alerts: SmartTripAlert[] = [];

  for (const group of input.groups) {
    const board = input.groupBoardsByGroupId[group.id];

    if (!board) {
      continue;
    }

    const daysUntilStart = getDaysUntilDateKey(board.startDateKey, nowMs);

    if (daysUntilStart !== null && daysUntilStart >= 0 && daysUntilStart <= 7) {
      alerts.push({
        body:
          daysUntilStart === 0
            ? `Your ${board.destination} trip starts today. Open the group and check who is already moving.`
            : `${group.name} kicks off in ${daysUntilStart} day${daysUntilStart === 1 ? "" : "s"}. Make sure the plan and tracker are ready.`,
        groupId: group.id,
        id: `countdown:${group.id}:${board.startDateKey}`,
        kind: "trip-countdown",
        requestId: null,
        title:
          daysUntilStart === 0
            ? `${board.destination} starts today`
            : `${board.destination} starts in ${daysUntilStart} days`,
      });
    }

    if (daysUntilStart !== null && daysUntilStart >= 0 && daysUntilStart <= 3) {
      alerts.push({
        body: `Your ${board.destination} trip is close. Open the plan, check the weather, and make sure bookings are assigned.`,
        groupId: group.id,
        id: `weather:${group.id}:${board.startDateKey}`,
        kind: "weather-check",
        requestId: null,
        title: `Prep ${board.destination} before takeoff`,
      });
    }

    const assignedTasks = board.tripDays.flatMap((day) =>
      day.items.filter(
        (item) => item.assignedUserId === input.currentUserId && item.bookingState !== "booked"
      )
    );

    if (assignedTasks.length > 0) {
      alerts.push({
        body: `${assignedTasks[0]?.title ?? "A booking task"} is on your side. Open ${group.name} and mark it once it is booked.`,
        groupId: group.id,
        id: `booking:${group.id}:${assignedTasks[0]?.id ?? "pending"}`,
        kind: "booking-assigned",
        requestId: null,
        title: `Booking task waiting in ${group.name}`,
      });
    }
  }

  for (const request of input.tripRequests) {
    if (request.creatorId === input.currentUserId) {
      continue;
    }

    if (!matchesDreamDestination(input.dreamDestinations, request.destination)) {
      continue;
    }

    alerts.push({
      body: `${request.creatorLabel} is planning ${request.destination}. Budget: ${request.budgetLabel}. Timing: ${request.timingLabel}.`,
      groupId: request.groupId,
      id: `dream:${request.id}`,
      kind: "dream-destination",
      requestId: request.id,
      title: `${request.destination} matches your dream list`,
    });
  }

  return alerts
    .sort((left, right) => left.title.localeCompare(right.title))
    .slice(0, 8);
}

export function buildWalletSettlementRows(input: {
  expenseMessages: GroupChatMessage[];
  expenseRepaymentsByKey: Record<string, GroupExpenseRepayment>;
  userId: string;
}) {
  return input.expenseMessages
    .map((message) => {
      const expense = message.expense;

      if (!expense) {
        return null;
      }

      const outstandingAmount = getOutstandingExpenseAmount(
        message.id,
        expense,
        input.userId,
        input.expenseRepaymentsByKey
      );

      if (outstandingAmount <= 0) {
        return null;
      }

      return {
        amountLabel: formatAmount(outstandingAmount),
        amountValue: outstandingAmount,
        creditorLabel:
          expense.collectionMode === "group-payment" ? "Trip split" : expense.paidByLabel,
        expenseTitle: expense.title,
        message,
      };
    })
    .filter(
      (
        row
      ): row is {
        amountLabel: string;
        amountValue: number;
        creditorLabel: string;
        expenseTitle: string;
        message: GroupChatMessage;
      } => !!row
    )
    .sort((left, right) => right.amountValue - left.amountValue);
}

export function buildPresenceRoster(input: {
  group: TravelGroup;
  presences: GroupTripPresence[];
}) {
  const presenceByUserId = Object.fromEntries(
    input.presences.map((presence) => [presence.userId, presence] as const)
  );

  return input.group.memberIds.map((memberId) => {
    const existingPresence = presenceByUserId[memberId];

    return (
      existingPresence ?? {
        avatarUrl: input.group.memberAvatarUrlsById[memberId] ?? "",
        createdAtMs: null,
        id: memberId,
        label:
          input.group.memberLabelsById[memberId] ||
          (memberId === input.group.creatorId ? input.group.creatorLabel : "Traveler"),
        latitude: null,
        longitude: null,
        note: "",
        sharingEnabled: false,
        status: "exploring" as const,
        updatedAtMs: null,
        userId: memberId,
      }
    );
  });
}

export function buildTrackerMapPoints(input: {
  board: GroupItineraryBoard | null;
  presences: GroupTripPresence[];
}) {
  if (!input.board || input.board.latitude === null || input.board.longitude === null) {
    return [];
  }

  const baseLatitude = input.board.latitude;
  const baseLongitude = input.board.longitude;

  return input.presences
    .filter((presence) => presence.sharingEnabled)
    .map((presence, index) => {
      const offset = ((index % 6) + 1) * 0.012;
      const latitude = presence.latitude ?? baseLatitude + (index % 2 === 0 ? offset : -offset);
      const longitude =
        presence.longitude ?? baseLongitude + (index % 3 === 0 ? offset : -offset);

      return {
        dayLabel: getTripPresenceStatusLabel(presence.status),
        latitude,
        longitude,
        title: `${presence.label} • ${getTripPresenceStatusLabel(presence.status)}`,
      };
    });
}
