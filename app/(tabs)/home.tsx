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
import {
  FontWeight,
  Layout,
  Radius,
  Spacing,
  TypeScale,
  shadow,
} from "../../constants/design-system";
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
  const keyboardHeightRef = useRef(0);

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
      keyboardHeightRef.current = event?.endCoordinates?.height ?? 0;
      scrollMessagesToBottom(true);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setIsKeyboardOpen(false);
      keyboardHeightRef.current = 0;
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
                placeholderTextColor="#9CA3AF"
              />
              <View style={styles.renameActions}>
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={() => {
                    void handleSaveRename();
                  }}
                  activeOpacity={0.9}
                >
                  <MaterialIcons name="check" size={18} color="#2D6A4F" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={() => {
                    setRenamingChatId(null);
                    setRenameValue("");
                  }}
                  activeOpacity={0.9}
                >
                  <MaterialIcons name="close" size={18} color="#DC3545" />
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
                    <MaterialIcons name="push-pin" size={16} color="#92400E" />
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
                  <MaterialIcons name="edit" size={16} color="#6B7280" />
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
                    color="#6B7280"
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={() => setPendingDeleteChat(chat)}
                  activeOpacity={0.9}
                >
                  <MaterialIcons name="delete-outline" size={16} color="#DC3545" />
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
        <ActivityIndicator size="large" color="#2D6A4F" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: colors.screen }]}
      edges={["top", "left", "right"]}
    >
      <KeyboardAvoidingView
        style={styles.flex1}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 8 : 0}
      >
      <View style={styles.chatShell}>
            <View
              style={[
                styles.header,
                { borderBottomColor: colors.border },
              ]}
            >
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setChatMenuVisible(true)}
                style={[
                  styles.headerIconBtn,
                  { backgroundColor: colors.cardAlt, borderColor: colors.border },
                ]}
              >
                <MaterialIcons color={colors.textPrimary} name="menu" size={22} />
              </TouchableOpacity>
              <View style={styles.headerCenter}>
                <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
                  AI Planner
                </Text>
                <Text
                  numberOfLines={1}
                  style={[styles.headerSub, { color: colors.textSecondary }]}
                >
                  {currentChat?.title ?? "Последен чат"}
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => {
                  void handleCreateChat();
                }}
                style={[
                  styles.headerIconBtn,
                  { backgroundColor: colors.accent },
                ]}
              >
                <MaterialIcons color={colors.buttonTextOnAction} name="add" size={22} />
              </TouchableOpacity>
            </View>

            <View style={styles.chatArea}>
              {[currentPlannerState.budget,
                currentPlannerState.days,
                currentPlannerState.travelers,
                currentPlannerState.transportPreference,
                currentPlannerState.timing,
                currentPlannerState.destination,
              ].filter(Boolean).length > 0 ? (
                <View style={[styles.contextStrip, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
                  <Text style={[styles.contextStripTitle, { color: colors.textMuted }]}>Current plan</Text>
                  <View style={styles.profileMetaRow}>
                    {currentPlannerState.budget ? (
                      <View style={[styles.profileMetaChip, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}>
                        <Text
                          style={[
                            styles.profileMetaChipText,
                            { color: colors.textPrimary },
                          ]}
                        >
                          {currentPlannerState.budget}
                        </Text>
                      </View>
                    ) : null}
                    {currentPlannerState.days ? (
                      <View style={[styles.profileMetaChip, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}>
                        <Text
                          style={[
                            styles.profileMetaChipText,
                            { color: colors.textPrimary },
                          ]}
                        >
                          {currentPlannerState.days}
                        </Text>
                      </View>
                    ) : null}
                    {currentPlannerState.travelers ? (
                      <View style={[styles.profileMetaChip, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}>
                        <Text
                          style={[
                            styles.profileMetaChipText,
                            { color: colors.textPrimary },
                          ]}
                        >
                          {currentPlannerState.travelers}
                        </Text>
                      </View>
                    ) : null}
                    {currentPlannerState.transportPreference ? (
                      <View style={[styles.profileMetaChip, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}>
                        <Text
                          style={[
                            styles.profileMetaChipText,
                            { color: colors.textPrimary },
                          ]}
                        >
                          {currentPlannerState.transportPreference}
                        </Text>
                      </View>
                    ) : null}
                    {currentPlannerState.timing ? (
                      <View style={[styles.profileMetaChip, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}>
                        <Text
                          style={[
                            styles.profileMetaChipText,
                            { color: colors.textPrimary },
                          ]}
                        >
                          {currentPlannerState.timing}
                        </Text>
                      </View>
                    ) : null}
                    {currentPlannerState.destination ? (
                      <View style={[styles.profileMetaChip, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}>
                        <Text
                          style={[
                            styles.profileMetaChipText,
                            { color: colors.textPrimary },
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
                style={styles.messagesContainer}
                contentContainerStyle={styles.messagesContent}
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
                      message.role === "assistant"
                        ? [styles.assistantBubble, { backgroundColor: colors.cardAlt }]
                        : [styles.userBubble, { backgroundColor: colors.accent }],
                    ]}
                  >
                    <Text
                      style={[
                        styles.messageRoleLabel,
                        { color: message.role === "assistant" ? colors.textMuted : "rgba(255,255,255,0.7)" },
                      ]}
                    >
                      {message.role === "assistant" ? "AI Planner" : "You"}
                    </Text>
                    <FormattedMessageText
                      text={getDisplayedMessageText(message)}
                      textStyle={[
                        styles.messageText,
                        message.role === "assistant"
                          ? [styles.assistantMessageText, { color: colors.textPrimary }]
                          : styles.userMessageText,
                      ]}
                    />
                  </View>
                ))}

                {followUpMessages.map((message) => (
                  <View
                    key={message.id}
                    style={[
                      styles.messageBubble,
                      message.role === "assistant"
                        ? [styles.assistantBubble, { backgroundColor: colors.cardAlt }]
                        : [styles.userBubble, { backgroundColor: colors.accent }],
                    ]}
                  >
                    <Text
                      style={[
                        styles.messageRoleLabel,
                        { color: message.role === "assistant" ? colors.textMuted : "rgba(255,255,255,0.7)" },
                      ]}
                    >
                      {message.role === "assistant" ? "AI Planner" : "You"}
                    </Text>
                    <FormattedMessageText
                      text={getDisplayedMessageText(message)}
                      textStyle={[
                        styles.messageText,
                        message.role === "assistant"
                          ? [styles.assistantMessageText, { color: colors.textPrimary }]
                          : styles.userMessageText,
                      ]}
                    />
                  </View>
                ))}

                {!latestPlan && planning ? (
                  <View
                    style={[
                      styles.messageBubble,
                      styles.assistantBubble,
                      { backgroundColor: colors.cardAlt },
                    ]}
                  >
                    <Text style={[styles.messageRoleLabel, { color: colors.textMuted }]}>AI Planner</Text>
                    <View style={styles.typingRow}>
                      <ActivityIndicator size="small" color={colors.accent} style={{ marginRight: 8 }} />
                      <Text style={[styles.assistantMessageText, { color: colors.textPrimary }]}>
                        Търся най-добрите цени...
                      </Text>
                    </View>
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
                          <MaterialIcons name="map" size={24} color="#92400E" />
                        </View>
                      ) : null}
                    </View>

                    <Text style={styles.planSummary}>{latestPlan.plan.summary}</Text>

                    {latestPlan.plan.budgetNote ? (
                      <View style={styles.budgetNotePill}>
                        <MaterialIcons name="euro" size={16} color="#92400E" />
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
                                color="#2D6A4F"
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
                                <MaterialIcons name="open-in-new" size={16} color="#1A1A1A" />
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
                                <MaterialIcons name="open-in-new" size={16} color="#1A1A1A" />
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
                  style={styles.scrollToBottomButton}
                  onPress={() => {
                    scrollMessagesToBottom(true);
                  }}
                  activeOpacity={0.9}
                >
                  <MaterialIcons name="keyboard-double-arrow-down" size={20} color={colors.buttonTextOnAction} />
                </TouchableOpacity>
              ) : null}

              {quickReplies.length > 0 ? (
                <View style={styles.quickRepliesSection}>
                  <Text style={[styles.quickRepliesTitle, { color: colors.textMuted }]}>
                    {getStepTitle(currentPlannerState.step)}
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.quickRepliesRow}
                    keyboardShouldPersistTaps="handled"
                  >
                    {quickReplies.map((reply) => (
                      <TouchableOpacity
                        key={reply}
                        style={[
                          styles.quickReplyChip,
                          { borderColor: colors.inputBorder, backgroundColor: colors.cardAlt },
                        ]}
                        onPress={() => {
                          void sendPlannerMessage(reply);
                        }}
                        disabled={planning}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.quickReplyText, { color: colors.textPrimary }]}>{reply}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              ) : null}

              <View
                style={[
                  styles.composer,
                  { backgroundColor: colors.screen, borderTopColor: colors.border },
                  { paddingBottom: Math.max(insets.bottom, 8) },
                ]}
              >
                <View
                  style={[
                    styles.composerInputRow,
                    { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder },
                  ]}
                >
                  <TextInput
                    style={[
                      styles.input,
                      { color: colors.textPrimary },
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
                                  : "Напиши съобщение..."
                    }
                    placeholderTextColor={colors.inputPlaceholder}
                    value={chatInput}
                    onChangeText={setChatInput}
                    editable={currentPlannerState.step !== "done" && !planning}
                    multiline
                  />
                  <TouchableOpacity
                    style={[
                      styles.sendButton,
                      { backgroundColor: canSend ? colors.accent : colors.disabledBackground },
                    ]}
                    onPress={() => {
                      void sendPlannerMessage(chatInput);
                    }}
                    disabled={!canSend}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons
                      name="arrow-upward"
                      size={20}
                      color={canSend ? colors.buttonTextOnAction : colors.disabledText}
                    />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={styles.resetButton}
                  onPress={() => {
                    void resetConversation();
                  }}
                  disabled={planning}
                  activeOpacity={0.7}
                >
                  <MaterialIcons name="refresh" size={14} color={colors.textMuted} />
                  <Text style={[styles.resetButtonText, { color: colors.textMuted }]}>Нов план</Text>
                </TouchableOpacity>
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
                <MaterialIcons name="close" size={20} color="#1A1A1A" />
              </TouchableOpacity>
            </View>

            <View style={styles.phoneDrawerSearchWrap}>
              <MaterialIcons name="search" size={18} color="#9CA3AF" />
              <TextInput
                style={styles.phoneDrawerSearchInput}
                value={chatSearch}
                onChangeText={setChatSearch}
                placeholder="Search chats"
                placeholderTextColor="#9CA3AF"
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
                            placeholderTextColor="#9CA3AF"
                          />
                          <View style={styles.renameActions}>
                            <TouchableOpacity
                              style={styles.iconButton}
                              onPress={() => {
                                void handleSaveRename();
                              }}
                              activeOpacity={0.9}
                            >
                              <MaterialIcons name="check" size={18} color="#2D6A4F" />
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.iconButton}
                              onPress={() => {
                                setRenamingChatId(null);
                                setRenameValue("");
                              }}
                              activeOpacity={0.9}
                            >
                              <MaterialIcons name="close" size={18} color="#DC3545" />
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
                                <MaterialIcons name="push-pin" size={16} color="#92400E" />
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
                              <MaterialIcons name="edit" size={16} color="#6B7280" />
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
                                color="#6B7280"
                              />
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.iconButton}
                              onPress={() => {
                                void handleDeleteChat(chat.id);
                              }}
                              activeOpacity={0.9}
                            >
                              <MaterialIcons name="delete-outline" size={16} color="#DC3545" />
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
                  <MaterialIcons name="close" size={18} color="#1A1A1A" />
                </TouchableOpacity>
              </View>

              {bookingStage === "processing" ? (
                <View style={styles.checkoutProcessingCard}>
                  <View style={styles.checkoutProcessingIcon}>
                    <MaterialIcons
                      name={getPaymentMethodIcon(bookingForm.paymentMethod)}
                      size={34}
                      color="#1A1A1A"
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
                  placeholderTextColor="#9CA3AF"
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
                  placeholderTextColor="#9CA3AF"
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
                  placeholderTextColor="#9CA3AF"
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
  },
  flex1: {
    flex: 1,
  },
  chatShell: {
    flex: 1,
    width: "100%",
    maxWidth: 860,
    alignSelf: "center",
  },
  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  sidebar: {
    width: 290,
    backgroundColor: "#FFFFFF",
    borderRadius: Radius["3xl"],
    borderWidth: 1,
    borderColor: "#E8E8E8",
    padding: Spacing.lg,
    marginRight: Spacing.md,
  },
  sidebarStacked: {
    width: "100%",
    marginRight: 0,
    marginBottom: Spacing.md,
  },
  sidebarPhone: {
    backgroundColor: "transparent",
    borderWidth: 0,
    padding: 0,
    marginBottom: Spacing.sm,
  },
  sidebarHeader: {
    marginBottom: Spacing.md,
  },
  sidebarHeaderPhone: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  sidebarTitle: {
    color: "#1A1A1A",
    ...TypeScale.headingSm,
    fontWeight: FontWeight.extrabold,
    marginBottom: Spacing.sm,
  },
  sidebarTitlePhone: {
    ...TypeScale.titleMd,
    marginBottom: 0,
  },
  newChatButton: {
    backgroundColor: "#2D6A4F",
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  newChatButtonPhone: {
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  newChatButtonText: {
    color: "#FFFFFF",
    fontWeight: FontWeight.extrabold,
    marginLeft: Spacing.xs,
  },
  newChatButtonTextPhone: {
    ...TypeScale.bodyMd,
  },
  sidebarList: {
    flex: 1,
  },
  sidebarListContent: {
    paddingBottom: Spacing.md,
  },
  chatListItem: {
    backgroundColor: "#F5F5F5",
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "#E8E8E8",
    marginBottom: Spacing.sm,
  },
  chatListItemStacked: {
    width: 250,
    marginRight: Spacing.sm,
  },
  chatListItemPhone: {
    width: 210,
    padding: Spacing.sm,
  },
  chatListItemActive: {
    backgroundColor: "#E5E7EB",
    borderColor: "#D1D5DB",
  },
  chatTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.xs,
  },
  chatItemTitle: {
    color: "#1A1A1A",
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.extrabold,
    flex: 1,
    paddingRight: Spacing.sm,
  },
  chatItemMeta: {
    color: "#9CA3AF",
    ...TypeScale.labelMd,
    marginBottom: Spacing.sm,
  },
  chatItemActions: {
    flexDirection: "row",
  },
  iconButton: {
    width: 30,
    height: 30,
    borderRadius: Radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    marginRight: Spacing.sm,
  },
  renameWrap: {
    width: "100%",
  },
  renameInput: {
    backgroundColor: "#FFFFFF",
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: "#1A1A1A",
    borderWidth: 1,
    borderColor: "#E8E8E8",
    marginBottom: Spacing.sm,
  },
  renameActions: {
    flexDirection: "row",
  },
  main: {
    flex: 1,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  headerIconBtn: {
    alignItems: "center",
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: "transparent",
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: Spacing.md,
  },
  headerTitle: {
    ...TypeScale.titleMd,
    fontWeight: FontWeight.bold,
  },
  headerSub: {
    ...TypeScale.labelMd,
    marginTop: 2,
  },
  chatArea: {
    flex: 1,
  },
  historyMenuBackdrop: {
    backgroundColor: "rgba(0,0,0,0.15)",
    flex: 1,
    flexDirection: "row",
    paddingBottom: Spacing.lg,
    paddingRight: Spacing.lg,
  },
  historyMenuDismissArea: {
    flex: 1,
  },
  historyMenuCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E8E8E8",
    borderBottomRightRadius: Radius["3xl"],
    borderTopRightRadius: Radius["3xl"],
    borderWidth: 1,
    height: "100%",
    maxWidth: 380,
    padding: Spacing.lg,
    ...shadow("xl"),
    width: "82%",
  },
  historyMenuHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  historyMenuTitle: {
    color: "#1A1A1A",
    ...TypeScale.headingMd,
    fontWeight: FontWeight.extrabold,
  },
  historyMenuSubtitle: {
    color: "#6B7280",
    ...TypeScale.bodySm,
    marginTop: Spacing.xs,
  },
  historyMenuClose: {
    alignItems: "center",
    backgroundColor: "#F5F5F5",
    borderRadius: Radius.full,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  historyMenuNewChatButton: {
    marginBottom: Spacing.md,
  },
  contextStrip: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  contextStripTitle: {
    ...TypeScale.labelSm,
    fontWeight: FontWeight.bold,
    textTransform: "uppercase",
    marginBottom: Spacing.xs,
    letterSpacing: 0.8,
  },
  hero: {
    backgroundColor: "#1A1A1A",
    borderRadius: Radius["3xl"],
    padding: Spacing.xl,
    marginBottom: Spacing.md,
    ...shadow("lg"),
  },
  heroTopRowPhone: {
    marginBottom: Spacing.sm,
  },
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.md,
  },
  heroTextWrap: {
    flex: 1,
    paddingRight: Spacing.md,
  },
  heroTextWrapPhone: {
    paddingRight: 0,
  },
  heroIconBadge: {
    width: 52,
    height: 52,
    borderRadius: Radius.lg,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  kicker: {
    color: "#9CA3AF",
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  title: {
    color: "#FFFFFF",
    ...TypeScale.displayMd,
    marginBottom: Spacing.sm,
  },
  titlePhone: {
    ...TypeScale.titleLg,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    color: "rgba(255,255,255,0.7)",
    ...TypeScale.bodyMd,
  },
  subtitlePhone: {
    ...TypeScale.bodySm,
  },
  profileMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  profileMetaChip: {
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    marginRight: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  profileMetaChipText: {
    ...TypeScale.labelSm,
    fontWeight: FontWeight.semibold,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing["2xl"],
  },
  messageBubble: {
    borderRadius: 20,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.sm,
    maxWidth: "88%",
  },
  assistantBubble: {
    alignSelf: "flex-start",
    borderTopLeftRadius: 4,
  },
  userBubble: {
    alignSelf: "flex-end",
    borderTopRightRadius: 4,
  },
  messageRoleLabel: {
    ...TypeScale.labelSm,
    fontWeight: FontWeight.semibold,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  messageText: {
    ...TypeScale.bodyMd,
    lineHeight: 22,
  },
  assistantMessageText: {
    color: "#1A1A1A",
  },
  userMessageText: {
    color: "#FFFFFF",
  },
  typingRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  errorText: {
    color: "#DC3545",
    ...TypeScale.bodyMd,
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  planCard: {
    backgroundColor: "#FFFBF5",
    borderRadius: Radius["2xl"],
    borderWidth: 1,
    borderColor: "#E8E8E8",
    padding: Spacing.lg,
    marginTop: Spacing.xs,
  },
  planCardPhone: {
    borderRadius: Radius.xl,
    padding: Spacing.md,
  },
  planHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.sm,
  },
  planHeaderPhone: {
    marginBottom: Spacing.sm,
  },
  planHeaderTextWrap: {
    flex: 1,
    paddingRight: Spacing.sm,
  },
  planHeaderIcon: {
    width: 46,
    height: 46,
    borderRadius: Radius.lg,
    backgroundColor: "#FFF7ED",
    alignItems: "center",
    justifyContent: "center",
  },
  planTitle: {
    color: "#78350F",
    ...TypeScale.headingLg,
    fontWeight: FontWeight.extrabold,
    marginBottom: Spacing.xs,
  },
  planTitlePhone: {
    ...TypeScale.titleLg,
  },
  planMeta: {
    color: "#92400E",
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.xs,
  },
  planMetaSecondary: {
    color: "#B45309",
    ...TypeScale.bodySm,
    fontWeight: FontWeight.semibold,
  },
  planSummary: {
    color: "#78350F",
    ...TypeScale.titleSm,
    marginBottom: Spacing.md,
  },
  budgetNotePill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF7ED",
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  budgetNoteText: {
    color: "#92400E",
    ...TypeScale.bodySm,
    fontWeight: FontWeight.bold,
    marginLeft: Spacing.sm,
    flex: 1,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    color: "#1A1A1A",
    ...TypeScale.titleMd,
    fontWeight: FontWeight.extrabold,
    marginBottom: Spacing.sm,
  },
  optionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: Radius.xl,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "#E8E8E8",
    marginBottom: Spacing.sm,
  },
  optionTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  optionModeWrap: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    paddingRight: Spacing.sm,
  },
  optionModeText: {
    color: "#2D6A4F",
    ...TypeScale.bodySm,
    fontWeight: FontWeight.extrabold,
    marginLeft: Spacing.sm,
  },
  optionPrice: {
    color: "#92400E",
    ...TypeScale.bodySm,
    fontWeight: FontWeight.extrabold,
  },
  optionProvider: {
    color: "#1A1A1A",
    ...TypeScale.titleSm,
    fontWeight: FontWeight.extrabold,
    marginBottom: Spacing.xs,
    flexShrink: 1,
    flexWrap: "wrap",
  },
  optionRoute: {
    color: "#6B7280",
    ...TypeScale.bodyMd,
    marginBottom: Spacing.xs,
  },
  optionMeta: {
    color: "#9CA3AF",
    ...TypeScale.bodySm,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.xs,
  },
  optionNote: {
    color: "#6B7280",
    ...TypeScale.bodySm,
  },
  offerSourceText: {
    color: "#B45309",
    ...TypeScale.labelLg,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.xs,
  },
  optionActionsRow: {
    flexDirection: "row",
    marginTop: Spacing.md,
  },
  optionHalfButton: {
    flex: 1,
  },
  optionLinkButton: {
    backgroundColor: "#F5F5F5",
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    marginRight: Spacing.sm,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  optionLinkButtonText: {
    color: "#1A1A1A",
    ...TypeScale.bodySm,
    fontWeight: FontWeight.extrabold,
    marginLeft: Spacing.sm,
  },
  optionActionButton: {
    backgroundColor: "#1A1A1A",
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  optionActionButtonText: {
    color: "#FFFFFF",
    ...TypeScale.bodySm,
    fontWeight: FontWeight.extrabold,
    marginLeft: Spacing.sm,
  },
  dayCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: Radius.xl,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "#E8E8E8",
    marginBottom: Spacing.sm,
  },
  dayLabel: {
    color: "#92400E",
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: Spacing.xs,
  },
  dayTitle: {
    color: "#1A1A1A",
    ...TypeScale.titleMd,
    fontWeight: FontWeight.extrabold,
    marginBottom: Spacing.xs,
  },
  dayItem: {
    color: "#6B7280",
    ...TypeScale.bodyMd,
    marginBottom: Spacing.xs,
  },
  profileTipCard: {
    backgroundColor: "#F5F5F5",
    borderRadius: Radius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  profileTipTitle: {
    color: "#1A1A1A",
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.extrabold,
    marginBottom: Spacing.xs,
  },
  profileTipText: {
    color: "#6B7280",
    ...TypeScale.bodyMd,
  },
  saveSuccessText: {
    color: "#2D6A4F",
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.sm,
  },
  saveErrorText: {
    color: "#DC3545",
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.sm,
  },
  bookingSuccessText: {
    color: "#2D6A4F",
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.sm,
  },
  bookingErrorText: {
    color: "#DC3545",
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.sm,
  },
  savePlanButton: {
    backgroundColor: "#2D6A4F",
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  savePlanButtonText: {
    color: "#FFFFFF",
    fontWeight: FontWeight.extrabold,
  },
  savedPlanButton: {
    backgroundColor: "#E5E7EB",
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },
  savedPlanButtonText: {
    color: "#2D6A4F",
  },
  bookNowButton: {
    marginTop: Spacing.sm,
    backgroundColor: "#1A1A1A",
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  bookNowButtonText: {
    color: "#FFFFFF",
    fontWeight: FontWeight.extrabold,
    marginLeft: Spacing.sm,
  },
  quickRepliesSection: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  quickRepliesTitle: {
    ...TypeScale.labelSm,
    fontWeight: FontWeight.semibold,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: Spacing.xs,
  },
  quickRepliesRow: {
    paddingRight: Spacing.lg,
  },
  quickReplyChip: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginRight: Spacing.sm,
    borderWidth: 1,
  },
  quickReplyText: {
    ...TypeScale.bodySm,
    fontWeight: FontWeight.semibold,
  },
  composer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
  },
  composerInputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    borderRadius: Radius["2xl"],
    borderWidth: 1,
    paddingLeft: Spacing.lg,
    paddingRight: Spacing.xs,
    paddingVertical: Spacing.xs,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    ...TypeScale.bodyMd,
    textAlignVertical: "top",
    paddingTop: Platform.OS === "ios" ? 10 : 8,
    paddingBottom: Platform.OS === "ios" ? 10 : 8,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: Spacing.sm,
  },
  resetButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    paddingVertical: Spacing.sm,
  },
  resetButtonText: {
    ...TypeScale.labelSm,
    fontWeight: FontWeight.semibold,
    marginLeft: Spacing.xs,
  },
  bookingModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: Spacing.lg,
  },
  bookingModalCard: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    maxHeight: "92%",
    backgroundColor: "#FFFFFF",
    borderRadius: Radius["3xl"],
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: "#E8E8E8",
  },
  bookingModalContent: {
    paddingBottom: Spacing.xs,
  },
  bookingModalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: Spacing.lg,
  },
  bookingModalHeaderText: {
    flex: 1,
    paddingRight: Spacing.md,
  },
  bookingModalKicker: {
    color: "#2D6A4F",
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  bookingModalTitle: {
    color: "#1A1A1A",
    ...TypeScale.headingLg,
    fontWeight: FontWeight.extrabold,
    marginBottom: Spacing.sm,
  },
  bookingModalSubtitle: {
    color: "#6B7280",
    ...TypeScale.bodyMd,
  },
  bookingCloseButton: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: "#F5F5F5",
    alignItems: "center",
    justifyContent: "center",
  },
  bookingSection: {
    marginBottom: Spacing.lg,
  },
  bookingSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  bookingSectionTitle: {
    color: "#1A1A1A",
    ...TypeScale.titleSm,
    fontWeight: FontWeight.extrabold,
  },
  bookingSkipChip: {
    backgroundColor: "#F5F5F5",
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  bookingSkipChipSelected: {
    backgroundColor: "#1A1A1A",
    borderColor: "#1A1A1A",
  },
  bookingSkipChipText: {
    color: "#1A1A1A",
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
  },
  bookingSkipChipTextSelected: {
    color: "#FFFFFF",
  },
  bookingOptionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: "#E8E8E8",
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  bookingOptionCardSelected: {
    borderColor: "#2D6A4F",
    backgroundColor: "#F5F5F5",
  },
  bookingOptionTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.xs,
  },
  bookingOptionTitle: {
    color: "#1A1A1A",
    ...TypeScale.titleSm,
    fontWeight: FontWeight.extrabold,
    flex: 1,
    paddingRight: Spacing.sm,
  },
  bookingOptionPrice: {
    color: "#92400E",
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.extrabold,
  },
  bookingOptionMeta: {
    color: "#6B7280",
    ...TypeScale.bodySm,
    marginBottom: Spacing.xs,
  },
  bookingOptionNote: {
    color: "#9CA3AF",
    ...TypeScale.bodySm,
  },
  bookingInput: {
    backgroundColor: "#FFFFFF",
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: "#E8E8E8",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    color: "#1A1A1A",
    ...TypeScale.bodyMd,
    marginBottom: Spacing.sm,
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
    backgroundColor: "#F5F5F5",
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginRight: Spacing.sm,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  paymentMethodChipSelected: {
    backgroundColor: "#2D6A4F",
    borderColor: "#2D6A4F",
  },
  paymentMethodChipText: {
    color: "#1A1A1A",
    ...TypeScale.bodySm,
    fontWeight: FontWeight.bold,
  },
  paymentMethodChipTextSelected: {
    color: "#FFFFFF",
  },
  bookingSummaryCard: {
    backgroundColor: "#FFFBEB",
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: "#FCD34D",
    marginBottom: Spacing.lg,
  },
  bookingSummaryTitle: {
    color: "#92400E",
    ...TypeScale.titleSm,
    fontWeight: FontWeight.extrabold,
    marginBottom: Spacing.sm,
  },
  bookingSummaryLine: {
    color: "#92400E",
    ...TypeScale.bodyMd,
    marginBottom: Spacing.xs,
  },
  bookingSummaryTotal: {
    color: "#78350F",
    ...TypeScale.headingLg,
    fontWeight: FontWeight.extrabold,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  bookingSummaryHint: {
    color: "#B45309",
    ...TypeScale.labelMd,
  },
  checkoutProcessingCard: {
    backgroundColor: "#F8F8F8",
    borderRadius: Radius["2xl"],
    borderWidth: 1,
    borderColor: "#E8E8E8",
    padding: Spacing.xl,
  },
  checkoutProcessingIcon: {
    width: 72,
    height: 72,
    borderRadius: Radius["2xl"],
    backgroundColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
    alignSelf: "center",
  },
  checkoutProcessingTitle: {
    color: "#1A1A1A",
    ...TypeScale.headingMd,
    fontWeight: FontWeight.extrabold,
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  checkoutProcessingSubtitle: {
    color: "#6B7280",
    ...TypeScale.bodyMd,
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  checkoutProgressTrack: {
    height: Spacing.md,
    borderRadius: Radius.full,
    backgroundColor: "#E5E7EB",
    overflow: "hidden",
    marginBottom: Spacing.lg,
  },
  checkoutProgressFill: {
    height: "100%",
    borderRadius: Radius.full,
    backgroundColor: "#2D6A4F",
  },
  checkoutProcessingSteps: {
    backgroundColor: "#FFFFFF",
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: "#E8E8E8",
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  checkoutProcessingStep: {
    color: "#6B7280",
    ...TypeScale.bodyMd,
    marginBottom: Spacing.xs,
  },
  checkoutSuccessCard: {
    backgroundColor: "#F8F8F8",
    borderRadius: Radius["2xl"],
    borderWidth: 1,
    borderColor: "#E8E8E8",
    padding: Spacing.xl,
    alignItems: "center",
  },
  checkoutSuccessBadge: {
    width: 74,
    height: 74,
    borderRadius: Radius["2xl"],
    backgroundColor: "#2D6A4F",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  checkoutSuccessTitle: {
    color: "#1A1A1A",
    ...TypeScale.headingLg,
    fontWeight: FontWeight.extrabold,
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  checkoutSuccessSubtitle: {
    color: "#6B7280",
    ...TypeScale.bodyMd,
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  checkoutReceiptCard: {
    width: "100%",
    backgroundColor: "#FFFBEB",
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: "#FCD34D",
    marginBottom: Spacing.lg,
  },
  checkoutReceiptKicker: {
    color: "#92400E",
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  checkoutReceiptLine: {
    color: "#78350F",
    ...TypeScale.bodyMd,
    marginBottom: Spacing.xs,
  },
  checkoutReceiptTotal: {
    color: "#78350F",
    ...TypeScale.headingLg,
    fontWeight: FontWeight.extrabold,
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  checkoutReceiptRef: {
    color: "#B45309",
    ...TypeScale.labelMd,
  },
  bookingPayButton: {
    backgroundColor: "#1A1A1A",
    borderRadius: Radius.lg,
    paddingVertical: Spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  bookingPayButtonText: {
    color: "#FFFFFF",
    ...TypeScale.titleSm,
    fontWeight: FontWeight.extrabold,
    marginLeft: Spacing.sm,
  },
  disabledButton: {
    opacity: 0.55,
  },
  chatListItemPhoneMenu: {
    width: "100%",
    padding: Spacing.sm,
  },
  phoneDrawerOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
    elevation: 20,
  },
  phoneDrawerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  phoneDrawerPanel: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "#FFFFFF",
    borderTopRightRadius: Radius["2xl"],
    borderBottomRightRadius: Radius["2xl"],
    borderRightWidth: 1,
    borderColor: "#E8E8E8",
    paddingHorizontal: Spacing.md,
    ...shadow("xl"),
  },
  phoneDrawerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  phoneDrawerBrand: {
    color: "#1A1A1A",
    ...TypeScale.headingMd,
    fontWeight: FontWeight.black,
  },
  phoneDrawerCloseButton: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F5F5F5",
    borderWidth: 1,
    borderColor: "#E8E8E8",
  },
  phoneDrawerSearchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F5F5F5",
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: "#E8E8E8",
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  phoneDrawerSearchInput: {
    flex: 1,
    minHeight: Layout.touchTarget,
    marginLeft: Spacing.sm,
    color: "#1A1A1A",
  },
  phoneDrawerList: {
    flex: 1,
  },
  phoneDrawerListContent: {
    paddingBottom: Spacing.sm,
  },
  emptyChatSearchState: {
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: "#F5F5F5",
    borderWidth: 1,
    borderColor: "#E8E8E8",
  },
  emptyChatSearchText: {
    color: "#9CA3AF",
    ...TypeScale.bodyMd,
    textAlign: "center",
  },
  scrollToBottomButton: {
    position: "absolute",
    right: Spacing.lg,
    bottom: Spacing.lg,
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: "#2D6A4F",
    alignItems: "center",
    justifyContent: "center",
    ...shadow("md"),
  },
  messageTextBold: {
    fontWeight: FontWeight.extrabold,
  },
  messageParagraph: {
    marginBottom: Spacing.xs,
  },
  messageBulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: Spacing.xs,
  },
  messageBulletMark: {
    width: Spacing.lg,
    fontWeight: FontWeight.extrabold,
  },
  messageBulletText: {
    flex: 1,
  },
  messageSpacer: {
    height: Spacing.sm,
  },
});
