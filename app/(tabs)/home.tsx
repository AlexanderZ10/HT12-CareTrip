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
  formatGroundedTravelPlan,
  generateConversationalResponse,
  generateGroundedTravelFollowUp,
  generateGroundedTravelPlan,
  getHomePlannerErrorMessage,
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
  getPlannerGenerationDefaults,
  getStepTitle,
  normalizeLatestPlan,
  parseCheckoutReturnState,
  wait,
} from "../../features/home/helpers";
import { ChatMessageBubble } from "../../features/home/components/ChatMessageBubble";
import { PlanCard } from "../../features/home/components/PlanCard";
import { BookingModal } from "../../features/home/components/BookingModal";
import { QuickReplies } from "../../features/home/components/QuickReplies";
import { ChatComposer } from "../../features/home/components/ChatComposer";
import { ChatDrawer } from "../../features/home/components/ChatDrawer";

WebBrowser.maybeCompleteAuthSession();

export default function HomeTabScreen() {
  const { colors } = useAppTheme();
  const { language, languageForPrompt, t } = useAppLanguage();
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
  const phoneDrawerTranslateX = useRef(new Animated.Value(-320)).current;
  const phoneDrawerWidth = Math.min(width * 0.84, 330);
  const typingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const homeFocusHandledRef = useRef(false);
  const [typingMessageId, setTypingMessageId] = useState<string | null>(null);
  const [typingVisibleText, setTypingVisibleText] = useState("");
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const isKeyboardOpenRef = useRef(false);
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
    currentChat?.state ??
    createEmptyPlannerState(buildInitialAssistantMessage(profileName, language));
  const plannerDefaults = useMemo(
    () => getPlannerGenerationDefaults(language),
    [language]
  );
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
      ].map((value) => value.trim()).filter(Boolean),
    [
      currentPlannerState.budget,
      currentPlannerState.days,
      currentPlannerState.destination,
      currentPlannerState.timing,
      currentPlannerState.transportPreference,
      currentPlannerState.travelers,
    ]
  );
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
        totalLabel: t("home.priceOnRequest"),
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
          setHomeStore(
            parseStoredHomePlannerStore(
              profileData,
              buildInitialAssistantMessage(nextProfileName, language)
            )
          );
          setLoading(false);
        },
        (nextError) => {
          setError(getFirestoreUserMessage(nextError, "read", language));
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
    return scrollMessagesToBottom(false);
  }, [clearTypingAnimation, currentChat?.id, scrollMessagesToBottom]);

  const quickReplies = useMemo(() => {
    return [];
  }, []);

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
          t("home.refineOrNewRoute")
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
          language: languageForPrompt,
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
        const message = getHomePlannerErrorMessage(nextError, language);
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

    if (plannerState.step === "chatting") {
      setPlanning(true);

      await replaceCurrentChat((chat) => ({
        ...chat,
        updatedAtMs: Date.now(),
        state: {
          ...chat.state,
          messages: messagesAfterUser,
          step: "chatting",
        },
      }));

      try {
        const conversationHistory = messagesAfterUser.map((m) => ({
          role: m.role,
          text: m.text,
        }));

        const response = await generateConversationalResponse({
          conversationHistory,
          language: languageForPrompt,
          profile,
        });

        const extracted = response.extractedInfo;

        if (response.readyToGenerate && extracted.destination) {
          const searchingMessage = createHomeChatMessage(
            "assistant",
            t("home.preparingRoute")
          );
          const messagesWhilePlanning = [...messagesAfterUser, searchingMessage];

          await replaceCurrentChatWithAssistant((chat) => ({
            ...chat,
            updatedAtMs: Date.now(),
            state: {
              ...chat.state,
              budget: extracted.budget || chat.state.budget,
              days: extracted.days || chat.state.days,
              destination: extracted.destination,
              timing: extracted.timing || chat.state.timing,
              transportPreference: extracted.transportPreference || chat.state.transportPreference,
              travelers: extracted.travelers || chat.state.travelers,
              followUpMessages: [],
              latestPlan: null,
              messages: messagesWhilePlanning,
              step: "done",
            },
          }), searchingMessage);

          const plan = await generateGroundedTravelPlan({
            budget: extracted.budget || plannerDefaults.budget,
            days: extracted.days || plannerDefaults.days,
            destination: extracted.destination,
            language: languageForPrompt,
            timing: extracted.timing || plannerDefaults.timing,
            transportPreference:
              extracted.transportPreference || plannerDefaults.transportPreference,
            travelers: extracted.travelers || plannerDefaults.travelers,
            profile,
          });

          const readyMessage = createHomeChatMessage(
            "assistant",
            t("home.planReady")
          );
          const formattedPlanText = formatGroundedTravelPlan(plan);
          const nextLatestPlan = normalizeLatestPlan({
            budget: extracted.budget || plannerDefaults.budget,
            days: extracted.days || plannerDefaults.days,
            destination: extracted.destination,
            formattedPlanText,
            timing: extracted.timing || plannerDefaults.timing,
            transportPreference:
              extracted.transportPreference || plannerDefaults.transportPreference,
            travelers: extracted.travelers || plannerDefaults.travelers,
            plan,
            sourceKey: getHomeSavedSourceKey({
              budget: extracted.budget || "",
              days: extracted.days || "",
              destination: extracted.destination,
              formattedPlanText,
            }),
          });

          await replaceCurrentChatWithAssistant((chat) => ({
            ...chat,
            title: getAutoChatTitle(chat.title, extracted.destination, plan.title, language),
            updatedAtMs: Date.now(),
            state: {
              ...chat.state,
              destination: extracted.destination,
              budget: extracted.budget || chat.state.budget,
              days: extracted.days || chat.state.days,
              timing: extracted.timing || chat.state.timing,
              transportPreference: extracted.transportPreference || chat.state.transportPreference,
              travelers: extracted.travelers || chat.state.travelers,
              followUpMessages: [],
              latestPlan: nextLatestPlan,
              messages: [...messagesWhilePlanning, readyMessage],
              step: "done",
            },
          }), readyMessage);
        } else {
          const assistantMessage = createHomeChatMessage("assistant", response.message);

          await replaceCurrentChatWithAssistant((chat) => ({
            ...chat,
            updatedAtMs: Date.now(),
            state: {
              ...chat.state,
              budget: extracted.budget || chat.state.budget,
              days: extracted.days || chat.state.days,
              destination: extracted.destination || chat.state.destination,
              timing: extracted.timing || chat.state.timing,
              transportPreference: extracted.transportPreference || chat.state.transportPreference,
              travelers: extracted.travelers || chat.state.travelers,
              messages: [...messagesAfterUser, assistantMessage],
              step: "chatting",
            },
          }), assistantMessage);
        }

        scrollMessagesToBottom(true);
      } catch (nextError) {
        const message = getHomePlannerErrorMessage(nextError, language);
        const errorMessage = createHomeChatMessage("assistant", message);
        setError(message);

        await replaceCurrentChatWithAssistant((chat) => ({
          ...chat,
          updatedAtMs: Date.now(),
          state: {
            ...chat.state,
            messages: [...messagesAfterUser, errorMessage],
            step: "chatting",
          },
        }), errorMessage);
        scrollMessagesToBottom(true);
      } finally {
        setPlanning(false);
      }

      return;
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

    setSelectedTransportIndex(latestPlan.plan.transportOptions.length > 0 ? 0 : null);
    setSelectedStayIndex(latestPlan.plan.stayOptions.length > 0 ? 0 : null);
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

    try {
      setBookingProcessing(true);
      setBookingError("");
      setBookingStage("processing");
      setBookingProgress(0.14);
      setBookingProgressLabel(t("home.bookingPreparingCheckout"));

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
      <KeyboardAvoidingView
        style={styles.flex1}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
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
                  {t("home.aiPlanner")}
                </Text>
                <Text
                  numberOfLines={1}
                  style={[styles.headerSub, { color: colors.textSecondary }]}
                >
                  {currentChat?.title ?? t("home.lastChat")}
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
                onContentSizeChange={() => {
                  if (isKeyboardOpenRef.current || !showScrollToBottom) {
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

                {followUpMessages.map((message) => (
                  <ChatMessageBubble
                    key={message.id}
                    colors={colors}
                    displayedText={getDisplayedMessageText(message)}
                    role={message.role}
                  />
                ))}

                {!latestPlan && planning && currentPlannerState.step === "done" ? (
                  <View
                    style={[
                      styles.messageBubble,
                      styles.assistantBubble,
                      { backgroundColor: colors.cardAlt },
                    ]}
                  >
                    <Text style={[styles.messageRoleLabel, { color: colors.textMuted }]}>{t("home.aiPlanner")}</Text>
                    <View style={styles.typingRow}>
                      <ActivityIndicator size="small" color={colors.accent} style={{ marginRight: 8 }} />
                      <Text style={[styles.assistantMessageText, { color: colors.textPrimary }]}>
                        {t("home.searchingPrices")}
                      </Text>
                    </View>
                  </View>
                ) : null}

                {error ? <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text> : null}

                {latestPlan ? (
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
                    bookingEstimateLabel={bookingEstimate.totalLabel}
                  />
                ) : null}
              </ScrollView>

              {showScrollToBottom ? (
                <TouchableOpacity
                  style={[styles.scrollToBottomButton, { backgroundColor: colors.accent }]}
                  onPress={() => {
                    scrollMessagesToBottom(true);
                  }}
                  activeOpacity={0.9}
                >
                  <MaterialIcons name="keyboard-double-arrow-down" size={20} color={colors.buttonTextOnAction} />
                </TouchableOpacity>
              ) : null}

              <QuickReplies
                replies={quickReplies}
                title={getStepTitle(currentPlannerState.step, language)}
                colors={colors}
                disabled={planning}
                onSelect={(reply) => { void sendPlannerMessage(reply); }}
              />

              <ChatComposer
                chatInput={chatInput}
                canSend={canSend}
                planning={planning}
                step={currentPlannerState.step}
                colors={colors}
                insetBottom={isKeyboardOpen ? 0 : insets.bottom}
                onChangeText={setChatInput}
                onSend={() => { void sendPlannerMessage(chatInput); }}
                onReset={() => { void resetConversation(); }}
              />
            </View>
          </View>
      </KeyboardAvoidingView>

      <ChatDrawer
        chatMenuVisible={chatMenuVisible}
        chatSearch={chatSearch}
        chats={homeStore.chats}
        colors={colors}
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
          colors={colors}
          latestPlan={latestPlan}
          bookingStage={bookingStage}
          bookingForm={bookingForm}
          bookingProcessing={bookingProcessing}
          bookingProgress={bookingProgress}
          bookingProgressLabel={bookingProgressLabel}
          bookingReceipt={bookingReceipt}
          bookingError={bookingError}
          bookingEstimateLabel={bookingEstimate.totalLabel}
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
    flexGrow: 1,
    minHeight: "100%",
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
  messageRoleLabel: {
    ...TypeScale.labelSm,
    fontWeight: FontWeight.semibold,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  assistantMessageText: {},
  typingRow: {
    flexDirection: "row",
    alignItems: "center",
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
