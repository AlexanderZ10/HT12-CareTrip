import React from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  FontWeight,
  Radius,
  Spacing,
  TypeScale,
  shadow,
} from "../constants/design-system";
import {
  BUDGET_CATEGORIES,
  type BudgetCategory,
  type BudgetSummary,
} from "../utils/budget-tracker";
import { useAppTheme } from "./app-theme-provider";

type BudgetSummaryCardProps = {
  summary: BudgetSummary;
  budgetLimit?: number;
};

const CATEGORY_COLORS: Record<BudgetCategory, string> = {
  transport: "#2D6A4F",
  accommodation: "#1B4332",
  food: "#F59E0B",
  activities: "#3B82F6",
  shopping: "#8B5CF6",
  other: "#6B7280",
};

function formatAmount(value: number, currency: string): string {
  return `${currency} ${value.toFixed(2)}`;
}

export function BudgetSummaryCard({
  summary,
  budgetLimit,
}: BudgetSummaryCardProps) {
  const { colors } = useAppTheme();

  const remaining =
    budgetLimit !== undefined ? budgetLimit - summary.totalSpent : undefined;
  const progressRatio =
    budgetLimit !== undefined && budgetLimit > 0
      ? Math.min(summary.totalSpent / budgetLimit, 1)
      : undefined;
  const isOverBudget = remaining !== undefined && remaining < 0;

  const maxCategoryAmount = Math.max(
    ...Object.values(summary.byCategory),
    1
  );

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          ...shadow("md"),
        },
      ]}
    >
      <Text
        style={[
          styles.sectionLabel,
          { color: colors.textSecondary },
        ]}
      >
        Total Spent
      </Text>
      <Text style={[styles.totalAmount, { color: colors.textPrimary }]}>
        {formatAmount(summary.totalSpent, summary.currency)}
      </Text>

      {budgetLimit !== undefined && remaining !== undefined && (
        <View style={styles.budgetLimitSection}>
          <View style={styles.remainingRow}>
            <Text
              style={[
                styles.remainingLabel,
                { color: colors.textSecondary },
              ]}
            >
              {isOverBudget ? "Over budget by" : "Remaining"}
            </Text>
            <Text
              style={[
                styles.remainingValue,
                {
                  color: isOverBudget
                    ? colors.error
                    : colors.success,
                },
              ]}
            >
              {formatAmount(Math.abs(remaining), summary.currency)}
            </Text>
          </View>
          <View
            style={[
              styles.progressTrack,
              { backgroundColor: colors.divider },
            ]}
          >
            <View
              style={[
                styles.progressFill,
                {
                  backgroundColor: isOverBudget
                    ? colors.error
                    : colors.accent,
                  width: `${(progressRatio ?? 0) * 100}%`,
                },
              ]}
            />
          </View>
          <Text style={[styles.budgetLabel, { color: colors.textMuted }]}>
            Budget: {formatAmount(budgetLimit, summary.currency)}
          </Text>
        </View>
      )}

      <View style={[styles.divider, { backgroundColor: colors.divider }]} />

      <Text
        style={[
          styles.sectionLabel,
          { color: colors.textSecondary },
        ]}
      >
        By Category
      </Text>

      {BUDGET_CATEGORIES.map(({ key, emoji }) => {
        const amount = summary.byCategory[key];

        if (amount <= 0) {
          return null;
        }

        const barRatio = amount / maxCategoryAmount;
        const barColor = CATEGORY_COLORS[key];

        return (
          <View key={key} style={styles.categoryRow}>
            <View style={styles.categoryHeader}>
              <Text style={styles.categoryEmoji}>{emoji}</Text>
              <Text
                style={[
                  styles.categoryName,
                  { color: colors.textPrimary },
                ]}
              >
                {key.charAt(0).toUpperCase() + key.slice(1)}
              </Text>
              <Text
                style={[
                  styles.categoryAmount,
                  { color: colors.textSecondary },
                ]}
              >
                {formatAmount(amount, summary.currency)}
              </Text>
            </View>
            <View
              style={[
                styles.categoryBarTrack,
                { backgroundColor: colors.divider },
              ]}
            >
              <View
                style={[
                  styles.categoryBarFill,
                  {
                    backgroundColor: barColor,
                    width: `${barRatio * 100}%`,
                  },
                ]}
              />
            </View>
          </View>
        );
      })}

      {summary.entryCount === 0 && (
        <Text style={[styles.emptyText, { color: colors.textMuted }]}>
          No expenses recorded yet.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
  },
  sectionLabel: {
    fontSize: TypeScale.labelLg.fontSize,
    lineHeight: TypeScale.labelLg.lineHeight,
    fontWeight: TypeScale.labelLg.fontWeight,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: Spacing.xs,
  },
  totalAmount: {
    fontSize: TypeScale.displayMd.fontSize,
    lineHeight: TypeScale.displayMd.lineHeight,
    fontWeight: TypeScale.displayMd.fontWeight,
    marginBottom: Spacing.sm,
  },
  budgetLimitSection: {
    marginBottom: Spacing.sm,
  },
  remainingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  remainingLabel: {
    fontSize: TypeScale.bodyMd.fontSize,
    lineHeight: TypeScale.bodyMd.lineHeight,
    fontWeight: FontWeight.medium,
  },
  remainingValue: {
    fontSize: TypeScale.titleMd.fontSize,
    lineHeight: TypeScale.titleMd.lineHeight,
    fontWeight: TypeScale.titleMd.fontWeight,
  },
  progressTrack: {
    height: 8,
    borderRadius: Radius.full,
    overflow: "hidden",
    marginBottom: Spacing.xs,
  },
  progressFill: {
    height: "100%",
    borderRadius: Radius.full,
  },
  budgetLabel: {
    fontSize: TypeScale.labelMd.fontSize,
    lineHeight: TypeScale.labelMd.lineHeight,
    fontWeight: TypeScale.labelMd.fontWeight,
  },
  divider: {
    height: 1,
    marginVertical: Spacing.md,
  },
  categoryRow: {
    marginBottom: Spacing.md,
  },
  categoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  categoryEmoji: {
    fontSize: 16,
    marginRight: Spacing.sm,
  },
  categoryName: {
    flex: 1,
    fontSize: TypeScale.bodyMd.fontSize,
    lineHeight: TypeScale.bodyMd.lineHeight,
    fontWeight: FontWeight.medium,
  },
  categoryAmount: {
    fontSize: TypeScale.bodyMd.fontSize,
    lineHeight: TypeScale.bodyMd.lineHeight,
    fontWeight: FontWeight.semibold,
  },
  categoryBarTrack: {
    height: 6,
    borderRadius: Radius.full,
    overflow: "hidden",
  },
  categoryBarFill: {
    height: "100%",
    borderRadius: Radius.full,
  },
  emptyText: {
    fontSize: TypeScale.bodyMd.fontSize,
    lineHeight: TypeScale.bodyMd.lineHeight,
    textAlign: "center",
    paddingVertical: Spacing.lg,
  },
});
