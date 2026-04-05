import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";

import { db } from "../firebase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type JournalPhoto = {
  id: string;
  groupId: string;
  tripId: string | null;
  imageUri: string; // base64 data URI
  caption: string;
  location: string;
  creatorId: string;
  creatorLabel: string;
  createdAtMs: number;
};

// ---------------------------------------------------------------------------
// Sanitization helpers
// ---------------------------------------------------------------------------

function sanitizeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function toMillis(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (
    value &&
    typeof value === "object" &&
    "toMillis" in value &&
    typeof value.toMillis === "function"
  ) {
    return value.toMillis() as number;
  }

  return 0;
}

function sanitizeJournalPhoto(
  id: string,
  data: Record<string, unknown>
): JournalPhoto {
  return {
    id,
    groupId: sanitizeString(data.groupId),
    tripId: typeof data.tripId === "string" ? data.tripId : null,
    imageUri: sanitizeString(data.imageUri),
    caption: sanitizeString(data.caption),
    location: sanitizeString(data.location),
    creatorId: sanitizeString(data.creatorId),
    creatorLabel: sanitizeString(data.creatorLabel),
    createdAtMs: toMillis(data.createdAtMs),
  };
}

// ---------------------------------------------------------------------------
// CRUD functions
// ---------------------------------------------------------------------------

export async function addJournalPhoto(
  photo: Omit<JournalPhoto, "id" | "createdAtMs">
): Promise<string> {
  const docRef = await addDoc(collection(db, "journalPhotos"), {
    groupId: photo.groupId,
    tripId: photo.tripId ?? null,
    imageUri: photo.imageUri,
    caption: photo.caption,
    location: photo.location,
    creatorId: photo.creatorId,
    creatorLabel: photo.creatorLabel,
    createdAtMs: Date.now(),
    serverCreatedAt: serverTimestamp(),
  });

  return docRef.id;
}

export async function deleteJournalPhoto(photoId: string): Promise<void> {
  await deleteDoc(doc(db, "journalPhotos", photoId));
}

// ---------------------------------------------------------------------------
// Real-time listener
// ---------------------------------------------------------------------------

export function subscribeToJournalPhotos(
  groupId: string,
  callback: (photos: JournalPhoto[]) => void
): () => void {
  const q = query(
    collection(db, "journalPhotos"),
    where("groupId", "==", groupId),
    orderBy("createdAtMs", "desc")
  );

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const photos: JournalPhoto[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data() as Record<string, unknown>;
        return sanitizeJournalPhoto(docSnap.id, data);
      });

      callback(photos);
    },
    () => {
      callback([]);
    }
  );

  return unsubscribe;
}
