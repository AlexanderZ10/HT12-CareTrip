import { FirebaseError } from "firebase/app";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
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
  createSuggestedGroupKey,
  normalizeGroupJoinKey,
  parseTravelGroup,
  sortGroupsByCreatedAt,
  type GroupAccessType,
  type TravelGroup,
} from "../../utils/groups";
import { getProfileDisplayName } from "../../utils/profile-info";
import {
  parsePublicProfile,
  type PublicProfile,
} from "../../utils/public-profiles";

type AvatarProps = {
  label: string;
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
  badge?: string;
  group: TravelGroup;
  onActionPress?: () => void;
  onPress?: () => void;
  preview: string;
  rightMeta: string;
};

function sanitizeString(value: string) {
  return value.trim().toLowerCase();
}

function getGroupsErrorMessage(error: unknown, action: "read" | "write") {
  if (!(error instanceof FirebaseError)) {
    return action === "write"
      ? "Не успяхме да запазим групата. Опитай отново."
      : "Не успяхме да заредим групите. Опитай отново.";
  }

  switch (error.code) {
    case "permission-denied":
      return action === "write"
        ? "Firestore rules блокират промяната на групите. Обнови правилата и опитай пак."
        : "Firestore rules блокират зареждането на групите. Обнови правилата и опитай пак.";
    case "failed-precondition":
      return "Firestore Database още не е създадена. Създай Firestore Database в Firebase Console.";
    case "unavailable":
      return "Firestore в момента не е достъпен. Опитай пак след малко.";
    default:
      return action === "write"
        ? "Не успяхме да запазим групата. Опитай отново."
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

function Avatar({ label, size = 72, subtitle }: AvatarProps) {
  return (
    <View style={styles.avatarWrap}>
      <View
        style={[
          styles.avatarCircle,
          { backgroundColor: getAvatarColor(label), height: size, width: size, borderRadius: size / 2 },
        ]}
      >
        <Text style={[styles.avatarText, { fontSize: Math.max(16, size * 0.26) }]}>
          {getInitials(label)}
        </Text>
      </View>
      {subtitle ? <Text style={styles.avatarSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

function ComposerUserRow({ profile, selected, onPress }: ComposerUserRowProps) {
  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={styles.composerUserRow}>
      <Avatar label={profile.displayName || profile.username || "Traveler"} size={48} />
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
      <Avatar label={avatarLabel} size={58} />
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
              color={isPrivate ? "#F5C979" : "#9FD7FF"}
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
          style={styles.rowActionButton}
        >
          <Text style={styles.rowActionText}>
            {actionLoading ? "..." : actionLabel}
          </Text>
        </TouchableOpacity>
      ) : null}
    </TouchableOpacity>
  );
}

export default function GroupsTabScreen() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [loadingPublicProfiles, setLoadingPublicProfiles] = useState(true);
  const [savingGroup, setSavingGroup] = useState(false);
  const [joiningGroupId, setJoiningGroupId] = useState<string | null>(null);
  const [joiningByKey, setJoiningByKey] = useState(false);

  const [profileName, setProfileName] = useState("Traveler");
  const [username, setUsername] = useState("");
  const [groups, setGroups] = useState<TravelGroup[]>([]);
  const [publicProfiles, setPublicProfiles] = useState<PublicProfile[]>([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [joinKeyValue, setJoinKeyValue] = useState("");
  const [actionMenuVisible, setActionMenuVisible] = useState(false);
  const [joinKeyModalVisible, setJoinKeyModalVisible] = useState(false);

  const [composerVisible, setComposerVisible] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [groupAccess, setGroupAccess] = useState<GroupAccessType>("public");
  const [groupJoinKey, setGroupJoinKey] = useState("");
  const [inviteSearchQuery, setInviteSearchQuery] = useState("");
  const [selectedInviteIds, setSelectedInviteIds] = useState<string[]>([]);

  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;
    let unsubscribeGroups: (() => void) | null = null;
    let unsubscribePublicProfiles: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (nextUser) => {
      unsubscribeProfile?.();
      unsubscribeGroups?.();
      unsubscribePublicProfiles?.();
      unsubscribeProfile = null;
      unsubscribeGroups = null;
      unsubscribePublicProfiles = null;

      if (!nextUser) {
        setUser(null);
        setGroups([]);
        setPublicProfiles([]);
        setLoadingProfile(false);
        setLoadingGroups(false);
        setLoadingPublicProfiles(false);
        router.replace("/login");
        return;
      }

      setUser(nextUser);
      setLoadingProfile(true);
      setLoadingGroups(true);
      setLoadingPublicProfiles(true);
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
    });

    return () => {
      unsubscribeProfile?.();
      unsubscribeGroups?.();
      unsubscribePublicProfiles?.();
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
          memberIds: nextMemberIds,
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
        memberIds: [user.uid],
        name: trimmedName,
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

  const loading = loadingProfile || loadingGroups || loadingPublicProfiles;

  if (loading) {
    return (
      <SafeAreaView style={styles.loader} edges={["top", "left", "right"]}>
        <ActivityIndicator size="large" color="#5C8C1F" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <View style={styles.topBarTextWrap}>
            <Text style={styles.pageTitle}>Groups</Text>
            <Text style={styles.pageSubtitle}>@{userHandle} • {profileName}</Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => setActionMenuVisible(true)}
            style={styles.topBarCircleButton}
          >
            <MaterialIcons color="#FFFFFF" name="add" size={28} />
          </TouchableOpacity>
        </View>

        <View style={styles.searchShell}>
          <MaterialIcons color="#7B8A6D" name="search" size={24} />
          <TextInput
            onChangeText={(value) => {
              setSearchQuery(value);
              clearFeedback();
            }}
            placeholder="Search public groups"
            placeholderTextColor="#809071"
            style={styles.searchInput}
            value={searchQuery}
          />
        </View>

        {error ? (
          <View style={styles.feedbackCardError}>
            <Text style={styles.feedbackTextError}>{error}</Text>
          </View>
        ) : null}

        {successMessage ? (
          <View style={styles.feedbackCardSuccess}>
            <Text style={styles.feedbackTextSuccess}>{successMessage}</Text>
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
                group={group}
                key={group.id}
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
          </View>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        onRequestClose={() => setJoinKeyModalVisible(false)}
        transparent
        visible={joinKeyModalVisible}
      >
        <View style={styles.modalBackdrop}>
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
                <MaterialIcons color="#3E5B21" name="close" size={22} />
              </TouchableOpacity>
            </View>

            <TextInput
              autoCapitalize="characters"
              onChangeText={(value) => {
                setJoinKeyValue(normalizeGroupJoinKey(value));
                clearFeedback();
              }}
              placeholder="Enter private key"
              placeholderTextColor="#809071"
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
        <View style={styles.modalBackdrop}>
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
                <MaterialIcons color="#3E5B21" name="close" size={22} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <TextInput
                onChangeText={setGroupName}
                placeholder="Group name"
                placeholderTextColor="#809071"
                style={styles.modalInput}
                value={groupName}
              />

              <TextInput
                multiline
                numberOfLines={4}
                onChangeText={setGroupDescription}
                placeholder="What is this group about?"
                placeholderTextColor="#809071"
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
                    color={groupAccess === "public" ? "#FFFFFF" : "#6C7D58"}
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
                    color={groupAccess === "private" ? "#FFFFFF" : "#6C7D58"}
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
                    placeholderTextColor="#809071"
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
                        <Avatar label={invitedProfile.displayName} size={36} />
                        <Text style={styles.selectedInviteText}>
                          {invitedProfile.username || invitedProfile.displayName}
                        </Text>
                        <MaterialIcons color="#6C7D58" name="close" size={16} />
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              ) : null}

              <TextInput
                onChangeText={setInviteSearchQuery}
                placeholder="Search public users"
                placeholderTextColor="#809071"
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
  content: {
    alignSelf: "center",
    maxWidth: 980,
    paddingBottom: 128,
    paddingHorizontal: 20,
    paddingTop: 12,
    width: "100%",
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
    minHeight: 56,
  },
  topBarTextWrap: {
    flex: 1,
    paddingRight: 16,
  },
  pageTitle: {
    color: "#29440F",
    fontSize: 30,
    fontWeight: "800",
    lineHeight: 36,
  },
  pageSubtitle: {
    color: "#5F6E53",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
  topBarCircleButton: {
    alignItems: "center",
    backgroundColor: "#5C8C1F",
    borderColor: "#D6E8AE",
    borderRadius: 28,
    borderWidth: 3,
    height: 56,
    justifyContent: "center",
    shadowColor: "#1E2A12",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    width: 56,
  },
  searchShell: {
    alignItems: "center",
    backgroundColor: "#FAFCF5",
    borderColor: "#DDE8C7",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchInput: {
    color: "#29440F",
    flex: 1,
    fontSize: 16,
    marginLeft: 12,
  },
  feedbackCardError: {
    backgroundColor: "#FFF1EF",
    borderColor: "#F0B6AE",
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
    padding: 12,
  },
  feedbackTextError: {
    color: "#8A3D35",
    fontSize: 14,
    lineHeight: 20,
  },
  feedbackCardSuccess: {
    backgroundColor: "#F3F9E6",
    borderColor: "#C9DF98",
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
    padding: 12,
  },
  feedbackTextSuccess: {
    color: "#3B6D11",
    fontSize: 14,
    lineHeight: 20,
  },
  storiesRow: {
    marginBottom: 18,
  },
  storiesContent: {
    gap: 14,
    paddingRight: 12,
  },
  storyButton: {
    alignItems: "center",
    width: 88,
  },
  avatarWrap: {
    alignItems: "center",
  },
  avatarCircle: {
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  avatarSubtitle: {
    color: "#6E7C61",
    fontSize: 12,
    marginTop: 4,
  },
  storyLabel: {
    color: "#29440F",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 10,
    textAlign: "center",
  },
  storyHint: {
    color: "#6E7C61",
    fontSize: 12,
    marginTop: 4,
    textAlign: "center",
  },
  sectionBlock: {
    marginTop: 12,
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    marginTop: 8,
  },
  sectionTitle: {
    color: "#29440F",
    fontSize: 22,
    fontWeight: "800",
  },
  sectionMeta: {
    color: "#5F6E53",
    fontSize: 14,
    fontWeight: "700",
  },
  groupRow: {
    alignItems: "center",
    backgroundColor: "#FAFCF5",
    borderColor: "#DDE8C7",
    borderRadius: 24,
    borderWidth: 1,
    elevation: 3,
    flexDirection: "row",
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: "#1E2A12",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
  },
  groupRowTextWrap: {
    flex: 1,
    marginLeft: 14,
  },
  groupRowTitleRow: {
    alignItems: "center",
    flexDirection: "row",
  },
  groupRowTitle: {
    color: "#29440F",
    flex: 1,
    fontSize: 17,
    fontWeight: "800",
    marginRight: 12,
  },
  groupRowTime: {
    color: "#7A8870",
    fontSize: 13,
  },
  groupRowPreview: {
    color: "#5F6E53",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 5,
  },
  groupRowMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  groupTypeBadge: {
    alignItems: "center",
    backgroundColor: "#E6F1DA",
    borderRadius: 999,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  groupTypeBadgePrivate: {
    backgroundColor: "#FFF2DA",
  },
  groupTypeBadgeText: {
    color: "#356014",
    fontSize: 12,
    fontWeight: "800",
  },
  groupTypeBadgeTextPrivate: {
    color: "#8B5611",
  },
  groupMembersText: {
    color: "#667458",
    fontSize: 12,
    fontWeight: "700",
  },
  rowActionButton: {
    alignItems: "center",
    backgroundColor: "#5C8C1F",
    borderRadius: 14,
    justifyContent: "center",
    marginLeft: 10,
    minWidth: 66,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  rowActionText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  emptyState: {
    alignItems: "center",
    backgroundColor: "#F6F8EE",
    borderColor: "#DDE8C7",
    borderRadius: 24,
    borderWidth: 1,
    marginTop: 14,
    paddingHorizontal: 18,
    paddingVertical: 24,
  },
  emptyStateTitle: {
    color: "#29440F",
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  emptyStateText: {
    color: "#5F6E53",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    textAlign: "center",
  },
  modalBackdrop: {
    backgroundColor: "rgba(34,56,20,0.28)",
    flex: 1,
    justifyContent: "flex-end",
  },
  actionMenuBackdrop: {
    backgroundColor: "rgba(34,56,20,0.18)",
    flex: 1,
    justifyContent: "flex-start",
    paddingHorizontal: 20,
    paddingTop: 80,
  },
  actionMenuDismissArea: {
    ...StyleSheet.absoluteFillObject,
  },
  actionMenuCard: {
    alignSelf: "flex-end",
    backgroundColor: "#FAFCF5",
    borderColor: "#DDE8C7",
    borderRadius: 22,
    borderWidth: 1,
    minWidth: 300,
    padding: 12,
    shadowColor: "#1E2A12",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
  },
  actionMenuItem: {
    alignItems: "center",
    borderRadius: 16,
    flexDirection: "row",
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  actionMenuIconWrap: {
    alignItems: "center",
    backgroundColor: "#5C8C1F",
    borderRadius: 16,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  actionMenuIconWrapAlt: {
    backgroundColor: "#BA7517",
  },
  actionMenuTextWrap: {
    flex: 1,
    marginLeft: 12,
  },
  actionMenuTitle: {
    color: "#29440F",
    fontSize: 15,
    fontWeight: "800",
  },
  actionMenuSubtitle: {
    color: "#5F6E53",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3,
  },
  modalSheet: {
    backgroundColor: "#FAFCF5",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: "88%",
    paddingBottom: 28,
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  joinKeyModalSheet: {
    backgroundColor: "#FAFCF5",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 28,
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  modalHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  modalTitle: {
    color: "#29440F",
    fontSize: 24,
    fontWeight: "800",
  },
  modalSubtitle: {
    color: "#5F6E53",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  modalClose: {
    alignItems: "center",
    backgroundColor: "#EEF4E5",
    borderRadius: 999,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  modalInput: {
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
  modalTextarea: {
    minHeight: 94,
  },
  accessRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  accessChip: {
    alignItems: "center",
    backgroundColor: "#EEF4E5",
    borderRadius: 999,
    flex: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  accessChipSelected: {
    backgroundColor: "#5C8C1F",
  },
  accessChipSelectedPrivate: {
    backgroundColor: "#BA7517",
  },
  accessChipText: {
    color: "#4E6630",
    fontSize: 14,
    fontWeight: "700",
  },
  accessChipTextSelected: {
    color: "#FFFFFF",
  },
  privateKeyComposerCard: {
    backgroundColor: "#FFF8E7",
    borderColor: "#F1D7A5",
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 14,
    padding: 14,
  },
  privateKeyRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  privateKeyLabel: {
    color: "#8B5611",
    fontSize: 14,
    fontWeight: "800",
  },
  privateKeyGenerate: {
    color: "#5C8C1F",
    fontSize: 13,
    fontWeight: "700",
  },
  inviteTitle: {
    color: "#29440F",
    fontSize: 16,
    fontWeight: "800",
    marginTop: 18,
  },
  selectedInvitesRow: {
    marginTop: 12,
    maxHeight: 62,
  },
  selectedInviteChip: {
    alignItems: "center",
    backgroundColor: "#EEF4E5",
    borderRadius: 999,
    flexDirection: "row",
    gap: 8,
    marginRight: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  selectedInviteText: {
    color: "#29440F",
    fontSize: 13,
    fontWeight: "700",
  },
  composerUserRow: {
    alignItems: "center",
    backgroundColor: "#F6F8EE",
    borderColor: "#DDE8C7",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  composerUserTextWrap: {
    flex: 1,
    marginLeft: 12,
  },
  composerUserName: {
    color: "#29440F",
    fontSize: 16,
    fontWeight: "800",
  },
  composerUserMeta: {
    color: "#5F6E53",
    fontSize: 13,
    marginTop: 4,
  },
  selectBubble: {
    borderColor: "#C9D9B7",
    borderRadius: 12,
    borderWidth: 1,
    height: 24,
    width: 24,
  },
  selectBubbleSelected: {
    alignItems: "center",
    backgroundColor: "#5C8C1F",
    borderColor: "#5C8C1F",
    justifyContent: "center",
  },
  modalEmptyState: {
    alignItems: "center",
    backgroundColor: "#F6F8EE",
    borderColor: "#DDE8C7",
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 22,
  },
  modalEmptyStateTitle: {
    color: "#29440F",
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
  },
  modalEmptyStateText: {
    color: "#5F6E53",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    textAlign: "center",
  },
  createButton: {
    alignItems: "center",
    backgroundColor: "#5C8C1F",
    borderRadius: 18,
    justifyContent: "center",
    marginTop: 18,
    minHeight: 54,
  },
  createButtonDisabled: {
    opacity: 0.7,
  },
  createButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
});
