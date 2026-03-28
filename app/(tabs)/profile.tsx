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

import { DismissKeyboard } from "../../components/dismiss-keyboard";
import { auth, db } from "../../firebase";
import {
  useAppTheme,
  type AppThemePreference,
} from "../../components/app-theme-provider";
import { getFirestoreUserMessage } from "../../utils/firestore-errors";
import {
  extractPersonalProfile,
  getProfileDisplayName,
  STAY_STYLE_OPTIONS,
  TRAVEL_PACE_OPTIONS,
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

// ── Helpers ────────────────────────────────────────────────────────────────

function SectionHeader({
  title,
  color,
}: {
  title: string;
  color: string;
}) {
  return (
    <Text
      style={[
        staticStyles.sectionHeader,
        { color },
      ]}
    >
      {title}
    </Text>
  );
}

function SettingsRow({
  icon,
  label,
  onPress,
  colors,
  loading: isLoading,
  destructive,
  trailing,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  onPress: () => void;
  colors: { textPrimary: string; border: string; accent: string; textMuted: string; errorText: string };
  loading?: boolean;
  destructive?: boolean;
  trailing?: string;
}) {
  const color = destructive ? colors.errorText : colors.textPrimary;
  return (
    <Pressable
      style={[staticStyles.settingsRow, { borderBottomColor: colors.border }]}
      onPress={onPress}
      disabled={isLoading}
    >
      <MaterialIcons name={icon} size={20} color={color} />
      <Text style={[staticStyles.settingsRowLabel, { color }]}>{label}</Text>
      {isLoading ? (
        <ActivityIndicator size="small" color={colors.accent} />
      ) : trailing ? (
        <Text style={[staticStyles.settingsRowTrailing, { color: colors.textMuted }]}>
          {trailing}
        </Text>
      ) : (
        <MaterialIcons name="chevron-right" size={20} color={colors.textMuted} />
      )}
    </Pressable>
  );
}

function ChoicePill({
  label,
  onPress,
  selected,
  accentColor,
  cardBg,
  cardBorder,
  textColor,
  selectedTextColor,
}: {
  label: string;
  onPress: () => void;
  selected: boolean;
  accentColor: string;
  cardBg: string;
  cardBorder: string;
  textColor: string;
  selectedTextColor: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        staticStyles.pill,
        {
          backgroundColor: selected ? accentColor : cardBg,
          borderColor: selected ? accentColor : cardBorder,
        },
      ]}
    >
      <Text
        style={[
          staticStyles.pillText,
          { color: selected ? selectedTextColor : textColor },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function MiniToggle({
  icon,
  label,
  active,
  onPress,
  accentColor,
  cardBg,
  cardBorder,
  textColor,
  activeTextColor,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  active: boolean;
  onPress: () => void;
  accentColor: string;
  cardBg: string;
  cardBorder: string;
  textColor: string;
  activeTextColor: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        staticStyles.miniToggle,
        {
          backgroundColor: active ? accentColor : cardBg,
          borderColor: active ? accentColor : cardBorder,
        },
      ]}
    >
      <MaterialIcons
        name={icon}
        size={18}
        color={active ? activeTextColor : textColor}
      />
      <Text
        style={[
          staticStyles.miniToggleLabel,
          { color: active ? activeTextColor : textColor },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ── Constants ──────────────────────────────────────────────────────────────

const EMPTY_FORM: ProfileFormState = {
  aboutMe: "",
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

  // ── Save button press ──────────────────────────────────────────────────
  const saveBtnScale = useSharedValue(1);
  const saveBtnAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: saveBtnScale.value }],
  }));

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

    const unsubscribeAuth = onAuthStateChanged(auth, (nextUser) => {
      unsubscribeProfile?.();
      unsubscribeProfile = null;

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
          triggerEntrance();
        },
        (err) => {
          setError(getFirestoreUserMessage(err, "read"));
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

      setSaveSuccess("Profile saved.");
    } catch (nextError) {
      setError(getFirestoreUserMessage(nextError, "write"));
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
        nextThemePreference === "dark" ? "Dark mode enabled." : "Light mode enabled.",
        colors.accent,
        "#FFFFFF"
      );
    } catch (nextError) {
      setThemePreference(previousThemePreference);
      setError(getFirestoreUserMessage(nextError, "write"));
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
        next === "public" ? "Profile is now public." : "Profile is now private.",
        colors.accent,
        "#FFFFFF"
      );
    } catch (nextError) {
      setError(getFirestoreUserMessage(nextError, "write"));
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
      setSaveSuccess("Photo updated.");
    } catch (nextError) {
      setError(getFirestoreUserMessage(nextError, "write"));
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
      setSaveSuccess("Photo removed.");
    } catch (nextError) {
      setError(getFirestoreUserMessage(nextError, "write"));
    } finally {
      setUpdatingPhoto(false);
    }
  };

  const handleLogout = async () => {
    try { await signOut(auth); router.replace("/login"); } catch (e) { setError(getFirestoreUserMessage(e, "write")); }
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
      setSaveSuccess(`Password reset email sent to ${currentUser.email}.`);
    } catch (nextError) {
      setError(getFirestoreUserMessage(nextError, "write"));
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
                <ActivityIndicator size={12} color="#FFFFFF" />
              ) : (
                <MaterialIcons name="camera-alt" size={14} color="#FFFFFF" />
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
            {email || "No email"}
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
          <SectionHeader title="Appearance" color={colors.textMuted} />
          <View style={[staticStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[staticStyles.miniLabel, { color: colors.textSecondary }]}>Theme</Text>
            <View style={staticStyles.toggleRow}>
              <MiniToggle
                icon="light-mode"
                label="Light"
                active={themePreference === "light"}
                onPress={() => void handleThemePreferenceChange("light")}
                accentColor={colors.accent}
                cardBg={colors.card}
                cardBorder={colors.border}
                textColor={colors.textSecondary}
                activeTextColor="#FFFFFF"
              />
              <MiniToggle
                icon="dark-mode"
                label="Dark"
                active={themePreference === "dark"}
                onPress={() => void handleThemePreferenceChange("dark")}
                accentColor={colors.accent}
                cardBg={colors.card}
                cardBorder={colors.border}
                textColor={colors.textSecondary}
                activeTextColor="#FFFFFF"
              />
            </View>
            <View style={[staticStyles.divider, { backgroundColor: colors.border }]} />
            <Text style={[staticStyles.miniLabel, { color: colors.textSecondary }]}>Visibility</Text>
            <View style={staticStyles.toggleRow}>
              <MiniToggle
                icon="public"
                label="Public"
                active={profileVisibility === "public"}
                onPress={() => void handleVisibilityChange("public")}
                accentColor={colors.accent}
                cardBg={colors.card}
                cardBorder={colors.border}
                textColor={colors.textSecondary}
                activeTextColor="#FFFFFF"
              />
              <MiniToggle
                icon="lock-outline"
                label="Private"
                active={profileVisibility === "private"}
                onPress={() => void handleVisibilityChange("private")}
                accentColor={colors.accent}
                cardBg={colors.card}
                cardBorder={colors.border}
                textColor={colors.textSecondary}
                activeTextColor="#FFFFFF"
              />
            </View>
          </View>
        </Animated.View>

        {/* ───────── 3. About you ───────── */}
        <Animated.View style={sec2Style}>
          <SectionHeader title="About you" color={colors.textMuted} />
          <View style={[staticStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[staticStyles.fieldLabel, { color: colors.textSecondary }]}>Home base</Text>
            <TextInput
              style={[
                staticStyles.input,
                {
                  backgroundColor: colors.inputBackground,
                  borderColor: colors.inputBorder,
                  color: colors.textPrimary,
                },
              ]}
              placeholder="City or country"
              placeholderTextColor={colors.inputPlaceholder}
              value={form.homeBase}
              onChangeText={(v) => updateField("homeBase", v)}
            />

            <Text style={[staticStyles.fieldLabel, { color: colors.textSecondary }]}>Travel pace</Text>
            <View style={staticStyles.pillsRow}>
              {TRAVEL_PACE_OPTIONS.map((o) => (
                <ChoicePill
                  key={o}
                  label={o}
                  selected={form.travelPace === o}
                  onPress={() => updateField("travelPace", o)}
                  accentColor={colors.accent}
                  cardBg={colors.card}
                  cardBorder={colors.border}
                  textColor={colors.textSecondary}
                  selectedTextColor="#FFFFFF"
                />
              ))}
            </View>

            <Text style={[staticStyles.fieldLabel, { color: colors.textSecondary }]}>Stay style</Text>
            <View style={staticStyles.pillsRow}>
              {STAY_STYLE_OPTIONS.map((o) => (
                <ChoicePill
                  key={o}
                  label={o}
                  selected={form.stayStyle === o}
                  onPress={() => updateField("stayStyle", o)}
                  accentColor={colors.accent}
                  cardBg={colors.card}
                  cardBorder={colors.border}
                  textColor={colors.textSecondary}
                  selectedTextColor="#FFFFFF"
                />
              ))}
            </View>

            <Text style={[staticStyles.fieldLabel, { color: colors.textSecondary }]}>Bio</Text>
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
              placeholder="What kind of trips do you enjoy?"
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
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={staticStyles.primaryBtnText}>Save changes</Text>
                )}
              </Pressable>
            </Animated.View>
          </View>
        </Animated.View>

        {/* ───────── 4. Travel preferences (onboarding) ───────── */}
        <Animated.View style={sec3Style}>
          <SectionHeader title="Travel preferences" color={colors.textMuted} />
          <View style={[staticStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {([
              ["Interests", onboardingSummary.interests],
              ["Accessibility", onboardingSummary.assistance],
              ["Skills", onboardingSummary.skills],
            ] as const).map(([label, items]) => (
              <View key={label} style={staticStyles.prefBlock}>
                <Text style={[staticStyles.prefTitle, { color: colors.textPrimary }]}>{label}</Text>
                <View style={staticStyles.chipsRow}>
                  {items.length === 0 ? (
                    <Text style={[staticStyles.prefEmpty, { color: colors.textMuted }]}>None selected</Text>
                  ) : (
                    items.map((item) => (
                      <View key={item} style={[staticStyles.readChip, { backgroundColor: colors.accentMuted }]}>
                        <Text style={[staticStyles.readChipText, { color: colors.textPrimary }]}>{item}</Text>
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
              <Text style={[staticStyles.outlineBtnText, { color: colors.accent }]}>Edit preferences</Text>
            </Pressable>
          </View>
        </Animated.View>

        {/* ───────── 5. Account actions ───────── */}
        <Animated.View style={sec4Style}>
          <SectionHeader title="Account" color={colors.textMuted} />
          <View style={[staticStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <SettingsRow
              icon="lock-reset"
              label="Change password"
              onPress={() => void handleResetPassword()}
              colors={colors}
              loading={sendingReset}
            />
            <SettingsRow
              icon="logout"
              label="Sign out"
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
      <Modal transparent animationType="fade" visible={avatarSheetVisible} onRequestClose={() => setAvatarSheetVisible(false)}>
        <View style={[staticStyles.modalOverlay, { backgroundColor: colors.modalOverlay }]}>
          <Pressable onPress={() => setAvatarSheetVisible(false)} style={StyleSheet.absoluteFillObject} />
          <View style={[staticStyles.sheet, { backgroundColor: colors.card }]}>
            <View style={[staticStyles.sheetHandle, { backgroundColor: colors.border }]} />
            <Text style={[staticStyles.sheetTitle, { color: colors.textPrimary }]}>Profile photo</Text>
            <Text style={[staticStyles.sheetSubtitle, { color: colors.textSecondary }]}>Choose from gallery or reset to default.</Text>
            <Pressable style={[staticStyles.sheetPrimaryBtn, { backgroundColor: colors.accent }]} onPress={() => void handlePickProfilePhoto()}>
              <MaterialIcons name="photo-library" size={18} color="#FFFFFF" />
              <Text style={staticStyles.sheetPrimaryBtnText}>
                {showAvatar ? "Choose new photo" : "Choose photo"}
              </Text>
            </Pressable>
            {showAvatar ? (
              <Pressable style={[staticStyles.sheetSecondaryBtn, { borderColor: colors.border }]} onPress={() => void handleRemoveProfilePhoto()}>
                <MaterialIcons name="delete-outline" size={18} color={colors.errorText} />
                <Text style={[staticStyles.sheetSecondaryBtnText, { color: colors.errorText }]}>Remove photo</Text>
              </Pressable>
            ) : null}
            <Pressable style={staticStyles.sheetCancel} onPress={() => setAvatarSheetVisible(false)}>
              <Text style={[staticStyles.sheetCancelText, { color: colors.textMuted }]}>Cancel</Text>
            </Pressable>
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
    paddingTop: Spacing.lg,
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
  sectionHeader: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.bold,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.xs,
  },
  toggleRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  miniToggle: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingVertical: Spacing.md,
    justifyContent: "center",
  },
  miniToggleLabel: {
    ...TypeScale.titleSm,
    fontWeight: FontWeight.semibold,
  },
  pillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  pill: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
  },
  pillText: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.semibold,
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
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  settingsRowLabel: {
    ...TypeScale.bodyLg,
    flex: 1,
  },
  settingsRowTrailing: {
    ...TypeScale.bodySm,
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
  sheetCancel: {
    alignItems: "center",
    paddingVertical: Spacing.md,
    marginTop: Spacing.xs,
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
    color: "#FFFFFF",
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

  // Modal / sheet
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: Radius["3xl"],
    borderTopRightRadius: Radius["3xl"],
    paddingHorizontal: Spacing["2xl"],
    paddingBottom: Spacing["3xl"],
    paddingTop: Spacing.md,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: Radius.full,
    alignSelf: "center",
    marginBottom: Spacing.xl,
  },
  sheetTitle: {
    ...TypeScale.headingSm,
    marginBottom: Spacing.xs,
  },
  sheetSubtitle: {
    ...TypeScale.bodyMd,
    marginBottom: Spacing.xl,
  },
  sheetPrimaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    borderRadius: Radius.md,
    paddingVertical: Spacing.lg,
  },
  sheetPrimaryBtnText: {
    ...TypeScale.titleMd,
    color: "#FFFFFF",
    fontWeight: FontWeight.bold,
  },
  sheetSecondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    borderRadius: Radius.md,
    paddingVertical: Spacing.lg,
    marginTop: Spacing.sm,
    borderWidth: 1,
  },
  sheetSecondaryBtnText: {
    ...TypeScale.titleMd,
    fontWeight: FontWeight.semibold,
  },
  sheetCancelText: {
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.semibold,
  },
});
