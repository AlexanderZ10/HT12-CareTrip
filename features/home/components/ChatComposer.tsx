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
    if (step === "done") return "Ask about your trip...";
    if (step === "chatting") return "Write your answer...";
    if (step === "budget") return "Write your budget in EUR...";
    if (step === "days") return "Write the number of days...";
    if (step === "travelers") return "Write how many people are traveling...";
    if (step === "transport") return "Write your preferred transport...";
    if (step === "timing") return "Write when you want to travel...";
    if (step === "destination") return "Write the destination...";
    return "Write a message...";
  }

  if (language === "de") {
    if (step === "done") return "Frag etwas zu deiner Reise...";
    if (step === "chatting") return "Schreibe deine Antwort...";
    if (step === "budget") return "Schreibe dein Budget in EUR...";
    if (step === "days") return "Schreibe die Anzahl der Tage...";
    if (step === "travelers") return "Schreibe, wie viele Personen reisen...";
    if (step === "transport") return "Schreibe dein bevorzugtes Verkehrsmittel...";
    if (step === "timing") return "Schreibe, wann ihr reisen wollt...";
    if (step === "destination") return "Schreibe das Reiseziel...";
    return "Nachricht schreiben...";
  }

  if (language === "es") {
    if (step === "done") return "Pregunta sobre tu viaje...";
    if (step === "chatting") return "Escribe tu respuesta...";
    if (step === "budget") return "Escribe tu presupuesto en EUR...";
    if (step === "days") return "Escribe el número de días...";
    if (step === "travelers") return "Escribe cuántas personas viajarán...";
    if (step === "transport") return "Escribe tu transporte preferido...";
    if (step === "timing") return "Escribe cuándo quieres viajar...";
    if (step === "destination") return "Escribe el destino...";
    return "Escribe un mensaje...";
  }

  if (language === "fr") {
    if (step === "done") return "Pose une question sur ton voyage...";
    if (step === "chatting") return "Écris ta réponse...";
    if (step === "budget") return "Écris ton budget en EUR...";
    if (step === "days") return "Écris le nombre de jours...";
    if (step === "travelers") return "Écris combien de personnes voyageront...";
    if (step === "transport") return "Écris ton transport préféré...";
    if (step === "timing") return "Écris quand vous voulez voyager...";
    if (step === "destination") return "Écris la destination...";
    return "Écris un message...";
  }

  if (step === "done") return "Попитай за пътуването си...";
  if (step === "chatting") return "Напиши отговор...";
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
