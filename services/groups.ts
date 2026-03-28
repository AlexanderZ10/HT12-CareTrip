import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  writeBatch,
  type QuerySnapshot,
  type DocumentData,
} from "firebase/firestore";

import { db } from "../firebase";
import {
  deleteGroupWithMessages,
  parseTravelGroup,
  type TravelGroup,
} from "../utils/groups";

// ── Types ────────────────────────────────────────────────────────────────────

export type CreateGroupData = {
  accessType: "public" | "private";
  creatorId: string;
  creatorLabel: string;
  description: string;
  invitedUserIds: string[];
  joinKeyNormalized: string | null;
  memberAvatarUrlsById?: Record<string, string>;
  memberUsernamesById?: Record<string, string>;
  name: string;
  profileAvatarUrl?: string;
  profileName?: string;
  username?: string;
};

export type JoinGroupMemberInfo = {
  profileAvatarUrl: string;
  profileName: string;
  username: string;
};

// ── Service functions ────────────────────────────────────────────────────────

/**
 * Subscribe to real-time updates on the entire groups collection.
 * Returns an unsubscribe function.
 */
export function subscribeToGroups(
  onData: (snapshot: QuerySnapshot<DocumentData>) => void,
  onError: (error: Error) => void
): () => void {
  return onSnapshot(collection(db, "groups"), onData, onError);
}

/**
 * Subscribe to real-time updates on the public profiles collection.
 * Returns an unsubscribe function.
 */
export function subscribeToPublicProfiles(
  onData: (snapshot: QuerySnapshot<DocumentData>) => void,
  onError: (error: Error) => void
): () => void {
  return onSnapshot(collection(db, "publicProfiles"), onData, onError);
}

/**
 * Subscribe to real-time updates on the trip requests collection.
 * Returns an unsubscribe function.
 */
export function subscribeToTripRequests(
  onData: (snapshot: QuerySnapshot<DocumentData>) => void,
  onError: (error: Error) => void
): () => void {
  return onSnapshot(collection(db, "tripRequests"), onData, onError);
}

/**
 * Create a new travel group document.
 * Returns the generated document reference.
 */
export async function createGroup(data: CreateGroupData) {
  const newGroupRef = doc(collection(db, "groups"));

  await setDoc(newGroupRef, {
    accessType: data.accessType,
    createdAt: serverTimestamp(),
    creatorId: data.creatorId,
    creatorLabel: data.creatorLabel,
    description: data.description,
    invitedUserIds: data.invitedUserIds,
    joinKeyNormalized: data.joinKeyNormalized,
    memberCount: 1,
    memberAvatarUrlsById: data.memberAvatarUrlsById ?? {
      [data.creatorId]: data.profileAvatarUrl ?? "",
    },
    memberIds: [data.creatorId],
    memberLabelsById: {
      [data.creatorId]: data.creatorLabel,
    },
    memberUsernamesById: data.memberUsernamesById ?? {
      [data.creatorId]: data.username ?? "",
    },
    name: data.name,
    photoUrl: "",
    updatedAt: serverTimestamp(),
  });

  return newGroupRef;
}

/**
 * Join an existing group using a Firestore transaction to prevent race
 * conditions on memberIds.
 */
export async function joinGroup(
  uid: string,
  groupId: string,
  memberInfo: JoinGroupMemberInfo
) {
  return runTransaction(db, async (transaction) => {
    const groupRef = doc(db, "groups", groupId);
    const groupSnapshot = await transaction.get(groupRef);

    if (!groupSnapshot.exists()) {
      throw new Error("missing-group");
    }

    const currentGroup = parseTravelGroup(
      groupSnapshot.id,
      groupSnapshot.data() as Record<string, unknown>
    );

    if (currentGroup.memberIds.includes(uid)) {
      return;
    }

    const nextMemberIds = [...currentGroup.memberIds, uid];

    transaction.update(groupRef, {
      memberCount: nextMemberIds.length,
      [`memberAvatarUrlsById.${uid}`]: memberInfo.profileAvatarUrl,
      memberIds: nextMemberIds,
      [`memberLabelsById.${uid}`]: memberInfo.profileName,
      [`memberUsernamesById.${uid}`]: memberInfo.username,
      updatedAt: serverTimestamp(),
    });
  });
}

/**
 * Delete a group and all of its sub-collection messages.
 * Delegates to the utility helper that handles batch deletion.
 */
export function deleteGroup(groupId: string) {
  return deleteGroupWithMessages(db, groupId);
}

/**
 * Create a new trip request document.
 */
export async function createTripRequest(params: {
  budgetLabel: string;
  creatorId: string;
  creatorLabel: string;
  destination: string;
  note: string;
  timingLabel: string;
  travelersLabel: string;
}) {
  const newRequestRef = doc(collection(db, "tripRequests"));

  await setDoc(newRequestRef, {
    budgetLabel: params.budgetLabel,
    createdAt: serverTimestamp(),
    creatorId: params.creatorId,
    creatorLabel: params.creatorLabel,
    destination: params.destination,
    groupId: null,
    interestedUserIds: [params.creatorId],
    note: params.note,
    status: "open",
    timingLabel: params.timingLabel,
    travelersLabel: params.travelersLabel,
    updatedAt: serverTimestamp(),
  });

  return newRequestRef;
}

/**
 * Toggle the current user's interest in a trip request using a transaction.
 */
export async function toggleTripRequestInterest(
  uid: string,
  requestId: string
) {
  const { parseTripRequest } = await import("../utils/trip-requests");

  return runTransaction(db, async (transaction) => {
    const requestRef = doc(db, "tripRequests", requestId);
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

    const nextInterestedUserIds = currentRequest.interestedUserIds.includes(uid)
      ? currentRequest.interestedUserIds.filter((id) => id !== uid)
      : [...currentRequest.interestedUserIds, uid];

    transaction.update(requestRef, {
      interestedUserIds: nextInterestedUserIds,
      updatedAt: serverTimestamp(),
    });
  });
}

/**
 * Close a trip request (set status to "closed") using a transaction.
 */
export async function closeTripRequest(requestId: string) {
  return runTransaction(db, async (transaction) => {
    const requestRef = doc(db, "tripRequests", requestId);
    const requestSnapshot = await transaction.get(requestRef);

    if (!requestSnapshot.exists()) {
      throw new Error("missing-request");
    }

    transaction.update(requestRef, {
      status: "closed",
      updatedAt: serverTimestamp(),
    });
  });
}

/**
 * Convert a trip request into a group and close the request atomically.
 * Returns the new group document reference.
 */
export async function createGroupFromTripRequest(params: {
  creatorId: string;
  creatorLabel: string;
  description: string;
  interestedUserIds: string[];
  name: string;
  requestId: string;
}) {
  const newGroupRef = doc(collection(db, "groups"));
  const requestRef = doc(db, "tripRequests", params.requestId);
  const batch = writeBatch(db);

  const invitedUserIds = Array.from(
    new Set(
      params.interestedUserIds.filter((id) => id !== params.creatorId)
    )
  );

  batch.set(newGroupRef, {
    accessType: "public",
    createdAt: serverTimestamp(),
    creatorId: params.creatorId,
    creatorLabel: params.creatorLabel,
    description: params.description,
    invitedUserIds,
    joinKeyNormalized: null,
    memberCount: 1,
    memberIds: [params.creatorId],
    name: params.name,
    updatedAt: serverTimestamp(),
  });

  batch.update(requestRef, {
    groupId: newGroupRef.id,
    status: "closed",
    updatedAt: serverTimestamp(),
  });

  await batch.commit();

  return newGroupRef;
}
