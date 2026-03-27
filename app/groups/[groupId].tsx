import { MaterialIcons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useLocalSearchParams, useRouter } from "expo-router";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { SafeAreaView } from "react-native-safe-area-context";

import { useAppTheme } from "../../components/app-theme-provider";
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
import { parseTravelGroup, type TravelGroup } from "../../utils/groups";
import {
  savePendingStripeExpenseCheckout,
  type PendingStripeExpenseCheckout,
} from "../../utils/pending-stripe-expense-checkout";
import { getProfileDisplayName } from "../../utils/profile-info";
import { parseSavedTrips, type SavedTrip } from "../../utils/saved-trips";
import {
  parseStoredHomePlannerStore,
  type StoredHomePlan,
} from "../../utils/home-chat-storage";
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

function getSharedTripDetailsPreview(details: string) {
  return details
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
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

WebBrowser.maybeCompleteAuthSession();

export default function GroupChatScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const params = useLocalSearchParams<{ groupId: string | string[] }>();
  const groupId = Array.isArray(params.groupId) ? params.groupId[0] ?? "" : params.groupId ?? "";
  const scrollViewRef = useRef<ScrollView | null>(null);

  const [user, setUser] = useState<User | null>(null);
  const [profileName, setProfileName] = useState("Traveler");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [joining, setJoining] = useState(false);
  const [sharingTripId, setSharingTripId] = useState<string | null>(null);
  const [savingExpense, setSavingExpense] = useState(false);
  const [creatingLinkedExpenseKey, setCreatingLinkedExpenseKey] = useState<string | null>(null);
  const [processingRepaymentExpenseId, setProcessingRepaymentExpenseId] = useState<string | null>(
    null
  );
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
          setSavedTrips(parseSavedTrips(profileData));
          setStoredHomePlansBySourceKey(buildStoredHomePlansBySourceKey(profileData));
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
          memberIds: nextMemberIds,
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
          memberIds: nextMemberIds,
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

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.loader, { backgroundColor: colors.screenSoft }]}
        edges={["top", "left", "right"]}
      >
        <ActivityIndicator size="large" color="#5C8C1F" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: colors.screenSoft }]}
      edges={["top", "left", "right"]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.screen}
      >
        <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <MaterialIcons color="#29440F" name="arrow-back-ios-new" size={20} />
          </TouchableOpacity>

          <View style={styles.headerAvatar}>
            <View
              style={[
                styles.headerAvatarCircle,
                { backgroundColor: getAvatarColor(group?.name ?? "Group") },
              ]}
            >
              <Text style={styles.headerAvatarText}>{getInitials(group?.name ?? "Group")}</Text>
            </View>
          </View>

          <View style={styles.headerTextWrap}>
            <Text numberOfLines={1} style={styles.headerTitle}>
              {group?.name}
            </Text>
            <Text numberOfLines={1} style={styles.headerMeta}>
              {group?.accessType === "private" ? "Private" : "Public"} • {membersLabel}
            </Text>
          </View>
        </View>

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

        {error ? (
          <View
            style={[
              styles.errorCard,
              { backgroundColor: colors.errorBackground, borderColor: colors.errorBorder },
            ]}
          >
            <Text style={[styles.errorText, { color: colors.errorText }]}>{error}</Text>
          </View>
        ) : null}

        {infoMessage ? (
          <View
            style={[
              styles.infoCard,
              { backgroundColor: colors.cardAlt, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>{infoMessage}</Text>
          </View>
        ) : null}

        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={styles.messagesContent}
          showsVerticalScrollIndicator={false}
          style={styles.messagesScroll}
        >
          {messages.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Няма съобщения още</Text>
              <Text style={styles.emptyText}>
                Изпрати първото съобщение или share-ни saved trip и започни разговора в тази група.
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

              return (
                <View
                  key={message.id}
                  style={[
                    styles.messageBubble,
                    isMine ? styles.myMessageBubble : styles.theirMessageBubble,
                  ]}
                >
                  <Text style={styles.messageSender}>{isMine ? "You" : message.senderLabel}</Text>
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
                          {getSharedTripDetailsPreview(message.sharedTrip?.details ?? "")}
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
                                    <MaterialIcons color="#3B6D11" name="check-circle" size={15} />
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
                                      <MaterialIcons color="#47642A" name="open-in-new" size={16} />
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
                          <MaterialIcons color="#47642A" name="confirmation-number" size={16} />
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
                          <MaterialIcons color="#3B6D11" name="verified" size={15} />
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
              );
            })
          )}
        </ScrollView>

        <View style={[styles.composerBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <TouchableOpacity
            activeOpacity={0.9}
            disabled={!canOpenSharePicker || sending || joining}
            onPress={() => setShareSheetVisible(true)}
            style={[
              styles.shareSavedButton,
              (!canOpenSharePicker || sending || joining) && styles.shareSavedButtonDisabled,
            ]}
          >
            <MaterialIcons color="#5C8C1F" name="bookmark-added" size={20} />
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
            <MaterialIcons color="#5C8C1F" name="receipt-long" size={20} />
          </TouchableOpacity>
          <TextInput
            multiline
            onChangeText={setComposerValue}
            editable={group?.accessType === "public" || isMember}
            placeholder={
              group?.accessType === "public" || isMember
                ? "Write a message"
                : "You need access to write"
            }
            placeholderTextColor="#809071"
            style={[styles.composerInput, { color: colors.textPrimary }]}
            value={composerValue}
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
                <Text style={styles.sheetTitle}>Share from Saved trips</Text>
                <Text style={styles.sheetSubtitle}>
                  Избери Trip Plan, който искаш да пратиш в групата.
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => setShareSheetVisible(false)}
                style={styles.sheetCloseButton}
              >
                <MaterialIcons color="#29440F" name="close" size={20} />
              </TouchableOpacity>
            </View>

            {savedTrips.length === 0 ? (
              <View style={styles.sheetEmptyState}>
                <Text style={styles.sheetEmptyTitle}>Нямаш saved trips още</Text>
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
                  <Text style={styles.sheetPrimaryButtonText}>Open Saved</Text>
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
                <MaterialIcons color="#29440F" name="close" size={20} />
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

            {previewTrip?.summary ? (
              <Text style={styles.previewSummary}>{previewTrip.summary}</Text>
            ) : null}

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
                      <MaterialIcons color="#47642A" name="open-in-new" size={16} />
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
              <Text style={styles.previewDetailsText}>{previewTrip?.details}</Text>
            </ScrollView>
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
                <MaterialIcons color="#29440F" name="close" size={20} />
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
    backgroundColor: "#EAF3DE",
    flex: 1,
  },
  loader: {
    alignItems: "center",
    backgroundColor: "#EAF3DE",
    flex: 1,
    justifyContent: "center",
  },
  header: {
    alignItems: "center",
    backgroundColor: "#FAFCF5",
    borderBottomColor: "#DDE8C7",
    borderBottomWidth: 1,
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  backButton: {
    alignItems: "center",
    backgroundColor: "#EEF4E5",
    borderRadius: 16,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  headerAvatar: {
    marginLeft: 12,
  },
  headerAvatarCircle: {
    alignItems: "center",
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  headerAvatarText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
  },
  headerTextWrap: {
    flex: 1,
    marginLeft: 12,
  },
  headerTitle: {
    color: "#29440F",
    fontSize: 18,
    fontWeight: "800",
  },
  headerMeta: {
    color: "#5F6E53",
    fontSize: 13,
    marginTop: 4,
  },
  descriptionCard: {
    backgroundColor: "#FFF8E7",
    borderColor: "#F1D7A5",
    borderRadius: 18,
    borderWidth: 1,
    marginHorizontal: 16,
    marginTop: 14,
    padding: 14,
  },
  descriptionText: {
    color: "#5A6E41",
    fontSize: 14,
    lineHeight: 20,
  },
  joinInfoCard: {
    alignItems: "center",
    backgroundColor: "#F6F8EE",
    borderColor: "#DDE8C7",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginHorizontal: 16,
    marginTop: 14,
    padding: 14,
  },
  joinInfoTextWrap: {
    flex: 1,
    paddingRight: 12,
  },
  joinInfoTitle: {
    color: "#29440F",
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 4,
  },
  joinInfoText: {
    color: "#5F6E53",
    fontSize: 13,
    lineHeight: 19,
  },
  joinInfoButton: {
    alignItems: "center",
    backgroundColor: "#5C8C1F",
    borderRadius: 14,
    justifyContent: "center",
    minWidth: 104,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  joinInfoButtonDisabled: {
    opacity: 0.6,
  },
  joinInfoButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  errorCard: {
    backgroundColor: "#FFF1EF",
    borderColor: "#F0B6AE",
    borderRadius: 18,
    borderWidth: 1,
    marginHorizontal: 16,
    marginTop: 14,
    padding: 14,
  },
  errorText: {
    color: "#8A3D35",
    fontSize: 14,
    lineHeight: 20,
  },
  infoCard: {
    backgroundColor: "#EEF4E5",
    borderColor: "#DDE8C7",
    borderRadius: 18,
    borderWidth: 1,
    marginHorizontal: 16,
    marginTop: 14,
    padding: 14,
  },
  infoText: {
    color: "#4F6240",
    fontSize: 14,
    lineHeight: 20,
  },
  expenseSummaryCard: {
    borderRadius: 22,
    borderWidth: 1,
    marginHorizontal: 16,
    marginTop: 14,
    padding: 16,
  },
  expenseSummaryHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  expenseSummaryHeaderTextWrap: {
    flex: 1,
    paddingRight: 12,
  },
  expenseSummaryKicker: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  expenseSummaryTitle: {
    fontSize: 24,
    fontWeight: "800",
    marginTop: 6,
  },
  expenseSummaryText: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  expenseSummaryCountBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  expenseSummaryCountText: {
    fontSize: 12,
    fontWeight: "800",
  },
  expenseSummaryChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },
  expenseSummaryChip: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  expenseSummaryChipText: {
    fontSize: 12,
    fontWeight: "700",
  },
  messagesScroll: {
    flex: 1,
    marginTop: 10,
  },
  messagesContent: {
    paddingBottom: 20,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  emptyState: {
    alignItems: "center",
    backgroundColor: "#F6F8EE",
    borderColor: "#DDE8C7",
    borderRadius: 24,
    borderWidth: 1,
    marginTop: 18,
    paddingHorizontal: 22,
    paddingVertical: 28,
  },
  emptyTitle: {
    color: "#29440F",
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
  },
  emptyText: {
    color: "#5F6E53",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    textAlign: "center",
  },
  messageBubble: {
    borderRadius: 22,
    marginTop: 12,
    maxWidth: "82%",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  myMessageBubble: {
    alignSelf: "flex-end",
    backgroundColor: "#5C8C1F",
  },
  theirMessageBubble: {
    alignSelf: "flex-start",
    backgroundColor: "#FAFCF5",
    borderColor: "#DDE8C7",
    borderWidth: 1,
  },
  messageSender: {
    color: "#EAF3DE",
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 6,
    textTransform: "uppercase",
  },
  messageText: {
    color: "#29440F",
    fontSize: 15,
    lineHeight: 21,
  },
  myMessageText: {
    color: "#FFFFFF",
  },
  messageTime: {
    color: "#7A8870",
    fontSize: 12,
    marginTop: 8,
    textAlign: "right",
  },
  myMessageTime: {
    color: "#D9E8C7",
  },
  sharedTripCard: {
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 2,
    padding: 14,
  },
  mySharedTripCard: {
    backgroundColor: "#F7FAF1",
    borderColor: "#DDE8C7",
  },
  theirSharedTripCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#DDE8C7",
  },
  sharedTripTopRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sharedTripKicker: {
    color: "#47642A",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  mySharedTripKicker: {
    color: "#47642A",
  },
  sharedTripSourceBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  sharedTripHomeBadge: {
    backgroundColor: "#E4EFD0",
  },
  sharedTripDiscoverBadge: {
    backgroundColor: "#FFF2DA",
  },
  sharedTripSourceBadgeText: {
    fontSize: 11,
    fontWeight: "800",
  },
  sharedTripHomeBadgeText: {
    color: "#3B6D11",
  },
  sharedTripDiscoverBadgeText: {
    color: "#8B5611",
  },
  sharedTripTitle: {
    color: "#29440F",
    fontSize: 18,
    fontWeight: "800",
  },
  mySharedTripTitle: {
    color: "#29440F",
  },
  sharedTripDestination: {
    color: "#5A6E41",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 4,
  },
  mySharedTripDestination: {
    color: "#5A6E41",
  },
  sharedTripMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 10,
  },
  sharedTripMetaText: {
    color: "#627254",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 4,
    marginRight: 10,
  },
  mySharedTripMetaText: {
    color: "#627254",
  },
  sharedTripSummary: {
    color: "#435238",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  mySharedTripSummary: {
    color: "#435238",
  },
  sharedTripDetailsPreview: {
    color: "#57684A",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
  },
  mySharedTripDetailsPreview: {
    color: "#57684A",
  },
  sharedTripHint: {
    color: "#7A8870",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 10,
  },
  mySharedTripHint: {
    color: "#7A8870",
  },
  linkedTransportSection: {
    marginTop: 14,
  },
  linkedTransportSectionTitle: {
    color: "#47642A",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  myLinkedTransportSectionTitle: {
    color: "#47642A",
  },
  linkedTransportCard: {
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 10,
    padding: 12,
  },
  myLinkedTransportCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#DDE8C7",
  },
  theirLinkedTransportCard: {
    backgroundColor: "#F6F8EE",
    borderColor: "#DDE8C7",
  },
  linkedTransportTopRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  linkedTransportTextWrap: {
    flex: 1,
    paddingRight: 10,
  },
  linkedTransportTitle: {
    color: "#29440F",
    fontSize: 15,
    fontWeight: "800",
  },
  myLinkedTransportTitle: {
    color: "#29440F",
  },
  linkedTransportRoute: {
    color: "#5A6E41",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  myLinkedTransportRoute: {
    color: "#5A6E41",
  },
  linkedTransportAmount: {
    color: "#29440F",
    fontSize: 14,
    fontWeight: "800",
  },
  myLinkedTransportAmount: {
    color: "#29440F",
  },
  linkedTransportMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  linkedTransportMetaText: {
    color: "#627254",
    fontSize: 12,
    fontWeight: "700",
  },
  myLinkedTransportMetaText: {
    color: "#627254",
  },
  linkedTransportActionsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  linkedTransportSecondaryButton: {
    alignItems: "center",
    backgroundColor: "#EEF4E5",
    borderColor: "#DDE8C7",
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 11,
  },
  myLinkedTransportSecondaryButton: {
    backgroundColor: "#EEF4E5",
    borderColor: "#DDE8C7",
  },
  linkedTransportSecondaryButtonText: {
    color: "#47642A",
    fontSize: 12,
    fontWeight: "800",
  },
  linkedTransportPrimaryButton: {
    alignItems: "center",
    backgroundColor: "#5C8C1F",
    borderRadius: 14,
    flex: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 11,
  },
  linkedTransportPrimaryButtonDisabled: {
    opacity: 0.6,
  },
  linkedTransportPrimaryButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  linkedTransportPostedBadge: {
    alignItems: "center",
    borderRadius: 14,
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  myLinkedTransportPostedBadge: {
    backgroundColor: "#E6F1DA",
  },
  theirLinkedTransportPostedBadge: {
    backgroundColor: "#EEF4E5",
  },
  linkedTransportPostedBadgeText: {
    color: "#3B6D11",
    fontSize: 12,
    fontWeight: "800",
  },
  linkedTransportMoreHint: {
    color: "#7A8870",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 10,
  },
  myLinkedTransportMoreHint: {
    color: "#7A8870",
  },
  expenseCard: {
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 2,
    padding: 14,
  },
  myExpenseCard: {
    backgroundColor: "#F7FAF1",
    borderColor: "#DDE8C7",
  },
  theirExpenseCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#DDE8C7",
  },
  expenseCardTopRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  expenseCardKicker: {
    color: "#47642A",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  myExpenseCardKicker: {
    color: "#47642A",
  },
  expenseCardAmount: {
    color: "#29440F",
    fontSize: 16,
    fontWeight: "800",
  },
  myExpenseCardAmount: {
    color: "#29440F",
  },
  expenseCardTitle: {
    color: "#29440F",
    fontSize: 18,
    fontWeight: "800",
    marginTop: 10,
  },
  myExpenseCardTitle: {
    color: "#29440F",
  },
  expenseCardMeta: {
    color: "#5A6E41",
    fontSize: 14,
    marginTop: 6,
  },
  myExpenseCardMeta: {
    color: "#5A6E41",
  },
  expenseCardChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  expenseCardChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  myExpenseCardChip: {
    backgroundColor: "#E6F1DA",
  },
  theirExpenseCardChip: {
    backgroundColor: "#EEF4E5",
  },
  expenseCardChipText: {
    color: "#47642A",
    fontSize: 12,
    fontWeight: "700",
  },
  myExpenseCardChipText: {
    color: "#47642A",
  },
  expenseRepaymentStatusRow: {
    marginTop: 14,
  },
  expenseRepaymentStatusText: {
    color: "#5A6E41",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
  },
  myExpenseRepaymentStatusText: {
    color: "#5A6E41",
  },
  linkedExpenseOpenButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: 14,
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  myLinkedExpenseOpenButton: {
    backgroundColor: "#E6F1DA",
  },
  theirLinkedExpenseOpenButton: {
    backgroundColor: "#EEF4E5",
  },
  linkedExpenseOpenButtonText: {
    color: "#47642A",
    fontSize: 12,
    fontWeight: "800",
  },
  expensePayButton: {
    alignItems: "center",
    backgroundColor: "#5C8C1F",
    borderRadius: 16,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  expensePayButtonDisabled: {
    opacity: 0.6,
  },
  expensePayButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  expensePaidBadge: {
    alignItems: "center",
    borderRadius: 14,
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  myExpensePaidBadge: {
    backgroundColor: "#E6F1DA",
  },
  theirExpensePaidBadge: {
    backgroundColor: "#EEF4E5",
  },
  expensePaidBadgeText: {
    color: "#3B6D11",
    fontSize: 12,
    fontWeight: "800",
  },
  composerBar: {
    alignItems: "flex-end",
    backgroundColor: "#FAFCF5",
    borderTopColor: "#DDE8C7",
    borderTopWidth: 1,
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  shareSavedButton: {
    alignItems: "center",
    backgroundColor: "#F4F8EC",
    borderColor: "#DDE8C7",
    borderRadius: 20,
    borderWidth: 1,
    height: 48,
    justifyContent: "center",
    marginRight: 10,
    width: 48,
  },
  shareSavedButtonDisabled: {
    opacity: 0.55,
  },
  composerInput: {
    backgroundColor: "#FFFFFF",
    borderColor: "#DDE8C7",
    borderRadius: 20,
    borderWidth: 1,
    color: "#29440F",
    flex: 1,
    fontSize: 15,
    maxHeight: 120,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingVertical: 12,
  },
  sendButton: {
    alignItems: "center",
    backgroundColor: "#5C8C1F",
    borderRadius: 20,
    height: 48,
    justifyContent: "center",
    marginLeft: 10,
    width: 48,
  },
  sendButtonDisabled: {
    opacity: 0.55,
  },
  modalOverlay: {
    backgroundColor: "rgba(19, 29, 11, 0.26)",
    flex: 1,
    justifyContent: "flex-end",
    padding: 16,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetCard: {
    backgroundColor: "#FAFCF5",
    borderColor: "#DDE8C7",
    borderRadius: 28,
    borderWidth: 1,
    maxHeight: "76%",
    padding: 18,
  },
  sheetHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  sheetHeaderTextWrap: {
    flex: 1,
    paddingRight: 12,
  },
  sheetTitle: {
    color: "#29440F",
    fontSize: 20,
    fontWeight: "800",
  },
  sheetSubtitle: {
    color: "#5F6E53",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
  sheetCloseButton: {
    alignItems: "center",
    backgroundColor: "#EEF4E5",
    borderRadius: 14,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  sheetEmptyState: {
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 20,
  },
  sheetEmptyTitle: {
    color: "#29440F",
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  sheetEmptyText: {
    color: "#5F6E53",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    textAlign: "center",
  },
  sheetPrimaryButton: {
    alignItems: "center",
    backgroundColor: "#5C8C1F",
    borderRadius: 16,
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  sheetPrimaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  sheetTextInput: {
    backgroundColor: "#FFFFFF",
    borderColor: "#DDE8C7",
    borderRadius: 16,
    borderWidth: 1,
    color: "#29440F",
    fontSize: 15,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  sheetTripsContent: {
    paddingBottom: 6,
  },
  sheetTripCard: {
    backgroundColor: "#F6F8EE",
    borderColor: "#DDE8C7",
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 12,
    padding: 16,
  },
  sheetTripTopRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sheetTripSourceBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  sheetTripSourceBadgeText: {
    fontSize: 11,
    fontWeight: "800",
  },
  sheetTripDate: {
    color: "#6B7A5D",
    fontSize: 12,
    fontWeight: "700",
  },
  sheetTripTitle: {
    color: "#29440F",
    fontSize: 17,
    fontWeight: "800",
  },
  sheetTripDestination: {
    color: "#5A6E41",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 4,
  },
  sheetTripMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 8,
  },
  sheetTripMetaText: {
    color: "#627254",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 4,
    marginRight: 10,
  },
  sheetTripSummary: {
    color: "#4C5D3F",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
  },
  sheetShareButton: {
    alignItems: "center",
    backgroundColor: "#5C8C1F",
    borderRadius: 14,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  sheetShareButtonDisabled: {
    opacity: 0.6,
  },
  sheetShareButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  previewCard: {
    backgroundColor: "#FAFCF5",
    borderColor: "#DDE8C7",
    borderRadius: 28,
    borderWidth: 1,
    marginBottom: 16,
    maxHeight: "82%",
    padding: 18,
  },
  previewHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  previewHeaderTextWrap: {
    flex: 1,
    paddingRight: 12,
  },
  previewTitle: {
    color: "#29440F",
    fontSize: 21,
    fontWeight: "800",
  },
  previewDestination: {
    color: "#5A6E41",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 6,
  },
  previewMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 14,
  },
  previewMetaText: {
    color: "#627254",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 4,
    marginLeft: 10,
  },
  previewSummary: {
    color: "#435238",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 14,
  },
  previewLinkedTransportSection: {
    marginTop: 16,
  },
  previewLinkedTransportTitle: {
    color: "#47642A",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  previewLinkedTransportCard: {
    backgroundColor: "#F6F8EE",
    borderColor: "#DDE8C7",
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 10,
    padding: 14,
  },
  previewLinkedTransportTopRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  previewLinkedTransportTextWrap: {
    flex: 1,
    paddingRight: 10,
  },
  previewLinkedTransportCardTitle: {
    color: "#29440F",
    fontSize: 15,
    fontWeight: "800",
  },
  previewLinkedTransportRoute: {
    color: "#5A6E41",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  previewLinkedTransportAmount: {
    color: "#29440F",
    fontSize: 14,
    fontWeight: "800",
  },
  previewLinkedTransportMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  previewLinkedTransportMetaText: {
    color: "#627254",
    fontSize: 12,
    fontWeight: "700",
  },
  previewLinkedTransportButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#EEF4E5",
    borderColor: "#DDE8C7",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  previewLinkedTransportButtonText: {
    color: "#47642A",
    fontSize: 12,
    fontWeight: "800",
  },
  previewDetailsScroll: {
    marginTop: 14,
  },
  previewDetailsContent: {
    paddingBottom: 6,
  },
  previewDetailsText: {
    color: "#46563A",
    fontSize: 14,
    lineHeight: 22,
  },
  expensePreviewCard: {
    backgroundColor: "#F6F8EE",
    borderColor: "#DDE8C7",
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 16,
    padding: 16,
  },
  expensePreviewKicker: {
    color: "#5C8C1F",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  expensePreviewTitle: {
    color: "#29440F",
    fontSize: 20,
    fontWeight: "800",
    marginTop: 6,
  },
  expensePreviewMeta: {
    color: "#5A6E41",
    fontSize: 14,
    marginTop: 8,
  },
  expensePreviewPills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },
  expensePreviewPill: {
    backgroundColor: "#FFFFFF",
    borderColor: "#DDE8C7",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  expensePreviewPillText: {
    color: "#4E6630",
    fontSize: 12,
    fontWeight: "700",
  },
});
