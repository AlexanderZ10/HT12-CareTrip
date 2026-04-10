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

import { sanitizeString, sanitizeStringArray, toMillis } from "./sanitize";

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
  memberAvatarUrlsById: Record<string, string>;
  memberIds: string[];
  memberLabelsById: Record<string, string>;
  memberUsernamesById: Record<string, string>;
  name: string;
  photoUrl: string;
  updatedAtMs: number | null;
};

function sanitizeStringRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, string>;
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [key.trim(), typeof item === "string" ? item.trim() : ""])
      .filter(([key, item]) => !!key && !!item)
  );
}

export function normalizeGroupJoinKey(value: string) {
  return value
    .toUpperCase()
    .replace(/^TRIP-?/i, "")
    .replace(/[^A-Z0-9-]/g, "");
}

export function createSuggestedGroupKey() {
  const randomSegment = Math.random().toString(36).slice(2, 8).toUpperCase();
  return randomSegment;
}

export function parseTravelGroup(
  id: string,
  data: Record<string, unknown> | undefined
): TravelGroup {
  const accessType = data?.accessType === "private" ? "private" : "public";
  const memberIds = sanitizeStringArray(data?.memberIds);
  const memberAvatarUrlsById = sanitizeStringRecord(data?.memberAvatarUrlsById);
  const memberLabelsById = sanitizeStringRecord(data?.memberLabelsById);
  const memberUsernamesById = sanitizeStringRecord(data?.memberUsernamesById);
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
    memberAvatarUrlsById,
    memberIds,
    memberLabelsById,
    memberUsernamesById,
    name: sanitizeString(data?.name, "Unnamed group"),
    photoUrl: sanitizeString(data?.photoUrl),
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

async function deleteGroupSubcollection(
  db: Firestore,
  groupId: string,
  subcollectionName: string
) {
  const subcollectionRef = collection(db, "groups", groupId, subcollectionName);

  while (true) {
    const snapshot = await getDocs(query(subcollectionRef, limit(GROUP_DELETE_BATCH_SIZE)));

    if (snapshot.empty) {
      break;
    }

    const batch = writeBatch(db);

    snapshot.docs.forEach((entryDocument) => {
      batch.delete(entryDocument.ref);
    });

    await batch.commit();

    if (snapshot.size < GROUP_DELETE_BATCH_SIZE) {
      break;
    }
  }
}

export async function deleteGroupWithMessages(db: Firestore, groupId: string) {
  await deleteGroupSubcollection(db, groupId, "messages");
  await deleteGroupSubcollection(db, groupId, "expenseRepayments");
  await deleteGroupSubcollection(db, groupId, "tripPresence");
  await deleteGroupSubcollection(db, groupId, "tripBoards");
  await deleteGroupSubcollection(db, groupId, "tripRecaps");

  await deleteDoc(doc(db, "groups", groupId));
}
