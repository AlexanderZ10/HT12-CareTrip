import {
  saveTripForUser as _saveTripForUser,
  removeSavedTripForUser as _removeSavedTripForUser,
  type SavedTrip,
} from "../utils/saved-trips";
import { doc, onSnapshot, type DocumentData, type DocumentSnapshot } from "firebase/firestore";

import { db } from "../firebase";

/**
 * Save a trip to the user's profile document.
 * Delegates to the existing utility which handles the Firestore transaction.
 */
export function saveTrip(uid: string, tripData: SavedTrip) {
  return _saveTripForUser(uid, tripData);
}

/**
 * Remove a saved trip from the user's profile by its sourceKey.
 * Returns the remaining saved trips after deletion.
 */
export function deleteTrip(uid: string, sourceKey: string) {
  return _removeSavedTripForUser(uid, sourceKey);
}

/**
 * Subscribe to real-time updates on the user's profile document.
 * The callback receives the raw snapshot so consumers can parse saved trips
 * and booking orders as needed.
 *
 * Returns an unsubscribe function.
 */
export function subscribeToSavedTrips(
  uid: string,
  onData: (snapshot: DocumentSnapshot<DocumentData>) => void,
  onError: (error: Error) => void
): () => void {
  return onSnapshot(doc(db, "profiles", uid), onData, onError);
}

// Re-export commonly needed types for consumers of this service.
export type { SavedTrip } from "../utils/saved-trips";
