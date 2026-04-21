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

type FriendProfileCardProps = {
  aboutMe?: string;
  actionDisabled?: boolean;
  actionLabel?: string;
  badge?: string;
  fullWidth?: boolean;
  homeBase?: string;
  label: string;
  loading?: boolean;
  onActionPress?: () => void;
  onSecondaryActionPress?: () => void;
  photoUrl?: string;
  secondaryActionDisabled?: boolean;
  secondaryActionLabel?: string;
  username?: string;
};

export function FriendProfileCard({
  aboutMe: _aboutMe,
  actionDisabled = false,
  actionLabel,
  badge: _badge,
  fullWidth = false,
  homeBase,
  label,
  loading = false,
  onActionPress,
  onSecondaryActionPress,
  photoUrl,
  secondaryActionDisabled = false,
  secondaryActionLabel,
  username,
}: FriendProfileCardProps) {
  const { colors } = useAppTheme();

  const handle = username ? `@${username}` : label.toLowerCase().replace(/\s+/g, "_");
  const subtitle = homeBase || label;

  return (
    <View style={[styles.row, fullWidth && styles.rowFullWidth]}>
      <Avatar label={label} photoUrl={photoUrl} size={48} />

      <View style={styles.textWrap}>
        <Text numberOfLines={1} style={[styles.handle, { color: colors.textPrimary }]}>
          {handle}
        </Text>
        <Text numberOfLines={1} style={[styles.subtitle, { color: colors.textSecondary }]}>
          {subtitle}
        </Text>
      </View>

      <View style={styles.actionsWrap}>
        {actionLabel && onActionPress ? (
          <TouchableOpacity
            activeOpacity={0.8}
            disabled={actionDisabled || loading}
            onPress={onActionPress}
            style={[
              styles.primaryButton,
              {
                backgroundColor:
                  actionDisabled || loading ? colors.disabledBackground : colors.accent,
              },
            ]}
          >
            <Text
              style={[
                styles.primaryButtonText,
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
        ) : null}

        {secondaryActionLabel && onSecondaryActionPress ? (
          <TouchableOpacity
            activeOpacity={0.8}
            disabled={secondaryActionDisabled || loading}
            onPress={onSecondaryActionPress}
            style={[
              styles.secondaryButton,
              { borderColor: colors.border, opacity: secondaryActionDisabled || loading ? 0.5 : 1 },
            ]}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.textPrimary }]}>
              {secondaryActionLabel}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    flexDirection: "row",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.md,
    width: 300,
  },
  rowFullWidth: {
    width: "100%",
  },
  textWrap: {
    flex: 1,
    marginLeft: Spacing.md,
    minWidth: 0,
  },
  handle: {
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.bold,
  },
  subtitle: {
    ...TypeScale.bodySm,
    marginTop: 2,
  },
  actionsWrap: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.sm,
    flexShrink: 0,
    marginLeft: Spacing.sm,
  },
  primaryButton: {
    alignItems: "center",
    borderRadius: Radius.lg,
    minWidth: 84,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  primaryButtonText: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.bold,
  },
  secondaryButton: {
    alignItems: "center",
    borderRadius: Radius.lg,
    borderWidth: 1,
    minWidth: 84,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 7,
  },
  secondaryButtonText: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.bold,
  },
});
