import { MaterialIcons } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { FontWeight, Radius, Spacing, TypeScale } from "../../../constants/design-system";
import type { HomePlannerStep } from "../../../utils/home-chat-storage";

type ChatComposerProps = {
  canSend: boolean;
  chatInput: string;
  colors: {
    accent: string;
    buttonTextOnAction: string;
    disabledBackground: string;
    disabledText: string;
    inputBackground: string;
    inputBorder: string;
    inputPlaceholder: string;
    screen: string;
    textMuted: string;
    textPrimary: string;
    border: string;
  };
  insetBottom: number;
  onChangeText: (text: string) => void;
  onReset: () => void;
  onSend: () => void;
  planning: boolean;
  step: HomePlannerStep;
};

function getPlaceholder(step: HomePlannerStep) {
  if (step === "budget") return "Напиши бюджета в евро...";
  if (step === "days") return "Напиши броя дни...";
  if (step === "travelers") return "Напиши колко човека ще пътуват...";
  if (step === "transport") return "Напиши предпочитан транспорт...";
  if (step === "timing") return "Напиши кога искате да пътувате...";
  if (step === "destination") return "Напиши дестинацията...";
  return "Напиши съобщение...";
}

export function ChatComposer({
  canSend,
  chatInput,
  colors,
  insetBottom,
  onChangeText,
  onReset,
  onSend,
  planning,
  step,
}: ChatComposerProps) {
  return (
    <View
      style={[
        styles.composer,
        { backgroundColor: colors.screen, borderTopColor: colors.border },
        { paddingBottom: Math.max(insetBottom, 8) },
      ]}
    >
      <View
        style={[
          styles.composerInputRow,
          { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder },
        ]}
      >
        <TextInput
          style={[styles.input, { color: colors.textPrimary }]}
          placeholder={getPlaceholder(step)}
          placeholderTextColor={colors.inputPlaceholder}
          value={chatInput}
          onChangeText={onChangeText}
          editable={step !== "done" && !planning}
          multiline
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            { backgroundColor: canSend ? colors.accent : colors.disabledBackground },
          ]}
          onPress={onSend}
          disabled={!canSend}
          activeOpacity={0.7}
        >
          <MaterialIcons
            name="arrow-upward"
            size={20}
            color={canSend ? colors.buttonTextOnAction : colors.disabledText}
          />
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        style={styles.resetButton}
        onPress={onReset}
        disabled={planning}
        activeOpacity={0.7}
      >
        <MaterialIcons name="refresh" size={14} color={colors.textMuted} />
        <Text style={[styles.resetButtonText, { color: colors.textMuted }]}>Нов план</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  composer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
  },
  composerInputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    borderRadius: Radius["2xl"],
    borderWidth: 1,
    paddingLeft: Spacing.lg,
    paddingRight: Spacing.xs,
    paddingVertical: Spacing.xs,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    ...TypeScale.bodyMd,
    textAlignVertical: "top",
    paddingTop: Platform.OS === "ios" ? 10 : 8,
    paddingBottom: Platform.OS === "ios" ? 10 : 8,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: Spacing.sm,
  },
  resetButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    paddingVertical: Spacing.sm,
  },
  resetButtonText: {
    ...TypeScale.labelSm,
    fontWeight: FontWeight.semibold,
    marginLeft: Spacing.xs,
  },
});
