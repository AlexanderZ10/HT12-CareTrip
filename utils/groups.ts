import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  query,
  type Firestore,
  writeBatch,
} from "firebase/firestore";

export type GroupAccessType = "public" | "private";

export type TravelGroup = {
  accessType: GroupAccessType;
  createdAtMs: number | null;
  creatorId: string;
  creatorLabel: string;
  description: string;
  id: string;
  invitedUserIds: string[];
  joinKeyNormalized: string | null;
  memberCount: number;
  memberIds: string[];
  name: string;
  updatedAtMs: number | null;
};

function sanitizeString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function sanitizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function toMillis(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (
    value &&
    typeof value === "object" &&
    "toMillis" in value &&
    typeof value.toMillis === "function"
  ) {
    return value.toMillis();
  }

  return null;
}

export function normalizeGroupJoinKey(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9-]/g, "");
}

export function createSuggestedGroupKey() {
  const randomSegment = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `TRIP-${randomSegment}`;
}

export function parseTravelGroup(
  id: string,
  data: Record<string, unknown> | undefined
): TravelGroup {
  const accessType = data?.accessType === "private" ? "private" : "public";
  const memberIds = sanitizeStringArray(data?.memberIds);
  const memberCountValue =
    typeof data?.memberCount === "number" && Number.isFinite(data.memberCount)
      ? data.memberCount
      : memberIds.length;

  return {
    accessType,
    createdAtMs: toMillis(data?.createdAt),
    creatorId: sanitizeString(data?.creatorId),
    creatorLabel: sanitizeString(data?.creatorLabel, "Traveler"),
    description: sanitizeString(data?.description),
    id,
    invitedUserIds: sanitizeStringArray(data?.invitedUserIds),
    joinKeyNormalized:
      accessType === "private"
        ? sanitizeString(data?.joinKeyNormalized) || null
        : null,
    memberCount: Math.max(memberIds.length, memberCountValue),
    memberIds,
    name: sanitizeString(data?.name, "Unnamed group"),
    updatedAtMs: toMillis(data?.updatedAt),
  };
}

export function sortGroupsByCreatedAt(groups: TravelGroup[]) {
  return [...groups].sort((left, right) => {
    const leftValue = left.updatedAtMs ?? left.createdAtMs ?? 0;
    const rightValue = right.updatedAtMs ?? right.createdAtMs ?? 0;
    return rightValue - leftValue;
  });
}

const GROUP_DELETE_BATCH_SIZE = 100;

export async function deleteGroupWithMessages(db: Firestore, groupId: string) {
  const messagesRef = collection(db, "groups", groupId, "messages");

  while (true) {
    const messagesSnapshot = await getDocs(query(messagesRef, limit(GROUP_DELETE_BATCH_SIZE)));

    if (messagesSnapshot.empty) {
      break;
    }

    const batch = writeBatch(db);

    messagesSnapshot.docs.forEach((messageDocument) => {
      batch.delete(messageDocument.ref);
    });

    await batch.commit();

    if (messagesSnapshot.size < GROUP_DELETE_BATCH_SIZE) {
      break;
    }
  }

  await deleteDoc(doc(db, "groups", groupId));
}
