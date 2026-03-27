import { MaterialIcons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useRouter } from "expo-router";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
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

import { useAppTheme } from "../../components/app-theme-provider";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { auth, db } from "../../firebase";
import { normalizeBudgetToEuro } from "../../utils/currency";
import { getFirestoreUserMessage } from "../../utils/firestore-errors";
import {
  createEmptyPlannerState,
  createHomeChatMessage,
  createHomePlannerChat,
  isHomePlannerChatUntouched,
  parseStoredHomePlannerStore,
  saveHomePlannerStoreForUser,
  sortHomePlannerChats,
  type HomeChatMessage,
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
import { createTestCheckoutSession } from "../../utils/travel-offers";
import { getBookingEstimate } from "../../utils/bookings";
import { savePendingStripeCheckout } from "../../utils/pending-stripe-checkout";
import { buildStripeCheckoutReturnUrls } from "../../utils/stripe-checkout-return";
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

WebBrowser.maybeCompleteAuthSession();

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

function parseCheckoutReturnState(url: string) {
  const parsedUrl = Linking.parse(url);
  const rawCheckoutValue = parsedUrl.queryParams?.checkout;
  const rawSessionIdValue = parsedUrl.queryParams?.session_id;

  return {
    checkout:
      typeof rawCheckoutValue === "string"
        ? rawCheckoutValue
        : Array.isArray(rawCheckoutValue)
          ? rawCheckoutValue[0] ?? ""
          : "",
    sessionId:
      typeof rawSessionIdValue === "string"
        ? rawSessionIdValue
        : Array.isArray(rawSessionIdValue)
          ? rawSessionIdValue[0] ?? ""
          : "",
  };
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
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isFocused = useIsFocused();
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
  const [chatSearch, setChatSearch] = useState("");
  const [isPhoneChatMenuOpen, setIsPhoneChatMenuOpen] = useState(false);
  const [isPhoneChatDrawerMounted, setIsPhoneChatDrawerMounted] = useState(false);
  const [pendingDeleteChat, setPendingDeleteChat] = useState<HomePlannerChatThread | null>(
    null
  );
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const phoneDrawerTranslateX = useRef(new Animated.Value(-320)).current;
  const phoneDrawerWidth = Math.min(width * 0.84, 330);
  const typingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const homeFocusHandledRef = useRef(false);
  const [typingMessageId, setTypingMessageId] = useState<string | null>(null);
  const [typingVisibleText, setTypingVisibleText] = useState("");
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

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

  const clearTypingAnimation = useCallback(() => {
    if (typingTimerRef.current) {
      clearInterval(typingTimerRef.current);
      typingTimerRef.current = null;
    }
  }, []);

  const startTypingAnimation = useCallback(
    (message: HomeChatMessage | null) => {
      clearTypingAnimation();

      if (!message || message.role !== "assistant" || !message.text) {
        setTypingMessageId(null);
        setTypingVisibleText("");
        return;
      }

      const targetText = message.text;
      const stepSize =
        targetText.length > 520
          ? 4
          : targetText.length > 260
            ? 3
            : targetText.length > 120
              ? 2
              : 1;
      let visibleLength = 0;

      setTypingMessageId(message.id);
      setTypingVisibleText("");

      typingTimerRef.current = setInterval(() => {
        visibleLength = Math.min(targetText.length, visibleLength + stepSize);
        setTypingVisibleText(targetText.slice(0, visibleLength));

        if (visibleLength >= targetText.length) {
          clearTypingAnimation();
          setTypingVisibleText(targetText);
        }
      }, 18);
    },
    [clearTypingAnimation]
  );

  const getDisplayedMessageText = useCallback(
    (message: HomeChatMessage) =>
      message.id === typingMessageId ? typingVisibleText || " " : message.text,
    [typingMessageId, typingVisibleText]
  );

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
    return () => {
      clearTypingAnimation();
    };
  }, [clearTypingAnimation]);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      setIsKeyboardOpen(true);
      setKeyboardHeight(event?.endCoordinates?.height ?? 0);
      scrollMessagesToBottom(true);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setIsKeyboardOpen(false);
      setKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [scrollMessagesToBottom]);

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
    clearTypingAnimation();
    setTypingMessageId(null);
    setTypingVisibleText("");
    setShowScrollToBottom(false);
    return scrollMessagesToBottom(false);
  }, [clearTypingAnimation, currentChat?.id, scrollMessagesToBottom]);

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
  const androidKeyboardOffset =
    Platform.OS === "android" && isKeyboardOpen
      ? Math.max(0, keyboardHeight - 72)
      : 0;
  const phoneComposerBottomMargin =
    insets.bottom + (isKeyboardOpen ? 4 : 10) + androidKeyboardOffset;
  const scrollToBottomOffset = isPhoneLayout
    ? phoneComposerBottomMargin + (quickReplies.length > 0 ? 176 : 112)
    : 148;

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

  useEffect(() => {
    if (!isFocused) {
      homeFocusHandledRef.current = false;
      return;
    }

    if (loading || !user || homeFocusHandledRef.current) {
      return;
    }

    homeFocusHandledRef.current = true;

    const untouchedChat = sortedChats.find((chat) => isHomePlannerChatUntouched(chat));

    if (untouchedChat) {
      if (homeStore.currentChatId !== untouchedChat.id) {
        const nextStore = {
          ...homeStore,
          currentChatId: untouchedChat.id,
        };

        setChatInput("");
        setHomeStore(nextStore);
        void persistStore(nextStore);
      }

      return;
    }

    const nextChat = createHomePlannerChat(
      buildInitialAssistantMessage(profileName),
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
    void persistStore(nextStore);
  }, [
    homeStore,
    isFocused,
    loading,
    persistStore,
    profileName,
    sortedChats,
    user,
  ]);

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

  const replaceCurrentChatWithAssistant = async (
    updater: (chat: HomePlannerChatThread) => HomePlannerChatThread,
    assistantMessage?: HomeChatMessage | null
  ) => {
    if (assistantMessage) {
      startTypingAnimation(assistantMessage);
    }

    await replaceCurrentChat(updater);
  };

  const handleSelectChat = async (chatId: string) => {
    const nextStore = {
      ...homeStore,
      currentChatId: chatId,
    };

    setChatMenuVisible(false);
    setIsPhoneChatMenuOpen(false);
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
    setIsPhoneChatMenuOpen(false);
    setChatSearch("");
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
    const followUpMessagesAfterUser = [...(plannerState.followUpMessages ?? []), userMessage];

    if (plannerState.step === "done") {
      if (!plannerState.latestPlan) {
        const assistantMessage = createHomeChatMessage(
          "assistant",
          "Кажи какво искаш да променим или започни нов чат, за да подготвя нов маршрут."
        );

        await replaceCurrentChatWithAssistant((chat) => ({
          ...chat,
          updatedAtMs: Date.now(),
          state: {
            ...chat.state,
            followUpMessages: [...followUpMessagesAfterUser, assistantMessage],
            step: "done",
          },
        }), assistantMessage);

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

        await replaceCurrentChatWithAssistant((chat) => ({
          ...chat,
          updatedAtMs: Date.now(),
          state: {
            ...chat.state,
            followUpMessages: [...followUpMessagesAfterUser, assistantMessage],
            step: "done",
          },
        }), assistantMessage);
        scrollMessagesToBottom(true);
      } catch (nextError) {
        const message = getHomePlannerErrorMessage(nextError);
        const errorMessage = createHomeChatMessage("assistant", message);
        setError(message);

        await replaceCurrentChatWithAssistant((chat) => ({
          ...chat,
          updatedAtMs: Date.now(),
          state: {
            ...chat.state,
            followUpMessages: [...followUpMessagesAfterUser, errorMessage],
            step: "done",
          },
        }), errorMessage);
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

      await replaceCurrentChatWithAssistant((chat) => ({
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
      }), assistantMessage);

      return;
    }

    if (plannerState.step === "days") {
      const normalizedDays = normalizeDaysLabel(value);
      const assistantMessage = createHomeChatMessage(
        "assistant",
        buildTravelersQuestion(normalizedDays)
      );

      await replaceCurrentChatWithAssistant((chat) => ({
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
      }), assistantMessage);

      return;
    }

    if (plannerState.step === "travelers") {
      const normalizedTravelers = normalizeTravelersLabel(value);
      const assistantMessage = createHomeChatMessage(
        "assistant",
        buildTransportQuestion(normalizedTravelers)
      );

      await replaceCurrentChatWithAssistant((chat) => ({
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
      }), assistantMessage);

      return;
    }

    if (plannerState.step === "transport") {
      const assistantMessage = createHomeChatMessage(
        "assistant",
        buildTimingQuestion(value)
      );

      await replaceCurrentChatWithAssistant((chat) => ({
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
      }), assistantMessage);

      return;
    }

    if (plannerState.step === "timing") {
      const assistantMessage = createHomeChatMessage(
        "assistant",
        buildDestinationQuestion(profile, value, plannerState.travelers)
      );

      await replaceCurrentChatWithAssistant((chat) => ({
        ...chat,
        updatedAtMs: Date.now(),
        state: {
          ...chat.state,
          timing: value,
          followUpMessages: [],
          latestPlan: null,
          messages: [...messagesAfterUser, assistantMessage],
          step: "destination",
        },
      }), assistantMessage);

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

      await replaceCurrentChatWithAssistant((chat) => ({
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
      }), searchingMessage);

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

        await replaceCurrentChatWithAssistant((chat) => ({
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
        }), readyMessage);
      } catch (nextError) {
        const message = getHomePlannerErrorMessage(nextError);
        const errorMessage = createHomeChatMessage("assistant", message);
        setError(message);

        await replaceCurrentChatWithAssistant((chat) => ({
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
        }), errorMessage);
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
      setBookingProgress(0.14);
      setBookingProgressLabel("Подготвяме Stripe test checkout...");

      await user.getIdToken(true);
      await wait(300);

      const amountCents =
        bookingEstimate.totalEstimate !== null
          ? Math.max(bookingEstimate.totalEstimate, 1) * 100
          : 100;
      const stripeReturnUrls = buildStripeCheckoutReturnUrls("booking");
      const checkoutSession = await createTestCheckoutSession({
        amountCents,
        cancelUrl: stripeReturnUrls.cancelUrl,
        contactEmail: trimmedEmail,
        contactName: trimmedName,
        currency: "eur",
        description: `${latestPlan.plan.title} • ${latestPlan.destination}`,
        destination: latestPlan.destination,
        paymentMethod: bookingForm.paymentMethod,
        successUrl: stripeReturnUrls.successUrl,
        userId: user.uid,
      });

      savePendingStripeCheckout({
        budget: latestPlan.budget,
        contactEmail: trimmedEmail,
        contactName: trimmedName,
        createdAtMs: Date.now(),
        days: latestPlan.days,
        destination: latestPlan.destination,
        note: bookingForm.note,
        paymentMethod: bookingForm.paymentMethod,
        stay: selectedStay,
        timing: latestPlan.timing,
        title: latestPlan.plan.title,
        totalLabel: bookingEstimate.totalLabel,
        transport: selectedTransport,
        travelers: latestPlan.travelers,
      });

      setBookingProgress(0.36);
      setBookingProgressLabel("Отваряме Stripe Checkout...");

      if (Platform.OS === "web" && typeof window !== "undefined") {
        setBookingProgress(0.52);
        setBookingProgressLabel("Пренасочваме към Stripe Checkout...");
        window.location.assign(checkoutSession.checkoutUrl);
        return;
      }

      const checkoutResult = await WebBrowser.openAuthSessionAsync(
        checkoutSession.checkoutUrl,
        stripeReturnUrls.returnTargetUrl
      );

      if (checkoutResult.type !== "success" || !checkoutResult.url) {
        throw new Error("stripe-checkout-cancelled");
      }

      const checkoutState = parseCheckoutReturnState(checkoutResult.url);

      if (checkoutState.checkout !== "success" || !checkoutState.sessionId) {
        throw new Error("stripe-checkout-incomplete");
      }

      router.replace({
        pathname: "/payment-return",
        params: {
          checkout: checkoutState.checkout,
          kind: "booking",
          session_id: checkoutState.sessionId,
        },
      });
      return;
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "";
      const errorCode =
        nextError &&
        typeof nextError === "object" &&
        "code" in nextError &&
        typeof nextError.code === "string"
          ? nextError.code
          : "";
      const errorDetails =
        nextError &&
        typeof nextError === "object" &&
        "details" in nextError &&
        typeof nextError.details === "string"
          ? nextError.details
          : "";
      console.warn("Booking checkout/save failed", nextError);

      setBookingStage("form");
      setBookingProgress(0);
      setBookingProgressLabel("");

      if (message.includes("functions/not-found") || errorCode === "functions/not-found") {
        setBookingError(
          "Липсват Stripe checkout Firebase функциите. Deploy-ни backend-а и опитай пак."
        );
      } else if (message.includes("stripe-test-mode-disabled")) {
        setBookingError(
          "Stripe test mode е изключен. Задай EXPO_PUBLIC_TEST_PAYMENTS_MODE=functions и рестартирай app-а."
        );
      } else if (
        message.includes("Failed to fetch") ||
        message.includes("functions/unavailable") ||
        errorCode === "functions/unavailable"
      ) {
        setBookingError(
          "Stripe Functions emulator не е стартиран. Пусни `npm run payments:emulator` и опитай пак."
        );
      } else if (message.includes("stripe-checkout-cancelled")) {
        setBookingError("Плащането беше прекъснато преди потвърждение.");
      } else if (
        message.includes("stripe-checkout-incomplete") ||
        message.includes("stripe-session-not-paid")
      ) {
        setBookingError(
          "Stripe Checkout не върна потвърдено test плащане. Опитай отново."
        );
      } else if (
        message.includes("functions/failed-precondition") ||
        errorCode === "functions/failed-precondition" ||
        message.includes("STRIPE_SECRET_KEY") ||
        errorDetails.includes("STRIPE_SECRET_KEY")
      ) {
        setBookingError(
          "Липсва Stripe test secret key във Firebase Functions. Добави STRIPE_SECRET_KEY и deploy-ни функциите."
        );
      } else if (
        message.includes("functions/internal") ||
        errorCode === "functions/internal" ||
        message === "internal"
      ) {
        setBookingError(
          errorDetails ||
            "Stripe backend върна internal грешка. Ако си локално, пусни `npm run payments:emulator`. Ако си на production, трябва deploy на Firebase Functions."
        );
      } else {
        const fallbackMessage = getFirestoreUserMessage(nextError, "write");

        if (fallbackMessage === "Не успяхме да запазим профила. Опитай отново.") {
          setBookingError(
            message
              ? `Не успяхме да запазим резервацията. ${message}`
              : "Не успяхме да запазим резервацията. Опитай отново."
          );
        } else {
          setBookingError(fallbackMessage.replace("профила", "резервацията"));
        }
      }
    } finally {
      setBookingProcessing(false);
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
      <SafeAreaView
        style={[styles.loader, { backgroundColor: colors.screen }]}
        edges={["top", "left", "right"]}
      >
        <ActivityIndicator size="large" color="#5C8C1F" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: colors.screen }]}
      edges={["top", "left", "right"]}
    >
      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 8 : 0}
      >
      <View style={[styles.shell, { backgroundColor: colors.screen }]}>
        <View
          style={[
            styles.layout,
            !isWideLayout && styles.layoutStacked,
          ]}
        >
          <View style={styles.main}>
            <View
              style={[
                styles.plannerTopBar,
                isPhoneLayout && styles.plannerTopBarPhone,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => setChatMenuVisible(true)}
                style={[
                  styles.plannerMenuButton,
                  { backgroundColor: colors.cardAlt, borderColor: colors.border },
                ]}
              >
                <MaterialIcons color={colors.textPrimary} name="menu" size={26} />
              </TouchableOpacity>
              <View style={styles.plannerTopBarTextWrap}>
                <Text style={[styles.plannerTopBarTitle, { color: colors.textPrimary }]}>
                  AI Planner
                </Text>
                <Text
                  numberOfLines={1}
                  style={[styles.plannerTopBarMeta, { color: colors.textSecondary }]}
                >
                  {currentChat?.title ?? "Последен чат"}
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.chatCard,
                isPhoneLayout && styles.chatCardPhone,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
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
                ref={messagesScrollRef}
                style={[styles.messagesContainer, isPhoneLayout && styles.messagesContainerPhone]}
                contentContainerStyle={[
                  styles.messagesContent,
                  isPhoneLayout && styles.messagesContentPhone,
                ]}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
                onScroll={handleMessagesScroll}
                scrollEventThrottle={16}
                onContentSizeChange={() => {
                  if (isKeyboardOpen || !showScrollToBottom) {
                    scrollMessagesToBottom(false);
                  }
                }}
              >
                {currentPlannerState.messages.map((message) => (
                  <View
                    key={message.id}
                    style={[
                      styles.messageBubble,
                      isPhoneLayout && styles.messageBubblePhone,
                      isPhoneLayout &&
                        (message.role === "assistant"
                          ? styles.assistantBubblePhone
                          : styles.userBubblePhone),
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
                      text={getDisplayedMessageText(message)}
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
                  <View
                    style={[
                      styles.messageBubble,
                      isPhoneLayout && styles.messageBubblePhone,
                      isPhoneLayout && styles.assistantBubblePhone,
                      styles.assistantBubble,
                    ]}
                  >
                    <Text style={styles.messageRoleLabel}>AI Planner</Text>
                    <Text style={styles.assistantMessageText}>
                      Търся най-добрите цени за transport и stay...
                    </Text>
                  </View>
                ) : null}

                {error ? <Text style={styles.errorText}>{error}</Text> : null}

                {latestPlan ? (
                  <View style={[styles.planCard, isPhoneLayout && styles.planCardPhone]}>
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

              {showScrollToBottom ? (
                <TouchableOpacity
                  style={[
                    styles.scrollToBottomButton,
                    isPhoneLayout && styles.scrollToBottomButtonPhone,
                    { bottom: scrollToBottomOffset },
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
                  { backgroundColor: colors.card, borderColor: colors.border },
                  isPhoneLayout && { marginBottom: phoneComposerBottomMargin },
                ]}
              >
                <TextInput
                  style={[
                    styles.input,
                    isPhoneLayout && styles.inputPhone,
                    {
                      backgroundColor: colors.inputBackground,
                      borderColor: colors.inputBorder,
                      color: colors.textPrimary,
                    },
                  ]}
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
                  placeholderTextColor={colors.inputPlaceholder}
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

        <Modal
          visible={chatMenuVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setChatMenuVisible(false)}
        >
          <SafeAreaView
            style={[styles.historyMenuBackdrop, { backgroundColor: colors.modalOverlay }]}
            edges={["top", "bottom", "left"]}
          >
            <View
              style={[
                styles.historyMenuCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={styles.historyMenuHeader}>
                <View>
                  <Text style={[styles.historyMenuTitle, { color: colors.textPrimary }]}>AI Chats</Text>
                  <Text style={[styles.historyMenuSubtitle, { color: colors.textSecondary }]}>
                    {homeStore.chats.length} запазени chat-а
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.historyMenuClose, { backgroundColor: colors.cardAlt }]}
                  onPress={() => setChatMenuVisible(false)}
                  activeOpacity={0.9}
                >
                  <MaterialIcons name="close" size={22} color={colors.textPrimary} />
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
            <TouchableOpacity
              activeOpacity={1}
              onPress={() => setChatMenuVisible(false)}
              style={styles.historyMenuDismissArea}
            />
          </SafeAreaView>
        </Modal>

        <Modal
          visible={bookingModalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeBookingModal}
      >
        <View style={[styles.bookingModalOverlay, { backgroundColor: colors.modalOverlay }]}>
          <View
            style={[
              styles.bookingModalCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
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
    marginBottom: 12,
    minHeight: 54,
  },
  plannerTopBarPhone: {
    marginBottom: 10,
  },
  plannerTopBarTextWrap: {
    flex: 1,
    paddingLeft: 12,
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
    flexDirection: "row",
    paddingBottom: 16,
    paddingRight: 16,
  },
  historyMenuDismissArea: {
    flex: 1,
  },
  historyMenuCard: {
    backgroundColor: "#FAFCF5",
    borderColor: "#DDE8C7",
    borderBottomRightRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    height: "100%",
    maxWidth: 380,
    padding: 16,
    shadowColor: "#1E2A12",
    shadowOffset: { width: 10, height: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    width: "82%",
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
    paddingBottom: 8,
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
  messagesContentPhone: {
    paddingBottom: 26,
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
    maxWidth: "96%",
  },
  assistantBubblePhone: {
    marginRight: 10,
  },
  userBubblePhone: {
    marginLeft: 10,
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
  planCardPhone: {
    borderRadius: 20,
    padding: 14,
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
    flexShrink: 1,
    flexWrap: "wrap",
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
  keyboardWrap: {
    flex: 1,
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
});
