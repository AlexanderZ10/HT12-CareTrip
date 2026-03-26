import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
  const [savedSourceKeys, setSavedSourceKeys] = useState<string[]>([]);
  const [homeStore, setHomeStore] = useState<HomePlannerStore>({
    chats: [],
    currentChatId: null,
  });
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
  const heroTitle = isPhoneLayout
    ? "Планирай пътуване"
    : "Чатове като в ChatGPT, но за travel planning";
  const heroSubtitle = isPhoneLayout
    ? `От ${profile?.personalProfile.homeBase || "твоя град"} с реални цени за транспорт и престой.`
    : `Планираме от ${profile?.personalProfile.homeBase || "твоя град"} с фокус върху реални цени за транспорт и престой от интернет.`;

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
          <View
            style={[
              styles.sidebar,
              !isWideLayout && styles.sidebarStacked,
              isPhoneLayout && styles.sidebarPhone,
            ]}
          >
            <View
              style={[
                styles.sidebarHeader,
                isPhoneLayout && styles.sidebarHeaderPhone,
              ]}
            >
              <Text style={[styles.sidebarTitle, isPhoneLayout && styles.sidebarTitlePhone]}>
                AI Chats
              </Text>
              <TouchableOpacity
                style={[styles.newChatButton, isPhoneLayout && styles.newChatButtonPhone]}
                onPress={() => {
                  void handleCreateChat();
                }}
                activeOpacity={0.9}
              >
                <MaterialIcons
                  name="add"
                  size={isPhoneLayout ? 16 : 18}
                  color="#FFFFFF"
                />
                <Text
                  style={[
                    styles.newChatButtonText,
                    isPhoneLayout && styles.newChatButtonTextPhone,
                  ]}
                >
                  Нов чат
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.sidebarList}
              contentContainerStyle={styles.sidebarListContent}
              showsVerticalScrollIndicator={false}
              horizontal={!isWideLayout}
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
                      !isWideLayout && styles.chatListItemStacked,
                      isPhoneLayout && styles.chatListItemPhone,
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

          <View style={styles.main}>
            <View style={styles.hero}>
              <View style={[styles.heroTopRow, isPhoneLayout && styles.heroTopRowPhone]}>
                <View style={[styles.heroTextWrap, isPhoneLayout && styles.heroTextWrapPhone]}>
                  <Text style={styles.kicker}>AI Trip Planner</Text>
                  <Text style={[styles.title, isPhoneLayout && styles.titlePhone]}>
                    {heroTitle}
                  </Text>
                  <Text style={[styles.subtitle, isPhoneLayout && styles.subtitlePhone]}>
                    {heroSubtitle}
                  </Text>
                </View>

                {!isPhoneLayout ? (
                  <View style={styles.heroIconBadge}>
                    <MaterialIcons name="auto-awesome" size={26} color="#F4E4B3" />
                  </View>
                ) : null}
              </View>

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

            <View style={[styles.chatCard, isPhoneLayout && styles.chatCardPhone]}>
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
                          <Text style={styles.optionNote}>{option.note}</Text>
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
                          <Text style={styles.optionNote}>{stay.note}</Text>
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
  disabledButton: {
    opacity: 0.55,
  },
});
