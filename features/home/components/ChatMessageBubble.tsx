import { MaterialIcons } from "@expo/vector-icons";
import * as Speech from "expo-speech";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleProp, StyleSheet, Text, TextStyle, View } from "react-native";

import { useAppLanguage } from "../../../components/app-language-provider";
import { FontWeight, Radius, Spacing, TypeScale } from "../../../constants/design-system";
import { normalizeCurrencyAliasesInText } from "../../../utils/currency";
import type { AppLanguage } from "../../../utils/translations";

const SPEECH_LOCALES: Record<AppLanguage, string> = {
  bg: "bg-BG",
  en: "en-US",
  de: "de-DE",
  es: "es-ES",
  fr: "fr-FR",
};

const SPEECH_CURRENCY_LABELS: Record<
  AppLanguage,
  { bgn: string; euro: string; gbp: string; usd: string }
> = {
  bg: {
    bgn: "български лева",
    euro: "евро",
    gbp: "британски паунда",
    usd: "щатски долара",
  },
  en: {
    bgn: "Bulgarian lev",
    euro: "euro",
    gbp: "British pounds",
    usd: "US dollars",
  },
  de: {
    bgn: "bulgarische Lew",
    euro: "Euro",
    gbp: "britische Pfund",
    usd: "US Dollar",
  },
  es: {
    bgn: "lev búlgaros",
    euro: "euros",
    gbp: "libras esterlinas",
    usd: "dólares estadounidenses",
  },
  fr: {
    bgn: "levs bulgares",
    euro: "euros",
    gbp: "livres sterling",
    usd: "dollars américains",
  },
};

function stripMarkdownForSpeech(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/^[\s]*[-*]\s+/gm, "")
    .replace(/\n+/g, ". ")
    .replace(/([.!?])([^\s])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function createSpeechText(text: string, language: AppLanguage): string {
  const labels = SPEECH_CURRENCY_LABELS[language];

  return stripMarkdownForSpeech(text)
    .replace(/(\d+(?:[.,]\d+)?)\s*BGN\b/gi, `$1 ${labels.bgn}`)
    .replace(/(\d+(?:[.,]\d+)?)\s*euro\b/gi, `$1 ${labels.euro}`)
    .replace(/(\d+(?:[.,]\d+)?)\s*USD\b/gi, `$1 ${labels.usd}`)
    .replace(/(\d+(?:[.,]\d+)?)\s*GBP\b/gi, `$1 ${labels.gbp}`)
    .replace(/\bBGN\b/gi, labels.bgn)
    .replace(/\beuro\b/gi, labels.euro)
    .replace(/\bUSD\b/gi, labels.usd)
    .replace(/\bGBP\b/gi, labels.gbp)
    .replace(/\s+/g, " ")
    .trim();
}

function renderInlineMarkdownSegments(text: string, baseStyle: StyleProp<TextStyle>) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((segment, index) => {
    const isBold = segment.startsWith("**") && segment.endsWith("**") && segment.length > 4;

    return (
      <Text key={`segment-${index}`} style={[baseStyle, isBold && styles.messageTextBold]}>
        {isBold ? segment.slice(2, -2) : segment}
      </Text>
    );
  });
}

function FormattedMessageText({
  text,
  textStyle,
}: {
  text: string;
  textStyle: StyleProp<TextStyle>;
}) {
  const lines = text.split("\n");

  return (
    <View>
      {lines.map((line, index) => {
        const trimmedLine = line.trim();
        const bulletMatch = trimmedLine.match(/^[-*]\s+(.*)$/);

        if (!trimmedLine) {
          return <View key={`line-${index}`} style={styles.messageSpacer} />;
        }

        if (bulletMatch) {
          return (
            <View key={`line-${index}`} style={styles.messageBulletRow}>
              <Text style={[textStyle, styles.messageBulletMark]}>•</Text>
              <Text style={[textStyle, styles.messageBulletText]}>
                {renderInlineMarkdownSegments(bulletMatch[1], textStyle)}
              </Text>
            </View>
          );
        }

        return (
          <Text key={`line-${index}`} style={[textStyle, styles.messageParagraph]}>
            {renderInlineMarkdownSegments(trimmedLine, textStyle)}
          </Text>
        );
      })}
    </View>
  );
}

type ChatMessageBubbleProps = {
  colors: {
    accent: string;
    accentMuted: string;
    border: string;
    buttonTextOnAction: string;
    card: string;
    cardAlt: string;
    textMuted: string;
    textPrimary: string;
  };
  displayedText: string;
  role: "user" | "assistant";
  speechText?: string;
};

export function ChatMessageBubble({
  colors,
  displayedText,
  role,
  speechText,
}: ChatMessageBubbleProps) {
  const isAssistant = role === "assistant";
  const { t, language } = useAppLanguage();
  const [isSpeaking, setIsSpeaking] = useState(false);
  const normalizedDisplayedText = useMemo(
    () => normalizeCurrencyAliasesInText(displayedText),
    [displayedText]
  );
  const normalizedSpeechText = useMemo(
    () => createSpeechText(normalizeCurrencyAliasesInText(speechText ?? normalizedDisplayedText), language),
    [language, normalizedDisplayedText, speechText]
  );

  useEffect(() => {
    return () => {
      Speech.stop().catch(() => {});
    };
  }, []);

  const handleToggleSpeech = async () => {
    if (isSpeaking) {
      await Speech.stop().catch(() => {});
      setIsSpeaking(false);
      return;
    }

    if (!normalizedSpeechText) {
      return;
    }

    await Speech.stop().catch(() => {});
    setIsSpeaking(true);
    Speech.speak(normalizedSpeechText, {
      language: SPEECH_LOCALES[language] ?? "en-US",
      onDone: () => setIsSpeaking(false),
      onStopped: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
      pitch: 1,
      rate: 0.95,
    });
  };

  return (
    <View style={[styles.messageRow, !isAssistant && styles.userMessageRow]}>
      {isAssistant ? (
        <View
          style={[
            styles.assistantAvatar,
            { backgroundColor: colors.accentMuted, borderColor: colors.border },
          ]}
        >
          <MaterialIcons name="auto-awesome" size={15} color={colors.accent} />
        </View>
      ) : null}

      <View style={[styles.messageColumn, !isAssistant && styles.userMessageColumn]}>
        <Text
          style={[
            styles.messageRoleLabel,
            !isAssistant && styles.userMessageRoleLabel,
            { color: colors.textMuted },
          ]}
        >
          {isAssistant ? t("home.aiPlanner") : t("common.you")}
        </Text>
        <View
          style={[
            styles.messageBubble,
            isAssistant
              ? [
                  styles.assistantBubble,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]
              : [
                  styles.userBubble,
                  { backgroundColor: colors.accent, borderColor: colors.accent },
                ],
          ]}
        >
          <FormattedMessageText
            text={normalizedDisplayedText}
            textStyle={[
              styles.messageText,
              isAssistant
                ? [styles.assistantMessageText, { color: colors.textPrimary }]
                : [styles.userMessageText, { color: colors.buttonTextOnAction }],
            ]}
          />
          {normalizedSpeechText.trim().length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isSpeaking ? t("home.stopSpeaking") : t("home.speakMessage")}
              hitSlop={8}
              onPress={handleToggleSpeech}
              style={({ pressed }) => [
                styles.speakButton,
                !isAssistant && styles.userSpeakButton,
                {
                  backgroundColor: isAssistant
                    ? isSpeaking
                      ? colors.accent
                      : colors.cardAlt
                    : isSpeaking
                      ? colors.cardAlt
                      : "rgba(255, 255, 255, 0.12)",
                  borderColor: isAssistant ? colors.border : "rgba(255, 255, 255, 0.24)",
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <MaterialIcons
                name={isSpeaking ? "stop" : "volume-up"}
                size={16}
                color={
                  isAssistant
                    ? isSpeaking
                      ? colors.buttonTextOnAction
                      : colors.textMuted
                    : colors.buttonTextOnAction
                }
              />
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  messageRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    marginBottom: Spacing.md,
  },
  userMessageRow: {
    justifyContent: "flex-end",
  },
  assistantAvatar: {
    alignItems: "center",
    borderRadius: Radius.full,
    borderWidth: 1,
    height: 30,
    justifyContent: "center",
    marginBottom: 2,
    marginRight: Spacing.sm,
    width: 30,
  },
  messageColumn: {
    maxWidth: "82%",
  },
  userMessageColumn: {
    alignItems: "flex-end",
  },
  messageBubble: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  assistantBubble: {
    borderTopLeftRadius: Radius.sm,
  },
  userBubble: {
    borderTopRightRadius: Radius.sm,
  },
  messageRoleLabel: {
    ...TypeScale.labelSm,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.xs,
    marginLeft: Spacing.xs,
  },
  userMessageRoleLabel: {
    marginLeft: 0,
    marginRight: Spacing.xs,
  },
  messageText: {
    ...TypeScale.bodyMd,
    lineHeight: 22,
  },
  assistantMessageText: {
    color: "#1A1A1A",
  },
  userMessageText: {
    color: "#FFFFFF",
  },
  messageTextBold: {
    fontWeight: FontWeight.extrabold,
  },
  messageParagraph: {
    marginBottom: Spacing.xs,
  },
  messageBulletRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    marginBottom: Spacing.xs,
    paddingLeft: Spacing.xs,
  },
  messageBulletMark: {
    fontWeight: FontWeight.extrabold,
    width: Spacing.lg,
  },
  messageBulletText: {
    flex: 1,
  },
  messageSpacer: {
    height: Spacing.sm,
  },
  speakButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: Radius.full,
    borderWidth: 1,
    height: 28,
    justifyContent: "center",
    marginTop: Spacing.sm,
    width: 28,
  },
  userSpeakButton: {
    alignSelf: "flex-end",
  },
});
