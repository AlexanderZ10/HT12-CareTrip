import { doc, serverTimestamp, setDoc } from "firebase/firestore";

import { db } from "../firebase";
import { normalizeBudgetToEuro } from "./currency";
import {
  formatGroundedTravelPlan,
  type GroundedTravelPlan,
} from "./home-travel-planner";

export type HomePlannerStep =
  | "budget"
  | "days"
  | "travelers"
  | "transport"
  | "timing"
  | "destination"
  | "done";

export type HomeChatMessage = {
  createdAtMs: number;
  id: string;
  role: "assistant" | "user";
  text: string;
};

export type StoredHomePlan = {
  budget: string;
  days: string;
  destination: string;
  formattedPlanText: string;
  timing: string;
  transportPreference: string;
  travelers: string;
  plan: GroundedTravelPlan;
  sourceKey: string;
} | null;

export type StoredHomePlannerState = {
  budget: string;
  days: string;
  destination: string;
  timing: string;
  transportPreference: string;
  travelers: string;
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

function sanitizeString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function sanitizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4);
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseStructuredPlan(value: unknown): GroundedTravelPlan | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const rawPlan = value as Record<string, unknown>;

  return {
    budgetNote: sanitizeString(rawPlan.budgetNote),
    profileTip: sanitizeString(rawPlan.profileTip),
    stayOptions: Array.isArray(rawPlan.stayOptions)
      ? rawPlan.stayOptions
          .filter(
            (item): item is Record<string, unknown> => !!item && typeof item === "object"
          )
          .map((item) => ({
            area: sanitizeString(item.area),
            bookingUrl: sanitizeString(item.bookingUrl),
            imageUrl: sanitizeString(item.imageUrl),
            name: sanitizeString(item.name),
            note: sanitizeString(item.note),
            pricePerNight: sanitizeString(item.pricePerNight),
            ratingLabel: sanitizeString(item.ratingLabel),
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
    budget: "",
    days: "",
    destination: "",
    timing: "",
    transportPreference: "",
    travelers: "",
    latestPlan: null,
    messages: [createHomeChatMessage("assistant", initialAssistantMessage)],
    step: "budget",
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

function parsePlannerStep(value: unknown): HomePlannerStep {
  return value === "days" ||
    value === "travelers" ||
    value === "transport" ||
    value === "timing" ||
    value === "destination" ||
    value === "done"
    ? value
    : "budget";
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

function parsePlannerStateFromRaw(
  rawState: Record<string, unknown>,
  initialAssistantMessage: string
): StoredHomePlannerState {
  const messages = parsePlannerMessages(rawState.chatMessages ?? rawState.messages);

  return {
    budget: normalizeBudgetToEuro(sanitizeString(rawState.budget)),
    days: sanitizeString(rawState.days),
    destination: sanitizeString(rawState.destination),
    timing: sanitizeString(rawState.timing),
    transportPreference: sanitizeString(rawState.transportPreference),
    travelers: sanitizeString(rawState.travelers),
    latestPlan: parseStoredHomePlan(rawState.latestPlan),
    messages:
      messages.length > 0
        ? messages
        : [createHomeChatMessage("assistant", initialAssistantMessage)],
    step: parsePlannerStep(rawState.step),
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
            budget: normalizeBudgetToEuro(chat.state.budget),
            days: chat.state.days.trim(),
            destination: chat.state.destination.trim(),
            timing: chat.state.timing.trim(),
            transportPreference: chat.state.transportPreference.trim(),
            travelers: chat.state.travelers.trim(),
            latestPlan: chat.state.latestPlan
              ? {
                  budget: normalizeBudgetToEuro(chat.state.latestPlan.budget),
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
