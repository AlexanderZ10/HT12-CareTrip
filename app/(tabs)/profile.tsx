import { MaterialIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { onAuthStateChanged, sendPasswordResetEmail, signOut } from "firebase/auth";
import {
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { AvatarSheet } from "../../features/profile/components/AvatarSheet";
import { ChoicePill, MiniToggle, SectionHeader, SettingsRow } from "../../features/profile/components/ProfileHelpers";
import { DismissKeyboard } from "../../components/dismiss-keyboard";
import { auth, db } from "../../firebase";
import { useAppLanguage } from "../../components/app-language-provider";
import {
  useAppTheme,
  type AppThemePreference,
} from "../../components/app-theme-provider";
import {
  getLanguageFlag,
  getLanguageLabel,
  LANGUAGE_OPTIONS,
  STAY_STYLE_KEYS,
  TRAVEL_PACE_KEYS,
  translateOnboardingOption,
  type AppLanguage,
} from "../../utils/translations";
import { getCitiesForCountry } from "../../utils/cities";
import { getCountriesSorted, getCountryName, type Country } from "../../utils/countries";
import { getFirestoreUserMessage } from "../../utils/firestore-errors";
import {
  extractPersonalProfile,
  getProfileDisplayName,
  type PersonalProfileInfo,
} from "../../utils/profile-info";
import {
  buildPublicProfilePayload,
  getProfileVisibility,
  type ProfileVisibility,
} from "../../utils/public-profiles";
import { extractDiscoverProfile } from "../../utils/trip-recommendations";
import {
  Radius,
  Spacing,
  TypeScale,
  FontWeight,
  shadow,
  ZIndex,
} from "../../constants/design-system";

// ── Types ──────────────────────────────────────────────────────────────────

type ProfileFormState = PersonalProfileInfo;

type FloatingNotice = {
  accentColor: string;
  id: number;
  message: string;
  textColor: string;
};

// ── Animation config ───────────────────────────────────────────────────────

const SPRING_BTN = { damping: 18, stiffness: 220 };
const SPRING_TOAST = { damping: 16, stiffness: 200 };
const TIMING_ENTRANCE = { duration: 340, easing: Easing.out(Easing.cubic) };

// ── Constants ──────────────────────────────────────────────────────────────

const EMPTY_FORM: ProfileFormState = {
  aboutMe: "",
  avatarUrl: "",
  dreamDestinations: "",
  fullName: "",
  homeBase: "",
  stayStyle: "",
  travelPace: "",
};

const PROFILE_PHOTO_MAX_LENGTH = 850000;

// ── Main component ─────────────────────────────────────────────────────────

export default function ProfileTabScreen() {
  const router = useRouter();
  const { colors, setThemePreference, themePreference } = useAppTheme();
  const { language, setLanguage, t } = useAppLanguage();
  const insets = useSafeAreaInsets();

  // ── State ──────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profileName, setProfileName] = useState("Traveler");
  const [email, setEmail] = useState("");
  const [profilePhotoUrl, setProfilePhotoUrl] = useState("");
  const [username, setUsername] = useState("");
  const [profileVisibility, setProfileVisibility] =
    useState<ProfileVisibility>("private");
  const [form, setForm] = useState<ProfileFormState>(EMPTY_FORM);
  const [error, setError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");
  const [updatingPhoto, setUpdatingPhoto] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [avatarSheetVisible, setAvatarSheetVisible] = useState(false);
  const [settingsMenuVisible, setSettingsMenuVisible] = useState(false);
  const [languageMenuVisible, setLanguageMenuVisible] = useState(false);
  const [countryPickerVisible, setCountryPickerVisible] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const [citySearch, setCitySearch] = useState("");
  const [pickerStep, setPickerStep] = useState<"country" | "city">("country");
  const [selectedCountryCode, setSelectedCountryCode] = useState("");
  const [floatingNotice, setFloatingNotice] = useState<FloatingNotice | null>(null);
  const [onboardingSummary, setOnboardingSummary] = useState<{
    assistance: string[];
    interests: string[];
    skills: string[];
  }>({
    assistance: [],
    interests: [],
    skills: [],
  });

  const floatingNoticeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Entrance animations (staggered) ────────────────────────────────────
  const avatarScale = useSharedValue(0.5);
  const avatarOp = useSharedValue(0);
  const sec1Op = useSharedValue(0);
  const sec1Y = useSharedValue(24);
  const sec2Op = useSharedValue(0);
  const sec2Y = useSharedValue(24);
  const sec3Op = useSharedValue(0);
  const sec3Y = useSharedValue(24);
  const sec4Op = useSharedValue(0);
  const sec4Y = useSharedValue(24);

  const triggerEntrance = useCallback(() => {
    avatarScale.value = withSpring(1, { damping: 14, stiffness: 160 });
    avatarOp.value = withTiming(1, { duration: 300 });
    sec1Op.value = withDelay(80, withTiming(1, TIMING_ENTRANCE));
    sec1Y.value = withDelay(80, withTiming(0, TIMING_ENTRANCE));
    sec2Op.value = withDelay(160, withTiming(1, TIMING_ENTRANCE));
    sec2Y.value = withDelay(160, withTiming(0, TIMING_ENTRANCE));
    sec3Op.value = withDelay(240, withTiming(1, TIMING_ENTRANCE));
    sec3Y.value = withDelay(240, withTiming(0, TIMING_ENTRANCE));
    sec4Op.value = withDelay(320, withTiming(1, TIMING_ENTRANCE));
    sec4Y.value = withDelay(320, withTiming(0, TIMING_ENTRANCE));
  }, []);

  const avatarAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: avatarScale.value }],
    opacity: avatarOp.value,
  }));
  const sec1Style = useAnimatedStyle(() => ({
    opacity: sec1Op.value,
    transform: [{ translateY: sec1Y.value }],
  }));
  const sec2Style = useAnimatedStyle(() => ({
    opacity: sec2Op.value,
    transform: [{ translateY: sec2Y.value }],
  }));
  const sec3Style = useAnimatedStyle(() => ({
    opacity: sec3Op.value,
    transform: [{ translateY: sec3Y.value }],
  }));
  const sec4Style = useAnimatedStyle(() => ({
    opacity: sec4Op.value,
    transform: [{ translateY: sec4Y.value }],
  }));

  // ── Floating notice (Reanimated + Gesture Handler) ─────────────────────
  const noticeTranslateY = useSharedValue(-120);
  const noticeOpacity = useSharedValue(0);
  const noticeAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: noticeTranslateY.value }],
    opacity: noticeOpacity.value,
  }));

  const clearNoticeState = useCallback(() => {
    if (floatingNoticeTimeoutRef.current) {
      clearTimeout(floatingNoticeTimeoutRef.current);
      floatingNoticeTimeoutRef.current = null;
    }
    setFloatingNotice(null);
  }, []);

  const dismissNotice = useCallback(() => {
    if (floatingNoticeTimeoutRef.current) {
      clearTimeout(floatingNoticeTimeoutRef.current);
      floatingNoticeTimeoutRef.current = null;
    }
    noticeTranslateY.value = withTiming(-120, { duration: 180 });
    noticeOpacity.value = withTiming(0, { duration: 180 }, (finished) => {
      if (finished) runOnJS(clearNoticeState)();
    });
  }, [clearNoticeState]);

  const noticePanGesture = useMemo(
    () =>
      Gesture.Pan()
        .onUpdate((e) => {
          if (e.translationY < 0) noticeTranslateY.value = e.translationY;
        })
        .onEnd((e) => {
          if (e.translationY < -36 || e.velocityY < -550) {
            noticeTranslateY.value = withTiming(-120, { duration: 180 });
            noticeOpacity.value = withTiming(0, { duration: 180 }, (finished) => {
              if (finished) runOnJS(clearNoticeState)();
            });
          } else {
            noticeTranslateY.value = withSpring(0, SPRING_TOAST);
          }
        }),
    [clearNoticeState]
  );

  const showFloatingNotice = useCallback(
    (message: string, accentColor: string, textColor: string) => {
      if (floatingNoticeTimeoutRef.current) {
        clearTimeout(floatingNoticeTimeoutRef.current);
        floatingNoticeTimeoutRef.current = null;
      }
      setFloatingNotice({ accentColor, id: Date.now(), message, textColor });
      noticeTranslateY.value = -120;
      noticeOpacity.value = 0;
      noticeTranslateY.value = withSpring(0, SPRING_TOAST);
      noticeOpacity.value = withTiming(1, { duration: 200 });
      floatingNoticeTimeoutRef.current = setTimeout(dismissNotice, 3000);
    },
    [dismissNotice]
  );

  const sortedCountries = useMemo(() => getCountriesSorted(language), [language]);
  const filteredCountries = useMemo(() => {
    const q = countrySearch.trim().toLowerCase();
    if (!q) return sortedCountries;
    return sortedCountries.filter((c) =>
      getCountryName(c, language).toLowerCase().includes(q)
    );
  }, [countrySearch, language, sortedCountries]);

  const citiesForSelected = useMemo(
    () => getCitiesForCountry(selectedCountryCode),
    [selectedCountryCode]
  );
  const filteredCities = useMemo(() => {
    const q = citySearch.trim().toLowerCase();
    if (!q) return citiesForSelected;
    return citiesForSelected.filter((c) =>
      c.name.toLowerCase().includes(q)
    );
  }, [citySearch, citiesForSelected]);

  const homeBaseParts = form.homeBase.split(", ");
  const homeBaseCity = homeBaseParts.length >= 2 ? homeBaseParts[0] : "";
  const homeBaseCountry = homeBaseParts.length >= 2 ? homeBaseParts.slice(1).join(", ") : form.homeBase;

  const handleSelectCountry = (country: Country) => {
    const countryName = getCountryName(country, language);
    updateField("homeBase", countryName);
    setCountrySearch("");
    setSelectedCountryCode(country.code);
    setPickerStep("city");
  };

  const handleSelectCity = (cityName: string) => {
    if (homeBaseCountry) {
      updateField("homeBase", `${cityName}, ${homeBaseCountry}`);
    }
    setCountryPickerVisible(false);
    setPickerStep("country");
    setSelectedCountryCode("");
    setCitySearch("");
    setCountrySearch("");
  };

  const closeHomeBasePicker = () => {
    setCountryPickerVisible(false);
    setPickerStep("country");
    setSelectedCountryCode("");
    setCitySearch("");
    setCountrySearch("");
  };

  // ── Save button press ──────────────────────────────────────────────────
  const saveBtnScale = useSharedValue(1);
  const saveBtnAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: saveBtnScale.value }],
  }));
  const selectedLanguageOption = useMemo(
    () => ({
      flag: getLanguageFlag(language),
      label: getLanguageLabel(language),
    }),
    [language]
  );

  // ── Effects ────────────────────────────────────────────────────────────
  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [profilePhotoUrl]);

  useEffect(
    () => () => {
      if (floatingNoticeTimeoutRef.current) clearTimeout(floatingNoticeTimeoutRef.current);
    },
    []
  );

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;
    let hasLoadedOnce = false;

    const unsubscribeAuth = onAuthStateChanged(auth, (nextUser) => {
      unsubscribeProfile?.();
      unsubscribeProfile = null;
      hasLoadedOnce = false;

      if (!nextUser) {
        setLoading(false);
        router.replace("/login");
        return;
      }

      setLoading(true);
      setError("");
      setSaveSuccess("");

      unsubscribeProfile = onSnapshot(
        doc(db, "profiles", nextUser.uid),
        (snap) => {
          if (!snap.exists()) {
            setLoading(false);
            router.replace("/onboarding");
            return;
          }

          const d = snap.data() as Record<string, unknown>;
          const personal = extractPersonalProfile({
            profileInfo:
              d.profileInfo && typeof d.profileInfo === "object"
                ? (d.profileInfo as Record<string, unknown>)
                : undefined,
          });
          const onboarding = extractDiscoverProfile(d);

          setProfileName(
            getProfileDisplayName({
              email: nextUser.email,
              profileInfo:
                d.profileInfo && typeof d.profileInfo === "object"
                  ? (d.profileInfo as Record<string, unknown>)
                  : undefined,
              username: typeof d.username === "string" ? d.username : null,
            })
          );
          setEmail(nextUser.email ?? "");
          setProfilePhotoUrl(
            typeof d.profilePhotoUrl === "string" ? d.profilePhotoUrl : ""
          );
          setUsername(
            typeof d.username === "string" ? d.username : ""
          );
          setProfileVisibility(getProfileVisibility(d.profileVisibility));
          setForm(personal);
          setOnboardingSummary({
            assistance: onboarding?.assistance.selectedOptions ?? [],
            interests: onboarding?.interests.selectedOptions ?? [],
            skills: onboarding?.skills.selectedOptions ?? [],
          });
          setLoading(false);
          if (!hasLoadedOnce) {
            hasLoadedOnce = true;
            triggerEntrance();
          }
        },
        (err) => {
          setError(getFirestoreUserMessage(err, "read", language));
          setLoading(false);
        }
      );
    });

    return () => {
      unsubscribeProfile?.();
      unsubscribeAuth();
    };
  }, [router, triggerEntrance]);

  // ── Handlers ───────────────────────────────────────────────────────────
  const updateField = (field: keyof ProfileFormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError("");
    setSaveSuccess("");
  };

  const readAssetDataUrl = async (asset: ImagePicker.ImagePickerAsset) => {
    const mimeType = asset.mimeType || "image/jpeg";
    if (asset.base64) return `data:${mimeType};base64,${asset.base64}`;
    const response = await fetch(asset.uri);
    const blob = await response.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => (typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not convert photo.")));
      reader.onerror = () => reject(new Error("Could not read photo."));
      reader.readAsDataURL(blob);
    });
  };

  const handleSave = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    try {
      setSaving(true);
      setError("");
      setSaveSuccess("");

      const nextProfileInfo = {
        aboutMe: form.aboutMe.trim(),
        dreamDestinations: form.dreamDestinations.trim(),
        fullName: form.fullName.trim(),
        homeBase: form.homeBase.trim(),
        stayStyle: form.stayStyle.trim(),
        travelPace: form.travelPace.trim(),
      };
      const profileRef = doc(db, "profiles", currentUser.uid);
      const publicProfileRef = doc(db, "publicProfiles", currentUser.uid);
      const batch = writeBatch(db);

      batch.set(
        profileRef,
        {
          profilePhotoUrl,
          profileInfo: nextProfileInfo,
          profileVisibility,
          themePreference,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      if (profileVisibility === "public") {
        batch.set(
          publicProfileRef,
          buildPublicProfilePayload({
            email: currentUser.email,
            profilePhotoUrl,
            profileInfo: nextProfileInfo,
            uid: currentUser.uid,
            username,
          })
        );
      } else {
        batch.delete(publicProfileRef);
      }

      await batch.commit();

      setSaveSuccess(t("profile.saved"));
    } catch (nextError) {
      setError(getFirestoreUserMessage(nextError, "write", language));
    } finally {
      setSaving(false);
    }
  };

  const handleThemePreferenceChange = async (nextThemePreference: AppThemePreference) => {
    const currentUser = auth.currentUser;

    if (!currentUser || nextThemePreference === themePreference) {
      return;
    }

    const previousThemePreference = themePreference;

    try {
      setThemePreference(nextThemePreference);
      setError("");
      setSaveSuccess("");

      await setDoc(
        doc(db, "profiles", currentUser.uid),
        {
          themePreference: nextThemePreference,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      showFloatingNotice(
        nextThemePreference === "dark" ? t("profile.dark") : t("profile.light"),
        colors.accent,
        colors.buttonTextOnAction
      );
    } catch (nextError) {
      setThemePreference(previousThemePreference);
      setError(getFirestoreUserMessage(nextError, "write", language));
    }
  };

  const handleLanguageChange = async (next: AppLanguage) => {
    const currentUser = auth.currentUser;

    if (!currentUser || next === language) {
      return;
    }

    const previous = language;

    try {
      setLanguageMenuVisible(false);
      setLanguage(next);
      setError("");
      setSaveSuccess("");

      await setDoc(
        doc(db, "profiles", currentUser.uid),
        {
          language: next,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      const label = LANGUAGE_OPTIONS.find((o) => o.code === next)?.label ?? next;
      showFloatingNotice(
        `${label}`,
        colors.accent,
        colors.buttonTextOnAction
      );
    } catch (nextError) {
      setLanguage(previous);
      setError(getFirestoreUserMessage(nextError, "write", language));
    }
  };

  const handleVisibilityChange = async (next: ProfileVisibility) => {
    if (saving || next === profileVisibility) return;
    try {
      setSaving(true);
      setError("");
      setSaveSuccess("");

      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const nextProfileInfo = {
        aboutMe: form.aboutMe.trim(),
        dreamDestinations: form.dreamDestinations.trim(),
        fullName: form.fullName.trim(),
        homeBase: form.homeBase.trim(),
        stayStyle: form.stayStyle.trim(),
        travelPace: form.travelPace.trim(),
      };

      await setDoc(
        doc(db, "profiles", currentUser.uid),
        {
          profileInfo: nextProfileInfo,
          profileVisibility: next,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      if (next === "public") {
        await setDoc(
          doc(db, "publicProfiles", currentUser.uid),
          buildPublicProfilePayload({
            email: currentUser.email,
            profilePhotoUrl,
            profileInfo: nextProfileInfo,
            uid: currentUser.uid,
            username,
          }),
          { merge: true }
        );
      } else {
        await deleteDoc(doc(db, "publicProfiles", currentUser.uid));
      }

      setProfileVisibility(next);
      showFloatingNotice(
        `${t("profile.visibility")}: ${
          next === "public" ? t("profile.public") : t("profile.private")
        }`,
        colors.accent,
        colors.buttonTextOnAction
      );
    } catch (nextError) {
      setError(getFirestoreUserMessage(nextError, "write", language));
    } finally {
      setSaving(false);
    }
  };

  const handlePickProfilePhoto = async () => {
    const currentUser = auth.currentUser;

    if (!currentUser || updatingPhoto) {
      return;
    }

    try {
      setUpdatingPhoto(true);
      setError("");
      setSaveSuccess("");

      const perm = Platform.OS === "web" ? { granted: true } : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { setError("Allow gallery access to choose a profile photo."); return; }

      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [1, 1],
        base64: true,
        mediaTypes: ["images"],
        quality: 0.35,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      const url = await readAssetDataUrl(result.assets[0]);

      if (url.length > PROFILE_PHOTO_MAX_LENGTH) {
        setError("Photo too large. Choose a smaller image.");
        return;
      }

      const profileRef = doc(db, "profiles", currentUser.uid);
      const publicProfileRef = doc(db, "publicProfiles", currentUser.uid);
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
            email: currentUser.email,
            profilePhotoUrl: url,
            profileInfo: form,
            uid: currentUser.uid,
            username,
          })
        );
      }

      await batch.commit();

      setProfilePhotoUrl(url);
      setAvatarSheetVisible(false);
      setSaveSuccess(t("profile.photoUpdated"));
    } catch (nextError) {
      setError(getFirestoreUserMessage(nextError, "write", language));
    } finally {
      setUpdatingPhoto(false);
    }
  };

  const handleRemoveProfilePhoto = async () => {
    const currentUser = auth.currentUser;

    if (!currentUser || !profilePhotoUrl || updatingPhoto) {
      return;
    }

    try {
      setUpdatingPhoto(true);
      setError("");
      setSaveSuccess("");

      const profileRef = doc(db, "profiles", currentUser.uid);
      const publicProfileRef = doc(db, "publicProfiles", currentUser.uid);
      const batch = writeBatch(db);

      batch.set(
        profileRef,
        {
          profilePhotoUrl: "",
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      if (profileVisibility === "public") {
        batch.set(
          publicProfileRef,
          buildPublicProfilePayload({
            email: currentUser.email,
            profilePhotoUrl: "",
            profileInfo: form,
            uid: currentUser.uid,
            username,
          })
        );
      }

      await batch.commit();

      setProfilePhotoUrl("");
      setAvatarSheetVisible(false);
      setSaveSuccess(t("profile.photoRemoved"));
    } catch (nextError) {
      setError(getFirestoreUserMessage(nextError, "write", language));
    } finally {
      setUpdatingPhoto(false);
    }
  };

  const handleLogout = async () => {
    try { await signOut(auth); router.replace("/login"); } catch (e) { setError(getFirestoreUserMessage(e, "write", language)); }
  };

  const handleResetPassword = async () => {
    const currentUser = auth.currentUser;

    if (!currentUser?.email || sendingReset) {
      return;
    }

    try {
      setSendingReset(true);
      setError("");
      setSaveSuccess("");
      await sendPasswordResetEmail(auth, currentUser.email);
      setSaveSuccess(
        `${t("profile.passwordResetSent")}${currentUser.email ? ` ${currentUser.email}` : ""}`
      );
    } catch (nextError) {
      setError(getFirestoreUserMessage(nextError, "write", language));
    } finally {
      setSendingReset(false);
    }
  };

  // ── Loading ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView
        style={[staticStyles.screen, { backgroundColor: colors.screen }]}
        edges={["top", "left", "right"]}
      >
        <View style={staticStyles.loaderWrap}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  const avatarUri = profilePhotoUrl.trim();
  const showAvatar = !!avatarUri && !avatarLoadFailed;

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <SafeAreaView
      style={[staticStyles.screen, { backgroundColor: colors.screen }]}
      edges={["top", "left", "right"]}
    >
      <DismissKeyboard>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 8 : 0}
      >
      <ScrollView
        contentContainerStyle={staticStyles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/* ── Instagram-style top bar: brand title + settings menu ── */}
        <View style={staticStyles.topBar}>
          <Text style={[staticStyles.brandTitle, { color: colors.textPrimary }]} numberOfLines={1}>
            {t("tab.profile")}
          </Text>
          <TouchableOpacity accessibilityLabel="Settings menu" activeOpacity={0.7} onPress={() => setSettingsMenuVisible(true)} style={staticStyles.topBarIconButton}>
            <MaterialIcons name="menu" size={28} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* ───────── 1. Avatar + identity ───────── */}
        <Animated.View style={[staticStyles.profileHeader, avatarAnimStyle]}>
          <Pressable
            style={[
              staticStyles.avatarRingBase,
              {
                backgroundColor: colors.card,
                borderColor: colors.accent,
                ...shadow("md"),
              },
            ]}
            onPress={() => !updatingPhoto && setAvatarSheetVisible(true)}
          >
            {showAvatar ? (
              <Image
                source={{ uri: avatarUri }}
                style={staticStyles.avatarImage}
                contentFit="cover"
                onError={() => setAvatarLoadFailed(true)}
              />
            ) : (
              <MaterialIcons name="person" size={48} color={colors.textMuted} />
            )}
            <View style={[staticStyles.avatarBadgeBase, { backgroundColor: colors.accent, borderColor: colors.card }]}>
              {updatingPhoto ? (
                <ActivityIndicator size={12} color={colors.buttonTextOnAction} />
              ) : (
                <MaterialIcons name="camera-alt" size={14} color={colors.buttonTextOnAction} />
              )}
            </View>
          </Pressable>
          <Text style={[staticStyles.profileNameText, { color: colors.textPrimary }]}>
            {profileName}
          </Text>
          {username ? (
            <Text style={[staticStyles.profileEmailText, { color: colors.textMuted }]}>
              @{username}
            </Text>
          ) : null}
          <Text style={[staticStyles.profileEmailText, { color: colors.textMuted }]}>
            {email || t("common.noEmail")}
          </Text>
        </Animated.View>

        {/* ───────── Feedback banners ───────── */}
        {error ? (
          <View
            style={[
              staticStyles.banner,
              { backgroundColor: colors.errorBackground, borderColor: colors.errorBorder },
            ]}
          >
            <MaterialIcons name="error-outline" size={16} color={colors.errorText} />
            <Text style={[staticStyles.bannerText, { color: colors.errorText }]}>{error}</Text>
          </View>
        ) : null}
        {saveSuccess ? (
          <View
            style={[
              staticStyles.banner,
              { backgroundColor: colors.successBackground, borderColor: colors.successBorder },
            ]}
          >
            <MaterialIcons name="check-circle-outline" size={16} color={colors.successText} />
            <Text style={[staticStyles.bannerText, { color: colors.successText }]}>{saveSuccess}</Text>
          </View>
        ) : null}

        {/* ───────── 2. Appearance & privacy ───────── */}
        <Animated.View style={sec1Style}>
          <SectionHeader title={t("profile.appearance")} color={colors.textMuted} />
          <View style={[staticStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[staticStyles.miniLabel, { color: colors.textSecondary }]}>
              {t("profile.theme")}
            </Text>
            <View style={staticStyles.toggleRow}>
              <MiniToggle
                icon="light-mode"
                label={t("profile.light")}
                active={themePreference === "light"}
                onPress={() => void handleThemePreferenceChange("light")}
                accentColor={colors.accent}
                cardBg={colors.card}
                cardBorder={colors.border}
                textColor={colors.textSecondary}
                activeTextColor={colors.buttonTextOnAction}
              />
              <MiniToggle
                icon="dark-mode"
                label={t("profile.dark")}
                active={themePreference === "dark"}
                onPress={() => void handleThemePreferenceChange("dark")}
                accentColor={colors.accent}
                cardBg={colors.card}
                cardBorder={colors.border}
                textColor={colors.textSecondary}
                activeTextColor={colors.buttonTextOnAction}
              />
            </View>
            <View style={[staticStyles.divider, { backgroundColor: colors.border }]} />
            <Text style={[staticStyles.miniLabel, { color: colors.textSecondary }]}>
              {t("profile.visibility")}
            </Text>
            <View style={staticStyles.toggleRow}>
              <MiniToggle
                icon="public"
                label={t("profile.public")}
                active={profileVisibility === "public"}
                onPress={() => void handleVisibilityChange("public")}
                accentColor={colors.accent}
                cardBg={colors.card}
                cardBorder={colors.border}
                textColor={colors.textSecondary}
                activeTextColor={colors.buttonTextOnAction}
              />
              <MiniToggle
                icon="lock-outline"
                label={t("profile.private")}
                active={profileVisibility === "private"}
                onPress={() => void handleVisibilityChange("private")}
                accentColor={colors.accent}
                cardBg={colors.card}
                cardBorder={colors.border}
                textColor={colors.textSecondary}
                activeTextColor={colors.buttonTextOnAction}
              />
            </View>
            <View style={[staticStyles.divider, { backgroundColor: colors.border }]} />
            <Text style={[staticStyles.miniLabel, { color: colors.textSecondary }]}>
              {t("profile.language")}
            </Text>
            <Pressable
              onPress={() => setLanguageMenuVisible(true)}
              style={[
                staticStyles.languageMenuTrigger,
                {
                  backgroundColor: colors.inputBackground,
                  borderColor: colors.inputBorder,
                },
              ]}
            >
              <View style={staticStyles.languageMenuTriggerTextWrap}>
                <Text style={staticStyles.languageFlag}>{selectedLanguageOption.flag}</Text>
                <Text style={[staticStyles.languageLabel, { color: colors.textPrimary }]}>
                  {selectedLanguageOption.label}
                </Text>
              </View>
              <MaterialIcons name="expand-more" size={22} color={colors.textMuted} />
            </Pressable>
          </View>
        </Animated.View>

        {/* ───────── 3. About you ───────── */}
        <Animated.View style={sec2Style}>
          <SectionHeader title={t("profile.aboutYou")} color={colors.textMuted} />
          <View style={[staticStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[staticStyles.fieldLabel, { color: colors.textSecondary }]}>
              {t("profile.homeBase")}
            </Text>
            <Pressable
              style={[
                staticStyles.input,
                staticStyles.homeBaseSelector,
                {
                  backgroundColor: colors.inputBackground,
                  borderColor: colors.inputBorder,
                },
              ]}
              onPress={() => setCountryPickerVisible(true)}
            >
              <Text
                style={[
                  staticStyles.homeBaseSelectorText,
                  { color: form.homeBase ? colors.textPrimary : colors.inputPlaceholder },
                ]}
                numberOfLines={1}
              >
                {form.homeBase || t("profile.selectCountry")}
              </Text>
              <MaterialIcons name="expand-more" size={20} color={colors.textMuted} />
            </Pressable>

            <Text style={[staticStyles.fieldLabel, { color: colors.textSecondary }]}>
              {t("profile.travelPace")}
            </Text>
            <View style={staticStyles.pillsRow}>
              {TRAVEL_PACE_KEYS.map((k) => {
                const label = t(k);
                return (
                  <ChoicePill
                    key={k}
                    label={label}
                    selected={translateOnboardingOption(form.travelPace, language) === label}
                    onPress={() => updateField("travelPace", label)}
                    accentColor={colors.accent}
                    cardBg={colors.card}
                    cardBorder={colors.border}
                    textColor={colors.textSecondary}
                    selectedTextColor={colors.buttonTextOnAction}
                  />
                );
              })}
            </View>

            <Text style={[staticStyles.fieldLabel, { color: colors.textSecondary }]}>
              {t("profile.stayStyle")}
            </Text>
            <View style={staticStyles.pillsRow}>
              {STAY_STYLE_KEYS.map((k) => {
                const label = t(k);
                return (
                  <ChoicePill
                    key={k}
                    label={label}
                    selected={translateOnboardingOption(form.stayStyle, language) === label}
                    onPress={() => updateField("stayStyle", label)}
                    accentColor={colors.accent}
                    cardBg={colors.card}
                    cardBorder={colors.border}
                    textColor={colors.textSecondary}
                    selectedTextColor={colors.buttonTextOnAction}
                  />
                );
              })}
            </View>

            <Text style={[staticStyles.fieldLabel, { color: colors.textSecondary }]}>
              {t("profile.bio")}
            </Text>
            <TextInput
              style={[
                staticStyles.input,
                staticStyles.textArea,
                {
                  backgroundColor: colors.inputBackground,
                  borderColor: colors.inputBorder,
                  color: colors.textPrimary,
                },
              ]}
              placeholder={t("profile.bioPlaceholder")}
              placeholderTextColor={colors.inputPlaceholder}
              value={form.aboutMe}
              onChangeText={(v) => updateField("aboutMe", v)}
              multiline
            />

            <Animated.View style={saveBtnAnimStyle}>
              <Pressable
                style={[
                  staticStyles.primaryBtn,
                  { backgroundColor: colors.accent },
                  saving && staticStyles.disabled,
                ]}
                onPress={() => void handleSave()}
                onPressIn={() => { saveBtnScale.value = withSpring(0.96, SPRING_BTN); }}
                onPressOut={() => { saveBtnScale.value = withSpring(1, SPRING_BTN); }}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color={colors.buttonTextOnAction} size="small" />
                ) : (
                  <Text style={[staticStyles.primaryBtnText, { color: colors.buttonTextOnAction }]}>{t("profile.saveChanges")}</Text>
                )}
              </Pressable>
            </Animated.View>
          </View>
        </Animated.View>

        {/* ───────── 4. Travel preferences (onboarding) ───────── */}
        <Animated.View style={sec3Style}>
          <SectionHeader title={t("profile.travelPreferences")} color={colors.textMuted} />
          <View style={[staticStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {([
              [t("profile.interests"), onboardingSummary.interests],
              [t("profile.accessibilityLabel"), onboardingSummary.assistance],
              [t("profile.skills"), onboardingSummary.skills],
            ] as [string, readonly string[]][]).map(([label, items]) => (
              <View key={label} style={staticStyles.prefBlock}>
                <Text style={[staticStyles.prefTitle, { color: colors.textPrimary }]}>{label}</Text>
                <View style={staticStyles.chipsRow}>
                  {items.length === 0 ? (
                    <Text style={[staticStyles.prefEmpty, { color: colors.textMuted }]}>{t("profile.noneSelected")}</Text>
                  ) : (
                    items.map((item) => (
                      <View key={item} style={[staticStyles.readChip, { backgroundColor: colors.accentMuted }]}>
                        <Text style={[staticStyles.readChipText, { color: colors.textPrimary }]}>{translateOnboardingOption(item, language)}</Text>
                      </View>
                    ))
                  )}
                </View>
              </View>
            ))}

            <Pressable
              style={[staticStyles.outlineBtn, { borderColor: colors.accent }]}
              onPress={() => router.push("/onboarding")}
            >
              <MaterialIcons name="edit" size={16} color={colors.accent} />
              <Text style={[staticStyles.outlineBtnText, { color: colors.accent }]}>
                {t("profile.editPreferences")}
              </Text>
            </Pressable>
          </View>
        </Animated.View>

        {/* ───────── 5. Account actions ───────── */}
        <Animated.View style={sec4Style}>
          <SectionHeader title={t("profile.account")} color={colors.textMuted} />
          <View style={[staticStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <SettingsRow
              icon="lock-reset"
              label={t("profile.changePassword")}
              onPress={() => void handleResetPassword()}
              colors={colors}
              loading={sendingReset}
            />
            <SettingsRow
              icon="logout"
              label={t("profile.signOut")}
              onPress={() => void handleLogout()}
              colors={colors}
              destructive
            />
          </View>
        </Animated.View>

        <View style={staticStyles.footer} />
      </ScrollView>
      </KeyboardAvoidingView>
      </DismissKeyboard>

      {/* ───────── Floating notice ───────── */}
      {floatingNotice ? (
        <GestureDetector gesture={noticePanGesture}>
          <Animated.View
            style={[
              staticStyles.toast,
              { backgroundColor: floatingNotice.accentColor },
              noticeAnimStyle,
            ]}
          >
            <Text style={[staticStyles.toastText, { color: floatingNotice.textColor }]}>
              {floatingNotice.message}
            </Text>
          </Animated.View>
        </GestureDetector>
      ) : null}

      {/* ───────── Avatar sheet ───────── */}
      <AvatarSheet
        visible={avatarSheetVisible}
        onClose={() => setAvatarSheetVisible(false)}
        showAvatar={showAvatar}
        onPickPhoto={() => void handlePickProfilePhoto()}
        onRemovePhoto={() => void handleRemoveProfilePhoto()}
        updatingPhoto={updatingPhoto}
        colors={colors}
      />

      <Modal
        animationType="none"
        transparent
        visible={languageMenuVisible}
        onRequestClose={() => setLanguageMenuVisible(false)}
      >
        <Pressable
          style={[staticStyles.modalOverlay, { backgroundColor: colors.modalOverlay }]}
          onPress={() => setLanguageMenuVisible(false)}
        >
          <Pressable
            style={[
              staticStyles.languageMenuSheet,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                marginTop: insets.top + Spacing.xl,
              },
            ]}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={staticStyles.languageMenuHeader}>
              <Text style={[staticStyles.languageMenuTitle, { color: colors.textPrimary }]}>
                {t("profile.language")}
              </Text>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setLanguageMenuVisible(false)}
                style={[
                  staticStyles.languageMenuCloseButton,
                  {
                    backgroundColor: colors.inputBackground,
                    borderColor: colors.inputBorder,
                  },
                ]}
              >
                <MaterialIcons name="close" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {LANGUAGE_OPTIONS.map((option) => {
              const isActive = option.code === language;

              return (
                <Pressable
                  key={option.code}
                  onPress={() => void handleLanguageChange(option.code)}
                  style={[
                    staticStyles.languageMenuItem,
                    {
                      backgroundColor: isActive ? colors.accentMuted : colors.inputBackground,
                      borderColor: isActive ? colors.accent : colors.inputBorder,
                    },
                  ]}
                >
                  <View style={staticStyles.languageMenuItemTextWrap}>
                    <Text style={staticStyles.languageFlag}>{option.flag}</Text>
                    <Text style={[staticStyles.languageLabel, { color: colors.textPrimary }]}>
                      {option.label}
                    </Text>
                  </View>
                  {isActive ? (
                    <MaterialIcons name="check-circle" size={20} color={colors.accent} />
                  ) : (
                    <MaterialIcons
                      name="radio-button-unchecked"
                      size={20}
                      color={colors.textMuted}
                    />
                  )}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ───────── Home base picker (country → city) ───────── */}
      <Modal
        animationType="none"
        transparent
        visible={countryPickerVisible}
        onRequestClose={closeHomeBasePicker}
      >
        <Pressable
          style={[staticStyles.modalOverlay, { backgroundColor: colors.modalOverlay }]}
          onPress={closeHomeBasePicker}
        >
          <Pressable
            style={[
              staticStyles.countryPickerSheet,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={staticStyles.countryPickerHeader}>
              <Text style={[staticStyles.countryPickerTitle, { color: colors.textPrimary }]}>
                {pickerStep === "country" ? t("profile.selectCountry") : t("profile.enterCity")}
              </Text>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={closeHomeBasePicker}
                style={[
                  staticStyles.countryPickerCloseButton,
                  { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder },
                ]}
              >
                <MaterialIcons name="close" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {pickerStep === "country" ? (
              <>
                <TextInput
                  style={[
                    staticStyles.countrySearchInput,
                    {
                      backgroundColor: colors.inputBackground,
                      borderColor: colors.inputBorder,
                      color: colors.textPrimary,
                    },
                  ]}
                  placeholder={t("profile.searchCountry")}
                  placeholderTextColor={colors.inputPlaceholder}
                  value={countrySearch}
                  onChangeText={setCountrySearch}
                  autoFocus
                />
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  {filteredCountries.map((country) => {
                    const name = getCountryName(country, language);
                    const isSelected = homeBaseCountry === name;
                    return (
                      <Pressable
                        key={country.code}
                        style={[
                          staticStyles.countryItem,
                          isSelected && { backgroundColor: colors.accentMuted },
                        ]}
                        onPress={() => handleSelectCountry(country)}
                      >
                        <Text
                          style={[
                            staticStyles.countryItemText,
                            { color: isSelected ? colors.accent : colors.textPrimary },
                            isSelected && { fontWeight: FontWeight.semibold },
                          ]}
                        >
                          {name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </>
            ) : (
              <>
                <Pressable
                  style={[staticStyles.countryItem, { backgroundColor: colors.accentMuted }]}
                  onPress={() => {
                    setPickerStep("country");
                    setCitySearch("");
                  }}
                >
                  <Text style={[staticStyles.countryItemText, { color: colors.accent, fontWeight: FontWeight.semibold }]}>
                    ← {homeBaseCountry}
                  </Text>
                </Pressable>
                <TextInput
                  style={[
                    staticStyles.countrySearchInput,
                    {
                      backgroundColor: colors.inputBackground,
                      borderColor: colors.inputBorder,
                      color: colors.textPrimary,
                    },
                  ]}
                  placeholder={t("profile.searchCountry")}
                  placeholderTextColor={colors.inputPlaceholder}
                  value={citySearch}
                  onChangeText={setCitySearch}
                  autoFocus
                />
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  {filteredCities.map((city) => {
                    const name = city.name;
                    const isSelected = homeBaseCity === name;
                    return (
                      <Pressable
                        key={name}
                        style={[
                          staticStyles.countryItem,
                          isSelected && { backgroundColor: colors.accentMuted },
                        ]}
                        onPress={() => handleSelectCity(name)}
                      >
                        <Text
                          style={[
                            staticStyles.countryItemText,
                            { color: isSelected ? colors.accent : colors.textPrimary },
                            isSelected && { fontWeight: FontWeight.semibold },
                          ]}
                        >
                          {name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ───────── Settings menu (bottom-right panel) ───────── */}
      <Modal
        animationType="fade"
        transparent
        visible={settingsMenuVisible}
        onRequestClose={() => setSettingsMenuVisible(false)}
      >
        <View style={[staticStyles.settingsBackdrop, { backgroundColor: colors.modalOverlay }]}>
          <Pressable style={staticStyles.settingsDismissArea} onPress={() => setSettingsMenuVisible(false)} />
          <View
            style={[
              staticStyles.settingsCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                paddingBottom: insets.bottom + Spacing.lg,
              },
            ]}
          >
            <View style={staticStyles.settingsHeader}>
              <View>
                <Text style={[staticStyles.settingsTitle, { color: colors.textPrimary }]}>
                  {t("profile.account")}
                </Text>
                <Text style={[staticStyles.settingsSubtitle, { color: colors.textSecondary }]}>
                  {email}
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setSettingsMenuVisible(false)}
                style={[staticStyles.settingsCloseBtn, { backgroundColor: colors.cardAlt }]}
              >
                <MaterialIcons name="close" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                setSettingsMenuVisible(false);
                router.push("/onboarding");
              }}
              style={[staticStyles.settingsRow, { borderColor: colors.border }]}
            >
              <View style={[staticStyles.settingsRowIcon, { backgroundColor: colors.accentMuted }]}>
                <MaterialIcons name="tune" size={20} color={colors.accent} />
              </View>
              <View style={staticStyles.settingsRowTextWrap}>
                <Text style={[staticStyles.settingsRowLabel, { color: colors.textPrimary }]}>
                  {t("profile.editPreferences")}
                </Text>
                <Text style={[staticStyles.settingsRowHint, { color: colors.textSecondary }]}>
                  Travel style, interests, skills
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color={colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              disabled={sendingReset}
              onPress={() => {
                setSettingsMenuVisible(false);
                void handleResetPassword();
              }}
              style={[staticStyles.settingsRow, { borderColor: colors.border }]}
            >
              <View style={[staticStyles.settingsRowIcon, { backgroundColor: colors.inputBackground }]}>
                <MaterialIcons name="lock-reset" size={20} color={colors.textPrimary} />
              </View>
              <View style={staticStyles.settingsRowTextWrap}>
                <Text style={[staticStyles.settingsRowLabel, { color: colors.textPrimary }]}>
                  {t("profile.changePassword")}
                </Text>
                <Text style={[staticStyles.settingsRowHint, { color: colors.textSecondary }]}>
                  Send a reset email
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color={colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                setSettingsMenuVisible(false);
                void handleLogout();
              }}
              style={[staticStyles.settingsRow, { borderColor: "transparent" }]}
            >
              <View style={[staticStyles.settingsRowIcon, { backgroundColor: colors.errorBackground }]}>
                <MaterialIcons name="logout" size={20} color={colors.error} />
              </View>
              <View style={staticStyles.settingsRowTextWrap}>
                <Text style={[staticStyles.settingsRowLabel, { color: colors.error }]}>
                  {t("profile.signOut")}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── Static styles ──────────────────────────────────────────────────────────

const staticStyles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  loaderWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  // ── Instagram-style top bar ──
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
    minHeight: 48,
  },
  brandTitle: {
    fontSize: 28,
    fontWeight: FontWeight.black,
    letterSpacing: 0.3,
  },
  topBarIconButton: {
    padding: 4,
  },
  profileHeader: {
    alignItems: "center",
    marginBottom: Spacing["2xl"],
    paddingTop: Spacing.sm,
  },
  avatarRingBase: {
    width: 104,
    height: 104,
    borderRadius: Radius.full,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginBottom: Spacing.md,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: Radius.full,
  },
  avatarBadgeBase: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  profileNameText: {
    ...TypeScale.headingMd,
    marginBottom: Spacing.xs,
  },
  profileEmailText: {
    ...TypeScale.bodyMd,
  },
  toggleRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  languageFlag: {
    fontSize: 18,
  },
  languageLabel: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.semibold,
  },
  languageMenuTrigger: {
    minHeight: 52,
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingHorizontal: Spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  languageMenuTriggerTextWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  pillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  disabled: {
    opacity: 0.55,
  },
  prefBlock: {
    marginBottom: Spacing.lg,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  toast: {
    position: "absolute",
    top: Spacing.lg,
    left: Spacing.lg,
    right: Spacing.lg,
    zIndex: ZIndex.toast,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    ...shadow("xl"),
  },
  toastText: {
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.bold,
  },
  footer: {
    height: Spacing["4xl"],
  },
  // Banner
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    marginBottom: Spacing.lg,
  },
  bannerText: {
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.semibold,
    flex: 1,
  },

  // Cards
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.lg,
    marginBottom: Spacing["2xl"],
  },
  miniLabel: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.semibold,
    marginBottom: Spacing.sm,
  },
  divider: {
    height: 1,
    marginVertical: Spacing.lg,
  },

  // Form
  fieldLabel: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.semibold,
    marginBottom: Spacing.sm,
    marginTop: Spacing.lg,
  },
  input: {
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    ...TypeScale.bodyMd,
    minHeight: 48,
  },
  primaryBtn: {
    borderRadius: Radius.md,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.xl,
  },
  primaryBtnText: {
    ...TypeScale.titleMd,
    fontWeight: FontWeight.bold,
  },

  // Preferences
  prefTitle: {
    ...TypeScale.titleSm,
    fontWeight: FontWeight.semibold,
    marginBottom: Spacing.xs,
  },
  prefEmpty: {
    ...TypeScale.bodySm,
    fontStyle: "italic",
  },
  readChip: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  readChipText: {
    ...TypeScale.labelMd,
    fontWeight: FontWeight.semibold,
  },
  outlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
  },
  outlineBtnText: {
    ...TypeScale.titleSm,
    fontWeight: FontWeight.semibold,
  },
  modalOverlay: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  languageMenuSheet: {
    borderRadius: Radius["2xl"],
    borderWidth: 1,
    padding: Spacing.lg,
    ...shadow("lg"),
  },
  languageMenuHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  languageMenuTitle: {
    ...TypeScale.titleLg,
    fontWeight: FontWeight.bold,
  },
  languageMenuCloseButton: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  languageMenuItem: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    minHeight: 54,
    paddingHorizontal: Spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.sm,
  },
  languageMenuItemTextWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  homeBaseSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  homeBaseSelectorText: {
    flex: 1,
    ...TypeScale.bodyMd,
  },
  countryPickerSheet: {
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    maxHeight: "80%",
    width: "92%",
    alignSelf: "center",
  },
  countryPickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  countryPickerTitle: {
    ...TypeScale.titleLg,
    fontWeight: FontWeight.bold,
  },
  countryPickerCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  countrySearchInput: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.md,
    ...TypeScale.bodyMd,
  },
  countryItem: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.sm,
    marginBottom: 2,
  },
  countryItemText: {
    ...TypeScale.bodyMd,
  },
  // ── Settings menu (bottom-right panel) ──
  settingsBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
  },
  settingsDismissArea: {
    flex: 1,
  },
  settingsCard: {
    borderTopLeftRadius: Radius["3xl"],
    borderTopRightRadius: Radius["3xl"],
    borderWidth: 1,
    borderBottomWidth: 0,
    padding: Spacing.lg,
    ...shadow("xl"),
  },
  settingsHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.lg,
  },
  settingsTitle: {
    ...TypeScale.headingMd,
    fontWeight: FontWeight.extrabold,
  },
  settingsSubtitle: {
    ...TypeScale.bodySm,
    marginTop: Spacing.xs,
  },
  settingsCloseBtn: {
    alignItems: "center",
    borderRadius: Radius.full,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  settingsRow: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: Spacing.md,
    paddingVertical: Spacing.md,
  },
  settingsRowIcon: {
    alignItems: "center",
    borderRadius: Radius.lg,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  settingsRowTextWrap: {
    flex: 1,
  },
  settingsRowLabel: {
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.bold,
  },
  settingsRowHint: {
    ...TypeScale.bodySm,
    marginTop: 2,
  },
});
