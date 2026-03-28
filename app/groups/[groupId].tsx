import { MaterialIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useLocalSearchParams, useRouter } from "expo-router";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";

import { useAppTheme } from "../../components/app-theme-provider";
import {
  FontWeight,
  Layout,
  Radius,
  Spacing,
  TypeScale,
  shadow,
} from "../../constants/design-system";
import { auth, db } from "../../firebase";
import {
  buildGroupChatExpense,
  buildGroupChatSharedTrip,
  parseGroupChatMessage,
  type GroupChatMessage,
  type GroupChatExpense,
  type GroupChatLinkedTransport,
  type GroupChatSharedTrip,
} from "../../utils/group-chat";
import {
  buildGroupExpenseRepaymentId,
  formatExpenseRepaymentAmount,
  parseGroupExpenseRepayment,
  type GroupExpenseRepayment,
} from "../../utils/group-expense-repayments";
import {
  createHomePlannerChatFromSharedTrip,
  parseStoredHomePlannerStore,
  saveHomePlannerStoreForUser,
  sortHomePlannerChats,
  type StoredHomePlan,
} from "../../utils/home-chat-storage";
import {
  normalizeGroupJoinKey,
  parseTravelGroup,
  type TravelGroup,
} from "../../utils/groups";
import {
  savePendingStripeExpenseCheckout,
  type PendingStripeExpenseCheckout,
} from "../../utils/pending-stripe-expense-checkout";
import { extractPersonalProfile, getProfileDisplayName } from "../../utils/profile-info";
import { parseSavedTrips, type SavedTrip } from "../../utils/saved-trips";
import { type PlannerTransportOption } from "../../utils/home-travel-planner";
import { buildStripeCheckoutReturnUrls } from "../../utils/stripe-checkout-return";
import { createTestCheckoutSession } from "../../utils/travel-offers";

function getGroupsErrorMessage(error: unknown, action: "read" | "write") {
  const fallback =
    action === "write"
      ? "Не успяхме да изпратим съобщението. Опитай отново."
      : "Не успяхме да заредим групата. Опитай отново.";

  const errorCode =
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
      ? ((error as { code: string }).code ?? "")
      : "";
  const errorMessage = error instanceof Error ? error.message.trim() : "";

  if (
    errorCode === "permission-denied" ||
    errorCode === "functions/permission-denied" ||
    errorMessage.includes("permission-denied") ||
    /missing or insufficient permissions/i.test(errorMessage)
  ) {
    return action === "write"
      ? "Firestore rules блокират този запис. Обнови правилата и опитай пак."
      : "Нямаш достъп до тази група.";
  }

  if (!errorCode) {
    return fallback;
  }

  switch (errorCode) {
    case "permission-denied":
      return action === "write"
        ? "Нямаш достъп да пишеш в тази група."
        : "Нямаш достъп до тази група.";
    case "failed-precondition":
      return "Firestore Database още не е създадена. Създай Firestore Database в Firebase Console.";
    case "unavailable":
      return "Firestore в момента не е достъпен. Опитай пак след малко.";
    default:
      return fallback;
  }
}

function formatMessageTime(value: number | null) {
  if (!value) {
    return "just now";
  }

  return new Intl.DateTimeFormat("bg-BG", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getAvatarColor(seed: string) {
  const palette = ["#4D7CFE", "#7C3AED", "#DB2777", "#0EA5E9", "#16A34A", "#F97316"];
  const sum = seed.split("").reduce((accumulator, letter) => accumulator + letter.charCodeAt(0), 0);
  return palette[sum % palette.length];
}

function getInitials(value: string) {
  const parts = value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (!parts.length) {
    return "?";
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function getSharedTripSourceLabel(source: "discover" | "home") {
  return source === "home" ? "Home Planner" : "Discover";
}

function normalizeTextKey(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function getUniqueTextLines(text: string, excludedValues: string[] = []) {
  const excluded = new Set(
    excludedValues.map((value) => normalizeTextKey(value)).filter(Boolean)
  );
  const seen = new Set<string>();

  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      const normalized = normalizeTextKey(line);

      if (!normalized || excluded.has(normalized) || seen.has(normalized)) {
        return false;
      }

      seen.add(normalized);
      return true;
    });
}

function buildSharedTripDetailsPreview(sharedTrip: GroupChatSharedTrip | null) {
  if (!sharedTrip) {
    return "";
  }

  return getUniqueTextLines(sharedTrip.details, [
    sharedTrip.summary,
    sharedTrip.title,
    sharedTrip.destination,
  ])
    .slice(0, 4)
    .join("\n");
}

function extractPlannerPriceAmount(value: string) {
  const match = value.match(/\d+(?:[.,]\d+)?/);

  if (!match) {
    return null;
  }

  const parsedValue = Number(match[0].replace(",", "."));
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null;
}

function slugifyLinkedTransportKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

function buildLinkedExpenseLookupKey(sourceKey: string, itemKey: string) {
  return `${sourceKey}::${itemKey}`;
}

function buildLinkedTransportTitle(option: PlannerTransportOption, index: number) {
  const normalizedMode = option.mode.trim();
  const normalizedProvider = option.provider.trim();

  if (normalizedMode && normalizedProvider) {
    return `${normalizedMode} • ${normalizedProvider}`;
  }

  if (normalizedProvider) {
    return normalizedProvider;
  }

  if (normalizedMode) {
    return normalizedMode;
  }

  return `Ticket option ${index + 1}`;
}

function buildLinkedTransportItemKey(option: PlannerTransportOption, index: number) {
  const stableLabel = [
    option.provider,
    option.route,
    option.price,
    option.sourceLabel,
    option.mode,
  ]
    .map((item) => item.trim())
    .filter(Boolean)
    .join("-");

  return `transport-${index + 1}-${slugifyLinkedTransportKey(stableLabel || `option-${index + 1}`)}`;
}

function buildLinkedTransportsFromStoredPlan(plan: StoredHomePlan | null): GroupChatLinkedTransport[] {
  if (!plan) {
    return [];
  }

  return plan.plan.transportOptions
    .map((option, index) => {
      const amountValue = extractPlannerPriceAmount(option.price);

      if (!amountValue || !option.bookingUrl.trim()) {
        return null;
      }

      return {
        amountLabel: option.price.trim(),
        amountValue,
        bookingUrl: option.bookingUrl.trim(),
        duration: option.duration.trim(),
        itemKey: buildLinkedTransportItemKey(option, index),
        provider: option.provider.trim(),
        route: option.route.trim(),
        sourceLabel: option.sourceLabel.trim(),
        title: buildLinkedTransportTitle(option, index),
      } satisfies GroupChatLinkedTransport;
    })
    .filter((option): option is GroupChatLinkedTransport => !!option)
    .slice(0, 4);
}

function buildStoredHomePlansBySourceKey(profileData: Record<string, unknown>) {
  const plannerStore = parseStoredHomePlannerStore(profileData, "Planner sync");

  return plannerStore.chats.reduce<Record<string, StoredHomePlan>>((summary, chat) => {
    const latestPlan = chat.state.latestPlan;

    if (latestPlan?.sourceKey) {
      summary[latestPlan.sourceKey] = latestPlan;
    }

    return summary;
  }, {});
}

function formatExpenseAmount(value: number) {
  const normalizedValue = Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2);
  return `${normalizedValue} EUR`;
}

function getExpensePerPerson(expense: GroupChatExpense) {
  return expense.participantCount > 0 ? expense.amountValue / expense.participantCount : expense.amountValue;
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

function getStripeExpenseCheckoutErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const errorCode =
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
      ? ((error as { code: string }).code ?? "")
      : "";
  const errorDetails =
    error &&
    typeof error === "object" &&
    "details" in error &&
    typeof (error as { details?: unknown }).details === "string"
      ? (((error as { details: string }).details ?? "") as string)
      : "";

  if (message.includes("functions/not-found") || errorCode === "functions/not-found") {
    return "Липсват Stripe checkout Firebase функциите. Deploy-ни backend-а и опитай пак.";
  }

  if (message.includes("stripe-test-mode-disabled")) {
    return "Stripe test mode е изключен. Задай EXPO_PUBLIC_TEST_PAYMENTS_MODE=functions и рестартирай app-а.";
  }

  if (
    message.includes("Failed to fetch") ||
    message.includes("Network request failed") ||
    message.includes("functions/unavailable") ||
    errorCode === "functions/unavailable"
  ) {
    return "Stripe Functions emulator не е стартиран. Пусни `npm run payments:emulator` и опитай пак.";
  }

  if (message.includes("stripe-checkout-cancelled")) {
    return "Плащането беше прекъснато преди потвърждение.";
  }

  if (message.includes("stripe-checkout-incomplete") || message.includes("stripe-session-not-paid")) {
    return "Stripe Checkout не върна потвърдено test плащане. Опитай отново.";
  }

  if (
    message.includes("functions/failed-precondition") ||
    errorCode === "functions/failed-precondition" ||
    message.includes("STRIPE_SECRET_KEY") ||
    errorDetails.includes("STRIPE_SECRET_KEY")
  ) {
    return "Липсва Stripe test secret key във Firebase Functions. Добави STRIPE_SECRET_KEY и deploy-ни функциите.";
  }

  if (
    message.includes("functions/internal") ||
    errorCode === "functions/internal" ||
    message === "internal"
  ) {
    return (
      errorDetails ||
      "Stripe backend върна internal грешка. Ако си локално, пусни `npm run payments:emulator`. Ако си на production, трябва deploy на Firebase Functions."
    );
  }

  if (
    errorCode === "permission-denied" ||
    errorCode === "functions/permission-denied" ||
    message.includes("permission-denied") ||
    /missing or insufficient permissions/i.test(message) ||
    /missing or insufficient permissions/i.test(errorDetails)
  ) {
    return "Firestore rules блокират repayment записа за този expense. Обнових правилата, така че опитай пак.";
  }

  return getGroupsErrorMessage(error, "write");
}

function buildSharedTripDetailsText(sharedTrip: GroupChatSharedTrip | null) {
  if (!sharedTrip) {
    return "";
  }

  return getUniqueTextLines(sharedTrip.details, [
    sharedTrip.summary,
    sharedTrip.title,
    sharedTrip.destination,
  ]).join("\n");
}

function hasMeaningfulDescription(value: string) {
  return value.replace(/[.\s]/g, "").trim().length > 0;
}

function buildInitialHomePlannerMessage(profileName: string) {
  return `Здравей, ${profileName}. Ще започнем с бюджета ти в евро.`;
}

WebBrowser.maybeCompleteAuthSession();

export default function GroupChatScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ groupId: string | string[] }>();
  const groupId = Array.isArray(params.groupId) ? params.groupId[0] ?? "" : params.groupId ?? "";
  const scrollViewRef = useRef<ScrollView | null>(null);

  const [user, setUser] = useState<User | null>(null);
  const [profileName, setProfileName] = useState("Traveler");
  const [profileAvatarUrl, setProfileAvatarUrl] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [joining, setJoining] = useState(false);
  const [sharingTripId, setSharingTripId] = useState<string | null>(null);
  const [savingExpense, setSavingExpense] = useState(false);
  const [creatingLinkedExpenseKey, setCreatingLinkedExpenseKey] = useState<string | null>(null);
  const [processingRepaymentExpenseId, setProcessingRepaymentExpenseId] = useState<string | null>(
    null
  );
  const [savingSharedTripKey, setSavingSharedTripKey] = useState<string | null>(null);
  const [savingGroupSettings, setSavingGroupSettings] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [group, setGroup] = useState<TravelGroup | null>(null);
  const [messages, setMessages] = useState<GroupChatMessage[]>([]);
  const [expenseRepayments, setExpenseRepayments] = useState<GroupExpenseRepayment[]>([]);
  const [savedTrips, setSavedTrips] = useState<SavedTrip[]>([]);
  const [storedHomePlansBySourceKey, setStoredHomePlansBySourceKey] = useState<
    Record<string, StoredHomePlan>
  >({});
  const [composerValue, setComposerValue] = useState("");
  const [error, setError] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [shareSheetVisible, setShareSheetVisible] = useState(false);
  const [expenseSheetVisible, setExpenseSheetVisible] = useState(false);
  const [previewTrip, setPreviewTrip] = useState<GroupChatSharedTrip | null>(null);
  const [expenseTitle, setExpenseTitle] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [groupDetailsVisible, setGroupDetailsVisible] = useState(false);
  const [groupNameInput, setGroupNameInput] = useState("");
  const [groupDescriptionInput, setGroupDescriptionInput] = useState("");
  const [groupJoinKeyInput, setGroupJoinKeyInput] = useState("");
  const [memberSearchQuery, setMemberSearchQuery] = useState("");
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const [updatingGroupPhoto, setUpdatingGroupPhoto] = useState(false);

  const readAssetDataUrl = async (asset: ImagePicker.ImagePickerAsset) => {
    const mimeType = asset.mimeType || "image/jpeg";

    if (asset.base64) {
      return `data:${mimeType};base64,${asset.base64}`;
    }

    const response = await fetch(asset.uri);
    const blob = await response.blob();

    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
          return;
        }

        reject(new Error("Could not convert the selected photo."));
      };
      reader.onerror = () => reject(new Error("Could not read the selected photo."));
      reader.readAsDataURL(blob);
    });
  };

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;
    let unsubscribeGroup: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (nextUser) => {
      unsubscribeProfile?.();
      unsubscribeGroup?.();
      unsubscribeProfile = null;
      unsubscribeGroup = null;

      if (!groupId) {
        setUser(null);
        setGroup(null);
        setExpenseRepayments([]);
        setMessages([]);
        setSavedTrips([]);
        setStoredHomePlansBySourceKey({});
        setError("Липсва group id.");
        setLoading(false);
        return;
      }

      if (!nextUser) {
        setUser(null);
        setGroup(null);
        setExpenseRepayments([]);
        setMessages([]);
        setSavedTrips([]);
        setStoredHomePlansBySourceKey({});
        setLoading(false);
        router.replace("/login");
        return;
      }

      setUser(nextUser);
      setGroup(null);
      setExpenseRepayments([]);
      setMessages([]);
      setSavedTrips([]);
      setStoredHomePlansBySourceKey({});
      setLoading(true);
      setError("");
      setInfoMessage("");
      setShareSheetVisible(false);
      setExpenseSheetVisible(false);
      setPreviewTrip(null);
      setExpenseTitle("");
      setExpenseAmount("");

      unsubscribeProfile = onSnapshot(
        doc(db, "profiles", nextUser.uid),
        (profileSnapshot) => {
          if (!profileSnapshot.exists()) {
            setSavedTrips([]);
            setStoredHomePlansBySourceKey({});
            setLoading(false);
            router.replace("/onboarding");
            return;
          }

          const profileData = profileSnapshot.data() as Record<string, unknown>;
          const personalProfile = extractPersonalProfile({
            profileInfo:
              profileData.profileInfo && typeof profileData.profileInfo === "object"
                ? (profileData.profileInfo as Record<string, unknown>)
                : undefined,
          });
          setSavedTrips(parseSavedTrips(profileData));
          setStoredHomePlansBySourceKey(buildStoredHomePlansBySourceKey(profileData));
          setProfileAvatarUrl(personalProfile.avatarUrl);
          setUsername(typeof profileData.username === "string" ? profileData.username : "");
          setProfileName(
            getProfileDisplayName({
              email: nextUser.email,
              profileInfo:
                profileData.profileInfo && typeof profileData.profileInfo === "object"
                  ? (profileData.profileInfo as Record<string, unknown>)
                  : undefined,
              username: typeof profileData.username === "string" ? profileData.username : null,
            })
          );
        },
        (nextError) => {
          setSavedTrips([]);
          setStoredHomePlansBySourceKey({});
          setError(getGroupsErrorMessage(nextError, "read"));
          setLoading(false);
        }
      );

      unsubscribeGroup = onSnapshot(
        doc(db, "groups", groupId),
        (groupSnapshot) => {
          if (!groupSnapshot.exists()) {
            setError("Групата не беше намерена.");
            setLoading(false);
            return;
          }

          const nextGroup = parseTravelGroup(
            groupSnapshot.id,
            groupSnapshot.data() as Record<string, unknown>
          );

          setGroup(nextGroup);
          setGroupNameInput(nextGroup.name);
          setGroupDescriptionInput(nextGroup.description);
          setGroupJoinKeyInput((nextGroup.joinKeyNormalized ?? "").replace(/^TRIP-?/i, ""));

          if (!nextGroup.memberIds.includes(nextUser.uid)) {
            if (nextGroup.accessType === "public") {
              setError("");
              setInfoMessage("Това е public група. Join-ни я, за да можеш да пишеш.");
              setLoading(false);
              return;
            }

            setMessages([]);
            setInfoMessage("");
            setError("Нямаш достъп до тази група.");
            setLoading(false);
            return;
          }

          setError("");
          setInfoMessage("");
          setLoading(false);
        },
        (nextError) => {
          setError(getGroupsErrorMessage(nextError, "read"));
          setLoading(false);
        }
      );
    });

    return () => {
      unsubscribeProfile?.();
      unsubscribeGroup?.();
      unsubscribeAuth();
    };
  }, [groupId, router]);

  const isMember = !!user && !!group && group.memberIds.includes(user.uid);
  const canReadMessages = !!group && (group.accessType === "public" || isMember);
  const canOpenSharePicker = !!group && (group.accessType === "public" || isMember);
  const canManageExpenses = !!group && (group.accessType === "public" || isMember);
  const composerBottomInset = insets.bottom + 8;
  const expenseMessages = useMemo(
    () => messages.filter((message) => message.messageType === "expense" && !!message.expense),
    [messages]
  );

  useEffect(() => {
    if (!user || !group || !groupId || !canReadMessages) {
      setMessages([]);
      return;
    }

    const unsubscribeMessages = onSnapshot(
      query(collection(db, "groups", groupId, "messages"), orderBy("createdAt", "asc")),
      (messagesSnapshot) => {
        const nextMessages = messagesSnapshot.docs.map((messageDocument) =>
          parseGroupChatMessage(
            messageDocument.id,
            messageDocument.data() as Record<string, unknown>
          )
        );
        setMessages(nextMessages);
      },
      (nextError) => {
        setError(getGroupsErrorMessage(nextError, "read"));
      }
    );

    return () => {
      unsubscribeMessages();
    };
  }, [canReadMessages, group, groupId, user]);

  useEffect(() => {
    if (!groupId || !canReadMessages) {
      setExpenseRepayments([]);
      return;
    }

    const unsubscribeRepayments = onSnapshot(
      query(collection(db, "groups", groupId, "expenseRepayments"), orderBy("createdAt", "asc")),
      (repaymentsSnapshot) => {
        const nextRepayments = repaymentsSnapshot.docs
          .map((repaymentDocument) =>
            parseGroupExpenseRepayment(
              repaymentDocument.id,
              repaymentDocument.data() as Record<string, unknown>
            )
          )
          .filter((repayment): repayment is GroupExpenseRepayment => !!repayment);

        setExpenseRepayments(nextRepayments);
      },
      (nextError) => {
        setError(getGroupsErrorMessage(nextError, "read"));
      }
    );

    return () => {
      unsubscribeRepayments();
    };
  }, [canReadMessages, groupId]);

  useEffect(() => {
    if (!messages.length) {
      return;
    }

    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSubscription = Keyboard.addListener(showEvent, () => {
      requestAnimationFrame(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      });
    });

    const hideSubscription = Keyboard.addListener(hideEvent, () => {});

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(""), 4000);
    return () => clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    if (!infoMessage) return;
    const timer = setTimeout(() => setInfoMessage(""), 4000);
    return () => clearTimeout(timer);
  }, [infoMessage]);

  const membersLabel = useMemo(() => {
    if (!group) {
      return "";
    }

    return `${group.memberCount} ${group.memberCount === 1 ? "member" : "members"}`;
  }, [group]);
  const expenseRepaymentsByExpenseId = useMemo(() => {
    return expenseRepayments.reduce<Record<string, GroupExpenseRepayment[]>>((summary, repayment) => {
      summary[repayment.expenseMessageId] = summary[repayment.expenseMessageId]
        ? [...summary[repayment.expenseMessageId], repayment]
        : [repayment];
      return summary;
    }, {});
  }, [expenseRepayments]);
  const expenseRepaymentsByKey = useMemo(() => {
    return expenseRepayments.reduce<Record<string, GroupExpenseRepayment>>((summary, repayment) => {
      summary[buildGroupExpenseRepaymentId(repayment.expenseMessageId, repayment.paidById)] = repayment;
      return summary;
    }, {});
  }, [expenseRepayments]);
  const linkedExpenseMessagesByKey = useMemo(() => {
    return expenseMessages.reduce<Record<string, GroupChatMessage>>((summary, message) => {
      const expense = message.expense;

      if (expense?.linkedSourceKey && expense.linkedItemKey) {
        summary[buildLinkedExpenseLookupKey(expense.linkedSourceKey, expense.linkedItemKey)] = message;
      }

      return summary;
    }, {});
  }, [expenseMessages]);
  const expenseMessagesById = useMemo(() => {
    return expenseMessages.reduce<Record<string, GroupChatMessage>>((summary, message) => {
      summary[message.id] = message;
      return summary;
    }, {});
  }, [expenseMessages]);
  const expenseSummary = useMemo(() => {
    if (!user) {
      return {
        expenseCount: expenseMessages.length,
        netBalance: 0,
        totalSpent: 0,
      };
    }

    const baseSummary = expenseMessages.reduce(
      (summary, message) => {
        const expense = message.expense;

        if (!expense) {
          return summary;
        }

        const sharePerPerson = getExpensePerPerson(expense);
        let nextBalance = summary.netBalance;

        if (expense.collectionMode !== "group-payment" && expense.paidById === user.uid) {
          nextBalance += expense.amountValue;
        }

        if (expense.participantIds.includes(user.uid)) {
          nextBalance -= sharePerPerson;
        }

        return {
          expenseCount: summary.expenseCount + 1,
          netBalance: nextBalance,
          totalSpent: summary.totalSpent + expense.amountValue,
        };
      },
      {
        expenseCount: 0,
        netBalance: 0,
        totalSpent: 0,
      }
    );

    return expenseRepayments.reduce(
      (summary, repayment) => {
        const relatedExpense = expenseMessagesById[repayment.expenseMessageId]?.expense ?? null;
        let nextBalance = summary.netBalance;

        if (relatedExpense?.collectionMode !== "group-payment" && repayment.paidToId === user.uid) {
          nextBalance -= repayment.amountValue;
        }

        if (repayment.paidById === user.uid) {
          nextBalance += repayment.amountValue;
        }

        return {
          ...summary,
          netBalance: nextBalance,
        };
      },
      baseSummary
    );
  }, [expenseMessages, expenseMessagesById, expenseRepayments, user]);

  const getOutstandingExpenseAmount = (
    expenseMessageId: string,
    expense: GroupChatExpense,
    payerUserId: string
  ) => {
    if (
      !expense.participantIds.includes(payerUserId) ||
      (expense.collectionMode !== "group-payment" && payerUserId === expense.paidById)
    ) {
      return 0;
    }

    const existingRepayment =
      expenseRepaymentsByKey[buildGroupExpenseRepaymentId(expenseMessageId, payerUserId)];
    const alreadyPaidAmount = existingRepayment?.amountValue ?? 0;
    const shareAmount = getExpensePerPerson(expense);

    return Math.max(shareAmount - alreadyPaidAmount, 0);
  };

  const getExpenseRemainingCollectionAmount = (expenseMessageId: string, expense: GroupChatExpense) => {
    const collectedAmount =
      expenseRepaymentsByExpenseId[expenseMessageId]?.reduce(
        (summary, repayment) => summary + repayment.amountValue,
        0
      ) ?? 0;
    const ownerShare = expense.participantIds.includes(expense.paidById)
      ? getExpensePerPerson(expense)
      : 0;
    const targetCollectionAmount =
      expense.collectionMode === "group-payment"
        ? expense.amountValue
        : Math.max(expense.amountValue - ownerShare, 0);

    return Math.max(targetCollectionAmount - collectedAmount, 0);
  };

  const getExpenseSettledShareCount = (expenseMessageId: string, expense: GroupChatExpense) => {
    const repaymentShareCount = expenseRepaymentsByExpenseId[expenseMessageId]?.length ?? 0;
    const paidUpfrontShareCount =
      expense.collectionMode === "group-payment"
        ? 0
        : expense.participantIds.includes(expense.paidById)
          ? 1
          : 0;

    return Math.min(expense.participantCount, repaymentShareCount + paidUpfrontShareCount);
  };

  const isCreator = !!user && !!group && group.creatorId === user.uid;
  const memberRows = useMemo(() => {
    if (!group) {
      return [];
    }

    const rows = group.memberIds.map((memberId) => ({
      avatarUrl: group.memberAvatarUrlsById[memberId] || "",
      id: memberId,
      label:
        group.memberLabelsById[memberId] ||
        (memberId === group.creatorId ? group.creatorLabel : "Traveler"),
      username: group.memberUsernamesById[memberId] || "",
      isCreator: memberId === group.creatorId,
    }));
    const query = memberSearchQuery.trim().toLowerCase();

    if (!query) {
      return rows;
    }

    return rows.filter(
      (member) =>
        member.label.toLowerCase().includes(query) ||
        member.username.toLowerCase().includes(query) ||
        member.id.toLowerCase().includes(query)
    );
  }, [group, memberSearchQuery]);

  const ensureWriteAccess = async () => {
    if (!user || !group) {
      return false;
    }

    if (group.memberIds.includes(user.uid)) {
      return true;
    }

    if (group.accessType !== "public") {
      setError("Нямаш достъп да пишеш в тази група.");
      return false;
    }

    const joined = await handleJoinGroup();

    if (!joined) {
      return false;
    }

    try {
      const latestGroupSnapshot = await getDoc(doc(db, "groups", group.id));

      if (!latestGroupSnapshot.exists()) {
        setError("Групата не беше намерена.");
        return false;
      }

      const latestGroup = parseTravelGroup(
        latestGroupSnapshot.id,
        latestGroupSnapshot.data() as Record<string, unknown>
      );

      setGroup(latestGroup);

      if (latestGroup.memberIds.includes(user.uid)) {
        return true;
      }

      setError("Join-ът още не е синхронизиран. Изчакай секунда и опитай пак.");
      return false;
    } catch (nextError) {
      setError(getGroupsErrorMessage(nextError, "write"));
      return false;
    }
  };

  const handleJoinGroup = async () => {
    if (!user || !group || group.accessType !== "public" || isMember) {
      return true;
    }

    try {
      setJoining(true);
      setError("");

      await runTransaction(db, async (transaction) => {
        const groupRef = doc(db, "groups", group.id);
        const groupSnapshot = await transaction.get(groupRef);

        if (!groupSnapshot.exists()) {
          throw new Error("missing-group");
        }

        const currentGroup = parseTravelGroup(
          groupSnapshot.id,
          groupSnapshot.data() as Record<string, unknown>
        );

        if (currentGroup.memberIds.includes(user.uid)) {
          return;
        }

        const nextMemberIds = [...currentGroup.memberIds, user.uid];

        transaction.update(groupRef, {
          memberCount: nextMemberIds.length,
          [`memberAvatarUrlsById.${user.uid}`]: profileAvatarUrl,
          memberIds: nextMemberIds,
          [`memberLabelsById.${user.uid}`]: profileName,
          [`memberUsernamesById.${user.uid}`]: username,
          updatedAt: serverTimestamp(),
        });
      });

      setGroup((currentGroup) => {
        if (!currentGroup || currentGroup.memberIds.includes(user.uid)) {
          return currentGroup;
        }

        const nextMemberIds = [...currentGroup.memberIds, user.uid];
        return {
          ...currentGroup,
          memberCount: nextMemberIds.length,
          memberAvatarUrlsById: {
            ...currentGroup.memberAvatarUrlsById,
            [user.uid]: profileAvatarUrl,
          },
          memberIds: nextMemberIds,
          memberLabelsById: {
            ...currentGroup.memberLabelsById,
            [user.uid]: profileName,
          },
          memberUsernamesById: {
            ...currentGroup.memberUsernamesById,
            [user.uid]: username,
          },
          updatedAtMs: Date.now(),
        };
      });
      setInfoMessage("");
      return true;
    } catch (nextError) {
      setError(getGroupsErrorMessage(nextError, "write"));
      return false;
    } finally {
      setJoining(false);
    }
  };

  const handleSend = async () => {
    if (!user || !group) {
      return;
    }

    const hasWriteAccess = await ensureWriteAccess();

    if (!hasWriteAccess) {
      return;
    }

    const trimmedMessage = composerValue.trim();

    if (!trimmedMessage) {
      return;
    }

    try {
      setSending(true);
      setError("");

      await addDoc(collection(db, "groups", group.id, "messages"), {
        createdAt: serverTimestamp(),
        senderId: user.uid,
        senderAvatarUrl: profileAvatarUrl,
        senderLabel: profileName,
        text: trimmedMessage,
      });

      setComposerValue("");
    } catch (nextError) {
      setError(getGroupsErrorMessage(nextError, "write"));
    } finally {
      setSending(false);
    }
  };

  const handleShareTrip = async (trip: SavedTrip) => {
    if (!user || !group) {
      return;
    }

    const hasWriteAccess = await ensureWriteAccess();

    if (!hasWriteAccess) {
      return;
    }

    try {
      setSharingTripId(trip.id);
      setError("");

      const linkedTransports =
        trip.source === "home"
          ? buildLinkedTransportsFromStoredPlan(storedHomePlansBySourceKey[trip.sourceKey] ?? null)
          : [];

      await addDoc(collection(db, "groups", group.id, "messages"), {
        createdAt: serverTimestamp(),
        messageType: "shared-trip",
        senderId: user.uid,
        senderAvatarUrl: profileAvatarUrl,
        senderLabel: profileName,
        sharedTrip: buildGroupChatSharedTrip(trip, {
          linkedTransports,
        }),
        text: "Shared a trip plan",
      });

      setShareSheetVisible(false);
    } catch (nextError) {
      setError(getGroupsErrorMessage(nextError, "write"));
    } finally {
      setSharingTripId(null);
    }
  };

  const handleOpenPlannerTicket = async (bookingUrl: string) => {
    try {
      setError("");
      await Linking.openURL(bookingUrl);
    } catch {
      setError("Не успяхме да отворим линка за билета. Опитай пак.");
    }
  };

  const handleCreateLinkedTransportExpense = async (
    message: GroupChatMessage,
    linkedTransport: GroupChatLinkedTransport
  ) => {
    if (!user || !group || !message.sharedTrip) {
      return;
    }

    const hasWriteAccess = await ensureWriteAccess();

    if (!hasWriteAccess) {
      return;
    }

    const lookupKey = buildLinkedExpenseLookupKey(message.sharedTrip.sourceKey, linkedTransport.itemKey);

    if (linkedExpenseMessagesByKey[lookupKey]) {
      setInfoMessage("Този planner билет вече е добавен като group expense.");
      return;
    }

    try {
      setCreatingLinkedExpenseKey(lookupKey);
      setError("");
      setInfoMessage("");

      await addDoc(collection(db, "groups", group.id, "messages"), {
        createdAt: serverTimestamp(),
        expense: buildGroupChatExpense({
          amountValue: linkedTransport.amountValue,
          collectionMode: "group-payment",
          linkedBookingUrl: linkedTransport.bookingUrl,
          linkedItemKey: linkedTransport.itemKey,
          linkedSourceKey: message.sharedTrip.sourceKey,
          paidById: user.uid,
          paidByLabel: profileName,
          participantIds: group.memberIds,
          title: `Ticket • ${linkedTransport.title}`,
        }),
        messageType: "expense",
        senderId: user.uid,
        senderLabel: profileName,
        text: "Added a planner ticket expense",
      });

      setInfoMessage(
        `${linkedTransport.amountLabel} от planner-а вече е пуснат като in-app equal split за ${membersLabel.toLowerCase()}.`
      );
    } catch (nextError) {
      setError(getGroupsErrorMessage(nextError, "write"));
    } finally {
      setCreatingLinkedExpenseKey(null);
    }
  };

  const handleAddExpense = async () => {
    if (!user || !group) {
      return;
    }

    const hasWriteAccess = await ensureWriteAccess();

    if (!hasWriteAccess) {
      return;
    }

    const trimmedTitle = expenseTitle.trim();
    const parsedAmount = Number.parseFloat(expenseAmount.replace(",", "."));

    if (trimmedTitle.length < 2) {
      setError("Добави кратко име на разхода.");
      return;
    }

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("Добави валидна сума за разхода.");
      return;
    }

    try {
      setSavingExpense(true);
      setError("");

      await addDoc(collection(db, "groups", group.id, "messages"), {
        createdAt: serverTimestamp(),
        expense: buildGroupChatExpense({
          amountValue: parsedAmount,
          paidById: user.uid,
          paidByLabel: profileName,
          participantIds: group.memberIds,
          title: trimmedTitle,
        }),
        messageType: "expense",
        senderId: user.uid,
        senderLabel: profileName,
        text: "Added an expense",
      });

      setExpenseTitle("");
      setExpenseAmount("");
      setExpenseSheetVisible(false);
    } catch (nextError) {
      setError(getGroupsErrorMessage(nextError, "write"));
    } finally {
      setSavingExpense(false);
    }
  };

  const handlePayExpense = async (message: GroupChatMessage) => {
    if (!user || !group || !message.expense) {
      return;
    }

    const hasWriteAccess = await ensureWriteAccess();

    if (!hasWriteAccess) {
      return;
    }

    const outstandingAmount = getOutstandingExpenseAmount(message.id, message.expense, user.uid);

    if (outstandingAmount <= 0) {
      setInfoMessage("Този expense вече е покрит от теб.");
      return;
    }

    const pendingExpenseCheckout: PendingStripeExpenseCheckout = {
      amountLabel: formatExpenseRepaymentAmount(outstandingAmount),
      amountValue: outstandingAmount,
      collectionMode: message.expense.collectionMode,
      createdAtMs: Date.now(),
      expenseMessageId: message.id,
      expenseTitle: message.expense.title,
      groupId: group.id,
      groupName: group.name,
      paidByLabel: profileName,
      paidToId:
        message.expense.collectionMode === "group-payment"
          ? "__trip_split__"
          : message.expense.paidById,
      paidToLabel:
        message.expense.collectionMode === "group-payment"
          ? "Trip split"
          : message.expense.paidByLabel,
      payerUserId: user.uid,
      payerUserLabel: profileName,
      paymentMethod: "Банкова карта",
    };

    try {
      setProcessingRepaymentExpenseId(message.id);
      setError("");
      setInfoMessage("");
      await user.getIdToken(true);

      const stripeReturnUrls = buildStripeCheckoutReturnUrls("expense-repayment");
      const checkoutSession = await createTestCheckoutSession({
        amountCents: Math.round(outstandingAmount * 100),
        cancelUrl: stripeReturnUrls.cancelUrl,
        contactEmail: user.email ?? "",
        contactName: profileName,
        currency: "eur",
        description: `Expense share • ${message.expense.title}`,
        destination: group.name,
        paymentMethod: pendingExpenseCheckout.paymentMethod,
        successUrl: stripeReturnUrls.successUrl,
        userId: user.uid,
      });

      savePendingStripeExpenseCheckout(pendingExpenseCheckout);

      if (Platform.OS === "web") {
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
          kind: "expense-repayment",
          session_id: checkoutState.sessionId,
        },
      });
      return;
    } catch (nextError) {
      setError(getStripeExpenseCheckoutErrorMessage(nextError));
    } finally {
      setProcessingRepaymentExpenseId(null);
    }
  };

  const handleSaveSharedTripToHome = async (sharedTrip: GroupChatSharedTrip) => {
    if (!user || savingSharedTripKey) {
      return;
    }

    try {
      setSavingSharedTripKey(sharedTrip.sourceKey);
      setError("");
      setInfoMessage("");

      const profileSnapshot = await getDoc(doc(db, "profiles", user.uid));
      const profileData = profileSnapshot.exists()
        ? (profileSnapshot.data() as Record<string, unknown>)
        : {};
      const currentStore = parseStoredHomePlannerStore(
        profileData,
        buildInitialHomePlannerMessage(profileName)
      );
      const existingChat = currentStore.chats.find(
        (chat) => chat.state.latestPlan?.sourceKey === sharedTrip.sourceKey
      );

      const nextStore = existingChat
        ? {
            ...currentStore,
            currentChatId: existingChat.id,
          }
        : (() => {
            const importedChat = createHomePlannerChatFromSharedTrip(sharedTrip);

            return {
              chats: sortHomePlannerChats([importedChat, ...currentStore.chats]),
              currentChatId: importedChat.id,
            };
          })();

      await saveHomePlannerStoreForUser(user.uid, nextStore);
      setPreviewTrip(null);
      setInfoMessage(
        existingChat
          ? "This shared trip is already in Home and is now selected there."
          : "Shared trip saved to Home. You can continue it there as your own copy."
      );
    } catch (nextError) {
      setError(getGroupsErrorMessage(nextError, "write"));
    } finally {
      setSavingSharedTripKey(null);
    }
  };

  const handleSaveGroupSettings = async () => {
    if (!group || !user || !isCreator || savingGroupSettings) {
      return;
    }

    const trimmedName = groupNameInput.trim();
    const trimmedDescription = groupDescriptionInput.trim();
    const normalizedJoinKey =
      group.accessType === "private" ? normalizeGroupJoinKey(groupJoinKeyInput) : "";

    if (trimmedName.length < 3) {
      setError("Group name must be at least 3 characters.");
      return;
    }

    if (group.accessType === "private" && normalizedJoinKey.length < 4) {
      setError("Private groups need a code with at least 4 characters.");
      return;
    }

    try {
      setSavingGroupSettings(true);
      setError("");
      setInfoMessage("");

      await updateDoc(doc(db, "groups", group.id), {
        joinKeyNormalized: group.accessType === "private" ? normalizedJoinKey : null,
        name: trimmedName,
        description: trimmedDescription,
        updatedAt: serverTimestamp(),
      });

      setInfoMessage("Group settings updated.");
    } catch (nextError) {
      setError(getGroupsErrorMessage(nextError, "write"));
    } finally {
      setSavingGroupSettings(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!group || !user || !isCreator || removingMemberId) {
      return;
    }

    if (memberId === group.creatorId) {
      return;
    }

    try {
      setRemovingMemberId(memberId);
      setError("");
      setInfoMessage("");

      await runTransaction(db, async (transaction) => {
        const groupRef = doc(db, "groups", group.id);
        const groupSnapshot = await transaction.get(groupRef);

        if (!groupSnapshot.exists()) {
          throw new Error("missing-group");
        }

        const currentGroup = parseTravelGroup(
          groupSnapshot.id,
          groupSnapshot.data() as Record<string, unknown>
        );

        if (currentGroup.creatorId !== user.uid) {
          throw new Error("not-group-creator");
        }

        const nextMemberIds = currentGroup.memberIds.filter(
          (currentMemberId) => currentMemberId !== memberId
        );

        transaction.update(groupRef, {
          memberCount: nextMemberIds.length,
          [`memberAvatarUrlsById.${memberId}`]: deleteField(),
          memberIds: nextMemberIds,
          [`memberLabelsById.${memberId}`]: deleteField(),
          [`memberUsernamesById.${memberId}`]: deleteField(),
          updatedAt: serverTimestamp(),
        });
      });

      setInfoMessage("Member removed from the group.");
    } catch (nextError) {
      setError(getGroupsErrorMessage(nextError, "write"));
    } finally {
      setRemovingMemberId(null);
    }
  };

  const handlePickGroupPhoto = async () => {
    if (!group || !isCreator || updatingGroupPhoto) {
      return;
    }

    try {
      setUpdatingGroupPhoto(true);
      setError("");
      setInfoMessage("");

      const permission =
        Platform.OS === "web"
          ? { granted: true }
          : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        setError("Allow gallery access to choose a group photo.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [1, 1],
        base64: true,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.45,
      });

      if (result.canceled || !result.assets?.[0]) {
        return;
      }

      const nextPhotoUrl = await readAssetDataUrl(result.assets[0]);

      if (nextPhotoUrl.length > 900000) {
        setError("The selected photo is too large. Choose a smaller image.");
        return;
      }

      await updateDoc(doc(db, "groups", group.id), {
        photoUrl: nextPhotoUrl,
        updatedAt: serverTimestamp(),
      });

      setInfoMessage("Group photo updated.");
    } catch (nextError) {
      setError(getGroupsErrorMessage(nextError, "write"));
    } finally {
      setUpdatingGroupPhoto(false);
    }
  };

  const handleResetGroupPhoto = async () => {
    if (!group || !isCreator || updatingGroupPhoto) {
      return;
    }

    try {
      setUpdatingGroupPhoto(true);
      setError("");
      setInfoMessage("");

      await updateDoc(doc(db, "groups", group.id), {
        photoUrl: "",
        updatedAt: serverTimestamp(),
      });

      setInfoMessage("Group photo reset.");
    } catch (nextError) {
      setError(getGroupsErrorMessage(nextError, "write"));
    } finally {
      setUpdatingGroupPhoto(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.loader, { backgroundColor: colors.screenSoft }]}
        edges={["top", "left", "right"]}
      >
        <ActivityIndicator size="large" color="#2D6A4F" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: colors.screenSoft }]}
      edges={["top", "left", "right"]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 8 : 0}
        style={styles.screen}
      >
        <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <MaterialIcons color="#1A1A1A" name="arrow-back-ios-new" size={20} />
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.92}
            onPress={() => setGroupDetailsVisible(true)}
            style={styles.headerMainPressable}
          >
            <View style={styles.headerAvatar}>
              {group?.photoUrl ? (
                <Image
                  source={{ uri: group.photoUrl }}
                  style={styles.headerAvatarImage}
                  contentFit="cover"
                />
              ) : (
                <View
                  style={[
                    styles.headerAvatarCircle,
                    { backgroundColor: getAvatarColor(group?.name ?? "Group") },
                  ]}
                >
                  <Text style={styles.headerAvatarText}>{getInitials(group?.name ?? "Group")}</Text>
                </View>
              )}
            </View>

            <View style={styles.headerTextWrap}>
            <Text numberOfLines={1} style={styles.headerTitle}>
              {group?.name}
            </Text>
            <Text numberOfLines={1} style={styles.headerMeta}>
              {group?.accessType === "private" ? "Private" : "Public"} • {membersLabel}
            </Text>
            </View>
          </TouchableOpacity>
        </View>

        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={[
            styles.messagesContent,
            { paddingBottom: 24 + composerBottomInset },
          ]}
          showsVerticalScrollIndicator={false}
          style={styles.messagesScroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        >
          {group?.description ? (
            <View
              style={[
                styles.descriptionCard,
                {
                  backgroundColor: colors.warningBackground,
                  borderColor: colors.warningBorder,
                },
              ]}
            >
              <Text style={[styles.descriptionText, { color: colors.textSecondary }]}>
                {group.description}
              </Text>
            </View>
          ) : null}

          {group?.accessType === "public" && !isMember ? (
            <View style={styles.joinInfoCard}>
              <View style={styles.joinInfoTextWrap}>
                <Text style={styles.joinInfoTitle}>Public group</Text>
                <Text style={styles.joinInfoText}>
                  Можеш да разглеждаш чата, а с `Join group` ще станеш member и ще можеш да пишеш.
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.9}
                disabled={joining}
                onPress={() => {
                  void handleJoinGroup();
                }}
                style={[styles.joinInfoButton, joining && styles.joinInfoButtonDisabled]}
              >
                <Text style={styles.joinInfoButtonText}>{joining ? "Joining..." : "Join group"}</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {(expenseMessages.length > 0 || isMember) && group ? (
            <View
              style={[
                styles.expenseSummaryCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={styles.expenseSummaryHeader}>
                <View style={styles.expenseSummaryHeaderTextWrap}>
                  <Text style={[styles.expenseSummaryKicker, { color: colors.accent }]}>
                    Expense split
                  </Text>
                  <Text style={[styles.expenseSummaryTitle, { color: colors.textPrimary }]}>
                    {expenseSummary.expenseCount === 0
                      ? "Start tracking shared costs"
                      : formatExpenseAmount(expenseSummary.totalSpent)}
                  </Text>
                  <Text style={[styles.expenseSummaryText, { color: colors.textSecondary }]}>
                    {expenseSummary.expenseCount === 0
                      ? `Split equal costs with ${membersLabel.toLowerCase()} from inside the chat.`
                      : expenseSummary.netBalance > 0
                        ? `Others owe you ${formatExpenseAmount(expenseSummary.netBalance)}`
                        : expenseSummary.netBalance < 0
                          ? `You owe ${formatExpenseAmount(Math.abs(expenseSummary.netBalance))}`
                          : "You are settled up right now."}
                  </Text>
                </View>
                <View
                  style={[
                    styles.expenseSummaryCountBadge,
                    { backgroundColor: colors.accentMuted, borderColor: colors.border },
                  ]}
                >
                  <Text style={[styles.expenseSummaryCountText, { color: colors.textPrimary }]}>
                    {expenseSummary.expenseCount} expense
                    {expenseSummary.expenseCount === 1 ? "" : "s"}
                  </Text>
                </View>
              </View>

              <View style={styles.expenseSummaryChipsRow}>
                <View
                  style={[
                    styles.expenseSummaryChip,
                    { backgroundColor: colors.cardAlt, borderColor: colors.border },
                  ]}
                >
                  <MaterialIcons color={colors.textMuted} name="group" size={15} />
                  <Text style={[styles.expenseSummaryChipText, { color: colors.textPrimary }]}>
                    {membersLabel}
                  </Text>
                </View>
                <View
                  style={[
                    styles.expenseSummaryChip,
                    { backgroundColor: colors.warningBackground, borderColor: colors.warningBorder },
                  ]}
                >
                  <MaterialIcons color={colors.warningText} name="equalizer" size={15} />
                  <Text style={[styles.expenseSummaryChipText, { color: colors.textPrimary }]}>
                    Equal split
                  </Text>
                </View>
              </View>
            </View>
          ) : null}

          {messages.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Няма съобщения още</Text>
              <Text style={styles.emptyText}>
                Send the first message or share a trip from Trips to start the conversation in this group.
              </Text>
            </View>
          ) : (
            messages.map((message) => {
              const isMine = message.senderId === user?.uid;
              const hasSharedTrip = message.messageType === "shared-trip" && !!message.sharedTrip;
              const hasExpense = message.messageType === "expense" && !!message.expense;
              const expense = hasExpense ? (message.expense as GroupChatExpense) : null;
              const myOutstandingAmount =
                expense && user ? getOutstandingExpenseAmount(message.id, expense, user.uid) : 0;
              const myRepayment =
                user && expense
                  ? expenseRepaymentsByKey[buildGroupExpenseRepaymentId(message.id, user.uid)] ?? null
                  : null;
              const settledShareCount = expense
                ? getExpenseSettledShareCount(message.id, expense)
                : 0;
              const expenseRemainingCollection = expense
                ? getExpenseRemainingCollectionAmount(message.id, expense)
                : 0;
              const isGroupPaymentExpense = expense?.collectionMode === "group-payment";
              const sharedTripLinkedTransports = message.sharedTrip?.linkedTransports ?? [];
              const senderName = isMine ? "You" : message.senderLabel;

              return (
                <View
                  key={message.id}
                  style={[styles.messageRow, isMine ? styles.myMessageRow : styles.theirMessageRow]}
                >
                  {!isMine ? (
                    <View style={styles.messageAvatarWrap}>
                      {message.senderAvatarUrl ? (
                        <Image
                          source={{ uri: message.senderAvatarUrl }}
                          style={styles.messageAvatarImage}
                          contentFit="cover"
                        />
                      ) : (
                        <View
                          style={[
                            styles.messageAvatarFallback,
                            { backgroundColor: getAvatarColor(senderName) },
                          ]}
                        >
                          <Text style={styles.messageAvatarFallbackText}>
                            {getInitials(senderName)}
                          </Text>
                        </View>
                      )}
                    </View>
                  ) : null}

                  <View
                    style={[
                      styles.messageBubble,
                      isMine ? styles.myMessageBubble : styles.theirMessageBubble,
                    ]}
                  >
                    <Text
                      style={[
                        styles.messageSender,
                        isMine ? styles.myMessageSender : styles.theirMessageSender,
                      ]}
                    >
                      {senderName}
                    </Text>
                    {hasSharedTrip ? (
                      <View
                        style={[
                          styles.sharedTripCard,
                          isMine ? styles.mySharedTripCard : styles.theirSharedTripCard,
                        ]}
                      >
                        <TouchableOpacity
                          activeOpacity={0.92}
                          onPress={() => setPreviewTrip(message.sharedTrip)}
                        >
                          <View style={styles.sharedTripTopRow}>
                            <Text
                              style={[styles.sharedTripKicker, isMine && styles.mySharedTripKicker]}
                            >
                              Trip plan
                            </Text>
                            <View
                              style={[
                                styles.sharedTripSourceBadge,
                                message.sharedTrip?.source === "home"
                                  ? styles.sharedTripHomeBadge
                                  : styles.sharedTripDiscoverBadge,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.sharedTripSourceBadgeText,
                                  message.sharedTrip?.source === "home"
                                    ? styles.sharedTripHomeBadgeText
                                    : styles.sharedTripDiscoverBadgeText,
                                ]}
                              >
                                {getSharedTripSourceLabel(message.sharedTrip?.source ?? "discover")}
                              </Text>
                            </View>
                          </View>
                          <Text style={[styles.sharedTripTitle, isMine && styles.mySharedTripTitle]}>
                            {message.sharedTrip?.title}
                          </Text>
                          <Text
                            style={[
                              styles.sharedTripDestination,
                              isMine && styles.mySharedTripDestination,
                            ]}
                          >
                            {message.sharedTrip?.destination}
                          </Text>
                          <View style={styles.sharedTripMetaRow}>
                            {message.sharedTrip?.duration ? (
                              <Text
                                style={[
                                  styles.sharedTripMetaText,
                                  isMine && styles.mySharedTripMetaText,
                                ]}
                              >
                                {message.sharedTrip.duration}
                              </Text>
                            ) : null}
                            {message.sharedTrip?.budget ? (
                              <Text
                                style={[
                                  styles.sharedTripMetaText,
                                  isMine && styles.mySharedTripMetaText,
                                ]}
                              >
                                {message.sharedTrip.budget}
                              </Text>
                            ) : null}
                          </View>
                          {message.sharedTrip?.summary ? (
                            <Text
                              numberOfLines={3}
                              style={[styles.sharedTripSummary, isMine && styles.mySharedTripSummary]}
                            >
                              {message.sharedTrip.summary}
                            </Text>
                          ) : null}
                          <Text
                            numberOfLines={4}
                            style={[
                              styles.sharedTripDetailsPreview,
                              isMine && styles.mySharedTripDetailsPreview,
                            ]}
                          >
                            {buildSharedTripDetailsPreview(message.sharedTrip)}
                          </Text>
                          <Text style={[styles.sharedTripHint, isMine && styles.mySharedTripHint]}>
                            {sharedTripLinkedTransports.length > 0
                              ? "Tap to open the full trip plan and all linked planner offers"
                              : "Tap to open the full trip plan"}
                          </Text>
                        </TouchableOpacity>
                        {sharedTripLinkedTransports.length > 0 ? (
                          <View style={styles.linkedTransportSection}>
                            <Text
                              style={[
                                styles.linkedTransportSectionTitle,
                                isMine && styles.myLinkedTransportSectionTitle,
                              ]}
                            >
                              Planner ticket prices
                            </Text>
                            {sharedTripLinkedTransports.slice(0, 2).map((linkedTransport) => {
                              const linkedExpenseKey = buildLinkedExpenseLookupKey(
                                message.sharedTrip?.sourceKey ?? "",
                                linkedTransport.itemKey
                              );
                              const linkedExpenseMessage = linkedExpenseMessagesByKey[linkedExpenseKey] ?? null;
                              const ticketShareAmount =
                                group && group.memberCount > 0
                                  ? linkedTransport.amountValue / group.memberCount
                                  : linkedTransport.amountValue;

                              return (
                                <View
                                  key={linkedTransport.itemKey}
                                  style={[
                                    styles.linkedTransportCard,
                                    isMine ? styles.myLinkedTransportCard : styles.theirLinkedTransportCard,
                                  ]}
                                >
                                  <View style={styles.linkedTransportTopRow}>
                                    <View style={styles.linkedTransportTextWrap}>
                                      <Text
                                        style={[
                                          styles.linkedTransportTitle,
                                          isMine && styles.myLinkedTransportTitle,
                                        ]}
                                      >
                                        {linkedTransport.title}
                                      </Text>
                                      {linkedTransport.route ? (
                                        <Text
                                          numberOfLines={2}
                                          style={[
                                            styles.linkedTransportRoute,
                                            isMine && styles.myLinkedTransportRoute,
                                          ]}
                                        >
                                          {linkedTransport.route}
                                        </Text>
                                      ) : null}
                                    </View>
                                    <Text
                                      style={[
                                        styles.linkedTransportAmount,
                                        isMine && styles.myLinkedTransportAmount,
                                      ]}
                                    >
                                      {linkedTransport.amountLabel}
                                    </Text>
                                  </View>

                                  <View style={styles.linkedTransportMetaRow}>
                                    {linkedTransport.duration ? (
                                      <Text
                                        style={[
                                          styles.linkedTransportMetaText,
                                          isMine && styles.myLinkedTransportMetaText,
                                        ]}
                                      >
                                        {linkedTransport.duration}
                                      </Text>
                                    ) : null}
                                    {linkedTransport.sourceLabel ? (
                                      <Text
                                        style={[
                                          styles.linkedTransportMetaText,
                                          isMine && styles.myLinkedTransportMetaText,
                                        ]}
                                      >
                                        {linkedTransport.sourceLabel}
                                      </Text>
                                    ) : null}
                                    <Text
                                      style={[
                                        styles.linkedTransportMetaText,
                                        isMine && styles.myLinkedTransportMetaText,
                                      ]}
                                    >
                                      {formatExpenseAmount(ticketShareAmount)} each
                                    </Text>
                                  </View>

                                  {linkedExpenseMessage ? (
                                    <View
                                      style={[
                                        styles.linkedTransportPostedBadge,
                                        isMine
                                          ? styles.myLinkedTransportPostedBadge
                                          : styles.theirLinkedTransportPostedBadge,
                                      ]}
                                    >
                                      <MaterialIcons color="#2D6A4F" name="check-circle" size={15} />
                                      <Text style={styles.linkedTransportPostedBadgeText}>
                                        Expense posted in chat
                                      </Text>
                                    </View>
                                  ) : (
                                    <View style={styles.linkedTransportActionsRow}>
                                      <TouchableOpacity
                                        activeOpacity={0.9}
                                        onPress={() => {
                                          void handleOpenPlannerTicket(linkedTransport.bookingUrl);
                                        }}
                                        style={[
                                          styles.linkedTransportSecondaryButton,
                                          isMine && styles.myLinkedTransportSecondaryButton,
                                        ]}
                                      >
                                        <MaterialIcons color="#6B7280" name="open-in-new" size={16} />
                                        <Text style={styles.linkedTransportSecondaryButtonText}>
                                          Open link
                                        </Text>
                                      </TouchableOpacity>
                                      <TouchableOpacity
                                        activeOpacity={0.9}
                                        disabled={creatingLinkedExpenseKey === linkedExpenseKey}
                                        onPress={() => {
                                          void handleCreateLinkedTransportExpense(message, linkedTransport);
                                        }}
                                        style={[
                                          styles.linkedTransportPrimaryButton,
                                          creatingLinkedExpenseKey === linkedExpenseKey &&
                                            styles.linkedTransportPrimaryButtonDisabled,
                                        ]}
                                      >
                                        <MaterialIcons color="#FFFFFF" name="payments" size={16} />
                                        <Text style={styles.linkedTransportPrimaryButtonText}>
                                          {creatingLinkedExpenseKey === linkedExpenseKey
                                            ? "Posting..."
                                            : "Create in-app split"}
                                        </Text>
                                      </TouchableOpacity>
                                    </View>
                                  )}
                                </View>
                              );
                            })}
                            {sharedTripLinkedTransports.length > 2 ? (
                              <Text
                                style={[
                                  styles.linkedTransportMoreHint,
                                  isMine && styles.myLinkedTransportMoreHint,
                                ]}
                              >
                                Open the trip to see all planner ticket options.
                              </Text>
                            ) : null}
                          </View>
                        ) : null}
                      </View>
                    ) : hasExpense ? (
                      <View
                        style={[
                          styles.expenseCard,
                          isMine ? styles.myExpenseCard : styles.theirExpenseCard,
                        ]}
                      >
                        <View style={styles.expenseCardTopRow}>
                          <Text style={[styles.expenseCardKicker, isMine && styles.myExpenseCardKicker]}>
                            Expense split
                          </Text>
                          <Text style={[styles.expenseCardAmount, isMine && styles.myExpenseCardAmount]}>
                            {expense?.amountLabel}
                          </Text>
                        </View>
                        <Text style={[styles.expenseCardTitle, isMine && styles.myExpenseCardTitle]}>
                          {expense?.title}
                        </Text>
                        <Text
                          style={[
                            styles.expenseCardMeta,
                            isMine && styles.myExpenseCardMeta,
                          ]}
                        >
                          {isGroupPaymentExpense
                            ? `Created by ${expense?.paidByLabel}`
                            : `Paid by ${expense?.paidByLabel}`}
                        </Text>
                        <View style={styles.expenseCardChipsRow}>
                          <View
                            style={[
                              styles.expenseCardChip,
                              isMine ? styles.myExpenseCardChip : styles.theirExpenseCardChip,
                            ]}
                          >
                            <Text
                              style={[
                                styles.expenseCardChipText,
                                isMine && styles.myExpenseCardChipText,
                              ]}
                            >
                              Split with {expense?.participantCount} people
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.expenseCardChip,
                              isMine ? styles.myExpenseCardChip : styles.theirExpenseCardChip,
                            ]}
                          >
                            <Text
                              style={[
                                styles.expenseCardChipText,
                                isMine && styles.myExpenseCardChipText,
                              ]}
                            >
                              {expense ? formatExpenseAmount(getExpensePerPerson(expense)) : "0 EUR"} each
                            </Text>
                          </View>
                          {expense ? (
                            <View
                              style={[
                                styles.expenseCardChip,
                                isMine ? styles.myExpenseCardChip : styles.theirExpenseCardChip,
                              ]}
                            >
                              <Text
                              style={[
                                styles.expenseCardChipText,
                                isMine && styles.myExpenseCardChipText,
                              ]}
                            >
                                {expense
                                  ? `${settledShareCount}/${expense.participantCount} shares covered`
                                  : "No repayment needed"}
                            </Text>
                          </View>
                        ) : null}
                        </View>
                        {expense && expense.paidById === user?.uid ? (
                          <View style={styles.expenseRepaymentStatusRow}>
                            <Text
                              style={[
                                styles.expenseRepaymentStatusText,
                                isMine && styles.myExpenseRepaymentStatusText,
                              ]}
                            >
                              {isGroupPaymentExpense
                                ? expenseRemainingCollection > 0
                                  ? `${settledShareCount}/${expense.participantCount} shares paid in-app. ${formatExpenseRepaymentAmount(
                                      expenseRemainingCollection
                                    )} still waiting.`
                                  : "Everyone paid their equal share in-app"
                                : expenseRemainingCollection > 0
                                  ? `Your share is included. Still waiting for ${formatExpenseRepaymentAmount(
                                      expenseRemainingCollection
                                    )} from the others.`
                                  : "Everyone settled this expense"}
                            </Text>
                          </View>
                        ) : null}
                        {expense?.linkedBookingUrl ? (
                          <TouchableOpacity
                            activeOpacity={0.9}
                            onPress={() => {
                              void handleOpenPlannerTicket(expense.linkedBookingUrl as string);
                            }}
                            style={[
                              styles.linkedExpenseOpenButton,
                              isMine ? styles.myLinkedExpenseOpenButton : styles.theirLinkedExpenseOpenButton,
                            ]}
                          >
                            <MaterialIcons color="#6B7280" name="confirmation-number" size={16} />
                            <Text style={styles.linkedExpenseOpenButtonText}>
                              Open planner ticket link
                            </Text>
                          </TouchableOpacity>
                        ) : null}
                        {expense &&
                        ((isGroupPaymentExpense && myOutstandingAmount > 0) ||
                          (!isGroupPaymentExpense &&
                            expense.paidById !== user?.uid &&
                            myOutstandingAmount > 0)) ? (
                          <TouchableOpacity
                            activeOpacity={0.92}
                            disabled={processingRepaymentExpenseId === message.id || !isMember}
                            onPress={() => {
                              void handlePayExpense(message);
                            }}
                            style={[
                              styles.expensePayButton,
                              processingRepaymentExpenseId === message.id &&
                                styles.expensePayButtonDisabled,
                            ]}
                          >
                            <MaterialIcons color="#FFFFFF" name="lock" size={16} />
                            <Text style={styles.expensePayButtonText}>
                              {processingRepaymentExpenseId === message.id
                                ? "Opening Stripe..."
                                : isGroupPaymentExpense
                                  ? `Pay your ${formatExpenseRepaymentAmount(
                                      myOutstandingAmount
                                    )} share with Stripe`
                                  : `Pay ${formatExpenseRepaymentAmount(myOutstandingAmount)} with Stripe`}
                            </Text>
                          </TouchableOpacity>
                        ) : null}
                        {expense &&
                        ((isGroupPaymentExpense && !!myRepayment) ||
                          (!isGroupPaymentExpense && expense.paidById !== user?.uid && myRepayment)) ? (
                          <View
                            style={[
                              styles.expensePaidBadge,
                              isMine ? styles.myExpensePaidBadge : styles.theirExpensePaidBadge,
                            ]}
                          >
                            <MaterialIcons color="#2D6A4F" name="verified" size={15} />
                            <Text style={styles.expensePaidBadgeText}>
                              {isGroupPaymentExpense
                                ? `Your share was paid via Stripe • ${myRepayment.amountLabel}`
                                : `Paid via Stripe • ${myRepayment.amountLabel}`}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    ) : (
                      <Text style={[styles.messageText, isMine && styles.myMessageText]}>
                        {message.text}
                      </Text>
                    )}
                    <Text style={[styles.messageTime, isMine && styles.myMessageTime]}>
                      {formatMessageTime(message.createdAtMs)}
                    </Text>
                  </View>

                  {isMine ? (
                    <View style={styles.messageAvatarWrap}>
                      {message.senderAvatarUrl ? (
                        <Image
                          source={{ uri: message.senderAvatarUrl }}
                          style={styles.messageAvatarImage}
                          contentFit="cover"
                        />
                      ) : (
                        <View
                          style={[
                            styles.messageAvatarFallback,
                            { backgroundColor: getAvatarColor(senderName) },
                          ]}
                        >
                          <Text style={styles.messageAvatarFallbackText}>
                            {getInitials(senderName)}
                          </Text>
                        </View>
                      )}
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </ScrollView>

        <View style={[styles.composerBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: composerBottomInset }]}>
          <TouchableOpacity
            activeOpacity={0.9}
            disabled={!canOpenSharePicker || sending || joining}
            onPress={() => setShareSheetVisible(true)}
            style={[
              styles.shareSavedButton,
              (!canOpenSharePicker || sending || joining) && styles.shareSavedButtonDisabled,
            ]}
          >
            <MaterialIcons color="#2D6A4F" name="bookmark-added" size={20} />
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.9}
            disabled={!canManageExpenses || sending || joining || savingExpense}
            onPress={() => setExpenseSheetVisible(true)}
            style={[
              styles.shareSavedButton,
              (!canManageExpenses || sending || joining || savingExpense) &&
                styles.shareSavedButtonDisabled,
            ]}
          >
            <MaterialIcons color="#2D6A4F" name="receipt-long" size={20} />
          </TouchableOpacity>
          <TextInput
            multiline
            onChangeText={setComposerValue}
            onFocus={() => {
              requestAnimationFrame(() => {
                scrollViewRef.current?.scrollToEnd({ animated: true });
              });
            }}
            editable={group?.accessType === "public" || isMember}
            placeholder={
              group?.accessType === "public" || isMember
                ? "Write a message"
                : "You need access to write"
            }
            placeholderTextColor="#809071"
            style={[styles.composerInput, { color: colors.textPrimary }]}
            value={composerValue}
            returnKeyType={Platform.OS === "web" ? undefined : "send"}
            blurOnSubmit={false}
            onSubmitEditing={() => {
              if (Platform.OS !== "web") {
                void handleSend();
              }
            }}
          />
          <TouchableOpacity
            activeOpacity={0.9}
            disabled={
              sending ||
              joining ||
              composerValue.trim().length === 0 ||
              (!isMember && group?.accessType !== "public")
            }
            onPress={handleSend}
            style={[
              styles.sendButton,
              (sending ||
                joining ||
                composerValue.trim().length === 0 ||
                (!isMember && group?.accessType !== "public")) &&
                styles.sendButtonDisabled,
            ]}
          >
            <MaterialIcons color="#FFFFFF" name="north-east" size={20} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {error ? (
        <View style={styles.toastContainer} pointerEvents="box-none">
          <View
            style={[
              styles.toast,
              { backgroundColor: colors.errorBackground, borderColor: colors.errorBorder },
            ]}
          >
            <MaterialIcons name="error-outline" size={18} color={colors.errorText} />
            <Text style={[styles.toastText, { color: colors.errorText }]} numberOfLines={3}>
              {error}
            </Text>
            <TouchableOpacity onPress={() => setError("")} activeOpacity={0.7}>
              <MaterialIcons name="close" size={16} color={colors.errorText} />
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {infoMessage ? (
        <View style={styles.toastContainer} pointerEvents="box-none">
          <View
            style={[
              styles.toast,
              { backgroundColor: colors.cardAlt, borderColor: colors.border },
            ]}
          >
            <MaterialIcons name="info-outline" size={18} color={colors.textSecondary} />
            <Text style={[styles.toastText, { color: colors.textSecondary }]} numberOfLines={3}>
              {infoMessage}
            </Text>
            <TouchableOpacity onPress={() => setInfoMessage("")} activeOpacity={0.7}>
              <MaterialIcons name="close" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <Modal
        animationType="slide"
        onRequestClose={() => setGroupDetailsVisible(false)}
        visible={groupDetailsVisible}
      >
        <SafeAreaView style={[styles.detailsScreen, { backgroundColor: colors.screenSoft }]} edges={["top"]}>
          <View style={[styles.detailsTopBar, { borderBottomColor: colors.border }]}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setGroupDetailsVisible(false)}
              style={styles.backButton}
            >
              <MaterialIcons color={colors.textPrimary} name="close" size={22} />
            </TouchableOpacity>
            <Text style={[styles.detailsTopBarTitle, { color: colors.textPrimary }]}>Group info</Text>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView
            contentContainerStyle={styles.groupDetailsContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.detailsHeroSection}>
              <TouchableOpacity
                activeOpacity={isCreator ? 0.92 : 1}
                disabled={!isCreator || updatingGroupPhoto}
                onPress={() => {
                  void handlePickGroupPhoto();
                }}
                style={styles.groupDetailsPhotoWrap}
              >
                {group?.photoUrl ? (
                  <Image
                    source={{ uri: group.photoUrl }}
                    style={styles.groupDetailsPhoto}
                    contentFit="cover"
                  />
                ) : (
                  <View
                    style={[
                      styles.groupDetailsPhotoFallback,
                      { backgroundColor: getAvatarColor(group?.name ?? "Group") },
                    ]}
                  >
                    <Text style={styles.groupDetailsPhotoFallbackText}>
                      {getInitials(group?.name ?? "Group")}
                    </Text>
                  </View>
                )}
                {isCreator ? (
                  <View style={styles.groupDetailsPhotoBadge}>
                    <MaterialIcons
                      color="#8B5611"
                      name={group?.photoUrl ? "photo-camera" : "add-a-photo"}
                      size={16}
                    />
                  </View>
                ) : null}
              </TouchableOpacity>

              <Text numberOfLines={2} style={[styles.detailsHeroTitle, { color: colors.textPrimary }]}>
                {group?.name}
              </Text>
              <Text style={[styles.detailsHeroMeta, { color: colors.textSecondary }]}>
                {group?.accessType === "private" ? "Private" : "Public"} • {membersLabel}
              </Text>
              {isCreator && group?.photoUrl ? (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => {
                    void handleResetGroupPhoto();
                  }}
                  style={styles.groupDetailsSecondaryAction}
                >
                  <Text style={[styles.groupDetailsSecondaryActionText, { color: colors.textMuted }]}>
                    {updatingGroupPhoto ? "Updating..." : "Reset photo"}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {group?.description && hasMeaningfulDescription(group.description) ? (
              <View style={[styles.detailsSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.detailsSectionTitle, { color: colors.textMuted }]}>Description</Text>
                <Text style={[styles.descriptionText, { color: colors.textPrimary }]}>
                  {group.description}
                </Text>
              </View>
            ) : null}

            <View style={[styles.detailsSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.membersHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.detailsSectionTitle, { color: colors.textMuted }]}>Members</Text>
                  <Text style={[styles.membersSubtitle, { color: colors.textSecondary }]}>
                    Everyone in the group can see who is inside.
                  </Text>
                </View>
                <View style={[styles.membersCountBadge, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
                  <Text style={[styles.membersCountText, { color: colors.textPrimary }]}>{membersLabel}</Text>
                </View>
              </View>

                <View style={styles.membersSearchShell}>
                  <MaterialIcons color="#7B8A6D" name="search" size={18} />
                  <TextInput
                    style={styles.membersSearchInput}
                    value={memberSearchQuery}
                    onChangeText={setMemberSearchQuery}
                    placeholder="Search people in the group"
                    placeholderTextColor="#809071"
                  />
                </View>

                {memberRows.length === 0 ? (
                  <Text style={styles.membersEmptyText}>No people match this search yet.</Text>
                ) : (
                  memberRows.map((member) => (
                    <View key={member.id} style={styles.memberRow}>
                      {member.avatarUrl ? (
                        <Image
                          source={{ uri: member.avatarUrl }}
                          style={styles.memberAvatarImage}
                          contentFit="cover"
                        />
                      ) : (
                        <View style={styles.memberAvatarCircle}>
                          <Text style={styles.memberAvatarText}>{getInitials(member.label)}</Text>
                        </View>
                      )}

                      <View style={styles.memberTextWrap}>
                        <Text style={styles.memberName}>
                          {member.label}
                          {member.isCreator ? " • creator" : ""}
                        </Text>
                        <Text style={styles.memberMeta}>
                          {member.username ? `@${member.username}` : member.id.slice(0, 8)}
                        </Text>
                      </View>

                      {isCreator && !member.isCreator ? (
                        <TouchableOpacity
                          style={[
                            styles.memberActionButton,
                            removingMemberId === member.id && styles.memberActionButtonDisabled,
                          ]}
                          onPress={() => {
                            void handleRemoveMember(member.id);
                          }}
                          disabled={removingMemberId === member.id}
                          activeOpacity={0.9}
                        >
                          <Text style={styles.memberActionButtonText}>
                            {removingMemberId === member.id ? "Removing..." : "Remove"}
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ))
                )}
            </View>

            {isCreator ? (
              <View style={[styles.detailsSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.detailsSectionTitle, { color: colors.textMuted }]}>Group settings</Text>
                <Text style={[styles.settingsSubtitle, { color: colors.textSecondary }]}>
                  Rename the group and manage the private code if this is a private group.
                </Text>

                  <Text style={styles.settingsLabel}>Group name</Text>
                  <TextInput
                    style={styles.settingsInput}
                    value={groupNameInput}
                    onChangeText={setGroupNameInput}
                    placeholder="Group name"
                    placeholderTextColor="#809071"
                  />

                  <Text style={styles.settingsLabel}>Description</Text>
                  <TextInput
                    multiline
                    numberOfLines={4}
                    style={[styles.settingsInput, styles.groupDescriptionInput]}
                    value={groupDescriptionInput}
                    onChangeText={setGroupDescriptionInput}
                    placeholder="Description"
                    placeholderTextColor="#809071"
                    textAlignVertical="top"
                  />

                  {group?.accessType === "private" ? (
                    <>
                      <Text style={styles.settingsLabel}>Private code</Text>
                      <TextInput
                        style={styles.settingsInput}
                        value={groupJoinKeyInput}
                        onChangeText={setGroupJoinKeyInput}
                        placeholder="Private code"
                        placeholderTextColor="#809071"
                        autoCapitalize="characters"
                      />
                    </>
                  ) : null}

                  <TouchableOpacity
                    style={[
                      styles.settingsSaveButton,
                      savingGroupSettings && styles.settingsSaveButtonDisabled,
                    ]}
                    onPress={() => {
                      void handleSaveGroupSettings();
                    }}
                    disabled={savingGroupSettings}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.settingsSaveButtonText}>
                      {savingGroupSettings ? "Saving..." : "Save settings"}
                    </Text>
                  </TouchableOpacity>
              </View>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setShareSheetVisible(false)}
        transparent
        visible={shareSheetVisible}
      >
        <View style={[styles.modalOverlay, { backgroundColor: colors.modalOverlay }]}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setShareSheetVisible(false)}
            style={styles.modalBackdrop}
          />
          <View style={styles.sheetCard}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderTextWrap}>
                <Text style={styles.sheetTitle}>Share from Trips</Text>
                <Text style={styles.sheetSubtitle}>
                  Избери Trip Plan, който искаш да пратиш в групата.
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => setShareSheetVisible(false)}
                style={styles.sheetCloseButton}
              >
                <MaterialIcons color="#1A1A1A" name="close" size={20} />
              </TouchableOpacity>
            </View>

            {savedTrips.length === 0 ? (
              <View style={styles.sheetEmptyState}>
                <Text style={styles.sheetEmptyTitle}>You do not have Trips yet</Text>
                <Text style={styles.sheetEmptyText}>
                  Запази план от Home или Discover и после ще можеш да го share-неш в групата.
                </Text>
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => {
                    setShareSheetVisible(false);
                    router.push("/saved");
                  }}
                  style={styles.sheetPrimaryButton}
                >
                  <Text style={styles.sheetPrimaryButtonText}>Open Trips</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView
                contentContainerStyle={styles.sheetTripsContent}
                showsVerticalScrollIndicator={false}
              >
                {savedTrips.map((trip) => (
                  <View key={trip.id} style={styles.sheetTripCard}>
                    <View style={styles.sheetTripTopRow}>
                      <View
                        style={[
                          styles.sheetTripSourceBadge,
                          trip.source === "home"
                            ? styles.sharedTripHomeBadge
                            : styles.sharedTripDiscoverBadge,
                        ]}
                      >
                        <Text
                          style={[
                            styles.sheetTripSourceBadgeText,
                            trip.source === "home"
                              ? styles.sharedTripHomeBadgeText
                              : styles.sharedTripDiscoverBadgeText,
                          ]}
                        >
                          {getSharedTripSourceLabel(trip.source)}
                        </Text>
                      </View>
                      <Text style={styles.sheetTripDate}>
                        {new Intl.DateTimeFormat("bg-BG", {
                          day: "2-digit",
                          month: "short",
                        }).format(new Date(trip.createdAtMs))}
                      </Text>
                    </View>
                    <Text style={styles.sheetTripTitle}>{trip.title}</Text>
                    <Text style={styles.sheetTripDestination}>{trip.destination}</Text>
                    <View style={styles.sheetTripMetaRow}>
                      {trip.duration ? <Text style={styles.sheetTripMetaText}>{trip.duration}</Text> : null}
                      {trip.budget ? <Text style={styles.sheetTripMetaText}>{trip.budget}</Text> : null}
                    </View>
                    {trip.summary ? (
                      <Text numberOfLines={2} style={styles.sheetTripSummary}>
                        {trip.summary}
                      </Text>
                    ) : null}
                    <TouchableOpacity
                      activeOpacity={0.9}
                      disabled={sharingTripId !== null}
                      onPress={() => {
                        void handleShareTrip(trip);
                      }}
                      style={[
                        styles.sheetShareButton,
                        sharingTripId === trip.id && styles.sheetShareButtonDisabled,
                      ]}
                    >
                      <Text style={styles.sheetShareButtonText}>
                        {sharingTripId === trip.id ? "Sharing..." : "Share to group"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setPreviewTrip(null)}
        transparent
        visible={!!previewTrip}
      >
        <View style={[styles.modalOverlay, { backgroundColor: colors.modalOverlay }]}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setPreviewTrip(null)}
            style={styles.modalBackdrop}
          />
          <View style={styles.previewCard}>
            <View style={styles.previewHeader}>
              <View style={styles.previewHeaderTextWrap}>
                <Text style={styles.previewTitle}>{previewTrip?.title}</Text>
                <Text style={styles.previewDestination}>{previewTrip?.destination}</Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => setPreviewTrip(null)}
                style={styles.sheetCloseButton}
              >
                <MaterialIcons color="#1A1A1A" name="close" size={20} />
              </TouchableOpacity>
            </View>

            <View style={styles.previewMetaRow}>
              <View
                style={[
                  styles.sheetTripSourceBadge,
                  previewTrip?.source === "home"
                    ? styles.sharedTripHomeBadge
                    : styles.sharedTripDiscoverBadge,
                ]}
              >
                <Text
                  style={[
                    styles.sheetTripSourceBadgeText,
                    previewTrip?.source === "home"
                      ? styles.sharedTripHomeBadgeText
                      : styles.sharedTripDiscoverBadgeText,
                  ]}
                >
                  {getSharedTripSourceLabel(previewTrip?.source ?? "discover")}
                </Text>
              </View>
              {previewTrip?.duration ? <Text style={styles.previewMetaText}>{previewTrip.duration}</Text> : null}
              {previewTrip?.budget ? <Text style={styles.previewMetaText}>{previewTrip.budget}</Text> : null}
            </View>

            {previewTrip?.summary ? <Text style={styles.previewSummary}>{previewTrip.summary}</Text> : null}

            {previewTrip?.linkedTransports?.length ? (
              <View style={styles.previewLinkedTransportSection}>
                <Text style={styles.previewLinkedTransportTitle}>Planner ticket links</Text>
                {previewTrip.linkedTransports.map((linkedTransport) => (
                  <View key={linkedTransport.itemKey} style={styles.previewLinkedTransportCard}>
                    <View style={styles.previewLinkedTransportTopRow}>
                      <View style={styles.previewLinkedTransportTextWrap}>
                        <Text style={styles.previewLinkedTransportCardTitle}>
                          {linkedTransport.title}
                        </Text>
                        {linkedTransport.route ? (
                          <Text
                            numberOfLines={2}
                            style={styles.previewLinkedTransportRoute}
                          >
                            {linkedTransport.route}
                          </Text>
                        ) : null}
                      </View>
                      <Text style={styles.previewLinkedTransportAmount}>
                        {linkedTransport.amountLabel}
                      </Text>
                    </View>
                    <View style={styles.previewLinkedTransportMetaRow}>
                      {linkedTransport.duration ? (
                        <Text style={styles.previewLinkedTransportMetaText}>
                          {linkedTransport.duration}
                        </Text>
                      ) : null}
                      {linkedTransport.sourceLabel ? (
                        <Text style={styles.previewLinkedTransportMetaText}>
                          {linkedTransport.sourceLabel}
                        </Text>
                      ) : null}
                    </View>
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() => {
                        void handleOpenPlannerTicket(linkedTransport.bookingUrl);
                      }}
                      style={styles.previewLinkedTransportButton}
                    >
                      <MaterialIcons color="#6B7280" name="open-in-new" size={16} />
                      <Text style={styles.previewLinkedTransportButtonText}>Open ticket link</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : null}

            <ScrollView
              contentContainerStyle={styles.previewDetailsContent}
              showsVerticalScrollIndicator={false}
              style={styles.previewDetailsScroll}
            >
              <Text style={styles.previewDetailsText}>
                {buildSharedTripDetailsText(previewTrip)}
              </Text>
            </ScrollView>

            {previewTrip ? (
              <TouchableOpacity
                style={[
                  styles.previewSaveButton,
                  savingSharedTripKey === previewTrip.sourceKey &&
                    styles.previewSaveButtonDisabled,
                ]}
                onPress={() => {
                  void handleSaveSharedTripToHome(previewTrip);
                }}
                disabled={savingSharedTripKey === previewTrip.sourceKey}
                activeOpacity={0.9}
              >
                <Text style={styles.previewSaveButtonText}>
                  {savingSharedTripKey === previewTrip.sourceKey
                    ? "Saving..."
                    : "Save to Home"}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setExpenseSheetVisible(false)}
        transparent
        visible={expenseSheetVisible}
      >
        <View style={[styles.modalOverlay, { backgroundColor: colors.modalOverlay }]}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setExpenseSheetVisible(false)}
            style={styles.modalBackdrop}
          />
          <View style={styles.sheetCard}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderTextWrap}>
                <Text style={styles.sheetTitle}>Add shared expense</Text>
                <Text style={styles.sheetSubtitle}>
                  This amount will be split equally across {membersLabel.toLowerCase()}.
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => setExpenseSheetVisible(false)}
                style={styles.sheetCloseButton}
              >
                <MaterialIcons color="#1A1A1A" name="close" size={20} />
              </TouchableOpacity>
            </View>

            <TextInput
              onChangeText={setExpenseTitle}
              placeholder="Expense title"
              placeholderTextColor="#809071"
              style={styles.sheetTextInput}
              value={expenseTitle}
            />
            <TextInput
              keyboardType={Platform.OS === "ios" ? "decimal-pad" : "numeric"}
              onChangeText={setExpenseAmount}
              placeholder="Amount in EUR"
              placeholderTextColor="#809071"
              style={styles.sheetTextInput}
              value={expenseAmount}
            />

            <View style={styles.expensePreviewCard}>
              <Text style={styles.expensePreviewKicker}>Preview</Text>
              <Text style={styles.expensePreviewTitle}>
                {expenseTitle.trim() || "Dinner, fuel, tickets..."}
              </Text>
              <Text style={styles.expensePreviewMeta}>Paid by {profileName}</Text>
              <View style={styles.expensePreviewPills}>
                <View style={styles.expensePreviewPill}>
                  <Text style={styles.expensePreviewPillText}>
                    {expenseAmount.trim() ? `${expenseAmount.trim()} EUR` : "0 EUR"}
                  </Text>
                </View>
                <View style={styles.expensePreviewPill}>
                  <Text style={styles.expensePreviewPillText}>
                    {group?.memberCount ?? 0} travelers
                  </Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              activeOpacity={0.9}
              disabled={savingExpense}
              onPress={() => {
                void handleAddExpense();
              }}
              style={[styles.sheetPrimaryButton, savingExpense && styles.sheetShareButtonDisabled]}
            >
              <Text style={styles.sheetPrimaryButtonText}>
                {savingExpense ? "Adding..." : "Add expense"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: "#F0F0F0",
    flex: 1,
  },
  loader: {
    alignItems: "center",
    backgroundColor: "#F0F0F0",
    flex: 1,
    justifyContent: "center",
  },
  header: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderBottomColor: "#E8E8E8",
    borderBottomWidth: 1,
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  headerMainPressable: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
  },
  backButton: {
    alignItems: "center",
    backgroundColor: "#F5F5F5",
    borderRadius: Radius.lg,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  headerAvatar: {
    marginLeft: Spacing.md,
  },
  headerAvatarImage: {
    borderRadius: Radius.xl,
    height: 44,
    width: 44,
  },
  headerAvatarCircle: {
    alignItems: "center",
    borderRadius: Radius.xl,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  headerAvatarText: {
    color: "#FFFFFF",
    ...TypeScale.titleLg,
    fontWeight: FontWeight.extrabold,
  },
  headerTextWrap: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  headerTitle: {
    color: "#1A1A1A",
    ...TypeScale.titleLg,
    fontWeight: FontWeight.extrabold,
    flexShrink: 1,
  },
  headerMeta: {
    color: "#6B7280",
    ...TypeScale.bodySm,
    marginTop: Spacing.xs,
    flexShrink: 1,
  },
  detailsScreen: {
    flex: 1,
  },
  detailsTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  detailsTopBarTitle: {
    ...TypeScale.titleMd,
    fontWeight: FontWeight.bold,
  },
  groupDetailsContent: {
    paddingBottom: Spacing["4xl"],
  },
  detailsHeroSection: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  detailsSection: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    padding: Spacing.lg,
  },
  detailsSectionTitle: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.bold,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: Spacing.sm,
  },
  groupDetailsPhotoWrap: {
    position: "relative",
    marginBottom: Spacing.md,
  },
  groupDetailsPhoto: {
    borderRadius: Radius.xl,
    height: 80,
    width: 80,
  },
  groupDetailsPhotoFallback: {
    alignItems: "center",
    borderRadius: Radius.xl,
    height: 80,
    justifyContent: "center",
    width: 80,
  },
  groupDetailsPhotoFallbackText: {
    color: "#FFFFFF",
    ...TypeScale.headingLg,
    fontWeight: FontWeight.extrabold,
  },
  groupDetailsPhotoBadge: {
    alignItems: "center",
    backgroundColor: "#FFF2DA",
    borderColor: "#E8E8E8",
    borderRadius: Radius.full,
    borderWidth: 1,
    bottom: Spacing.xs,
    height: 30,
    justifyContent: "center",
    position: "absolute",
    right: Spacing.xs,
    width: 30,
  },
  detailsHeroTitle: {
    ...TypeScale.headingLg,
    fontWeight: FontWeight.extrabold,
    textAlign: "center",
    marginBottom: Spacing.xs,
  },
  detailsHeroMeta: {
    ...TypeScale.bodyMd,
    textAlign: "center",
  },
  groupDetailsSecondaryAction: {
    alignSelf: "center",
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  groupDetailsSecondaryActionText: {
    ...TypeScale.bodySm,
    fontWeight: FontWeight.semibold,
  },
  descriptionCard: {
    backgroundColor: "#FFF8E7",
    borderColor: "#F1D7A5",
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    padding: Spacing.md,
  },
  descriptionText: {
    color: "#5A6E41",
    ...TypeScale.bodyMd,
  },
  membersCard: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.md,
  },
  membersHeaderRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  membersSearchShell: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E8E8E8",
    borderRadius: Radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: 2,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  membersSearchInput: {
    color: "#1A1A1A",
    flex: 1,
    ...TypeScale.bodyMd,
    marginLeft: Spacing.sm,
    paddingVertical: 0,
  },
  membersTitle: {
    color: "#1A1A1A",
    ...TypeScale.titleLg,
    fontWeight: FontWeight.extrabold,
  },
  membersSubtitle: {
    color: "#6B7280",
    ...TypeScale.bodySm,
    marginTop: Spacing.xs,
  },
  membersCountBadge: {
    backgroundColor: "#F5F5F5",
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  membersCountText: {
    color: "#6B7280",
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
  },
  membersEmptyText: {
    color: "#6B7C5D",
    ...TypeScale.bodySm,
    marginTop: Spacing.md,
  },
  memberRow: {
    alignItems: "center",
    flexDirection: "row",
    marginTop: Spacing.sm,
  },
  memberAvatarCircle: {
    alignItems: "center",
    backgroundColor: "#2D6A4F",
    borderRadius: Radius.full,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  memberAvatarImage: {
    borderRadius: Radius.full,
    height: 42,
    width: 42,
  },
  memberAvatarText: {
    color: "#FFFFFF",
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.extrabold,
  },
  memberTextWrap: {
    flex: 1,
    marginLeft: Spacing.sm,
    paddingRight: Spacing.sm,
  },
  memberName: {
    color: "#1A1A1A",
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.extrabold,
    flexShrink: 1,
  },
  memberMeta: {
    color: "#6B7A5D",
    ...TypeScale.labelMd,
    marginTop: Spacing.xs,
  },
  memberActionButton: {
    backgroundColor: "#FFF1EF",
    borderColor: "#F0C7C1",
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  memberActionButtonDisabled: {
    opacity: 0.6,
  },
  memberActionButtonText: {
    color: "#8A3D35",
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
  },
  settingsCard: {
    backgroundColor: "#F8F8F8",
    borderColor: "#E8E8E8",
    borderRadius: Radius.xl,
    borderWidth: 1,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    padding: Spacing.md,
  },
  settingsToggleButton: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  settingsToggleTextWrap: {
    flex: 1,
    paddingRight: Spacing.md,
  },
  settingsTitle: {
    color: "#1A1A1A",
    ...TypeScale.titleLg,
    fontWeight: FontWeight.extrabold,
  },
  settingsSubtitle: {
    color: "#6B7280",
    ...TypeScale.bodySm,
    marginBottom: Spacing.md,
    marginTop: Spacing.xs,
  },
  settingsLabel: {
    color: "#6B7280",
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
    marginBottom: Spacing.sm,
    marginTop: Spacing.sm,
    textTransform: "uppercase",
  },
  settingsInput: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E8E8E8",
    borderRadius: Radius.lg,
    borderWidth: 1,
    color: "#1A1A1A",
    ...TypeScale.bodyMd,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  groupDescriptionInput: {
    minHeight: 100,
  },
  settingsSaveButton: {
    alignItems: "center",
    backgroundColor: "#2D6A4F",
    borderRadius: Radius.lg,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  settingsSaveButtonDisabled: {
    opacity: 0.6,
  },
  settingsSaveButtonText: {
    color: "#FFFFFF",
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.extrabold,
  },
  joinInfoCard: {
    alignItems: "center",
    backgroundColor: "#F8F8F8",
    borderColor: "#E8E8E8",
    borderRadius: Radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    padding: Spacing.md,
  },
  joinInfoTextWrap: {
    flex: 1,
    paddingRight: Spacing.md,
  },
  joinInfoTitle: {
    color: "#1A1A1A",
    ...TypeScale.titleSm,
    fontWeight: FontWeight.extrabold,
    marginBottom: Spacing.xs,
  },
  joinInfoText: {
    color: "#6B7280",
    ...TypeScale.bodySm,
  },
  joinInfoButton: {
    alignItems: "center",
    backgroundColor: "#2D6A4F",
    borderRadius: Radius.md,
    justifyContent: "center",
    minWidth: 104,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  joinInfoButtonDisabled: {
    opacity: 0.6,
  },
  joinInfoButtonText: {
    color: "#FFFFFF",
    ...TypeScale.bodySm,
    fontWeight: FontWeight.extrabold,
  },
  toastContainer: {
    position: "absolute",
    bottom: 100,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 50,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: Radius.xl,
    borderWidth: 1,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    marginHorizontal: Spacing.lg,
    maxWidth: 420,
    ...shadow("lg"),
  },
  toastText: {
    ...TypeScale.bodySm,
    fontWeight: FontWeight.semibold,
    flex: 1,
    marginHorizontal: Spacing.sm,
  },
  expenseSummaryCard: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    padding: Spacing.lg,
  },
  expenseSummaryHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  expenseSummaryHeaderTextWrap: {
    flex: 1,
    paddingRight: Spacing.md,
  },
  expenseSummaryKicker: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  expenseSummaryTitle: {
    ...TypeScale.headingLg,
    fontWeight: FontWeight.extrabold,
    marginTop: Spacing.xs,
  },
  expenseSummaryText: {
    ...TypeScale.bodyMd,
    marginTop: Spacing.sm,
  },
  expenseSummaryCountBadge: {
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  expenseSummaryCountText: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
  },
  expenseSummaryChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  expenseSummaryChip: {
    alignItems: "center",
    borderRadius: Radius.full,
    borderWidth: 1,
    flexDirection: "row",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  expenseSummaryChipText: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.bold,
  },
  messagesScroll: {
    flex: 1,
    marginTop: Spacing.sm,
  },
  messagesContent: {
    paddingBottom: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  emptyState: {
    alignItems: "center",
    backgroundColor: "#F8F8F8",
    borderColor: "#E8E8E8",
    borderRadius: Radius["2xl"],
    borderWidth: 1,
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing["3xl"],
  },
  emptyTitle: {
    color: "#1A1A1A",
    ...TypeScale.headingSm,
    fontWeight: FontWeight.extrabold,
    textAlign: "center",
  },
  emptyText: {
    color: "#6B7280",
    ...TypeScale.bodyMd,
    marginTop: Spacing.sm,
    textAlign: "center",
  },
  messageBubble: {
    borderRadius: Radius.xl,
    maxWidth: "82%",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  messageRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  theirMessageRow: {
    justifyContent: "flex-start",
  },
  myMessageRow: {
    justifyContent: "flex-end",
  },
  messageAvatarWrap: {
    width: 34,
    height: 34,
    borderRadius: Radius.full,
    overflow: "hidden",
  },
  messageAvatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: Radius.full,
    backgroundColor: "#E8E8E8",
  },
  messageAvatarFallback: {
    alignItems: "center",
    borderRadius: Radius.full,
    height: "100%",
    justifyContent: "center",
    width: "100%",
  },
  messageAvatarFallbackText: {
    color: "#FFFFFF",
    ...TypeScale.bodySm,
    fontWeight: FontWeight.extrabold,
  },
  myMessageBubble: {
    alignSelf: "flex-end",
    backgroundColor: "#2D6A4F",
  },
  theirMessageBubble: {
    alignSelf: "flex-start",
    backgroundColor: "#FFFFFF",
    borderColor: "#E8E8E8",
    borderWidth: 1,
  },
  messageSender: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
    marginBottom: Spacing.xs,
    textTransform: "uppercase",
    flexShrink: 1,
  },
  myMessageSender: {
    color: "#F0F0F0",
  },
  theirMessageSender: {
    color: "#6B7280",
  },
  messageText: {
    color: "#1A1A1A",
    ...TypeScale.titleSm,
  },
  myMessageText: {
    color: "#FFFFFF",
  },
  messageTime: {
    color: "#7A8870",
    ...TypeScale.labelMd,
    marginTop: Spacing.sm,
    textAlign: "right",
  },
  myMessageTime: {
    color: "#D9E8C7",
  },
  sharedTripCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginTop: 2,
    padding: Spacing.md,
  },
  mySharedTripCard: {
    backgroundColor: "#F7FAF1",
    borderColor: "#E8E8E8",
  },
  theirSharedTripCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E8E8E8",
  },
  sharedTripTopRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  sharedTripKicker: {
    color: "#6B7280",
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
    textTransform: "uppercase",
  },
  mySharedTripKicker: {
    color: "#6B7280",
  },
  sharedTripSourceBadge: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  sharedTripHomeBadge: {
    backgroundColor: "#E5E7EB",
  },
  sharedTripDiscoverBadge: {
    backgroundColor: "#FFF2DA",
  },
  sharedTripSourceBadgeText: {
    ...TypeScale.labelSm,
    fontWeight: FontWeight.extrabold,
  },
  sharedTripHomeBadgeText: {
    color: "#2D6A4F",
  },
  sharedTripDiscoverBadgeText: {
    color: "#8B5611",
  },
  sharedTripTitle: {
    color: "#1A1A1A",
    ...TypeScale.titleLg,
    fontWeight: FontWeight.extrabold,
  },
  mySharedTripTitle: {
    color: "#1A1A1A",
  },
  sharedTripDestination: {
    color: "#5A6E41",
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.bold,
    marginTop: Spacing.xs,
  },
  mySharedTripDestination: {
    color: "#5A6E41",
  },
  sharedTripMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: Spacing.sm,
  },
  sharedTripMetaText: {
    color: "#627254",
    ...TypeScale.bodySm,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.xs,
    marginRight: Spacing.sm,
  },
  mySharedTripMetaText: {
    color: "#627254",
  },
  sharedTripSummary: {
    color: "#435238",
    ...TypeScale.bodyMd,
    marginTop: Spacing.sm,
  },
  mySharedTripSummary: {
    color: "#435238",
  },
  sharedTripDetailsPreview: {
    color: "#57684A",
    ...TypeScale.bodySm,
    marginTop: Spacing.sm,
  },
  mySharedTripDetailsPreview: {
    color: "#57684A",
  },
  sharedTripHint: {
    color: "#7A8870",
    ...TypeScale.labelMd,
    fontWeight: FontWeight.bold,
    marginTop: Spacing.sm,
  },
  mySharedTripHint: {
    color: "#7A8870",
  },
  linkedTransportSection: {
    marginTop: Spacing.md,
  },
  linkedTransportSectionTitle: {
    color: "#6B7280",
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  myLinkedTransportSectionTitle: {
    color: "#6B7280",
  },
  linkedTransportCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginTop: Spacing.sm,
    padding: Spacing.md,
  },
  myLinkedTransportCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E8E8E8",
  },
  theirLinkedTransportCard: {
    backgroundColor: "#F8F8F8",
    borderColor: "#E8E8E8",
  },
  linkedTransportTopRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  linkedTransportTextWrap: {
    flex: 1,
    paddingRight: Spacing.sm,
  },
  linkedTransportTitle: {
    color: "#1A1A1A",
    ...TypeScale.titleSm,
    fontWeight: FontWeight.extrabold,
  },
  myLinkedTransportTitle: {
    color: "#1A1A1A",
  },
  linkedTransportRoute: {
    color: "#5A6E41",
    ...TypeScale.bodySm,
    marginTop: Spacing.xs,
  },
  myLinkedTransportRoute: {
    color: "#5A6E41",
  },
  linkedTransportAmount: {
    color: "#1A1A1A",
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.extrabold,
  },
  myLinkedTransportAmount: {
    color: "#1A1A1A",
  },
  linkedTransportMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  linkedTransportMetaText: {
    color: "#627254",
    ...TypeScale.labelMd,
    fontWeight: FontWeight.bold,
  },
  myLinkedTransportMetaText: {
    color: "#627254",
  },
  linkedTransportActionsRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  linkedTransportSecondaryButton: {
    alignItems: "center",
    backgroundColor: "#F5F5F5",
    borderColor: "#E8E8E8",
    borderRadius: Radius.md,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: Spacing.xs,
    justifyContent: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  myLinkedTransportSecondaryButton: {
    backgroundColor: "#F5F5F5",
    borderColor: "#E8E8E8",
  },
  linkedTransportSecondaryButtonText: {
    color: "#6B7280",
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
  },
  linkedTransportPrimaryButton: {
    alignItems: "center",
    backgroundColor: "#2D6A4F",
    borderRadius: Radius.md,
    flex: 1,
    flexDirection: "row",
    gap: Spacing.xs,
    justifyContent: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  linkedTransportPrimaryButtonDisabled: {
    opacity: 0.6,
  },
  linkedTransportPrimaryButtonText: {
    color: "#FFFFFF",
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
  },
  linkedTransportPostedBadge: {
    alignItems: "center",
    borderRadius: Radius.md,
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  myLinkedTransportPostedBadge: {
    backgroundColor: "#E6F1DA",
  },
  theirLinkedTransportPostedBadge: {
    backgroundColor: "#F5F5F5",
  },
  linkedTransportPostedBadgeText: {
    color: "#2D6A4F",
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
  },
  linkedTransportMoreHint: {
    color: "#7A8870",
    ...TypeScale.labelMd,
    fontWeight: FontWeight.bold,
    marginTop: Spacing.sm,
  },
  myLinkedTransportMoreHint: {
    color: "#7A8870",
  },
  expenseCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginTop: 2,
    padding: Spacing.md,
  },
  myExpenseCard: {
    backgroundColor: "#F7FAF1",
    borderColor: "#E8E8E8",
  },
  theirExpenseCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E8E8E8",
  },
  expenseCardTopRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  expenseCardKicker: {
    color: "#6B7280",
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
    textTransform: "uppercase",
  },
  myExpenseCardKicker: {
    color: "#6B7280",
  },
  expenseCardAmount: {
    color: "#1A1A1A",
    ...TypeScale.titleMd,
    fontWeight: FontWeight.extrabold,
  },
  myExpenseCardAmount: {
    color: "#1A1A1A",
  },
  expenseCardTitle: {
    color: "#1A1A1A",
    ...TypeScale.titleLg,
    fontWeight: FontWeight.extrabold,
    marginTop: Spacing.sm,
  },
  myExpenseCardTitle: {
    color: "#1A1A1A",
  },
  expenseCardMeta: {
    color: "#5A6E41",
    ...TypeScale.bodyMd,
    marginTop: Spacing.xs,
  },
  myExpenseCardMeta: {
    color: "#5A6E41",
  },
  expenseCardChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  expenseCardChip: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  myExpenseCardChip: {
    backgroundColor: "#E6F1DA",
  },
  theirExpenseCardChip: {
    backgroundColor: "#F5F5F5",
  },
  expenseCardChipText: {
    color: "#6B7280",
    ...TypeScale.labelLg,
    fontWeight: FontWeight.bold,
  },
  myExpenseCardChipText: {
    color: "#6B7280",
  },
  expenseRepaymentStatusRow: {
    marginTop: Spacing.md,
  },
  expenseRepaymentStatusText: {
    color: "#5A6E41",
    ...TypeScale.bodySm,
    fontWeight: FontWeight.bold,
  },
  myExpenseRepaymentStatusText: {
    color: "#5A6E41",
  },
  linkedExpenseOpenButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: Radius.md,
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  myLinkedExpenseOpenButton: {
    backgroundColor: "#E6F1DA",
  },
  theirLinkedExpenseOpenButton: {
    backgroundColor: "#F5F5F5",
  },
  linkedExpenseOpenButtonText: {
    color: "#6B7280",
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
  },
  expensePayButton: {
    alignItems: "center",
    backgroundColor: "#2D6A4F",
    borderRadius: Radius.lg,
    flexDirection: "row",
    gap: Spacing.sm,
    justifyContent: "center",
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  expensePayButtonDisabled: {
    opacity: 0.6,
  },
  expensePayButtonText: {
    color: "#FFFFFF",
    ...TypeScale.bodySm,
    fontWeight: FontWeight.extrabold,
  },
  expensePaidBadge: {
    alignItems: "center",
    borderRadius: Radius.md,
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  myExpensePaidBadge: {
    backgroundColor: "#E6F1DA",
  },
  theirExpensePaidBadge: {
    backgroundColor: "#F5F5F5",
  },
  expensePaidBadgeText: {
    color: "#2D6A4F",
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
  },
  composerBar: {
    alignItems: "flex-end",
    backgroundColor: "#FFFFFF",
    borderTopColor: "#E8E8E8",
    borderTopWidth: 1,
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
  },
  shareSavedButton: {
    alignItems: "center",
    backgroundColor: "#F4F8EC",
    borderColor: "#E8E8E8",
    borderRadius: Radius.xl,
    borderWidth: 1,
    height: Layout.touchTarget,
    justifyContent: "center",
    marginRight: Spacing.sm,
    width: Layout.touchTarget,
  },
  shareSavedButtonDisabled: {
    opacity: 0.55,
  },
  composerInput: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E8E8E8",
    borderRadius: Radius.xl,
    borderWidth: 1,
    color: "#1A1A1A",
    flex: 1,
    ...TypeScale.titleSm,
    maxHeight: 120,
    minHeight: Layout.touchTarget,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingVertical: Spacing.md,
  },
  sendButton: {
    alignItems: "center",
    backgroundColor: "#2D6A4F",
    borderRadius: Radius.xl,
    height: Layout.touchTarget,
    justifyContent: "center",
    marginLeft: Spacing.sm,
    width: Layout.touchTarget,
  },
  sendButtonDisabled: {
    opacity: 0.55,
  },
  modalOverlay: {
    backgroundColor: "rgba(19, 29, 11, 0.26)",
    flex: 1,
    justifyContent: "flex-end",
    padding: Spacing.lg,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E8E8E8",
    borderRadius: Radius["3xl"],
    borderWidth: 1,
    maxHeight: "76%",
    padding: Spacing.lg,
  },
  sheetHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  sheetHeaderTextWrap: {
    flex: 1,
    paddingRight: Spacing.md,
  },
  sheetTitle: {
    color: "#1A1A1A",
    ...TypeScale.headingSm,
    fontWeight: FontWeight.extrabold,
  },
  sheetSubtitle: {
    color: "#6B7280",
    ...TypeScale.bodyMd,
    marginTop: Spacing.xs,
  },
  sheetCloseButton: {
    alignItems: "center",
    backgroundColor: "#F5F5F5",
    borderRadius: Radius.md,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  sheetEmptyState: {
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xl,
  },
  sheetEmptyTitle: {
    color: "#1A1A1A",
    ...TypeScale.titleLg,
    fontWeight: FontWeight.extrabold,
    textAlign: "center",
  },
  sheetEmptyText: {
    color: "#6B7280",
    ...TypeScale.bodyMd,
    marginTop: Spacing.sm,
    textAlign: "center",
  },
  sheetPrimaryButton: {
    alignItems: "center",
    backgroundColor: "#2D6A4F",
    borderRadius: Radius.lg,
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  sheetPrimaryButtonText: {
    color: "#FFFFFF",
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.extrabold,
  },
  sheetTextInput: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E8E8E8",
    borderRadius: Radius.lg,
    borderWidth: 1,
    color: "#1A1A1A",
    ...TypeScale.titleSm,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  sheetTripsContent: {
    paddingBottom: Spacing.xs,
  },
  sheetTripCard: {
    backgroundColor: "#F8F8F8",
    borderColor: "#E8E8E8",
    borderRadius: Radius.xl,
    borderWidth: 1,
    marginBottom: Spacing.md,
    padding: Spacing.lg,
  },
  sheetTripTopRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  sheetTripSourceBadge: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  sheetTripSourceBadgeText: {
    ...TypeScale.labelSm,
    fontWeight: FontWeight.extrabold,
  },
  sheetTripDate: {
    color: "#6B7A5D",
    ...TypeScale.labelMd,
    fontWeight: FontWeight.bold,
  },
  sheetTripTitle: {
    color: "#1A1A1A",
    ...TypeScale.titleLg,
    fontWeight: FontWeight.extrabold,
  },
  sheetTripDestination: {
    color: "#5A6E41",
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.bold,
    marginTop: Spacing.xs,
  },
  sheetTripMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: Spacing.sm,
  },
  sheetTripMetaText: {
    color: "#627254",
    ...TypeScale.bodySm,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.xs,
    marginRight: Spacing.sm,
  },
  sheetTripSummary: {
    color: "#4C5D3F",
    ...TypeScale.bodySm,
    marginTop: Spacing.sm,
  },
  sheetShareButton: {
    alignItems: "center",
    backgroundColor: "#2D6A4F",
    borderRadius: Radius.md,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  sheetShareButtonDisabled: {
    opacity: 0.6,
  },
  sheetShareButtonText: {
    color: "#FFFFFF",
    ...TypeScale.bodySm,
    fontWeight: FontWeight.extrabold,
  },
  previewCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E8E8E8",
    borderRadius: Radius["3xl"],
    borderWidth: 1,
    marginBottom: Spacing.lg,
    maxHeight: "82%",
    padding: Spacing.lg,
  },
  previewHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  previewHeaderTextWrap: {
    flex: 1,
    paddingRight: Spacing.md,
  },
  previewTitle: {
    color: "#1A1A1A",
    ...TypeScale.headingMd,
    fontWeight: FontWeight.extrabold,
  },
  previewDestination: {
    color: "#5A6E41",
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.bold,
    marginTop: Spacing.xs,
  },
  previewMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: Spacing.md,
  },
  previewMetaText: {
    color: "#627254",
    ...TypeScale.bodySm,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.xs,
    marginLeft: Spacing.sm,
  },
  previewSummary: {
    color: "#435238",
    ...TypeScale.bodyMd,
    marginTop: Spacing.md,
  },
  previewLinkedTransportSection: {
    marginTop: Spacing.lg,
  },
  previewLinkedTransportTitle: {
    color: "#6B7280",
    ...TypeScale.bodySm,
    fontWeight: FontWeight.extrabold,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  previewLinkedTransportCard: {
    backgroundColor: "#F8F8F8",
    borderColor: "#E8E8E8",
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginTop: Spacing.sm,
    padding: Spacing.md,
  },
  previewLinkedTransportTopRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  previewLinkedTransportTextWrap: {
    flex: 1,
    paddingRight: Spacing.sm,
  },
  previewLinkedTransportCardTitle: {
    color: "#1A1A1A",
    ...TypeScale.titleSm,
    fontWeight: FontWeight.extrabold,
  },
  previewLinkedTransportRoute: {
    color: "#5A6E41",
    ...TypeScale.bodySm,
    marginTop: Spacing.xs,
  },
  previewLinkedTransportAmount: {
    color: "#1A1A1A",
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.extrabold,
  },
  previewLinkedTransportMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  previewLinkedTransportMetaText: {
    color: "#627254",
    ...TypeScale.labelMd,
    fontWeight: FontWeight.bold,
  },
  previewLinkedTransportButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#F5F5F5",
    borderColor: "#E8E8E8",
    borderRadius: Radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: Spacing.xs,
    justifyContent: "center",
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  previewLinkedTransportButtonText: {
    color: "#6B7280",
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
  },
  previewDetailsScroll: {
    marginTop: Spacing.md,
  },
  previewDetailsContent: {
    paddingBottom: Spacing.xs,
  },
  previewDetailsText: {
    color: "#46563A",
    ...TypeScale.bodyMd,
  },
  expensePreviewCard: {
    backgroundColor: "#F8F8F8",
    borderColor: "#E8E8E8",
    borderRadius: Radius.xl,
    borderWidth: 1,
    marginTop: Spacing.lg,
    padding: Spacing.lg,
  },
  expensePreviewKicker: {
    color: "#2D6A4F",
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  expensePreviewTitle: {
    color: "#1A1A1A",
    ...TypeScale.headingSm,
    fontWeight: FontWeight.extrabold,
    marginTop: Spacing.xs,
  },
  expensePreviewMeta: {
    color: "#5A6E41",
    ...TypeScale.bodyMd,
    marginTop: Spacing.sm,
  },
  expensePreviewPills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  expensePreviewPill: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E8E8E8",
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  expensePreviewPillText: {
    color: "#4E6630",
    ...TypeScale.labelLg,
    fontWeight: FontWeight.bold,
  },
  previewSaveButton: {
    alignItems: "center",
    backgroundColor: "#2D6A4F",
    borderRadius: Radius.lg,
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  previewSaveButtonDisabled: {
    opacity: 0.6,
  },
  previewSaveButtonText: {
    color: "#FFFFFF",
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.extrabold,
  },
});
