import { MaterialIcons } from "@expo/vector-icons";
import Constants, { ExecutionEnvironment } from "expo-constants";
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
  formatGroundedTravelPlan,
  generateGroundedTravelPlan,
  getHomePlannerErrorMessage,
} from "../../utils/home-travel-planner";
import { getCurrencyConversionAnswer } from "../../utils/currency";
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
import type { AppLanguage } from "../../utils/translations";

import type { BookingCheckoutStage, BookingReceipt } from "../../features/home/types";
import {
  buildInitialAssistantMessage,
  getAutoChatTitle,
  getDefaultChatTitle,
  normalizeLatestPlan,
  parseCheckoutReturnState,
  wait,
} from "../../features/home/helpers";
import {
  formatPlannerDaysLabel,
  formatPlannerTravelersLabel,
} from "../../features/home/display-format";
import { ChatMessageBubble } from "../../features/home/components/ChatMessageBubble";
import { PlanCard } from "../../features/home/components/PlanCard";
import { BookingModal } from "../../features/home/components/BookingModal";
import { ChatComposer } from "../../features/home/components/ChatComposer";
import { ChatDrawer } from "../../features/home/components/ChatDrawer";

WebBrowser.maybeCompleteAuthSession();

type SpeechRecognitionModuleShape = {
  abort: () => void;
  stop: () => void;
  start: (options: Record<string, unknown>) => void;
  requestPermissionsAsync: () => Promise<{ granted: boolean }>;
  isRecognitionAvailable: () => boolean;
  addListener: (
    eventName: "start" | "end" | "result" | "error",
    listener: (event?: {
      error?: string;
      isFinal?: boolean;
      message?: string;
      results?: { transcript?: string }[];
    } | null) => void
  ) => { remove: () => void };
};

function loadSpeechRecognitionModule(): SpeechRecognitionModuleShape | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const speechModule = require("expo-speech-recognition") as {
      ExpoSpeechRecognitionModule?: SpeechRecognitionModuleShape;
    };

    return speechModule.ExpoSpeechRecognitionModule ?? null;
  } catch {
    return null;
  }
}

const speechRecognitionModule = loadSpeechRecognitionModule();

function getSpeechRecognitionLocale(language: AppLanguage) {
  switch (language) {
    case "de":
      return "de-DE";
    case "es":
      return "es-ES";
    case "fr":
      return "fr-FR";
    case "en":
      return "en-US";
    case "bg":
    default:
      return "bg-BG";
  }
}

function combineSpeechInput(baseText: string, transcript: string) {
  const trimmedTranscript = transcript.trim();

  if (!trimmedTranscript) {
    return baseText;
  }

  if (!baseText.trim()) {
    return trimmedTranscript;
  }

  return `${baseText.trimEnd()} ${trimmedTranscript}`;
}

function isExpoGoLikeClient() {
  return (
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
    Constants.appOwnership === "expo"
  );
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
  const [collapsedPlanKeys, setCollapsedPlanKeys] = useState<string[]>([]);
  const phoneDrawerTranslateX = useRef(new Animated.Value(-320)).current;
  const phoneDrawerWidth = Math.min(width * 0.84, 330);
  const typingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const homeFocusHandledRef = useRef(false);
  const [typingMessageId, setTypingMessageId] = useState<string | null>(null);
  const [typingVisibleText, setTypingVisibleText] = useState("");
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [isVoiceInputAvailable, setIsVoiceInputAvailable] = useState(false);
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const isKeyboardOpenRef = useRef(false);
  const keyboardHeightRef = useRef(0);
  const hasMeasuredMessagesLayoutRef = useRef(false);
  const voiceInputBaseRef = useRef("");
  const voiceInputTranscriptRef = useRef("");
  const languageRef = useRef(language);
  languageRef.current = language;

  const sortedChats = useMemo(
    () => sortHomePlannerChats(homeStore.chats),
    [homeStore.chats]
  );
  const currentProfileOrigin = profile?.personalProfile.homeBase.trim() ?? "";
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
    createEmptyPlannerState(
      buildInitialAssistantMessage(profileName, language, currentProfileOrigin)
    );
  const paymentMethods = useMemo(
    () => [t("home.paymentBankCard"), "Apple Pay", "Google Pay"],
    [t]
  );
  const archivedPlans = currentPlannerState.archivedPlans ?? [];
  const awaitingGenerationConfirmation =
    currentPlannerState.awaitingGenerationConfirmation === true;
  const latestPlan = currentPlannerState.latestPlan;
  const followUpMessages = currentPlannerState.followUpMessages ?? [];
  const planCardLabel =
    language === "en"
      ? "Offer"
      : language === "de"
        ? "Angebot"
        : language === "es"
          ? "Oferta"
          : language === "fr"
            ? "Offre"
            : "Оферта";
  const effectivePlannerOrigin = currentPlannerState.origin.trim() || currentProfileOrigin;
  const plannerOriginChip = effectivePlannerOrigin
    ? language === "en"
      ? `Start: ${effectivePlannerOrigin}`
      : `Старт: ${effectivePlannerOrigin}`
    : "";
  const plannerDestinationChip = currentPlannerState.destination.trim()
    ? language === "en"
      ? `End: ${currentPlannerState.destination.trim()}`
      : `Край: ${currentPlannerState.destination.trim()}`
    : "";
  const profileOriginActionLabel = currentProfileOrigin
    ? language === "en"
      ? `Current from profile: ${currentProfileOrigin}`
      : `Настояща от профила: ${currentProfileOrigin}`
    : "";
  const navigateToDiscoverFromOrigin = useCallback(() => {
    const target = effectivePlannerOrigin.trim();
    if (!target) {
      router.push("/(tabs)/discover");
      return;
    }
    router.push({
      pathname: "/(tabs)/discover",
      params: { origin: target },
    });
  }, [effectivePlannerOrigin, router]);
  const plannerContextChips = useMemo(
    () =>
      [
        {
          key: "origin",
          label: plannerOriginChip,
          onPress: effectivePlannerOrigin ? navigateToDiscoverFromOrigin : undefined,
        },
        { key: "budget", label: currentPlannerState.budget },
        { key: "days", label: formatPlannerDaysLabel(currentPlannerState.days, language) },
        {
          key: "travelers",
          label: formatPlannerTravelersLabel(currentPlannerState.travelers, language),
        },
        { key: "transport", label: currentPlannerState.transportPreference },
        { key: "timing", label: currentPlannerState.timing },
        { key: "destination", label: plannerDestinationChip },
        { key: "tripStyle", label: currentPlannerState.tripStyle },
      ]
        .map((chip) => ({ ...chip, label: chip.label.trim() }))
        .filter((chip) => chip.label.length > 0),
    [
      currentPlannerState.budget,
      currentPlannerState.days,
      currentPlannerState.timing,
      currentPlannerState.transportPreference,
      currentPlannerState.travelers,
      currentPlannerState.tripStyle,
      effectivePlannerOrigin,
      language,
      navigateToDiscoverFromOrigin,
      plannerDestinationChip,
      plannerOriginChip,
    ]
  );
  const messagesScrollRef = useRef<ScrollView | null>(null);
  const scrollViewLayoutHeight = useRef(0);
  const shouldStickToBottomRef = useRef(true);
  const lastPlannerMessage =
    currentPlannerState.messages[currentPlannerState.messages.length - 1] ?? null;
  const lastFollowUpMessage = followUpMessages[followUpMessages.length - 1] ?? null;
  const shouldShowLatestPlan = !!latestPlan;
  const plannerStatusText = planning
    ? currentPlannerState.step === "done"
      ? t("home.searchingPrices")
      : t("home.aiThinking")
    : currentChat?.title ?? t("home.newPlan");
  const conversationContentKey = [
    currentChat?.id ?? "no-chat",
    currentPlannerState.messages.length,
    lastPlannerMessage?.id ?? "no-message",
    archivedPlans.length,
    followUpMessages.length,
    lastFollowUpMessage?.id ?? "no-follow-up",
    planning ? "planning" : "idle",
    awaitingGenerationConfirmation ? "awaiting-confirm" : "no-confirm",
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
      selectedStay?.sourceLabel || selectedTransport?.sourceLabel || "Travel provider";
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
        ? `Stripe test плащането ще се запише тук, а финалната резервация ще продължи през ${providerLabel}.`
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
    selectedStay?.bookingUrl,
    selectedStay?.reservationMode,
    selectedStay?.sourceLabel,
    selectedTransport?.bookingUrl,
    selectedTransport?.sourceLabel,
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
      messagesScrollRef.current?.scrollToEnd({
        animated: Platform.OS === "ios" ? animated : false,
      });
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

  const stopVoiceInput = useCallback((abort = false) => {
    if (!speechRecognitionModule) {
      return;
    }

    try {
      if (abort) {
        speechRecognitionModule.abort();
      } else {
        speechRecognitionModule.stop();
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!speechRecognitionModule) {
      return;
    }

    const startSubscription = speechRecognitionModule.addListener("start", () => {
      voiceInputTranscriptRef.current = "";
      setIsVoiceListening(true);
      scrollMessagesToBottom(false);
    });
    const endSubscription = speechRecognitionModule.addListener("end", () => {
      if (voiceInputTranscriptRef.current.trim()) {
        setChatInput(
          combineSpeechInput(voiceInputBaseRef.current, voiceInputTranscriptRef.current)
        );
      }
      setIsVoiceListening(false);
    });
    const resultSubscription = speechRecognitionModule.addListener("result", (event) => {
      const transcript =
        event?.results
          ?.map((result) => result.transcript?.trim() ?? "")
          .filter(Boolean)
          .join(" ")
          .trim() ?? "";

      if (!transcript.trim()) {
        return;
      }

      voiceInputTranscriptRef.current = transcript;
      setChatInput(combineSpeechInput(voiceInputBaseRef.current, transcript));
    });
    const errorSubscription = speechRecognitionModule.addListener("error", (event) => {
      voiceInputTranscriptRef.current = "";
      setIsVoiceListening(false);

      if (event?.error === "aborted" || event?.error === "no-speech") {
        return;
      }

      setError(event?.message || t("home.voiceInputFailed"));
    });

    return () => {
      startSubscription.remove();
      endSubscription.remove();
      resultSubscription.remove();
      errorSubscription.remove();
    };
  }, [scrollMessagesToBottom, t]);

  useEffect(() => {
    return () => {
      clearTypingAnimation();
      if (scrollTimerRef.current) {
        clearTimeout(scrollTimerRef.current);
      }
      stopVoiceInput(true);
    };
  }, [clearTypingAnimation, stopVoiceInput]);

  useEffect(() => {
    try {
      setIsVoiceInputAvailable(
        !!speechRecognitionModule && speechRecognitionModule.isRecognitionAvailable()
      );
    } catch {
      setIsVoiceInputAvailable(false);
    }
  }, [isFocused]);

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

      if (shouldStickToBottomRef.current) {
        scrollMessagesToBottom(false);
      }
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
    if (planning && isVoiceListening) {
      stopVoiceInput(true);
    }
  }, [isVoiceListening, planning, stopVoiceInput]);

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
              buildInitialAssistantMessage(
                nextProfileName,
                languageRef.current,
                nextProfile.personalProfile.homeBase
              )
            )
          );
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
    hasMeasuredMessagesLayoutRef.current = false;
    voiceInputBaseRef.current = "";
    voiceInputTranscriptRef.current = "";
    if (isVoiceListening) {
      stopVoiceInput(true);
    }
    scrollMessagesToBottom(false);
  }, [clearTypingAnimation, currentChat?.id, isVoiceListening, scrollMessagesToBottom, stopVoiceInput]);

  const canSend = chatInput.trim().length > 0 && !planning;

  const buildPlanKey = useCallback(
    (sourceKey: string) => (currentChat ? `${currentChat.id}:${sourceKey}` : ""),
    [currentChat]
  );

  const togglePlanCollapsed = useCallback((planKey: string) => {
    if (!planKey) {
      return;
    }

    setCollapsedPlanKeys((currentKeys) =>
      currentKeys.includes(planKey)
        ? currentKeys.filter((key) => key !== planKey)
        : [...currentKeys, planKey]
    );
  }, []);

  const handleStartVoiceInput = useCallback(async () => {
    if (planning) {
      return;
    }

    if (isVoiceListening) {
      return;
    }

    try {
      setError("");

      if (!speechRecognitionModule) {
        setIsVoiceInputAvailable(false);
        setError(t("home.voiceInputNeedsDevBuild"));
        return;
      }

      if (Platform.OS !== "web" && isExpoGoLikeClient()) {
        setError(t("home.voiceInputNeedsDevBuild"));
        return;
      }

      const available = speechRecognitionModule.isRecognitionAvailable();
      setIsVoiceInputAvailable(available);

      if (!available) {
        setError(t("home.voiceInputUnavailable"));
        return;
      }

      const permission = await speechRecognitionModule.requestPermissionsAsync();

      if (!permission.granted) {
        setError(t("home.voiceInputPermissionDenied"));
        return;
      }

      voiceInputBaseRef.current = chatInput;
      voiceInputTranscriptRef.current = "";
      setIsVoiceListening(true);
      scrollMessagesToBottom(false);
      speechRecognitionModule.start({
        lang: getSpeechRecognitionLocale(language),
        interimResults: true,
        maxAlternatives: 1,
        continuous: false,
        addsPunctuation: Platform.OS === "ios",
        androidIntentOptions:
          Platform.OS === "android"
            ? {
                EXTRA_LANGUAGE_MODEL: "free_form",
                EXTRA_PARTIAL_RESULTS: true,
              }
            : undefined,
        requiresOnDeviceRecognition: Platform.OS === "ios",
      });
    } catch (nextError) {
      console.warn("Voice input failed to start", nextError);
      setIsVoiceListening(false);
      setError(t("home.voiceInputFailed"));
    }
  }, [
    chatInput,
    isVoiceListening,
    language,
    planning,
    scrollMessagesToBottom,
    stopVoiceInput,
    t,
  ]);

  const handleStopVoiceInput = useCallback(() => {
    if (!isVoiceListening) {
      return;
    }

    stopVoiceInput(false);
  }, [isVoiceListening, stopVoiceInput]);

  const handleToggleVoiceInput = useCallback(() => {
    if (isVoiceListening) {
      handleStopVoiceInput();
      return;
    }

    void handleStartVoiceInput();
  }, [handleStartVoiceInput, handleStopVoiceInput, isVoiceListening]);

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

    if (sortedChats.length > 0) {
      return;
    }

    const nextChat = createHomePlannerChat(
      buildInitialAssistantMessage(profileName, language, currentProfileOrigin),
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
    const initialMessageWithOrigin = buildInitialAssistantMessage(
      profileName,
      language,
      currentProfileOrigin
    );
    const nextChat = createHomePlannerChat(
      initialMessageWithOrigin,
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
              buildInitialAssistantMessage(profileName, language, currentProfileOrigin)
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

  const buildPlannerSnapshot = (state: typeof currentPlannerState): PlannerIntakeSnapshot => ({
    budget: state.budget,
    days: state.days,
    destination: state.destination,
    notes: state.notes,
    origin: state.origin,
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
    origin: snapshot.origin,
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

  const normalizePlannerIntentText = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const includesAnyIntentFragment = (value: string, fragments: string[]) =>
    fragments.some((fragment) => value.includes(fragment));

  const isOfferGenerationConfirmation = (value: string) => {
    const normalized = value.trim().toLowerCase();
    const intentText = normalizePlannerIntentText(value);
    const hasOfferIntent = includesAnyIntentFragment(intentText, [
      "оферт",
      "offer",
      "quote",
      "deal",
    ]);
    const hasGenerateIntent = includesAnyIntentFragment(intentText, [
      "генер",
      "generate",
      "направ",
      "дай",
      "искам",
      "пусн",
      "старт",
    ]);
    const hasDelayIntent = includesAnyIntentFragment(intentText, [
      "въпрос",
      "question",
      "питай",
      "ask",
      "уточ",
      "refin",
      "допъл",
      "detail",
      "инфо",
      "information",
      "not yet",
      "later",
    ]);

    if (
      new Set([
        "да",
        "yes",
        "ok",
        "okay",
        "sure",
        "готово",
        "става",
        "айде",
        "добре",
        "go ahead",
        "lets do it",
      ]).has(intentText)
    ) {
      return true;
    }

    if (hasOfferIntent && hasGenerateIntent && !hasDelayIntent) {
      return true;
    }

    if (hasGenerateIntent && !hasDelayIntent && intentText.length <= 24) {
      return true;
    }

    const wantsOfferNow =
      normalized.includes("оферта") &&
      (
        normalized.includes("дай") ||
        normalized.includes("искам") ||
        normalized.includes("направи") ||
        normalized.includes("генерирай")
      );

    return (
      normalized === "да" ||
      normalized === "yes" ||
      normalized === "ok" ||
      normalized === "okay" ||
      normalized === "готово" ||
      normalized === "generate" ||
      normalized === "генерирай" ||
      normalized === "направи оферта" ||
      normalized === "дай оферта" ||
      normalized.includes("генерирай") ||
      normalized.includes("дай оферта") ||
      normalized.includes("готов съм") ||
      normalized.includes("go ahead") ||
      normalized.includes("дай ми оферта") ||
      normalized.includes("искам оферта") ||
      normalized.includes("направи ми оферта") ||
      normalized.includes("генерирай офертата") ||
      normalized.includes("направо оферта") ||
      normalized.includes("оферта сега") ||
      normalized.includes("всъщност дай ми оферта") ||
      wantsOfferNow
    );
  };

  const isOfferGenerationDeferral = (value: string) => {
    const normalized = value.trim().toLowerCase();
    const intentText = normalizePlannerIntentText(value);
    const wantsMoreQuestions = includesAnyIntentFragment(intentText, [
      "въпрос",
      "question",
      "питай",
      "ask",
      "още",
      "more",
      "уточ",
      "refin",
      "допъл",
      "detail",
      "детайл",
      "инфо",
      "information",
      "чак",
      "not yet",
      "later",
    ]);
    const wantsGenerateNow =
      includesAnyIntentFragment(intentText, ["оферт", "offer", "генер", "generate"]) &&
      includesAnyIntentFragment(intentText, ["дай", "искам", "направ", "генер", "пусн"]);

    if (wantsMoreQuestions && !wantsGenerateNow) {
      return true;
    }

    return (
      normalized === "не" ||
      normalized.includes("още въпрос") ||
      normalized.includes("още информация") ||
      normalized.includes("още детайл") ||
      normalized.includes("искам да допълня") ||
      normalized.includes("нека допълня") ||
      normalized.includes("чакай") ||
      normalized.includes("not yet") ||
      normalized.includes("more info") ||
      normalized.includes("more questions") ||
      normalized.includes("дай въпрос") ||
      normalized.includes("дай някой въпрос") ||
      normalized.includes("дай ми въпрос") ||
      normalized.includes("задай въпрос") ||
      normalized.includes("питай още") ||
      normalized.includes("дай още въпрос") ||
      normalized.includes("дай още въпроси") ||
      normalized.includes("искам още въпроси") ||
      normalized.includes("искам въпрос")
    );
  };

  const getOfferConfirmationPrompt = () => {
    if (language === "en") {
      return "I already have enough information for an offer. Do you want me to generate it now, should I ask 1-2 more questions, or do you want to add more details first?";
    }

    return "Имам достатъчно информация за оферта. Искаш ли да я генерирам сега, да ти задам още 1-2 въпроса, или първо искаш да добавиш още детайли?";
  };

  const getOfferDeferralPrompt = () => {
    if (language === "en") {
      return "Perfect, let's refine it a bit more. You can add more details yourself, or tell me what to refine first: destination, dates, budget, transport, vibe, or something else.";
    }

    return "Супер, нека го доуточним още малко. Можеш директно да добавиш повече информация или да ми кажеш какво да уточним първо: дестинация, дати, бюджет, транспорт, вайб или нещо друго.";
  };

  const getOfferDeferralQuestion = (snapshot: PlannerIntakeSnapshot) => {
    if (!snapshot.origin.trim()) {
      if (language === "en") {
        return currentProfileOrigin
          ? `Where are you starting from? If you want, I can use your current profile location: ${currentProfileOrigin}.`
          : "Where are you starting from?";
      }

      return currentProfileOrigin
        ? `От къде тръгваш? Ако искаш, мога да ползвам настоящата точка от профила ти: ${currentProfileOrigin}.`
        : "От къде тръгваш?";
    }

    if (!snapshot.tripStyle.trim()) {
      if (language === "en") {
        return "What vibe do you want for the trip: chill, food, culture, nightlife, nature, or something else?";
      }

      return "Какъв вайб искаш да има офертата: chill, food, culture, nightlife, nature или нещо друго?";
    }

    if (!snapshot.notes.trim()) {
      if (language === "en") {
        return "Is there anything important you want me to definitely include in the offer?";
      }

      return "Има ли нещо важно, което искаш задължително да включа в офертата?";
    }

    if (language === "en") {
      return "Which one should I refine first before I generate the offer: destination, dates, budget, transport, or stay type?";
    }

    return "Кое искаш да доуточним първо преди да генерирам офертата: дестинация, дати, бюджет, транспорт или тип настаняване?";
  };

  const runPlanGeneration = async (
    snapshot: PlannerIntakeSnapshot,
    messagesAfterUser: HomeChatMessage[],
    options?: {
      archivedPlans?: typeof archivedPlans;
      existingPlan?: typeof latestPlan;
      leadMessages?: HomeChatMessage[];
      tailMessages?: HomeChatMessage[];
    }
  ) => {
    if (!profile) {
      return false;
    }

    const searchingMessage = createHomeChatMessage("assistant", t("home.preparingRoute"));
    const messagesWhilePlanning = [...messagesAfterUser, searchingMessage];
    const existingPlan = options?.existingPlan ?? null;
    const archivedPlanBlocks = options?.archivedPlans ?? [];
    const leadMessages = options?.leadMessages ?? [];
    const tailMessages = options?.tailMessages ?? messagesAfterUser;

    await replaceCurrentChatWithAssistant(
      (chat) => ({
        ...chat,
        updatedAtMs: Date.now(),
        state: {
          ...applySnapshotToState(chat.state, snapshot, "done"),
          archivedPlans: archivedPlanBlocks,
          awaitingGenerationConfirmation: false,
          followUpMessages: existingPlan ? [...tailMessages, searchingMessage] : [],
          latestPlan: existingPlan ?? chat.state.latestPlan,
          messages: existingPlan ? leadMessages : messagesWhilePlanning,
        },
      }),
      searchingMessage
    );

    try {
      const plan = await generateGroundedTravelPlan({
        budget: snapshot.budget,
        days: snapshot.days,
        destination: snapshot.destination,
        language,
        notes: snapshot.notes,
        origin: snapshot.origin || currentProfileOrigin,
        timing: snapshot.timing,
        transportPreference: snapshot.transportPreference,
        travelers: snapshot.travelers,
        profile,
        tripStyle: snapshot.tripStyle,
      });
      const readyMessage = createHomeChatMessage("assistant", t("home.planReady"));
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
          title: getAutoChatTitle(chat.title, snapshot.destination, plan.title, language),
          updatedAtMs: Date.now(),
          state: {
            ...applySnapshotToState(chat.state, snapshot, "done"),
            archivedPlans:
              existingPlan
                ? [
                    ...archivedPlanBlocks,
                    {
                      plan: existingPlan,
                      trailingMessages: [...tailMessages, readyMessage],
                    },
                  ]
                : archivedPlanBlocks,
            awaitingGenerationConfirmation: false,
            followUpMessages: [],
            latestPlan: nextLatestPlan,
            messages: existingPlan ? leadMessages : [...messagesWhilePlanning, readyMessage],
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
            ...applySnapshotToState(chat.state, snapshot, "chatting"),
            archivedPlans: archivedPlanBlocks,
            awaitingGenerationConfirmation: false,
            followUpMessages: existingPlan ? [...tailMessages, errorMessage] : [],
            latestPlan: existingPlan ?? chat.state.latestPlan,
            messages: existingPlan ? leadMessages : [...messagesAfterUser, errorMessage],
          },
        }),
        errorMessage
      );
      scrollMessagesToBottom(true);
      return false;
    }
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
    const archivedPlanBlocks = plannerState.archivedPlans ?? [];
    const hasPinnedPlan = !!plannerState.latestPlan;
    const leadMessages = plannerState.messages;
    const tailMessages = plannerState.followUpMessages ?? [];
    const contextMessages = hasPinnedPlan ? [...leadMessages, ...tailMessages] : leadMessages;
    const userMessage = createHomeChatMessage("user", value);
    const messagesAfterUser = [...contextMessages, userMessage];
    const leadMessagesAfterUser = hasPinnedPlan ? leadMessages : messagesAfterUser;
    const tailMessagesAfterUser = hasPinnedPlan ? [...tailMessages, userMessage] : [];
    const currentSnapshot = buildPlannerSnapshot(plannerState);

    // Show the user's message and planning state immediately
    setPlanning(true);
    shouldStickToBottomRef.current = true;
    const nextChats = sortHomePlannerChats(
      homeStore.chats.map((chat) =>
        chat.id === currentChat.id
          ? {
              ...chat,
              updatedAtMs: Date.now(),
              state: {
              ...chat.state,
              archivedPlans: archivedPlanBlocks,
              awaitingGenerationConfirmation: false,
              followUpMessages: tailMessagesAfterUser,
              messages: leadMessagesAfterUser,
            },
            }
          : chat
      )
    );
    setHomeStore({ ...homeStore, chats: nextChats, currentChatId: currentChat.id });
    scrollMessagesToBottom(true);

    try {
      const currencyConversionAnswer = await getCurrencyConversionAnswer(
        value,
        language,
        currentSnapshot.budget
      );

      if (currencyConversionAnswer) {
        const assistantMessage = createHomeChatMessage("assistant", currencyConversionAnswer);

        await replaceCurrentChatWithAssistant(
          (chat) => ({
            ...chat,
            updatedAtMs: Date.now(),
            state: {
              ...chat.state,
              archivedPlans: archivedPlanBlocks,
              awaitingGenerationConfirmation: false,
              followUpMessages: hasPinnedPlan
                ? [...tailMessagesAfterUser, assistantMessage]
                : [],
              latestPlan: chat.state.latestPlan,
              messages: hasPinnedPlan
                ? leadMessages
                : [...messagesAfterUser, assistantMessage],
            },
          }),
          assistantMessage
        );
        scrollMessagesToBottom(true);
        return;
      }

      if (plannerState.awaitingGenerationConfirmation) {
        if (isOfferGenerationConfirmation(value)) {
          await runPlanGeneration(currentSnapshot, messagesAfterUser, {
            archivedPlans: archivedPlanBlocks,
            existingPlan: plannerState.latestPlan,
            leadMessages,
            tailMessages: tailMessagesAfterUser,
          });
          return;
        }

        if (isOfferGenerationDeferral(value)) {
          const assistantMessage = createHomeChatMessage(
            "assistant",
            getOfferDeferralQuestion(currentSnapshot)
          );

          await replaceCurrentChatWithAssistant(
            (chat) => ({
              ...chat,
              updatedAtMs: Date.now(),
              state: {
                ...chat.state,
                archivedPlans: archivedPlanBlocks,
                awaitingGenerationConfirmation: false,
                followUpMessages: hasPinnedPlan
                  ? [...tailMessagesAfterUser, assistantMessage]
                  : [],
                latestPlan: chat.state.latestPlan,
                messages: hasPinnedPlan
                  ? leadMessages
                  : [...messagesAfterUser, assistantMessage],
                step: "chatting",
              },
            }),
            assistantMessage
          );
          scrollMessagesToBottom(true);
          return;
        }
      }

      if (plannerState.step === "done" && isPlannerRegenerateCommand(value)) {
        await runPlanGeneration(currentSnapshot, messagesAfterUser, {
          archivedPlans: archivedPlanBlocks,
          existingPlan: plannerState.latestPlan,
          leadMessages,
          tailMessages: tailMessagesAfterUser,
        });
        return;
      }

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
            updatedAtMs: Date.now(),
            state: {
              ...applySnapshotToState(chat.state, intakeTurn.snapshot, "chatting"),
              archivedPlans: archivedPlanBlocks,
              awaitingGenerationConfirmation: false,
              followUpMessages: hasPinnedPlan
                ? [...tailMessagesAfterUser, assistantMessage]
                : [],
              latestPlan: chat.state.latestPlan,
              messages: hasPinnedPlan
                ? leadMessages
                : [...messagesAfterUser, assistantMessage],
            },
          }),
          assistantMessage
        );
        scrollMessagesToBottom(true);
        return;
      }

      if (isOfferGenerationConfirmation(value)) {
        const readySnapshot = intakeTurn.snapshot;
        const messagesForGeneration = hasPinnedPlan
          ? [...leadMessages, ...tailMessagesAfterUser]
          : messagesAfterUser;

        await runPlanGeneration(readySnapshot, messagesForGeneration, {
          archivedPlans: archivedPlanBlocks,
          existingPlan: plannerState.latestPlan,
          leadMessages,
          tailMessages: tailMessagesAfterUser,
        });
        return;
      }

      const assistantMessage = createHomeChatMessage("assistant", getOfferConfirmationPrompt());

      await replaceCurrentChatWithAssistant(
        (chat) => ({
          ...chat,
          updatedAtMs: Date.now(),
          state: {
            ...applySnapshotToState(chat.state, intakeTurn.snapshot, "chatting"),
            archivedPlans: archivedPlanBlocks,
            awaitingGenerationConfirmation: true,
            followUpMessages: hasPinnedPlan
              ? [...tailMessagesAfterUser, assistantMessage]
              : [],
            latestPlan: chat.state.latestPlan,
            messages: hasPinnedPlan
              ? leadMessages
              : [...messagesAfterUser, assistantMessage],
          },
        }),
        assistantMessage
      );
      scrollMessagesToBottom(true);
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
              archivedPlans: archivedPlanBlocks,
              awaitingGenerationConfirmation: false,
              followUpMessages: hasPinnedPlan
                ? [...tailMessagesAfterUser, errorMessage]
                : [],
              latestPlan: chat.state.latestPlan,
              messages: hasPinnedPlan
                ? leadMessages
                : [...messagesAfterUser, errorMessage],
              step: "chatting",
            },
          }),
        errorMessage
      );
      scrollMessagesToBottom(true);
    } finally {
      setPlanning(false);
    }
  };

  const handleUseProfileOrigin = () => {
    if (!currentProfileOrigin || planning) {
      return;
    }

    void sendPlannerMessage(
      language === "en"
        ? `Use my current profile location as the trip origin: ${currentProfileOrigin}`
        : `Ползвай настоящата точка от профила ми като начало: ${currentProfileOrigin}`
    );
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

  const renderPlanSection = (
    plan: NonNullable<typeof latestPlan>,
    allowActions: boolean
  ) => {
    const planKey = buildPlanKey(plan.sourceKey);
    const isCollapsed = planKey ? collapsedPlanKeys.includes(planKey) : false;

    return (
      <View
        key={planKey || plan.sourceKey}
        style={[
          styles.planCardSection,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <TouchableOpacity
          activeOpacity={0.88}
          onPress={() => {
            togglePlanCollapsed(planKey);
          }}
          style={styles.planCardToggle}
        >
          <View style={styles.planCardToggleLeft}>
            <View
              style={[
                styles.planCardToggleIcon,
                { backgroundColor: colors.accentMuted },
              ]}
            >
              <MaterialIcons
                color={colors.accent}
                name={isCollapsed ? "keyboard-arrow-right" : "keyboard-arrow-down"}
                size={22}
              />
            </View>
            <View style={styles.planCardToggleTextWrap}>
              <Text style={[styles.planCardToggleLabel, { color: colors.textPrimary }]}>
                {planCardLabel}
              </Text>
              <Text style={[styles.planCardToggleMeta, { color: colors.textMuted }]}>
                {[plan.destination, plan.days, plan.budget].filter(Boolean).join(" • ")}
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        {!isCollapsed ? (
          <PlanCard
            latestPlan={plan}
            isPhoneLayout={isPhoneLayout}
            saving={allowActions ? savingPlan : false}
            saved={savedSourceKeys.includes(plan.sourceKey)}
            onSavePlan={() => {
              if (allowActions) {
                void handleSavePlan();
              }
            }}
            onBookNow={allowActions ? openBookingModal : () => {}}
            onBookTransport={allowActions ? openBookingModalForTransport : () => {}}
            onBookStay={allowActions ? openBookingModalForStay : () => {}}
            saveSuccess={allowActions ? saveSuccess : ""}
            saveError={allowActions ? saveError : ""}
            bookingSuccess={allowActions ? bookingSuccess : ""}
            bookingError={allowActions ? bookingError : ""}
            bookingEstimateLabel={bookingChargeBreakdown.totalLabel}
          />
        ) : null}
      </View>
    );
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
                activeOpacity={0.86}
                onPress={() => {
                  void handleCreateChat();
                }}
                style={[styles.headerNewPlanButton, { backgroundColor: colors.accent }]}
              >
                <MaterialIcons color={colors.buttonTextOnAction} name="add" size={19} />
                <Text style={[styles.headerNewPlanButtonText, { color: colors.buttonTextOnAction }]}>
                  {t("home.newPlan")}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.chatArea}>
              {plannerContextChips.length > 0 ? (
                <View style={[styles.contextStrip, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
                  <Text style={[styles.contextStripTitle, { color: colors.textMuted }]}>
                    {t("home.currentPlan")}
                  </Text>
                  <View style={styles.profileMetaRow}>
                    {plannerContextChips.map((chip) => {
                      const chipBody = (
                        <Text style={[styles.profileMetaChipText, { color: colors.textPrimary }]}>
                          {chip.label}
                        </Text>
                      );

                      if (chip.onPress) {
                        return (
                          <TouchableOpacity
                            key={chip.key}
                            activeOpacity={0.85}
                            onPress={chip.onPress}
                            style={[
                              styles.profileMetaChip,
                              {
                                backgroundColor: colors.inputBackground,
                                borderColor: colors.inputBorder,
                              },
                            ]}
                          >
                            {chipBody}
                          </TouchableOpacity>
                        );
                      }

                      return (
                        <View
                          key={chip.key}
                          style={[
                            styles.profileMetaChip,
                            {
                              backgroundColor: colors.inputBackground,
                              borderColor: colors.inputBorder,
                            },
                          ]}
                        >
                          {chipBody}
                        </View>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              {currentProfileOrigin ? (
                <TouchableOpacity
                  activeOpacity={0.86}
                  disabled={planning}
                  onPress={handleUseProfileOrigin}
                  style={[
                    styles.currentOriginButton,
                    {
                      backgroundColor: colors.cardAlt,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <MaterialIcons
                    color={colors.accent}
                    name="my-location"
                    size={16}
                  />
                  <Text style={[styles.currentOriginButtonText, { color: colors.textPrimary }]}>
                    {profileOriginActionLabel}
                  </Text>
                </TouchableOpacity>
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

                  if (!hasMeasuredMessagesLayoutRef.current) {
                    hasMeasuredMessagesLayoutRef.current = true;
                    scrollMessagesToBottom(false);
                  }
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

                {archivedPlans.map((block, blockIndex) => (
                  <React.Fragment key={`${block.plan.sourceKey}-${blockIndex}`}>
                    {renderPlanSection(block.plan, false)}
                    {block.trailingMessages.map((message) => (
                      <ChatMessageBubble
                        key={message.id}
                        colors={colors}
                        displayedText={getDisplayedMessageText(message)}
                        role={message.role}
                      />
                    ))}
                  </React.Fragment>
                ))}

                {shouldShowLatestPlan && latestPlan ? (
                  renderPlanSection(latestPlan, true)
                ) : null}

                {followUpMessages.map((message) => (
                  <ChatMessageBubble
                    key={message.id}
                    colors={colors}
                    displayedText={getDisplayedMessageText(message)}
                    role={message.role}
                  />
                ))}

                {planning ? (
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
                            {currentPlannerState.step === "done"
                              ? t("home.searchingPrices")
                              : t("home.aiThinking")}
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
                onFocus={() => scrollMessagesToBottom(Platform.OS === "ios")}
                onLayout={(event) => setComposerHeight(event.nativeEvent.layout.height)}
                onSend={() => {
                  if (isVoiceListening) {
                    stopVoiceInput(true);
                  }
                  void sendPlannerMessage(chatInput);
                }}
                onStartVoiceInput={() => { void handleStartVoiceInput(); }}
                onStopVoiceInput={handleStopVoiceInput}
                onToggleVoiceInput={() => { void handleToggleVoiceInput(); }}
                voiceAvailable={isVoiceInputAvailable}
                voiceListening={isVoiceListening}
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
  headerNewPlanButton: {
    alignItems: "center",
    borderRadius: Radius.full,
    flexDirection: "row",
    gap: Spacing.xs,
    minHeight: 40,
    paddingHorizontal: Spacing.md,
    paddingVertical: 9,
  },
  headerNewPlanButtonText: {
    ...TypeScale.bodySm,
    fontWeight: FontWeight.extrabold,
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
  currentOriginButton: {
    alignItems: "center",
    borderRadius: Radius.full,
    borderWidth: 1,
    flexDirection: "row",
    gap: Spacing.xs,
    marginBottom: Spacing.md,
    marginHorizontal: Spacing.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  currentOriginButtonText: {
    ...TypeScale.labelMd,
    flex: 1,
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
  planCardSection: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    marginBottom: Spacing.md,
    overflow: "hidden",
  },
  planCardToggle: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  planCardToggleLeft: {
    alignItems: "center",
    flexDirection: "row",
    flex: 1,
    gap: Spacing.sm,
  },
  planCardToggleIcon: {
    alignItems: "center",
    borderRadius: Radius.full,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  planCardToggleTextWrap: {
    flex: 1,
  },
  planCardToggleLabel: {
    ...TypeScale.bodySm,
    fontWeight: FontWeight.extrabold,
  },
  planCardToggleMeta: {
    ...TypeScale.labelMd,
    marginTop: 2,
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
