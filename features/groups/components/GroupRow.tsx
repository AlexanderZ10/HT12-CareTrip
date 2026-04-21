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
import type { TravelGroup } from "../../../utils/groups";

type GroupRowProps = {
  actionLabel?: string;
  actionLoading?: boolean;
  actionVariant?: "primary" | "danger";
  badge?: string;
  group: TravelGroup;
  onActionPress?: () => void;
  onPress?: () => void;
  preview: string;
  rightMeta: string;
};

export function GroupRow({
  actionLabel,
  actionLoading = false,
  actionVariant = "primary",
  badge,
  group,
  onActionPress,
  onPress,
  preview,
  rightMeta,
}: GroupRowProps) {
  const { colors } = useAppTheme();
  const isPrivate = group.accessType === "private";
  const avatarLabel = group.name || "Group";

  return (
    <TouchableOpacity
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress}
      onPress={onPress}
      style={styles.row}
    >
      <View style={styles.avatarWrap}>
        <Avatar photoUrl={group.photoUrl} label={avatarLabel} size={56} />
        {isPrivate ? (
          <View style={[styles.lockBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <MaterialIcons name="lock" size={11} color={colors.textSecondary} />
          </View>
        ) : null}
      </View>

      <View style={styles.textWrap}>
        <View style={styles.titleRow}>
          <Text numberOfLines={1} style={[styles.title, { color: colors.textPrimary }]}>
            {group.name}
          </Text>
          {badge ? (
            <Text style={[styles.dot, { color: colors.textMuted }]}> · </Text>
          ) : null}
          {badge ? (
            <Text numberOfLines={1} style={[styles.badgeInline, { color: colors.textMuted }]}>
              {badge}
            </Text>
          ) : null}
        </View>

        <View style={styles.previewRow}>
          <Text numberOfLines={1} style={[styles.preview, { color: colors.textSecondary }]}>
            {preview}
          </Text>
          <Text style={[styles.metaDot, { color: colors.textMuted }]}> · </Text>
          <Text style={[styles.timeMeta, { color: colors.textMuted }]}>{rightMeta}</Text>
        </View>
      </View>

      {actionLabel && onActionPress ? (
        <TouchableOpacity
          activeOpacity={0.8}
          disabled={actionLoading}
          onPress={onActionPress}
          style={[
            styles.actionPill,
            {
              backgroundColor:
                actionVariant === "danger"
                  ? "transparent"
                  : colors.accent,
              borderWidth: actionVariant === "danger" ? 1 : 0,
              borderColor: colors.border,
            },
          ]}
        >
          <Text
            style={[
              styles.actionText,
              {
                color:
                  actionVariant === "danger"
                    ? colors.errorText
                    : colors.buttonTextOnAction,
              },
            ]}
          >
            {actionLoading ? "..." : actionLabel}
          </Text>
        </TouchableOpacity>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    flexDirection: "row",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  avatarWrap: {
    position: "relative",
  },
  lockBadge: {
    alignItems: "center",
    borderRadius: Radius.full,
    borderWidth: 1.5,
    bottom: -2,
    height: 20,
    justifyContent: "center",
    position: "absolute",
    right: -2,
    width: 20,
  },
  textWrap: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  titleRow: {
    alignItems: "center",
    flexDirection: "row",
  },
  title: {
    ...TypeScale.bodyMd,
    flexShrink: 1,
    fontWeight: FontWeight.bold,
  },
  dot: {
    ...TypeScale.bodyMd,
  },
  badgeInline: {
    ...TypeScale.bodySm,
  },
  previewRow: {
    alignItems: "center",
    flexDirection: "row",
    marginTop: 3,
  },
  preview: {
    ...TypeScale.bodySm,
    flexShrink: 1,
  },
  metaDot: {
    ...TypeScale.bodySm,
  },
  timeMeta: {
    ...TypeScale.bodySm,
  },
  actionPill: {
    borderRadius: Radius.lg,
    marginLeft: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  actionText: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.bold,
  },
});
