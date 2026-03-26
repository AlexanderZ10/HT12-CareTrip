import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { auth, db } from "../../firebase";
import { getFirestoreUserMessage } from "../../utils/firestore-errors";
import {
  extractPersonalProfile,
  getProfileDisplayName,
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
  const [profileName, setProfileName] = useState("Traveler");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [form, setForm] = useState<ProfileFormState>(EMPTY_FORM);
  const [error, setError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");
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
          setUsername(
            typeof profileData.username === "string" ? profileData.username : ""
          );
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

      await setDoc(
        doc(db, "profiles", currentUser.uid),
        {
          profileInfo: {
            aboutMe: form.aboutMe.trim(),
            dreamDestinations: form.dreamDestinations.trim(),
            fullName: form.fullName.trim(),
            homeBase: form.homeBase.trim(),
            stayStyle: form.stayStyle.trim(),
            travelPace: form.travelPace.trim(),
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setSaveSuccess("Профилът е обновен и AI вече ще използва новата информация.");
    } catch (nextError) {
      setError(getFirestoreUserMessage(nextError, "write"));
    } finally {
      setSaving(false);
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
      <SafeAreaView style={styles.loader} edges={["top", "left", "right"]}>
        <ActivityIndicator size="large" color="#5C8C1F" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroTopRow}>
            <View>
              <Text style={styles.kicker}>Profile</Text>
              <Text style={styles.heroTitle}>{profileName}</Text>
            </View>
            <View style={styles.heroIcon}>
              <MaterialIcons name="person-outline" size={28} color="#E8F1D4" />
            </View>
          </View>

        {email ? <Text style={styles.heroMeta}>{email}</Text> : null}
        {username ? <Text style={styles.heroMeta}>@{username}</Text> : null}

        <Text style={styles.heroDescription}>
          Тук управляваш личната информация, която Gemini използва заедно с
          onboarding отговорите ти, за да персонализира предложенията.
        </Text>
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
        <Text style={styles.cardTitle}>Информация за теб</Text>

        <Text style={styles.fieldLabel}>Име</Text>
        <TextInput
          style={styles.input}
          placeholder="Например Martin"
          placeholderTextColor="#809071"
          value={form.fullName}
          onChangeText={(value) => updateField("fullName", value)}
        />

        <Text style={styles.fieldLabel}>Откъде си</Text>
        <TextInput
          style={styles.input}
          placeholder="Град / държава"
          placeholderTextColor="#809071"
          value={form.homeBase}
          onChangeText={(value) => updateField("homeBase", value)}
        />

        <Text style={styles.fieldLabel}>Как обичаш да пътуваш</Text>
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

        <Text style={styles.fieldLabel}>Любим тип настаняване</Text>
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

        <Text style={styles.fieldLabel}>Кратко за теб</Text>
        <TextInput
          style={[styles.input, styles.multilineInput]}
          placeholder="Какъв човек си, какво търсиш в пътуването, какъв вайб обичаш..."
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
          <Text style={styles.primaryButtonText}>
            {saving ? "Запазване..." : "Запази профила"}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Onboarding профил</Text>
        <Text style={styles.cardSubtitle}>
          Това вече е записано във Firebase и също участва в AI препоръките.
        </Text>

        <Text style={styles.summaryLabel}>Интереси</Text>
        <View style={styles.summaryRow}>
          {onboardingSummary.interests.map((item) => (
            <View key={item} style={styles.summaryChip}>
              <Text style={styles.summaryChipText}>{item}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.summaryLabel}>Нужди и достъпност</Text>
        <View style={styles.summaryRow}>
          {onboardingSummary.assistance.map((item) => (
            <View key={item} style={styles.summaryChip}>
              <Text style={styles.summaryChipText}>{item}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.summaryLabel}>Умения</Text>
        <View style={styles.summaryRow}>
          {onboardingSummary.skills.map((item) => (
            <View key={item} style={styles.summaryChip}>
              <Text style={styles.summaryChipText}>{item}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.push("/onboarding")}
          activeOpacity={0.9}
        >
          <Text style={styles.secondaryButtonText}>Редактирай onboarding</Text>
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
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
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
