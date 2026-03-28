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
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";

import { useAppTheme } from "../../components/app-theme-provider";
import { auth, db } from "../../firebase";
import {
  buildGroupChatExpense,
  buildGroupChatSharedTrip,
  parseGroupChatMessage,
  type GroupChatMessage,
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
import { buildStripeCheckoutReturnUrls } from "../../utils/stripe-checkout-return";
import { createTestCheckoutSession } from "../../utils/travel-offers";

import { styles } from "../../features/group-detail/screen-styles";
import { GroupChatComposer } from "../../features/group-detail/components/GroupChatComposer";
import { GroupChatMessageRow } from "../../features/group-detail/components/GroupChatMessage";
import { GroupDetailModals } from "../../features/group-detail/components/GroupDetailModals";
import {
  buildInitialHomePlannerMessage,
  buildLinkedExpenseLookupKey,
  buildLinkedTransportsFromStoredPlan,
  buildStoredHomePlansBySourceKey,
  formatExpenseAmount,
  getAvatarColor,
  getExpensePerPerson,
  getExpenseRemainingCollectionAmount,
  getExpenseSettledShareCount,
  getGroupDetailErrorMessage,
  getInitials,
  getOutstandingExpenseAmount,
  getStripeExpenseCheckoutErrorMessage,
  parseCheckoutReturnState,
} from "../../features/group-detail/helpers";

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
          setError(getGroupDetailErrorMessage(nextError, "read"));
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
          setError(getGroupDetailErrorMessage(nextError, "read"));
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
        setError(getGroupDetailErrorMessage(nextError, "read"));
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
        setError(getGroupDetailErrorMessage(nextError, "read"));
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
    const q = memberSearchQuery.trim().toLowerCase();

    if (!q) {
      return rows;
    }

    return rows.filter(
      (member) =>
        member.label.toLowerCase().includes(q) ||
        member.username.toLowerCase().includes(q) ||
        member.id.toLowerCase().includes(q)
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
      setError(getGroupDetailErrorMessage(nextError, "write"));
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
      setError(getGroupDetailErrorMessage(nextError, "write"));
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
      setError(getGroupDetailErrorMessage(nextError, "write"));
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
      setError(getGroupDetailErrorMessage(nextError, "write"));
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
      setError(getGroupDetailErrorMessage(nextError, "write"));
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
      setError(getGroupDetailErrorMessage(nextError, "write"));
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

    const outstandingAmount = getOutstandingExpenseAmount(message.id, message.expense, user.uid, expenseRepaymentsByKey);

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
      setError(getGroupDetailErrorMessage(nextError, "write"));
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
      setError(getGroupDetailErrorMessage(nextError, "write"));
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
      setError(getGroupDetailErrorMessage(nextError, "write"));
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
      setError(getGroupDetailErrorMessage(nextError, "write"));
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
      setError(getGroupDetailErrorMessage(nextError, "write"));
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
        {/* Header */}
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

        {/* Messages scroll */}
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
              const expense = message.messageType === "expense" && message.expense ? message.expense : null;
              const myOutstandingAmount =
                expense && user ? getOutstandingExpenseAmount(message.id, expense, user.uid, expenseRepaymentsByKey) : 0;
              const myRepayment =
                user && expense
                  ? expenseRepaymentsByKey[buildGroupExpenseRepaymentId(message.id, user.uid)] ?? null
                  : null;
              const settledShareCount = expense
                ? getExpenseSettledShareCount(message.id, expense, expenseRepaymentsByExpenseId)
                : 0;
              const expenseRemainingCollection = expense
                ? getExpenseRemainingCollectionAmount(message.id, expense, expenseRepaymentsByExpenseId)
                : 0;

              return (
                <GroupChatMessageRow
                  key={message.id}
                  creatingLinkedExpenseKey={creatingLinkedExpenseKey}
                  expenseRemainingCollection={expenseRemainingCollection}
                  group={group}
                  isMember={isMember}
                  isMine={isMine}
                  linkedExpenseMessagesByKey={linkedExpenseMessagesByKey}
                  message={message}
                  myOutstandingAmount={myOutstandingAmount}
                  myRepayment={myRepayment}
                  onCreateLinkedTransportExpense={(msg, lt) => {
                    void handleCreateLinkedTransportExpense(msg, lt);
                  }}
                  onOpenPlannerTicket={(url) => {
                    void handleOpenPlannerTicket(url);
                  }}
                  onPayExpense={(msg) => {
                    void handlePayExpense(msg);
                  }}
                  onPreviewTrip={setPreviewTrip}
                  processingRepaymentExpenseId={processingRepaymentExpenseId}
                  settledShareCount={settledShareCount}
                  userId={user?.uid}
                />
              );
            })
          )}
        </ScrollView>

        {/* Composer */}
        <GroupChatComposer
          canManageExpenses={canManageExpenses}
          canOpenSharePicker={canOpenSharePicker}
          colors={colors}
          composerBottomInset={composerBottomInset}
          composerValue={composerValue}
          isMember={isMember}
          isPublicGroup={group?.accessType === "public"}
          joining={joining}
          onChangeComposerValue={setComposerValue}
          onFocusInput={() => {
            requestAnimationFrame(() => {
              scrollViewRef.current?.scrollToEnd({ animated: true });
            });
          }}
          onOpenExpenseSheet={() => setExpenseSheetVisible(true)}
          onOpenShareSheet={() => setShareSheetVisible(true)}
          onSend={() => {
            void handleSend();
          }}
          savingExpense={savingExpense}
          sending={sending}
        />
      </KeyboardAvoidingView>

      {/* Error toast */}
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

      {/* Info toast */}
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

      <GroupDetailModals
        colors={colors}
        expenseAmount={expenseAmount}
        expenseSheetVisible={expenseSheetVisible}
        expenseTitle={expenseTitle}
        group={group}
        groupDescriptionInput={groupDescriptionInput}
        groupDetailsVisible={groupDetailsVisible}
        groupJoinKeyInput={groupJoinKeyInput}
        groupNameInput={groupNameInput}
        isCreator={isCreator}
        memberRows={memberRows}
        memberSearchQuery={memberSearchQuery}
        membersLabel={membersLabel}
        onAddExpense={() => { void handleAddExpense(); }}
        onChangeExpenseAmount={setExpenseAmount}
        onChangeExpenseTitle={setExpenseTitle}
        onChangeGroupDescriptionInput={setGroupDescriptionInput}
        onChangeGroupJoinKeyInput={setGroupJoinKeyInput}
        onChangeGroupNameInput={setGroupNameInput}
        onChangeMemberSearchQuery={setMemberSearchQuery}
        onCloseExpenseSheet={() => setExpenseSheetVisible(false)}
        onCloseGroupDetails={() => setGroupDetailsVisible(false)}
        onClosePreviewTrip={() => setPreviewTrip(null)}
        onCloseShareSheet={() => setShareSheetVisible(false)}
        onNavigateToSaved={() => { setShareSheetVisible(false); router.push("/saved"); }}
        onOpenPlannerTicket={(url) => { void handleOpenPlannerTicket(url); }}
        onPickGroupPhoto={() => { void handlePickGroupPhoto(); }}
        onRemoveMember={(id) => { void handleRemoveMember(id); }}
        onResetGroupPhoto={() => { void handleResetGroupPhoto(); }}
        onSaveGroupSettings={() => { void handleSaveGroupSettings(); }}
        onSaveSharedTripToHome={(st) => { void handleSaveSharedTripToHome(st); }}
        onShareTrip={(trip) => { void handleShareTrip(trip); }}
        previewTrip={previewTrip}
        profileName={profileName}
        removingMemberId={removingMemberId}
        savedTrips={savedTrips}
        savingExpense={savingExpense}
        savingGroupSettings={savingGroupSettings}
        savingSharedTripKey={savingSharedTripKey}
        shareSheetVisible={shareSheetVisible}
        sharingTripId={sharingTripId}
        updatingGroupPhoto={updatingGroupPhoto}
      />
    </SafeAreaView>
  );
}
