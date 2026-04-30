import { doc, serverTimestamp, setDoc } from "firebase/firestore";

import { db } from "../firebase";
import { normalizeBudgetToEuro } from "./currency";
import { sanitizeString, sanitizeStringArray } from "./sanitize";
import {
  formatGroundedTravelPlan,
  type GroundedTravelPlan,
  type PlannerDayPlan,
} from "./home-travel-planner";

export type HomePlannerStep = "chatting" | "done";

export type HomeChatMessage = {
  createdAtMs: number;
  id: string;
  role: "assistant" | "user";
  text: string;
};

export type StoredHomePlan = {
  budget: string;
  createdAtMs: number;
  days: string;
  destination: string;
  formattedPlanText: string;
  timing: string;
  transportPreference: string;
  travelers: string;
  plan: GroundedTravelPlan;
  sourceKey: string;
} | null;

export type ArchivedHomePlanBlock = {
  plan: NonNullable<StoredHomePlan>;
  trailingMessages: HomeChatMessage[];
};

export type StoredHomePlannerState = {
  aiQuestionCount: number;
  archivedPlans: ArchivedHomePlanBlock[];
  awaitingGenerationConfirmation: boolean;
  budget: string;
  days: string;
  destination: string;
  followUpMessages: HomeChatMessage[];
  notes: string;
  origin: string;
  timing: string;
  transportPreference: string;
  travelers: string;
  tripStyle: string;
  latestPlan: StoredHomePlan;
  messages: HomeChatMessage[];
  step: HomePlannerStep;
};

export type HomePlannerChatThread = {
  createdAtMs: number;
  id: string;
  pinned: boolean;
  state: StoredHomePlannerState;
  title: string;
  updatedAtMs: number;
};

export type HomePlannerStore = {
  chats: HomePlannerChatThread[];
  currentChatId: string | null;
};

type ImportedSharedTrip = {
  budget: string | null;
  destination: string;
  details: string;
  duration: string | null;
  source: "discover" | "home";
  sourceKey: string;
  summary: string;
  title: string;
  tripDays: PlannerDayPlan[];
};

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseStructuredPlan(value: unknown): GroundedTravelPlan | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const rawPlan = value as Record<string, unknown>;
  const rawLanguage = sanitizeString(rawPlan.language);

  return {
    budgetNote: sanitizeString(rawPlan.budgetNote),
    language:
      rawLanguage === "en" ||
      rawLanguage === "de" ||
      rawLanguage === "es" ||
      rawLanguage === "fr" ||
      rawLanguage === "bg"
        ? (rawLanguage as GroundedTravelPlan["language"])
        : "bg",
    profileTip: sanitizeString(rawPlan.profileTip),
    stayOptions: Array.isArray(rawPlan.stayOptions)
      ? rawPlan.stayOptions
          .filter(
            (item): item is Record<string, unknown> => !!item && typeof item === "object"
          )
          .map((item) => ({
            area: sanitizeString(item.area),
            bookingUrl: sanitizeString(item.bookingUrl),
            directBookingUrl: sanitizeString(item.directBookingUrl),
            imageUrl: sanitizeString(item.imageUrl),
            name: sanitizeString(item.name),
            note: sanitizeString(item.note),
            pricePerNight: sanitizeString(item.pricePerNight),
            providerAccommodationId: sanitizeString(item.providerAccommodationId),
            providerKey: sanitizeString(item.providerKey),
            providerPaymentModes: sanitizeStringArray(item.providerPaymentModes),
            providerProductId: sanitizeString(item.providerProductId),
            ratingLabel: sanitizeString(item.ratingLabel),
            reservationMode: sanitizeString(item.reservationMode),
            sourceLabel: sanitizeString(item.sourceLabel),
            type: sanitizeString(item.type),
          }))
      : [],
    summary: sanitizeString(rawPlan.summary),
    title: sanitizeString(rawPlan.title),
    transportOptions: Array.isArray(rawPlan.transportOptions)
      ? rawPlan.transportOptions
          .filter(
            (item): item is Record<string, unknown> => !!item && typeof item === "object"
          )
          .map((item) => ({
            bookingUrl: sanitizeString(item.bookingUrl),
            duration: sanitizeString(item.duration),
            mode: sanitizeString(item.mode),
            note: sanitizeString(item.note),
            price: sanitizeString(item.price),
            provider: sanitizeString(item.provider),
            route: sanitizeString(item.route),
            sourceLabel: sanitizeString(item.sourceLabel),
          }))
      : [],
    tripDays: Array.isArray(rawPlan.tripDays)
      ? rawPlan.tripDays
          .filter(
            (item): item is Record<string, unknown> => !!item && typeof item === "object"
          )
          .map((item) => ({
            dayLabel: sanitizeString(item.dayLabel),
            items: sanitizeStringArray(item.items),
            title: sanitizeString(item.title),
          }))
      : [],
  };
}

function parseStoredHomePlan(value: unknown): StoredHomePlan {
  if (!value || typeof value !== "object") {
    return null;
  }

  const rawLatestPlan = value as Record<string, unknown>;
  const structuredPlan = parseStructuredPlan(rawLatestPlan.plan);
  const legacyFormattedPlan = sanitizeString(rawLatestPlan.plan);
  const createdAtMs =
    typeof rawLatestPlan.createdAtMs === "number" && Number.isFinite(rawLatestPlan.createdAtMs)
      ? Math.max(0, Math.round(rawLatestPlan.createdAtMs))
      : Date.now();
  const formattedPlanText =
    typeof rawLatestPlan.formattedPlanText === "string"
      ? sanitizeString(rawLatestPlan.formattedPlanText)
      : structuredPlan
        ? formatGroundedTravelPlan(structuredPlan)
        : legacyFormattedPlan;

  if (!sanitizeString(rawLatestPlan.destination) || (!structuredPlan && !formattedPlanText)) {
    return null;
  }

  return {
    budget: normalizeBudgetToEuro(sanitizeString(rawLatestPlan.budget)),
    createdAtMs,
    days: sanitizeString(rawLatestPlan.days),
    destination: sanitizeString(rawLatestPlan.destination),
    formattedPlanText,
    timing: sanitizeString(rawLatestPlan.timing),
    transportPreference: sanitizeString(rawLatestPlan.transportPreference),
    travelers: sanitizeString(rawLatestPlan.travelers),
    plan:
      structuredPlan ??
      {
        budgetNote: "",
        profileTip: "",
        stayOptions: [],
        summary: legacyFormattedPlan,
        title: sanitizeString(rawLatestPlan.destination, "Маршрут"),
        transportOptions: [],
        tripDays: [],
      },
    sourceKey: sanitizeString(rawLatestPlan.sourceKey),
  };
}

export function createHomeChatMessage(
  role: HomeChatMessage["role"],
  text: string
): HomeChatMessage {
  return {
    createdAtMs: Date.now(),
    id: createId(role),
    role,
    text,
  };
}

export function createEmptyPlannerState(initialAssistantMessage: string): StoredHomePlannerState {
  return {
    aiQuestionCount: 0,
    archivedPlans: [],
    awaitingGenerationConfirmation: false,
    budget: "",
    days: "",
    destination: "",
    followUpMessages: [],
    notes: "",
    origin: "",
    timing: "",
    transportPreference: "",
    travelers: "",
    tripStyle: "",
    latestPlan: null,
    messages: [createHomeChatMessage("assistant", initialAssistantMessage)],
    step: "chatting",
  };
}

export function createHomePlannerChat(
  initialAssistantMessage: string,
  title = "Нов чат"
): HomePlannerChatThread {
  const now = Date.now();

  return {
    createdAtMs: now,
    id: createId("chat"),
    pinned: false,
    state: createEmptyPlannerState(initialAssistantMessage),
    title,
    updatedAtMs: now,
  };
}

export function isHomePlannerChatUntouched(chat: HomePlannerChatThread) {
  return (
    chat.state.step === "chatting" &&
    chat.state.aiQuestionCount === 0 &&
    !chat.state.budget &&
    !chat.state.days &&
    !chat.state.destination &&
    !chat.state.notes &&
    !chat.state.origin &&
    !chat.state.timing &&
    !chat.state.transportPreference &&
    !chat.state.travelers &&
    !chat.state.tripStyle &&
    chat.state.archivedPlans.length === 0 &&
    !chat.state.awaitingGenerationConfirmation &&
    !chat.state.latestPlan &&
    chat.state.followUpMessages.length === 0 &&
    chat.state.messages.length === 1 &&
    chat.state.messages[0]?.role === "assistant"
  );
}

export function createHomePlannerChatFromSharedTrip(
  trip: ImportedSharedTrip
): HomePlannerChatThread {
  const now = Date.now();
  const normalizedBudget = normalizeBudgetToEuro(trip.budget ?? "");
  const normalizedDays = trip.duration?.trim() ?? "";

  return {
    createdAtMs: now,
    id: createId("chat-imported"),
    pinned: false,
    state: {
      aiQuestionCount: 0,
      archivedPlans: [],
      awaitingGenerationConfirmation: false,
      budget: normalizedBudget,
      days: normalizedDays,
      destination: trip.destination.trim(),
      followUpMessages: [],
      latestPlan: {
        budget: normalizedBudget,
        createdAtMs: now,
        days: normalizedDays,
        destination: trip.destination.trim(),
        formattedPlanText: trip.details.trim(),
        timing: "",
        transportPreference: "",
        travelers: "",
        plan: {
          budgetNote: trip.budget ?? "",
          profileTip:
            trip.source === "home"
              ? "Imported from a shared Home trip."
              : "Imported from a shared Discover trip.",
          stayOptions: [],
          summary: trip.summary.trim(),
          title: trip.title.trim(),
          transportOptions: [],
          tripDays: trip.tripDays,
        },
        sourceKey: trip.sourceKey.trim() || createId("imported-source"),
      },
      messages: [
        createHomeChatMessage(
          "assistant",
          "Imported from a group. You can continue this trip here without changing the original chat."
        ),
      ],
      notes: "",
      origin: "",
      step: "done",
      timing: "",
      transportPreference: "",
      travelers: "",
      tripStyle: "",
    },
    title: trip.title.trim() || `Trip for ${trip.destination.trim()}`,
    updatedAtMs: now,
  };
}

function parsePlannerStep(value: unknown): HomePlannerStep {
  return value === "done" ? "done" : "chatting";
}

function parsePlannerMessages(value: unknown): HomeChatMessage[] {
  const rawMessages = Array.isArray(value) ? value : [];

  return rawMessages
    .filter(
      (message): message is Record<string, unknown> =>
        !!message && typeof message === "object"
    )
    .map(
      (message, index) =>
        ({
          createdAtMs:
            typeof message.createdAtMs === "number" ? message.createdAtMs : Date.now() + index,
          id: sanitizeString(message.id, `chat-message-${index}`),
          role: message.role === "user" ? "user" : "assistant",
          text: sanitizeString(message.text),
        }) satisfies HomeChatMessage
    )
    .filter((message) => message.text.length > 0)
    .slice(-40);
}

function parseArchivedPlanBlocks(value: unknown): ArchivedHomePlanBlock[] {
  const rawBlocks = Array.isArray(value) ? value : [];

  return rawBlocks
    .filter((block): block is Record<string, unknown> => !!block && typeof block === "object")
    .map((block) => {
      const plan = parseStoredHomePlan(block.plan);

      if (!plan) {
        return null;
      }

      return {
        plan,
        trailingMessages: parsePlannerMessages(block.trailingMessages),
      } satisfies ArchivedHomePlanBlock;
    })
    .filter((block): block is ArchivedHomePlanBlock => !!block)
    .slice(-8);
}

function parsePlannerStateFromRaw(
  rawState: Record<string, unknown>,
  initialAssistantMessage: string
): StoredHomePlannerState {
  const parsedStep = parsePlannerStep(rawState.step);
  const parsedLatestPlan = parseStoredHomePlan(rawState.latestPlan);
  const archivedPlans = parseArchivedPlanBlocks(rawState.archivedPlans);
  const messages = parsePlannerMessages(rawState.chatMessages ?? rawState.messages);
  const followUpMessages = parsePlannerMessages(rawState.followUpMessages);
  const budget = normalizeBudgetToEuro(sanitizeString(rawState.budget));
  const days = sanitizeString(rawState.days);
  const destination = sanitizeString(rawState.destination);
  const notes = sanitizeString(rawState.notes);
  const origin = sanitizeString(rawState.origin);
  const timing = sanitizeString(rawState.timing);
  const transportPreference = sanitizeString(rawState.transportPreference);
  const travelers = sanitizeString(rawState.travelers);
  const tripStyle = sanitizeString(rawState.tripStyle);

  if (
    parsedStep === "done" &&
    !parsedLatestPlan
  ) {
    return createEmptyPlannerState(initialAssistantMessage);
  }

  if (
    parsedStep === "chatting" &&
    messages.length <= 1 &&
    !budget &&
    !days &&
    !destination &&
    !notes &&
    !origin &&
    !timing &&
    !transportPreference &&
    !travelers &&
    !tripStyle &&
    !parsedLatestPlan
  ) {
    return createEmptyPlannerState(initialAssistantMessage);
  }

  return {
    aiQuestionCount:
      typeof rawState.aiQuestionCount === "number" && Number.isFinite(rawState.aiQuestionCount)
        ? Math.max(0, Math.round(rawState.aiQuestionCount))
        : 0,
    archivedPlans,
    awaitingGenerationConfirmation: rawState.awaitingGenerationConfirmation === true,
    budget,
    days,
    destination,
    followUpMessages,
    notes,
    origin,
    timing,
    transportPreference,
    travelers,
    tripStyle,
    latestPlan: parsedLatestPlan,
    messages:
      messages.length > 0
        ? messages
        : [createHomeChatMessage("assistant", initialAssistantMessage)],
    step: parsedStep,
  };
}

function parsePlannerChatThread(
  value: unknown,
  initialAssistantMessage: string,
  index: number
): HomePlannerChatThread | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const rawChat = value as Record<string, unknown>;
  const rawState =
    rawChat.state && typeof rawChat.state === "object"
      ? (rawChat.state as Record<string, unknown>)
      : rawChat;

  return {
    createdAtMs:
      typeof rawChat.createdAtMs === "number" ? rawChat.createdAtMs : Date.now() - index,
    id: sanitizeString(rawChat.id, createId(`chat-${index}`)),
    pinned: rawChat.pinned === true,
    state: parsePlannerStateFromRaw(rawState, initialAssistantMessage),
    title: sanitizeString(rawChat.title, "Нов чат"),
    updatedAtMs:
      typeof rawChat.updatedAtMs === "number" ? rawChat.updatedAtMs : Date.now() - index,
  };
}

export function sortHomePlannerChats(chats: HomePlannerChatThread[]) {
  return [...chats].sort((left, right) => {
    if (left.pinned !== right.pinned) {
      return left.pinned ? -1 : 1;
    }

    return right.updatedAtMs - left.updatedAtMs;
  });
}

export function parseStoredHomePlannerStore(
  profileData: Record<string, unknown>,
  initialAssistantMessage: string
) {
  const rawPlanner =
    profileData.homePlanner && typeof profileData.homePlanner === "object"
      ? (profileData.homePlanner as Record<string, unknown>)
      : null;

  if (!rawPlanner) {
    const defaultChat = createHomePlannerChat(initialAssistantMessage);
    return {
      chats: [defaultChat],
      currentChatId: defaultChat.id,
    } satisfies HomePlannerStore;
  }

  const rawChats = Array.isArray(rawPlanner.chats) ? rawPlanner.chats : [];
  const chats =
    rawChats.length > 0
      ? rawChats
          .map((chat, index) => parsePlannerChatThread(chat, initialAssistantMessage, index))
          .filter((chat): chat is HomePlannerChatThread => !!chat)
      : [
          {
            ...createHomePlannerChat(initialAssistantMessage),
            state: parsePlannerStateFromRaw(rawPlanner, initialAssistantMessage),
            title: sanitizeString(rawPlanner.title, "Последен чат"),
          },
        ];

  const sortedChats = sortHomePlannerChats(chats);
  const requestedCurrentChatId = sanitizeString(rawPlanner.currentChatId);
  const currentChatId =
    sortedChats.find((chat) => chat.id === requestedCurrentChatId)?.id ??
    sortedChats[0]?.id ??
    null;

  return {
    chats: sortedChats.length > 0 ? sortedChats : [createHomePlannerChat(initialAssistantMessage)],
    currentChatId,
  } satisfies HomePlannerStore;
}

export async function saveHomePlannerStoreForUser(
  userId: string,
  store: HomePlannerStore
) {
  const sortedChats = sortHomePlannerChats(store.chats).slice(0, 40);

  await setDoc(
    doc(db, "profiles", userId),
    {
      homePlanner: {
        currentChatId:
          sortedChats.find((chat) => chat.id === store.currentChatId)?.id ??
          sortedChats[0]?.id ??
          null,
        chats: sortedChats.map((chat) => ({
          createdAtMs: chat.createdAtMs,
          id: chat.id,
          pinned: chat.pinned,
          title: chat.title.trim(),
          updatedAtMs: chat.updatedAtMs,
          state: {
            aiQuestionCount: chat.state.aiQuestionCount,
            archivedPlans: chat.state.archivedPlans
              .slice(-8)
              .map((block) => ({
                plan: {
                  budget: normalizeBudgetToEuro(block.plan.budget),
                  createdAtMs: block.plan.createdAtMs || Date.now(),
                  days: block.plan.days.trim(),
                  destination: block.plan.destination.trim(),
                  formattedPlanText: block.plan.formattedPlanText.trim(),
                  timing: block.plan.timing.trim(),
                  transportPreference: block.plan.transportPreference.trim(),
                  travelers: block.plan.travelers.trim(),
                  plan: block.plan.plan,
                  sourceKey: block.plan.sourceKey.trim(),
                },
                trailingMessages: block.trailingMessages
                  .filter((message) => message.text.trim().length > 0)
                  .slice(-20)
                  .map((message) => ({
                    createdAtMs: message.createdAtMs,
                    id: message.id,
                    role: message.role,
                    text: message.text.trim(),
                  })),
              })),
            awaitingGenerationConfirmation: chat.state.awaitingGenerationConfirmation === true,
            budget: normalizeBudgetToEuro(chat.state.budget),
            days: chat.state.days.trim(),
            destination: chat.state.destination.trim(),
            followUpMessages: chat.state.followUpMessages
              .filter((message) => message.text.trim().length > 0)
              .slice(-30)
              .map((message) => ({
                createdAtMs: message.createdAtMs,
                id: message.id,
                role: message.role,
                text: message.text.trim(),
              })),
            notes: chat.state.notes.trim(),
            origin: chat.state.origin.trim(),
            timing: chat.state.timing.trim(),
            transportPreference: chat.state.transportPreference.trim(),
            travelers: chat.state.travelers.trim(),
            tripStyle: chat.state.tripStyle.trim(),
            latestPlan: chat.state.latestPlan
              ? {
                  budget: normalizeBudgetToEuro(chat.state.latestPlan.budget),
                  createdAtMs: chat.state.latestPlan.createdAtMs || Date.now(),
                  days: chat.state.latestPlan.days.trim(),
                  destination: chat.state.latestPlan.destination.trim(),
                  formattedPlanText: chat.state.latestPlan.formattedPlanText.trim(),
                  timing: chat.state.latestPlan.timing.trim(),
                  transportPreference: chat.state.latestPlan.transportPreference.trim(),
                  travelers: chat.state.latestPlan.travelers.trim(),
                  plan: chat.state.latestPlan.plan,
                  sourceKey: chat.state.latestPlan.sourceKey.trim(),
                }
              : null,
            chatMessages: chat.state.messages
              .filter((message) => message.text.trim().length > 0)
              .slice(-40)
              .map((message) => ({
                createdAtMs: message.createdAtMs,
                id: message.id,
                role: message.role,
                text: message.text.trim(),
              })),
            step: chat.state.step,
          },
        })),
        updatedAtMs: Date.now(),
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
