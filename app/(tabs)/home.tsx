import { MaterialIcons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
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
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppLanguage } from "../../components/app-language-provider";
import { useAppTheme } from "../../components/app-theme-provider";
import { DismissKeyboard } from "../../components/dismiss-keyboard";
import {
  FontWeight,
  Radius,
  Spacing,
  TypeScale,
  shadow,
} from "../../constants/design-system";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { auth, db } from "../../firebase";
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
} from "../../utils/home-chat-storage";
import {
  getPlannerIntakeErrorMessage,
  runPlannerIntakeTurn,
  type PlannerIntakeSnapshot,
} from "../../utils/home-planner-intake";
import {
  getPlannerFollowUpErrorMessage,
  runPlannerFollowUpTurn,
} from "../../utils/home-planner-follow-up";
import {
  formatGroundedTravelPlan,
  generateGroundedTravelPlan,
  getHomePlannerErrorMessage,
  type GroundedTravelPlan,
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

import type { BookingCheckoutStage, BookingReceipt } from "../../features/home/types";
import {
  buildInitialAssistantMessage,
  getAutoChatTitle,
  getDefaultChatTitle,
  normalizeLatestPlan,
  parseCheckoutReturnState,
  wait,
} from "../../features/home/helpers";
import { ChatMessageBubble } from "../../features/home/components/ChatMessageBubble";
import { PlanCard } from "../../features/home/components/PlanCard";
import { BookingModal } from "../../features/home/components/BookingModal";
import { ChatComposer } from "../../features/home/components/ChatComposer";
import { ChatDrawer } from "../../features/home/components/ChatDrawer";
import { getRequestedTransportOperatorNames } from "../../travel-providers/transport-links";

WebBrowser.maybeCompleteAuthSession();

type PlannerRunStage = "idle" | "intake" | "generating";

const OPTIMISTIC_CHAT_SNAPSHOT_GRACE_MS = 45000;

function getChatActivityMs(chat: HomePlannerChatThread) {
  const messageActivityMs = Math.max(
    0,
    ...chat.state.messages.map((message) => message.createdAtMs),
    ...chat.state.followUpMessages.map((message) => message.createdAtMs)
  );

  return Math.max(chat.updatedAtMs, chat.state.latestPlan?.createdAtMs ?? 0, messageActivityMs);
}

function containsAllConversationMessages(
  target: HomePlannerChatThread,
  source: HomePlannerChatThread
) {
  const targetMessageIds = new Set([
    ...target.state.messages.map((message) => message.id),
    ...target.state.followUpMessages.map((message) => message.id),
  ]);

  return [...source.state.messages, ...source.state.followUpMessages].every((message) =>
    targetMessageIds.has(message.id)
  );
}

function shouldPreferOptimisticChat(
  optimisticChat: HomePlannerChatThread,
  remoteChat: HomePlannerChatThread | undefined
) {
  if (!remoteChat) {
    return true;
  }

  if (!containsAllConversationMessages(remoteChat, optimisticChat)) {
    return true;
  }

  return getChatActivityMs(remoteChat) + 250 < getChatActivityMs(optimisticChat);
}

function mergeStoreWithOptimisticChat({
  forceProtect,
  optimisticChatId,
  optimisticStore,
  remoteStore,
}: {
  forceProtect: boolean;
  optimisticChatId: string | null;
  optimisticStore: HomePlannerStore | null;
  remoteStore: HomePlannerStore;
}) {
  if (!optimisticStore) {
    return { caughtUp: true, store: remoteStore };
  }

  const protectedChat =
    optimisticStore.chats.find((chat) => chat.id === optimisticChatId) ??
    optimisticStore.chats.find((chat) => chat.id === optimisticStore.currentChatId);

  if (!protectedChat) {
    return { caughtUp: true, store: remoteStore };
  }

  const remoteChat = remoteStore.chats.find((chat) => chat.id === protectedChat.id);

  if (!shouldPreferOptimisticChat(protectedChat, remoteChat)) {
    return { caughtUp: true, store: remoteStore };
  }

  if (!forceProtect) {
    return { caughtUp: false, store: remoteStore };
  }

  return {
    caughtUp: false,
    store: {
      ...remoteStore,
      chats: sortHomePlannerChats([
        protectedChat,
        ...remoteStore.chats.filter((chat) => chat.id !== protectedChat.id),
      ]),
      currentChatId: protectedChat.id,
    },
  };
}

function applyAutomaticChatTitles(
  store: HomePlannerStore,
  language: ReturnType<typeof useAppLanguage>["language"]
) {
  return {
    ...store,
    chats: store.chats.map((chat) => ({
      ...chat,
      title: getAutoChatTitle(
        chat.title,
        chat.state.destination || chat.state.latestPlan?.destination || "",
        chat.state.latestPlan?.plan.title || "",
        language
      ),
    })),
  } satisfies HomePlannerStore;
}

function normalizeProviderMatchText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findRequestedTransportOption(plan: GroundedTravelPlan, requestedOperators: string[]) {
  const requestedNames = requestedOperators.map(normalizeProviderMatchText).filter(Boolean);

  if (requestedNames.length === 0) {
    return null;
  }

  return (
    plan.transportOptions.find((option) => {
      const provider = normalizeProviderMatchText(option.provider);
      return requestedNames.some((requestedName) => provider.includes(requestedName) || requestedName.includes(provider));
    }) ?? null
  );
}

function hasVisibleTransportPrice(
  option: GroundedTravelPlan["transportOptions"][number] | null | undefined
) {
  return !!option?.price?.match(/\d/);
}

function hasPricedTransportOption(plan: GroundedTravelPlan) {
  return plan.transportOptions.some((option) => hasVisibleTransportPrice(option));
}

function buildTicketPriceSearchMessage(
  plan: GroundedTravelPlan,
  language: ReturnType<typeof useAppLanguage>["language"]
) {
  const transportProviders = plan.transportOptions
    .filter((option) => hasVisibleTransportPrice(option))
    .slice(0, 3)
    .map((option) => `${option.provider}${option.price ? ` ${option.price}` : ""}${option.sourceLabel ? ` via ${option.sourceLabel}` : ""}`)
    .join(", ");

  if (language === "bg") {
    if (transportProviders) {
      return `Обнових ticket цените в картата: ${transportProviders}. Provider-ът остава реалната компания, а booking site показва откъде идва цената.`;
    }

    return "Проверих airline и trusted third-party fare източници за избраните дати, но не намерих достатъчно сигурна точна ticket цена. Запазих текущия trip card, вместо да показвам estimate.";
  }

  if (transportProviders) {
    return `I updated the ticket prices in the card: ${transportProviders}. The provider stays as the real carrier, and the booking site shows where the fare came from.`;
  }

  return "I searched airline and trusted third-party fare sources for the selected dates, but no exact ticket fare was safe enough to show. I kept the current trip card instead of showing an estimate.";
}

function buildRequestedCarrierUnavailableMessage(
  requestedOperators: string[],
  language: ReturnType<typeof useAppLanguage>["language"]
) {
  const requestedLabel = requestedOperators.join(", ");

  if (language === "bg") {
    return `${requestedLabel} не върна сигурна цена за избраните дати в този run. Запазих досегашния trip card и оставих наличните точни оферти на място.`;
  }

  return `${requestedLabel} did not return a safe date-matched fare in this run. I kept the current trip card and left the existing priced options in place.`;
}

function buildRegeneratedPlanMessage(
  plan: GroundedTravelPlan,
  language: ReturnType<typeof useAppLanguage>["language"],
  requestedOperators: string[] = []
) {
  const requestedTransport = findRequestedTransportOption(plan, requestedOperators);
  if (requestedTransport) {
    if (language === "bg") {
      return `Намерих точна оферта от ${requestedTransport.provider}${requestedTransport.price ? ` за ${requestedTransport.price}` : ""} и обнових плана по-горе. Билетът продължава през официалния provider checkout.`;
    }

    return `I found an exact ${requestedTransport.provider}${requestedTransport.price ? ` fare for ${requestedTransport.price}` : " fare"} and updated the plan above. Ticket checkout continues through the official provider.`;
  }

  const transportProviders = plan.transportOptions
    .filter((option) => hasVisibleTransportPrice(option))
    .slice(0, 2)
    .map((option) => `${option.provider}${option.price ? ` ${option.price}` : ""}`)
    .filter(Boolean)
    .join(", ");
  const stayProviders = plan.stayOptions
    .slice(0, 2)
    .map((stay) => `${stay.name}${stay.pricePerNight ? ` ${stay.pricePerNight}` : ""}`)
    .filter(Boolean)
    .join(", ");
  const hasTransport = transportProviders.length > 0;
  const hasStay = stayProviders.length > 0;

  if (language === "bg") {
    if (hasTransport && hasStay) {
      return `Обнових плана по-горе. Най-добрите точни оферти са ${transportProviders} и ${stayProviders}. Детайлите и booking бутоните са в картата.`;
    }

    if (hasTransport) {
      return `Обнових плана по-горе с точни transport цени: ${transportProviders}. За настаняване оставих само проверени оферти в картата.`;
    }

    if (hasStay) {
      return `Обнових плана по-горе с точни оферти за настаняване: ${stayProviders}. Няма да показвам transport цена без точна проверка за датите.`;
    }

    return "Обнових плана по-горе. Няма да показвам оферти без точна provider цена за избраните дати.";
  }

  if (hasTransport && hasStay) {
    return `I updated the plan above. The best exact offers are ${transportProviders} and ${stayProviders}. Details and booking buttons are in the card.`;
  }

  if (hasTransport) {
    return `I updated the plan above with exact transport prices: ${transportProviders}. Accommodation stays limited to verified provider offers in the card.`;
  }

  if (hasStay) {
    return `I updated the plan above with exact accommodation prices: ${stayProviders}. I will not show a transport fare unless it is exact for your dates.`;
  }

  return "I updated the plan above. I will not show offers without an exact provider price for the selected dates.";
}

export default function HomeTabScreen() {
  const { colors } = useAppTheme();
  const { language, t } = useAppLanguage();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isFocused = useIsFocused();
  const isPhoneLayout = width < 768;


  const [loading, setLoading] = useState(true);
  const [plannerRunStage, setPlannerRunStage] = useState<PlannerRunStage>("idle");
  const planning = plannerRunStage !== "idle";
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
    paymentMethod: t("home.paymentBankCard"),
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
  const [composerHeight, setComposerHeight] = useState(0);
  const phoneDrawerTranslateX = useRef(new Animated.Value(-320)).current;
  const phoneDrawerWidth = Math.min(width * 0.84, 330);
  const typingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const homeFocusHandledRef = useRef(false);
  const planningRef = useRef(false);
  planningRef.current = planning;
  const optimisticHomeStoreRef = useRef<HomePlannerStore | null>(null);
  const optimisticChatIdRef = useRef<string | null>(null);
  const optimisticStoreUpdatedAtRef = useRef(0);
  const [typingMessageId, setTypingMessageId] = useState<string | null>(null);
  const [typingVisibleText, setTypingVisibleText] = useState("");
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const isKeyboardOpenRef = useRef(false);
  const keyboardHeightRef = useRef(0);
  const languageRef = useRef(language);
  languageRef.current = language;

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
    currentChat?.state ??
    createEmptyPlannerState(buildInitialAssistantMessage(profileName, language));
  const paymentMethods = useMemo(
    () => [t("home.paymentBankCard"), "Apple Pay", "Google Pay"],
    [t]
  );
  const latestPlan = currentPlannerState.latestPlan;
  const followUpMessages = currentPlannerState.followUpMessages ?? [];
  const plannerContextChips = useMemo(
    () =>
      [
        currentPlannerState.budget,
        currentPlannerState.days,
        currentPlannerState.travelers,
        currentPlannerState.transportPreference,
        currentPlannerState.timing,
        currentPlannerState.destination,
        currentPlannerState.tripStyle,
      ].map((value) => value.trim()).filter(Boolean),
    [
      currentPlannerState.budget,
      currentPlannerState.days,
      currentPlannerState.destination,
      currentPlannerState.timing,
      currentPlannerState.transportPreference,
      currentPlannerState.travelers,
      currentPlannerState.tripStyle,
    ]
  );
  const messagesScrollRef = useRef<ScrollView | null>(null);
  const scrollViewLayoutHeight = useRef(0);
  const shouldStickToBottomRef = useRef(true);
  const lastPlannerMessage =
    currentPlannerState.messages[currentPlannerState.messages.length - 1] ?? null;
  const lastFollowUpMessage = followUpMessages[followUpMessages.length - 1] ?? null;
  const shouldShowLatestPlan = !!latestPlan;
  const plannerStatusText = plannerRunStage === "generating"
    ? t("home.searchingPrices")
    : currentChat?.title ?? t("home.newPlan");
  const activePlanningLabel =
    plannerRunStage === "generating" ? t("home.searchingPrices") : null;
  const conversationContentKey = [
    currentChat?.id ?? "no-chat",
    currentPlannerState.messages.length,
    lastPlannerMessage?.id ?? "no-message",
    followUpMessages.length,
    lastFollowUpMessage?.id ?? "no-follow-up",
    plannerRunStage,
    shouldShowLatestPlan ? latestPlan?.sourceKey ?? "plan" : "no-plan",
  ].join("|");
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
        totalLabel: t("home.priceOnRequest"),
      };
  const selectedTransportHasVerifiedPrice = !!selectedTransport?.price.match(/\d/);
  const selectedStayHasVerifiedPrice = !!selectedStay?.pricePerNight.match(/\d/);
  const bookingChargeBreakdown = useMemo(() => {
    const subtotalAmount = bookingEstimate.totalEstimate;
    const platformFeeAmount =
      subtotalAmount !== null ? Math.max(1, Math.round(subtotalAmount * 0.04)) : null;
    const totalAmount =
      subtotalAmount !== null && platformFeeAmount !== null
        ? subtotalAmount + platformFeeAmount
        : subtotalAmount;
    const providerLabel =
      selectedStay?.sourceLabel ||
      selectedTransport?.provider ||
      selectedTransport?.sourceLabel ||
      "Travel provider";
    const providerBookingUrl =
      selectedStay?.bookingUrl || selectedTransport?.bookingUrl || "";
    const reservationMode =
      selectedStay?.reservationMode ||
      (providerBookingUrl ? "provider_redirect" : "test_internal");

    return {
      platformFeeAmount,
      platformFeeLabel:
        platformFeeAmount !== null ? `${platformFeeAmount} EUR` : t("home.priceOnRequest"),
      providerBookingUrl,
      providerLabel,
      reservationMode,
      reservationStatusLabel: providerBookingUrl
        ? selectedTransport
          ? `Stripe test плащането ще се запише тук, а финалният билет ще продължи през ${providerLabel}.`
          : `Stripe test плащането ще се запише тук, а финалната резервация ще продължи през ${providerLabel}.`
        : "Stripe test плащането ще се запише вътрешно като тестова резервация.",
      subtotalAmount,
      subtotalLabel:
        subtotalAmount !== null ? `${subtotalAmount} EUR` : t("home.priceOnRequest"),
      totalAmount,
      totalLabel:
        totalAmount !== null ? `${totalAmount} EUR` : bookingEstimate.totalLabel,
    };
  }, [
    bookingEstimate.totalEstimate,
    bookingEstimate.totalLabel,
    selectedStay,
    selectedTransport,
    t,
  ]);

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
    if (scrollTimerRef.current) {
      clearTimeout(scrollTimerRef.current);
    }

    scrollTimerRef.current = setTimeout(() => {
      scrollTimerRef.current = null;
      shouldStickToBottomRef.current = true;
      setShowScrollToBottom(false);
      messagesScrollRef.current?.scrollToEnd({ animated });
    }, Platform.OS === "android" ? 16 : 8);
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
      const isNearBottom = distanceFromBottom < 96;

      shouldStickToBottomRef.current = isNearBottom;
      setShowScrollToBottom(!isNearBottom);
    },
    []
  );

  useEffect(() => {
    return () => {
      clearTypingAnimation();
      if (scrollTimerRef.current) {
        clearTimeout(scrollTimerRef.current);
      }
    };
  }, [clearTypingAnimation]);

  useEffect(() => {
    if (shouldStickToBottomRef.current || planning || isKeyboardOpenRef.current) {
      scrollMessagesToBottom(true);
    }
  }, [conversationContentKey, planning, scrollMessagesToBottom]);

  useEffect(() => {
    if (typingMessageId && shouldStickToBottomRef.current) {
      scrollMessagesToBottom(false);
    }
  }, [scrollMessagesToBottom, typingMessageId, typingVisibleText]);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      isKeyboardOpenRef.current = true;
      setIsKeyboardOpen(true);
      keyboardHeightRef.current = event?.endCoordinates?.height ?? 0;
      scrollMessagesToBottom(true);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      isKeyboardOpenRef.current = false;
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
          const nextStore = applyAutomaticChatTitles(
            parseStoredHomePlannerStore(
              profileData,
              buildInitialAssistantMessage(nextProfileName, languageRef.current)
            ),
            languageRef.current
          );

          setHomeStore((currentLocalStore) => {
            const optimisticStore = optimisticHomeStoreRef.current;
            const optimisticStoreAgeMs =
              optimisticStoreUpdatedAtRef.current > 0
                ? Date.now() - optimisticStoreUpdatedAtRef.current
                : Number.POSITIVE_INFINITY;
            const optimisticMerge = mergeStoreWithOptimisticChat({
              forceProtect:
                planningRef.current ||
                optimisticStoreAgeMs < OPTIMISTIC_CHAT_SNAPSHOT_GRACE_MS,
              optimisticChatId: optimisticChatIdRef.current,
              optimisticStore,
              remoteStore: nextStore,
            });

            if (optimisticMerge.caughtUp) {
              optimisticHomeStoreRef.current = null;
              optimisticChatIdRef.current = null;
              optimisticStoreUpdatedAtRef.current = 0;
              return optimisticMerge.store;
            }

            if (optimisticMerge.store !== nextStore) {
              return optimisticMerge.store;
            }

            if (!planningRef.current) {
              return nextStore;
            }

            const localCurrentChat = currentLocalStore.chats.find(
              (chat) => chat.id === currentLocalStore.currentChatId
            );

            if (!localCurrentChat || isHomePlannerChatUntouched(localCurrentChat)) {
              return nextStore;
            }

            const remoteCurrentChat = nextStore.chats.find(
              (chat) => chat.id === localCurrentChat.id
            );

            if (!shouldPreferOptimisticChat(localCurrentChat, remoteCurrentChat)) {
              return nextStore;
            }

            return {
              ...nextStore,
              chats: sortHomePlannerChats([
                localCurrentChat,
                ...nextStore.chats.filter((chat) => chat.id !== localCurrentChat.id),
              ]),
              currentChatId: localCurrentChat.id,
            };
          });
          setLoading(false);
        },
        (nextError) => {
          setError(getFirestoreUserMessage(nextError, "read", languageRef.current));
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
  }, [isPhoneLayout, phoneDrawerTranslateX, phoneDrawerWidth]);

  useEffect(() => {
    clearTypingAnimation();
    setTypingMessageId(null);
    setTypingVisibleText("");
    setShowScrollToBottom(false);
    shouldStickToBottomRef.current = true;
    scrollMessagesToBottom(false);
  }, [clearTypingAnimation, currentChat?.id, scrollMessagesToBottom]);

  const canSend = chatInput.trim().length > 0 && !planning;

  const persistStore = useCallback(
    async (nextStore: HomePlannerStore) => {
      if (!user) {
        return;
      }

      try {
        await saveHomePlannerStoreForUser(user.uid, nextStore);
      } catch (nextError) {
        setError(getFirestoreUserMessage(nextError, "write", language, "trip"));
      }
    },
    [language, user]
  );

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
      buildInitialAssistantMessage(profileName, language),
      getDefaultChatTitle(homeStore.chats.length, language)
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
    language,
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

    if (planningRef.current) {
      optimisticHomeStoreRef.current = nextStore;
      optimisticChatIdRef.current = currentChat.id;
      optimisticStoreUpdatedAtRef.current = Date.now();
    }

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
    const initialAssistantMessage = buildInitialAssistantMessage(profileName, language);
    const nextChat = createHomePlannerChat(
      initialAssistantMessage,
      getDefaultChatTitle(homeStore.chats.length, language)
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
              buildInitialAssistantMessage(profileName, language)
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
      state: createEmptyPlannerState(buildInitialAssistantMessage(profileName, language)),
      title: chat.title,
    }));
    setChatInput("");
    setError("");
    setBookingError("");
    setBookingSuccess("");
    setSaveError("");
    setSaveSuccess("");
  };

  const buildPlannerSnapshot = (state: typeof currentPlannerState): PlannerIntakeSnapshot => ({
    budget: state.budget,
    days: state.days,
    destination: state.destination,
    notes: state.notes,
    questionCount: state.aiQuestionCount,
    timing: state.timing,
    transportPreference: state.transportPreference,
    travelers: state.travelers,
    tripStyle: state.tripStyle,
  });

  const applySnapshotToState = (
    state: typeof currentPlannerState,
    snapshot: PlannerIntakeSnapshot,
    step: typeof currentPlannerState.step
  ) => ({
    ...state,
    aiQuestionCount: snapshot.questionCount,
    budget: snapshot.budget,
    days: snapshot.days,
    destination: snapshot.destination,
    notes: snapshot.notes,
    timing: snapshot.timing,
    transportPreference: snapshot.transportPreference,
    travelers: snapshot.travelers,
    tripStyle: snapshot.tripStyle,
    step,
  });

  const isPlannerRegenerateCommand = (value: string) => {
    const normalized = value.trim().toLowerCase();

    return (
      normalized === "again" ||
      normalized === "generate" ||
      normalized === "regen" ||
      normalized === "пак" ||
      normalized === "опитай пак" ||
      normalized.includes("generate again") ||
      normalized.includes("regenerate") ||
      normalized.includes("try again") ||
      normalized.includes("generate it again") ||
      normalized.includes("generate this again") ||
      normalized.includes("генерирай пак") ||
      normalized.includes("генерирай отново")
    );
  };

  const runPlanGeneration = async (
    snapshot: PlannerIntakeSnapshot,
    messagesAfterUser: HomeChatMessage[],
    options: {
      appendAssistantToFollowUps?: boolean;
      followUpMessages?: HomeChatMessage[];
      preservePlanIfRequestedTransportMissing?: boolean;
      preservePlanIfTransportPriceMissing?: boolean;
      requestedTransportOperators?: string[];
      transportPriceRequest?: boolean;
    } = {}
  ) => {
    if (!profile) {
      return false;
    }

    planningRef.current = true;
    optimisticChatIdRef.current = currentChat?.id ?? optimisticChatIdRef.current;
    setPlannerRunStage("generating");

    // The caller already set messages, followUpMessages, and latestPlan
    // correctly and persisted to Firestore. Do NOT call replaceCurrentChat
    // here — it would read stale React state and overwrite the follow-up
    // messages the caller just set.

    try {
      const plan = await generateGroundedTravelPlan({
        budget: snapshot.budget,
        days: snapshot.days,
        destination: snapshot.destination,
        language,
        notes: snapshot.notes,
        timing: snapshot.timing,
        transportPreference: snapshot.transportPreference,
        travelers: snapshot.travelers,
        profile,
        tripStyle: snapshot.tripStyle,
      });
      const requestedTransportOperators = options.requestedTransportOperators ?? [];
      const requestedTransportOption = findRequestedTransportOption(
        plan,
        requestedTransportOperators
      );
      const hasExactTicketPrice = hasPricedTransportOption(plan);
      const shouldPreserveForRequestedTransportMissing =
        options.preservePlanIfRequestedTransportMissing === true &&
        requestedTransportOperators.length > 0 &&
        !requestedTransportOption;
      const shouldPreserveForMissingTicketPrice =
        options.preservePlanIfTransportPriceMissing === true && !hasExactTicketPrice;
      const shouldPreserveExistingPlan =
        shouldPreserveForRequestedTransportMissing || shouldPreserveForMissingTicketPrice;
      const readyMessage = createHomeChatMessage(
        "assistant",
        options.transportPriceRequest
            ? buildTicketPriceSearchMessage(plan, language)
          : shouldPreserveExistingPlan
          ? buildRequestedCarrierUnavailableMessage(requestedTransportOperators, language)
          : options.appendAssistantToFollowUps
            ? buildRegeneratedPlanMessage(plan, language, requestedTransportOperators)
            : t("home.planReady")
      );
      const formattedPlanText = formatGroundedTravelPlan(plan, language);
      const nextLatestPlan = normalizeLatestPlan({
        budget: snapshot.budget,
        createdAtMs: readyMessage.createdAtMs,
        days: snapshot.days,
        destination: snapshot.destination,
        formattedPlanText,
        timing: snapshot.timing,
        transportPreference: snapshot.transportPreference,
        travelers: snapshot.travelers,
        plan,
        sourceKey: getHomeSavedSourceKey({
          budget: snapshot.budget,
          days: snapshot.days,
          destination: snapshot.destination,
          formattedPlanText,
        }),
      });

      await replaceCurrentChatWithAssistant(
        (chat) => ({
          ...chat,
          title: shouldPreserveExistingPlan
            ? chat.title
            : getAutoChatTitle(chat.title, snapshot.destination, plan.title, language),
          updatedAtMs: Date.now(),
          state: {
            ...applySnapshotToState(chat.state, snapshot, "done"),
            followUpMessages: options.appendAssistantToFollowUps
              ? [...(options.followUpMessages ?? chat.state.followUpMessages), readyMessage]
              : [],
            latestPlan: shouldPreserveExistingPlan
              ? chat.state.latestPlan
              : nextLatestPlan,
            messages: options.appendAssistantToFollowUps
              ? messagesAfterUser
              : [...messagesAfterUser, readyMessage],
          },
        }),
        readyMessage
      );
      scrollMessagesToBottom(true);
      return true;
    } catch (nextError) {
      const message = getHomePlannerErrorMessage(nextError, language);
      const errorMessage = createHomeChatMessage("assistant", message);
      setError(message);

      await replaceCurrentChatWithAssistant(
        (chat) => ({
          ...chat,
          updatedAtMs: Date.now(),
          state: {
            ...applySnapshotToState(
              chat.state,
              snapshot,
              chat.state.latestPlan ? "done" : "chatting"
            ),
            followUpMessages: options.appendAssistantToFollowUps
              ? [...(options.followUpMessages ?? chat.state.followUpMessages), errorMessage]
              : [],
            latestPlan: chat.state.latestPlan,
            messages: options.appendAssistantToFollowUps
              ? messagesAfterUser
              : [...messagesAfterUser, errorMessage],
          },
        }),
        errorMessage
      );
      scrollMessagesToBottom(true);
      return false;
    }
  };

  const appendRegenerationRequestToSnapshot = (
    snapshot: PlannerIntakeSnapshot,
    request: string
  ) => ({
    ...snapshot,
    notes: [snapshot.notes, `USER REQUEST: ${request}`].filter(Boolean).join("\n"),
  });

  const appendTicketPriceRequestToSnapshot = (
    snapshot: PlannerIntakeSnapshot,
    request: string,
    currentProviders: string[]
  ) =>
    appendRegenerationRequestToSnapshot(
      snapshot,
      [
        "Find exact dated ticket/transport prices for the current trip.",
        currentProviders.length > 0
          ? `Current transport providers to price first: ${currentProviders.join(", ")}.`
          : "Search relevant airlines/operators for this route.",
        "Search the direct carrier/operator first.",
        "If direct carrier pricing is unavailable, use reputable third-party fare/booking sources only when the fare exactly matches the selected route, dates, travelers, and carrier.",
        "Do not answer that ticket prices fluctuate.",
        "Update the trip card with exact ticket prices when verified; otherwise keep the current card instead of showing estimates.",
        request,
      ].join(" ")
    );

  const appendCarrierRequestToSnapshot = (
    snapshot: PlannerIntakeSnapshot,
    request: string,
    operators: string[]
  ) =>
    appendRegenerationRequestToSnapshot(
      snapshot,
      `Prefer exact airline/operator fares from ${operators.join(", ")}. ${request}`
    );

  const isTicketPriceRequest = (request: string) => {
    const normalized = normalizeProviderMatchText(request);
    const hasPriceTerm =
      /\b(price|prices|priced|fare|fares|cost|costs|quote|quotes)\b/.test(normalized) ||
      normalized.includes("цена") ||
      normalized.includes("цени") ||
      normalized.includes("стойност");
    const hasTicketOrTransportTerm =
      /\b(ticket|tickets|flight|flights|plane|airline|airlines|transport|transit)\b/.test(normalized) ||
      normalized.includes("билет") ||
      normalized.includes("билети") ||
      normalized.includes("полет") ||
      normalized.includes("самолет") ||
      normalized.includes("транспорт");

    return hasPriceTerm && hasTicketOrTransportTerm;
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
    const currentSnapshot = buildPlannerSnapshot(plannerState);

    if (plannerState.step === "done" && plannerState.latestPlan) {
      const requestedTransportOperators = getRequestedTransportOperatorNames(value);
      const ticketPriceRequest = isTicketPriceRequest(value);
      const currentTransportProviders = Array.from(
        new Set(
          plannerState.latestPlan.plan.transportOptions
            .map((option) => option.provider.trim())
            .filter(Boolean)
        )
      );
      const currentPlanNeedsTransportPrices =
        !hasPricedTransportOption(plannerState.latestPlan.plan);
      const shouldRetryTransportPrices =
        ticketPriceRequest || (currentPlanNeedsTransportPrices && isPlannerRegenerateCommand(value));

      if (isPlannerRegenerateCommand(value)) {
        const hasCarrierRequest = requestedTransportOperators.length > 0;
        const regenerationSnapshot = hasCarrierRequest
          ? appendCarrierRequestToSnapshot(currentSnapshot, value, requestedTransportOperators)
          : shouldRetryTransportPrices
            ? appendTicketPriceRequestToSnapshot(
                currentSnapshot,
                value,
                currentTransportProviders
              )
            : appendRegenerationRequestToSnapshot(
                currentSnapshot,
                value
              );
        // Keep existing messages above the plan card untouched.
        // The user's regeneration request stays as a follow-up (below the plan).
        const followUpWithUser = [...plannerState.followUpMessages, userMessage];

        planningRef.current = true;
        optimisticChatIdRef.current = currentChat.id;
        setPlannerRunStage("generating");
        shouldStickToBottomRef.current = true;

        const nextChats = sortHomePlannerChats(
          homeStore.chats.map((chat) =>
            chat.id === currentChat.id
              ? {
                  ...chat,
                  updatedAtMs: Date.now(),
                  state: {
                    ...applySnapshotToState(chat.state, regenerationSnapshot, "done"),
                    followUpMessages: followUpWithUser,
                    latestPlan: chat.state.latestPlan,
                    messages: plannerState.messages,
                  },
                }
              : chat
          )
        );
        const nextStore = { ...homeStore, chats: nextChats, currentChatId: currentChat.id };

        optimisticHomeStoreRef.current = nextStore;
        optimisticStoreUpdatedAtRef.current = Date.now();
        setHomeStore(nextStore);
        scrollMessagesToBottom(true);
        await persistStore(nextStore);

        try {
          await runPlanGeneration(regenerationSnapshot, plannerState.messages, {
            appendAssistantToFollowUps: true,
            followUpMessages: followUpWithUser,
            preservePlanIfRequestedTransportMissing: hasCarrierRequest,
            preservePlanIfTransportPriceMissing: shouldRetryTransportPrices,
            requestedTransportOperators,
            transportPriceRequest: shouldRetryTransportPrices,
          });
        } finally {
          planningRef.current = false;
          setPlannerRunStage("idle");
        }

        return;
      }

      if (requestedTransportOperators.length > 0) {
        const regenerationSnapshot = appendCarrierRequestToSnapshot(
          currentSnapshot,
          value,
          requestedTransportOperators
        );
        const followUpWithUser = [...plannerState.followUpMessages, userMessage];

        planningRef.current = true;
        optimisticChatIdRef.current = currentChat.id;
        setPlannerRunStage("generating");
        shouldStickToBottomRef.current = true;

        const nextChats = sortHomePlannerChats(
          homeStore.chats.map((chat) =>
            chat.id === currentChat.id
              ? {
                  ...chat,
                  updatedAtMs: Date.now(),
                  state: {
                    ...applySnapshotToState(chat.state, regenerationSnapshot, "done"),
                    followUpMessages: followUpWithUser,
                    latestPlan: chat.state.latestPlan,
                    messages: plannerState.messages,
                  },
                }
              : chat
          )
        );
        const nextStore = { ...homeStore, chats: nextChats, currentChatId: currentChat.id };

        optimisticHomeStoreRef.current = nextStore;
        optimisticStoreUpdatedAtRef.current = Date.now();
        setHomeStore(nextStore);
        scrollMessagesToBottom(true);
        await persistStore(nextStore);

        try {
          await runPlanGeneration(regenerationSnapshot, plannerState.messages, {
            appendAssistantToFollowUps: true,
            followUpMessages: followUpWithUser,
            preservePlanIfRequestedTransportMissing: true,
            preservePlanIfTransportPriceMissing: shouldRetryTransportPrices,
            requestedTransportOperators,
            transportPriceRequest: shouldRetryTransportPrices,
          });
        } finally {
          planningRef.current = false;
          setPlannerRunStage("idle");
        }

        return;
      }

      if (shouldRetryTransportPrices) {
        const regenerationSnapshot = appendTicketPriceRequestToSnapshot(
          currentSnapshot,
          value,
          currentTransportProviders
        );
        const followUpWithUser = [...plannerState.followUpMessages, userMessage];

        planningRef.current = true;
        optimisticChatIdRef.current = currentChat.id;
        setPlannerRunStage("generating");
        shouldStickToBottomRef.current = true;

        const nextChats = sortHomePlannerChats(
          homeStore.chats.map((chat) =>
            chat.id === currentChat.id
              ? {
                  ...chat,
                  updatedAtMs: Date.now(),
                  state: {
                    ...applySnapshotToState(chat.state, regenerationSnapshot, "done"),
                    followUpMessages: followUpWithUser,
                    latestPlan: chat.state.latestPlan,
                    messages: plannerState.messages,
                  },
                }
              : chat
          )
        );
        const nextStore = { ...homeStore, chats: nextChats, currentChatId: currentChat.id };

        optimisticHomeStoreRef.current = nextStore;
        optimisticStoreUpdatedAtRef.current = Date.now();
        setHomeStore(nextStore);
        scrollMessagesToBottom(true);
        await persistStore(nextStore);

        try {
          await runPlanGeneration(regenerationSnapshot, plannerState.messages, {
            appendAssistantToFollowUps: true,
            followUpMessages: followUpWithUser,
            preservePlanIfTransportPriceMissing: true,
            transportPriceRequest: true,
          });
        } finally {
          planningRef.current = false;
          setPlannerRunStage("idle");
        }

        return;
      }

      const followUpMessagesAfterUser = [...plannerState.followUpMessages, userMessage];

      planningRef.current = true;
      optimisticChatIdRef.current = currentChat.id;
      setPlannerRunStage("intake");
      shouldStickToBottomRef.current = true;

      const nextChats = sortHomePlannerChats(
        homeStore.chats.map((chat) =>
          chat.id === currentChat.id
            ? {
                ...chat,
                updatedAtMs: Date.now(),
                state: {
                  ...chat.state,
                  followUpMessages: followUpMessagesAfterUser,
                  latestPlan: chat.state.latestPlan,
                  step: "done",
                },
              }
            : chat
        )
      );
      const nextStore = { ...homeStore, chats: nextChats, currentChatId: currentChat.id };

      optimisticHomeStoreRef.current = nextStore;
      optimisticStoreUpdatedAtRef.current = Date.now();
      setHomeStore(nextStore);
      scrollMessagesToBottom(true);
      await persistStore(nextStore);

      try {
        const followUpTurn = await runPlannerFollowUpTurn({
          followUpMessages: followUpMessagesAfterUser,
          language,
          latestPlan: plannerState.latestPlan,
          latestUserInput: value,
          messages: plannerState.messages,
          profile,
          snapshot: currentSnapshot,
        });
        const assistantMessage = createHomeChatMessage(
          "assistant",
          followUpTurn.assistantText
        );

        await replaceCurrentChatWithAssistant(
          (chat) => ({
            ...chat,
            updatedAtMs: Date.now(),
            state: {
              ...applySnapshotToState(chat.state, followUpTurn.snapshot, "done"),
              followUpMessages: [...followUpMessagesAfterUser, assistantMessage],
              latestPlan: chat.state.latestPlan,
              messages: plannerState.messages,
            },
          }),
          assistantMessage
        );
        scrollMessagesToBottom(true);
      } catch {
        const message = getPlannerFollowUpErrorMessage(language);
        const errorMessage = createHomeChatMessage("assistant", message);
        setError(message);

        await replaceCurrentChatWithAssistant(
          (chat) => ({
            ...chat,
            updatedAtMs: Date.now(),
            state: {
              ...chat.state,
              followUpMessages: [...followUpMessagesAfterUser, errorMessage],
              latestPlan: chat.state.latestPlan,
              messages: plannerState.messages,
              step: "done",
            },
          }),
          errorMessage
        );
        scrollMessagesToBottom(true);
      } finally {
        planningRef.current = false;
        setPlannerRunStage("idle");
      }

      return;
    }

    const messagesAfterUser = [...plannerState.messages, userMessage];

    // Show and persist the user's message before the AI call so remote snapshots
    // cannot roll the visible chat back while generation is running.
    planningRef.current = true;
    optimisticChatIdRef.current = currentChat.id;
    setPlannerRunStage("intake");
    shouldStickToBottomRef.current = true;
    const nextChats = sortHomePlannerChats(
      homeStore.chats.map((chat) =>
        chat.id === currentChat.id
          ? { ...chat, updatedAtMs: Date.now(), state: { ...chat.state, messages: messagesAfterUser } }
          : chat
      )
    );
    const nextStore = { ...homeStore, chats: nextChats, currentChatId: currentChat.id };
    optimisticHomeStoreRef.current = nextStore;
    optimisticStoreUpdatedAtRef.current = Date.now();
    setHomeStore(nextStore);
    scrollMessagesToBottom(true);
    await persistStore(nextStore);

    try {
      const intakeTurn = await runPlannerIntakeTurn({
        language,
        latestUserInput: value,
        messages: messagesAfterUser,
        profile,
        snapshot: currentSnapshot,
      });

      if (!intakeTurn.readyToGenerate) {
        const assistantMessage = createHomeChatMessage("assistant", intakeTurn.nextQuestion);

        await replaceCurrentChatWithAssistant(
          (chat) => ({
            ...chat,
            title: getAutoChatTitle(
              chat.title,
              intakeTurn.snapshot.destination,
              "",
              language
            ),
            updatedAtMs: Date.now(),
            state: {
              ...applySnapshotToState(chat.state, intakeTurn.snapshot, "chatting"),
              followUpMessages: [],
              latestPlan: chat.state.latestPlan,
              messages: [...messagesAfterUser, assistantMessage],
            },
          }),
          assistantMessage
        );
        scrollMessagesToBottom(true);
        return;
      }

      await runPlanGeneration(intakeTurn.snapshot, messagesAfterUser);
    } catch {
      const message = getPlannerIntakeErrorMessage(language);
      const errorMessage = createHomeChatMessage("assistant", message);
      setError(message);

      await replaceCurrentChatWithAssistant(
        (chat) => ({
          ...chat,
          updatedAtMs: Date.now(),
          state: {
            ...chat.state,
            followUpMessages: [],
            latestPlan: chat.state.latestPlan,
            messages: [...messagesAfterUser, errorMessage],
            step: "chatting",
          },
        }),
        errorMessage
      );
      scrollMessagesToBottom(true);
    } finally {
      planningRef.current = false;
      setPlannerRunStage("idle");
    }
  };

  const handleSavePlan = async () => {
    if (!currentChat || !latestPlan || !user || savingPlan) {
      return;
    }

    if (savedSourceKeys.includes(latestPlan.sourceKey)) {
      setSaveError("");
      setSaveSuccess(t("home.routeAlreadySaved"));
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
      setSaveSuccess(t("home.routeSaved"));
    } catch (nextError) {
      setSaveSuccess("");
      setSaveError(getFirestoreUserMessage(nextError, "write", language, "trip"));
    } finally {
      setSavingPlan(false);
    }
  };

  const openBookingModal = () => {
    if (!latestPlan) {
      return;
    }

    const firstVerifiedTransportIndex = latestPlan.plan.transportOptions.findIndex((option) =>
      /\d/.test(option.price)
    );
    const firstVerifiedStayIndex = latestPlan.plan.stayOptions.findIndex((stay) =>
      /\d/.test(stay.pricePerNight)
    );

    setSelectedTransportIndex(firstVerifiedTransportIndex >= 0 ? firstVerifiedTransportIndex : null);
    setSelectedStayIndex(firstVerifiedStayIndex >= 0 ? firstVerifiedStayIndex : null);
    resetBookingUi();
    setBookingSuccess("");
      setBookingForm({
        contactEmail: user?.email ?? "",
        contactName: profile?.personalProfile.fullName || profileName,
        note: "",
        paymentMethod: paymentMethods[0] ?? t("home.paymentBankCard"),
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
        paymentMethod: paymentMethods[0] ?? t("home.paymentBankCard"),
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
        paymentMethod: paymentMethods[0] ?? t("home.paymentBankCard"),
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
      setBookingError(t("home.bookingNameRequired"));
      return;
    }

    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setBookingError(t("home.bookingEmailRequired"));
      return;
    }

    if (!selectedTransport && !selectedStay) {
      setBookingError(t("home.bookingSelectionRequired"));
      return;
    }

    if (selectedStay && !selectedStayHasVerifiedPrice) {
      setBookingError(
        "Избраният stay няма проверима цена още. Отвори офертата при доставчика и довърши там."
      );
      return;
    }

    if (selectedTransport && !selectedTransportHasVerifiedPrice) {
      setBookingError(
        "Избраният транспорт няма проверима цена още. Отвори офертата при доставчика и довърши там."
      );
      return;
    }

    try {
      setBookingProcessing(true);
      setBookingError("");
      setBookingStage("processing");
      setBookingProgress(0.14);
      setBookingProgressLabel(t("home.bookingPreparingCheckout"));

      await user.getIdToken(true);
      await wait(300);

      const amountCents =
        bookingChargeBreakdown.totalAmount !== null
          ? Math.max(bookingChargeBreakdown.totalAmount, 1) * 100
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
        platformFeeCents:
          bookingChargeBreakdown.platformFeeAmount !== null
            ? bookingChargeBreakdown.platformFeeAmount * 100
            : 0,
        providerBookingUrl: bookingChargeBreakdown.providerBookingUrl,
        providerLabel: bookingChargeBreakdown.providerLabel,
        reservationMode: bookingChargeBreakdown.reservationMode,
        subtotalCents:
          bookingChargeBreakdown.subtotalAmount !== null
            ? bookingChargeBreakdown.subtotalAmount * 100
            : 0,
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
        platformFeeAmount: bookingChargeBreakdown.platformFeeAmount,
        platformFeeLabel: bookingChargeBreakdown.platformFeeLabel,
        providerBookingUrl: bookingChargeBreakdown.providerBookingUrl,
        providerLabel: bookingChargeBreakdown.providerLabel,
        reservationMode: bookingChargeBreakdown.reservationMode,
        reservationStatusLabel: bookingChargeBreakdown.reservationStatusLabel,
        stay: selectedStay,
        subtotalAmount: bookingChargeBreakdown.subtotalAmount,
        subtotalLabel: bookingChargeBreakdown.subtotalLabel,
        timing: latestPlan.timing,
        title: latestPlan.plan.title,
        totalAmount: bookingChargeBreakdown.totalAmount,
        totalLabel: bookingChargeBreakdown.totalLabel,
        transport: selectedTransport,
        travelers: latestPlan.travelers,
      });

      setBookingProgress(0.36);
      setBookingProgressLabel(t("home.bookingOpeningCheckout"));

      if (Platform.OS === "web" && typeof window !== "undefined") {
        setBookingProgress(0.52);
        setBookingProgressLabel(t("home.bookingRedirectingCheckout"));
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
        setBookingError(t("home.bookingMissingFunctions"));
      } else if (message.includes("stripe-test-mode-disabled")) {
        setBookingError(t("home.bookingModeDisabled"));
      } else if (
        message.includes("Failed to fetch") ||
        message.includes("functions/unavailable") ||
        errorCode === "functions/unavailable"
      ) {
        setBookingError(t("home.bookingEmulatorOffline"));
      } else if (message.includes("stripe-checkout-cancelled")) {
        setBookingError(t("home.bookingCancelled"));
      } else if (
        message.includes("stripe-checkout-incomplete") ||
        message.includes("stripe-session-not-paid")
      ) {
        setBookingError(t("home.bookingNotConfirmed"));
      } else if (
        message.includes("functions/failed-precondition") ||
        errorCode === "functions/failed-precondition" ||
        message.includes("STRIPE_SECRET_KEY") ||
        errorDetails.includes("STRIPE_SECRET_KEY")
      ) {
        setBookingError(t("home.bookingMissingSecret"));
      } else if (
        message.includes("functions/internal") ||
        errorCode === "functions/internal" ||
        message === "internal"
      ) {
        setBookingError(errorDetails || t("home.bookingInternal"));
      } else {
        const fallbackMessage = getFirestoreUserMessage(
          nextError,
          "write",
          language,
          "reservation"
        );
        setBookingError(message ? `${fallbackMessage} ${message}` : fallbackMessage);
      }
    } finally {
      setBookingProcessing(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.loader, { backgroundColor: colors.screen }]}
        edges={["top", "left", "right"]}
      >
        <ActivityIndicator size="large" color={colors.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: colors.screen }]}
      edges={["top", "left", "right"]}
    >
      <DismissKeyboard>
        <KeyboardAvoidingView
          style={styles.flex1}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
        >
        <View style={styles.chatShell}>
            <View
              style={[
                styles.header,
                { borderBottomColor: colors.border },
              ]}
            >
              <TouchableOpacity
                accessibilityLabel="Open chat history"
                activeOpacity={0.7}
                onPress={() => {
                  if (isPhoneLayout) {
                    setIsPhoneChatMenuOpen(true);
                    return;
                  }

                  setChatMenuVisible(true);
                }}
                style={styles.headerIconBtn}
              >
                <MaterialIcons color={colors.textPrimary} name="menu" size={26} />
              </TouchableOpacity>
              <View
                style={[
                  styles.headerAssistantAvatar,
                  { backgroundColor: colors.accentMuted, borderColor: colors.border },
                ]}
              >
                <MaterialIcons name="auto-awesome" size={17} color={colors.accent} />
                <View
                  style={[
                    styles.headerStatusDot,
                    {
                      backgroundColor: planning ? colors.warning : colors.success,
                      borderColor: colors.screen,
                    },
                  ]}
                />
              </View>
              <View style={styles.headerCenter}>
                <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
                  {t("home.aiPlanner")}
                </Text>
                <Text
                  numberOfLines={1}
                  style={[styles.headerSub, { color: colors.textMuted }]}
                >
                  {plannerStatusText}
                </Text>
              </View>
              <TouchableOpacity
                accessibilityLabel="Start new chat"
                activeOpacity={0.7}
                onPress={() => {
                  void handleCreateChat();
                }}
                style={styles.headerIconBtn}
              >
                <MaterialIcons color={colors.textPrimary} name="add-box" size={28} />
              </TouchableOpacity>
            </View>

            <View style={styles.chatArea}>
              {plannerContextChips.length > 0 ? (
                <View style={[styles.contextStrip, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
                  <Text style={[styles.contextStripTitle, { color: colors.textMuted }]}>
                    {t("home.currentPlan")}
                  </Text>
                  <View style={styles.profileMetaRow}>
                    {plannerContextChips.map((chip, index) => (
                      <View
                        key={`${chip}-${index}`}
                        style={[styles.profileMetaChip, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
                      >
                        <Text style={[styles.profileMetaChipText, { color: colors.textPrimary }]}>
                          {chip}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              <ScrollView
                ref={messagesScrollRef}
                style={styles.messagesContainer}
                contentContainerStyle={styles.messagesContent}
                alwaysBounceVertical
                bounces
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="always"
                keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
                onScroll={handleMessagesScroll}
                scrollEventThrottle={16}
                onLayout={(e) => {
                  scrollViewLayoutHeight.current = e.nativeEvent.layout.height;
                  scrollMessagesToBottom(false);
                }}
                onContentSizeChange={(_, contentHeight) => {
                  if (
                    contentHeight > scrollViewLayoutHeight.current &&
                    (shouldStickToBottomRef.current || isKeyboardOpenRef.current || planning)
                  ) {
                    scrollMessagesToBottom(false);
                  }
                }}
              >
                {currentPlannerState.messages.map((message) => (
                  <ChatMessageBubble
                    key={message.id}
                    colors={colors}
                    displayedText={getDisplayedMessageText(message)}
                    role={message.role}
                  />
                ))}

                {shouldShowLatestPlan && latestPlan ? (
                  <PlanCard
                    latestPlan={latestPlan}
                    isPhoneLayout={isPhoneLayout}
                    saving={savingPlan}
                    saved={savedSourceKeys.includes(latestPlan.sourceKey)}
                    onSavePlan={() => { void handleSavePlan(); }}
                    onBookNow={openBookingModal}
                    onBookTransport={openBookingModalForTransport}
                    onBookStay={openBookingModalForStay}
                    saveSuccess={saveSuccess}
                    saveError={saveError}
                    bookingSuccess={bookingSuccess}
                    bookingError={bookingError}
                    bookingEstimateLabel={bookingChargeBreakdown.totalLabel}
                  />
                ) : null}

                {followUpMessages.map((message) => (
                  <ChatMessageBubble
                    key={message.id}
                    colors={colors}
                    displayedText={getDisplayedMessageText(message)}
                    role={message.role}
                  />
                ))}

                {activePlanningLabel ? (
                  <View style={styles.planningMessageRow}>
                    <View
                      style={[
                        styles.planningAvatar,
                        { backgroundColor: colors.accentMuted, borderColor: colors.border },
                      ]}
                    >
                      <MaterialIcons name="auto-awesome" size={15} color={colors.accent} />
                    </View>
                    <View style={styles.planningMessageColumn}>
                      <Text style={[styles.messageRoleLabel, { color: colors.textMuted }]}>
                        {t("home.aiPlanner")}
                      </Text>
                      <View
                        style={[
                          styles.planningBubble,
                          { backgroundColor: colors.card, borderColor: colors.border },
                        ]}
                      >
                        <View style={styles.typingRow}>
                          <ActivityIndicator
                            size="small"
                            color={colors.accent}
                            style={styles.typingSpinner}
                          />
                          <Text style={[styles.planningText, { color: colors.textSecondary }]}>
                            {activePlanningLabel}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>
                ) : null}

                {error ? <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text> : null}
              </ScrollView>

              {showScrollToBottom ? (
                <TouchableOpacity
                  accessibilityLabel="Scroll to bottom"
                  style={[
                    styles.scrollToBottomButton,
                    {
                      backgroundColor: colors.accent,
                      bottom: Math.max(composerHeight + Spacing.md, Spacing["5xl"]),
                    },
                  ]}
                  onPress={() => {
                    scrollMessagesToBottom(true);
                  }}
                  activeOpacity={0.9}
                >
                  <MaterialIcons name="keyboard-double-arrow-down" size={20} color={colors.buttonTextOnAction} />
                </TouchableOpacity>
              ) : null}

              <ChatComposer
                chatInput={chatInput}
                canSend={canSend}
                planning={planning}
                step={currentPlannerState.step}
                colors={colors}
                insetBottom={isKeyboardOpen ? Spacing.md : insets.bottom + Spacing.md}
                onChangeText={setChatInput}
                onFocus={() => scrollMessagesToBottom(true)}
                onLayout={(event) => setComposerHeight(event.nativeEvent.layout.height)}
                planningLabel={activePlanningLabel}
                onSend={() => { void sendPlannerMessage(chatInput); }}
                onReset={() => { void resetConversation(); }}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </DismissKeyboard>

      <ChatDrawer
        chatMenuVisible={chatMenuVisible}
        chatSearch={chatSearch}
        chats={homeStore.chats}
        currentChatId={currentChat?.id ?? null}
        filteredChats={filteredChats}
        insetBottom={insets.bottom}
        insetTop={insets.top}
        isPhoneChatDrawerMounted={isPhoneChatDrawerMounted}
        isPhoneLayout={isPhoneLayout}
        onChatSearchChange={setChatSearch}
        onCloseChatMenu={() => setChatMenuVisible(false)}
        onClosePhoneDrawer={() => setIsPhoneChatMenuOpen(false)}
        onCreateChat={() => { void handleCreateChat(); }}
        onDeleteChat={(chat) => setPendingDeleteChat(chat)}
        onRenameChat={(chatId, currentTitle) => {
          setRenamingChatId(chatId);
          setRenameValue(currentTitle);
        }}
        onSaveRename={() => { void handleSaveRename(); }}
        onSelectChat={(chatId) => { void handleSelectChat(chatId); }}
        onTogglePin={(chatId) => { void handleTogglePin(chatId); }}
        phoneDrawerTranslateX={phoneDrawerTranslateX}
        phoneDrawerWidth={phoneDrawerWidth}
        renameValue={renameValue}
        renamingChatId={renamingChatId}
        setRenameValue={setRenameValue}
        setRenamingChatId={setRenamingChatId}
      />

      <ConfirmDialog
        visible={!!pendingDeleteChat}
        title={t("home.deleteChat")}
        message={
          pendingDeleteChat
            ? t("home.deleteChatConfirm")
            : ""
        }
        confirmLabel={t("common.delete")}
        destructive
        onCancel={() => setPendingDeleteChat(null)}
        onConfirm={() => {
          void confirmDeleteChat();
        }}
      />

      {latestPlan ? (
        <BookingModal
          visible={bookingModalVisible}
          latestPlan={latestPlan}
          bookingStage={bookingStage}
          bookingForm={bookingForm}
          bookingProcessing={bookingProcessing}
          bookingProgress={bookingProgress}
          bookingProgressLabel={bookingProgressLabel}
          bookingReceipt={bookingReceipt}
          bookingError={bookingError}
          bookingEstimateLabel={bookingChargeBreakdown.totalLabel}
          bookingPlatformFeeLabel={bookingChargeBreakdown.platformFeeLabel}
          bookingProviderLabel={bookingChargeBreakdown.providerLabel}
          bookingReservationStatusLabel={bookingChargeBreakdown.reservationStatusLabel}
          bookingSubtotalLabel={bookingChargeBreakdown.subtotalLabel}
          selectedTransport={selectedTransport}
          selectedTransportIndex={selectedTransportIndex}
          selectedStay={selectedStay}
          selectedStayIndex={selectedStayIndex}
          setSelectedTransportIndex={setSelectedTransportIndex}
          setSelectedStayIndex={setSelectedStayIndex}
          onClose={closeBookingModal}
          onConfirm={() => { void handleConfirmBooking(); }}
          onUpdateForm={setBookingForm}
          paymentMethods={paymentMethods}
        />
      ) : null}
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
  header: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    minHeight: 56,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  headerIconBtn: {
    alignItems: "center",
    height: 40,
    justifyContent: "center",
    padding: 4,
    width: 40,
  },
  headerAssistantAvatar: {
    alignItems: "center",
    borderRadius: Radius.full,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    marginLeft: Spacing.xs,
    position: "relative",
    width: 36,
  },
  headerStatusDot: {
    borderRadius: Radius.full,
    borderWidth: 2,
    bottom: -1,
    height: 11,
    position: "absolute",
    right: -1,
    width: 11,
  },
  headerCenter: {
    alignItems: "flex-start",
    flex: 1,
    paddingHorizontal: Spacing.md,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: FontWeight.bold,
  },
  headerSub: {
    ...TypeScale.labelSm,
    marginTop: 1,
  },
  chatArea: {
    flex: 1,
  },
  contextStrip: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  contextStripTitle: {
    ...TypeScale.labelSm,
    fontWeight: FontWeight.bold,
    textTransform: "uppercase",
    marginBottom: Spacing.sm,
    letterSpacing: 0,
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
    paddingBottom: Spacing["3xl"],
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
  messageRoleLabel: {
    ...TypeScale.labelSm,
    fontWeight: FontWeight.semibold,
    marginBottom: 3,
    marginLeft: Spacing.xs,
  },
  assistantMessageText: {},
  planningMessageRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    marginBottom: Spacing.md,
  },
  planningAvatar: {
    alignItems: "center",
    borderRadius: Radius.full,
    borderWidth: 1,
    height: 30,
    justifyContent: "center",
    marginBottom: 2,
    marginRight: Spacing.sm,
    width: 30,
  },
  planningMessageColumn: {
    maxWidth: "82%",
  },
  planningBubble: {
    borderRadius: Radius.xl,
    borderTopLeftRadius: Radius.sm,
    borderWidth: 1,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  typingRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  typingSpinner: {
    marginRight: Spacing.sm,
  },
  planningText: {
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.semibold,
  },
  errorText: {
    ...TypeScale.bodyMd,
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  scrollToBottomButton: {
    position: "absolute",
    right: Spacing.lg,
    bottom: Spacing.lg,
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
    ...shadow("md"),
  },
});
