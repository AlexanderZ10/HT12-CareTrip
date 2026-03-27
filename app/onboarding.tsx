import { useLocalSearchParams, useRouter } from "expo-router";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
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

import { auth, db } from "../firebase";
import { getFirestoreUserMessage } from "../utils/firestore-errors";
import React from "react";

const NO_INTERESTS_OPTION = "X - Nothing specific";
const NO_ASSISTANCE_OPTION = "X - No special needs";
const NO_SKILLS_OPTION = "X - No specific skills";

const INTEREST_OPTIONS = [
  NO_INTERESTS_OPTION,
  "🌿 Природа и планини",
  "🏛️ История и култура",
  "🍷 Храна и вино",
  "🎨 Занаяти и изкуство",
  "🚴 Активности и спорт",
  "🧘 Релакс и уединение",
  "👨‍👩‍👧‍👦 Семейно пътуване",
  "📸 Фотография",
];

const ASSISTANCE_OPTIONS = [
  NO_ASSISTANCE_OPTION,
  "♿ Достъпна среда (рампи, широки врати)",
  "👁️ Зрителни затруднения",
  "🦻 Слухови затруднения",
  "💊 Хронично заболяване (нужда от лекар/аптека)",
  "🍽️ Хранителни алергии",
  "🧠 Сензорна чувствителност (тихи места)",
];

const SKILLS_OPTIONS = [
  NO_SKILLS_OPTION,
  "🌱 Градинарство / земеделска работа",
  "🔨 Строителство / ремонт",
  "📚 Преподаване / работа с деца",
  "🍳 Готвене",
  "💻 IT / дигитални умения",
  "📷 Фотография / видео",
  "💪 Физическа помощ",
  "🙌 Просто имам желание, без специални умения",
];

type OnboardingErrors = {
  interests?: string;
  assistance?: string;
  skills?: string;
  form?: string;
};

type MultiSelectField = "interests" | "assistance" | "skills";

const EXCLUSIVE_NONE_OPTIONS: Record<MultiSelectField, string> = {
  interests: NO_INTERESTS_OPTION,
  assistance: NO_ASSISTANCE_OPTION,
  skills: NO_SKILLS_OPTION,
};

type ChoiceChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
};

function ChoiceChip({ label, selected, onPress }: ChoiceChipProps) {
  return (
    <TouchableOpacity
      style={[styles.chip, selected && styles.chipSelected]}
      onPress={onPress}
      activeOpacity={0.9}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function OnboardingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [interests, setInterests] = useState<string[]>([]);
  const [interestsNote, setInterestsNote] = useState("");
  const [assistance, setAssistance] = useState<string[]>([]);
  const [assistanceNote, setAssistanceNote] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [skillsNote, setSkillsNote] = useState("");
  const [errors, setErrors] = useState<OnboardingErrors>({});
  const returnTo = typeof params.returnTo === "string" ? params.returnTo : null;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);

      if (!nextUser) {
        setLoading(false);
        router.replace("/login");
        return;
      }

      setLoading(true);

      try {
        const profileSnapshot = await getDoc(doc(db, "profiles", nextUser.uid));

        if (profileSnapshot.exists()) {
          const profileData = profileSnapshot.data();
          const preferences = profileData.preferences?.onboarding;

          if (preferences) {
            setInterests(
              Array.isArray(preferences.interests?.selectedOptions)
                ? preferences.interests.selectedOptions
                : []
            );
            setInterestsNote(
              typeof preferences.interests?.note === "string"
                ? preferences.interests.note
                : ""
            );
            setAssistance(
              Array.isArray(preferences.assistance?.selectedOptions)
                ? preferences.assistance.selectedOptions
                : []
            );
            setAssistanceNote(
              typeof preferences.assistance?.note === "string"
                ? preferences.assistance.note
                : ""
            );
            setSkills(
              Array.isArray(preferences.skills?.selectedOptions)
                ? preferences.skills.selectedOptions
                : []
            );
            setSkillsNote(
              typeof preferences.skills?.note === "string"
                ? preferences.skills.note
                : ""
            );
          }
        }
      } catch (error) {
        setErrors({
          form: getFirestoreUserMessage(error, "read"),
        });
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, [router]);

  const clearError = (field: keyof OnboardingErrors) => {
    setErrors((currentErrors) => {
      if (!currentErrors[field]) {
        return currentErrors;
      }

      const nextErrors = { ...currentErrors };
      delete nextErrors[field];
      return nextErrors;
    });
  };

  const toggleMultiValue = (
    value: string,
    setter: Dispatch<SetStateAction<string[]>>,
    field: MultiSelectField
  ) => {
    setter((currentValues) => {
      const hasValue = currentValues.includes(value);
      const exclusiveNoneOption = EXCLUSIVE_NONE_OPTIONS[field];

      if (hasValue) {
        return currentValues.filter((item) => item !== value);
      }

      if (value === exclusiveNoneOption) {
        return [exclusiveNoneOption];
      }

      return [...currentValues.filter((item) => item !== exclusiveNoneOption), value];
    });

    clearError(field);
  };

  const handleSave = async () => {
    if (!user) {
      return;
    }

    const nextErrors: OnboardingErrors = {};
    const trimmedInterestsNote = interestsNote.trim();
    const trimmedAssistanceNote = assistanceNote.trim();
    const trimmedSkillsNote = skillsNote.trim();

    if (interests.length === 0 && !trimmedInterestsNote) {
      nextErrors.interests = "Избери поне едно нещо, което те вълнува.";
    }

    if (assistance.length === 0 && !trimmedAssistanceNote) {
      nextErrors.assistance =
        "Избери поне една опция за помощ или посочи, че нямаш специални нужди.";
    }

    if (skills.length === 0 && !trimmedSkillsNote) {
      nextErrors.skills = "Избери поне една опция за умения или желание за помощ.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    try {
      setSaving(true);
      setErrors({});

      await setDoc(
        doc(db, "profiles", user.uid),
        {
          uid: user.uid,
          email: user.email ?? null,
          onboardingCompleted: true,
          onboardingCompletedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          preferences: {
            onboarding: {
              interests: {
                selectedOptions: interests,
                note: trimmedInterestsNote,
              },
              assistance: {
                selectedOptions: assistance,
                note: trimmedAssistanceNote,
              },
              skills: {
                selectedOptions: skills,
                note: trimmedSkillsNote,
              },
            },
          },
        },
        { merge: true }
      );

      router.replace(returnTo ?? "/profile");
    } catch (error) {
      setErrors({
        form: getFirestoreUserMessage(error, "write"),
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading || user === undefined || user === null) {
    return (
      <SafeAreaView style={styles.loader} edges={["top", "bottom", "left", "right"]}>
        <ActivityIndicator size="large" color="#639922" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Text style={styles.kicker}>Нека те опознаем</Text>
          <Text style={styles.title}>3 бързи въпроса за по-точни AI предложения</Text>
          <Text style={styles.subtitle}>
            Ще отнеме под минута и ще запазим отговорите към твоя профил.
          </Text>
        </View>

      <View style={styles.card}>
        <Text style={styles.questionTitle}>1. Какво те вълнува по време на пътуване?</Text>
        <Text style={styles.questionSubtitle}>Избери едно или повече.</Text>
        <View style={styles.chipWrap}>
          {INTEREST_OPTIONS.map((option) => (
            <ChoiceChip
              key={option}
              label={option}
              selected={interests.includes(option)}
              onPress={() => toggleMultiValue(option, setInterests, "interests")}
            />
          ))}
        </View>
        <Text style={styles.noteLabel}>Допълнително по желание</Text>
        <TextInput
          style={styles.noteInput}
          placeholder="Напиши какво най-много търсиш или какво искаш да избегнеш..."
          placeholderTextColor="#7B8870"
          value={interestsNote}
          onChangeText={(value) => {
            setInterestsNote(value);
            clearError("interests");
          }}
          multiline
          textAlignVertical="top"
        />
        {errors.interests ? (
          <Text style={styles.errorText}>{errors.interests}</Text>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.questionTitle}>
          2. Имаш ли нужда от специална помощ по време на пътуване?
        </Text>
        <Text style={styles.questionSubtitle}>Избери едно или повече.</Text>
        <View style={styles.chipWrap}>
          {ASSISTANCE_OPTIONS.map((option) => (
            <ChoiceChip
              key={option}
              label={option}
              selected={assistance.includes(option)}
              onPress={() => toggleMultiValue(option, setAssistance, "assistance")}
            />
          ))}
        </View>
        <Text style={styles.noteLabel}>Допълнително по желание</Text>
        <TextInput
          style={styles.noteInput}
          placeholder="Напиши детайли, които ще помогнат за по-подходящи предложения..."
          placeholderTextColor="#7B8870"
          value={assistanceNote}
          onChangeText={(value) => {
            setAssistanceNote(value);
            clearError("assistance");
          }}
          multiline
          textAlignVertical="top"
        />
        {errors.assistance ? (
          <Text style={styles.errorText}>{errors.assistance}</Text>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.questionTitle}>
          3. Какво можеш да правиш, ако искаш да помогнеш?
        </Text>
        <Text style={styles.questionSubtitle}>Избери едно или повече.</Text>
        <View style={styles.chipWrap}>
          {SKILLS_OPTIONS.map((option) => (
            <ChoiceChip
              key={option}
              label={option}
              selected={skills.includes(option)}
              onPress={() => toggleMultiValue(option, setSkills, "skills")}
            />
          ))}
        </View>
        <Text style={styles.noteLabel}>Допълнително по желание</Text>
        <TextInput
          style={styles.noteInput}
          placeholder="Добави конкретни умения, опит или предпочитан тип помощ..."
          placeholderTextColor="#7B8870"
          value={skillsNote}
          onChangeText={(value) => {
            setSkillsNote(value);
            clearError("skills");
          }}
          multiline
          textAlignVertical="top"
        />
        {errors.skills ? (
          <Text style={styles.errorText}>{errors.skills}</Text>
        ) : null}
      </View>

      {errors.form ? <Text style={styles.formError}>{errors.form}</Text> : null}

        <TouchableOpacity
          style={[styles.primaryButton, saving && styles.primaryButtonDisabled]}
          onPress={handleSave}
          activeOpacity={0.9}
          disabled={saving}
        >
          <Text style={styles.primaryButtonText}>
            {saving
              ? "Запазване..."
              : returnTo
                ? "Save changes"
                : "Запази и продължи"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#EAF3DE",
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  loader: {
    flex: 1,
    backgroundColor: "#EAF3DE",
    alignItems: "center",
    justifyContent: "center",
  },
  hero: {
    backgroundColor: "#2F4F14",
    borderRadius: 24,
    padding: 24,
    marginBottom: 18,
  },
  kicker: {
    color: "#CFE7A4",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  title: {
    color: "#FFFFFF",
    fontSize: 28,
    lineHeight: 36,
    fontWeight: "800",
    marginBottom: 10,
  },
  subtitle: {
    color: "#EAF3DE",
    fontSize: 15,
    lineHeight: 22,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 18,
    marginBottom: 16,
    shadowColor: "#1E2A12",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  questionTitle: {
    fontSize: 19,
    lineHeight: 26,
    fontWeight: "700",
    color: "#29440F",
    marginBottom: 6,
  },
  questionSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: "#5F6E53",
    marginBottom: 14,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  chip: {
    backgroundColor: "#F6F8EE",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginRight: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#D8E3C2",
  },
  chipSelected: {
    backgroundColor: "#639922",
    borderColor: "#639922",
  },
  chipText: {
    color: "#39521C",
    fontSize: 14,
    fontWeight: "600",
  },
  chipTextSelected: {
    color: "#FFFFFF",
  },
  noteLabel: {
    marginTop: 8,
    marginBottom: 8,
    color: "#516244",
    fontSize: 13,
    fontWeight: "600",
  },
  noteInput: {
    minHeight: 92,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#D8E3C2",
    backgroundColor: "#F9FBF4",
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#29440F",
    fontSize: 14,
    lineHeight: 20,
  },
  errorText: {
    color: "#C62828",
    marginTop: 6,
    fontSize: 13,
  },
  formError: {
    color: "#C62828",
    textAlign: "center",
    fontSize: 14,
    marginBottom: 14,
  },
  primaryButton: {
    backgroundColor: "#639922",
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: "center",
    marginTop: 6,
  },
  primaryButtonDisabled: {
    opacity: 0.75,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
});
