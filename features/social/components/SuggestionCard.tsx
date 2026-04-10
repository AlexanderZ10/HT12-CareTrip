import { MaterialIcons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Avatar } from "../../../components/Avatar";
import { useAppTheme } from "../../../components/app-theme-provider";
import {
  FontWeight,
  Radius,
  Spacing,
  TypeScale,
} from "../../../constants/design-system";

type SuggestionCardProps = {
  actionDisabled?: boolean;
  actionLabel?: string;
  followsYouLabel?: string;
  handle: string;
  label: string;
  loading?: boolean;
  onActionPress?: () => void;
  onDismiss?: () => void;
  photoUrl?: string;
};

export function SuggestionCard({
  actionDisabled = false,
  actionLabel = "Follow",
  followsYouLabel,
  handle,
  label,
  loading = false,
  onActionPress,
  onDismiss,
  photoUrl,
}: SuggestionCardProps) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {onDismiss ? (
        <TouchableOpacity activeOpacity={0.7} onPress={onDismiss} style={styles.dismissButton}>
          <MaterialIcons name="close" size={16} color={colors.textSecondary} />
        </TouchableOpacity>
      ) : null}

      <Avatar label={label} photoUrl={photoUrl} size={64} />

      <Text numberOfLines={1} style={[styles.handle, { color: colors.textPrimary }]}>
        {handle}
      </Text>

      {followsYouLabel ? (
        <Text numberOfLines={1} style={[styles.subLabel, { color: colors.textSecondary }]}>
          {followsYouLabel}
        </Text>
      ) : (
        <Text numberOfLines={1} style={[styles.subLabel, { color: colors.textSecondary }]}>
          Suggested for you
        </Text>
      )}

      <TouchableOpacity
        activeOpacity={0.85}
        disabled={actionDisabled || loading}
        onPress={onActionPress}
        style={[
          styles.followButton,
          {
            backgroundColor:
              actionDisabled || loading ? colors.disabledBackground : colors.accent,
          },
        ]}
      >
        <Text
          style={[
            styles.followButtonText,
            {
              color:
                actionDisabled || loading
                  ? colors.disabledText
                  : colors.buttonTextOnAction,
            },
          ]}
        >
          {loading ? "..." : actionLabel}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingBottom: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.md,
    position: "relative",
    width: 124,
  },
  dismissButton: {
    padding: 4,
    position: "absolute",
    right: 4,
    top: 4,
    zIndex: 1,
  },
  handle: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.bold,
    marginTop: Spacing.sm,
    maxWidth: 108,
    textAlign: "center",
  },
  subLabel: {
    ...TypeScale.labelSm,
    marginTop: 1,
    maxWidth: 108,
    textAlign: "center",
  },
  followButton: {
    alignItems: "center",
    borderRadius: Radius.md,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    width: "100%",
  },
  followButtonText: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.bold,
  },
});
