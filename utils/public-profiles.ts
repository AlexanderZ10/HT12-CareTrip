import { getProfileDisplayName } from "./profile-info";

export type ProfileVisibility = "public" | "private";

export type PublicProfile = {
  aboutMe: string;
  displayName: string;
  homeBase: string;
  id: string;
  uid: string;
  updatedAtMs: number | null;
  username: string;
  usernameLower: string;
};

function sanitizeString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
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

export function getProfileVisibility(value: unknown): ProfileVisibility {
  return value === "public" ? "public" : "private";
}

export function buildPublicProfilePayload(params: {
  email: string | null;
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
    displayName,
    homeBase: sanitizeString(params.profileInfo?.homeBase),
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
    displayName: sanitizeString(data?.displayName, "Traveler"),
    homeBase: sanitizeString(data?.homeBase),
    id,
    uid: sanitizeString(data?.uid, id),
    updatedAtMs: toMillis(data?.updatedAt),
    username: sanitizeString(data?.username),
    usernameLower: sanitizeString(data?.usernameLower).toLowerCase(),
  };
}
