import { getProfileDisplayName } from "./profile-info";
import { sanitizeString, toMillis } from "./sanitize";

export type ProfileVisibility = "public" | "private";

export type PublicProfile = {
  aboutMe: string;
  avatarUrl: string;
  displayName: string;
  homeBase: string;
  id: string;
  photoUrl: string;
  uid: string;
  updatedAtMs: number | null;
  username: string;
  usernameLower: string;
};

export function getProfileVisibility(value: unknown): ProfileVisibility {
  return value === "public" ? "public" : "private";
}

export function buildPublicProfilePayload(params: {
  email: string | null;
  profilePhotoUrl?: string | null;
  profileInfo?: Record<string, unknown>;
  uid: string;
  username: string;
}) {
  const displayName = getProfileDisplayName({
    email: params.email,
    profileInfo: params.profileInfo,
    username: params.username,
  });

  return {
    aboutMe: sanitizeString(params.profileInfo?.aboutMe),
    avatarUrl: sanitizeString(params.profileInfo?.avatarUrl),
    displayName,
    homeBase: sanitizeString(params.profileInfo?.homeBase),
    photoUrl: sanitizeString(params.profilePhotoUrl),
    uid: params.uid,
    updatedAt: Date.now(),
    username: sanitizeString(params.username),
    usernameLower: sanitizeString(params.username).toLowerCase(),
  };
}

export function parsePublicProfile(
  id: string,
  data: Record<string, unknown> | undefined
): PublicProfile {
  return {
    aboutMe: sanitizeString(data?.aboutMe),
    avatarUrl: sanitizeString(data?.avatarUrl),
    displayName: sanitizeString(data?.displayName, "Traveler"),
    homeBase: sanitizeString(data?.homeBase),
    id,
    photoUrl: sanitizeString(data?.photoUrl),
    uid: sanitizeString(data?.uid, id),
    updatedAtMs: toMillis(data?.updatedAt),
    username: sanitizeString(data?.username),
    usernameLower: sanitizeString(data?.usernameLower).toLowerCase(),
  };
}
