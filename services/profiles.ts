import {
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
  type DocumentData,
  type DocumentSnapshot,
} from "firebase/firestore";

import { db } from "../firebase";
import {
  buildPublicProfilePayload,
  type ProfileVisibility,
} from "../utils/public-profiles";
import type { AppThemePreference } from "../components/app-theme-provider";

// ── Types ────────────────────────────────────────────────────────────────────

/** The shape of the profile-info sub-object stored in the profiles document. */
export type ProfileInfoData = {
  aboutMe: string;
  dreamDestinations: string;
  fullName: string;
  homeBase: string;
  stayStyle: string;
  travelPace: string;
};

/** The minimal data needed to seed a profile document at registration time. */
export type InitialProfileData = {
  email: string;
  onboardingCompleted: boolean;
  profileVisibility: ProfileVisibility;
  username: string;
};

/** Payload required for public-profile synchronisation helpers. */
export type PublicProfileContext = {
  email: string | null;
  profileInfo: ProfileInfoData;
  profilePhotoUrl: string;
  uid: string;
  username: string;
};

// ── Service functions ────────────────────────────────────────────────────────

/**
 * Create the initial profile document after registration.
 * Uses `setDoc` with merge so it can be retried safely.
 */
export function createInitialProfile(uid: string, data: InitialProfileData) {
  return setDoc(
    doc(db, "profiles", uid),
    {
      uid,
      email: data.email,
      profileVisibility: data.profileVisibility,
      username: data.username,
      onboardingCompleted: data.onboardingCompleted,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * Save profile information, visibility, and synchronise the public profile.
 * Mirrors the batch-write logic from the profile screen's handleSave.
 */
export async function saveProfileInfo(
  uid: string,
  params: {
    profileInfo: ProfileInfoData;
    profilePhotoUrl: string;
    profileVisibility: ProfileVisibility;
    publicProfileContext: PublicProfileContext;
    themePreference: AppThemePreference;
  }
) {
  const profileRef = doc(db, "profiles", uid);
  const publicProfileRef = doc(db, "publicProfiles", uid);
  const batch = writeBatch(db);

  batch.set(
    profileRef,
    {
      profilePhotoUrl: params.profilePhotoUrl,
      profileInfo: params.profileInfo,
      profileVisibility: params.profileVisibility,
      themePreference: params.themePreference,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  if (params.profileVisibility === "public") {
    batch.set(
      publicProfileRef,
      buildPublicProfilePayload(params.publicProfileContext)
    );
  } else {
    batch.delete(publicProfileRef);
  }

  return batch.commit();
}

/**
 * Update the profile photo URL in Firestore and synchronise the public profile
 * when visibility is public.
 */
export async function updateProfilePhoto(
  uid: string,
  url: string,
  profileVisibility: ProfileVisibility,
  publicProfileContext: PublicProfileContext
) {
  const profileRef = doc(db, "profiles", uid);
  const publicProfileRef = doc(db, "publicProfiles", uid);
  const batch = writeBatch(db);

  batch.set(
    profileRef,
    {
      profilePhotoUrl: url,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  if (profileVisibility === "public") {
    batch.set(
      publicProfileRef,
      buildPublicProfilePayload({
        ...publicProfileContext,
        profilePhotoUrl: url,
      })
    );
  }

  return batch.commit();
}

/**
 * Remove the profile photo (set to empty string) and synchronise the public
 * profile when visibility is public.
 */
export async function removeProfilePhoto(
  uid: string,
  profileVisibility: ProfileVisibility,
  publicProfileContext: PublicProfileContext
) {
  return updateProfilePhoto(uid, "", profileVisibility, {
    ...publicProfileContext,
    profilePhotoUrl: "",
  });
}

/**
 * Persist the user's theme preference to Firestore.
 */
export function updateThemePreference(
  uid: string,
  preference: AppThemePreference
) {
  return setDoc(
    doc(db, "profiles", uid),
    {
      themePreference: preference,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * Update profile visibility and synchronise the public-profiles collection.
 */
export async function updateProfileVisibility(
  uid: string,
  visibility: ProfileVisibility,
  profileInfo: ProfileInfoData,
  publicProfileContext: PublicProfileContext
) {
  await setDoc(
    doc(db, "profiles", uid),
    {
      profileInfo,
      profileVisibility: visibility,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  if (visibility === "public") {
    await setDoc(
      doc(db, "publicProfiles", uid),
      buildPublicProfilePayload(publicProfileContext),
      { merge: true }
    );
  } else {
    await deleteDoc(doc(db, "publicProfiles", uid));
  }
}

/**
 * Subscribe to real-time updates on a user's profile document.
 * Returns an unsubscribe function.
 */
export function subscribeToProfile(
  uid: string,
  onData: (snapshot: DocumentSnapshot<DocumentData>) => void,
  onError: (error: Error) => void
): () => void {
  return onSnapshot(doc(db, "profiles", uid), onData, onError);
}
