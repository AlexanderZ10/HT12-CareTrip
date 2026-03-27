export const TRAVEL_PACE_OPTIONS = [
  "Спокойно и бавно",
  "Баланс между почивка и активности",
  "Динамично и интензивно",
] as const;

export const STAY_STYLE_OPTIONS = [
  "Къщи за гости",
  "Бутикови хотели",
  "Уютни хотели",
  "Смесено",
] as const;

export type PersonalProfileInfo = {
  aboutMe: string;
  avatarUrl: string;
  dreamDestinations: string;
  fullName: string;
  homeBase: string;
  stayStyle: string;
  travelPace: string;
};

type RawProfileInfoData = {
  email?: string | null;
  profileInfo?: Partial<PersonalProfileInfo> | Record<string, unknown>;
  username?: string | null;
};

export function sanitizeProfileString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

export function extractPersonalProfile(profileData: RawProfileInfoData): PersonalProfileInfo {
  return {
    aboutMe: sanitizeProfileString(profileData.profileInfo?.aboutMe),
    avatarUrl: sanitizeProfileString(profileData.profileInfo?.avatarUrl),
    dreamDestinations: sanitizeProfileString(profileData.profileInfo?.dreamDestinations),
    fullName: sanitizeProfileString(profileData.profileInfo?.fullName),
    homeBase: sanitizeProfileString(profileData.profileInfo?.homeBase),
    stayStyle: sanitizeProfileString(profileData.profileInfo?.stayStyle),
    travelPace: sanitizeProfileString(profileData.profileInfo?.travelPace),
  };
}

export function getProfileDisplayName(profileData: RawProfileInfoData) {
  if (typeof profileData.username === "string" && profileData.username.trim()) {
    return profileData.username.trim();
  }

  const personalProfile = extractPersonalProfile(profileData);

  if (personalProfile.fullName) {
    return personalProfile.fullName;
  }

  if (typeof profileData.email === "string" && profileData.email.trim()) {
    return profileData.email.trim().split("@")[0] || "Traveler";
  }

  return "Traveler";
}
