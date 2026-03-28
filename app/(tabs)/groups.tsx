import { FirebaseError } from "firebase/app";
import { MaterialIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
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
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppTheme } from "../../components/app-theme-provider";
import { DismissKeyboard } from "../../components/dismiss-keyboard";
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
  createSuggestedGroupKey,
  deleteGroupWithMessages,
  normalizeGroupJoinKey,
  parseTravelGroup,
  sortGroupsByCreatedAt,
  type GroupAccessType,
  type TravelGroup,
} from "../../utils/groups";
import { extractPersonalProfile, getProfileDisplayName } from "../../utils/profile-info";
import {
  parsePublicProfile,
  type PublicProfile,
} from "../../utils/public-profiles";
import {
  parseTripRequest,
  sortTripRequestsByActivity,
  type TripRequest,
} from "../../utils/trip-requests";

type AvatarProps = {
  imageUri?: string;
  label: string;
  photoUrl?: string;
  size?: number;
  subtitle?: string;
};

type ComposerUserRowProps = {
  profile: PublicProfile;
  selected: boolean;
  onPress: () => void;
};

type GroupRowProps = {
  actionLabel?: string;
  actionLoading?: boolean;
  actionVariant?: "primary" | "danger";
  badge?: string;
  group: TravelGroup;
  onActionPress?: () => void;
  onPress?: () => void;
  preview: string;
  rightMeta: string;
};

type TripRequestCardProps = {
  currentUserId: string;
  onClosePress: () => void;
  onCreateGroupPress: () => void;
  onToggleInterestPress: () => void;
  request: TripRequest;
  updating: boolean;
};

function sanitizeString(value: string) {
  return value.trim().toLowerCase();
}

function getGroupsErrorMessage(error: unknown, action: "read" | "write" | "delete") {
  if (!(error instanceof FirebaseError)) {
    return action === "write"
      ? "Не успяхме да запазим групата. Опитай отново."
      : action === "delete"
        ? "Не успяхме да изтрием групата. Опитай отново."
      : "Не успяхме да заредим групите. Опитай отново.";
  }

  switch (error.code) {
    case "permission-denied":
      return action === "write"
        ? "Firestore rules блокират промяната на групите. Обнови правилата и опитай пак."
        : action === "delete"
          ? "Firestore rules блокират изтриването на групата. Обнови правилата и опитай пак."
        : "Firestore rules блокират зареждането на групите. Обнови правилата и опитай пак.";
    case "failed-precondition":
      return "Firestore Database още не е създадена. Създай Firestore Database в Firebase Console.";
    case "unavailable":
      return "Firestore в момента не е достъпен. Опитай пак след малко.";
    default:
      return action === "write"
        ? "Не успяхме да запазим групата. Опитай отново."
        : action === "delete"
          ? "Не успяхме да изтрием групата. Опитай отново."
        : "Не успяхме да заредим групите. Опитай отново.";
  }
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

function formatRelativeTime(value: number | null) {
  if (!value) {
    return "just now";
  }

  const diffMs = Date.now() - value;
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60000));

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);

  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  return new Intl.DateTimeFormat("bg-BG", {
    day: "2-digit",
    month: "short",
  }).format(new Date(value));
}

function matchesQuery(source: string[], query: string) {
  if (!query.trim()) {
    return true;
  }

  const normalizedQuery = sanitizeString(query);
  return source.some((entry) => sanitizeString(entry).includes(normalizedQuery));
}

function Avatar({ label, photoUrl, size = 72, subtitle }: AvatarProps) {
  return (
    <View style={styles.avatarWrap}>
      <View
        style={[
          styles.avatarCircle,
          { backgroundColor: getAvatarColor(label), height: size, width: size, borderRadius: size / 2 },
        ]}
      >
        {photoUrl ? (
          <Image contentFit="cover" source={{ uri: photoUrl }} style={styles.avatarImage} />
        ) : (
          <Text style={[styles.avatarText, { fontSize: Math.max(16, size * 0.26) }]}>
            {getInitials(label)}
          </Text>
        )}
      </View>
      {subtitle ? <Text style={styles.avatarSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

function ComposerUserRow({ profile, selected, onPress }: ComposerUserRowProps) {
  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={styles.composerUserRow}>
      <Avatar
        label={profile.displayName || profile.username || "Traveler"}
        photoUrl={profile.photoUrl}
        size={48}
      />
      <View style={styles.composerUserTextWrap}>
        <Text style={styles.composerUserName}>{profile.displayName}</Text>
        <Text style={styles.composerUserMeta}>
          @{profile.username || "traveler"}
          {profile.homeBase ? ` • ${profile.homeBase}` : ""}
        </Text>
      </View>
      <View style={[styles.selectBubble, selected && styles.selectBubbleSelected]}>
        {selected ? <MaterialIcons color="#FFFFFF" name="check" size={16} /> : null}
      </View>
    </TouchableOpacity>
  );
}

function GroupRow({
  actionLabel,
  actionLoading = false,
  actionVariant = "primary",
  badge,
  group,
  onActionPress,
  onPress,
  preview,
  rightMeta,
}: GroupRowProps) {
  const isPrivate = group.accessType === "private";
  const avatarLabel = group.name || "Group";

  return (
    <TouchableOpacity
      activeOpacity={onPress ? 0.9 : 1}
      disabled={!onPress}
      onPress={onPress}
      style={styles.groupRow}
    >
      <Avatar imageUri={group.photoUrl} label={avatarLabel} size={58} />
      <View style={styles.groupRowTextWrap}>
        <View style={styles.groupRowTitleRow}>
          <Text numberOfLines={1} style={styles.groupRowTitle}>
            {group.name}
          </Text>
          <Text style={styles.groupRowTime}>{rightMeta}</Text>
        </View>

        <Text numberOfLines={1} style={styles.groupRowPreview}>
          {preview}
        </Text>

        <View style={styles.groupRowMetaRow}>
          <View style={[styles.groupTypeBadge, isPrivate && styles.groupTypeBadgePrivate]}>
            <MaterialIcons
              color={isPrivate ? "#FCD34D" : "#9FD7FF"}
              name={isPrivate ? "lock-outline" : "public"}
              size={14}
            />
            <Text style={[styles.groupTypeBadgeText, isPrivate && styles.groupTypeBadgeTextPrivate]}>
              {badge ?? (isPrivate ? "Private" : "Public")}
            </Text>
          </View>

          <Text style={styles.groupMembersText}>{group.memberCount} members</Text>
        </View>
      </View>

      {actionLabel && onActionPress ? (
        <TouchableOpacity
          activeOpacity={0.9}
          disabled={actionLoading}
          onPress={onActionPress}
          style={[
            styles.rowActionButton,
            actionVariant === "danger" && styles.rowActionButtonDanger,
          ]}
        >
          <Text style={styles.rowActionText}>
            {actionLoading ? "..." : actionLabel}
          </Text>
        </TouchableOpacity>
      ) : null}
    </TouchableOpacity>
  );
}

function TripRequestCard({
  currentUserId,
  onClosePress,
  onCreateGroupPress,
  onToggleInterestPress,
  request,
  updating,
}: TripRequestCardProps) {
  const { colors, isDark } = useAppTheme();
  const isCreator = request.creatorId === currentUserId;
  const isInterested = request.interestedUserIds.includes(currentUserId);
  const interestedCount = Math.max(1, request.interestedUserIds.length);

  return (
    <View
      style={[
        styles.requestCard,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          shadowColor: isDark ? "#000000" : "#1A1A1A",
        },
      ]}
    >
      <View style={styles.requestCardTopRow}>
        <View style={styles.requestCardTitleWrap}>
          <Text style={[styles.requestCardEyebrow, { color: colors.accent }]}>
            Trip request
          </Text>
          <Text style={[styles.requestCardTitle, { color: colors.textPrimary }]}>
            {request.destination}
          </Text>
          <Text style={[styles.requestCardCreator, { color: colors.textSecondary }]}>
            {request.creatorLabel} is looking for travel buddies
          </Text>
        </View>
        <View
          style={[
            styles.requestCountBadge,
            { backgroundColor: colors.accentMuted, borderColor: colors.border },
          ]}
        >
          <MaterialIcons color={colors.accent} name="groups" size={16} />
          <Text style={[styles.requestCountText, { color: colors.textPrimary }]}>
            {interestedCount}
          </Text>
        </View>
      </View>

      <View style={styles.requestChipsRow}>
        <View
          style={[
            styles.requestChip,
            { backgroundColor: colors.accentMuted, borderColor: colors.border },
          ]}
        >
          <MaterialIcons color={colors.accent} name="payments" size={15} />
          <Text style={[styles.requestChipText, { color: colors.textPrimary }]}>
            {request.budgetLabel}
          </Text>
        </View>
        <View
          style={[
            styles.requestChip,
            { backgroundColor: colors.warningBackground, borderColor: colors.warningBorder },
          ]}
        >
          <MaterialIcons color={colors.warningText} name="schedule" size={15} />
          <Text style={[styles.requestChipText, { color: colors.textPrimary }]}>
            {request.timingLabel}
          </Text>
        </View>
        <View
          style={[
            styles.requestChip,
            { backgroundColor: colors.cardAlt, borderColor: colors.border },
          ]}
        >
          <MaterialIcons color={colors.textMuted} name="airline-seat-recline-normal" size={15} />
          <Text style={[styles.requestChipText, { color: colors.textPrimary }]}>
            {request.travelersLabel}
          </Text>
        </View>
      </View>

      <Text
        numberOfLines={3}
        style={[styles.requestCardNote, { color: colors.textSecondary }]}
      >
        {request.note || "Open vibe check: food, route, budget and timing can be refined with the group."}
      </Text>

      <View style={styles.requestCardFooter}>
        <Text style={[styles.requestFooterText, { color: colors.textMuted }]}>
          {isCreator
            ? "You created this request."
            : isInterested
              ? "You already joined the interest list."
              : "Tap in if you want to join this trip idea."}
        </Text>

        <View style={styles.requestActionsRow}>
          {isCreator ? (
            <>
              <TouchableOpacity
                activeOpacity={0.9}
                disabled={updating}
                onPress={onCreateGroupPress}
                style={[
                  styles.requestPrimaryButton,
                  { backgroundColor: colors.accent },
                  updating && styles.requestButtonDisabled,
                ]}
              >
                <Text style={styles.requestPrimaryButtonText}>
                  {updating ? "..." : "Create group"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.9}
                disabled={updating}
                onPress={onClosePress}
                style={[
                  styles.requestSecondaryButton,
                  {
                    backgroundColor: colors.warningBackground,
                    borderColor: colors.warningBorder,
                  },
                  updating && styles.requestButtonDisabled,
                ]}
              >
                <Text style={[styles.requestSecondaryButtonText, { color: colors.warningText }]}>
                  Close
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              activeOpacity={0.9}
              disabled={updating}
              onPress={onToggleInterestPress}
              style={[
                styles.requestPrimaryButton,
                {
                  backgroundColor: isInterested ? colors.cardAlt : colors.accent,
                  borderColor: isInterested ? colors.border : colors.accent,
                  borderWidth: isInterested ? 1 : 0,
                },
                updating && styles.requestButtonDisabled,
              ]}
            >
              <Text
                style={[
                  styles.requestPrimaryButtonText,
                  { color: isInterested ? colors.textPrimary : "#FFFFFF" },
                ]}
              >
                {updating ? "..." : isInterested ? "Interested" : "I'm in"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

export default function GroupsTabScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();

  const [user, setUser] = useState<User | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [loadingPublicProfiles, setLoadingPublicProfiles] = useState(true);
  const [loadingTripRequests, setLoadingTripRequests] = useState(true);
  const [savingGroup, setSavingGroup] = useState(false);
  const [savingTripRequest, setSavingTripRequest] = useState(false);
  const [joiningGroupId, setJoiningGroupId] = useState<string | null>(null);
  const [joiningByKey, setJoiningByKey] = useState(false);
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
  const [updatingTripRequestId, setUpdatingTripRequestId] = useState<string | null>(null);

  const [profileName, setProfileName] = useState("Traveler");
  const [profileAvatarUrl, setProfileAvatarUrl] = useState("");
  const [username, setUsername] = useState("");
  const [groups, setGroups] = useState<TravelGroup[]>([]);
  const [publicProfiles, setPublicProfiles] = useState<PublicProfile[]>([]);
  const [tripRequests, setTripRequests] = useState<TripRequest[]>([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [joinKeyValue, setJoinKeyValue] = useState("");
  const [actionMenuVisible, setActionMenuVisible] = useState(false);
  const [joinKeyModalVisible, setJoinKeyModalVisible] = useState(false);

  const [composerVisible, setComposerVisible] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [groupAccess, setGroupAccess] = useState<GroupAccessType>("public");
  const [groupJoinKey, setGroupJoinKey] = useState("");
  const [inviteSearchQuery, setInviteSearchQuery] = useState("");
  const [selectedInviteIds, setSelectedInviteIds] = useState<string[]>([]);
  const [groupPendingDelete, setGroupPendingDelete] = useState<TravelGroup | null>(null);
  const [requestComposerVisible, setRequestComposerVisible] = useState(false);
  const [requestDestination, setRequestDestination] = useState("");
  const [requestBudget, setRequestBudget] = useState("");
  const [requestTiming, setRequestTiming] = useState("");
  const [requestTravelers, setRequestTravelers] = useState("");
  const [requestNote, setRequestNote] = useState("");

  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;
    let unsubscribeGroups: (() => void) | null = null;
    let unsubscribePublicProfiles: (() => void) | null = null;
    let unsubscribeTripRequests: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (nextUser) => {
      unsubscribeProfile?.();
      unsubscribeGroups?.();
      unsubscribePublicProfiles?.();
      unsubscribeTripRequests?.();
      unsubscribeProfile = null;
      unsubscribeGroups = null;
      unsubscribePublicProfiles = null;
      unsubscribeTripRequests = null;

      if (!nextUser) {
        setUser(null);
        setGroups([]);
        setPublicProfiles([]);
        setTripRequests([]);
        setLoadingProfile(false);
        setLoadingGroups(false);
        setLoadingPublicProfiles(false);
        setLoadingTripRequests(false);
        router.replace("/login");
        return;
      }

      setUser(nextUser);
      setLoadingProfile(true);
      setLoadingGroups(true);
      setLoadingPublicProfiles(true);
      setLoadingTripRequests(true);
      setError("");
      setSuccessMessage("");

      unsubscribeProfile = onSnapshot(
        doc(db, "profiles", nextUser.uid),
        (profileSnapshot) => {
          if (!profileSnapshot.exists()) {
            setLoadingProfile(false);
            router.replace("/onboarding");
            return;
          }

          const profileData = profileSnapshot.data() as Record<string, unknown>;
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
          setProfileAvatarUrl(
            extractPersonalProfile({
              profileInfo:
                profileData.profileInfo && typeof profileData.profileInfo === "object"
                  ? (profileData.profileInfo as Record<string, unknown>)
                  : undefined,
            }).avatarUrl
          );
          setUsername(typeof profileData.username === "string" ? profileData.username : "");
          setLoadingProfile(false);
        },
        (nextError) => {
          setError(getGroupsErrorMessage(nextError, "read"));
          setLoadingProfile(false);
        }
      );

      unsubscribeGroups = onSnapshot(
        collection(db, "groups"),
        (groupsSnapshot) => {
          const nextGroups = sortGroupsByCreatedAt(
            groupsSnapshot.docs.map((groupDocument) =>
              parseTravelGroup(groupDocument.id, groupDocument.data() as Record<string, unknown>)
            )
          );
          setGroups(nextGroups);
          setLoadingGroups(false);
        },
        (nextError) => {
          setError(getGroupsErrorMessage(nextError, "read"));
          setLoadingGroups(false);
        }
      );

      unsubscribePublicProfiles = onSnapshot(
        collection(db, "publicProfiles"),
        (profilesSnapshot) => {
          const nextProfiles = profilesSnapshot.docs
            .map((profileDocument) =>
              parsePublicProfile(
                profileDocument.id,
                profileDocument.data() as Record<string, unknown>
              )
            )
            .sort((left, right) => left.displayName.localeCompare(right.displayName));
          setPublicProfiles(nextProfiles);
          setLoadingPublicProfiles(false);
        },
        (nextError) => {
          setError(getGroupsErrorMessage(nextError, "read"));
          setLoadingPublicProfiles(false);
        }
      );

      unsubscribeTripRequests = onSnapshot(
        collection(db, "tripRequests"),
        (requestsSnapshot) => {
          const nextRequests = sortTripRequestsByActivity(
            requestsSnapshot.docs.map((requestDocument) =>
              parseTripRequest(
                requestDocument.id,
                requestDocument.data() as Record<string, unknown>
              )
            )
          );
          setTripRequests(nextRequests);
          setLoadingTripRequests(false);
        },
        (nextError) => {
          setError(getGroupsErrorMessage(nextError, "read"));
          setLoadingTripRequests(false);
        }
      );
    });

    return () => {
      unsubscribeProfile?.();
      unsubscribeGroups?.();
      unsubscribePublicProfiles?.();
      unsubscribeTripRequests?.();
      unsubscribeAuth();
    };
  }, [router]);

  const userId = user?.uid ?? "";
  const userHandle = username || profileName.toLowerCase().replace(/\s+/g, "_");
  const publicUsers = publicProfiles.filter((profile) => profile.uid !== userId);

  const publicGroups = useMemo(
    () => groups.filter((group) => group.accessType === "public"),
    [groups]
  );
  const joinedGroups = useMemo(
    () => groups.filter((group) => group.memberIds.includes(userId)),
    [groups, userId]
  );
  const invitedGroups = useMemo(
    () =>
      groups.filter(
        (group) =>
          !group.memberIds.includes(userId) && group.invitedUserIds.includes(userId)
      ),
    [groups, userId]
  );
  const openTripRequests = useMemo(
    () => tripRequests.filter((request) => request.status === "open"),
    [tripRequests]
  );
  const searchedPublicGroups = useMemo(
    () =>
      publicGroups.filter((group) =>
        matchesQuery(
          [group.name, group.description, group.creatorLabel],
          searchQuery
        )
      ),
    [publicGroups, searchQuery]
  );
  const filteredInviteProfiles = useMemo(
    () =>
      publicUsers.filter(
        (profile) =>
          !selectedInviteIds.includes(profile.uid) &&
          matchesQuery(
            [profile.displayName, profile.username, profile.homeBase, profile.aboutMe],
            inviteSearchQuery
          )
      ),
    [publicUsers, selectedInviteIds, inviteSearchQuery]
  );

  const publicProfilesById = useMemo(
    () =>
      Object.fromEntries(publicProfiles.map((profile) => [profile.uid, profile])),
    [publicProfiles]
  );
  const clearFeedback = () => {
    setError("");
    setSuccessMessage("");
  };

  const openGroupChat = (groupId: string) => {
    router.push({
      pathname: "/groups/[groupId]",
      params: { groupId },
    });
  };

  const resetComposer = () => {
    setGroupName("");
    setGroupDescription("");
    setGroupAccess("public");
    setGroupJoinKey("");
    setInviteSearchQuery("");
    setSelectedInviteIds([]);
  };

  const resetRequestComposer = () => {
    setRequestDestination("");
    setRequestBudget("");
    setRequestTiming("");
    setRequestTravelers("");
    setRequestNote("");
  };

  const openDeleteModal = (group: TravelGroup) => {
    setActionMenuVisible(false);
    setGroupPendingDelete(group);
    clearFeedback();
    setDeleteModalVisible(true);
  };

  const openComposer = (preselectedUserId?: string) => {
    resetComposer();
    setActionMenuVisible(false);
    setJoinKeyModalVisible(false);

    if (preselectedUserId) {
      setSelectedInviteIds([preselectedUserId]);
    }

    clearFeedback();
    setComposerVisible(true);
  };

  const openRequestComposer = () => {
    resetRequestComposer();
    setActionMenuVisible(false);
    clearFeedback();
    setRequestComposerVisible(true);
  };

  const toggleInvite = (profileId: string) => {
    setSelectedInviteIds((currentIds) => {
      if (currentIds.includes(profileId)) {
        return currentIds.filter((currentId) => currentId !== profileId);
      }

      return [...currentIds, profileId];
    });
  };

  const joinGroup = async (groupId: string) => {
    if (!user) {
      return;
    }

    try {
      setJoiningGroupId(groupId);
      clearFeedback();

      await runTransaction(db, async (transaction) => {
        const groupRef = doc(db, "groups", groupId);
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

      setSuccessMessage("Успешно влезе в групата.");
      setJoinKeyValue("");
      openGroupChat(groupId);
    } catch (nextError) {
      setError(getGroupsErrorMessage(nextError, "write"));
    } finally {
      setJoiningGroupId(null);
      setJoiningByKey(false);
    }
  };

  const handleJoinByKey = async () => {
    const normalizedKey = normalizeGroupJoinKey(joinKeyValue);

    if (normalizedKey.length < 4) {
      setError("Въведи валиден private key.");
      setSuccessMessage("");
      return;
    }

    const targetGroup = groups.find((group) => group.joinKeyNormalized === normalizedKey);

    if (!targetGroup) {
      setError("Не намерихме private група с този key.");
      setSuccessMessage("");
      return;
    }

    setJoiningByKey(true);
    await joinGroup(targetGroup.id);
    setJoinKeyModalVisible(false);
  };

  const handleCreateGroup = async () => {
    if (!user) {
      return;
    }

    const trimmedName = groupName.trim();
    const trimmedDescription = groupDescription.trim();
    const normalizedKey =
      groupAccess === "private" ? normalizeGroupJoinKey(groupJoinKey) : null;
    const dedupedInviteIds = Array.from(
      new Set(selectedInviteIds.filter((inviteId) => inviteId !== user.uid))
    );

    if (trimmedName.length < 3) {
      setError("Името на групата трябва да е поне 3 символа.");
      setSuccessMessage("");
      return;
    }

    if (groupAccess === "private" && (!normalizedKey || normalizedKey.length < 4)) {
      setError("Private групите имат нужда от key с поне 4 символа.");
      setSuccessMessage("");
      return;
    }

    if (
      normalizedKey &&
      groups.some((group) => group.joinKeyNormalized === normalizedKey)
    ) {
      setError("Този key вече се използва. Избери друг.");
      setSuccessMessage("");
      return;
    }

    try {
      setSavingGroup(true);
      clearFeedback();

      const newGroupRef = doc(collection(db, "groups"));

      await setDoc(newGroupRef, {
        accessType: groupAccess,
        createdAt: serverTimestamp(),
        creatorId: user.uid,
        creatorLabel: profileName,
        description: trimmedDescription,
        invitedUserIds: dedupedInviteIds,
        joinKeyNormalized: normalizedKey,
        memberCount: 1,
        memberAvatarUrlsById: {
          [user.uid]: profileAvatarUrl,
        },
        memberIds: [user.uid],
        memberLabelsById: {
          [user.uid]: profileName,
        },
        memberUsernamesById: {
          [user.uid]: username,
        },
        name: trimmedName,
        photoUrl: "",
        updatedAt: serverTimestamp(),
      });

      setComposerVisible(false);
      resetComposer();
      setSuccessMessage("Групата е създадена.");
    } catch (nextError) {
      setError(getGroupsErrorMessage(nextError, "write"));
    } finally {
      setSavingGroup(false);
    }
  };

  const handleCreateTripRequest = async () => {
    if (!user) {
      return;
    }

    const trimmedDestination = requestDestination.trim();
    const trimmedBudget = requestBudget.trim();
    const trimmedTiming = requestTiming.trim();
    const trimmedTravelers = requestTravelers.trim();
    const trimmedNote = requestNote.trim();

    if (trimmedDestination.length < 2) {
      setError("Добави дестинация за request-а.");
      setSuccessMessage("");
      return;
    }

    try {
      setSavingTripRequest(true);
      clearFeedback();

      const newRequestRef = doc(collection(db, "tripRequests"));

      await setDoc(newRequestRef, {
        budgetLabel: trimmedBudget || "Open budget",
        createdAt: serverTimestamp(),
        creatorId: user.uid,
        creatorLabel: profileName,
        destination: trimmedDestination,
        groupId: null,
        interestedUserIds: [user.uid],
        note: trimmedNote,
        status: "open",
        timingLabel: trimmedTiming || "Flexible timing",
        travelersLabel: trimmedTravelers || "2-4 people",
        updatedAt: serverTimestamp(),
      });

      resetRequestComposer();
      setRequestComposerVisible(false);
      setSuccessMessage("Trip request-ът е публикуван.");
    } catch (nextError) {
      setError(getGroupsErrorMessage(nextError, "write"));
    } finally {
      setSavingTripRequest(false);
    }
  };

  const toggleTripRequestInterest = async (request: TripRequest) => {
    if (!user) {
      return;
    }

    try {
      setUpdatingTripRequestId(request.id);
      clearFeedback();

      await runTransaction(db, async (transaction) => {
        const requestRef = doc(db, "tripRequests", request.id);
        const requestSnapshot = await transaction.get(requestRef);

        if (!requestSnapshot.exists()) {
          throw new Error("missing-request");
        }

        const currentRequest = parseTripRequest(
          requestSnapshot.id,
          requestSnapshot.data() as Record<string, unknown>
        );

        if (currentRequest.status !== "open") {
          throw new Error("closed-request");
        }

        const nextInterestedUserIds = currentRequest.interestedUserIds.includes(user.uid)
          ? currentRequest.interestedUserIds.filter((currentId) => currentId !== user.uid)
          : [...currentRequest.interestedUserIds, user.uid];

        transaction.update(requestRef, {
          interestedUserIds: nextInterestedUserIds,
          updatedAt: serverTimestamp(),
        });
      });
    } catch (nextError) {
      setError(getGroupsErrorMessage(nextError, "write"));
    } finally {
      setUpdatingTripRequestId(null);
    }
  };

  const closeTripRequest = async (request: TripRequest) => {
    if (!user || request.creatorId !== user.uid) {
      setError("Само creator-ът може да затвори request-а.");
      setSuccessMessage("");
      return;
    }

    try {
      setUpdatingTripRequestId(request.id);
      clearFeedback();

      await runTransaction(db, async (transaction) => {
        const requestRef = doc(db, "tripRequests", request.id);
        const requestSnapshot = await transaction.get(requestRef);

        if (!requestSnapshot.exists()) {
          throw new Error("missing-request");
        }

        transaction.update(requestRef, {
          status: "closed",
          updatedAt: serverTimestamp(),
        });
      });

      setSuccessMessage("Trip request-ът е затворен.");
    } catch (nextError) {
      setError(getGroupsErrorMessage(nextError, "write"));
    } finally {
      setUpdatingTripRequestId(null);
    }
  };

  const createGroupFromRequest = async (request: TripRequest) => {
    if (!user || request.creatorId !== user.uid) {
      setError("Само creator-ът може да превърне request-а в група.");
      setSuccessMessage("");
      return;
    }

    try {
      setUpdatingTripRequestId(request.id);
      clearFeedback();

      const newGroupRef = doc(collection(db, "groups"));
      const requestRef = doc(db, "tripRequests", request.id);
      const batch = writeBatch(db);
      const invitedUserIds = Array.from(
        new Set(request.interestedUserIds.filter((inviteId) => inviteId !== user.uid))
      );
      const groupDescriptionParts = [
        request.note,
        request.timingLabel,
        request.travelersLabel,
        request.budgetLabel,
      ].filter(Boolean);

      batch.set(newGroupRef, {
        accessType: "public",
        createdAt: serverTimestamp(),
        creatorId: user.uid,
        creatorLabel: profileName,
        description: groupDescriptionParts.join(" • "),
        invitedUserIds,
        joinKeyNormalized: null,
        memberCount: 1,
        memberIds: [user.uid],
        name: request.destination,
        updatedAt: serverTimestamp(),
      });

      batch.update(requestRef, {
        groupId: newGroupRef.id,
        status: "closed",
        updatedAt: serverTimestamp(),
      });

      await batch.commit();

      setSuccessMessage("Създадохме група от trip request-а.");
      openGroupChat(newGroupRef.id);
    } catch (nextError) {
      setError(getGroupsErrorMessage(nextError, "write"));
    } finally {
      setUpdatingTripRequestId(null);
    }
  };

  const handleDeleteGroup = async () => {
    if (!user || !groupPendingDelete) {
      return;
    }

    if (groupPendingDelete.creatorId !== user.uid) {
      setDeleteModalVisible(false);
      setGroupPendingDelete(null);
      setError("Само creator-ът може да изтрива групата.");
      setSuccessMessage("");
      return;
    }

    try {
      setDeletingGroupId(groupPendingDelete.id);
      clearFeedback();
      await deleteGroupWithMessages(db, groupPendingDelete.id);
      setDeleteModalVisible(false);
      setGroupPendingDelete(null);
      setSuccessMessage("Групата беше изтрита.");
    } catch (nextError) {
      setError(getGroupsErrorMessage(nextError, "delete"));
    } finally {
      setDeletingGroupId(null);
    }
  };

  const loading =
    loadingProfile || loadingGroups || loadingPublicProfiles || loadingTripRequests;

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
      <DismissKeyboard>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 8 : 0}
      >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.topBar}>
          <View style={styles.topBarTextWrap}>
            <Text style={[styles.pageTitle, { color: colors.textPrimary }]}>Groups</Text>
            <Text style={[styles.pageSubtitle, { color: colors.textSecondary }]}>
              @{userHandle} • {profileName}
            </Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => setActionMenuVisible(true)}
            style={[
              styles.topBarCircleButton,
              {
                backgroundColor: colors.accent,
                borderColor: colors.centerButtonBorder,
              },
            ]}
          >
            <MaterialIcons color="#FFFFFF" name="add" size={28} />
          </TouchableOpacity>
        </View>

        <View
          style={[
            styles.searchShell,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          <MaterialIcons color={colors.textMuted} name="search" size={24} />
          <TextInput
            onChangeText={(value) => {
              setSearchQuery(value);
              clearFeedback();
            }}
            placeholder="Search public groups"
            placeholderTextColor={colors.inputPlaceholder}
            style={[styles.searchInput, { color: colors.textPrimary }]}
            value={searchQuery}
          />
        </View>

        {error ? (
          <View
            style={[
              styles.feedbackCardError,
              { backgroundColor: colors.errorBackground, borderColor: colors.errorBorder },
            ]}
          >
            <Text style={[styles.feedbackTextError, { color: colors.errorText }]}>{error}</Text>
          </View>
        ) : null}

        {successMessage ? (
          <View
            style={[
              styles.feedbackCardSuccess,
              { backgroundColor: colors.successBackground, borderColor: colors.successBorder },
            ]}
          >
            <Text style={[styles.feedbackTextSuccess, { color: colors.successText }]}>
              {successMessage}
            </Text>
          </View>
        ) : null}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.storiesRow}
          contentContainerStyle={styles.storiesContent}
        >
          {publicUsers.map((profile) => (
            <TouchableOpacity
              activeOpacity={0.9}
              key={profile.id}
              onPress={() => openComposer(profile.uid)}
              style={styles.storyButton}
            >
              <Avatar
                label={profile.displayName || profile.username || "Traveler"}
                photoUrl={profile.photoUrl}
                size={74}
                subtitle=""
              />
              <Text numberOfLines={1} style={styles.storyLabel}>
                {profile.username ? profile.username : profile.displayName}
              </Text>
              <Text numberOfLines={1} style={styles.storyHint}>
                {profile.homeBase || "Public profile"}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {!searchQuery.trim() ? (
          <View style={styles.sectionBlock}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Trip requests</Text>
              <Text style={styles.sectionMeta}>{openTripRequests.length} open</Text>
            </View>
            <Text style={[styles.sectionSupportText, { color: colors.textSecondary }]}>
              Quick travel ideas that can turn into a real group when the vibe is right.
            </Text>

            {openTripRequests.length === 0 ? (
              <View
                style={[
                  styles.requestEmptyState,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.requestEmptyIcon,
                    { backgroundColor: colors.accentMuted, borderColor: colors.border },
                  ]}
                >
                  <MaterialIcons color={colors.accent} name="travel-explore" size={28} />
                </View>
                <Text style={[styles.requestEmptyTitle, { color: colors.textPrimary }]}>
                  Няма active trip requests
                </Text>
                <Text style={[styles.requestEmptyText, { color: colors.textSecondary }]}>
                  Пусни идея за trip, събери interested users и после я превърни в група.
                </Text>
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={openRequestComposer}
                  style={[styles.inlineCreateRequestButton, { backgroundColor: colors.accent }]}
                >
                  <MaterialIcons color="#FFFFFF" name="add" size={18} />
                  <Text style={styles.inlineCreateRequestButtonText}>New trip request</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.requestCardsContent}
              >
                {openTripRequests.map((request) => (
                  <TripRequestCard
                    currentUserId={userId}
                    key={request.id}
                    onClosePress={() => {
                      void closeTripRequest(request);
                    }}
                    onCreateGroupPress={() => {
                      void createGroupFromRequest(request);
                    }}
                    onToggleInterestPress={() => {
                      void toggleTripRequestInterest(request);
                    }}
                    request={request}
                    updating={updatingTripRequestId === request.id}
                  />
                ))}
              </ScrollView>
            )}
          </View>
        ) : null}

        {searchQuery.trim() ? (
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>Search results</Text>
            <Text style={styles.sectionMeta}>{searchedPublicGroups.length} public groups</Text>

            {searchedPublicGroups.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateTitle}>Няма съвпадения</Text>
                <Text style={styles.emptyStateText}>
                  Опитай с друго име на група, creator или тема.
                </Text>
              </View>
            ) : (
              searchedPublicGroups.map((group) => (
                <GroupRow
                  actionLabel={group.memberIds.includes(userId) ? "Joined" : "Join"}
                  actionLoading={joiningGroupId === group.id}
                  badge="Public"
                  group={group}
                  key={group.id}
                  onActionPress={
                    group.memberIds.includes(userId) ? undefined : () => joinGroup(group.id)
                  }
                  onPress={() => openGroupChat(group.id)}
                  preview={
                    group.description || `Created by ${group.creatorLabel}`
                  }
                  rightMeta={formatRelativeTime(group.updatedAtMs ?? group.createdAtMs)}
                />
              ))
            )}
          </View>
        ) : null}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Messages</Text>
          <Text style={styles.sectionMeta}>
            Requests {invitedGroups.length ? `(${invitedGroups.length})` : ""}
          </Text>
        </View>

        {invitedGroups.length > 0 ? (
          invitedGroups.map((group) => (
            <GroupRow
              actionLabel="Accept"
              actionLoading={joiningGroupId === group.id}
              badge="Invite"
              group={group}
              key={`invite-${group.id}`}
              onActionPress={() => joinGroup(group.id)}
              preview={`${group.creatorLabel} invited you${group.description ? ` • ${group.description}` : ""}`}
              rightMeta="Request"
            />
          ))
        ) : null}

        {joinedGroups.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateTitle}>Още нямаш групи</Text>
            <Text style={styles.emptyStateText}>
              Създай група или приеми invite, за да се появят тук като messages.
            </Text>
          </View>
        ) : (
          joinedGroups.map((group) => {
            const invitedLabels = group.invitedUserIds
              .slice(0, 2)
              .map(
                (inviteId) =>
                  publicProfilesById[inviteId]?.username ||
                  publicProfilesById[inviteId]?.displayName
              )
              .filter(Boolean);
            const previewText =
              invitedLabels.length > 0
                ? `Invited ${invitedLabels.join(", ")}`
                : group.description || `Created by ${group.creatorLabel}`;

            return (
              <GroupRow
                badge={group.accessType === "private" ? "Private" : "Public"}
                actionLabel={group.creatorId === userId ? "Delete" : undefined}
                actionLoading={deletingGroupId === group.id}
                actionVariant="danger"
                group={group}
                key={group.id}
                onActionPress={
                  group.creatorId === userId ? () => openDeleteModal(group) : undefined
                }
                onPress={() => openGroupChat(group.id)}
                preview={previewText}
                rightMeta={formatRelativeTime(group.updatedAtMs ?? group.createdAtMs)}
              />
            );
          })
        )}

        {!searchQuery.trim() ? (
          <View style={styles.sectionBlock}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Public groups</Text>
              <Text style={styles.sectionMeta}>{publicGroups.length} available</Text>
            </View>

            {publicGroups.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateTitle}>Няма public групи</Text>
                <Text style={styles.emptyStateText}>
                  Първата public група ще се появи тук и ще може да бъде намирана през search.
                </Text>
              </View>
            ) : (
              publicGroups
                .filter((group) => !group.memberIds.includes(userId))
                .slice(0, 5)
                .map((group) => (
                  <GroupRow
                    actionLabel="Join"
                    actionLoading={joiningGroupId === group.id}
                    badge="Public"
                    group={group}
                    key={`discover-${group.id}`}
                    onActionPress={() => joinGroup(group.id)}
                    onPress={() => openGroupChat(group.id)}
                    preview={group.description || `Created by ${group.creatorLabel}`}
                    rightMeta={formatRelativeTime(group.updatedAtMs ?? group.createdAtMs)}
                  />
                ))
            )}
          </View>
        ) : null}
      </ScrollView>
      </KeyboardAvoidingView>
      </DismissKeyboard>

      <Modal
        animationType="fade"
        onRequestClose={() => setActionMenuVisible(false)}
        transparent
        visible={actionMenuVisible}
      >
        <View style={styles.actionMenuBackdrop}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setActionMenuVisible(false)}
            style={styles.actionMenuDismissArea}
          />
          <View style={styles.actionMenuCard}>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => openComposer()}
              style={styles.actionMenuItem}
            >
              <View style={styles.actionMenuIconWrap}>
                <MaterialIcons color="#FFFFFF" name="group-add" size={18} />
              </View>
              <View style={styles.actionMenuTextWrap}>
                <Text style={styles.actionMenuTitle}>Create group</Text>
                <Text style={styles.actionMenuSubtitle}>
                  Create a new public or private group.
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => {
                setActionMenuVisible(false);
                setJoinKeyModalVisible(true);
              }}
              style={styles.actionMenuItem}
            >
              <View style={[styles.actionMenuIconWrap, styles.actionMenuIconWrapAlt]}>
                <MaterialIcons color="#FFFFFF" name="vpn-key" size={18} />
              </View>
              <View style={styles.actionMenuTextWrap}>
                <Text style={styles.actionMenuTitle}>Use private key</Text>
                <Text style={styles.actionMenuSubtitle}>
                  Join a private group with the creator&apos;s key.
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.9}
              onPress={openRequestComposer}
              style={styles.actionMenuItem}
            >
              <View style={[styles.actionMenuIconWrap, styles.actionMenuIconWrapRequest]}>
                <MaterialIcons color="#FFFFFF" name="tips-and-updates" size={18} />
              </View>
              <View style={styles.actionMenuTextWrap}>
                <Text style={styles.actionMenuTitle}>Create trip request</Text>
                <Text style={styles.actionMenuSubtitle}>
                  Post a travel idea and collect interested people first.
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        onRequestClose={() => {
          if (deletingGroupId) {
            return;
          }

          setDeleteModalVisible(false);
          setGroupPendingDelete(null);
        }}
        transparent
        visible={deleteModalVisible}
      >
        <View style={[styles.modalBackdrop, { backgroundColor: colors.modalOverlay }]}>
          <View style={styles.joinKeyModalSheet}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Delete group</Text>
                <Text style={styles.modalSubtitle}>
                  Only the creator can remove an outdated group for everyone.
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.9}
                disabled={!!deletingGroupId}
                onPress={() => {
                  setDeleteModalVisible(false);
                  setGroupPendingDelete(null);
                }}
                style={styles.modalClose}
              >
                <MaterialIcons color="#374151" name="close" size={22} />
              </TouchableOpacity>
            </View>

            <View style={styles.deleteSummaryCard}>
              <Text style={styles.deleteSummaryTitle}>{groupPendingDelete?.name ?? "Group"}</Text>
              <Text style={styles.deleteSummaryText}>
                This will permanently remove the group chat and all messages for every member.
              </Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.9}
              disabled={!!deletingGroupId}
              onPress={() => {
                void handleDeleteGroup();
              }}
              style={[
                styles.createButton,
                styles.deleteButton,
                deletingGroupId && styles.createButtonDisabled,
              ]}
            >
              <Text style={styles.createButtonText}>
                {deletingGroupId ? "Deleting..." : "Delete group"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        onRequestClose={() => setJoinKeyModalVisible(false)}
        transparent
        visible={joinKeyModalVisible}
      >
        <View style={[styles.modalBackdrop, { backgroundColor: colors.modalOverlay }]}>
          <View style={styles.joinKeyModalSheet}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Join with private key</Text>
                <Text style={styles.modalSubtitle}>
                  Paste the key shared by the group creator.
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => setJoinKeyModalVisible(false)}
                style={styles.modalClose}
              >
                <MaterialIcons color="#374151" name="close" size={22} />
              </TouchableOpacity>
            </View>

            <TextInput
              autoCapitalize="characters"
              onChangeText={(value) => {
                setJoinKeyValue(normalizeGroupJoinKey(value));
                clearFeedback();
              }}
              placeholder="Enter private key"
              placeholderTextColor="#9CA3AF"
              style={styles.modalInput}
              value={joinKeyValue}
            />

            <TouchableOpacity
              activeOpacity={0.9}
              disabled={joiningByKey}
              onPress={handleJoinByKey}
              style={[styles.createButton, joiningByKey && styles.createButtonDisabled]}
            >
              <Text style={styles.createButtonText}>
                {joiningByKey ? "Joining..." : "Join group"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        onRequestClose={() => setComposerVisible(false)}
        transparent
        visible={composerVisible}
      >
        <View style={[styles.modalBackdrop, { backgroundColor: colors.modalOverlay }]}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>New group</Text>
                <Text style={styles.modalSubtitle}>
                  Pick public users, choose access, and create the chat.
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => setComposerVisible(false)}
                style={styles.modalClose}
              >
                <MaterialIcons color="#374151" name="close" size={22} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <TextInput
                onChangeText={setGroupName}
                placeholder="Group name"
                placeholderTextColor="#9CA3AF"
                style={styles.modalInput}
                value={groupName}
              />

              <TextInput
                multiline
                numberOfLines={4}
                onChangeText={setGroupDescription}
                placeholder="What is this group about?"
                placeholderTextColor="#9CA3AF"
                style={[styles.modalInput, styles.modalTextarea]}
                textAlignVertical="top"
                value={groupDescription}
              />

              <View style={styles.accessRow}>
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => {
                    setGroupAccess("public");
                    setGroupJoinKey("");
                  }}
                  style={[
                    styles.accessChip,
                    groupAccess === "public" && styles.accessChipSelected,
                  ]}
                >
                  <MaterialIcons
                    color={groupAccess === "public" ? "#FFFFFF" : "#6B7280"}
                    name="public"
                    size={16}
                  />
                  <Text
                    style={[
                      styles.accessChipText,
                      groupAccess === "public" && styles.accessChipTextSelected,
                    ]}
                  >
                    Public
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => {
                    setGroupAccess("private");
                    if (!groupJoinKey) {
                      setGroupJoinKey(createSuggestedGroupKey());
                    }
                  }}
                  style={[
                    styles.accessChip,
                    groupAccess === "private" && styles.accessChipSelectedPrivate,
                  ]}
                >
                  <MaterialIcons
                    color={groupAccess === "private" ? "#FFFFFF" : "#6B7280"}
                    name="lock-outline"
                    size={16}
                  />
                  <Text
                    style={[
                      styles.accessChipText,
                      groupAccess === "private" && styles.accessChipTextSelected,
                    ]}
                  >
                    Private
                  </Text>
                </TouchableOpacity>
              </View>

              {groupAccess === "private" ? (
                <View style={styles.privateKeyComposerCard}>
                  <View style={styles.privateKeyRow}>
                    <Text style={styles.privateKeyLabel}>Private key</Text>
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() => setGroupJoinKey(createSuggestedGroupKey())}
                    >
                      <Text style={styles.privateKeyGenerate}>Generate</Text>
                    </TouchableOpacity>
                  </View>
                  <TextInput
                    autoCapitalize="characters"
                    onChangeText={(value) => setGroupJoinKey(normalizeGroupJoinKey(value))}
                    placeholder="TEAM2026"
                    placeholderTextColor="#9CA3AF"
                    style={styles.modalInput}
                    value={groupJoinKey}
                  />
                </View>
              ) : null}

              <Text style={styles.inviteTitle}>Invite public users</Text>

              {selectedInviteIds.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.selectedInvitesRow}
                >
                  {selectedInviteIds.map((inviteId) => {
                    const invitedProfile = publicProfilesById[inviteId];

                    if (!invitedProfile) {
                      return null;
                    }

                    return (
                      <TouchableOpacity
                        activeOpacity={0.9}
                        key={inviteId}
                        onPress={() => toggleInvite(inviteId)}
                        style={styles.selectedInviteChip}
                      >
                        <Avatar
                          label={invitedProfile.displayName}
                          photoUrl={invitedProfile.photoUrl}
                          size={36}
                        />
                        <Text style={styles.selectedInviteText}>
                          {invitedProfile.username || invitedProfile.displayName}
                        </Text>
                        <MaterialIcons color="#6B7280" name="close" size={16} />
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              ) : null}

              <TextInput
                onChangeText={setInviteSearchQuery}
                placeholder="Search public users"
                placeholderTextColor="#9CA3AF"
                style={styles.modalInput}
                value={inviteSearchQuery}
              />

              {filteredInviteProfiles.length === 0 ? (
                <View style={styles.modalEmptyState}>
                  <Text style={styles.modalEmptyStateTitle}>Няма users за показване</Text>
                  <Text style={styles.modalEmptyStateText}>
                    Покажи public профили от Profile таба или промени search-а.
                  </Text>
                </View>
              ) : (
                filteredInviteProfiles.map((profile) => (
                  <ComposerUserRow
                    key={profile.id}
                    onPress={() => toggleInvite(profile.uid)}
                    profile={profile}
                    selected={selectedInviteIds.includes(profile.uid)}
                  />
                ))
              )}
            </ScrollView>

            <TouchableOpacity
              activeOpacity={0.9}
              disabled={savingGroup}
              onPress={handleCreateGroup}
              style={[styles.createButton, savingGroup && styles.createButtonDisabled]}
            >
              <Text style={styles.createButtonText}>
                {savingGroup ? "Creating..." : "Create group"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        onRequestClose={() => setRequestComposerVisible(false)}
        transparent
        visible={requestComposerVisible}
      >
        <View style={[styles.modalBackdrop, { backgroundColor: colors.modalOverlay }]}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>New trip request</Text>
                <Text style={styles.modalSubtitle}>
                  Tell the group tab where you want to go and what kind of people you want with you.
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => setRequestComposerVisible(false)}
                style={styles.modalClose}
              >
                <MaterialIcons color="#374151" name="close" size={22} />
              </TouchableOpacity>
            </View>

            {error ? (
              <View
                style={[
                  styles.feedbackCardError,
                  { backgroundColor: colors.errorBackground, borderColor: colors.errorBorder },
                ]}
              >
                <Text style={[styles.feedbackTextError, { color: colors.errorText }]}>{error}</Text>
              </View>
            ) : null}

            {successMessage ? (
              <View
                style={[
                  styles.feedbackCardSuccess,
                  { backgroundColor: colors.successBackground, borderColor: colors.successBorder },
                ]}
              >
                <Text style={[styles.feedbackTextSuccess, { color: colors.successText }]}>
                  {successMessage}
                </Text>
              </View>
            ) : null}

            <ScrollView showsVerticalScrollIndicator={false}>
              <TextInput
                onChangeText={setRequestDestination}
                placeholder="Destination"
                placeholderTextColor="#9CA3AF"
                style={styles.modalInput}
                value={requestDestination}
              />

              <View style={styles.requestInputGrid}>
                <TextInput
                  onChangeText={setRequestBudget}
                  placeholder="Budget"
                  placeholderTextColor="#9CA3AF"
                  style={[styles.modalInput, styles.requestGridInput]}
                  value={requestBudget}
                />
                <TextInput
                  onChangeText={setRequestTiming}
                  placeholder="When"
                  placeholderTextColor="#9CA3AF"
                  style={[styles.modalInput, styles.requestGridInput]}
                  value={requestTiming}
                />
              </View>

              <TextInput
                onChangeText={setRequestTravelers}
                placeholder="How many people"
                placeholderTextColor="#9CA3AF"
                style={styles.modalInput}
                value={requestTravelers}
              />

              <TextInput
                multiline
                numberOfLines={4}
                onChangeText={setRequestNote}
                placeholder="What kind of trip is it? Food, beaches, budget vibe, roadtrip energy..."
                placeholderTextColor="#9CA3AF"
                style={[styles.modalInput, styles.modalTextarea]}
                textAlignVertical="top"
                value={requestNote}
              />

              <View style={styles.requestPreviewCard}>
                <Text style={styles.requestPreviewKicker}>Preview</Text>
                <Text style={styles.requestPreviewTitle}>
                  {requestDestination.trim() || "Your next trip idea"}
                </Text>
                <View style={styles.requestPreviewChips}>
                  <View style={styles.requestPreviewChip}>
                    <Text style={styles.requestPreviewChipText}>
                      {requestBudget.trim() || "Open budget"}
                    </Text>
                  </View>
                  <View style={styles.requestPreviewChip}>
                    <Text style={styles.requestPreviewChipText}>
                      {requestTiming.trim() || "Flexible timing"}
                    </Text>
                  </View>
                  <View style={styles.requestPreviewChip}>
                    <Text style={styles.requestPreviewChipText}>
                      {requestTravelers.trim() || "2-4 people"}
                    </Text>
                  </View>
                </View>
                <Text style={styles.requestPreviewNote}>
                  {requestNote.trim() ||
                    "People will see this inside Groups and can mark themselves as interested before you open a full chat."}
                </Text>
              </View>
            </ScrollView>

            <TouchableOpacity
              activeOpacity={0.9}
              disabled={savingTripRequest}
              onPress={handleCreateTripRequest}
              style={[styles.createButton, savingTripRequest && styles.createButtonDisabled]}
            >
              <Text style={styles.createButtonText}>
                {savingTripRequest ? "Publishing..." : "Publish request"}
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
  content: {
    alignSelf: "center",
    maxWidth: 980,
    paddingBottom: 128,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    width: "100%",
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
    minHeight: 56,
    borderRadius: Radius.lg,
  },
  topBarTextWrap: {
    flex: 1,
    paddingRight: Spacing.lg,
  },
  pageTitle: {
    color: "#1A1A1A",
    ...TypeScale.displayMd,
  },
  pageSubtitle: {
    ...TypeScale.bodyMd,
    color: "#6B7280",
    marginTop: 6,
  },
  topBarCircleButton: {
    alignItems: "center",
    backgroundColor: "#2D6A4F",
    borderColor: "#D1D5DB",
    borderRadius: Radius["3xl"],
    borderWidth: 3,
    height: 56,
    justifyContent: "center",
    ...shadow("lg"),
    width: 56,
  },
  searchShell: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E8E8E8",
    borderRadius: Radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  searchInput: {
    color: "#1A1A1A",
    flex: 1,
    ...TypeScale.bodyLg,
    marginLeft: Spacing.md,
  },
  feedbackCardError: {
    backgroundColor: "#FFF1EF",
    borderColor: "#F0B6AE",
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginBottom: Spacing.md,
    padding: Spacing.md,
  },
  feedbackTextError: {
    ...TypeScale.bodyMd,
    color: "#991B1B",
  },
  feedbackCardSuccess: {
    backgroundColor: "#F0FFF4",
    borderColor: "#A7F3D0",
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginBottom: Spacing.md,
    padding: Spacing.md,
  },
  feedbackTextSuccess: {
    ...TypeScale.bodyMd,
    color: "#2D6A4F",
  },
  storiesRow: {
    marginBottom: Spacing.lg,
  },
  storiesContent: {
    gap: Spacing.md,
    paddingRight: Spacing.md,
  },
  storyButton: {
    alignItems: "center",
    width: 88,
  },
  avatarWrap: {
    alignItems: "center",
  },
  avatarImage: {
    backgroundColor: "#F5F5F5",
    height: "100%",
    width: "100%",
  },
  avatarCircle: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarText: {
    color: "#FFFFFF",
    fontWeight: FontWeight.extrabold,
  },
  avatarSubtitle: {
    ...TypeScale.labelLg,
    color: "#9CA3AF",
    marginTop: Spacing.xs,
  },
  storyLabel: {
    ...TypeScale.bodyMd,
    color: "#1A1A1A",
    fontWeight: FontWeight.bold,
    marginTop: Spacing.sm,
    textAlign: "center",
  },
  storyHint: {
    ...TypeScale.labelLg,
    color: "#9CA3AF",
    marginTop: Spacing.xs,
    textAlign: "center",
  },
  sectionBlock: {
    marginTop: Spacing.md,
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
    marginTop: Spacing.sm,
    borderRadius: 1,
  },
  sectionTitle: {
    ...TypeScale.headingMd,
    color: "#1A1A1A",
    fontWeight: FontWeight.extrabold,
  },
  sectionMeta: {
    ...TypeScale.bodyMd,
    color: "#6B7280",
    fontWeight: FontWeight.bold,
  },
  sectionSupportText: {
    ...TypeScale.bodyMd,
    marginBottom: Spacing.xs,
  },
  requestCardsContent: {
    paddingRight: Spacing.xl,
  },
  requestCard: {
    borderRadius: Radius["3xl"],
    borderWidth: 1,
    marginRight: Spacing.md,
    minHeight: 252,
    padding: Spacing.lg,
    ...shadow("lg"),
    width: 300,
  },
  requestCardTopRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  requestCardTitleWrap: {
    flex: 1,
    paddingRight: Spacing.md,
  },
  requestCardEyebrow: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  requestCardTitle: {
    ...TypeScale.headingLg,
    fontWeight: FontWeight.extrabold,
    marginTop: 6,
  },
  requestCardCreator: {
    ...TypeScale.bodyMd,
    marginTop: Spacing.sm,
  },
  requestCountBadge: {
    alignItems: "center",
    borderRadius: Radius.full,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  requestCountText: {
    ...TypeScale.bodySm,
    fontWeight: FontWeight.extrabold,
  },
  requestChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  requestChip: {
    alignItems: "center",
    borderRadius: Radius.full,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  requestChipText: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.bold,
  },
  requestCardNote: {
    flex: 1,
    ...TypeScale.bodyMd,
    marginTop: Spacing.md,
  },
  requestCardFooter: {
    marginTop: Spacing.lg,
  },
  requestFooterText: {
    ...TypeScale.bodySm,
  },
  requestActionsRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  requestPrimaryButton: {
    alignItems: "center",
    borderRadius: Radius.lg,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: Spacing.md,
  },
  requestPrimaryButtonText: {
    ...TypeScale.bodyMd,
    color: "#FFFFFF",
    fontWeight: FontWeight.extrabold,
  },
  requestSecondaryButton: {
    alignItems: "center",
    borderRadius: Radius.lg,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: Spacing.md,
  },
  requestSecondaryButtonText: {
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.extrabold,
  },
  requestButtonDisabled: {
    opacity: 0.65,
  },
  requestEmptyState: {
    alignItems: "center",
    borderRadius: Radius["3xl"],
    borderWidth: 1,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing["2xl"],
  },
  requestEmptyIcon: {
    alignItems: "center",
    borderRadius: Radius.xl,
    borderWidth: 1,
    height: 62,
    justifyContent: "center",
    width: 62,
  },
  requestEmptyTitle: {
    ...TypeScale.headingSm,
    fontWeight: FontWeight.extrabold,
    marginTop: Spacing.md,
    textAlign: "center",
  },
  requestEmptyText: {
    ...TypeScale.bodyMd,
    marginTop: Spacing.sm,
    textAlign: "center",
  },
  inlineCreateRequestButton: {
    alignItems: "center",
    borderRadius: Radius.lg,
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  inlineCreateRequestButtonText: {
    ...TypeScale.bodyMd,
    color: "#FFFFFF",
    fontWeight: FontWeight.extrabold,
  },
  groupRow: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E8E8E8",
    borderRadius: Radius["2xl"],
    borderWidth: 1,
    flexDirection: "row",
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    ...shadow("sm"),
  },
  groupRowTextWrap: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  groupRowTitleRow: {
    alignItems: "center",
    flexDirection: "row",
  },
  groupRowTitle: {
    ...TypeScale.titleLg,
    color: "#1A1A1A",
    flex: 1,
    fontWeight: FontWeight.extrabold,
    marginRight: Spacing.md,
  },
  groupRowTime: {
    ...TypeScale.bodySm,
    color: "#9CA3AF",
  },
  groupRowPreview: {
    ...TypeScale.bodyMd,
    color: "#6B7280",
    marginTop: Spacing.xs,
  },
  groupRowMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  groupTypeBadge: {
    alignItems: "center",
    backgroundColor: "#F0F0F0",
    borderRadius: Radius.full,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
  },
  groupTypeBadgePrivate: {
    backgroundColor: "#FFF7ED",
  },
  groupTypeBadgeText: {
    ...TypeScale.labelLg,
    color: "#2D6A4F",
    fontWeight: FontWeight.extrabold,
  },
  groupTypeBadgeTextPrivate: {
    color: "#92400E",
  },
  groupMembersText: {
    ...TypeScale.labelLg,
    color: "#6B7280",
    fontWeight: FontWeight.bold,
  },
  rowActionButton: {
    alignItems: "center",
    backgroundColor: "#2D6A4F",
    borderRadius: Radius.md,
    justifyContent: "center",
    marginLeft: Spacing.sm,
    minWidth: 66,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  rowActionButtonDanger: {
    backgroundColor: "#B84B3A",
  },
  rowActionText: {
    ...TypeScale.bodySm,
    color: "#FFFFFF",
    fontWeight: FontWeight.extrabold,
  },
  emptyState: {
    alignItems: "center",
    backgroundColor: "#F8F8F8",
    borderColor: "#E8E8E8",
    borderRadius: Radius["2xl"],
    borderWidth: 1,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing["2xl"],
  },
  emptyStateTitle: {
    ...TypeScale.titleLg,
    color: "#1A1A1A",
    fontWeight: FontWeight.extrabold,
    textAlign: "center",
  },
  emptyStateText: {
    ...TypeScale.bodyMd,
    color: "#6B7280",
    marginTop: Spacing.sm,
    textAlign: "center",
  },
  modalBackdrop: {
    backgroundColor: "rgba(0,0,0,0.25)",
    flex: 1,
    justifyContent: "flex-end",
  },
  actionMenuBackdrop: {
    backgroundColor: "rgba(0,0,0,0.15)",
    flex: 1,
    justifyContent: "flex-start",
    paddingHorizontal: Spacing.xl,
    paddingTop: 80,
  },
  actionMenuDismissArea: {
    ...StyleSheet.absoluteFillObject,
  },
  actionMenuCard: {
    alignSelf: "flex-end",
    backgroundColor: "#FFFFFF",
    borderColor: "#E8E8E8",
    borderRadius: Radius.xl,
    borderWidth: 1,
    minWidth: 300,
    padding: Spacing.md,
    ...shadow("lg"),
  },
  actionMenuItem: {
    alignItems: "center",
    borderRadius: Radius.lg,
    flexDirection: "row",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  actionMenuIconWrap: {
    alignItems: "center",
    backgroundColor: "#2D6A4F",
    borderRadius: Radius.lg,
    height: Spacing["3xl"],
    justifyContent: "center",
    width: Spacing["3xl"],
  },
  actionMenuIconWrapAlt: {
    backgroundColor: "#BA7517",
  },
  actionMenuIconWrapRequest: {
    backgroundColor: "#246A7A",
  },
  actionMenuTextWrap: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  actionMenuTitle: {
    ...TypeScale.titleSm,
    color: "#1A1A1A",
    fontWeight: FontWeight.extrabold,
  },
  actionMenuSubtitle: {
    ...TypeScale.bodySm,
    color: "#6B7280",
    marginTop: 3,
  },
  modalSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: Radius["3xl"],
    borderTopRightRadius: Radius["3xl"],
    maxHeight: "88%",
    paddingBottom: Radius["3xl"],
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  joinKeyModalSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: Radius["3xl"],
    borderTopRightRadius: Radius["3xl"],
    paddingBottom: Radius["3xl"],
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  deleteSummaryCard: {
    backgroundColor: "#FFF1EF",
    borderColor: "#F0B6AE",
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginTop: Spacing.sm,
    padding: Spacing.md,
  },
  deleteSummaryTitle: {
    ...TypeScale.titleLg,
    color: "#991B1B",
    fontWeight: FontWeight.extrabold,
  },
  deleteSummaryText: {
    ...TypeScale.bodyMd,
    color: "#991B1B",
    marginTop: Spacing.sm,
  },
  modalHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.lg,
  },
  modalTitle: {
    ...TypeScale.headingLg,
    color: "#1A1A1A",
    fontWeight: FontWeight.extrabold,
  },
  modalSubtitle: {
    ...TypeScale.bodyMd,
    color: "#6B7280",
    marginTop: Spacing.xs,
  },
  modalClose: {
    alignItems: "center",
    backgroundColor: "#F5F5F5",
    borderRadius: Radius.full,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  modalInput: {
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
  modalTextarea: {
    minHeight: 94,
  },
  requestInputGrid: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  requestGridInput: {
    flex: 1,
  },
  requestPreviewCard: {
    backgroundColor: "#F8F8F8",
    borderColor: "#E8E8E8",
    borderRadius: Radius.xl,
    borderWidth: 1,
    marginTop: Spacing.lg,
    padding: Spacing.lg,
  },
  requestPreviewKicker: {
    ...TypeScale.labelLg,
    color: "#2D6A4F",
    fontWeight: FontWeight.extrabold,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  requestPreviewTitle: {
    ...TypeScale.headingMd,
    color: "#1A1A1A",
    fontWeight: FontWeight.extrabold,
    marginTop: 6,
  },
  requestPreviewChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  requestPreviewChip: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E8E8E8",
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  requestPreviewChipText: {
    ...TypeScale.labelLg,
    color: "#6B7280",
    fontWeight: FontWeight.bold,
  },
  requestPreviewNote: {
    ...TypeScale.bodyMd,
    color: "#6B7280",
    marginTop: Spacing.md,
  },
  accessRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  accessChip: {
    alignItems: "center",
    backgroundColor: "#F5F5F5",
    borderRadius: Radius.full,
    flex: 1,
    flexDirection: "row",
    gap: Spacing.sm,
    justifyContent: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  accessChipSelected: {
    backgroundColor: "#2D6A4F",
  },
  accessChipSelectedPrivate: {
    backgroundColor: "#BA7517",
  },
  accessChipText: {
    ...TypeScale.bodyMd,
    color: "#6B7280",
    fontWeight: FontWeight.bold,
  },
  accessChipTextSelected: {
    color: "#FFFFFF",
  },
  privateKeyComposerCard: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FCD34D",
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginTop: Spacing.md,
    padding: Spacing.md,
  },
  privateKeyRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  privateKeyLabel: {
    ...TypeScale.bodyMd,
    color: "#92400E",
    fontWeight: FontWeight.extrabold,
  },
  privateKeyGenerate: {
    ...TypeScale.bodySm,
    color: "#2D6A4F",
    fontWeight: FontWeight.bold,
  },
  inviteTitle: {
    ...TypeScale.titleMd,
    color: "#1A1A1A",
    fontWeight: FontWeight.extrabold,
    marginTop: Spacing.lg,
  },
  selectedInvitesRow: {
    marginTop: Spacing.md,
    maxHeight: 62,
  },
  selectedInviteChip: {
    alignItems: "center",
    backgroundColor: "#F5F5F5",
    borderRadius: Radius.full,
    flexDirection: "row",
    gap: Spacing.sm,
    marginRight: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  selectedInviteText: {
    ...TypeScale.bodySm,
    color: "#1A1A1A",
    fontWeight: FontWeight.bold,
  },
  composerUserRow: {
    alignItems: "center",
    backgroundColor: "#F8F8F8",
    borderColor: "#E8E8E8",
    borderRadius: Radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  composerUserTextWrap: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  composerUserName: {
    ...TypeScale.titleMd,
    color: "#1A1A1A",
    fontWeight: FontWeight.extrabold,
  },
  composerUserMeta: {
    ...TypeScale.bodySm,
    color: "#6B7280",
    marginTop: Spacing.xs,
  },
  selectBubble: {
    borderColor: "#D1D5DB",
    borderRadius: Radius.md,
    borderWidth: 1,
    height: Spacing["2xl"],
    width: Spacing["2xl"],
  },
  selectBubbleSelected: {
    alignItems: "center",
    backgroundColor: "#2D6A4F",
    borderColor: "#2D6A4F",
    justifyContent: "center",
  },
  modalEmptyState: {
    alignItems: "center",
    backgroundColor: "#F8F8F8",
    borderColor: "#E8E8E8",
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
  },
  modalEmptyStateTitle: {
    ...TypeScale.titleMd,
    color: "#1A1A1A",
    fontWeight: FontWeight.extrabold,
    textAlign: "center",
  },
  modalEmptyStateText: {
    ...TypeScale.bodyMd,
    color: "#6B7280",
    marginTop: Spacing.sm,
    textAlign: "center",
  },
  createButton: {
    alignItems: "center",
    backgroundColor: "#2D6A4F",
    borderRadius: Radius.lg,
    justifyContent: "center",
    marginTop: Spacing.lg,
    minHeight: 54,
  },
  createButtonDisabled: {
    opacity: 0.7,
  },
  deleteButton: {
    backgroundColor: "#B84B3A",
  },
  createButtonText: {
    ...TypeScale.titleSm,
    color: "#FFFFFF",
    fontWeight: FontWeight.extrabold,
  },
});
