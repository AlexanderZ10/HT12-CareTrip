import { MaterialIcons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Avatar } from "../../../components/Avatar";
import {
  FontWeight,
  Radius,
  Spacing,
  TypeScale,
  shadow,
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
  const isPrivate = group.accessType === "private";
  const avatarLabel = group.name || "Group";

  return (
    <TouchableOpacity
      activeOpacity={onPress ? 0.9 : 1}
      disabled={!onPress}
      onPress={onPress}
      style={styles.groupRow}
    >
      <Avatar imageUri={group.photoUrl} label={avatarLabel} size={58} />
      <View style={styles.groupRowTextWrap}>
        <View style={styles.groupRowTitleRow}>
          <Text numberOfLines={1} style={styles.groupRowTitle}>
            {group.name}
          </Text>
          <Text style={styles.groupRowTime}>{rightMeta}</Text>
        </View>

        <Text numberOfLines={1} style={styles.groupRowPreview}>
          {preview}
        </Text>

        <View style={styles.groupRowMetaRow}>
          <View style={[styles.groupTypeBadge, isPrivate && styles.groupTypeBadgePrivate]}>
            <MaterialIcons
              color={isPrivate ? "#FCD34D" : "#9FD7FF"}
              name={isPrivate ? "lock-outline" : "public"}
              size={14}
            />
            <Text style={[styles.groupTypeBadgeText, isPrivate && styles.groupTypeBadgeTextPrivate]}>
              {badge ?? (isPrivate ? "Private" : "Public")}
            </Text>
          </View>

          <Text style={styles.groupMembersText}>{group.memberCount} members</Text>
        </View>
      </View>

      {actionLabel && onActionPress ? (
        <TouchableOpacity
          activeOpacity={0.9}
          disabled={actionLoading}
          onPress={onActionPress}
          style={[
            styles.rowActionButton,
            actionVariant === "danger" && styles.rowActionButtonDanger,
          ]}
        >
          <Text style={styles.rowActionText}>
            {actionLoading ? "..." : actionLabel}
          </Text>
        </TouchableOpacity>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  groupRow: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E8E8E8",
    borderRadius: Radius["2xl"],
    borderWidth: 1,
    flexDirection: "row",
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    ...shadow("sm"),
  },
  groupRowTextWrap: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  groupRowTitleRow: {
    alignItems: "center",
    flexDirection: "row",
  },
  groupRowTitle: {
    ...TypeScale.titleLg,
    color: "#1A1A1A",
    flex: 1,
    fontWeight: FontWeight.extrabold,
    marginRight: Spacing.md,
  },
  groupRowTime: {
    ...TypeScale.bodySm,
    color: "#9CA3AF",
  },
  groupRowPreview: {
    ...TypeScale.bodyMd,
    color: "#6B7280",
    marginTop: Spacing.xs,
  },
  groupRowMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  groupTypeBadge: {
    alignItems: "center",
    backgroundColor: "#F0F0F0",
    borderRadius: Radius.full,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
  },
  groupTypeBadgePrivate: {
    backgroundColor: "#FFF7ED",
  },
  groupTypeBadgeText: {
    ...TypeScale.labelLg,
    color: "#2D6A4F",
    fontWeight: FontWeight.extrabold,
  },
  groupTypeBadgeTextPrivate: {
    color: "#92400E",
  },
  groupMembersText: {
    ...TypeScale.labelLg,
    color: "#6B7280",
    fontWeight: FontWeight.bold,
  },
  rowActionButton: {
    alignItems: "center",
    backgroundColor: "#2D6A4F",
    borderRadius: Radius.md,
    justifyContent: "center",
    marginLeft: Spacing.sm,
    minWidth: 66,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  rowActionButtonDanger: {
    backgroundColor: "#B84B3A",
  },
  rowActionText: {
    ...TypeScale.bodySm,
    color: "#FFFFFF",
    fontWeight: FontWeight.extrabold,
  },
});
