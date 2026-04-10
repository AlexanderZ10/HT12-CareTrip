export type FriendshipStatus = "pending" | "accepted";

export type Friendship = {
  id: string;
  participantIds: string[];
  recipientId: string;
  recipientLabel: string;
  recipientUsername: string;
  requesterId: string;
  requesterLabel: string;
  requesterUsername: string;
  status: FriendshipStatus;
  createdAtMs: number | null;
  updatedAtMs: number | null;
};

export type SocialPostVisibility = "public";
import { sanitizeString, sanitizeStringArray, toMillis } from "./sanitize";

export type SocialPostKind = "post" | "story";

export type SocialPost = {
  authorId: string;
  authorLabel: string;
  authorUsername: string;
  caption: string;
  createdAtMs: number | null;
  expiresAtMs: number | null;
  id: string;
  imageUri: string;
  kind: SocialPostKind;
  location: string;
  updatedAtMs: number | null;
  visibility: SocialPostVisibility;
};

function sanitizeSocialPostKind(value: unknown): SocialPostKind {
  return value === "story" ? "story" : "post";
}

export function buildFriendshipId(firstUserId: string, secondUserId: string) {
  return [firstUserId.trim(), secondUserId.trim()].sort().join("__");
}

export function getFriendshipOtherUserId(friendship: Friendship, currentUserId: string) {
  if (friendship.requesterId === currentUserId) {
    return friendship.recipientId;
  }

  if (friendship.recipientId === currentUserId) {
    return friendship.requesterId;
  }

  return "";
}

export function getFriendshipOtherLabel(friendship: Friendship, currentUserId: string) {
  return friendship.requesterId === currentUserId
    ? friendship.recipientLabel
    : friendship.requesterLabel;
}

export function getFriendshipOtherUsername(friendship: Friendship, currentUserId: string) {
  return friendship.requesterId === currentUserId
    ? friendship.recipientUsername
    : friendship.requesterUsername;
}

export function parseFriendship(
  id: string,
  data: Record<string, unknown> | undefined
): Friendship {
  const requesterId = sanitizeString(data?.requesterId);
  const recipientId = sanitizeString(data?.recipientId);
  const participantIds = sanitizeStringArray(data?.participantIds);
  const normalizedParticipantIds =
    participantIds.length === 2
      ? participantIds
      : [requesterId, recipientId].filter(Boolean);

  return {
    id,
    participantIds: normalizedParticipantIds,
    recipientId,
    recipientLabel: sanitizeString(data?.recipientLabel, "Traveler"),
    recipientUsername: sanitizeString(data?.recipientUsername),
    requesterId,
    requesterLabel: sanitizeString(data?.requesterLabel, "Traveler"),
    requesterUsername: sanitizeString(data?.requesterUsername),
    status: data?.status === "accepted" ? "accepted" : "pending",
    createdAtMs: toMillis(data?.createdAtMs ?? data?.createdAt),
    updatedAtMs: toMillis(data?.updatedAtMs ?? data?.updatedAt),
  };
}

export function sortFriendshipsByUpdatedAt(friendships: Friendship[]) {
  return [...friendships].sort((left, right) => {
    const leftValue = left.updatedAtMs ?? left.createdAtMs ?? 0;
    const rightValue = right.updatedAtMs ?? right.createdAtMs ?? 0;
    return rightValue - leftValue;
  });
}

export function parseSocialPost(
  id: string,
  data: Record<string, unknown> | undefined
): SocialPost {
  return {
    authorId: sanitizeString(data?.authorId),
    authorLabel: sanitizeString(data?.authorLabel, "Traveler"),
    authorUsername: sanitizeString(data?.authorUsername),
    caption: sanitizeString(data?.caption),
    createdAtMs: toMillis(data?.createdAtMs ?? data?.createdAt ?? data?.serverCreatedAt),
    expiresAtMs: toMillis(data?.expiresAtMs),
    id,
    imageUri: sanitizeString(data?.imageUri),
    kind: sanitizeSocialPostKind(data?.kind),
    location: sanitizeString(data?.location),
    updatedAtMs: toMillis(data?.updatedAtMs ?? data?.updatedAt),
    visibility: "public",
  };
}

export function sortSocialPostsByCreatedAt(posts: SocialPost[]) {
  return [...posts].sort((left, right) => {
    const leftValue = left.createdAtMs ?? left.updatedAtMs ?? 0;
    const rightValue = right.createdAtMs ?? right.updatedAtMs ?? 0;
    return rightValue - leftValue;
  });
}
