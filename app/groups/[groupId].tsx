import { MaterialIcons } from "@expo/vector-icons";
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

import { auth, db } from "../../firebase";
import {
  buildGroupChatSharedTrip,
  parseGroupChatMessage,
  type GroupChatMessage,
  type GroupChatSharedTrip,
} from "../../utils/group-chat";
import { parseTravelGroup, type TravelGroup } from "../../utils/groups";
import { getProfileDisplayName } from "../../utils/profile-info";
import { parseSavedTrips, type SavedTrip } from "../../utils/saved-trips";

function getGroupsErrorMessage(error: unknown, action: "read" | "write") {
  const fallback =
    action === "write"
      ? "Не успяхме да изпратим съобщението. Опитай отново."
      : "Не успяхме да заредим групата. Опитай отново.";

  if (!error || typeof error !== "object" || !("code" in error)) {
    return fallback;
  }

  switch ((error as { code?: string }).code) {
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

export default function GroupChatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ groupId: string | string[] }>();
  const groupId = Array.isArray(params.groupId) ? params.groupId[0] ?? "" : params.groupId ?? "";
  const scrollViewRef = useRef<ScrollView | null>(null);

  const [user, setUser] = useState<User | null>(null);
  const [profileName, setProfileName] = useState("Traveler");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [joining, setJoining] = useState(false);
  const [sharingTripId, setSharingTripId] = useState<string | null>(null);
  const [group, setGroup] = useState<TravelGroup | null>(null);
  const [messages, setMessages] = useState<GroupChatMessage[]>([]);
  const [savedTrips, setSavedTrips] = useState<SavedTrip[]>([]);
  const [composerValue, setComposerValue] = useState("");
  const [error, setError] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [shareSheetVisible, setShareSheetVisible] = useState(false);
  const [previewTrip, setPreviewTrip] = useState<GroupChatSharedTrip | null>(null);

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
        setMessages([]);
        setSavedTrips([]);
        setError("Липсва group id.");
        setLoading(false);
        return;
      }

      if (!nextUser) {
        setUser(null);
        setGroup(null);
        setMessages([]);
        setSavedTrips([]);
        setLoading(false);
        router.replace("/login");
        return;
      }

      setUser(nextUser);
      setGroup(null);
      setMessages([]);
      setSavedTrips([]);
      setLoading(true);
      setError("");
      setInfoMessage("");
      setShareSheetVisible(false);
      setPreviewTrip(null);

      unsubscribeProfile = onSnapshot(
        doc(db, "profiles", nextUser.uid),
        (profileSnapshot) => {
          if (!profileSnapshot.exists()) {
            setSavedTrips([]);
            setLoading(false);
            router.replace("/onboarding");
            return;
          }

          const profileData = profileSnapshot.data() as Record<string, unknown>;
          setSavedTrips(parseSavedTrips(profileData));
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

      await addDoc(collection(db, "groups", group.id, "messages"), {
        createdAt: serverTimestamp(),
        messageType: "shared-trip",
        senderId: user.uid,
        senderLabel: profileName,
        sharedTrip: buildGroupChatSharedTrip(trip),
        text: "Shared a trip plan",
      });

      setShareSheetVisible(false);
    } catch (nextError) {
      setError(getGroupsErrorMessage(nextError, "write"));
    } finally {
      setSharingTripId(null);
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
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.screen}
      >
        <View style={styles.header}>
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
          <View style={styles.descriptionCard}>
            <Text style={styles.descriptionText}>{group.description}</Text>
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

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {infoMessage ? (
          <View style={styles.infoCard}>
            <Text style={styles.infoText}>{infoMessage}</Text>
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
                Send the first message or share a trip from Trips to start the conversation in this group.
              </Text>
            </View>
          ) : (
            messages.map((message) => {
              const isMine = message.senderId === user?.uid;
              const hasSharedTrip = message.messageType === "shared-trip" && !!message.sharedTrip;

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
                    <TouchableOpacity
                      activeOpacity={0.92}
                      onPress={() => setPreviewTrip(message.sharedTrip)}
                      style={[
                        styles.sharedTripCard,
                        isMine ? styles.mySharedTripCard : styles.theirSharedTripCard,
                      ]}
                    >
                      <View style={styles.sharedTripTopRow}>
                        <Text style={[styles.sharedTripKicker, isMine && styles.mySharedTripKicker]}>
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
                            style={[styles.sharedTripMetaText, isMine && styles.mySharedTripMetaText]}
                          >
                            {message.sharedTrip.duration}
                          </Text>
                        ) : null}
                        {message.sharedTrip?.budget ? (
                          <Text
                            style={[styles.sharedTripMetaText, isMine && styles.mySharedTripMetaText]}
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
                        Tap to open the full trip plan
                      </Text>
                    </TouchableOpacity>
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

        <View style={styles.composerBar}>
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
            style={styles.composerInput}
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
        <View style={styles.modalOverlay}>
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
                <MaterialIcons color="#29440F" name="close" size={20} />
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
        <View style={styles.modalOverlay}>
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
});
