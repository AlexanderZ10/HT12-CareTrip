import { MaterialIcons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  type LayoutChangeEvent,
  Platform,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { useAppLanguage } from "../../../components/app-language-provider";
import { Radius, Spacing, TypeScale } from "../../../constants/design-system";
import type { HomePlannerStep } from "../../../utils/home-chat-storage";
import { getSpeechRecognitionModule } from "../../../utils/speech-recognition";
import type { AppLanguage } from "../../../utils/translations";

const RECOGNITION_LOCALES: Record<AppLanguage, string> = {
  bg: "bg-BG",
  en: "en-US",
  de: "de-DE",
  es: "es-ES",
  fr: "fr-FR",
};

type ChatComposerProps = {
  canSend: boolean;
  chatInput: string;
  colors: {
    accent: string;
    buttonTextOnAction: string;
    card: string;
    cardAlt: string;
    disabledBackground: string;
    disabledText: string;
    elevated: string;
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
  onFocus: () => void;
  onLayout: (event: LayoutChangeEvent) => void;
  onReset: () => void;
  onSend: () => void;
  planning: boolean;
  planningLabel: string | null;
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
  onFocus,
  onLayout,
  onReset,
  onSend,
  planning,
  planningLabel,
  step,
}: ChatComposerProps) {
  const { language, t } = useAppLanguage();
  const [isListening, setIsListening] = useState(false);
  const baseTextRef = useRef<string>("");
  const onChangeTextRef = useRef(onChangeText);
  onChangeTextRef.current = onChangeText;

  const speechModule = useMemo(() => getSpeechRecognitionModule(), []);
  const speechSupported = speechModule !== null;

  const stopListening = useCallback(() => {
    if (!speechModule) {
      return;
    }
    try {
      speechModule.stop();
    } catch {
      // ignore — module may already be stopped
    }
  }, [speechModule]);

  useEffect(() => {
    if (!speechModule) {
      return;
    }

    const subs = [
      speechModule.addListener("start", () => setIsListening(true)),
      speechModule.addListener("end", () => setIsListening(false)),
      speechModule.addListener("error", (payload: unknown) => {
        setIsListening(false);
        const error = (payload as { error?: string } | null)?.error;
        if (error && error !== "aborted" && error !== "no-speech") {
          Alert.alert(t("home.dictationUnavailable"));
        }
      }),
      speechModule.addListener("result", (payload: unknown) => {
        const transcript =
          (payload as {
            results?: Array<{ transcript?: string }>;
          } | null)?.results?.[0]?.transcript ?? "";
        if (!transcript) {
          return;
        }
        const base = baseTextRef.current;
        const merged = base ? `${base.trimEnd()} ${transcript}` : transcript;
        onChangeTextRef.current(merged);
      }),
    ];

    return () => {
      subs.forEach((sub) => sub.remove());
      try {
        speechModule.stop();
      } catch {
        // ignore
      }
    };
  }, [speechModule, t]);

  const handleToggleDictation = useCallback(async () => {
    if (planning || !speechModule) {
      return;
    }
    if (isListening) {
      stopListening();
      return;
    }

    try {
      const result = await speechModule.requestPermissionsAsync();
      if (!result.granted) {
        Alert.alert(t("home.dictationPermissionDenied"));
        return;
      }
    } catch {
      Alert.alert(t("home.dictationUnavailable"));
      return;
    }

    baseTextRef.current = chatInput;
    try {
      speechModule.start({
        lang: RECOGNITION_LOCALES[language] ?? "en-US",
        interimResults: true,
        continuous: false,
      });
    } catch {
      Alert.alert(t("home.dictationUnavailable"));
    }
  }, [chatInput, isListening, language, planning, speechModule, stopListening, t]);

  return (
    <View
      onLayout={onLayout}
      style={[
        styles.composer,
        { backgroundColor: colors.elevated, borderColor: colors.border },
        { paddingBottom: Math.max(insetBottom, 8) },
      ]}
    >
      <TouchableOpacity
        accessibilityLabel="Start new plan"
        style={[
          styles.resetButton,
          { backgroundColor: colors.cardAlt, borderColor: colors.border },
          planning && styles.actionDisabled,
        ]}
        onPress={onReset}
        disabled={planning}
        activeOpacity={0.9}
      >
        <MaterialIcons name="refresh" size={18} color={colors.textMuted} />
      </TouchableOpacity>
      <View
        style={[
          styles.composerInputRow,
          { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder },
        ]}
      >
        <TextInput
          accessibilityLabel="Message input"
          style={[styles.input, { color: colors.textPrimary }]}
          placeholder={
            planning
              ? planningLabel ?? ""
              : getPlaceholder(step, language)
          }
          placeholderTextColor={colors.inputPlaceholder}
          value={chatInput}
          onChangeText={onChangeText}
          onFocus={onFocus}
          onContentSizeChange={() => onFocus()}
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
          accessibilityLabel={
            isListening ? t("home.stopDictation") : t("home.startDictation")
          }
          style={[
            styles.micButton,
            {
              backgroundColor: isListening ? colors.accent : colors.cardAlt,
              borderColor: colors.border,
            },
            planning && styles.actionDisabled,
          ]}
          onPress={() => {
            if (!speechSupported) {
              Alert.alert(t("home.dictationUnavailable"));
              return;
            }
            void handleToggleDictation();
          }}
          disabled={planning}
          activeOpacity={0.9}
        >
          <MaterialIcons
            name={isListening ? "stop" : "mic"}
            size={18}
            color={isListening ? colors.buttonTextOnAction : colors.textMuted}
          />
        </TouchableOpacity>
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
          {planning ? (
            <ActivityIndicator size="small" color={colors.disabledText} />
          ) : (
            <MaterialIcons
              name="arrow-upward"
              size={20}
              color={canSend ? colors.buttonTextOnAction : colors.disabledText}
            />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  composer: {
    alignItems: "flex-end",
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  composerInputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    borderRadius: Radius.xl,
    borderWidth: 1,
    flex: 1,
    paddingLeft: Spacing.lg,
    paddingRight: Spacing.xs,
    paddingVertical: Spacing.xs,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    ...TypeScale.bodyMd,
    textAlignVertical: "top",
    paddingTop: Platform.OS === "ios" ? 11 : 9,
    paddingBottom: Platform.OS === "ios" ? 11 : 9,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: Spacing.sm,
    marginBottom: 1,
  },
  micButton: {
    alignItems: "center",
    borderRadius: Radius.full,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    marginLeft: Spacing.xs,
    marginBottom: 1,
    width: 38,
  },
  resetButton: {
    alignItems: "center",
    borderRadius: Radius.lg,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    marginBottom: 1,
    width: 44,
  },
  actionDisabled: {
    opacity: 0.52,
  },
});
