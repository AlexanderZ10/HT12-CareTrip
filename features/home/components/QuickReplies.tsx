import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { FontWeight, Radius, Spacing, TypeScale } from "../../../constants/design-system";

type QuickRepliesProps = {
  colors: {
    cardAlt: string;
    inputBorder: string;
    textMuted: string;
    textPrimary: string;
  };
  disabled: boolean;
  onSelect: (reply: string) => void;
  replies: string[];
  title: string;
};

export function QuickReplies({ colors, disabled, onSelect, replies, title }: QuickRepliesProps) {
  if (replies.length === 0) {
    return null;
  }

  return (
    <View style={styles.quickRepliesSection}>
      <Text style={[styles.quickRepliesTitle, { color: colors.textMuted }]}>{title}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.quickRepliesRow}
        keyboardShouldPersistTaps="handled"
      >
        {replies.map((reply) => (
          <TouchableOpacity
            key={reply}
            style={[
              styles.quickReplyChip,
              { borderColor: colors.inputBorder, backgroundColor: colors.cardAlt },
            ]}
            onPress={() => onSelect(reply)}
            disabled={disabled}
            activeOpacity={0.7}
          >
            <Text style={[styles.quickReplyText, { color: colors.textPrimary }]}>{reply}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  quickRepliesSection: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  quickRepliesTitle: {
    ...TypeScale.labelSm,
    fontWeight: FontWeight.semibold,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: Spacing.xs,
  },
  quickRepliesRow: {
    paddingRight: Spacing.lg,
  },
  quickReplyChip: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginRight: Spacing.sm,
    borderWidth: 1,
  },
  quickReplyText: {
    ...TypeScale.bodySm,
    fontWeight: FontWeight.semibold,
  },
});
