import { MaterialIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { FirebaseError } from "firebase/app";
import { onAuthStateChanged, sendPasswordResetEmail, signOut } from "firebase/auth";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes, uploadString } from "firebase/storage";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { auth, db, storage } from "../../firebase";
import { getFirestoreUserMessage } from "../../utils/firestore-errors";
import {
  extractPersonalProfile,
  STAY_STYLE_OPTIONS,
  TRAVEL_PACE_OPTIONS,
  type PersonalProfileInfo,
} from "../../utils/profile-info";
import { extractDiscoverProfile } from "../../utils/trip-recommendations";

type ProfileFormState = PersonalProfileInfo;

type ChoicePillProps = {
  label: string;
  onPress: () => void;
  selected: boolean;
};

function ChoicePill({ label, onPress, selected }: ChoicePillProps) {
  return (
    <TouchableOpacity
      style={[styles.pill, selected && styles.pillSelected]}
      onPress={onPress}
      activeOpacity={0.9}
    >
      <Text style={[styles.pillText, selected && styles.pillTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

const EMPTY_FORM: ProfileFormState = {
  aboutMe: "",
  avatarUrl: "",
  dreamDestinations: "",
  fullName: "",
  homeBase: "",
  stayStyle: "",
  travelPace: "",
};

export default function ProfileTabScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [form, setForm] = useState<ProfileFormState>(EMPTY_FORM);
  const [error, setError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [updatingAvatar, setUpdatingAvatar] = useState(false);
  const [onboardingSummary, setOnboardingSummary] = useState<{
    assistance: { items: string[]; note: string };
    interests: { items: string[]; note: string };
    skills: { items: string[]; note: string };
  }>({
    assistance: { items: [], note: "" },
    interests: { items: [], note: "" },
    skills: { items: [], note: "" },
  });

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [form.avatarUrl]);

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

          setEmail(nextUser.email ?? "");
          setUsername(typeof profileData.username === "string" ? profileData.username : "");
          setForm(personalProfile);
          setOnboardingSummary({
            assistance: {
              items: onboardingProfile?.assistance.selectedOptions ?? [],
              note: onboardingProfile?.assistance.note ?? "",
            },
            interests: {
              items: onboardingProfile?.interests.selectedOptions ?? [],
              note: onboardingProfile?.interests.note ?? "",
            },
            skills: {
              items: onboardingProfile?.skills.selectedOptions ?? [],
              note: onboardingProfile?.skills.note ?? "",
            },
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

  const buildProfileInfoPayload = (overrides: Partial<ProfileFormState> = {}) => ({
    aboutMe: (overrides.aboutMe ?? form.aboutMe).trim(),
    avatarUrl: (overrides.avatarUrl ?? form.avatarUrl).trim(),
    homeBase: (overrides.homeBase ?? form.homeBase).trim(),
    stayStyle: (overrides.stayStyle ?? form.stayStyle).trim(),
    travelPace: (overrides.travelPace ?? form.travelPace).trim(),
  });

  const readAssetBlob = (assetUri: string) =>
    new Promise<Blob>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.onload = () => resolve(xhr.response as Blob);
      xhr.onerror = () => reject(new Error("Could not read the selected photo."));
      xhr.responseType = "blob";
      xhr.open("GET", assetUri, true);
      xhr.send();
    });

  const handleSave = async () => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSaveSuccess("");

      await setDoc(
        doc(db, "profiles", currentUser.uid),
        {
          profileInfo: buildProfileInfoPayload(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setSaveSuccess("Profile updated. AI will use the new info.");
    } catch (nextError) {
      setError(getFirestoreUserMessage(nextError, "write"));
    } finally {
      setSaving(false);
    }
  };

  const updateAvatarUrl = async (nextAvatarUrl: string, successMessage: string) => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      return;
    }

    await setDoc(
      doc(db, "profiles", currentUser.uid),
      {
        profileInfo: buildProfileInfoPayload({ avatarUrl: nextAvatarUrl }),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    setForm((currentForm) => ({
      ...currentForm,
      avatarUrl: nextAvatarUrl,
    }));
    setAvatarLoadFailed(false);
    setSaveSuccess(successMessage);
  };

  const handlePickAvatar = async () => {
    const currentUser = auth.currentUser;

    if (!currentUser || updatingAvatar) {
      return;
    }

    try {
      setUpdatingAvatar(true);
      setError("");
      setSaveSuccess("");

      const permission =
        Platform.OS === "web"
          ? { granted: true }
          : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        setError("Allow gallery access to choose a profile photo.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [1, 1],
        base64: true,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
      });

      if (result.canceled || !result.assets?.[0]) {
        return;
      }

      const pickedAsset = result.assets[0];
      const extensionFromName = pickedAsset.fileName?.split(".").pop()?.toLowerCase();
      const avatarExtension =
        extensionFromName && extensionFromName.length <= 5 ? extensionFromName : "jpg";
      const mimeType =
        pickedAsset.mimeType ??
        (avatarExtension === "jpg" ? "image/jpeg" : `image/${avatarExtension}`);
      const avatarRef = ref(
        storage,
        `profile-avatars/${currentUser.uid}/avatar-${Date.now()}.${avatarExtension}`
      );

      if (pickedAsset.base64) {
        await uploadString(avatarRef, pickedAsset.base64, "base64", {
          contentType: mimeType,
        });
      } else {
        const avatarBlob = await readAssetBlob(pickedAsset.uri);
        await uploadBytes(avatarRef, avatarBlob, { contentType: mimeType });
      }

      const avatarUrl = await getDownloadURL(avatarRef);
      await updateAvatarUrl(avatarUrl, "Profile photo updated.");
    } catch (nextError) {
      setError(getFirestoreUserMessage(nextError, "write"));
      setSaveSuccess("");
    } finally {
      setUpdatingAvatar(false);
    }
  };

  const handleResetAvatar = async () => {
    if (updatingAvatar) {
      return;
    }

    try {
      setUpdatingAvatar(true);
      setError("");
      setSaveSuccess("");
      await updateAvatarUrl("", "Profile photo reset.");
    } catch (nextError) {
      setError(getFirestoreUserMessage(nextError, "write"));
      setSaveSuccess("");
    } finally {
      setUpdatingAvatar(false);
    }
  };

  const handleAvatarPress = () => {
    if (updatingAvatar) {
      return;
    }

    if (!avatarUri) {
      void handlePickAvatar();
      return;
    }

    Alert.alert("Profile photo", "Choose what to do with your profile photo.", [
      {
        text: "Reset",
        style: "destructive",
        onPress: () => {
          void handleResetAvatar();
        },
      },
      {
        text: "Choose new photo",
        onPress: () => {
          void handlePickAvatar();
        },
      },
      {
        style: "cancel",
        text: "Cancel",
      },
    ]);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.replace("/login");
    } catch (nextError) {
      setError(getFirestoreUserMessage(nextError, "write"));
    }
  };

  const handleResetPassword = async () => {
    const currentUser = auth.currentUser;
    const targetEmail = currentUser?.email?.trim() ?? email.trim();

    if (!currentUser || !targetEmail) {
      setError("No email is linked to this account.");
      setSaveSuccess("");
      return;
    }

    try {
      setSendingReset(true);
      setError("");
      setSaveSuccess("");

      await sendPasswordResetEmail(auth, targetEmail);
      setSaveSuccess(`Password reset email sent to ${targetEmail}.`);
    } catch (nextError) {
      if (nextError instanceof FirebaseError) {
        switch (nextError.code) {
          case "auth/too-many-requests":
            setError("Too many password reset attempts. Try again later.");
            break;
          case "auth/network-request-failed":
            setError("Network error. Check your connection and try again.");
            break;
          default:
            setError("Could not send a password reset email right now.");
        }
      } else {
        setError("Could not send a password reset email right now.");
      }
      setSaveSuccess("");
    } finally {
      setSendingReset(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loader} edges={["top", "left", "right"]}>
        <ActivityIndicator size="large" color="#5C8C1F" />
      </SafeAreaView>
    );
  }

  const avatarUri = form.avatarUrl.trim();
  const shouldShowAvatar = !!avatarUri && !avatarLoadFailed;

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroTopRow}>
            <Text style={styles.heroTitle}>Profile</Text>
            <TouchableOpacity
              style={styles.heroIcon}
              onPress={() => {
                void handleAvatarPress();
              }}
              activeOpacity={0.92}
            >
              {shouldShowAvatar ? (
                <Image
                  source={{ uri: avatarUri }}
                  style={styles.heroAvatarImage}
                  contentFit="cover"
                  onError={() => setAvatarLoadFailed(true)}
                />
              ) : (
                <MaterialIcons name="person-outline" size={42} color="#E8F1D4" />
              )}
              <View style={styles.heroAvatarBadge}>
                {updatingAvatar ? (
                  <ActivityIndicator size="small" color="#29440F" />
                ) : (
                  <MaterialIcons
                    name={shouldShowAvatar ? "edit" : "add-a-photo"}
                    size={16}
                    color="#29440F"
                  />
                )}
              </View>
            </TouchableOpacity>
          </View>

          <Text style={styles.heroMeta}>
            <Text style={styles.heroMetaLabel}>username: </Text>
            {username || "-"}
          </Text>
          <Text style={styles.heroMeta}>
            <Text style={styles.heroMetaLabel}>email: </Text>
            {email || "-"}
          </Text>

          <TouchableOpacity
            style={[styles.heroActionButton, sendingReset && styles.buttonDisabled]}
            onPress={() => {
              void handleResetPassword();
            }}
            disabled={sendingReset}
            activeOpacity={0.9}
          >
            <Text style={styles.heroActionButtonText}>
              {sendingReset ? "Sending..." : "Change password"}
            </Text>
          </TouchableOpacity>
        </View>

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {saveSuccess ? (
          <View style={styles.successCard}>
            <Text style={styles.successText}>{saveSuccess}</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Your Info</Text>

          <Text style={styles.fieldLabel}>Where Are You Based</Text>
          <TextInput
            style={styles.input}
            placeholder="City / country"
            placeholderTextColor="#809071"
            value={form.homeBase}
            onChangeText={(value) => updateField("homeBase", value)}
          />

          <Text style={styles.fieldLabel}>How You Like To Travel</Text>
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

          <Text style={styles.fieldLabel}>Preferred Stay Type</Text>
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

          <Text style={styles.fieldLabel}>About You</Text>
          <TextInput
            style={[styles.input, styles.multilineInput]}
            placeholder="Tell us what kind of trips you enjoy and what vibe you are after."
            placeholderTextColor="#809071"
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
            <Text style={styles.primaryButtonText}>{saving ? "Saving..." : "Save Profile"}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Onboarding Profile</Text>
          <Text style={styles.cardSubtitle}>
            This data is already saved in Firebase and is also used for AI recommendations.
          </Text>

          <Text style={styles.summaryLabel}>Interests</Text>
          <View style={styles.summaryRow}>
            {onboardingSummary.interests.items.map((item) => (
              <View key={item} style={styles.summaryChip}>
                <Text style={styles.summaryChipText}>{item}</Text>
              </View>
            ))}
          </View>
          {onboardingSummary.interests.note ? (
            <Text style={styles.summaryNote}>{onboardingSummary.interests.note}</Text>
          ) : null}

          <Text style={styles.summaryLabel}>Needs And Accessibility</Text>
          <View style={styles.summaryRow}>
            {onboardingSummary.assistance.items.map((item) => (
              <View key={item} style={styles.summaryChip}>
                <Text style={styles.summaryChipText}>{item}</Text>
              </View>
            ))}
          </View>
          {onboardingSummary.assistance.note ? (
            <Text style={styles.summaryNote}>{onboardingSummary.assistance.note}</Text>
          ) : null}

          <Text style={styles.summaryLabel}>Skills</Text>
          <View style={styles.summaryRow}>
            {onboardingSummary.skills.items.map((item) => (
              <View key={item} style={styles.summaryChip}>
                <Text style={styles.summaryChipText}>{item}</Text>
              </View>
            ))}
          </View>
          {onboardingSummary.skills.note ? (
            <Text style={styles.summaryNote}>{onboardingSummary.skills.note}</Text>
          ) : null}

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() =>
              router.push({
                pathname: "/onboarding",
                params: { returnTo: "/profile" },
              })
            }
            activeOpacity={0.9}
          >
            <Text style={styles.secondaryButtonText}>Edit Onboarding</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.logoutButton}
          onPress={() => {
            void handleLogout();
          }}
          activeOpacity={0.9}
        >
          <Text style={styles.logoutButtonText}>Logout</Text>
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
  heroIcon: {
    width: 96,
    height: 96,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(232,241,212,0.14)",
  },
  heroAvatarImage: {
    width: "100%",
    height: "100%",
  },
  heroAvatarBadge: {
    position: "absolute",
    right: 6,
    bottom: 6,
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: "#FFF2DA",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#D9C191",
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
    marginBottom: 6,
  },
  heroMetaLabel: {
    color: "#C8E08E",
    fontWeight: "800",
  },
  heroActionButton: {
    alignSelf: "flex-start",
    marginTop: 12,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "rgba(232,241,212,0.24)",
  },
  heroActionButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
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
  summaryNote: {
    color: "#5F6E53",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10,
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
