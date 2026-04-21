import { MaterialIcons } from "@expo/vector-icons";
import React from "react";
import { StyleProp, StyleSheet, Text, TextStyle, View } from "react-native";

import { useAppLanguage } from "../../../components/app-language-provider";
import { FontWeight, Radius, Spacing, TypeScale } from "../../../constants/design-system";

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
};

export function ChatMessageBubble({ colors, displayedText, role }: ChatMessageBubbleProps) {
  const isAssistant = role === "assistant";
  const { t } = useAppLanguage();

  return (
    <View
      style={[
        styles.messageRow,
        !isAssistant && styles.userMessageRow,
      ]}
    >
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
            text={displayedText}
            textStyle={[
              styles.messageText,
              isAssistant
                ? [styles.assistantMessageText, { color: colors.textPrimary }]
                : [styles.userMessageText, { color: colors.buttonTextOnAction }],
            ]}
          />
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
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: Spacing.xs,
    paddingLeft: Spacing.xs,
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
