import { MaterialIcons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { auth, db } from "../../firebase";
import { normalizeBudgetToEuro } from "../../utils/currency";
import { getFirestoreUserMessage } from "../../utils/firestore-errors";
import {
  createEmptyPlannerState,
  createHomeChatMessage,
  createHomePlannerChat,
  parseStoredHomePlannerStore,
  saveHomePlannerStoreForUser,
  sortHomePlannerChats,
  type HomePlannerChatThread,
  type HomePlannerStore,
  type HomePlannerStep,
  type StoredHomePlan,
} from "../../utils/home-chat-storage";
import {
  formatGroundedTravelPlan,
  generateGroundedTravelPlan,
  getHomePlannerErrorMessage,
  type PlannerTransportOption,
} from "../../utils/home-travel-planner";
import { getProfileDisplayName } from "../../utils/profile-info";
import { createTestPaymentIntent } from "../../utils/travel-offers";
import {
  buildBookingOrder,
  getBookingEstimate,
  saveBookingForUser,
} from "../../utils/bookings";
import {
  buildSavedTripFromHome,
  getHomeSavedSourceKey,
  parseSavedTrips,
  saveTripForUser,
} from "../../utils/saved-trips";
import { extractDiscoverProfile, type DiscoverProfile } from "../../utils/trip-recommendations";

const BUDGET_SUGGESTIONS = [
  "До 400 евро",
  "800 - 1200 евро",
  "1200 - 2200 евро",
  "Няма фиксиран лимит",
];

const DAY_SUGGESTIONS = ["2 дни", "3 дни", "5 дни", "7 дни"];
const TRAVELER_SUGGESTIONS = ["1 човек", "2 човека", "3 човека", "4+ човека"];
const TRANSPORT_SUGGESTIONS = [
  "Самолет",
  "Автобус или влак",
  "Кола / споделен транспорт",
  "Без значение",
];
const TIMING_SUGGESTIONS = [
  "Следващия уикенд",
  "След 2-4 седмици",
  "Това лято",
  "Гъвкаво",
];
const PAYMENT_METHODS = ["Банкова карта", "Apple Pay", "Google Pay"];

type BookingCheckoutStage = "form" | "processing" | "success";

type BookingReceipt = {
  authorizationCode: string;
  destination: string;
  paymentIntentId: string;
  paymentMethod: string;
  paymentMode: "mock" | "stripe_test";
  processedAtLabel: string;
  selectedStayLabel: string | null;
  selectedTransportLabel: string | null;
  totalLabel: string;
};

const LOW_BUDGET_DESTINATIONS = ["Солун", "Белград", "Букурещ", "Скопие"];
const MID_BUDGET_DESTINATIONS = ["Будапеща", "Тоскана", "Прованс", "Коста Брава"];
const HIGH_BUDGET_DESTINATIONS = ["Киото", "Мадейра", "Оман", "Маракеш"];
const GROUND_DESTINATIONS = ["Солун", "Ниш", "Букурещ", "Белград"];
const ROAD_TRIP_DESTINATIONS = ["Северна Гърция", "Трансилвания", "Сърбия", "Румъния"];

function buildInitialAssistantMessage(profileName: string) {
  return `Здравей, ${profileName}. Ще задам няколко бързи въпроса като за истинско планиране на почивка. Започваме с бюджета ти в евро.`;
}

function buildDaysQuestion(budget: string) {
  return `Супер. Планираме в рамките на ${budget}. За колко дни да е пътуването?`;
}

function buildTravelersQuestion(days: string) {
  return `Чудесно. Планираме ${days}. Колко човека ще пътуват общо?`;
}

function buildTransportQuestion(travelers: string) {
  return `Разбрах. Пътувате ${travelers}. Какъв транспорт предпочитате?`;
}

function buildTimingQuestion(transportPreference: string) {
  return `Супер. Ще търся варианти основно с ${transportPreference.toLowerCase()}. Кога искате да е пътуването?`;
}

function buildDestinationQuestion(
  profile: DiscoverProfile,
  timing: string,
  travelers: string
) {
  const dreamDestination = profile.personalProfile.dreamDestinations
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)[0];

  if (dreamDestination) {
    return `Чудесно. За ${travelers} ${timing.toLowerCase()} кажи ми дестинация. Ако искаш, можем да стъпим на ${dreamDestination}.`;
  }

  return `Чудесно. За ${travelers} ${timing.toLowerCase()} кажи ми желаната дестинация и ще подготвя конкретен маршрут.`;
}

function normalizeDaysLabel(value: string) {
  const trimmedValue = value.trim();
  const match = trimmedValue.match(/\d+/);

  if (!match) {
    return trimmedValue;
  }

  const dayCount = Number(match[0]);

  if (!Number.isFinite(dayCount) || dayCount <= 0) {
    return trimmedValue;
  }

  return `${dayCount} дни`;
}

function normalizeTravelersLabel(value: string) {
  const trimmedValue = value.trim();
  const match = trimmedValue.match(/\d+/);

  if (!match) {
    return trimmedValue;
  }

  const count = Number(match[0]);

  if (!Number.isFinite(count) || count <= 0) {
    return trimmedValue;
  }

  if (count === 1) {
    return "1 човек";
  }

  return `${count} човека`;
}

function extractBudgetCap(value: string) {
  const matches = value.match(/\d+(?:[.,]\d+)?/g);

  if (!matches) {
    return null;
  }

  const numbers = matches
    .map((item) => Number(item.replace(",", ".")))
    .filter((item) => Number.isFinite(item));

  if (numbers.length === 0) {
    return null;
  }

  return Math.max(...numbers);
}

function getDestinationSuggestions(
  profile: DiscoverProfile | null,
  budget: string,
  transportPreference: string
) {
  const homeBase = profile?.personalProfile.homeBase.toLowerCase() ?? "";
  const dreamDestinations = profile?.personalProfile.dreamDestinations
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean) ?? [];

  const budgetCap = extractBudgetCap(normalizeBudgetToEuro(budget));
  const normalizedTransport = transportPreference.toLowerCase();
  let baseSuggestions = HIGH_BUDGET_DESTINATIONS;

  if (
    normalizedTransport.includes("автобус") ||
    normalizedTransport.includes("влак")
  ) {
    baseSuggestions = GROUND_DESTINATIONS;
  } else if (
    normalizedTransport.includes("спод") ||
    normalizedTransport.includes("кола")
  ) {
    baseSuggestions = ROAD_TRIP_DESTINATIONS;
  } else if (budgetCap !== null && budgetCap <= 500) {
    baseSuggestions = LOW_BUDGET_DESTINATIONS;
  } else if (budgetCap !== null && budgetCap <= 1300) {
    baseSuggestions = MID_BUDGET_DESTINATIONS;
  }

  const regionSuggestion =
    homeBase.includes("соф")
      ? ["Истанбул"]
      : homeBase.includes("варн")
        ? ["Букурещ"]
        : homeBase.includes("пловдив")
          ? ["Солун"]
          : [];

  return [...dreamDestinations, ...regionSuggestion, ...baseSuggestions]
    .filter((item, index, array) => item && array.indexOf(item) === index)
    .slice(0, 4);
}

function getTransportIconName(option: PlannerTransportOption) {
  const mode = option.mode.toLowerCase();

  if (mode.includes("автобус") || mode.includes("bus")) {
    return "directions-bus";
  }

  if (mode.includes("rideshare") || mode.includes("спод") || mode.includes("car")) {
    return "emoji-transportation";
  }

  if (mode.includes("train") || mode.includes("влак")) {
    return "train";
  }

  if (mode.includes("flight") || mode.includes("полет")) {
    return "flight";
  }

  return "route";
}

function formatUpdatedDate(value: number) {
  return new Intl.DateTimeFormat("bg-BG", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getPaymentMethodIcon(method: string) {
  if (method.includes("Apple")) {
    return "phone-iphone";
  }

  if (method.includes("Google")) {
    return "android";
  }

  return "credit-card";
}

function getPaymentMethodDisplayLabel(method: string) {
  if (method.includes("Apple")) {
    return "Apple Pay";
  }

  if (method.includes("Google")) {
    return "Google Pay";
  }

  return "Visa •••• 4242";
}

function formatCheckoutReference(value: string) {
  const compactValue = value
    .replace(/^pi_/, "")
    .replace(/^local_/, "")
    .replace(/^fallback_/, "")
    .replace(/^mock_/, "")
    .replace(/_secret.*$/, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(-10)
    .toUpperCase();

  return `BK-${compactValue || "2475A1F9"}`;
}

function formatProcessedAt(value: number) {
  return new Intl.DateTimeFormat("bg-BG", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function createAuthorizationCode(value: string) {
  const compactValue = value
    .replace(/^pi_/, "")
    .replace(/^local_/, "")
    .replace(/^fallback_/, "")
    .replace(/^mock_/, "")
    .replace(/_secret.*$/, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(-6)
    .toUpperCase();

  return compactValue || "A47K92";
}

function normalizeLatestPlan(plan: StoredHomePlan): StoredHomePlan {
  if (!plan) {
    return null;
  }

  const formattedPlanText = plan.formattedPlanText || formatGroundedTravelPlan(plan.plan);

  return {
    ...plan,
    formattedPlanText,
    sourceKey:
      plan.sourceKey ||
      getHomeSavedSourceKey({
        budget: plan.budget,
        days: plan.days,
        destination: plan.destination,
        formattedPlanText,
      }),
  };
}

function getStepTitle(step: HomePlannerStep) {
  if (step === "budget") return "Бюджет";
  if (step === "days") return "Продължителност";
  if (step === "travelers") return "Колко човека";
  if (step === "transport") return "Транспорт";
  if (step === "timing") return "Кога";
  return "Предложения";
}

function getDefaultChatTitle(chatCount: number) {
  return chatCount <= 0 ? "Нов чат" : `Нов чат ${chatCount + 1}`;
}

function getAutoChatTitle(currentTitle: string, destination: string, planTitle: string) {
  const isDefaultTitle =
    currentTitle.trim().startsWith("Нов чат") || currentTitle.trim() === "Последен чат";

  if (!isDefaultTitle) {
    return currentTitle;
  }

  return planTitle || destination || currentTitle;
}

export default function HomeTabScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWideLayout = width >= 980;
  const isPhoneLayout = width < 768;
  const isCompactPhone = width < 430;

  const [loading, setLoading] = useState(true);
  const [planning, setPlanning] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<DiscoverProfile | null>(null);
  const [profileName, setProfileName] = useState("Traveler");
  const [chatInput, setChatInput] = useState("");
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");
  const [bookingError, setBookingError] = useState("");
  const [bookingSuccess, setBookingSuccess] = useState("");
  const [bookingModalVisible, setBookingModalVisible] = useState(false);
  const [bookingProcessing, setBookingProcessing] = useState(false);
  const [bookingStage, setBookingStage] = useState<BookingCheckoutStage>("form");
  const [bookingProgress, setBookingProgress] = useState(0);
  const [bookingProgressLabel, setBookingProgressLabel] = useState("");
  const [bookingReceipt, setBookingReceipt] = useState<BookingReceipt | null>(null);
  const [selectedTransportIndex, setSelectedTransportIndex] = useState<number | null>(0);
  const [selectedStayIndex, setSelectedStayIndex] = useState<number | null>(0);
  const [bookingForm, setBookingForm] = useState({
    contactEmail: "",
    contactName: "",
    note: "",
    paymentMethod: PAYMENT_METHODS[0] ?? "Банкова карта",
  });
  const [savedSourceKeys, setSavedSourceKeys] = useState<string[]>([]);
  const [homeStore, setHomeStore] = useState<HomePlannerStore>({
    chats: [],
    currentChatId: null,
  });
  const [chatMenuVisible, setChatMenuVisible] = useState(false);
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const currentChat = useMemo(() => {
    if (homeStore.chats.length === 0) {
      return null;
    }

    return (
      homeStore.chats.find((chat) => chat.id === homeStore.currentChatId) ??
      sortHomePlannerChats(homeStore.chats)[0]
    );
  }, [homeStore]);

  const currentPlannerState =
    currentChat?.state ?? createEmptyPlannerState(buildInitialAssistantMessage(profileName));
  const latestPlan = currentPlannerState.latestPlan;
  const selectedTransport =
    selectedTransportIndex !== null
      ? latestPlan?.plan.transportOptions[selectedTransportIndex] ?? null
      : null;
  const selectedStay =
    selectedStayIndex !== null
      ? latestPlan?.plan.stayOptions[selectedStayIndex] ?? null
      : null;
  const bookingEstimate = latestPlan
    ? getBookingEstimate({
        days: latestPlan.days,
        stay: selectedStay,
        transport: selectedTransport,
        travelers: latestPlan.travelers,
      })
    : {
        totalEstimate: null,
        totalLabel: "Цена при запитване",
      };
  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (nextUser) => {
      unsubscribeProfile?.();
      unsubscribeProfile = null;

      if (!nextUser) {
        setUser(null);
        setLoading(false);
        router.replace("/login");
        return;
      }

      setUser(nextUser);
      setLoading(true);
      setError("");
      setSaveError("");
      setSaveSuccess("");

      unsubscribeProfile = onSnapshot(
        doc(db, "profiles", nextUser.uid),
        (profileSnapshot) => {
          if (!profileSnapshot.exists()) {
            setLoading(false);
            router.replace("/onboarding");
            return;
          }

          const profileData = profileSnapshot.data() as Record<string, unknown>;
          const nextProfile = extractDiscoverProfile(profileData);

          if (!nextProfile) {
            setLoading(false);
            router.replace("/onboarding");
            return;
          }

          const nextProfileName = getProfileDisplayName({
            email: nextUser.email,
            profileInfo:
              profileData.profileInfo && typeof profileData.profileInfo === "object"
                ? (profileData.profileInfo as Record<string, unknown>)
                : undefined,
            username: typeof profileData.username === "string" ? profileData.username : null,
          });

          setProfile(nextProfile);
          setProfileName(nextProfileName);
          setSavedSourceKeys(parseSavedTrips(profileData).map((trip) => trip.sourceKey));
          setHomeStore(
            parseStoredHomePlannerStore(
              profileData,
              buildInitialAssistantMessage(nextProfileName)
            )
          );
          setLoading(false);
        },
        (nextError) => {
          setError(getFirestoreUserMessage(nextError, "read"));
          setLoading(false);
        }
      );
    });

    return () => {
      unsubscribeProfile?.();
      unsubscribeAuth();
    };
  }, [router]);

  const quickReplies = useMemo(() => {
    if (currentPlannerState.step === "budget") {
      return BUDGET_SUGGESTIONS;
    }

    if (currentPlannerState.step === "days") {
      return DAY_SUGGESTIONS;
    }

    if (currentPlannerState.step === "travelers") {
      return TRAVELER_SUGGESTIONS;
    }

    if (currentPlannerState.step === "transport") {
      return TRANSPORT_SUGGESTIONS;
    }

    if (currentPlannerState.step === "timing") {
      return TIMING_SUGGESTIONS;
    }

    if (currentPlannerState.step === "destination") {
      return getDestinationSuggestions(
        profile,
        currentPlannerState.budget,
        currentPlannerState.transportPreference
      );
    }

    return [];
  }, [currentPlannerState, profile]);

  const canSend =
    chatInput.trim().length > 0 && !planning && currentPlannerState.step !== "done";

  const persistStore = async (nextStore: HomePlannerStore) => {
    if (!user) {
      return;
    }

    try {
      await saveHomePlannerStoreForUser(user.uid, nextStore);
    } catch (nextError) {
      setError(getFirestoreUserMessage(nextError, "write"));
    }
  };

  const resetBookingUi = () => {
    setBookingStage("form");
    setBookingProgress(0);
    setBookingProgressLabel("");
    setBookingReceipt(null);
    setBookingError("");
  };

  const closeBookingModal = () => {
    if (bookingProcessing) {
      return;
    }

    setBookingModalVisible(false);
    resetBookingUi();
  };

  const replaceCurrentChat = async (
    updater: (chat: HomePlannerChatThread) => HomePlannerChatThread
  ) => {
    if (!currentChat) {
      return;
    }

    const nextChats = sortHomePlannerChats(
      homeStore.chats.map((chat) => (chat.id === currentChat.id ? updater(chat) : chat))
    );
    const nextStore = {
      ...homeStore,
      chats: nextChats,
      currentChatId: currentChat.id,
    };

    setHomeStore(nextStore);
    await persistStore(nextStore);
  };

  const handleSelectChat = async (chatId: string) => {
    const nextStore = {
      ...homeStore,
      currentChatId: chatId,
    };

    setChatMenuVisible(false);
    setChatInput("");
    setError("");
    setSaveError("");
    setSaveSuccess("");
    setHomeStore(nextStore);
    await persistStore(nextStore);
  };

  const handleCreateChat = async () => {
    const initialAssistantMessage = buildInitialAssistantMessage(profileName);
    const nextChat = createHomePlannerChat(
      initialAssistantMessage,
      getDefaultChatTitle(homeStore.chats.length)
    );
    const nextStore = {
      chats: sortHomePlannerChats([nextChat, ...homeStore.chats]),
      currentChatId: nextChat.id,
    };

    setChatMenuVisible(false);
    setChatInput("");
    setError("");
    setSaveError("");
    setSaveSuccess("");
    setHomeStore(nextStore);
    await persistStore(nextStore);
  };

  const handleDeleteChat = async (chatId: string) => {
    const remainingChats = homeStore.chats.filter((chat) => chat.id !== chatId);
    const nextStore =
      remainingChats.length > 0
        ? {
            chats: sortHomePlannerChats(remainingChats),
            currentChatId:
              homeStore.currentChatId === chatId
                ? sortHomePlannerChats(remainingChats)[0]?.id ?? null
                : homeStore.currentChatId,
          }
        : (() => {
            const nextChat = createHomePlannerChat(
              buildInitialAssistantMessage(profileName)
            );

            return {
              chats: [nextChat],
              currentChatId: nextChat.id,
            };
          })();

    setRenamingChatId(null);
    setRenameValue("");
    setChatInput("");
    setError("");
    setSaveError("");
    setSaveSuccess("");
    setHomeStore(nextStore);
    await persistStore(nextStore);
  };

  const handleTogglePin = async (chatId: string) => {
    const nextChats = sortHomePlannerChats(
      homeStore.chats.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              pinned: !chat.pinned,
              updatedAtMs: Date.now(),
            }
          : chat
      )
    );
    const nextStore = {
      ...homeStore,
      chats: nextChats,
    };

    setHomeStore(nextStore);
    await persistStore(nextStore);
  };

  const handleSaveRename = async () => {
    if (!renamingChatId) {
      return;
    }

    const trimmedValue = renameValue.trim();

    if (!trimmedValue) {
      setRenamingChatId(null);
      setRenameValue("");
      return;
    }

    const nextChats = sortHomePlannerChats(
      homeStore.chats.map((chat) =>
        chat.id === renamingChatId
          ? {
              ...chat,
              title: trimmedValue,
              updatedAtMs: Date.now(),
            }
          : chat
      )
    );
    const nextStore = {
      ...homeStore,
      chats: nextChats,
    };

    setRenamingChatId(null);
    setRenameValue("");
    setHomeStore(nextStore);
    await persistStore(nextStore);
  };

  const resetConversation = async () => {
    await replaceCurrentChat((chat) => ({
      ...chat,
      updatedAtMs: Date.now(),
      state: createEmptyPlannerState(buildInitialAssistantMessage(profileName)),
      title:
        chat.title.startsWith("Нов чат") || chat.title === "Последен чат"
          ? chat.title
          : chat.title,
    }));
    setChatInput("");
    setError("");
    setBookingError("");
    setBookingSuccess("");
    setSaveError("");
    setSaveSuccess("");
  };

  const sendPlannerMessage = async (rawValue: string) => {
    if (!currentChat || !profile || !user || planning) {
      return;
    }

    const value = rawValue.trim();

    if (!value) {
      return;
    }

    setChatInput("");
    setError("");
    setBookingError("");
    setBookingSuccess("");
    setSaveError("");
    setSaveSuccess("");

    const plannerState = currentChat.state;
    const userMessage = createHomeChatMessage("user", value);
    const messagesAfterUser = [...plannerState.messages, userMessage];

    if (plannerState.step === "budget") {
      const normalizedBudget = normalizeBudgetToEuro(value);
      const assistantMessage = createHomeChatMessage(
        "assistant",
        buildDaysQuestion(normalizedBudget)
      );

      await replaceCurrentChat((chat) => ({
        ...chat,
        updatedAtMs: Date.now(),
        state: {
          ...chat.state,
          budget: normalizedBudget,
          days: "",
          destination: "",
          timing: "",
          transportPreference: "",
          travelers: "",
          latestPlan: null,
          messages: [...messagesAfterUser, assistantMessage],
          step: "days",
        },
      }));

      return;
    }

    if (plannerState.step === "days") {
      const normalizedDays = normalizeDaysLabel(value);
      const assistantMessage = createHomeChatMessage(
        "assistant",
        buildTravelersQuestion(normalizedDays)
      );

      await replaceCurrentChat((chat) => ({
        ...chat,
        updatedAtMs: Date.now(),
        state: {
          ...chat.state,
          days: normalizedDays,
          travelers: "",
          latestPlan: null,
          messages: [...messagesAfterUser, assistantMessage],
          step: "travelers",
        },
      }));

      return;
    }

    if (plannerState.step === "travelers") {
      const normalizedTravelers = normalizeTravelersLabel(value);
      const assistantMessage = createHomeChatMessage(
        "assistant",
        buildTransportQuestion(normalizedTravelers)
      );

      await replaceCurrentChat((chat) => ({
        ...chat,
        updatedAtMs: Date.now(),
        state: {
          ...chat.state,
          travelers: normalizedTravelers,
          transportPreference: "",
          latestPlan: null,
          messages: [...messagesAfterUser, assistantMessage],
          step: "transport",
        },
      }));

      return;
    }

    if (plannerState.step === "transport") {
      const assistantMessage = createHomeChatMessage(
        "assistant",
        buildTimingQuestion(value)
      );

      await replaceCurrentChat((chat) => ({
        ...chat,
        updatedAtMs: Date.now(),
        state: {
          ...chat.state,
          transportPreference: value,
          timing: "",
          latestPlan: null,
          messages: [...messagesAfterUser, assistantMessage],
          step: "timing",
        },
      }));

      return;
    }

    if (plannerState.step === "timing") {
      const assistantMessage = createHomeChatMessage(
        "assistant",
        buildDestinationQuestion(profile, value, plannerState.travelers)
      );

      await replaceCurrentChat((chat) => ({
        ...chat,
        updatedAtMs: Date.now(),
        state: {
          ...chat.state,
          timing: value,
          latestPlan: null,
          messages: [...messagesAfterUser, assistantMessage],
          step: "destination",
        },
      }));

      return;
    }

    if (plannerState.step === "destination") {
      const nextDestination = value;
      const searchingMessage = createHomeChatMessage(
        "assistant",
        "Подготвям конкретен маршрут с реални transport и stay варианти от интернет."
      );
      const messagesWhilePlanning = [...messagesAfterUser, searchingMessage];

      setPlanning(true);

      await replaceCurrentChat((chat) => ({
        ...chat,
        updatedAtMs: Date.now(),
        state: {
          ...chat.state,
          destination: nextDestination,
          latestPlan: null,
          messages: messagesWhilePlanning,
          step: "done",
        },
      }));

      try {
        const plan = await generateGroundedTravelPlan({
          budget: plannerState.budget,
          days: plannerState.days,
          destination: nextDestination,
          timing: plannerState.timing,
          transportPreference: plannerState.transportPreference,
          travelers: plannerState.travelers,
          profile,
        });
        const readyMessage = createHomeChatMessage(
          "assistant",
          "Готово. По-долу е най-добрият стегнат план според всички твои критерии."
        );
        const formattedPlanText = formatGroundedTravelPlan(plan);
        const nextLatestPlan = normalizeLatestPlan({
          budget: plannerState.budget,
          days: plannerState.days,
          destination: nextDestination,
          formattedPlanText,
          timing: plannerState.timing,
          transportPreference: plannerState.transportPreference,
          travelers: plannerState.travelers,
          plan,
          sourceKey: getHomeSavedSourceKey({
            budget: plannerState.budget,
            days: plannerState.days,
            destination: nextDestination,
            formattedPlanText,
          }),
        });

        await replaceCurrentChat((chat) => ({
          ...chat,
          title: getAutoChatTitle(chat.title, nextDestination, plan.title),
          updatedAtMs: Date.now(),
          state: {
            ...chat.state,
            destination: nextDestination,
            latestPlan: nextLatestPlan,
            messages: [...messagesWhilePlanning, readyMessage],
            step: "done",
          },
        }));
      } catch (nextError) {
        const message = getHomePlannerErrorMessage(nextError);
        const errorMessage = createHomeChatMessage("assistant", message);
        setError(message);

        await replaceCurrentChat((chat) => ({
          ...chat,
          updatedAtMs: Date.now(),
          state: {
            ...chat.state,
            destination: nextDestination,
            latestPlan: null,
            messages: [...messagesWhilePlanning, errorMessage],
            step: "done",
          },
        }));
      } finally {
        setPlanning(false);
      }
    }
  };

  const handleSavePlan = async () => {
    if (!currentChat || !latestPlan || !user || savingPlan) {
      return;
    }

    if (savedSourceKeys.includes(latestPlan.sourceKey)) {
      setSaveError("");
      setSaveSuccess("Този маршрут вече е запазен в Saved.");
      return;
    }

    try {
      setSavingPlan(true);
      setSaveError("");
      setSaveSuccess("");

      const nextSavedTrips = await saveTripForUser(
        user.uid,
        buildSavedTripFromHome({
          budget: latestPlan.budget,
          days: latestPlan.days,
          destination: latestPlan.destination,
          plan: latestPlan.plan,
        })
      );

      setSavedSourceKeys(nextSavedTrips.map((trip) => trip.sourceKey));
      setSaveSuccess("Маршрутът е запазен в Saved.");
    } catch (nextError) {
      setSaveSuccess("");
      setSaveError(getFirestoreUserMessage(nextError, "write"));
    } finally {
      setSavingPlan(false);
    }
  };

  const openBookingModal = () => {
    if (!latestPlan) {
      return;
    }

    setSelectedTransportIndex(latestPlan.plan.transportOptions.length > 0 ? 0 : null);
    setSelectedStayIndex(latestPlan.plan.stayOptions.length > 0 ? 0 : null);
    resetBookingUi();
    setBookingSuccess("");
    setBookingForm({
      contactEmail: user?.email ?? "",
      contactName: profile?.personalProfile.fullName || profileName,
      note: "",
      paymentMethod: PAYMENT_METHODS[0] ?? "Банкова карта",
    });
    setBookingModalVisible(true);
  };

  const openBookingModalForTransport = (transportIndex: number) => {
    if (!latestPlan) {
      return;
    }

    setSelectedTransportIndex(transportIndex);
    setSelectedStayIndex(null);
    resetBookingUi();
    setBookingSuccess("");
    setBookingForm({
      contactEmail: user?.email ?? "",
      contactName: profile?.personalProfile.fullName || profileName,
      note: "",
      paymentMethod: PAYMENT_METHODS[0] ?? "Банкова карта",
    });
    setBookingModalVisible(true);
  };

  const openBookingModalForStay = (stayIndex: number) => {
    if (!latestPlan) {
      return;
    }

    setSelectedTransportIndex(null);
    setSelectedStayIndex(stayIndex);
    resetBookingUi();
    setBookingSuccess("");
    setBookingForm({
      contactEmail: user?.email ?? "",
      contactName: profile?.personalProfile.fullName || profileName,
      note: "",
      paymentMethod: PAYMENT_METHODS[0] ?? "Банкова карта",
    });
    setBookingModalVisible(true);
  };

  const handleConfirmBooking = async () => {
    if (!user || !latestPlan || bookingProcessing) {
      return;
    }

    const trimmedName = bookingForm.contactName.trim();
    const trimmedEmail = bookingForm.contactEmail.trim();

    if (!trimmedName) {
      setBookingError("Добави име за резервацията.");
      return;
    }

    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setBookingError("Добави валиден email за потвърждение.");
      return;
    }

    if (!selectedTransport && !selectedStay) {
      setBookingError("Избери поне транспорт или настаняване.");
      return;
    }

    try {
      setBookingProcessing(true);
      setBookingError("");
      setBookingStage("processing");
      setBookingProgress(0.18);
      setBookingProgressLabel("Свързваме се със secure checkout...");

      await wait(500);

      const amountCents =
        bookingEstimate.totalEstimate !== null
          ? Math.max(bookingEstimate.totalEstimate, 1) * 100
          : 100;
      const paymentIntent = await createTestPaymentIntent({
        amountCents,
        currency: "eur",
        description: `${latestPlan.plan.title} • ${latestPlan.destination}`,
        destination: latestPlan.destination,
        paymentMethod: bookingForm.paymentMethod,
        userId: user.uid,
      });

      setBookingProgress(0.52);
      setBookingProgressLabel(
        bookingForm.paymentMethod.includes("Apple")
          ? "Потвърждаваме Apple Pay..."
          : bookingForm.paymentMethod.includes("Google")
            ? "Потвърждаваме Google Pay..."
            : "Потвърждаваме картовото плащане..."
      );

      await wait(900);

      setBookingProgress(0.82);
      setBookingProgressLabel("Финализираме резервацията...");

      await saveBookingForUser(
        user.uid,
        buildBookingOrder({
          budget: latestPlan.budget,
          contactEmail: trimmedEmail,
          contactName: trimmedName,
          days: latestPlan.days,
          destination: latestPlan.destination,
          note: bookingForm.note,
          paymentIntentId: paymentIntent.paymentIntentId,
          paymentMethod: bookingForm.paymentMethod,
          paymentMode: paymentIntent.mode,
          stay: selectedStay,
          timing: latestPlan.timing,
          title: latestPlan.plan.title,
          transport: selectedTransport,
          travelers: latestPlan.travelers,
        })
      );

      await wait(650);

      setBookingProgress(1);
      setBookingProgressLabel("Плащането е потвърдено.");
      setBookingReceipt({
        authorizationCode: createAuthorizationCode(paymentIntent.paymentIntentId),
        destination: latestPlan.destination,
        paymentIntentId: paymentIntent.paymentIntentId,
        paymentMethod: bookingForm.paymentMethod,
        paymentMode: paymentIntent.mode,
        processedAtLabel: formatProcessedAt(Date.now()),
        selectedStayLabel: selectedStay
          ? `${selectedStay.name} • ${selectedStay.pricePerNight}`
          : null,
        selectedTransportLabel: selectedTransport
          ? `${selectedTransport.mode} • ${selectedTransport.price}`
          : null,
        totalLabel: bookingEstimate.totalLabel,
      });
      setBookingStage("success");
      setBookingSuccess(
        "Плащането е потвърдено и резервацията е добавена в Saved."
      );
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "";
      setBookingStage("form");
      setBookingProgress(0);
      setBookingProgressLabel("");

      if (message.includes("functions/not-found")) {
        setBookingError(
          "Липсва Firebase функцията createTestPaymentIntent. Deploy-ни backend-а и опитай пак."
        );
      } else if (message.includes("functions/internal")) {
        setBookingError("Payment backend-ът върна грешка. Провери Stripe env настройките.");
      } else {
        setBookingError(getFirestoreUserMessage(nextError, "write"));
      }
    } finally {
      setBookingProcessing(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loader} edges={["top", "left", "right"]}>
        <ActivityIndicator size="large" color="#5C8C1F" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <View style={styles.shell}>
        <View
          style={[
            styles.layout,
            !isWideLayout && styles.layoutStacked,
          ]}
        >
          <View style={styles.main}>
            <View style={[styles.plannerTopBar, isPhoneLayout && styles.plannerTopBarPhone]}>
              <View style={styles.plannerTopBarTextWrap}>
                <Text style={styles.plannerTopBarTitle}>AI Planner</Text>
                <Text numberOfLines={1} style={styles.plannerTopBarMeta}>
                  {currentChat?.title ?? "Последен чат"}
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => setChatMenuVisible(true)}
                style={styles.plannerMenuButton}
              >
                <MaterialIcons color="#29440F" name="more-horiz" size={26} />
              </TouchableOpacity>
            </View>

            <View style={[styles.chatCard, isPhoneLayout && styles.chatCardPhone]}>
              {[currentPlannerState.budget,
                currentPlannerState.days,
                currentPlannerState.travelers,
                currentPlannerState.transportPreference,
                currentPlannerState.timing,
                currentPlannerState.destination,
              ].filter(Boolean).length > 0 ? (
                <View style={[styles.contextStrip, isPhoneLayout && styles.contextStripPhone]}>
                  <Text style={styles.contextStripTitle}>Current plan</Text>
                  <View style={[styles.profileMetaRow, isPhoneLayout && styles.profileMetaRowPhone]}>
                    {currentPlannerState.budget ? (
                      <View style={[styles.profileMetaChip, isPhoneLayout && styles.profileMetaChipPhone]}>
                        <Text
                          style={[
                            styles.profileMetaChipText,
                            isPhoneLayout && styles.profileMetaChipTextPhone,
                          ]}
                        >
                          {currentPlannerState.budget}
                        </Text>
                      </View>
                    ) : null}
                    {currentPlannerState.days ? (
                      <View style={[styles.profileMetaChip, isPhoneLayout && styles.profileMetaChipPhone]}>
                        <Text
                          style={[
                            styles.profileMetaChipText,
                            isPhoneLayout && styles.profileMetaChipTextPhone,
                          ]}
                        >
                          {currentPlannerState.days}
                        </Text>
                      </View>
                    ) : null}
                    {currentPlannerState.travelers ? (
                      <View style={[styles.profileMetaChip, isPhoneLayout && styles.profileMetaChipPhone]}>
                        <Text
                          style={[
                            styles.profileMetaChipText,
                            isPhoneLayout && styles.profileMetaChipTextPhone,
                          ]}
                        >
                          {currentPlannerState.travelers}
                        </Text>
                      </View>
                    ) : null}
                    {currentPlannerState.transportPreference ? (
                      <View style={[styles.profileMetaChip, isPhoneLayout && styles.profileMetaChipPhone]}>
                        <Text
                          style={[
                            styles.profileMetaChipText,
                            isPhoneLayout && styles.profileMetaChipTextPhone,
                          ]}
                        >
                          {currentPlannerState.transportPreference}
                        </Text>
                      </View>
                    ) : null}
                    {currentPlannerState.timing ? (
                      <View style={[styles.profileMetaChip, isPhoneLayout && styles.profileMetaChipPhone]}>
                        <Text
                          style={[
                            styles.profileMetaChipText,
                            isPhoneLayout && styles.profileMetaChipTextPhone,
                          ]}
                        >
                          {currentPlannerState.timing}
                        </Text>
                      </View>
                    ) : null}
                    {currentPlannerState.destination ? (
                      <View style={[styles.profileMetaChip, isPhoneLayout && styles.profileMetaChipPhone]}>
                        <Text
                          style={[
                            styles.profileMetaChipText,
                            isPhoneLayout && styles.profileMetaChipTextPhone,
                          ]}
                        >
                          {currentPlannerState.destination}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              ) : null}

              <ScrollView
                style={[styles.messagesContainer, isPhoneLayout && styles.messagesContainerPhone]}
                contentContainerStyle={styles.messagesContent}
                showsVerticalScrollIndicator={false}
              >
                {currentPlannerState.messages.map((message) => (
                  <View
                    key={message.id}
                    style={[
                      styles.messageBubble,
                      isPhoneLayout && styles.messageBubblePhone,
                      message.role === "assistant"
                        ? styles.assistantBubble
                        : styles.userBubble,
                    ]}
                  >
                    <Text style={styles.messageRoleLabel}>
                      {message.role === "assistant" ? "AI Planner" : "You"}
                    </Text>
                    <Text
                      style={[
                        styles.messageText,
                        message.role === "assistant"
                          ? styles.assistantMessageText
                          : styles.userMessageText,
                      ]}
                    >
                      {message.text}
                    </Text>
                  </View>
                ))}

                {planning ? (
                  <View style={[styles.messageBubble, styles.assistantBubble]}>
                    <Text style={styles.messageRoleLabel}>AI Planner</Text>
                    <Text style={styles.assistantMessageText}>
                      Търся най-добрите цени за transport и stay...
                    </Text>
                  </View>
                ) : null}

                {error ? <Text style={styles.errorText}>{error}</Text> : null}

                {latestPlan ? (
                  <View style={styles.planCard}>
                    <View style={[styles.planHeader, isPhoneLayout && styles.planHeaderPhone]}>
                      <View style={styles.planHeaderTextWrap}>
                        <Text style={[styles.planTitle, isPhoneLayout && styles.planTitlePhone]}>
                          {latestPlan.plan.title}
                        </Text>
                        <Text style={styles.planMeta}>
                          {latestPlan.destination} • {latestPlan.days} • {latestPlan.budget}
                        </Text>
                        {[latestPlan.travelers, latestPlan.transportPreference, latestPlan.timing]
                          .filter(Boolean)
                          .length > 0 ? (
                          <Text style={styles.planMetaSecondary}>
                            {[latestPlan.travelers, latestPlan.transportPreference, latestPlan.timing]
                              .filter(Boolean)
                              .join(" • ")}
                          </Text>
                        ) : null}
                      </View>
                      {!isPhoneLayout ? (
                        <View style={styles.planHeaderIcon}>
                          <MaterialIcons name="map" size={24} color="#8B5611" />
                        </View>
                      ) : null}
                    </View>

                    <Text style={styles.planSummary}>{latestPlan.plan.summary}</Text>

                    {latestPlan.plan.budgetNote ? (
                      <View style={styles.budgetNotePill}>
                        <MaterialIcons name="euro" size={16} color="#8B5611" />
                        <Text style={styles.budgetNoteText}>
                          {latestPlan.plan.budgetNote}
                        </Text>
                      </View>
                    ) : null}

                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>Транспорт</Text>
                      {latestPlan.plan.transportOptions.map((option, index) => (
                        <View key={`${option.provider}-${index}`} style={styles.optionCard}>
                          <View style={styles.optionTopRow}>
                            <View style={styles.optionModeWrap}>
                              <MaterialIcons
                                name={getTransportIconName(option)}
                                size={18}
                                color="#3B6D11"
                              />
                              <Text style={styles.optionModeText}>{option.mode}</Text>
                            </View>
                            <Text style={styles.optionPrice}>{option.price}</Text>
                          </View>

                          <Text style={styles.optionProvider}>{option.provider}</Text>
                          <Text style={styles.optionRoute}>{option.route}</Text>
                          <Text style={styles.optionMeta}>{option.duration}</Text>
                          {option.sourceLabel ? (
                            <Text style={styles.offerSourceText}>Source: {option.sourceLabel}</Text>
                          ) : null}
                          <Text style={styles.optionNote}>{option.note}</Text>

                          <View style={styles.optionActionsRow}>
                            {option.bookingUrl ? (
                              <TouchableOpacity
                                style={[styles.optionLinkButton, styles.optionHalfButton]}
                                onPress={() => {
                                  void Linking.openURL(option.bookingUrl);
                                }}
                                activeOpacity={0.9}
                              >
                                <MaterialIcons name="open-in-new" size={16} color="#365A14" />
                                <Text style={styles.optionLinkButtonText}>Офертата</Text>
                              </TouchableOpacity>
                            ) : null}

                            <TouchableOpacity
                              style={[
                                styles.optionActionButton,
                                option.bookingUrl ? styles.optionHalfButton : null,
                              ]}
                              onPress={() => openBookingModalForTransport(index)}
                              activeOpacity={0.9}
                            >
                              <MaterialIcons name="confirmation-number" size={16} color="#FFFFFF" />
                              <Text style={styles.optionActionButtonText}>Купи билет</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))}
                    </View>

                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>Настаняване</Text>
                      {latestPlan.plan.stayOptions.map((stay, index) => (
                        <View key={`${stay.name}-${index}`} style={styles.optionCard}>
                          <View style={styles.optionTopRow}>
                            <Text style={styles.optionProvider}>{stay.name}</Text>
                            <Text style={styles.optionPrice}>{stay.pricePerNight}</Text>
                          </View>
                          <Text style={styles.optionRoute}>
                            {stay.type} • {stay.area}
                          </Text>
                          {stay.sourceLabel ? (
                            <Text style={styles.offerSourceText}>Source: {stay.sourceLabel}</Text>
                          ) : null}
                          <Text style={styles.optionNote}>{stay.note}</Text>

                          <View style={styles.optionActionsRow}>
                            {stay.bookingUrl ? (
                              <TouchableOpacity
                                style={[styles.optionLinkButton, styles.optionHalfButton]}
                                onPress={() => {
                                  void Linking.openURL(stay.bookingUrl);
                                }}
                                activeOpacity={0.9}
                              >
                                <MaterialIcons name="open-in-new" size={16} color="#365A14" />
                                <Text style={styles.optionLinkButtonText}>Офертата</Text>
                              </TouchableOpacity>
                            ) : null}

                            <TouchableOpacity
                              style={[
                                styles.optionActionButton,
                                stay.bookingUrl ? styles.optionHalfButton : null,
                              ]}
                              onPress={() => openBookingModalForStay(index)}
                              activeOpacity={0.9}
                            >
                              <MaterialIcons name="hotel" size={16} color="#FFFFFF" />
                              <Text style={styles.optionActionButtonText}>Резервирай</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))}
                    </View>

                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>Маршрут по дни</Text>
                      {latestPlan.plan.tripDays.map((day, index) => (
                        <View key={`${day.dayLabel}-${index}`} style={styles.dayCard}>
                          <Text style={styles.dayLabel}>{day.dayLabel}</Text>
                          <Text style={styles.dayTitle}>{day.title}</Text>
                          {day.items.map((item, itemIndex) => (
                            <Text key={`${day.dayLabel}-${itemIndex}`} style={styles.dayItem}>
                              • {item}
                            </Text>
                          ))}
                        </View>
                      ))}
                    </View>

                    {latestPlan.plan.profileTip ? (
                      <View style={styles.profileTipCard}>
                        <Text style={styles.profileTipTitle}>Съвет според профила</Text>
                        <Text style={styles.profileTipText}>{latestPlan.plan.profileTip}</Text>
                      </View>
                    ) : null}

                    {bookingSuccess ? (
                      <Text style={styles.bookingSuccessText}>{bookingSuccess}</Text>
                    ) : null}
                    {bookingError ? (
                      <Text style={styles.bookingErrorText}>{bookingError}</Text>
                    ) : null}
                    {saveSuccess ? <Text style={styles.saveSuccessText}>{saveSuccess}</Text> : null}
                    {saveError ? <Text style={styles.saveErrorText}>{saveError}</Text> : null}

                    <TouchableOpacity
                      style={[
                        styles.savePlanButton,
                        (savingPlan || savedSourceKeys.includes(latestPlan.sourceKey)) &&
                          styles.disabledButton,
                        savedSourceKeys.includes(latestPlan.sourceKey) &&
                          styles.savedPlanButton,
                      ]}
                      onPress={() => {
                        void handleSavePlan();
                      }}
                      disabled={savingPlan || savedSourceKeys.includes(latestPlan.sourceKey)}
                      activeOpacity={0.9}
                    >
                      <Text
                        style={[
                          styles.savePlanButtonText,
                          savedSourceKeys.includes(latestPlan.sourceKey) &&
                            styles.savedPlanButtonText,
                        ]}
                      >
                        {savingPlan
                          ? "Saving..."
                          : savedSourceKeys.includes(latestPlan.sourceKey)
                            ? "Saved in tab"
                            : "Save to Saved"}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.bookNowButton}
                      onPress={openBookingModal}
                      activeOpacity={0.9}
                    >
                      <MaterialIcons name="credit-card" size={18} color="#FFFFFF" />
                      <Text style={styles.bookNowButtonText}>Pay & reserve in app</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </ScrollView>

              {quickReplies.length > 0 ? (
                <View style={styles.quickRepliesSection}>
                  <Text style={styles.quickRepliesTitle}>
                    {getStepTitle(currentPlannerState.step)}
                  </Text>
                  {isPhoneLayout ? (
                    <View style={styles.quickRepliesWrap}>
                      {quickReplies.map((reply) => (
                        <TouchableOpacity
                          key={reply}
                          style={[styles.quickReplyChip, styles.quickReplyChipPhone]}
                          onPress={() => {
                            void sendPlannerMessage(reply);
                          }}
                          disabled={planning}
                          activeOpacity={0.9}
                        >
                          <Text style={styles.quickReplyText}>{reply}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      {quickReplies.map((reply) => (
                        <TouchableOpacity
                          key={reply}
                          style={styles.quickReplyChip}
                          onPress={() => {
                            void sendPlannerMessage(reply);
                          }}
                          disabled={planning}
                          activeOpacity={0.9}
                        >
                          <Text style={styles.quickReplyText}>{reply}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )}
                </View>
              ) : null}

              <View style={[styles.composer, isPhoneLayout && styles.composerPhone]}>
                <TextInput
                  style={[styles.input, isPhoneLayout && styles.inputPhone]}
                  placeholder={
                    currentPlannerState.step === "budget"
                      ? "Напиши бюджета в евро..."
                      : currentPlannerState.step === "days"
                        ? "Напиши броя дни..."
                        : currentPlannerState.step === "travelers"
                          ? "Напиши колко човека ще пътуват..."
                          : currentPlannerState.step === "transport"
                            ? "Напиши предпочитан транспорт..."
                            : currentPlannerState.step === "timing"
                              ? "Напиши кога искате да пътувате..."
                              : currentPlannerState.step === "destination"
                                ? "Напиши дестинацията..."
                                : "Натисни „Нов чат“ или „Нов план“"
                  }
                  placeholderTextColor="#7B8870"
                  value={chatInput}
                  onChangeText={setChatInput}
                  editable={currentPlannerState.step !== "done" && !planning}
                  multiline
                />

                <View
                  style={[
                    styles.actionsRow,
                    isCompactPhone && styles.actionsRowStacked,
                  ]}
                >
                  <TouchableOpacity
                    style={[
                      styles.secondaryButton,
                      isCompactPhone && styles.secondaryButtonStacked,
                      planning && styles.disabledButton,
                    ]}
                    onPress={() => {
                      void resetConversation();
                    }}
                    disabled={planning}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.secondaryButtonText}>Нов план</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.primaryButton,
                      isCompactPhone && styles.primaryButtonStacked,
                      !canSend && styles.disabledButton,
                    ]}
                    onPress={() => {
                      void sendPlannerMessage(chatInput);
                    }}
                    disabled={!canSend}
                    activeOpacity={0.9}
                  >
                    <MaterialIcons name="send" size={18} color="#FFFFFF" />
                    <Text style={styles.primaryButtonText}>Изпрати</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
          </View>
        </View>

        <Modal
          visible={chatMenuVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setChatMenuVisible(false)}
        >
          <View style={styles.historyMenuBackdrop}>
            <TouchableOpacity
              activeOpacity={1}
              onPress={() => setChatMenuVisible(false)}
              style={styles.historyMenuDismissArea}
            />
            <View style={styles.historyMenuCard}>
              <View style={styles.historyMenuHeader}>
                <View>
                  <Text style={styles.historyMenuTitle}>AI Chats</Text>
                  <Text style={styles.historyMenuSubtitle}>
                    {homeStore.chats.length} запазени chat-а
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.historyMenuClose}
                  onPress={() => setChatMenuVisible(false)}
                  activeOpacity={0.9}
                >
                  <MaterialIcons name="close" size={22} color="#3E5B21" />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[styles.newChatButton, styles.historyMenuNewChatButton]}
                onPress={() => {
                  void handleCreateChat();
                }}
                activeOpacity={0.9}
              >
                <MaterialIcons name="add" size={18} color="#FFFFFF" />
                <Text style={styles.newChatButtonText}>Нов чат</Text>
              </TouchableOpacity>

              <ScrollView
                style={styles.sidebarList}
                contentContainerStyle={styles.sidebarListContent}
                showsVerticalScrollIndicator={false}
              >
                {sortHomePlannerChats(homeStore.chats).map((chat) => {
                  const isActive = currentChat?.id === chat.id;
                  const isRenaming = renamingChatId === chat.id;

                  return (
                    <View
                      key={chat.id}
                      style={[
                        styles.chatListItem,
                        isActive && styles.chatListItemActive,
                      ]}
                    >
                      {isRenaming ? (
                        <View style={styles.renameWrap}>
                          <TextInput
                            style={styles.renameInput}
                            value={renameValue}
                            onChangeText={setRenameValue}
                            placeholder="Име на чат"
                            placeholderTextColor="#78876C"
                          />
                          <View style={styles.renameActions}>
                            <TouchableOpacity
                              style={styles.iconButton}
                              onPress={() => {
                                void handleSaveRename();
                              }}
                              activeOpacity={0.9}
                            >
                              <MaterialIcons name="check" size={18} color="#3B6D11" />
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.iconButton}
                              onPress={() => {
                                setRenamingChatId(null);
                                setRenameValue("");
                              }}
                              activeOpacity={0.9}
                            >
                              <MaterialIcons name="close" size={18} color="#8A3D35" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      ) : (
                        <>
                          <TouchableOpacity
                            onPress={() => {
                              void handleSelectChat(chat.id);
                            }}
                            activeOpacity={0.9}
                          >
                            <View style={styles.chatTitleRow}>
                              <Text style={styles.chatItemTitle} numberOfLines={2}>
                                {chat.title}
                              </Text>
                              {chat.pinned ? (
                                <MaterialIcons name="push-pin" size={16} color="#8B5611" />
                              ) : null}
                            </View>
                            <Text style={styles.chatItemMeta}>
                              {formatUpdatedDate(chat.updatedAtMs)}
                            </Text>
                          </TouchableOpacity>

                          <View style={styles.chatItemActions}>
                            <TouchableOpacity
                              style={styles.iconButton}
                              onPress={() => {
                                setRenamingChatId(chat.id);
                                setRenameValue(chat.title);
                              }}
                              activeOpacity={0.9}
                            >
                              <MaterialIcons name="edit" size={16} color="#5A6E41" />
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.iconButton}
                              onPress={() => {
                                void handleTogglePin(chat.id);
                              }}
                              activeOpacity={0.9}
                            >
                              <MaterialIcons
                                name={chat.pinned ? "push-pin" : "outlined-flag"}
                                size={16}
                                color="#5A6E41"
                              />
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.iconButton}
                              onPress={() => {
                                void handleDeleteChat(chat.id);
                              }}
                              activeOpacity={0.9}
                            >
                              <MaterialIcons name="delete-outline" size={16} color="#8A3D35" />
                            </TouchableOpacity>
                          </View>
                        </>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </Modal>

        <Modal
          visible={bookingModalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeBookingModal}
      >
        <View style={styles.bookingModalOverlay}>
          <View style={styles.bookingModalCard}>
            <ScrollView
              contentContainerStyle={styles.bookingModalContent}
              showsVerticalScrollIndicator={false}
            >
                <View style={styles.bookingModalHeader}>
                  <View style={styles.bookingModalHeaderText}>
                  <Text style={styles.bookingModalKicker}>Secure checkout</Text>
                  <Text style={styles.bookingModalTitle}>
                    {bookingStage === "success"
                      ? "Потвърдено плащане"
                      : latestPlan?.plan.title || "Потвърди резервацията"}
                  </Text>
                  <Text style={styles.bookingModalSubtitle}>
                    {bookingStage === "processing"
                      ? "Подготвяме плащането и потвърждението на резервацията."
                      : bookingStage === "success"
                        ? "Сумата е обработена успешно и резервацията е потвърдена."
                        : "Избери транспорт, място за престой и потвърди плащането директно от приложението."}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.bookingCloseButton}
                  onPress={closeBookingModal}
                  disabled={bookingProcessing}
                  activeOpacity={0.9}
                >
                  <MaterialIcons name="close" size={18} color="#29440F" />
                </TouchableOpacity>
              </View>

              {bookingStage === "processing" ? (
                <View style={styles.checkoutProcessingCard}>
                  <View style={styles.checkoutProcessingIcon}>
                    <MaterialIcons
                      name={getPaymentMethodIcon(bookingForm.paymentMethod)}
                      size={34}
                      color="#29440F"
                    />
                  </View>
                  <Text style={styles.checkoutProcessingTitle}>
                    Обработваме плащането
                  </Text>
                  <Text style={styles.checkoutProcessingSubtitle}>
                    {bookingProgressLabel || "Подготвяме плащането..."}
                  </Text>

                  <View style={styles.checkoutProgressTrack}>
                    <View
                      style={[
                        styles.checkoutProgressFill,
                        { width: `${Math.max(8, bookingProgress * 100)}%` },
                      ]}
                    />
                  </View>

                  <View style={styles.checkoutProcessingSteps}>
                    <Text style={styles.checkoutProcessingStep}>
                      1. Авторизация на плащането
                    </Text>
                    <Text style={styles.checkoutProcessingStep}>
                      2. Потвърждение на wallet / карта
                    </Text>
                    <Text style={styles.checkoutProcessingStep}>
                      3. Финализиране на резервацията
                    </Text>
                  </View>

                  <View style={styles.bookingSummaryCard}>
                    <Text style={styles.bookingSummaryTitle}>Обобщение</Text>
                    <Text style={styles.bookingSummaryLine}>
                      {latestPlan?.destination || "Дестинация"}
                    </Text>
                    <Text style={styles.bookingSummaryLine}>{bookingEstimate.totalLabel}</Text>
                    <Text style={styles.bookingSummaryHint}>
                      Сумата е изчислена според избрания транспорт и мястото за престой.
                    </Text>
                  </View>
                </View>
              ) : bookingStage === "success" ? (
                <View style={styles.checkoutSuccessCard}>
                  <View style={styles.checkoutSuccessBadge}>
                    <MaterialIcons name="check" size={34} color="#FFFFFF" />
                  </View>
                  <Text style={styles.checkoutSuccessTitle}>Плащането мина успешно</Text>
                  <Text style={styles.checkoutSuccessSubtitle}>
                    Резервацията е потвърдена и детайлите са готови за преглед.
                  </Text>

                  <View style={styles.checkoutReceiptCard}>
                    <Text style={styles.checkoutReceiptKicker}>Потвърждение</Text>
                    <Text style={styles.checkoutReceiptLine}>
                      Дестинация: {bookingReceipt?.destination || latestPlan?.destination || "-"}
                    </Text>
                    <Text style={styles.checkoutReceiptLine}>
                      Метод: {getPaymentMethodDisplayLabel(
                        bookingReceipt?.paymentMethod || bookingForm.paymentMethod
                      )}
                    </Text>
                    <Text style={styles.checkoutReceiptLine}>
                      Статус: Потвърдено
                    </Text>
                    <Text style={styles.checkoutReceiptLine}>
                      Обработено на: {bookingReceipt?.processedAtLabel || formatProcessedAt(Date.now())}
                    </Text>
                    <Text style={styles.checkoutReceiptLine}>
                      Код за оторизация: {bookingReceipt?.authorizationCode || "A47K92"}
                    </Text>
                    {bookingReceipt?.selectedTransportLabel ? (
                      <Text style={styles.checkoutReceiptLine}>
                        Транспорт: {bookingReceipt.selectedTransportLabel}
                      </Text>
                    ) : null}
                    {bookingReceipt?.selectedStayLabel ? (
                      <Text style={styles.checkoutReceiptLine}>
                        Престой: {bookingReceipt.selectedStayLabel}
                      </Text>
                    ) : null}
                    <Text style={styles.checkoutReceiptTotal}>
                      Обща сума: {bookingReceipt?.totalLabel || bookingEstimate.totalLabel}
                    </Text>
                    <Text style={styles.checkoutReceiptRef}>
                      Референция: {formatCheckoutReference(
                        bookingReceipt?.paymentIntentId || "test-payment"
                      )}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.bookingPayButton}
                    onPress={closeBookingModal}
                    activeOpacity={0.9}
                  >
                    <MaterialIcons name="done-all" size={18} color="#FFFFFF" />
                    <Text style={styles.bookingPayButtonText}>Затвори</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
              <View style={styles.bookingSection}>
                <View style={styles.bookingSectionHeader}>
                  <Text style={styles.bookingSectionTitle}>Транспорт</Text>
                  <TouchableOpacity
                    style={[
                      styles.bookingSkipChip,
                      selectedTransportIndex === null && styles.bookingSkipChipSelected,
                    ]}
                    onPress={() => setSelectedTransportIndex(null)}
                    activeOpacity={0.9}
                  >
                    <Text
                      style={[
                        styles.bookingSkipChipText,
                        selectedTransportIndex === null &&
                          styles.bookingSkipChipTextSelected,
                      ]}
                    >
                      Без билет
                    </Text>
                  </TouchableOpacity>
                </View>
                {latestPlan?.plan.transportOptions.map((option, index) => {
                  const isSelected = selectedTransportIndex === index;

                  return (
                    <TouchableOpacity
                      key={`${option.provider}-${index}`}
                      style={[
                        styles.bookingOptionCard,
                        isSelected && styles.bookingOptionCardSelected,
                      ]}
                      onPress={() => setSelectedTransportIndex(index)}
                      activeOpacity={0.9}
                    >
                      <View style={styles.bookingOptionTopRow}>
                        <Text style={styles.bookingOptionTitle}>{option.mode}</Text>
                        <Text style={styles.bookingOptionPrice}>{option.price}</Text>
                      </View>
                      <Text style={styles.bookingOptionMeta}>{option.provider}</Text>
                      <Text style={styles.bookingOptionMeta}>{option.route}</Text>
                      <Text style={styles.bookingOptionNote}>{option.note}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.bookingSection}>
                <View style={styles.bookingSectionHeader}>
                  <Text style={styles.bookingSectionTitle}>Място за престой</Text>
                  <TouchableOpacity
                    style={[
                      styles.bookingSkipChip,
                      selectedStayIndex === null && styles.bookingSkipChipSelected,
                    ]}
                    onPress={() => setSelectedStayIndex(null)}
                    activeOpacity={0.9}
                  >
                    <Text
                      style={[
                        styles.bookingSkipChipText,
                        selectedStayIndex === null && styles.bookingSkipChipTextSelected,
                      ]}
                    >
                      Без хотел
                    </Text>
                  </TouchableOpacity>
                </View>
                {latestPlan?.plan.stayOptions.map((stay, index) => {
                  const isSelected = selectedStayIndex === index;

                  return (
                    <TouchableOpacity
                      key={`${stay.name}-${index}`}
                      style={[
                        styles.bookingOptionCard,
                        isSelected && styles.bookingOptionCardSelected,
                      ]}
                      onPress={() => setSelectedStayIndex(index)}
                      activeOpacity={0.9}
                    >
                      <View style={styles.bookingOptionTopRow}>
                        <Text style={styles.bookingOptionTitle}>{stay.name}</Text>
                        <Text style={styles.bookingOptionPrice}>{stay.pricePerNight}</Text>
                      </View>
                      <Text style={styles.bookingOptionMeta}>
                        {stay.type} • {stay.area}
                      </Text>
                      <Text style={styles.bookingOptionNote}>{stay.note}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.bookingSection}>
                <Text style={styles.bookingSectionTitle}>Данни за резервацията</Text>
                <TextInput
                  style={styles.bookingInput}
                  placeholder="Име за резервацията"
                  placeholderTextColor="#7B8870"
                  value={bookingForm.contactName}
                  onChangeText={(value) =>
                    setBookingForm((current) => ({
                      ...current,
                      contactName: value,
                    }))
                  }
                />
                <TextInput
                  style={styles.bookingInput}
                  placeholder="Email за потвърждение"
                  placeholderTextColor="#7B8870"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={bookingForm.contactEmail}
                  onChangeText={(value) =>
                    setBookingForm((current) => ({
                      ...current,
                      contactEmail: value,
                    }))
                  }
                />
                <TextInput
                  style={[styles.bookingInput, styles.bookingNoteInput]}
                  placeholder="Бележка по желание"
                  placeholderTextColor="#7B8870"
                  value={bookingForm.note}
                  onChangeText={(value) =>
                    setBookingForm((current) => ({
                      ...current,
                      note: value,
                    }))
                  }
                  multiline
                />
              </View>

              <View style={styles.bookingSection}>
                <Text style={styles.bookingSectionTitle}>Метод на плащане</Text>
                <View style={styles.paymentMethodsRow}>
                  {PAYMENT_METHODS.map((method) => {
                    const isSelected = bookingForm.paymentMethod === method;

                    return (
                      <TouchableOpacity
                        key={method}
                        style={[
                          styles.paymentMethodChip,
                          isSelected && styles.paymentMethodChipSelected,
                        ]}
                        onPress={() =>
                          setBookingForm((current) => ({
                            ...current,
                            paymentMethod: method,
                          }))
                        }
                        activeOpacity={0.9}
                      >
                        <Text
                          style={[
                            styles.paymentMethodChipText,
                            isSelected && styles.paymentMethodChipTextSelected,
                          ]}
                        >
                          {method}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={styles.bookingSummaryCard}>
                <Text style={styles.bookingSummaryTitle}>Обобщение</Text>
                <Text style={styles.bookingSummaryLine}>
                  {latestPlan?.destination || "Дестинация"} • {latestPlan?.days || "Пътуване"}
                </Text>
                <Text style={styles.bookingSummaryLine}>
                  {latestPlan?.travelers || "Пътници"} • {latestPlan?.timing || "Период"}
                </Text>
                {selectedTransport ? (
                  <Text style={styles.bookingSummaryLine}>
                    Транспорт: {selectedTransport.mode} • {selectedTransport.price}
                  </Text>
                ) : null}
                {selectedStay ? (
                  <Text style={styles.bookingSummaryLine}>
                    Престой: {selectedStay.name} • {selectedStay.pricePerNight}
                  </Text>
                ) : null}
                <Text style={styles.bookingSummaryTotal}>{bookingEstimate.totalLabel}</Text>
                <Text style={styles.bookingSummaryHint}>
                  Сумата е изчислена спрямо избрания транспорт и мястото за престой.
                </Text>
              </View>

              {bookingError ? <Text style={styles.bookingErrorText}>{bookingError}</Text> : null}

              <TouchableOpacity
                style={[
                  styles.bookingPayButton,
                  bookingProcessing && styles.disabledButton,
                ]}
                onPress={() => {
                  void handleConfirmBooking();
                }}
                disabled={bookingProcessing}
                activeOpacity={0.9}
              >
                <MaterialIcons name="lock" size={18} color="#FFFFFF" />
                <Text style={styles.bookingPayButtonText}>
                  {bookingProcessing ? "Обработваме..." : "Плати и потвърди"}
                </Text>
              </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#EEF4E5",
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
  },
  shell: {
    flex: 1,
    width: "100%",
    maxWidth: 1320,
    alignSelf: "center",
  },
  layout: {
    flex: 1,
    flexDirection: "row",
  },
  layoutStacked: {
    flexDirection: "column",
  },
  loader: {
    flex: 1,
    backgroundColor: "#EEF4E5",
    alignItems: "center",
    justifyContent: "center",
  },
  sidebar: {
    width: 290,
    backgroundColor: "#FAFCF5",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "#DDE8C7",
    padding: 16,
    marginRight: 14,
  },
  sidebarStacked: {
    width: "100%",
    marginRight: 0,
    marginBottom: 14,
  },
  sidebarPhone: {
    backgroundColor: "transparent",
    borderWidth: 0,
    padding: 0,
    marginBottom: 10,
  },
  sidebarHeader: {
    marginBottom: 12,
  },
  sidebarHeaderPhone: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sidebarTitle: {
    color: "#29440F",
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 10,
  },
  sidebarTitlePhone: {
    fontSize: 16,
    marginBottom: 0,
  },
  newChatButton: {
    backgroundColor: "#5C8C1F",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  newChatButtonPhone: {
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  newChatButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
    marginLeft: 6,
  },
  newChatButtonTextPhone: {
    fontSize: 14,
  },
  sidebarList: {
    flex: 1,
  },
  sidebarListContent: {
    paddingBottom: 12,
  },
  chatListItem: {
    backgroundColor: "#F3F8E8",
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: "#DDE8C7",
    marginBottom: 10,
  },
  chatListItemStacked: {
    width: 250,
    marginRight: 10,
  },
  chatListItemPhone: {
    width: 210,
    padding: 10,
  },
  chatListItemActive: {
    backgroundColor: "#E6F1D4",
    borderColor: "#BFD694",
  },
  chatTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  chatItemTitle: {
    color: "#29440F",
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "800",
    flex: 1,
    paddingRight: 8,
  },
  chatItemMeta: {
    color: "#6F7D63",
    fontSize: 12,
    marginBottom: 10,
  },
  chatItemActions: {
    flexDirection: "row",
  },
  iconButton: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    marginRight: 8,
  },
  renameWrap: {
    width: "100%",
  },
  renameInput: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#29440F",
    borderWidth: 1,
    borderColor: "#DDE8C7",
    marginBottom: 10,
  },
  renameActions: {
    flexDirection: "row",
  },
  main: {
    flex: 1,
  },
  plannerTopBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
    minHeight: 54,
  },
  plannerTopBarPhone: {
    marginBottom: 10,
  },
  plannerTopBarTextWrap: {
    flex: 1,
    paddingRight: 12,
  },
  plannerTopBarTitle: {
    color: "#29440F",
    fontSize: 24,
    fontWeight: "800",
  },
  plannerTopBarMeta: {
    color: "#5F6E53",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  plannerMenuButton: {
    alignItems: "center",
    backgroundColor: "#FAFCF5",
    borderColor: "#DDE8C7",
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  historyMenuBackdrop: {
    backgroundColor: "rgba(34,56,20,0.18)",
    flex: 1,
    justifyContent: "flex-start",
    paddingHorizontal: 20,
    paddingTop: 76,
  },
  historyMenuDismissArea: {
    ...StyleSheet.absoluteFillObject,
  },
  historyMenuCard: {
    alignSelf: "flex-start",
    backgroundColor: "#FAFCF5",
    borderColor: "#DDE8C7",
    borderRadius: 24,
    borderWidth: 1,
    maxHeight: "82%",
    maxWidth: 420,
    padding: 16,
    shadowColor: "#1E2A12",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    width: "100%",
  },
  historyMenuHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  historyMenuTitle: {
    color: "#29440F",
    fontSize: 22,
    fontWeight: "800",
  },
  historyMenuSubtitle: {
    color: "#5F6E53",
    fontSize: 13,
    marginTop: 4,
  },
  historyMenuClose: {
    alignItems: "center",
    backgroundColor: "#EEF4E5",
    borderRadius: 999,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  historyMenuNewChatButton: {
    marginBottom: 14,
  },
  contextStrip: {
    backgroundColor: "#F3F8E8",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#DDE8C7",
    padding: 14,
    marginBottom: 12,
  },
  contextStripPhone: {
    padding: 12,
    borderRadius: 16,
  },
  contextStripTitle: {
    color: "#47642A",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    marginBottom: 8,
    letterSpacing: 0.8,
  },
  hero: {
    backgroundColor: "#223814",
    borderRadius: 28,
    padding: 22,
    marginBottom: 14,
    shadowColor: "#18240F",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  heroTopRowPhone: {
    marginBottom: 8,
  },
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  heroTextWrap: {
    flex: 1,
    paddingRight: 12,
  },
  heroTextWrapPhone: {
    paddingRight: 0,
  },
  heroIconBadge: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  kicker: {
    color: "#C8E08E",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800",
    marginBottom: 8,
  },
  titlePhone: {
    fontSize: 18,
    lineHeight: 24,
    marginBottom: 6,
  },
  subtitle: {
    color: "#E6F0CF",
    fontSize: 14,
    lineHeight: 21,
  },
  subtitlePhone: {
    fontSize: 13,
    lineHeight: 18,
  },
  profileMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  profileMetaRowPhone: {
    marginTop: 2,
  },
  profileMetaChip: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  profileMetaChipPhone: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 6,
    marginBottom: 6,
  },
  profileMetaChipText: {
    color: "#F4F8E8",
    fontSize: 12,
    fontWeight: "700",
  },
  profileMetaChipTextPhone: {
    fontSize: 11,
  },
  chatCard: {
    flex: 1,
    backgroundColor: "#FAFCF5",
    borderRadius: 30,
    borderWidth: 1,
    borderColor: "#DDE8C7",
    padding: 14,
  },
  chatCardPhone: {
    borderRadius: 24,
    padding: 10,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContainerPhone: {
    minHeight: 180,
  },
  messagesContent: {
    paddingBottom: 18,
  },
  messageBubble: {
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
    maxWidth: "93%",
  },
  messageBubblePhone: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    maxWidth: "100%",
  },
  assistantBubble: {
    alignSelf: "flex-start",
    backgroundColor: "#F0F5E3",
    borderWidth: 1,
    borderColor: "#DAE5C3",
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: "#5C8C1F",
  },
  messageRoleLabel: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#7B8870",
    marginBottom: 6,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  assistantMessageText: {
    color: "#2C3E1A",
  },
  userMessageText: {
    color: "#FFFFFF",
  },
  errorText: {
    color: "#A63228",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
    marginBottom: 10,
  },
  planCard: {
    backgroundColor: "#FFFDF7",
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "#F0E1B8",
    padding: 18,
    marginTop: 6,
  },
  planHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  planHeaderPhone: {
    marginBottom: 8,
  },
  planHeaderTextWrap: {
    flex: 1,
    paddingRight: 10,
  },
  planHeaderIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: "#FFF2DA",
    alignItems: "center",
    justifyContent: "center",
  },
  planTitle: {
    color: "#533D18",
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
    marginBottom: 6,
  },
  planTitlePhone: {
    fontSize: 19,
    lineHeight: 24,
  },
  planMeta: {
    color: "#7E6740",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
    marginBottom: 4,
  },
  planMetaSecondary: {
    color: "#8E7D5C",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  planSummary: {
    color: "#4E442E",
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 12,
  },
  budgetNotePill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF2DA",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  budgetNoteText: {
    color: "#8B5611",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    marginLeft: 8,
    flex: 1,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    color: "#365A14",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 10,
  },
  optionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E7ECD8",
    marginBottom: 10,
  },
  optionTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  optionModeWrap: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    paddingRight: 10,
  },
  optionModeText: {
    color: "#3B6D11",
    fontSize: 13,
    fontWeight: "800",
    marginLeft: 8,
  },
  optionPrice: {
    color: "#8B5611",
    fontSize: 13,
    fontWeight: "800",
  },
  optionProvider: {
    color: "#273C17",
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 4,
  },
  optionRoute: {
    color: "#4E5F40",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 4,
  },
  optionMeta: {
    color: "#69785B",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 6,
  },
  optionNote: {
    color: "#5C694C",
    fontSize: 13,
    lineHeight: 19,
  },
  offerSourceText: {
    color: "#7A6842",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    marginBottom: 6,
  },
  optionActionsRow: {
    flexDirection: "row",
    marginTop: 12,
  },
  optionHalfButton: {
    flex: 1,
  },
  optionLinkButton: {
    backgroundColor: "#EEF4E5",
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#D8E3C2",
  },
  optionLinkButtonText: {
    color: "#365A14",
    fontSize: 13,
    fontWeight: "800",
    marginLeft: 8,
  },
  optionActionButton: {
    backgroundColor: "#365A14",
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  optionActionButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
    marginLeft: 8,
  },
  dayCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E7ECD8",
    marginBottom: 10,
  },
  dayLabel: {
    color: "#8B5611",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  dayTitle: {
    color: "#273C17",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 6,
  },
  dayItem: {
    color: "#4E5F40",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 4,
  },
  profileTipCard: {
    backgroundColor: "#EEF4E5",
    borderRadius: 20,
    padding: 14,
    marginBottom: 14,
  },
  profileTipTitle: {
    color: "#365A14",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 6,
  },
  profileTipText: {
    color: "#405236",
    fontSize: 14,
    lineHeight: 20,
  },
  saveSuccessText: {
    color: "#3B6D11",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
    marginBottom: 10,
  },
  saveErrorText: {
    color: "#A63228",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
    marginBottom: 10,
  },
  bookingSuccessText: {
    color: "#1D6C4D",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
    marginBottom: 10,
  },
  bookingErrorText: {
    color: "#A63228",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
    marginBottom: 10,
  },
  savePlanButton: {
    backgroundColor: "#5C8C1F",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  savePlanButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  savedPlanButton: {
    backgroundColor: "#E4EFD0",
    borderWidth: 1,
    borderColor: "#C8DAA5",
  },
  savedPlanButtonText: {
    color: "#3B6D11",
  },
  bookNowButton: {
    marginTop: 10,
    backgroundColor: "#223814",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  bookNowButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
    marginLeft: 8,
  },
  quickRepliesSection: {
    marginTop: 8,
    marginBottom: 10,
  },
  quickRepliesTitle: {
    color: "#5D6C4C",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 10,
  },
  quickReplyChip: {
    backgroundColor: "#EAF3DA",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 10,
    borderWidth: 1,
    borderColor: "#D2E2B0",
  },
  quickRepliesWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  quickReplyChipPhone: {
    marginRight: 8,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  quickReplyText: {
    color: "#31521A",
    fontSize: 13,
    fontWeight: "700",
  },
  composer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 14,
    borderWidth: 1,
    borderColor: "#DDE8C7",
  },
  composerPhone: {
    borderRadius: 20,
    padding: 12,
  },
  input: {
    minHeight: 74,
    maxHeight: 120,
    color: "#29440F",
    fontSize: 15,
    lineHeight: 22,
    textAlignVertical: "top",
    marginBottom: 12,
  },
  inputPhone: {
    minHeight: 54,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10,
  },
  actionsRow: {
    flexDirection: "row",
  },
  actionsRowStacked: {
    flexDirection: "column",
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: "#FFF2DA",
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    marginRight: 8,
  },
  secondaryButtonStacked: {
    marginRight: 0,
    marginBottom: 8,
  },
  secondaryButtonText: {
    color: "#8B5611",
    fontWeight: "800",
  },
  primaryButton: {
    flex: 1,
    backgroundColor: "#5C8C1F",
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    marginLeft: 8,
  },
  primaryButtonStacked: {
    marginLeft: 0,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
    marginLeft: 8,
  },
  bookingModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(18, 27, 10, 0.54)",
    justifyContent: "center",
    padding: 18,
  },
  bookingModalCard: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    maxHeight: "92%",
    backgroundColor: "#FAFCF5",
    borderRadius: 28,
    padding: 18,
    borderWidth: 1,
    borderColor: "#DDE8C7",
  },
  bookingModalContent: {
    paddingBottom: 6,
  },
  bookingModalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  bookingModalHeaderText: {
    flex: 1,
    paddingRight: 12,
  },
  bookingModalKicker: {
    color: "#6A8F2A",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  bookingModalTitle: {
    color: "#29440F",
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
    marginBottom: 8,
  },
  bookingModalSubtitle: {
    color: "#5C694C",
    fontSize: 14,
    lineHeight: 20,
  },
  bookingCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#EEF4E5",
    alignItems: "center",
    justifyContent: "center",
  },
  bookingSection: {
    marginBottom: 16,
  },
  bookingSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  bookingSectionTitle: {
    color: "#365A14",
    fontSize: 15,
    fontWeight: "800",
  },
  bookingSkipChip: {
    backgroundColor: "#EEF4E5",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#D8E3C2",
  },
  bookingSkipChipSelected: {
    backgroundColor: "#365A14",
    borderColor: "#365A14",
  },
  bookingSkipChipText: {
    color: "#365A14",
    fontSize: 12,
    fontWeight: "800",
  },
  bookingSkipChipTextSelected: {
    color: "#FFFFFF",
  },
  bookingOptionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#DDE8C7",
    padding: 14,
    marginBottom: 10,
  },
  bookingOptionCardSelected: {
    borderColor: "#5C8C1F",
    backgroundColor: "#F0F7E3",
  },
  bookingOptionTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  bookingOptionTitle: {
    color: "#29440F",
    fontSize: 15,
    fontWeight: "800",
    flex: 1,
    paddingRight: 10,
  },
  bookingOptionPrice: {
    color: "#8B5611",
    fontSize: 14,
    fontWeight: "800",
  },
  bookingOptionMeta: {
    color: "#516244",
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 4,
  },
  bookingOptionNote: {
    color: "#627254",
    fontSize: 13,
    lineHeight: 19,
  },
  bookingInput: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#DDE8C7",
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: "#29440F",
    fontSize: 14,
    marginBottom: 10,
  },
  bookingNoteInput: {
    minHeight: 86,
    textAlignVertical: "top",
  },
  paymentMethodsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  paymentMethodChip: {
    backgroundColor: "#EEF4E5",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#D8E3C2",
  },
  paymentMethodChipSelected: {
    backgroundColor: "#5C8C1F",
    borderColor: "#5C8C1F",
  },
  paymentMethodChipText: {
    color: "#365A14",
    fontSize: 13,
    fontWeight: "700",
  },
  paymentMethodChipTextSelected: {
    color: "#FFFFFF",
  },
  bookingSummaryCard: {
    backgroundColor: "#FFF8E7",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "#F1D7A5",
    marginBottom: 16,
  },
  bookingSummaryTitle: {
    color: "#8B5611",
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 8,
  },
  bookingSummaryLine: {
    color: "#6A5731",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 4,
  },
  bookingSummaryTotal: {
    color: "#4E3A19",
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
    marginTop: 8,
    marginBottom: 6,
  },
  bookingSummaryHint: {
    color: "#7A6842",
    fontSize: 12,
    lineHeight: 18,
  },
  checkoutProcessingCard: {
    backgroundColor: "#F7FBEF",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#DDE8C7",
    padding: 20,
  },
  checkoutProcessingIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: "#E7F0D7",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    alignSelf: "center",
  },
  checkoutProcessingTitle: {
    color: "#223814",
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 8,
  },
  checkoutProcessingSubtitle: {
    color: "#5D6D50",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 18,
  },
  checkoutProgressTrack: {
    height: 12,
    borderRadius: 999,
    backgroundColor: "#E8F0DB",
    overflow: "hidden",
    marginBottom: 16,
  },
  checkoutProgressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#5C8C1F",
  },
  checkoutProcessingSteps: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#DDE8C7",
    padding: 14,
    marginBottom: 16,
  },
  checkoutProcessingStep: {
    color: "#43563A",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 6,
  },
  checkoutSuccessCard: {
    backgroundColor: "#F7FBEF",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#DDE8C7",
    padding: 20,
    alignItems: "center",
  },
  checkoutSuccessBadge: {
    width: 74,
    height: 74,
    borderRadius: 24,
    backgroundColor: "#5C8C1F",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  checkoutSuccessTitle: {
    color: "#223814",
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 8,
  },
  checkoutSuccessSubtitle: {
    color: "#5D6D50",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 18,
  },
  checkoutReceiptCard: {
    width: "100%",
    backgroundColor: "#FFF8E7",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "#F1D7A5",
    marginBottom: 16,
  },
  checkoutReceiptKicker: {
    color: "#8B5611",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 10,
  },
  checkoutReceiptLine: {
    color: "#654F29",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 6,
  },
  checkoutReceiptTotal: {
    color: "#3D2E15",
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
    marginTop: 6,
    marginBottom: 8,
  },
  checkoutReceiptRef: {
    color: "#7B6844",
    fontSize: 12,
    lineHeight: 18,
  },
  bookingPayButton: {
    backgroundColor: "#223814",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  bookingPayButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
    marginLeft: 8,
  },
  disabledButton: {
    opacity: 0.55,
  },
});
