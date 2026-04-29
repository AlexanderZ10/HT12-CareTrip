import { useLocalSearchParams, useRouter } from "expo-router";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { auth, db } from "../firebase";
import { useAppLanguage } from "../components/app-language-provider";
import { useAppTheme } from "../components/app-theme-provider";
import { DismissKeyboard } from "../components/dismiss-keyboard";
import { Spacing, Radius, TypeScale, FontWeight, shadow } from "../constants/design-system";
import { getFirestoreUserMessage } from "../utils/firestore-errors";
import type { TranslationKey } from "../utils/translations";
import React, { useMemo } from "react";

const INTEREST_KEYS: TranslationKey[] = [
  "onboarding.optNone.interests",
  "onboarding.interest.nature",
  "onboarding.interest.history",
  "onboarding.interest.food",
  "onboarding.interest.art",
  "onboarding.interest.sport",
  "onboarding.interest.relax",
  "onboarding.interest.family",
  "onboarding.interest.photo",
];

const ASSISTANCE_KEYS: TranslationKey[] = [
  "onboarding.optNone.assistance",
  "onboarding.assist.wheelchair",
  "onboarding.assist.visual",
  "onboarding.assist.hearing",
  "onboarding.assist.medical",
  "onboarding.assist.allergy",
  "onboarding.assist.sensory",
];

const SKILLS_KEYS: TranslationKey[] = [
  "onboarding.optNone.skills",
  "onboarding.skill.gardening",
  "onboarding.skill.construction",
  "onboarding.skill.teaching",
  "onboarding.skill.cooking",
  "onboarding.skill.it",
  "onboarding.skill.photo",
  "onboarding.skill.physical",
  "onboarding.skill.willingness",
];

type OnboardingErrors = {
  interests?: string;
  assistance?: string;
  skills?: string;
  form?: string;
};

type MultiSelectField = "interests" | "assistance" | "skills";

const EXCLUSIVE_NONE_KEYS: Record<MultiSelectField, TranslationKey> = {
  interests: "onboarding.optNone.interests",
  assistance: "onboarding.optNone.assistance",
  skills: "onboarding.optNone.skills",
};

type ChoiceChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useAppTheme>["colors"];
};

function ChoiceChip({ label, selected, onPress, colors }: ChoiceChipProps) {
  return (
    <TouchableOpacity
      style={[
        styles.chip,
        { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder },
        selected && { backgroundColor: colors.accent, borderColor: colors.accent },
      ]}
      onPress={onPress}
      activeOpacity={0.9}
    >
      <Text
        style={[
          styles.chipText,
          { color: colors.textSecondary },
          selected && { color: colors.buttonTextOnAction },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useAppLanguage();
  const { colors } = useAppTheme();
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

  const interestOptions = useMemo(() => INTEREST_KEYS.map((k) => t(k)), [t]);
  const assistanceOptions = useMemo(() => ASSISTANCE_KEYS.map((k) => t(k)), [t]);
  const skillsOptions = useMemo(() => SKILLS_KEYS.map((k) => t(k)), [t]);
  const exclusiveNoneOptions = useMemo<Record<MultiSelectField, string>>(() => ({
    interests: t(EXCLUSIVE_NONE_KEYS.interests),
    assistance: t(EXCLUSIVE_NONE_KEYS.assistance),
    skills: t(EXCLUSIVE_NONE_KEYS.skills),
  }), [t]);
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
      const exclusiveNoneOption = exclusiveNoneOptions[field];

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
      nextErrors.interests = t("onboarding.q1Error");
    }

    if (assistance.length === 0 && !trimmedAssistanceNote) {
      nextErrors.assistance = t("onboarding.q2Error");
    }

    if (skills.length === 0 && !trimmedSkillsNote) {
      nextErrors.skills = t("onboarding.q3Error");
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

      router.replace((returnTo ?? "/profile") as "/(tabs)/profile");
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
      <SafeAreaView style={[styles.loader, { backgroundColor: colors.screen }]} edges={["top", "bottom", "left", "right"]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.screen }]} edges={["top", "bottom", "left", "right"]}>
      <DismissKeyboard>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 8 : 0}
      >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={[styles.hero, { backgroundColor: colors.accent }]}>
          <Text style={[styles.kicker, { color: colors.buttonTextOnAction }]}>{t("onboarding.kicker")}</Text>
          <Text style={[styles.title, { color: colors.buttonTextOnAction }]}>{t("onboarding.title")}</Text>
        </View>

      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <Text style={[styles.questionTitle, { color: colors.textPrimary }]}>{t("onboarding.q1Title")}</Text>
        <Text style={[styles.questionSubtitle, { color: colors.textSecondary }]}>{t("onboarding.selectOneOrMore")}</Text>
        <View style={styles.chipWrap}>
          {interestOptions.map((option) => (
            <ChoiceChip
              key={option}
              label={option}
              selected={interests.includes(option)}
              onPress={() => toggleMultiValue(option, setInterests, "interests")}
              colors={colors}
            />
          ))}
        </View>
        <Text style={[styles.noteLabel, { color: colors.textSecondary }]}>{t("onboarding.optionalNote")}</Text>
        <TextInput
          style={[styles.noteInput, { borderColor: colors.inputBorder, backgroundColor: colors.inputBackground, color: colors.inputText }]}
          placeholder={t("onboarding.q1Placeholder")}
          placeholderTextColor={colors.inputPlaceholder}
          value={interestsNote}
          onChangeText={(value) => {
            setInterestsNote(value);
            clearError("interests");
          }}
          maxLength={280}
          multiline
          textAlignVertical="top"
        />
        {errors.interests ? (
          <Text style={[styles.errorText, { color: colors.error }]}>{errors.interests}</Text>
        ) : null}
      </View>

      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <Text style={[styles.questionTitle, { color: colors.textPrimary }]}>{t("onboarding.q2Title")}</Text>
        <Text style={[styles.questionSubtitle, { color: colors.textSecondary }]}>{t("onboarding.selectOneOrMore")}</Text>
        <View style={styles.chipWrap}>
          {assistanceOptions.map((option) => (
            <ChoiceChip
              key={option}
              label={option}
              selected={assistance.includes(option)}
              onPress={() => toggleMultiValue(option, setAssistance, "assistance")}
              colors={colors}
            />
          ))}
        </View>
        <Text style={[styles.noteLabel, { color: colors.textSecondary }]}>{t("onboarding.optionalNote")}</Text>
        <TextInput
          style={[styles.noteInput, { borderColor: colors.inputBorder, backgroundColor: colors.inputBackground, color: colors.inputText }]}
          placeholder={t("onboarding.q2Placeholder")}
          placeholderTextColor={colors.inputPlaceholder}
          value={assistanceNote}
          onChangeText={(value) => {
            setAssistanceNote(value);
            clearError("assistance");
          }}
          maxLength={280}
          multiline
          textAlignVertical="top"
        />
        {errors.assistance ? (
          <Text style={[styles.errorText, { color: colors.error }]}>{errors.assistance}</Text>
        ) : null}
      </View>

      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <Text style={[styles.questionTitle, { color: colors.textPrimary }]}>{t("onboarding.q3Title")}</Text>
        <Text style={[styles.questionSubtitle, { color: colors.textSecondary }]}>{t("onboarding.selectOneOrMore")}</Text>
        <View style={styles.chipWrap}>
          {skillsOptions.map((option) => (
            <ChoiceChip
              key={option}
              label={option}
              selected={skills.includes(option)}
              onPress={() => toggleMultiValue(option, setSkills, "skills")}
              colors={colors}
            />
          ))}
        </View>
        <Text style={[styles.noteLabel, { color: colors.textSecondary }]}>{t("onboarding.optionalNote")}</Text>
        <TextInput
          style={[styles.noteInput, { borderColor: colors.inputBorder, backgroundColor: colors.inputBackground, color: colors.inputText }]}
          placeholder={t("onboarding.q3Placeholder")}
          placeholderTextColor={colors.inputPlaceholder}
          value={skillsNote}
          onChangeText={(value) => {
            setSkillsNote(value);
            clearError("skills");
          }}
          maxLength={280}
          multiline
          textAlignVertical="top"
        />
        {errors.skills ? (
          <Text style={[styles.errorText, { color: colors.error }]}>{errors.skills}</Text>
        ) : null}
      </View>

      {errors.form ? <Text style={[styles.formError, { color: colors.error }]}>{errors.form}</Text> : null}

        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: colors.accent }, saving && styles.primaryButtonDisabled]}
          onPress={handleSave}
          activeOpacity={0.9}
          disabled={saving}
        >
          <Text style={[styles.primaryButtonText, { color: colors.buttonTextOnAction }]}>
            {saving
              ? t("common.saving")
              : returnTo
                ? t("onboarding.saveChangesButton")
                : t("onboarding.saveAndContinue")}
          </Text>
        </TouchableOpacity>
      </ScrollView>
      </KeyboardAvoidingView>
      </DismissKeyboard>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    padding: Spacing.xl,
    paddingBottom: Spacing["4xl"],
  },
  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  hero: {
    borderRadius: Radius["2xl"],
    padding: Spacing["2xl"],
    marginBottom: Spacing.lg,
  },
  kicker: {
    ...TypeScale.bodySm,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
    textTransform: "uppercase",
  },
  title: {
    ...TypeScale.displayMd,
  },
  card: {
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    ...shadow("md"),
  },
  questionTitle: {
    fontSize: 19,
    lineHeight: 26,
    fontWeight: FontWeight.bold,
    marginBottom: 6,
  },
  questionSubtitle: {
    ...TypeScale.bodyMd,
    marginBottom: Spacing.md,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  chip: {
    borderRadius: Radius.lg,
    paddingHorizontal: 14,
    paddingVertical: Spacing.md,
    marginRight: 10,
    marginBottom: 10,
    borderWidth: 1,
  },
  chipText: {
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.semibold,
  },
  noteLabel: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
    ...TypeScale.bodySm,
    fontWeight: FontWeight.semibold,
  },
  noteInput: {
    minHeight: 92,
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: Spacing.md,
    ...TypeScale.bodyMd,
  },
  errorText: {
    marginTop: 6,
    ...TypeScale.bodySm,
  },
  formError: {
    textAlign: "center",
    ...TypeScale.bodyMd,
    marginBottom: Spacing.md,
  },
  primaryButton: {
    borderRadius: Radius.lg,
    paddingVertical: 17,
    alignItems: "center",
    marginTop: 6,
  },
  primaryButtonDisabled: {
    opacity: 0.75,
  },
  primaryButtonText: {
    ...TypeScale.titleMd,
    fontWeight: FontWeight.bold,
  },
});
