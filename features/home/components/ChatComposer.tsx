import { MaterialIcons } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { useAppLanguage } from "../../../components/app-language-provider";
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

function getPlaceholder(step: HomePlannerStep, language: "bg" | "en" | "de" | "es" | "fr") {
  if (language === "en") {
    if (step === "done") return "Adjust the plan or type generate again...";
    if (step === "chatting") return "Tell me what kind of trip you want...";
    return "Write a message...";
  }

  if (language === "de") {
    if (step === "done") return "Passe den Plan an oder schreibe generate again...";
    if (step === "chatting") return "Erzahl mir, was fur eine Reise du willst...";
    return "Nachricht schreiben...";
  }

  if (language === "es") {
    if (step === "done") return "Ajusta el plan o escribe generate again...";
    if (step === "chatting") return "Cuentame que tipo de viaje quieres...";
    return "Escribe un mensaje...";
  }

  if (language === "fr") {
    if (step === "done") return "Ajuste le plan ou écris generate again...";
    if (step === "chatting") return "Dis-moi quel type de voyage tu veux...";
    return "Écris un message...";
  }

  if (step === "done") return "Промени плана или напиши generate again...";
  if (step === "chatting") return "Кажи ми какво пътуване искаш...";
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
  const { language, t } = useAppLanguage();

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
          accessibilityLabel="Message input"
          style={[styles.input, { color: colors.textPrimary }]}
          placeholder={getPlaceholder(step, language)}
          placeholderTextColor={colors.inputPlaceholder}
          value={chatInput}
          onChangeText={onChangeText}
          editable={!planning}
          multiline
          blurOnSubmit={false}
          returnKeyType={Platform.OS === "web" ? undefined : "send"}
          onSubmitEditing={() => {
            if (Platform.OS !== "web" && canSend) {
              onSend();
            }
          }}
        />
        <TouchableOpacity
          accessibilityLabel="Send message"
          style={[
            styles.sendButton,
            { backgroundColor: canSend ? colors.accent : colors.disabledBackground },
          ]}
          onPress={onSend}
          disabled={!canSend}
          activeOpacity={0.9}
        >
          <MaterialIcons
            name="arrow-upward"
            size={20}
            color={canSend ? colors.buttonTextOnAction : colors.disabledText}
          />
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        accessibilityLabel="Start new plan"
        style={styles.resetButton}
        onPress={onReset}
        disabled={planning}
        activeOpacity={0.9}
      >
        <MaterialIcons name="refresh" size={14} color={colors.textMuted} />
        <Text style={[styles.resetButtonText, { color: colors.textMuted }]}>
          {t("home.newPlan")}
        </Text>
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
