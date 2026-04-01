import { MaterialIcons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { useAppLanguage } from "../../../components/app-language-provider";
import { useAppTheme } from "../../../components/app-theme-provider";
import {
  FontWeight,
  Radius,
  Spacing,
  TypeScale,
} from "../../../constants/design-system";
import { type GroupChatExpense, type GroupChatMessage } from "../../../utils/group-chat";
import { formatExpenseRepaymentAmount, type GroupExpenseRepayment } from "../../../utils/group-expense-repayments";
import { formatExpenseAmount, getExpensePerPerson } from "../helpers";

interface ExpenseCardProps {
  expense: GroupChatExpense;
  expenseRemainingCollection: number;
  isMember: boolean;
  isMine: boolean;
  message: GroupChatMessage;
  myOutstandingAmount: number;
  myRepayment: GroupExpenseRepayment | null;
  onOpenPlannerTicket: (bookingUrl: string) => void;
  onPayExpense: (message: GroupChatMessage) => void;
  processingRepaymentExpenseId: string | null;
  settledShareCount: number;
  userId: string | undefined;
}

export function ExpenseCard({
  expense,
  expenseRemainingCollection,
  isMember,
  isMine,
  message,
  myOutstandingAmount,
  myRepayment,
  onOpenPlannerTicket,
  onPayExpense,
  processingRepaymentExpenseId,
  settledShareCount,
  userId,
}: ExpenseCardProps) {
  const { t } = useAppLanguage();
  const { colors } = useAppTheme();
  const isGroupPaymentExpense = expense.collectionMode === "group-payment";

  return (
    <View
      style={[
        styles.expenseCard,
        {
          backgroundColor: isMine ? colors.accentMuted : colors.card,
          borderColor: colors.border,
        },
      ]}
    >
      <View style={styles.expenseCardTopRow}>
        <Text style={[styles.expenseCardKicker, { color: colors.textSecondary }]}>
          {t("groupDetail.expenseSplit")}
        </Text>
        <Text style={[styles.expenseCardAmount, { color: colors.textPrimary }]}>
          {expense.amountLabel}
        </Text>
      </View>
      <Text style={[styles.expenseCardTitle, { color: colors.textPrimary }]}>
        {expense.title}
      </Text>
      <Text
        style={[
          styles.expenseCardMeta,
          { color: colors.textSecondary },
        ]}
      >
        {isGroupPaymentExpense
          ? `Created by ${expense.paidByLabel}`
          : `Paid by ${expense.paidByLabel}`}
      </Text>
      <View style={styles.expenseCardChipsRow}>
        <View
          style={[
            styles.expenseCardChip,
            {
              backgroundColor: isMine ? colors.accentMuted : colors.cardAlt,
            },
          ]}
        >
          <Text
            style={[
              styles.expenseCardChipText,
              { color: colors.textSecondary },
            ]}
          >
            Split with {expense.participantCount} people
          </Text>
        </View>
        <View
          style={[
            styles.expenseCardChip,
            {
              backgroundColor: isMine ? colors.accentMuted : colors.cardAlt,
            },
          ]}
        >
          <Text
            style={[
              styles.expenseCardChipText,
              { color: colors.textSecondary },
            ]}
          >
            {formatExpenseAmount(getExpensePerPerson(expense))} {t("common.each")}
          </Text>
        </View>
        <View
          style={[
            styles.expenseCardChip,
            {
              backgroundColor: isMine ? colors.accentMuted : colors.cardAlt,
            },
          ]}
        >
          <Text
            style={[
              styles.expenseCardChipText,
              { color: colors.textSecondary },
            ]}
          >
            {`${settledShareCount}/${expense.participantCount} shares covered`}
          </Text>
        </View>
      </View>
      {expense.paidById === userId ? (
        <View style={styles.expenseRepaymentStatusRow}>
          <Text
            style={[
              styles.expenseRepaymentStatusText,
              { color: colors.textSecondary },
            ]}
          >
            {isGroupPaymentExpense
              ? expenseRemainingCollection > 0
                ? `${settledShareCount}/${expense.participantCount} shares paid in-app. ${formatExpenseRepaymentAmount(
                    expenseRemainingCollection
                  )} still waiting.`
                : "Everyone paid their equal share in-app"
              : expenseRemainingCollection > 0
                ? `Your share is included. Still waiting for ${formatExpenseRepaymentAmount(
                    expenseRemainingCollection
                  )} from the others.`
                : "Everyone settled this expense"}
          </Text>
        </View>
      ) : null}
      {expense.linkedBookingUrl ? (
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => {
            onOpenPlannerTicket(expense.linkedBookingUrl as string);
          }}
          style={[
            styles.linkedExpenseOpenButton,
            {
              backgroundColor: isMine ? colors.accentMuted : colors.cardAlt,
            },
          ]}
        >
          <MaterialIcons color={colors.textSecondary} name="confirmation-number" size={16} />
          <Text style={[styles.linkedExpenseOpenButtonText, { color: colors.textSecondary }]}>
            {t("groupDetail.openPlannerTicket")}
          </Text>
        </TouchableOpacity>
      ) : null}
      {((isGroupPaymentExpense && myOutstandingAmount > 0) ||
        (!isGroupPaymentExpense &&
          expense.paidById !== userId &&
          myOutstandingAmount > 0)) ? (
        <TouchableOpacity
          activeOpacity={0.92}
          disabled={processingRepaymentExpenseId === message.id || !isMember}
          onPress={() => {
            onPayExpense(message);
          }}
          style={[
            styles.expensePayButton,
            { backgroundColor: colors.accent },
            processingRepaymentExpenseId === message.id &&
              styles.expensePayButtonDisabled,
          ]}
        >
          <MaterialIcons color={colors.buttonTextOnAction} name="lock" size={16} />
          <Text style={[styles.expensePayButtonText, { color: colors.buttonTextOnAction }]}>
            {processingRepaymentExpenseId === message.id
              ? t("groupDetail.openingStripe")
              : isGroupPaymentExpense
                ? `Pay your ${formatExpenseRepaymentAmount(
                    myOutstandingAmount
                  )} share with Stripe`
                : `Pay ${formatExpenseRepaymentAmount(myOutstandingAmount)} with Stripe`}
          </Text>
        </TouchableOpacity>
      ) : null}
      {((isGroupPaymentExpense && !!myRepayment) ||
        (!isGroupPaymentExpense && expense.paidById !== userId && myRepayment)) ? (
        <View
          style={[
            styles.expensePaidBadge,
            {
              backgroundColor: isMine ? colors.accentMuted : colors.cardAlt,
            },
          ]}
        >
          <MaterialIcons color={colors.accent} name="verified" size={15} />
          <Text style={[styles.expensePaidBadgeText, { color: colors.accent }]}>
            {isGroupPaymentExpense
              ? `Your share was paid via Stripe • ${myRepayment!.amountLabel}`
              : `Paid via Stripe • ${myRepayment!.amountLabel}`}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  expenseCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginTop: 2,
    padding: Spacing.md,
  },
  expenseCardTopRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  expenseCardKicker: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
    textTransform: "uppercase",
  },
  expenseCardAmount: {
    ...TypeScale.titleMd,
    fontWeight: FontWeight.extrabold,
  },
  expenseCardTitle: {
    ...TypeScale.titleLg,
    fontWeight: FontWeight.extrabold,
    marginTop: Spacing.sm,
  },
  expenseCardMeta: {
    ...TypeScale.bodyMd,
    marginTop: Spacing.xs,
  },
  expenseCardChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  expenseCardChip: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  expenseCardChipText: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.bold,
  },
  expenseRepaymentStatusRow: {
    marginTop: Spacing.md,
  },
  expenseRepaymentStatusText: {
    ...TypeScale.bodySm,
    fontWeight: FontWeight.bold,
  },
  linkedExpenseOpenButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: Radius.md,
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  linkedExpenseOpenButtonText: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
  },
  expensePayButton: {
    alignItems: "center",
    borderRadius: Radius.lg,
    flexDirection: "row",
    gap: Spacing.sm,
    justifyContent: "center",
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  expensePayButtonDisabled: {
    opacity: 0.6,
  },
  expensePayButtonText: {
    ...TypeScale.bodySm,
    fontWeight: FontWeight.extrabold,
  },
  expensePaidBadge: {
    alignItems: "center",
    borderRadius: Radius.md,
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  expensePaidBadgeText: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
  },
});
