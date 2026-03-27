import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Easing,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { ConfirmDialog } from "../../components/confirm-dialog";
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
  generateGroundedTravelFollowUp,
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

function renderInlineMarkdownSegments(text: string, baseStyle: StyleProp<TextStyle>) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((segment, index) => {
    const isBold = segment.startsWith("**") && segment.endsWith("**") && segment.length > 4;

    return (
      <Text
        key={`segment-${index}`}
        style={[baseStyle, isBold && styles.messageTextBold]}
      >
        {isBold ? segment.slice(2, -2) : segment}
      </Text>
    );
  });
}

function FormattedMessageText({
  text,
  textStyle,
}: {
  text: string;
  textStyle: StyleProp<TextStyle>;
}) {
  const lines = text.split("\n");

  return (
    <View>
      {lines.map((line, index) => {
        const trimmedLine = line.trim();
        const bulletMatch = trimmedLine.match(/^[-*]\s+(.*)$/);

        if (!trimmedLine) {
          return <View key={`line-${index}`} style={styles.messageSpacer} />;
        }

        if (bulletMatch) {
          return (
            <View key={`line-${index}`} style={styles.messageBulletRow}>
              <Text style={[textStyle, styles.messageBulletMark]}>•</Text>
              <Text style={[textStyle, styles.messageBulletText]}>
                {renderInlineMarkdownSegments(bulletMatch[1], textStyle)}
              </Text>
            </View>
          );
        }

        return (
          <Text key={`line-${index}`} style={[textStyle, styles.messageParagraph]}>
            {renderInlineMarkdownSegments(trimmedLine, textStyle)}
          </Text>
        );
      })}
    </View>
  );
}

export default function HomeTabScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isWideLayout = width >= 980;
  const isPhoneLayout = width < 768;

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
  const [chatSearch, setChatSearch] = useState("");
  const [isPhoneChatMenuOpen, setIsPhoneChatMenuOpen] = useState(false);
  const [isPhoneChatDrawerMounted, setIsPhoneChatDrawerMounted] = useState(false);
  const [pendingDeleteChat, setPendingDeleteChat] = useState<HomePlannerChatThread | null>(
    null
  );
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const phoneDrawerTranslateX = useRef(new Animated.Value(-320)).current;
  const phoneDrawerWidth = Math.min(width * 0.84, 330);

  const sortedChats = useMemo(
    () => sortHomePlannerChats(homeStore.chats),
    [homeStore.chats]
  );
  const filteredChats = useMemo(() => {
    const query = chatSearch.trim().toLowerCase();

    if (!query) {
      return sortedChats;
    }

    return sortedChats.filter((chat) =>
      [chat.title, chat.state.destination, chat.state.latestPlan?.destination]
        .filter((value): value is string => !!value)
        .some((value) => value.toLowerCase().includes(query))
    );
  }, [chatSearch, sortedChats]);

  const currentChat = useMemo(() => {
    if (homeStore.chats.length === 0) {
      return null;
    }

    return (
      homeStore.chats.find((chat) => chat.id === homeStore.currentChatId) ??
      sortedChats[0]
    );
  }, [homeStore, sortedChats]);

  const currentPlannerState =
    currentChat?.state ?? createEmptyPlannerState(buildInitialAssistantMessage(profileName));
  const latestPlan = currentPlannerState.latestPlan;
  const followUpMessages = currentPlannerState.followUpMessages ?? [];
  const messagesScrollRef = useRef<ScrollView | null>(null);

  const scrollMessagesToBottom = useCallback((animated: boolean) => {
    const timer = setTimeout(() => {
      setShowScrollToBottom(false);
      messagesScrollRef.current?.scrollToEnd({ animated });
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  const handleMessagesScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const {
        contentOffset,
        contentSize,
        layoutMeasurement,
      } = event.nativeEvent;
      const distanceFromBottom =
        contentSize.height - (contentOffset.y + layoutMeasurement.height);

      setShowScrollToBottom(distanceFromBottom > 96);
    },
    []
  );

  useEffect(() => {
    if (!isPhoneLayout) {
      setIsPhoneChatMenuOpen(false);
      setIsPhoneChatDrawerMounted(false);
      phoneDrawerTranslateX.setValue(-phoneDrawerWidth);
      return;
    }

    if (isPhoneChatMenuOpen) {
      setIsPhoneChatDrawerMounted(true);
      phoneDrawerTranslateX.setValue(-phoneDrawerWidth);
      Animated.timing(phoneDrawerTranslateX, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      return;
    }

    if (!isPhoneChatDrawerMounted) {
      return;
    }

    Animated.timing(phoneDrawerTranslateX, {
      toValue: -phoneDrawerWidth,
      duration: 180,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setIsPhoneChatDrawerMounted(false);
      }
    });
  }, [
    isPhoneChatDrawerMounted,
    isPhoneChatMenuOpen,
    isPhoneLayout,
    phoneDrawerTranslateX,
    phoneDrawerWidth,
  ]);

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

  useEffect(() => {
    setShowScrollToBottom(false);
    return scrollMessagesToBottom(false);
  }, [currentChat?.id, scrollMessagesToBottom]);

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

  const canSend = chatInput.trim().length > 0 && !planning;

  const persistStore = useCallback(
    async (nextStore: HomePlannerStore) => {
      if (!user) {
        return;
      }

      try {
        await saveHomePlannerStoreForUser(user.uid, nextStore);
      } catch (nextError) {
        setError(getFirestoreUserMessage(nextError, "write"));
      }
    },
    [user]
  );

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
    setIsPhoneChatMenuOpen(false);
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
    setChatSearch("");
    setIsPhoneChatMenuOpen(false);
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

  const confirmDeleteChat = async () => {
    if (!pendingDeleteChat) {
      return;
    }

    const chatId = pendingDeleteChat.id;
    setPendingDeleteChat(null);
    await handleDeleteChat(chatId);
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
    const followUpMessagesAfterUser = [...(plannerState.followUpMessages ?? []), userMessage];

    if (plannerState.step === "done") {
      if (!plannerState.latestPlan) {
        const assistantMessage = createHomeChatMessage(
          "assistant",
          "Кажи какво искаш да променим или започни нов чат, за да подготвя нов маршрут."
        );

        await replaceCurrentChat((chat) => ({
          ...chat,
          updatedAtMs: Date.now(),
          state: {
            ...chat.state,
            followUpMessages: [...followUpMessagesAfterUser, assistantMessage],
            step: "done",
          },
        }));

        scrollMessagesToBottom(true);

        return;
      }

      setPlanning(true);

      await replaceCurrentChat((chat) => ({
        ...chat,
        updatedAtMs: Date.now(),
        state: {
          ...chat.state,
          followUpMessages: followUpMessagesAfterUser,
          step: "done",
        },
      }));

      try {
        const followUpText = await generateGroundedTravelFollowUp({
          budget: plannerState.budget,
          currentPlanText:
            plannerState.latestPlan.formattedPlanText ||
            formatGroundedTravelPlan(plannerState.latestPlan.plan),
          days: plannerState.days,
          destination: plannerState.destination || plannerState.latestPlan.destination,
          profile,
          recentMessages: [...plannerState.messages, ...(plannerState.followUpMessages ?? [])].map((message) => ({
            role: message.role,
            text: message.text,
          })),
          timing: plannerState.timing,
          transportPreference: plannerState.transportPreference,
          travelers: plannerState.travelers,
          userRequest: value,
        });
        const assistantMessage = createHomeChatMessage("assistant", followUpText);

        await replaceCurrentChat((chat) => ({
          ...chat,
          updatedAtMs: Date.now(),
          state: {
            ...chat.state,
            followUpMessages: [...followUpMessagesAfterUser, assistantMessage],
            step: "done",
          },
        }));
        scrollMessagesToBottom(true);
      } catch (nextError) {
        const message = getHomePlannerErrorMessage(nextError);
        const errorMessage = createHomeChatMessage("assistant", message);
        setError(message);

        await replaceCurrentChat((chat) => ({
          ...chat,
          updatedAtMs: Date.now(),
          state: {
            ...chat.state,
            followUpMessages: [...followUpMessagesAfterUser, errorMessage],
            step: "done",
          },
        }));
        scrollMessagesToBottom(true);
      } finally {
        setPlanning(false);
      }

      return;
    }

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
          followUpMessages: [],
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
          followUpMessages: [],
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
          followUpMessages: [],
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
          followUpMessages: [],
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
          followUpMessages: [],
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
          followUpMessages: [],
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
            followUpMessages: [],
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
            followUpMessages: [],
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
      setSaveSuccess("Този маршрут вече е запазен в Trips.");
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
      setSaveSuccess("Маршрутът е запазен в Trips.");
    } catch (nextError) {
      setSaveSuccess("");
      setSaveError(getFirestoreUserMessage(nextError, "write"));
    } finally {
      setSavingPlan(false);
    }
  };

  const renderChatList = (isPhoneMenu = false) => {
    if (filteredChats.length === 0) {
      return (
        <View style={styles.emptyChatSearchState}>
          <Text style={styles.emptyChatSearchText}>No chats found.</Text>
        </View>
      );
    }

    return filteredChats.map((chat) => {
      const isActive = currentChat?.id === chat.id;
      const isRenaming = renamingChatId === chat.id;

      return (
        <View
          key={chat.id}
          style={[
            styles.chatListItem,
            isActive && styles.chatListItemActive,
            !isWideLayout && !isPhoneMenu && styles.chatListItemStacked,
            isPhoneLayout && !isPhoneMenu && styles.chatListItemPhone,
            isPhoneMenu && styles.chatListItemPhoneMenu,
          ]}
        >
          {isRenaming ? (
            <View style={styles.renameWrap}>
              <TextInput
                style={styles.renameInput}
                value={renameValue}
                onChangeText={setRenameValue}
                placeholder="Chat name"
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
                <Text style={styles.chatItemMeta}>{formatUpdatedDate(chat.updatedAtMs)}</Text>
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
                  onPress={() => setPendingDeleteChat(chat)}
                  activeOpacity={0.9}
                >
                  <MaterialIcons name="delete-outline" size={16} color="#8A3D35" />
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      );
    });
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
      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 12 : 78}
      >
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
              {isPhoneLayout ? (
                <View style={styles.phoneHeaderBrandWrap}>
                  <TouchableOpacity
                    style={styles.phoneHamburgerButton}
                    onPress={() => setIsPhoneChatMenuOpen(true)}
                    activeOpacity={0.9}
                  >
                    <MaterialIcons name="menu" size={20} color="#29440F" />
                  </TouchableOpacity>
                  <Text style={[styles.sidebarTitle, styles.sidebarTitlePhone]}>CareTrip</Text>
                </View>
              ) : (
                <Text style={styles.sidebarTitle}>CareTrip</Text>
              )}
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

            {!isPhoneLayout ? (
              <View style={styles.sidebarSearchWrap}>
                <MaterialIcons name="search" size={18} color="#7B8870" />
                <TextInput
                  style={styles.sidebarSearchInput}
                  value={chatSearch}
                  onChangeText={setChatSearch}
                  placeholder="Search chats"
                  placeholderTextColor="#7B8870"
                />
              </View>
            ) : null}

            <ScrollView
              style={[
                styles.sidebarList,
                isWideLayout ? styles.sidebarListWide : styles.sidebarListStacked,
                isPhoneLayout && styles.sidebarListHiddenPhone,
              ]}
              contentContainerStyle={styles.sidebarListContent}
              showsVerticalScrollIndicator={false}
              horizontal={!isWideLayout}
            >
              {filteredChats.map((chat) => {
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
                            onPress={() => setPendingDeleteChat(chat)}
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

            <View style={[styles.chatCard, isPhoneLayout && styles.chatCardPhone]}>
              <ScrollView
                ref={messagesScrollRef}
                style={[styles.messagesContainer, isPhoneLayout && styles.messagesContainerPhone]}
                contentContainerStyle={styles.messagesContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                onScroll={handleMessagesScroll}
                scrollEventThrottle={16}
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
                    <FormattedMessageText
                      text={message.text}
                      textStyle={[
                        styles.messageText,
                        message.role === "assistant"
                          ? styles.assistantMessageText
                          : styles.userMessageText,
                      ]}
                    />
                  </View>
                ))}

                {!latestPlan && planning ? (
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
                          <View
                            style={[
                              styles.optionTopRow,
                              isPhoneLayout && styles.optionTopRowStacked,
                            ]}
                          >
                            <View style={styles.optionHeadingWrap}>
                              <View style={styles.optionModeWrap}>
                                <MaterialIcons
                                  name={getTransportIconName(option)}
                                  size={18}
                                  color="#3B6D11"
                                />
                                <Text style={styles.optionModeText}>{option.mode}</Text>
                              </View>
                              <Text style={styles.optionProvider}>{option.provider}</Text>
                            </View>
                            <Text
                              style={[styles.optionPrice, isPhoneLayout && styles.optionPricePhone]}
                            >
                              {option.price}
                            </Text>
                          </View>
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
                          <View
                            style={[
                              styles.optionTopRow,
                              isPhoneLayout && styles.optionTopRowStacked,
                            ]}
                          >
                            <Text style={styles.optionProvider}>{stay.name}</Text>
                            <Text
                              style={[styles.optionPrice, isPhoneLayout && styles.optionPricePhone]}
                            >
                              {stay.pricePerNight}
                            </Text>
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
                            ? "Saved in Trips"
                            : "Save to Trips"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : null}

                {followUpMessages.map((message) => (
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
                    <FormattedMessageText
                      text={message.text}
                      textStyle={[
                        styles.messageText,
                        message.role === "assistant"
                          ? styles.assistantMessageText
                          : styles.userMessageText,
                      ]}
                    />
                  </View>
                ))}

                {latestPlan && planning ? (
                  <View style={[styles.messageBubble, styles.assistantBubble]}>
                    <Text style={styles.messageRoleLabel}>AI Planner</Text>
                    <Text style={styles.assistantMessageText}>
                      Търся най-добрите цени за transport и stay...
                    </Text>
                  </View>
                ) : null}
              </ScrollView>

              {showScrollToBottom ? (
                <TouchableOpacity
                  style={[
                    styles.scrollToBottomButton,
                    isPhoneLayout && styles.scrollToBottomButtonPhone,
                  ]}
                  onPress={() => {
                    scrollMessagesToBottom(true);
                  }}
                  activeOpacity={0.9}
                >
                  <MaterialIcons name="keyboard-double-arrow-down" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              ) : null}

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
              <View
                style={[
                  styles.composer,
                  isPhoneLayout && styles.composerPhone,
                  isPhoneLayout && { marginBottom: insets.bottom + 6 },
                ]}
              >
                <View style={styles.composerInner}>
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
                                  : "Попитай за промяна или уточнение по плана..."
                    }
                    placeholderTextColor="#7B8870"
                    value={chatInput}
                    onChangeText={setChatInput}
                    onFocus={() => scrollMessagesToBottom(true)}
                    editable={!planning}
                    onKeyPress={(event) => {
                      if (Platform.OS !== "web") {
                        return;
                      }

                      const webEvent = event as typeof event & {
                        nativeEvent: typeof event.nativeEvent & { shiftKey?: boolean };
                        preventDefault?: () => void;
                      };

                      if (
                        webEvent.nativeEvent.key === "Enter" &&
                        !webEvent.nativeEvent.shiftKey
                      ) {
                        webEvent.preventDefault?.();

                        if (canSend) {
                          void sendPlannerMessage(chatInput);
                        }
                      }
                    }}
                    submitBehavior={Platform.OS === "web" ? "submit" : "newline"}
                    onSubmitEditing={() => {
                      if (Platform.OS !== "web" && canSend) {
                        void sendPlannerMessage(chatInput);
                      }
                    }}
                    multiline={Platform.OS !== "web"}
                  />

                  <TouchableOpacity
                    style={[
                      styles.sendButton,
                      isPhoneLayout && styles.sendButtonPhone,
                      !canSend && styles.disabledButton,
                    ]}
                    onPress={() => {
                      void sendPlannerMessage(chatInput);
                    }}
                    disabled={!canSend}
                    activeOpacity={0.9}
                  >
                    <MaterialIcons name="arrow-upward" size={18} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </View>
      </View>
      </KeyboardAvoidingView>
      {isPhoneLayout && isPhoneChatDrawerMounted ? (
        <View style={styles.phoneDrawerOverlay}>
          <Pressable
            style={styles.phoneDrawerBackdrop}
            onPress={() => setIsPhoneChatMenuOpen(false)}
          />
          <Animated.View
            style={[
              styles.phoneDrawerPanel,
              {
                paddingBottom: insets.bottom + 16,
                paddingTop: insets.top + 14,
                transform: [{ translateX: phoneDrawerTranslateX }],
                width: phoneDrawerWidth,
              },
            ]}
          >
            <View style={styles.phoneDrawerTopRow}>
              <Text style={styles.phoneDrawerBrand}>CareTrip</Text>
              <TouchableOpacity
                style={styles.phoneDrawerCloseButton}
                onPress={() => setIsPhoneChatMenuOpen(false)}
                activeOpacity={0.9}
              >
                <MaterialIcons name="close" size={20} color="#29440F" />
              </TouchableOpacity>
            </View>

            <View style={styles.phoneDrawerSearchWrap}>
              <MaterialIcons name="search" size={18} color="#7B8870" />
              <TextInput
                style={styles.phoneDrawerSearchInput}
                value={chatSearch}
                onChangeText={setChatSearch}
                placeholder="Search chats"
                placeholderTextColor="#7B8870"
              />
            </View>

            <ScrollView
              style={styles.phoneDrawerList}
              contentContainerStyle={styles.phoneDrawerListContent}
              showsVerticalScrollIndicator={false}
            >
              {renderChatList(true)}
            </ScrollView>
          </Animated.View>
        </View>
      ) : null}
      <ConfirmDialog
        visible={!!pendingDeleteChat}
        title="Delete chat?"
        message={
          pendingDeleteChat
            ? `This will permanently remove "${pendingDeleteChat.title}".`
            : ""
        }
        confirmLabel="Delete"
        destructive
        onCancel={() => setPendingDeleteChat(null)}
        onConfirm={() => {
          void confirmDeleteChat();
        }}
      />
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
  keyboardWrap: {
    flex: 1,
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
  phoneHeaderBrandWrap: {
    flexDirection: "row",
    alignItems: "center",
  },
  phoneHamburgerButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F8E8",
    borderWidth: 1,
    borderColor: "#DDE8C7",
    marginRight: 10,
  },
  phoneChatMenuSection: {
    marginBottom: 10,
  },
  phoneChatMenuButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "#F3F8E8",
    borderWidth: 1,
    borderColor: "#DDE8C7",
  },
  phoneChatMenuButtonText: {
    color: "#29440F",
    fontSize: 14,
    fontWeight: "800",
    marginLeft: 6,
  },
  phoneChatMenuPanel: {
    marginTop: 10,
    padding: 12,
    borderRadius: 20,
    backgroundColor: "#FAFCF5",
    borderWidth: 1,
    borderColor: "#DDE8C7",
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
  sidebarSearchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#DDE8C7",
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  sidebarSearchInput: {
    flex: 1,
    minHeight: 46,
    marginLeft: 8,
    color: "#29440F",
  },
  sidebarList: {
    flex: 1,
  },
  sidebarListWide: {
    flex: 1,
  },
  sidebarListStacked: {
    flexGrow: 0,
  },
  sidebarListPhonePanel: {
    maxHeight: 280,
  },
  sidebarListHiddenPhone: {
    display: "none",
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
  chatListItemPhoneMenu: {
    width: "100%",
    padding: 10,
  },
  phoneDrawerOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
    elevation: 20,
  },
  phoneDrawerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(18, 27, 10, 0.34)",
  },
  phoneDrawerPanel: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "#FAFCF5",
    borderTopRightRadius: 24,
    borderBottomRightRadius: 24,
    borderRightWidth: 1,
    borderColor: "#DDE8C7",
    paddingHorizontal: 14,
    shadowColor: "#121B0A",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 8, height: 0 },
  },
  phoneDrawerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  phoneDrawerBrand: {
    color: "#29440F",
    fontSize: 22,
    fontWeight: "900",
  },
  phoneDrawerCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F8E8",
    borderWidth: 1,
    borderColor: "#DDE8C7",
  },
  phoneDrawerSearchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F5F7EF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#DDE8C7",
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  phoneDrawerSearchInput: {
    flex: 1,
    minHeight: 48,
    marginLeft: 8,
    color: "#29440F",
  },
  phoneDrawerList: {
    flex: 1,
  },
  phoneDrawerListContent: {
    paddingBottom: 10,
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
  emptyChatSearchState: {
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: "#F3F8E8",
    borderWidth: 1,
    borderColor: "#DDE8C7",
  },
  emptyChatSearchText: {
    color: "#6F7D63",
    fontSize: 14,
    textAlign: "center",
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
  scrollToBottomButton: {
    position: "absolute",
    right: 18,
    bottom: 148,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#5C8C1F",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#121B0A",
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  scrollToBottomButtonPhone: {
    right: 14,
    bottom: 144,
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
  messageTextBold: {
    fontWeight: "800",
  },
  messageParagraph: {
    marginBottom: 6,
  },
  messageBulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  messageBulletMark: {
    width: 16,
    fontWeight: "800",
  },
  messageBulletText: {
    flex: 1,
  },
  messageSpacer: {
    height: 8,
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
    alignItems: "flex-start",
    marginBottom: 8,
  },
  optionTopRowStacked: {
    flexDirection: "column",
  },
  optionHeadingWrap: {
    flex: 1,
    minWidth: 0,
    paddingRight: 10,
  },
  optionModeWrap: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
    marginBottom: 4,
  },
  optionModeText: {
    color: "#3B6D11",
    fontSize: 13,
    fontWeight: "800",
    marginLeft: 8,
    flexShrink: 1,
  },
  optionPrice: {
    color: "#8B5611",
    fontSize: 13,
    fontWeight: "800",
    flexShrink: 1,
    textAlign: "right",
    maxWidth: "42%",
  },
  optionPricePhone: {
    maxWidth: "100%",
    textAlign: "left",
    marginTop: 2,
  },
  optionProvider: {
    color: "#273C17",
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 4,
    flexShrink: 1,
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
    marginTop: 6,
  },
  composerPhone: {
    borderRadius: 20,
    padding: 12,
  },
  composerInner: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  input: {
    flex: 1,
    minHeight: 52,
    maxHeight: 120,
    color: "#29440F",
    fontSize: 15,
    lineHeight: 22,
    textAlignVertical: "top",
    paddingTop: 4,
    paddingRight: 12,
  },
  inputPhone: {
    minHeight: 46,
    fontSize: 14,
    lineHeight: 20,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#5C8C1F",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  sendButtonPhone: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  disabledButton: {
    opacity: 0.55,
  },
});
