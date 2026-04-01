import React from "react";
import { StyleProp, StyleSheet, Text, TextStyle, View } from "react-native";

import { useAppLanguage } from "../../../components/app-language-provider";
import { FontWeight, Spacing, TypeScale } from "../../../constants/design-system";

function renderInlineMarkdownSegments(text: string, baseStyle: StyleProp<TextStyle>) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((segment, index) => {
    const isBold = segment.startsWith("**") && segment.endsWith("**") && segment.length > 4;

    return (
      <Text
        key={`segment-${index}`}
        style={[baseStyle, isBold && styles.messageTextBold]}
      >
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
    cardAlt: string;
    textMuted: string;
    textPrimary: string;
  };
  displayedText: string;
  role: "user" | "assistant";
};

export function ChatMessageBubble({ colors, displayedText, role }: ChatMessageBubbleProps) {
  const isAssistant = role === "assistant";
  const { t } = useAppLanguage();

  return (
    <View
      style={[
        styles.messageBubble,
        isAssistant
          ? [styles.assistantBubble, { backgroundColor: colors.cardAlt }]
          : [styles.userBubble, { backgroundColor: colors.accent }],
      ]}
    >
      <Text
        style={[
          styles.messageRoleLabel,
          { color: isAssistant ? colors.textMuted : "rgba(255,255,255,0.7)" },
        ]}
      >
        {isAssistant ? t("home.aiPlanner") : t("common.you")}
      </Text>
      <FormattedMessageText
        text={displayedText}
        textStyle={[
          styles.messageText,
          isAssistant
            ? [styles.assistantMessageText, { color: colors.textPrimary }]
            : styles.userMessageText,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  messageBubble: {
    borderRadius: 20,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.sm,
    maxWidth: "88%",
  },
  assistantBubble: {
    alignSelf: "flex-start",
    borderTopLeftRadius: 4,
  },
  userBubble: {
    alignSelf: "flex-end",
    borderTopRightRadius: 4,
  },
  messageRoleLabel: {
    ...TypeScale.labelSm,
    fontWeight: FontWeight.semibold,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 3,
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
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: Spacing.xs,
  },
  messageBulletMark: {
    width: Spacing.lg,
    fontWeight: FontWeight.extrabold,
  },
  messageBulletText: {
    flex: 1,
  },
  messageSpacer: {
    height: Spacing.sm,
  },
});
