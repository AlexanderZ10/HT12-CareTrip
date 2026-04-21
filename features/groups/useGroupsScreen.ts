import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";

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
import {
  buildSmartTripAlerts,
  parseGroupItineraryBoard,
  type GroupItineraryBoard,
} from "../../utils/group-trip-collaboration";
import { sendLocalSmartNotificationIfNeeded } from "../../utils/notifications";
import { extractPersonalProfile, getProfileDisplayName } from "../../utils/profile-info";
import { parsePublicProfile, type PublicProfile } from "../../utils/public-profiles";
import {
  buildFriendshipId,
  dedupeSocialPostComments,
  getFollowActionLabel,
  getFriendshipOtherLabel,
  getFriendshipOtherUserId,
  getFriendshipOtherUsername,
  getSocialConnectionState,
  isFollowerConnection,
  isFollowingConnection,
  parseFriendship,
  parseSocialPostComment,
  parseSocialPost,
  sortFriendshipsByUpdatedAt,
  sortSocialPostCommentsByCreatedAt,
  sortSocialPostsByCreatedAt,
  type Friendship,
  type SocialConnectionState,
  type SocialPostComment,
  type SocialPost,
} from "../../utils/social";
import {
  parseTripRequest,
  sortTripRequestsByActivity,
  type TripRequest,
} from "../../utils/trip-requests";
import { matchesQuery } from "./helpers";

const SOCIAL_POST_IMAGE_MAX_LENGTH = 620000;
const STORY_TTL_MS = 24 * 60 * 60 * 1000;

type SocialProfilePreview = {
  aboutMe: string;
  connection: Friendship | null;
  homeBase: string;
  label: string;
  photoUrl: string;
  uid: string;
  username: string;
};

type UseGroupsScreenOptions = {
  enablePostComments?: boolean;
};

export function useGroupsScreen(options: UseGroupsScreenOptions = {}) {
  const router = useRouter();
  const enablePostComments = options.enablePostComments ?? false;

  const [user, setUser] = useState<User | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [loadingPublicProfiles, setLoadingPublicProfiles] = useState(true);
  const [loadingTripRequests, setLoadingTripRequests] = useState(true);
  const [loadingFriendships, setLoadingFriendships] = useState(true);
  const [loadingSocialPosts, setLoadingSocialPosts] = useState(true);
  const [savingGroup, setSavingGroup] = useState(false);
  const [savingTripRequest, setSavingTripRequest] = useState(false);
  const [postingSocialPost, setPostingSocialPost] = useState(false);
  const [commentingPostId, setCommentingPostId] = useState<string | null>(null);
  const [pickingPostImage, setPickingPostImage] = useState(false);
  const [joiningGroupId, setJoiningGroupId] = useState<string | null>(null);
  const [joiningByKey, setJoiningByKey] = useState(false);
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
  const [updatingTripRequestId, setUpdatingTripRequestId] = useState<string | null>(null);
  const [updatingFriendshipId, setUpdatingFriendshipId] = useState<string | null>(null);

  const [profileName, setProfileName] = useState("Traveler");
  const [profileAvatarUrl, setProfileAvatarUrl] = useState("");
  const [username, setUsername] = useState("");
  const [dreamDestinations, setDreamDestinations] = useState("");
  const [groups, setGroups] = useState<TravelGroup[]>([]);
  const [groupBoardsByGroupId, setGroupBoardsByGroupId] = useState<
    Record<string, GroupItineraryBoard>
  >({});
  const [publicProfiles, setPublicProfiles] = useState<PublicProfile[]>([]);
  const [tripRequests, setTripRequests] = useState<TripRequest[]>([]);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [socialPosts, setSocialPosts] = useState<SocialPost[]>([]);
  const [commentsByPostId, setCommentsByPostId] = useState<Record<string, SocialPostComment[]>>({});
  const [commentErrorsByPostId, setCommentErrorsByPostId] = useState<Record<string, string>>({});

  const [activeSection, setActiveSection] = useState<"friends" | "groups" | "posts">("groups");
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
  const [postCaption, setPostCaption] = useState("");
  const [postLocation, setPostLocation] = useState("");
  const [postImageUri, setPostImageUri] = useState("");

  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;
    let unsubscribeGroups: (() => void) | null = null;
    let unsubscribePublicProfiles: (() => void) | null = null;
    let unsubscribeTripRequests: (() => void) | null = null;
    let unsubscribeFriendships: (() => void) | null = null;
    let unsubscribeSocialPosts: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (nextUser) => {
      unsubscribeProfile?.();
      unsubscribeGroups?.();
      unsubscribePublicProfiles?.();
      unsubscribeTripRequests?.();
      unsubscribeFriendships?.();
      unsubscribeSocialPosts?.();
      unsubscribeProfile = null;
      unsubscribeGroups = null;
      unsubscribePublicProfiles = null;
      unsubscribeTripRequests = null;
      unsubscribeFriendships = null;
      unsubscribeSocialPosts = null;

      if (!nextUser) {
        setUser(null);
        setDreamDestinations("");
        setGroups([]);
        setGroupBoardsByGroupId({});
        setPublicProfiles([]);
        setTripRequests([]);
        setFriendships([]);
        setSocialPosts([]);
        setCommentsByPostId({});
        setCommentErrorsByPostId({});
        setLoadingProfile(false);
        setLoadingGroups(false);
        setLoadingPublicProfiles(false);
        setLoadingTripRequests(false);
        setLoadingFriendships(false);
        setLoadingSocialPosts(false);
        router.replace("/login");
        return;
      }

      setUser(nextUser);
      setLoadingProfile(true);
      setLoadingGroups(true);
      setLoadingPublicProfiles(true);
      setLoadingTripRequests(true);
      setLoadingFriendships(true);
      setLoadingSocialPosts(true);
      setError("");
      setSuccessMessage("");

      // Track which collections have permission errors so we can suppress
      // the global "rules blocking" message when the user can still use the app.
      const blockedCollections = new Set<string>();

      const handleReadError = (collectionName: string, nextError: unknown) => {
        blockedCollections.add(collectionName);
        // Only surface the rules error if EVERY collection is blocked.
        // Otherwise the user can still interact with the data that did load.
        if (blockedCollections.size >= 6) {
          setError(getGroupsErrorMessage(nextError, "read"));
        }
      };

      const handleReadSuccess = (collectionName: string) => {
        blockedCollections.delete(collectionName);
        // If any collection comes through successfully, clear stale rules error.
        if (blockedCollections.size === 0) {
          setError((current) =>
            current.startsWith("Firestore rules") ? "" : current
          );
        }
      };

      unsubscribeProfile = onSnapshot(
        doc(db, "profiles", nextUser.uid),
        (profileSnapshot) => {
          if (!profileSnapshot.exists()) {
            setLoadingProfile(false);
            router.replace("/onboarding");
            return;
          }

          const profileData = profileSnapshot.data() as Record<string, unknown>;
          const personalProfile =
            profileData.profileInfo && typeof profileData.profileInfo === "object"
              ? extractPersonalProfile({
                  profileInfo: profileData.profileInfo as Record<string, unknown>,
                })
              : extractPersonalProfile({});

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
            typeof profileData.profilePhotoUrl === "string" && profileData.profilePhotoUrl.trim()
              ? profileData.profilePhotoUrl.trim()
              : personalProfile.avatarUrl
          );
          setDreamDestinations(personalProfile.dreamDestinations);
          setUsername(typeof profileData.username === "string" ? profileData.username.trim() : "");
          setLoadingProfile(false);
          handleReadSuccess("profile");
        },
        (nextError) => {
          handleReadError("profile", nextError);
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
          handleReadSuccess("groups");
        },
        (nextError) => {
          handleReadError("groups", nextError);
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
          handleReadSuccess("publicProfiles");
        },
        (nextError) => {
          handleReadError("publicProfiles", nextError);
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
          handleReadSuccess("tripRequests");
        },
        (nextError) => {
          handleReadError("tripRequests", nextError);
          setLoadingTripRequests(false);
        }
      );

      unsubscribeFriendships = onSnapshot(
        query(
          collection(db, "friendships"),
          where("participantIds", "array-contains", nextUser.uid)
        ),
        (friendshipsSnapshot) => {
          const nextFriendships = sortFriendshipsByUpdatedAt(
            friendshipsSnapshot.docs.map((friendshipDocument) =>
              parseFriendship(
                friendshipDocument.id,
                friendshipDocument.data() as Record<string, unknown>
              )
            )
          );
          setFriendships(nextFriendships);
          setLoadingFriendships(false);
          handleReadSuccess("friendships");
        },
        (nextError) => {
          handleReadError("friendships", nextError);
          setLoadingFriendships(false);
        }
      );

      unsubscribeSocialPosts = onSnapshot(
        collection(db, "socialPosts"),
        (socialPostsSnapshot) => {
          const nextPosts = sortSocialPostsByCreatedAt(
            socialPostsSnapshot.docs.map((socialPostDocument) =>
              parseSocialPost(
                socialPostDocument.id,
                socialPostDocument.data() as Record<string, unknown>
              )
            )
          );
          setSocialPosts(nextPosts);
          setLoadingSocialPosts(false);
          handleReadSuccess("socialPosts");
        },
        (nextError) => {
          handleReadError("socialPosts", nextError);
          setLoadingSocialPosts(false);
        }
      );
    });

    return () => {
      unsubscribeProfile?.();
      unsubscribeGroups?.();
      unsubscribePublicProfiles?.();
      unsubscribeTripRequests?.();
      unsubscribeFriendships?.();
      unsubscribeSocialPosts?.();
      unsubscribeAuth();
    };
  }, [router]);

  const userId = user?.uid ?? "";
  const userHandle = username || profileName.toLowerCase().replace(/\s+/g, "_");
  const publicUsers = publicProfiles.filter((profile) => profile.uid !== userId);

  const publicProfilesById = useMemo(
    () => Object.fromEntries(publicProfiles.map((profile) => [profile.uid, profile])),
    [publicProfiles]
  );

  const friendshipsByProfileId = useMemo(
    () =>
      Object.fromEntries(
        friendships
          .map((friendship) => [getFriendshipOtherUserId(friendship, userId), friendship] as const)
          .filter(([friendId]) => !!friendId)
      ),
    [friendships, userId]
  );

  const acceptedFriendships = useMemo(
    () => friendships.filter((friendship) => friendship.status === "accepted"),
    [friendships]
  );
  const pendingIncomingFriendships = useMemo(
    () =>
      friendships.filter(
        (friendship) =>
          friendship.status === "pending" && friendship.recipientId === userId
      ),
    [friendships, userId]
  );
  const pendingOutgoingFriendships = useMemo(
    () =>
      friendships.filter(
        (friendship) =>
          friendship.status === "pending" && friendship.requesterId === userId
      ),
    [friendships, userId]
  );

  const buildSocialProfilePreview = (targetUserId: string): SocialProfilePreview => {
    const profile = publicProfilesById[targetUserId];
    const connection = friendshipsByProfileId[targetUserId] ?? null;
    const fallbackConnection = connection;

    return {
      aboutMe: profile?.aboutMe ?? "",
      connection,
      homeBase: profile?.homeBase ?? "",
      label:
        profile?.displayName ||
        (fallbackConnection ? getFriendshipOtherLabel(fallbackConnection, userId) : "Traveler"),
      photoUrl: profile?.photoUrl || profile?.avatarUrl || "",
      uid: targetUserId,
      username:
        profile?.username ||
        (fallbackConnection ? getFriendshipOtherUsername(fallbackConnection, userId) : ""),
    };
  };

  const getConnectionStateForProfile = (targetUserId: string): SocialConnectionState =>
    getSocialConnectionState(friendshipsByProfileId[targetUserId] ?? null, userId);

  const getFollowActionLabelForProfile = (targetUserId: string) =>
    getFollowActionLabel(getConnectionStateForProfile(targetUserId));

  const isUpdatingConnectionWithProfile = (targetUserId: string) =>
    !!targetUserId && updatingFriendshipId === buildFriendshipId(userId, targetUserId);

  const friendProfiles = useMemo(
    () =>
      acceptedFriendships
        .map((friendship) => buildSocialProfilePreview(getFriendshipOtherUserId(friendship, userId)))
        .filter((profile) => !!profile.uid),
    [acceptedFriendships, publicProfilesById, friendshipsByProfileId, userId]
  );
  const followerProfiles = useMemo(() => {
    const followerIds = new Set<string>();

    friendships.forEach((friendship) => {
      const friendId = getFriendshipOtherUserId(friendship, userId);
      const connectionState = getSocialConnectionState(friendship, userId);

      if (friendId && isFollowerConnection(connectionState)) {
        followerIds.add(friendId);
      }
    });

    return Array.from(followerIds)
      .map((profileId) => buildSocialProfilePreview(profileId))
      .filter((profile) => !!profile.uid);
  }, [friendships, friendshipsByProfileId, publicProfilesById, userId]);
  const followingProfiles = useMemo(() => {
    const followingIds = new Set<string>();

    friendships.forEach((friendship) => {
      const friendId = getFriendshipOtherUserId(friendship, userId);
      const connectionState = getSocialConnectionState(friendship, userId);

      if (friendId && isFollowingConnection(connectionState)) {
        followingIds.add(friendId);
      }
    });

    return Array.from(followingIds)
      .map((profileId) => buildSocialProfilePreview(profileId))
      .filter((profile) => !!profile.uid);
  }, [friendships, friendshipsByProfileId, publicProfilesById, userId]);

  const suggestedProfiles = useMemo(() => {
    const rankForProfile = (profileId: string) => {
      const connection = friendshipsByProfileId[profileId];

      if (!connection) {
        return 1;
      }

      if (connection.status === "pending" && connection.recipientId === userId) {
        return 0;
      }

      if (connection.status === "pending") {
        return 2;
      }

      return 3;
    };

    return [...publicUsers]
      .filter((profile) => {
        const connection = friendshipsByProfileId[profile.uid];
        const connectionState = getSocialConnectionState(connection, userId);

        return !isFollowingConnection(connectionState);
      })
      .sort((left, right) => {
        const rankDiff = rankForProfile(left.uid) - rankForProfile(right.uid);

        if (rankDiff !== 0) {
          return rankDiff;
        }

        return left.displayName.localeCompare(right.displayName);
      });
  }, [publicUsers, friendshipsByProfileId, userId]);

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
  const joinedGroupIdsKey = useMemo(
    () => joinedGroups.map((group) => group.id).sort().join("|"),
    [joinedGroups]
  );

  useEffect(() => {
    if (!userId || joinedGroups.length === 0) {
      setGroupBoardsByGroupId({});
      return;
    }

    const allowedGroupIds = new Set(joinedGroups.map((group) => group.id));
    setGroupBoardsByGroupId((currentBoards) =>
      Object.fromEntries(
        Object.entries(currentBoards).filter(([groupId]) => allowedGroupIds.has(groupId))
      )
    );

    const unsubscribers = joinedGroups.map((group) =>
      onSnapshot(
        doc(db, "groups", group.id, "tripBoards", "active"),
        (boardSnapshot) => {
          setGroupBoardsByGroupId((currentBoards) => {
            const nextBoards = { ...currentBoards };

            if (boardSnapshot.exists()) {
              const parsedBoard = parseGroupItineraryBoard(
                boardSnapshot.id,
                boardSnapshot.data() as Record<string, unknown>
              );

              if (parsedBoard) {
                nextBoards[group.id] = parsedBoard;
              } else {
                delete nextBoards[group.id];
              }
            } else {
              delete nextBoards[group.id];
            }

            return nextBoards;
          });
        },
        () => {
          setGroupBoardsByGroupId((currentBoards) => {
            const nextBoards = { ...currentBoards };
            delete nextBoards[group.id];
            return nextBoards;
          });
        }
      )
    );

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [joinedGroupIdsKey, joinedGroups, userId]);

  const friendIds = useMemo(
    () =>
      friendships
        .filter((friendship) =>
          isFollowingConnection(getSocialConnectionState(friendship, userId))
        )
        .map((friendship) => getFriendshipOtherUserId(friendship, userId))
        .filter(Boolean),
    [friendships, userId]
  );

  const activeStories = useMemo(() => {
    const now = Date.now();
    const latestStoryByAuthor = new Map<string, SocialPost>();

    for (const post of socialPosts) {
      if (post.kind !== "story" || !post.authorId) {
        continue;
      }

      const expiresAtMs = post.expiresAtMs ?? 0;

      if (expiresAtMs <= now) {
        continue;
      }

      const current = latestStoryByAuthor.get(post.authorId);
      const nextValue = post.createdAtMs ?? 0;
      const currentValue = current?.createdAtMs ?? 0;

      if (!current || nextValue > currentValue) {
        latestStoryByAuthor.set(post.authorId, post);
      }
    }

    return Array.from(latestStoryByAuthor.values()).sort(
      (left, right) => (right.createdAtMs ?? 0) - (left.createdAtMs ?? 0)
    );
  }, [socialPosts]);

  const feedPosts = useMemo(() => {
    const friendIdSet = new Set(friendIds);

    return socialPosts
      .filter((post) => post.kind === "post")
      .sort((left, right) => {
      const leftRank =
        left.authorId === userId || friendIdSet.has(left.authorId) ? 0 : 1;
      const rightRank =
        right.authorId === userId || friendIdSet.has(right.authorId) ? 0 : 1;

      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      return (right.createdAtMs ?? 0) - (left.createdAtMs ?? 0);
      });
  }, [friendIds, socialPosts, userId]);

  const commentPostIdsKey = useMemo(
    () => (enablePostComments ? feedPosts.slice(0, 30).map((post) => post.id).join("|") : ""),
    [enablePostComments, feedPosts]
  );

  useEffect(() => {
    const commentPostIds = commentPostIdsKey.split("|").filter(Boolean);

    if (!enablePostComments || !userId || commentPostIds.length === 0) {
      setCommentsByPostId({});
      setCommentErrorsByPostId({});
      return;
    }

    const allowedPostIds = new Set(commentPostIds);
    setCommentsByPostId((currentComments) =>
      Object.fromEntries(
        Object.entries(currentComments).filter(([postId]) => allowedPostIds.has(postId))
      )
    );

    const unsubscribers = commentPostIds.map((postId) =>
      onSnapshot(
        query(
          collection(db, "socialPosts", postId, "comments"),
          orderBy("createdAtMs", "asc"),
          limit(50)
        ),
        (commentsSnapshot) => {
          const nextComments = sortSocialPostCommentsByCreatedAt(
            commentsSnapshot.docs
              .map((commentDocument) =>
                parseSocialPostComment(
                  commentDocument.id,
                  commentDocument.data() as Record<string, unknown>
                )
              )
              .filter((comment) => comment.text.trim().length > 0)
          );

          setCommentsByPostId((currentComments) => ({
            ...currentComments,
            [postId]: nextComments,
          }));
          setCommentErrorsByPostId((currentErrors) => {
            if (!currentErrors[postId]) {
              return currentErrors;
            }

            const nextErrors = { ...currentErrors };
            delete nextErrors[postId];
            return nextErrors;
          });
        },
        () => {
          setCommentErrorsByPostId((currentErrors) => ({
            ...currentErrors,
            [postId]: "Comments are temporarily unavailable.",
          }));
        }
      )
    );

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [commentPostIdsKey, enablePostComments, userId]);

  const mySocialPosts = useMemo(
    () =>
      socialPosts.filter((post) => post.authorId === userId && post.kind === "post"),
    [socialPosts, userId]
  );
  const smartAlerts = useMemo(
    () =>
      buildSmartTripAlerts({
        currentUserId: userId,
        dreamDestinations,
        groupBoardsByGroupId,
        groups: joinedGroups,
        tripRequests: openTripRequests,
      }),
    [dreamDestinations, groupBoardsByGroupId, joinedGroups, openTripRequests, userId]
  );

  useEffect(() => {
    if (!userId || smartAlerts.length === 0) {
      return;
    }

    smartAlerts.slice(0, 3).forEach((alert) => {
      void sendLocalSmartNotificationIfNeeded({
        body: alert.body,
        dedupeKey: alert.id,
        title: alert.title,
      });
    });
  }, [smartAlerts, userId]);

  const searchedPublicGroups = useMemo(
    () =>
      publicGroups.filter((group) =>
        matchesQuery([group.name, group.description, group.creatorLabel], searchQuery)
      ),
    [publicGroups, searchQuery]
  );
  const searchedPublicProfiles = useMemo(
    () =>
      publicUsers.filter((profile) =>
        matchesQuery(
          [profile.displayName, profile.username, profile.homeBase, profile.aboutMe],
          searchQuery
        )
      ),
    [publicUsers, searchQuery]
  );
  const searchedSocialPosts = useMemo(
    () =>
      feedPosts.filter((post) =>
        matchesQuery([post.authorLabel, post.authorUsername, post.caption, post.location], searchQuery)
      ),
    [feedPosts, searchQuery]
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

  const socialPostCount = mySocialPosts.length;
  const loading =
    loadingProfile ||
    loadingGroups ||
    loadingPublicProfiles ||
    loadingTripRequests ||
    loadingFriendships ||
    loadingSocialPosts;

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

  const resetPostComposer = () => {
    setPostCaption("");
    setPostLocation("");
    setPostImageUri("");
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

        reject(new Error("Could not read the selected photo."));
      };
      reader.onerror = () => reject(new Error("Could not read the selected photo."));
      reader.readAsDataURL(blob);
    });
  };

  const pickSocialImage = async (source: "camera" | "library") => {
    try {
      setPickingPostImage(true);
      clearFeedback();

      const permission =
        Platform.OS === "web"
          ? { granted: true }
          : source === "camera"
            ? await ImagePicker.requestCameraPermissionsAsync()
            : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        setError(
          source === "camera"
            ? "Allow camera access to take a photo."
            : "Allow gallery access to attach a photo."
        );
        return false;
      }

      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync({
              allowsEditing: true,
              aspect: [4, 5],
              base64: true,
              mediaTypes: ["images"],
              quality: 0.55,
            })
          : await ImagePicker.launchImageLibraryAsync({
              allowsEditing: true,
              aspect: [4, 5],
              base64: true,
              mediaTypes: ["images"],
              quality: 0.55,
            });

      if (result.canceled || !result.assets[0]) {
        return false;
      }

      const imageDataUrl = await readAssetDataUrl(result.assets[0]);

      if (imageDataUrl.length > SOCIAL_POST_IMAGE_MAX_LENGTH) {
        setError("The selected image is too large for a feed post.");
        return false;
      }

      setPostImageUri(imageDataUrl);
      return true;
    } catch {
      setError(
        source === "camera"
          ? "Could not take a photo right now."
          : "Could not attach the selected photo."
      );
      return false;
    } finally {
      setPickingPostImage(false);
    }
  };

  const pickPostImage = async () => pickSocialImage("library");

  const takePostPhoto = async () => pickSocialImage("camera");

  const clearPostImage = () => {
    setPostImageUri("");
  };

  const resetPostDraft = () => {
    resetPostComposer();
    clearFeedback();
  };

  const handleCreateSocialPost = async () => {
    if (!user) {
      return false;
    }

    const trimmedCaption = postCaption.trim().slice(0, 280);
    const trimmedLocation = postLocation.trim().slice(0, 80);

    if (!trimmedCaption && !postImageUri) {
      setError("Add a caption or a photo before publishing.");
      setSuccessMessage("");
      return false;
    }

    try {
      setPostingSocialPost(true);
      clearFeedback();

      const now = Date.now();
      const newPostRef = doc(collection(db, "socialPosts"));

      await setDoc(newPostRef, {
        authorId: user.uid,
        authorLabel: profileName,
        authorUsername: username,
        caption: trimmedCaption,
        createdAtMs: now,
        expiresAtMs: null,
        imageUri: postImageUri,
        kind: "post",
        location: trimmedLocation,
        updatedAtMs: now,
        visibility: "public",
      });

      resetPostComposer();
      setSuccessMessage("Your travel moment is live.");
      return true;
    } catch {
      setError("Could not publish your travel moment. Try again.");
      return false;
    } finally {
      setPostingSocialPost(false);
    }
  };

  const addSocialPostComment = async (postId: string, rawText: string) => {
    if (!user) {
      return false;
    }

    const trimmedText = rawText.trim().slice(0, 240);

    if (!postId || !trimmedText) {
      return false;
    }

    const now = Date.now();
    const newCommentRef = doc(collection(db, "socialPosts", postId, "comments"));
    const optimisticComment: SocialPostComment = {
      authorId: user.uid,
      authorLabel: profileName,
      authorUsername: username,
      createdAtMs: now,
      id: `local-${newCommentRef.id}`,
      postId,
      text: trimmedText,
      updatedAtMs: now,
    };

    try {
      setCommentingPostId(postId);
      clearFeedback();
      setCommentErrorsByPostId((currentErrors) => {
        if (!currentErrors[postId]) {
          return currentErrors;
        }

        const nextErrors = { ...currentErrors };
        delete nextErrors[postId];
        return nextErrors;
      });
      setCommentsByPostId((currentComments) => ({
        ...currentComments,
        [postId]: sortSocialPostCommentsByCreatedAt(
          dedupeSocialPostComments([
            ...(currentComments[postId] ?? []),
            optimisticComment,
          ])
        ),
      }));

      await setDoc(newCommentRef, {
        authorId: user.uid,
        authorLabel: profileName,
        authorUsername: username,
        createdAtMs: now,
        postId,
        text: trimmedText,
        updatedAtMs: now,
      });

      setCommentsByPostId((currentComments) => ({
        ...currentComments,
        [postId]: sortSocialPostCommentsByCreatedAt(
          dedupeSocialPostComments([
            ...(currentComments[postId] ?? []).filter(
              (comment) => comment.id !== optimisticComment.id && comment.id !== newCommentRef.id
            ),
            { ...optimisticComment, id: newCommentRef.id },
          ])
        ),
      }));

      return true;
    } catch {
      setCommentsByPostId((currentComments) => ({
        ...currentComments,
        [postId]: (currentComments[postId] ?? []).filter(
          (comment) => comment.id !== optimisticComment.id
        ),
      }));
      setCommentErrorsByPostId((currentErrors) => ({
        ...currentErrors,
        [postId]: "Could not publish your comment. Try again.",
      }));
      return false;
    } finally {
      setCommentingPostId(null);
    }
  };

  const publishStoryFromDraft = async () => {
    if (!user) {
      return false;
    }

    if (!postImageUri) {
      setError("Add a photo before publishing a story.");
      setSuccessMessage("");
      return false;
    }

    try {
      setPostingSocialPost(true);
      clearFeedback();

      const now = Date.now();
      const newPostRef = doc(collection(db, "socialPosts"));

      await setDoc(newPostRef, {
        authorId: user.uid,
        authorLabel: profileName,
        authorUsername: username,
        caption: "",
        createdAtMs: now,
        expiresAtMs: now + STORY_TTL_MS,
        imageUri: postImageUri,
        kind: "story",
        location: "",
        updatedAtMs: now,
        visibility: "public",
      });

      resetPostComposer();
      setSuccessMessage("Your story is live.");
      return true;
    } catch {
      setError("Could not publish your story. Try again.");
      return false;
    } finally {
      setPostingSocialPost(false);
    }
  };

  const sendFriendRequest = async (profile: PublicProfile) => {
    if (!user || profile.uid === user.uid) {
      return;
    }

    if (!profile.uid.trim()) {
      setError("Could not follow — invalid profile.");
      return;
    }

    const friendshipId = buildFriendshipId(user.uid, profile.uid);
    const safeRecipientLabel = (profile.displayName || profile.username || "Traveler").slice(0, 80);
    const safeRecipientUsername = (profile.username || "").slice(0, 40);
    const safeRequesterLabel = (profileName || "Traveler").slice(0, 80);
    const safeRequesterUsername = (username || "").slice(0, 40);

    try {
      setUpdatingFriendshipId(friendshipId);
      clearFeedback();

      const friendshipRef = doc(db, "friendships", friendshipId);
      const now = Date.now();

      const nextFriendship = await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(friendshipRef);

        if (!snapshot.exists()) {
          const created = {
            createdAtMs: now,
            id: friendshipId,
            participantIds: [user.uid, profile.uid].sort(),
            recipientId: profile.uid,
            recipientLabel: safeRecipientLabel,
            recipientUsername: safeRecipientUsername,
            requesterId: user.uid,
            requesterLabel: safeRequesterLabel,
            requesterUsername: safeRequesterUsername,
            status: "pending" as const,
            updatedAtMs: now,
          } satisfies Friendship;

          transaction.set(friendshipRef, {
            createdAtMs: created.createdAtMs,
            participantIds: created.participantIds,
            recipientId: created.recipientId,
            recipientLabel: created.recipientLabel,
            recipientUsername: created.recipientUsername,
            requesterId: created.requesterId,
            requesterLabel: created.requesterLabel,
            requesterUsername: created.requesterUsername,
            status: created.status,
            updatedAtMs: created.updatedAtMs,
          });
          return created;
        }

        const existing = parseFriendship(
          snapshot.id,
          snapshot.data() as Record<string, unknown>
        );

        if (existing.status === "accepted") {
          return existing;
        }

        if (existing.status === "pending" && existing.recipientId === user.uid) {
          transaction.update(friendshipRef, { status: "accepted", updatedAtMs: now });
          return { ...existing, status: "accepted" as const, updatedAtMs: now };
        }

        return existing;
      });

      setFriendships((cur) =>
        sortFriendshipsByUpdatedAt([
          nextFriendship,
          ...cur.filter((f) => f.id !== friendshipId),
        ])
      );
      setSuccessMessage(
        nextFriendship.status === "accepted" ? "You are now travel friends." : "Following."
      );
    } catch (followError) {
      console.warn("sendFriendRequest failed", followError);
      const errorCode =
        followError &&
        typeof followError === "object" &&
        "code" in followError &&
        typeof followError.code === "string"
          ? followError.code
          : "";
      const errorMessage =
        followError instanceof Error ? followError.message : String(followError);

      if (errorCode === "permission-denied" || errorCode === "PERMISSION_DENIED") {
        setError("Permission denied — you may need to sign in again.");
      } else if (
        errorCode === "unavailable" ||
        errorCode === "deadline-exceeded" ||
        errorMessage.includes("Failed to fetch")
      ) {
        setError("Network issue — check your connection and try again.");
      } else {
        setError(`Could not follow this profile: ${errorCode || errorMessage}`);
      }
    } finally {
      setUpdatingFriendshipId(null);
    }
  };

  const acceptFriendRequest = async (friendship: Friendship) => {
    if (!user || friendship.recipientId !== user.uid) {
      return;
    }

    try {
      setUpdatingFriendshipId(friendship.id);
      clearFeedback();

      await runTransaction(db, async (transaction) => {
        const friendshipRef = doc(db, "friendships", friendship.id);
        const friendshipSnapshot = await transaction.get(friendshipRef);

        if (!friendshipSnapshot.exists()) {
          throw new Error("missing-friendship");
        }

        const currentFriendship = parseFriendship(
          friendshipSnapshot.id,
          friendshipSnapshot.data() as Record<string, unknown>
        );

        if (currentFriendship.status === "accepted") {
          return;
        }

        transaction.update(friendshipRef, {
          status: "accepted",
          updatedAtMs: Date.now(),
        });
      });

      setFriendships((currentFriendships) =>
        sortFriendshipsByUpdatedAt(
          currentFriendships.map((currentFriendship) =>
            currentFriendship.id === friendship.id
              ? { ...currentFriendship, status: "accepted", updatedAtMs: Date.now() }
              : currentFriendship
          )
        )
      );
      setSuccessMessage("You are now travel friends.");
    } catch (acceptError) {
      console.warn("acceptFriendRequest failed", acceptError);
      const errorCode =
        acceptError &&
        typeof acceptError === "object" &&
        "code" in acceptError &&
        typeof acceptError.code === "string"
          ? acceptError.code
          : "";

      if (errorCode === "permission-denied" || errorCode === "PERMISSION_DENIED") {
        setError("Permission denied — you may need to sign in again.");
      } else if (
        errorCode === "unavailable" ||
        errorCode === "deadline-exceeded" ||
        (acceptError instanceof Error && acceptError.message.includes("Failed to fetch"))
      ) {
        setError("Network issue — check your connection and try again.");
      } else {
        setError("Could not accept this friend request. Please try again.");
      }
    } finally {
      setUpdatingFriendshipId(null);
    }
  };

  const removeFriendship = async (friendship: Friendship) => {
    if (!user || !friendship.participantIds.includes(user.uid)) {
      return;
    }

    try {
      setUpdatingFriendshipId(friendship.id);
      clearFeedback();

      await deleteDoc(doc(db, "friendships", friendship.id));
      setFriendships((currentFriendships) =>
        currentFriendships.filter((currentFriendship) => currentFriendship.id !== friendship.id)
      );

      if (friendship.status === "accepted") {
        setSuccessMessage("Friend removed.");
      } else if (friendship.requesterId === user.uid) {
        setSuccessMessage("Friend request canceled.");
      } else {
        setSuccessMessage("Friend request declined.");
      }
    } catch (removeError) {
      console.warn("removeFriendship failed", removeError);
      setError("Could not update this connection. Please try again.");
    } finally {
      setUpdatingFriendshipId(null);
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

  return {
    // Data
    userId,
    userHandle,
    profileName,
    profileAvatarUrl,
    publicUsers,
    publicGroups,
    joinedGroups,
    invitedGroups,
    openTripRequests,
    searchedPublicGroups,
    searchedPublicProfiles,
    searchedSocialPosts,
    filteredInviteProfiles,
    publicProfilesById,
    friendProfiles,
    followerProfiles,
    followingProfiles,
    pendingIncomingFriendships,
    pendingOutgoingFriendships,
    suggestedProfiles,
    activeStories,
    feedPosts,
    mySocialPosts,
    commentsByPostId,
    commentErrorsByPostId,
    smartAlerts,
    dreamDestinations,
    groupBoardsByGroupId,
    socialPostCount,
    friendCount: acceptedFriendships.length,

    // Loading / saving flags
    loading,
    savingGroup,
    savingTripRequest,
    postingSocialPost,
    commentingPostId,
    pickingPostImage,
    joiningGroupId,
    joiningByKey,
    deletingGroupId,
    updatingTripRequestId,
    updatingFriendshipId,

    // Feedback
    error,
    successMessage,
    clearFeedback,

    // Section navigation
    activeSection,
    setActiveSection,

    // Search
    searchQuery,
    setSearchQuery,

    // Social composer
    postCaption,
    setPostCaption,
    postLocation,
    setPostLocation,
    postImageUri,
    pickPostImage,
    takePostPhoto,
    pickSocialImage,
    clearPostImage,
    resetPostDraft,
    handleCreateSocialPost,
    publishStoryFromDraft,
    addSocialPostComment,

    // Social actions
    buildSocialProfilePreview,
    getConnectionStateForProfile,
    getFollowActionLabelForProfile,
    isUpdatingConnectionWithProfile,
    sendFriendRequest,
    acceptFriendRequest,
    removeFriendship,

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
