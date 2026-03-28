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
import { useEffect, useMemo, useState } from "react";

import { auth, db } from "../../firebase";
import { getGroupsErrorMessage } from "../../utils/error-messages";
import {
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
import { matchesQuery } from "./helpers";

export function useGroupsScreen() {
  const router = useRouter();

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

  return {
    // Data
    userId,
    userHandle,
    profileName,
    publicUsers,
    publicGroups,
    joinedGroups,
    invitedGroups,
    openTripRequests,
    searchedPublicGroups,
    filteredInviteProfiles,
    publicProfilesById,

    // Loading / saving flags
    loading,
    savingGroup,
    savingTripRequest,
    joiningGroupId,
    joiningByKey,
    deletingGroupId,
    updatingTripRequestId,

    // Feedback
    error,
    successMessage,
    clearFeedback,

    // Search
    searchQuery,
    setSearchQuery,

    // Action menu
    actionMenuVisible,
    setActionMenuVisible,

    // Join key modal
    joinKeyModalVisible,
    setJoinKeyModalVisible,
    joinKeyValue,
    setJoinKeyValue,
    handleJoinByKey,

    // Composer (create group)
    composerVisible,
    setComposerVisible,
    groupName,
    setGroupName,
    groupDescription,
    setGroupDescription,
    groupAccess,
    setGroupAccess,
    groupJoinKey,
    setGroupJoinKey,
    inviteSearchQuery,
    setInviteSearchQuery,
    selectedInviteIds,
    toggleInvite,
    handleCreateGroup,

    // Delete modal
    deleteModalVisible,
    setDeleteModalVisible,
    groupPendingDelete,
    setGroupPendingDelete,
    handleDeleteGroup,

    // Trip request composer
    requestComposerVisible,
    setRequestComposerVisible,
    requestDestination,
    setRequestDestination,
    requestBudget,
    setRequestBudget,
    requestTiming,
    setRequestTiming,
    requestTravelers,
    setRequestTravelers,
    requestNote,
    setRequestNote,
    handleCreateTripRequest,

    // Actions
    openComposer,
    openRequestComposer,
    openDeleteModal,
    openGroupChat,
    joinGroup,
    toggleTripRequestInterest,
    closeTripRequest,
    createGroupFromRequest,
  };
}
