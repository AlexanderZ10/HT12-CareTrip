import { MaterialIcons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

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
  const isGroupPaymentExpense = expense.collectionMode === "group-payment";

  return (
    <View
      style={[
        styles.expenseCard,
        isMine ? styles.myExpenseCard : styles.theirExpenseCard,
      ]}
    >
      <View style={styles.expenseCardTopRow}>
        <Text style={[styles.expenseCardKicker, isMine && styles.myExpenseCardKicker]}>
          Expense split
        </Text>
        <Text style={[styles.expenseCardAmount, isMine && styles.myExpenseCardAmount]}>
          {expense.amountLabel}
        </Text>
      </View>
      <Text style={[styles.expenseCardTitle, isMine && styles.myExpenseCardTitle]}>
        {expense.title}
      </Text>
      <Text
        style={[
          styles.expenseCardMeta,
          isMine && styles.myExpenseCardMeta,
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
            isMine ? styles.myExpenseCardChip : styles.theirExpenseCardChip,
          ]}
        >
          <Text
            style={[
              styles.expenseCardChipText,
              isMine && styles.myExpenseCardChipText,
            ]}
          >
            Split with {expense.participantCount} people
          </Text>
        </View>
        <View
          style={[
            styles.expenseCardChip,
            isMine ? styles.myExpenseCardChip : styles.theirExpenseCardChip,
          ]}
        >
          <Text
            style={[
              styles.expenseCardChipText,
              isMine && styles.myExpenseCardChipText,
            ]}
          >
            {formatExpenseAmount(getExpensePerPerson(expense))} each
          </Text>
        </View>
        <View
          style={[
            styles.expenseCardChip,
            isMine ? styles.myExpenseCardChip : styles.theirExpenseCardChip,
          ]}
        >
          <Text
            style={[
              styles.expenseCardChipText,
              isMine && styles.myExpenseCardChipText,
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
              isMine && styles.myExpenseRepaymentStatusText,
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
            isMine ? styles.myLinkedExpenseOpenButton : styles.theirLinkedExpenseOpenButton,
          ]}
        >
          <MaterialIcons color="#6B7280" name="confirmation-number" size={16} />
          <Text style={styles.linkedExpenseOpenButtonText}>
            Open planner ticket link
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
            processingRepaymentExpenseId === message.id &&
              styles.expensePayButtonDisabled,
          ]}
        >
          <MaterialIcons color="#FFFFFF" name="lock" size={16} />
          <Text style={styles.expensePayButtonText}>
            {processingRepaymentExpenseId === message.id
              ? "Opening Stripe..."
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
            isMine ? styles.myExpensePaidBadge : styles.theirExpensePaidBadge,
          ]}
        >
          <MaterialIcons color="#2D6A4F" name="verified" size={15} />
          <Text style={styles.expensePaidBadgeText}>
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
  myExpenseCard: {
    backgroundColor: "#F7FAF1",
    borderColor: "#E8E8E8",
  },
  theirExpenseCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E8E8E8",
  },
  expenseCardTopRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  expenseCardKicker: {
    color: "#6B7280",
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
    textTransform: "uppercase",
  },
  myExpenseCardKicker: {
    color: "#6B7280",
  },
  expenseCardAmount: {
    color: "#1A1A1A",
    ...TypeScale.titleMd,
    fontWeight: FontWeight.extrabold,
  },
  myExpenseCardAmount: {
    color: "#1A1A1A",
  },
  expenseCardTitle: {
    color: "#1A1A1A",
    ...TypeScale.titleLg,
    fontWeight: FontWeight.extrabold,
    marginTop: Spacing.sm,
  },
  myExpenseCardTitle: {
    color: "#1A1A1A",
  },
  expenseCardMeta: {
    color: "#5A6E41",
    ...TypeScale.bodyMd,
    marginTop: Spacing.xs,
  },
  myExpenseCardMeta: {
    color: "#5A6E41",
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
  myExpenseCardChip: {
    backgroundColor: "#E6F1DA",
  },
  theirExpenseCardChip: {
    backgroundColor: "#F5F5F5",
  },
  expenseCardChipText: {
    color: "#6B7280",
    ...TypeScale.labelLg,
    fontWeight: FontWeight.bold,
  },
  myExpenseCardChipText: {
    color: "#6B7280",
  },
  expenseRepaymentStatusRow: {
    marginTop: Spacing.md,
  },
  expenseRepaymentStatusText: {
    color: "#5A6E41",
    ...TypeScale.bodySm,
    fontWeight: FontWeight.bold,
  },
  myExpenseRepaymentStatusText: {
    color: "#5A6E41",
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
  myLinkedExpenseOpenButton: {
    backgroundColor: "#E6F1DA",
  },
  theirLinkedExpenseOpenButton: {
    backgroundColor: "#F5F5F5",
  },
  linkedExpenseOpenButtonText: {
    color: "#6B7280",
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
  },
  expensePayButton: {
    alignItems: "center",
    backgroundColor: "#2D6A4F",
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
    color: "#FFFFFF",
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
  myExpensePaidBadge: {
    backgroundColor: "#E6F1DA",
  },
  theirExpensePaidBadge: {
    backgroundColor: "#F5F5F5",
  },
  expensePaidBadgeText: {
    color: "#2D6A4F",
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
  },
});
