import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  FontWeight,
  IconSize,
  Layout,
  Radius,
  Spacing,
  TypeScale,
  shadow,
} from "../constants/design-system";
import {
  DOCUMENT_TYPES,
  getDaysUntilExpiry,
  isExpired,
  isExpiringSoon,
  type TravelDocument,
} from "../utils/travel-documents";
import { useAppTheme } from "./app-theme-provider";

type DocumentCardProps = {
  document: TravelDocument;
  onEdit?: () => void;
  onDelete?: () => void;
};

function maskDocumentNumber(value: string): string {
  if (value.length <= 4) {
    return value;
  }

  return "\u2022\u2022\u2022\u2022" + value.slice(-4);
}

function getDocumentMeta(typeKey: string) {
  return DOCUMENT_TYPES.find((dt) => dt.key === typeKey) ?? DOCUMENT_TYPES[6];
}

function formatExpiryDate(dateStr: string): string {
  if (!dateStr) {
    return "No expiry date";
  }

  const [year, month, day] = dateStr.split("-");

  if (!year || !month || !day) {
    return dateStr;
  }

  return `${day}/${month}/${year}`;
}

export function DocumentCard({ document, onEdit, onDelete }: DocumentCardProps) {
  const { colors } = useAppTheme();

  const meta = getDocumentMeta(document.type);
  const expired = document.expiryDate ? isExpired(document.expiryDate) : false;
  const expiringSoon = document.expiryDate
    ? isExpiringSoon(document.expiryDate)
    : false;
  const daysLeft = document.expiryDate
    ? getDaysUntilExpiry(document.expiryDate)
    : null;

  let expiryColor: string = colors.success;
  let expiryLabel = "";

  if (expired) {
    expiryColor = colors.error;
    expiryLabel = "Expired";
  } else if (expiringSoon) {
    expiryColor = colors.warning;
    expiryLabel =
      daysLeft !== null
        ? `Expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`
        : "";
  } else if (document.expiryDate) {
    expiryLabel =
      daysLeft !== null
        ? `Valid for ${daysLeft} day${daysLeft === 1 ? "" : "s"}`
        : "";
  }

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: expired
            ? colors.errorBorder
            : expiringSoon
              ? colors.warningBorder
              : colors.border,
          ...shadow("md"),
        },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.emoji}>{meta.emoji}</Text>
          <View style={styles.headerText}>
            <Text
              style={[styles.typeLabel, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              {meta.label}
            </Text>
            <Text
              style={[styles.label, { color: colors.textPrimary }]}
              numberOfLines={1}
            >
              {document.label || meta.label}
            </Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          {onEdit && (
            <Pressable
              onPress={onEdit}
              hitSlop={8}
              style={({ pressed }) => [
                styles.iconButton,
                { opacity: pressed ? 0.6 : 1 },
              ]}
              accessibilityLabel="Edit document"
              accessibilityRole="button"
            >
              <Ionicons
                name="pencil-outline"
                size={IconSize.sm}
                color={colors.textSecondary}
              />
            </Pressable>
          )}
          {onDelete && (
            <Pressable
              onPress={onDelete}
              hitSlop={8}
              style={({ pressed }) => [
                styles.iconButton,
                { opacity: pressed ? 0.6 : 1 },
              ]}
              accessibilityLabel="Delete document"
              accessibilityRole="button"
            >
              <Ionicons
                name="trash-outline"
                size={IconSize.sm}
                color={colors.destructive}
              />
            </Pressable>
          )}
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: colors.divider }]} />

      <View style={styles.detailsGrid}>
        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.textMuted }]}>
            Holder
          </Text>
          <Text
            style={[styles.detailValue, { color: colors.textPrimary }]}
            numberOfLines={1}
          >
            {document.holderName || "\u2014"}
          </Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.textMuted }]}>
            Number
          </Text>
          <Text
            style={[styles.detailValue, { color: colors.textPrimary }]}
            numberOfLines={1}
          >
            {document.documentNumber
              ? maskDocumentNumber(document.documentNumber)
              : "\u2014"}
          </Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.textMuted }]}>
            Country
          </Text>
          <Text
            style={[styles.detailValue, { color: colors.textPrimary }]}
            numberOfLines={1}
          >
            {document.issuingCountry || "\u2014"}
          </Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.textMuted }]}>
            Expires
          </Text>
          <View style={styles.expiryRow}>
            <Text
              style={[styles.detailValue, { color: expiryColor }]}
              numberOfLines={1}
            >
              {document.expiryDate
                ? formatExpiryDate(document.expiryDate)
                : "\u2014"}
            </Text>
          </View>
        </View>
      </View>

      {expiryLabel !== "" && (
        <View
          style={[
            styles.expiryBadge,
            {
              backgroundColor: expired
                ? colors.errorBackground
                : expiringSoon
                  ? colors.warningBackground
                  : colors.successBackground,
            },
          ]}
        >
          <Ionicons
            name={
              expired
                ? "alert-circle"
                : expiringSoon
                  ? "warning"
                  : "checkmark-circle"
            }
            size={IconSize.xs}
            color={expiryColor}
          />
          <Text style={[styles.expiryBadgeText, { color: expiryColor }]}>
            {expiryLabel}
          </Text>
        </View>
      )}

      {document.notes !== "" && (
        <Text
          style={[styles.notes, { color: colors.textMuted }]}
          numberOfLines={2}
        >
          {document.notes}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Layout.cardPadding,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: Spacing.sm,
  },
  emoji: {
    fontSize: 28,
    marginRight: Spacing.md,
  },
  headerText: {
    flex: 1,
  },
  typeLabel: {
    fontSize: TypeScale.labelMd.fontSize,
    lineHeight: TypeScale.labelMd.lineHeight,
    fontWeight: TypeScale.labelMd.fontWeight,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  label: {
    fontSize: TypeScale.titleMd.fontSize,
    lineHeight: TypeScale.titleMd.lineHeight,
    fontWeight: TypeScale.titleMd.fontWeight,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  iconButton: {
    width: Layout.touchTarget,
    height: Layout.touchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  divider: {
    height: 1,
    marginVertical: Spacing.md,
  },
  detailsGrid: {
    gap: Spacing.sm,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  detailLabel: {
    fontSize: TypeScale.bodySm.fontSize,
    lineHeight: TypeScale.bodySm.lineHeight,
    fontWeight: FontWeight.medium,
    width: 70,
  },
  detailValue: {
    flex: 1,
    fontSize: TypeScale.bodyMd.fontSize,
    lineHeight: TypeScale.bodyMd.lineHeight,
    fontWeight: FontWeight.medium,
    textAlign: "right",
  },
  expiryRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  expiryBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.sm,
    marginTop: Spacing.md,
    gap: Spacing.xs,
  },
  expiryBadgeText: {
    fontSize: TypeScale.labelMd.fontSize,
    lineHeight: TypeScale.labelMd.lineHeight,
    fontWeight: TypeScale.labelMd.fontWeight,
  },
  notes: {
    fontSize: TypeScale.bodySm.fontSize,
    lineHeight: TypeScale.bodySm.lineHeight,
    fontStyle: "italic",
    marginTop: Spacing.sm,
  },
});
