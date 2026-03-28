import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";

import { useAppTheme } from "../../../components/app-theme-provider";
import { Radius, Spacing, TypeScale, FontWeight } from "../../../constants/design-system";

interface MathCaptchaProps {
  /** The equation string to display, e.g. "12 + 5 = ?" */
  prompt: string;
  /** Current answer text entered by the user. */
  answer: string;
  /** Called when the answer text changes (already filtered to digits and minus sign). */
  onChangeAnswer: (text: string) => void;
  /** Called when the user taps the refresh button. */
  onRefresh: () => void;
  /** Error message to display, if any. */
  error?: string;
  /** Whether the input should be disabled. */
  disabled?: boolean;
}

export default function MathCaptcha({
  prompt,
  answer,
  onChangeAnswer,
  onRefresh,
  error,
  disabled,
}: MathCaptchaProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.captchaCard}>
      <View style={styles.captchaHeader}>
        <View style={styles.captchaTitleRow}>
          <MaterialIcons name="security" size={16} color={colors.accentText} />
          <Text style={styles.captchaTitle}>Quick check</Text>
        </View>
        <Pressable
          style={styles.refreshButton}
          onPress={onRefresh}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialIcons name="refresh" size={16} color={colors.highlight} />
          <Text style={styles.refreshText}>New</Text>
        </Pressable>
      </View>

      <Text style={styles.captchaEquation}>{prompt}</Text>

      <TextInput
        placeholder="Your answer"
        placeholderTextColor={colors.inputPlaceholder}
        style={[styles.input, styles.captchaInput, error ? styles.inputError : null]}
        value={answer}
        onChangeText={(text) => onChangeAnswer(text.replace(/[^0-9-]/g, ""))}
        keyboardType="number-pad"
        editable={!disabled}
      />
      {error ? (
        <View style={styles.errorRow}>
          <MaterialIcons name="error-outline" size={14} color={colors.error} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useAppTheme>["colors"]) {
  return StyleSheet.create({
    captchaCard: {
      backgroundColor: colors.elevated,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: Spacing.lg,
      marginBottom: Spacing.lg,
    },
    captchaHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: Spacing.md,
    },
    captchaTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.xs,
    },
    captchaTitle: {
      ...TypeScale.titleSm,
      color: colors.accentText,
    },
    refreshButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.xs,
      backgroundColor: colors.card,
      borderRadius: Radius.sm,
      paddingHorizontal: Spacing.sm,
      paddingVertical: Spacing.xs,
      borderWidth: 1,
      borderColor: colors.border,
    },
    refreshText: {
      ...TypeScale.labelMd,
      color: colors.highlight,
      fontWeight: FontWeight.semibold,
    },
    captchaEquation: {
      ...TypeScale.headingSm,
      color: colors.textPrimary,
      marginBottom: Spacing.md,
    },
    input: {
      backgroundColor: colors.inputBackground,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md,
      ...TypeScale.bodyMd,
      color: colors.inputText,
      minHeight: 48,
    },
    captchaInput: {
      marginBottom: 0,
    },
    inputError: {
      borderColor: colors.error,
    },
    errorRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.xs,
      marginTop: Spacing.xs,
    },
    errorText: {
      ...TypeScale.labelMd,
      color: colors.error,
      flex: 1,
    },
  });
}
