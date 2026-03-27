import { MaterialIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

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

type ProfileFormState = PersonalProfileInfo;

type ChoicePillProps = {
  label: string;
  onPress: () => void;
  selected: boolean;
};

function ChoicePill({ label, onPress, selected }: ChoicePillProps) {
  const { colors } = useAppTheme();

  return (
    <TouchableOpacity
      style={[
        styles.pill,
        {
          backgroundColor: colors.accentMuted,
          borderColor: colors.border,
        },
        selected && [styles.pillSelected, { backgroundColor: colors.accent, borderColor: colors.accent }],
      ]}
      onPress={onPress}
      activeOpacity={0.9}
    >
      <Text
        style={[
          styles.pillText,
          { color: colors.textPrimary },
          selected && styles.pillTextSelected,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const EMPTY_FORM: ProfileFormState = {
  aboutMe: "",
  dreamDestinations: "",
  fullName: "",
  homeBase: "",
  stayStyle: "",
  travelPace: "",
};

const PROFILE_PHOTO_MAX_LENGTH = 850000;

export default function ProfileTabScreen() {
  const router = useRouter();
  const { colors, isDark, setThemePreference, themePreference } = useAppTheme();

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
  const [onboardingSummary, setOnboardingSummary] = useState<{
    assistance: string[];
    interests: string[];
    skills: string[];
  }>({
    assistance: [],
    interests: [],
    skills: [],
  });

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
        (profileSnapshot) => {
          if (!profileSnapshot.exists()) {
            setLoading(false);
            router.replace("/onboarding");
            return;
          }

          const profileData = profileSnapshot.data() as Record<string, unknown>;
          const personalProfile = extractPersonalProfile({
            profileInfo:
              profileData.profileInfo && typeof profileData.profileInfo === "object"
                ? (profileData.profileInfo as Record<string, unknown>)
                : undefined,
          });
          const onboardingProfile = extractDiscoverProfile(profileData);

          setProfileName(
            getProfileDisplayName({
              email: nextUser.email,
              profileInfo:
                profileData.profileInfo && typeof profileData.profileInfo === "object"
                  ? (profileData.profileInfo as Record<string, unknown>)
                  : undefined,
              username: typeof profileData.username === "string" ? profileData.username : null,
            })
          );
          setEmail(nextUser.email ?? "");
          setProfilePhotoUrl(
            typeof profileData.profilePhotoUrl === "string" ? profileData.profilePhotoUrl : ""
          );
          setUsername(
            typeof profileData.username === "string" ? profileData.username : ""
          );
          setProfileVisibility(getProfileVisibility(profileData.profileVisibility));
          setForm(personalProfile);
          setOnboardingSummary({
            assistance: onboardingProfile?.assistance.selectedOptions ?? [],
            interests: onboardingProfile?.interests.selectedOptions ?? [],
            skills: onboardingProfile?.skills.selectedOptions ?? [],
          });
          setLoading(false);
        },
        (nextError) => {
          setError(getFirestoreUserMessage(nextError, "read"));
          setLoading(false);
        }
      );
    });

    return () => {
      unsubscribeProfile?.();
      unsubscribeAuth();
    };
  }, [router]);

  const updateField = (field: keyof ProfileFormState, value: string) => {
    setForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
    setError("");
    setSaveSuccess("");
  };

  const handleSave = async () => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      return;
    }

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

      setSaveSuccess(
        profileVisibility === "public"
          ? "Профилът е обновен и вече може да бъде намиран от други users."
          : "Профилът е обновен и вече е private за останалите users."
      );
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

      setSaveSuccess(
        nextThemePreference === "dark"
          ? "Dark mode е включен."
          : "Light mode е включен."
      );
    } catch (nextError) {
      setThemePreference(previousThemePreference);
      setError(getFirestoreUserMessage(nextError, "write"));
    }
  };

  const handlePickProfilePhoto = async () => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      return;
    }

    try {
      setUpdatingPhoto(true);
      setError("");
      setSaveSuccess("");

      const permissionResponse = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissionResponse.granted) {
        setError("Разреши достъп до снимките, за да избереш профилна снимка.");
        return;
      }

      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [1, 1],
        base64: true,
        mediaTypes: ["images"],
        quality: 0.35,
      });

      if (pickerResult.canceled || !pickerResult.assets?.length) {
        return;
      }

      const asset = pickerResult.assets[0];
      const encodedImage = asset.base64
        ? `data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}`
        : asset.uri;

      if (!encodedImage) {
        setError("Не успяхме да подготвим снимката. Опитай отново.");
        return;
      }

      if (encodedImage.length > PROFILE_PHOTO_MAX_LENGTH) {
        setError("Снимката е твърде голяма. Избери по-лека или по-силно crop-ната снимка.");
        return;
      }

      const profileRef = doc(db, "profiles", currentUser.uid);
      const publicProfileRef = doc(db, "publicProfiles", currentUser.uid);
      const batch = writeBatch(db);

      batch.set(
        profileRef,
        {
          profilePhotoUrl: encodedImage,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      if (profileVisibility === "public") {
        batch.set(
          publicProfileRef,
          buildPublicProfilePayload({
            email: currentUser.email,
            profilePhotoUrl: encodedImage,
            profileInfo: form,
            uid: currentUser.uid,
            username,
          })
        );
      }

      await batch.commit();

      setProfilePhotoUrl(encodedImage);
      setSaveSuccess("Профилната снимка е обновена.");
    } catch (nextError) {
      setError(getFirestoreUserMessage(nextError, "write"));
    } finally {
      setUpdatingPhoto(false);
    }
  };

  const handleRemoveProfilePhoto = async () => {
    const currentUser = auth.currentUser;

    if (!currentUser || !profilePhotoUrl) {
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
      setSaveSuccess("Профилната снимка е махната.");
    } catch (nextError) {
      setError(getFirestoreUserMessage(nextError, "write"));
    } finally {
      setUpdatingPhoto(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.replace("/login");
    } catch (nextError) {
      setError(getFirestoreUserMessage(nextError, "write"));
    }
  };

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.loader, { backgroundColor: colors.screen }]}
        edges={["top", "left", "right"]}
      >
        <ActivityIndicator size="large" color="#5C8C1F" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: colors.screen }]}
      edges={["top", "left", "right"]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, { backgroundColor: colors.hero }]}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroIdentity}>
              <Text style={[styles.kicker, { color: isDark ? "#B7E07C" : "#C8E08E" }]}>Profile</Text>
              <Text style={styles.heroTitle}>{profileName}</Text>
            </View>
            <View style={styles.heroActions}>
              <View
                style={[
                  styles.themeSwitchCard,
                  {
                    backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.08)",
                    borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.12)",
                  },
                ]}
              >
                <View style={styles.themeSwitchTextWrap}>
                  <Text style={styles.themeSwitchTitle}>Dark mode</Text>
                  <Text style={styles.themeSwitchSubtitle}>
                    {themePreference === "dark" ? "On" : "Off"}
                  </Text>
                </View>
                <Switch
                  value={themePreference === "dark"}
                  onValueChange={(value) => {
                    void handleThemePreferenceChange(value ? "dark" : "light");
                  }}
                  trackColor={{ false: "rgba(220,234,192,0.38)", true: "#A6D65A" }}
                  thumbColor={themePreference === "dark" ? "#FFFFFF" : "#F6FAEF"}
                  ios_backgroundColor="rgba(220,234,192,0.24)"
                />
              </View>

              <View style={styles.heroPhotoWrap}>
                <TouchableOpacity
                  activeOpacity={0.9}
                  disabled={updatingPhoto}
                  onPress={() => {
                    void handlePickProfilePhoto();
                  }}
                  style={[
                    styles.heroPhotoButton,
                    {
                      backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.08)",
                      borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.12)",
                    },
                  ]}
                >
                  {profilePhotoUrl ? (
                    <Image
                      contentFit="cover"
                      source={{ uri: profilePhotoUrl }}
                      style={styles.heroPhotoImage}
                    />
                  ) : (
                    <MaterialIcons name="person-outline" size={28} color="#E8F1D4" />
                  )}
                  <View style={styles.heroPhotoBadge}>
                    <MaterialIcons name="photo-camera" size={14} color="#29440F" />
                  </View>
                </TouchableOpacity>

                <View style={styles.heroPhotoActions}>
                  <Text style={styles.heroPhotoHint}>
                    {updatingPhoto ? "Updating..." : profilePhotoUrl ? "Change photo" : "Add photo"}
                  </Text>
                  {profilePhotoUrl ? (
                    <TouchableOpacity
                      activeOpacity={0.9}
                      disabled={updatingPhoto}
                      onPress={() => {
                        void handleRemoveProfilePhoto();
                      }}
                    >
                      <Text style={styles.heroPhotoRemove}>Remove</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            </View>
          </View>

        {email ? <Text style={styles.heroMeta}>{email}</Text> : null}
        {username ? <Text style={styles.heroMeta}>@{username}</Text> : null}
        <Text style={styles.heroMeta}>
          Visibility: {profileVisibility === "public" ? "Public" : "Private"}
        </Text>

        <Text style={styles.heroDescription}>
          Тук управляваш личната информация, която Gemini използва заедно с
          onboarding отговорите ти, за да персонализира предложенията.
        </Text>
      </View>

      {error ? (
        <View
          style={[
            styles.errorCard,
            { backgroundColor: colors.errorBackground, borderColor: colors.errorBorder },
          ]}
        >
          <Text style={[styles.errorText, { color: colors.errorText }]}>{error}</Text>
        </View>
      ) : null}

      {saveSuccess ? (
        <View
          style={[
            styles.successCard,
            { backgroundColor: colors.successBackground, borderColor: colors.successBorder },
          ]}
        >
          <Text style={[styles.successText, { color: colors.successText }]}>{saveSuccess}</Text>
        </View>
      ) : null}

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Информация за теб</Text>

        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Видимост на профила</Text>
        <Text style={[styles.visibilityText, { color: colors.textSecondary }]}>
          Public профилите могат да бъдат виждани и канени в групи. Private профилите
          остават скрити от discover и invite списъците.
        </Text>
        <View style={styles.pillsRow}>
          <ChoicePill
            label="Private"
            selected={profileVisibility === "private"}
            onPress={() => setProfileVisibility("private")}
          />
          <ChoicePill
            label="Public"
            selected={profileVisibility === "public"}
            onPress={() => setProfileVisibility("public")}
          />
        </View>

        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Име</Text>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: colors.inputBackground,
              borderColor: colors.inputBorder,
              color: colors.textPrimary,
            },
          ]}
          placeholder="Например Martin"
          placeholderTextColor={colors.inputPlaceholder}
          value={form.fullName}
          onChangeText={(value) => updateField("fullName", value)}
        />

        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Откъде си</Text>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: colors.inputBackground,
              borderColor: colors.inputBorder,
              color: colors.textPrimary,
            },
          ]}
          placeholder="Град / държава"
          placeholderTextColor={colors.inputPlaceholder}
          value={form.homeBase}
          onChangeText={(value) => updateField("homeBase", value)}
        />

        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Как обичаш да пътуваш</Text>
        <View style={styles.pillsRow}>
          {TRAVEL_PACE_OPTIONS.map((option) => (
            <ChoicePill
              key={option}
              label={option}
              selected={form.travelPace === option}
              onPress={() => updateField("travelPace", option)}
            />
          ))}
        </View>

        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Любим тип настаняване</Text>
        <View style={styles.pillsRow}>
          {STAY_STYLE_OPTIONS.map((option) => (
            <ChoicePill
              key={option}
              label={option}
              selected={form.stayStyle === option}
              onPress={() => updateField("stayStyle", option)}
            />
          ))}
        </View>

        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Кратко за теб</Text>
        <TextInput
          style={[
            styles.input,
            styles.multilineInput,
            {
              backgroundColor: colors.inputBackground,
              borderColor: colors.inputBorder,
              color: colors.textPrimary,
            },
          ]}
          placeholder="Какъв човек си, какво търсиш в пътуването, какъв вайб обичаш..."
          placeholderTextColor={colors.inputPlaceholder}
          value={form.aboutMe}
          onChangeText={(value) => updateField("aboutMe", value)}
          multiline
        />

        <TouchableOpacity
          style={[styles.primaryButton, saving && styles.buttonDisabled]}
          onPress={() => {
            void handleSave();
          }}
          disabled={saving}
          activeOpacity={0.9}
        >
          <Text style={styles.primaryButtonText}>
            {saving ? "Запазване..." : "Запази профила"}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Onboarding профил</Text>
        <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
          Това вече е записано във Firebase и също участва в AI препоръките.
        </Text>

        <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Интереси</Text>
        <View style={styles.summaryRow}>
          {onboardingSummary.interests.map((item) => (
            <View
              key={item}
              style={[styles.summaryChip, { backgroundColor: colors.accentMuted }]}
            >
              <Text style={[styles.summaryChipText, { color: colors.textPrimary }]}>{item}</Text>
            </View>
          ))}
        </View>

        <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Нужди и достъпност</Text>
        <View style={styles.summaryRow}>
          {onboardingSummary.assistance.map((item) => (
            <View
              key={item}
              style={[styles.summaryChip, { backgroundColor: colors.accentMuted }]}
            >
              <Text style={[styles.summaryChipText, { color: colors.textPrimary }]}>{item}</Text>
            </View>
          ))}
        </View>

        <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Умения</Text>
        <View style={styles.summaryRow}>
          {onboardingSummary.skills.map((item) => (
            <View
              key={item}
              style={[styles.summaryChip, { backgroundColor: colors.accentMuted }]}
            >
              <Text style={[styles.summaryChipText, { color: colors.textPrimary }]}>{item}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[
            styles.secondaryButton,
            {
              backgroundColor: isDark ? "#2F2617" : "#FFF2DA",
            },
          ]}
          onPress={() => router.push("/onboarding")}
          activeOpacity={0.9}
        >
          <Text
            style={[
              styles.secondaryButtonText,
              { color: isDark ? colors.warningText : "#8B5611" },
            ]}
          >
            Редактирай onboarding
          </Text>
        </TouchableOpacity>
      </View>

        <TouchableOpacity
          style={[
            styles.logoutButton,
            {
              backgroundColor: colors.card,
              borderColor: isDark ? "#5A2922" : "#E4D4CF",
            },
          ]}
          onPress={() => {
            void handleLogout();
          }}
          activeOpacity={0.9}
        >
          <Text style={[styles.logoutButtonText, { color: isDark ? "#FFB8AE" : "#A34A38" }]}>
            Logout
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#EEF4E5",
  },
  content: {
    width: "100%",
    maxWidth: 980,
    alignSelf: "center",
    padding: 20,
    paddingBottom: 34,
  },
  loader: {
    flex: 1,
    backgroundColor: "#EEF4E5",
    alignItems: "center",
    justifyContent: "center",
  },
  hero: {
    backgroundColor: "#223814",
    borderRadius: 28,
    padding: 22,
    marginBottom: 16,
  },
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  heroIdentity: {
    flex: 1,
    paddingRight: 14,
  },
  heroActions: {
    alignItems: "flex-end",
    gap: 12,
  },
  heroPhotoWrap: {
    alignItems: "center",
  },
  heroPhotoButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 30,
    borderWidth: 1,
    height: 72,
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
    width: 72,
  },
  heroPhotoImage: {
    height: "100%",
    width: "100%",
  },
  heroPhotoBadge: {
    alignItems: "center",
    backgroundColor: "#D6E8AE",
    borderRadius: 999,
    bottom: 4,
    height: 24,
    justifyContent: "center",
    position: "absolute",
    right: 4,
    width: 24,
  },
  heroPhotoActions: {
    alignItems: "center",
    marginTop: 8,
  },
  heroPhotoHint: {
    color: "#E8F1D4",
    fontSize: 12,
    fontWeight: "700",
  },
  heroPhotoRemove: {
    color: "#D6E8AE",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 4,
  },
  themeSwitchCard: {
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    minWidth: 172,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  themeSwitchTextWrap: {
    flex: 1,
    marginRight: 12,
  },
  themeSwitchTitle: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  themeSwitchSubtitle: {
    color: "#DCEAC0",
    fontSize: 12,
    marginTop: 4,
  },
  kicker: {
    color: "#C8E08E",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "800",
  },
  heroMeta: {
    color: "#DCEAC0",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 4,
  },
  heroDescription: {
    color: "#E6F0CF",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
  },
  errorCard: {
    backgroundColor: "#FFF1EF",
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: "#F0B6AE",
    marginBottom: 16,
  },
  errorText: {
    color: "#A63228",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  successCard: {
    backgroundColor: "#F3F9E6",
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: "#C9DF98",
    marginBottom: 16,
  },
  successText: {
    color: "#3B6D11",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  card: {
    backgroundColor: "#FAFCF5",
    borderRadius: 28,
    padding: 20,
    borderWidth: 1,
    borderColor: "#DDE8C7",
    marginBottom: 16,
  },
  cardTitle: {
    color: "#29440F",
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
    marginBottom: 8,
  },
  cardSubtitle: {
    color: "#5F6E53",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  fieldLabel: {
    color: "#47642A",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 10,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#DDE8C7",
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: "#29440F",
  },
  visibilityText: {
    color: "#5F6E53",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  multilineInput: {
    minHeight: 120,
    textAlignVertical: "top",
  },
  pillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  pill: {
    backgroundColor: "#EEF4E5",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#D8E3C2",
  },
  pillSelected: {
    backgroundColor: "#5C8C1F",
    borderColor: "#5C8C1F",
  },
  pillText: {
    color: "#3E5B21",
    fontSize: 13,
    fontWeight: "700",
  },
  pillTextSelected: {
    color: "#FFFFFF",
  },
  primaryButton: {
    backgroundColor: "#5C8C1F",
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 18,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  summaryLabel: {
    color: "#47642A",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 8,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  summaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 8,
  },
  summaryChip: {
    backgroundColor: "#EEF4E5",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  summaryChipText: {
    color: "#3E5B21",
    fontSize: 12,
    fontWeight: "700",
  },
  secondaryButton: {
    backgroundColor: "#FFF2DA",
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 12,
  },
  secondaryButtonText: {
    color: "#8B5611",
    fontSize: 14,
    fontWeight: "800",
  },
  logoutButton: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E4D4CF",
  },
  logoutButtonText: {
    color: "#A34A38",
    fontSize: 15,
    fontWeight: "800",
  },
});
