import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";

import {
  FontWeight,
  Radius,
  Spacing,
  TypeScale,
} from "../../../constants/design-system";
import {
  type GroupChatExpense,
  type GroupChatLinkedTransport,
  type GroupChatMessage as GroupChatMessageType,
  type GroupChatSharedTrip,
} from "../../../utils/group-chat";
import { type GroupExpenseRepayment } from "../../../utils/group-expense-repayments";
import { formatMessageTime, getAvatarColor, getInitials } from "../helpers";
import { ExpenseCard } from "./ExpenseCard";
import { SharedTripCard } from "./SharedTripCard";

interface GroupChatMessageProps {
  creatingLinkedExpenseKey: string | null;
  expenseRemainingCollection: number;
  group: { memberCount: number } | null;
  isMember: boolean;
  isMine: boolean;
  linkedExpenseMessagesByKey: Record<string, GroupChatMessageType>;
  message: GroupChatMessageType;
  myOutstandingAmount: number;
  myRepayment: GroupExpenseRepayment | null;
  onCreateLinkedTransportExpense: (
    message: GroupChatMessageType,
    linkedTransport: GroupChatLinkedTransport
  ) => void;
  onOpenPlannerTicket: (bookingUrl: string) => void;
  onPayExpense: (message: GroupChatMessageType) => void;
  onPreviewTrip: (sharedTrip: GroupChatSharedTrip) => void;
  processingRepaymentExpenseId: string | null;
  settledShareCount: number;
  userId: string | undefined;
}

export function GroupChatMessageRow({
  creatingLinkedExpenseKey,
  expenseRemainingCollection,
  group,
  isMember,
  isMine,
  linkedExpenseMessagesByKey,
  message,
  myOutstandingAmount,
  myRepayment,
  onCreateLinkedTransportExpense,
  onOpenPlannerTicket,
  onPayExpense,
  onPreviewTrip,
  processingRepaymentExpenseId,
  settledShareCount,
  userId,
}: GroupChatMessageProps) {
  const hasSharedTrip = message.messageType === "shared-trip" && !!message.sharedTrip;
  const hasExpense = message.messageType === "expense" && !!message.expense;
  const expense = hasExpense ? (message.expense as GroupChatExpense) : null;
  const senderName = isMine ? "You" : message.senderLabel;

  return (
    <View
      style={[styles.messageRow, isMine ? styles.myMessageRow : styles.theirMessageRow]}
    >
      {!isMine ? (
        <View style={styles.messageAvatarWrap}>
          {message.senderAvatarUrl ? (
            <Image
              source={{ uri: message.senderAvatarUrl }}
              style={styles.messageAvatarImage}
              contentFit="cover"
            />
          ) : (
            <View
              style={[
                styles.messageAvatarFallback,
                { backgroundColor: getAvatarColor(senderName) },
              ]}
            >
              <Text style={styles.messageAvatarFallbackText}>
                {getInitials(senderName)}
              </Text>
            </View>
          )}
        </View>
      ) : null}

      <View
        style={[
          styles.messageBubble,
          isMine ? styles.myMessageBubble : styles.theirMessageBubble,
        ]}
      >
        <Text
          style={[
            styles.messageSender,
            isMine ? styles.myMessageSender : styles.theirMessageSender,
          ]}
        >
          {senderName}
        </Text>
        {hasSharedTrip ? (
          <SharedTripCard
            creatingLinkedExpenseKey={creatingLinkedExpenseKey}
            group={group}
            isMine={isMine}
            linkedExpenseMessagesByKey={linkedExpenseMessagesByKey}
            message={message}
            onCreateLinkedTransportExpense={onCreateLinkedTransportExpense}
            onOpenPlannerTicket={onOpenPlannerTicket}
            onPreviewTrip={onPreviewTrip}
          />
        ) : hasExpense && expense ? (
          <ExpenseCard
            expense={expense}
            expenseRemainingCollection={expenseRemainingCollection}
            isMember={isMember}
            isMine={isMine}
            message={message}
            myOutstandingAmount={myOutstandingAmount}
            myRepayment={myRepayment}
            onOpenPlannerTicket={onOpenPlannerTicket}
            onPayExpense={onPayExpense}
            processingRepaymentExpenseId={processingRepaymentExpenseId}
            settledShareCount={settledShareCount}
            userId={userId}
          />
        ) : (
          <Text style={[styles.messageText, isMine && styles.myMessageText]}>
            {message.text}
          </Text>
        )}
        <Text style={[styles.messageTime, isMine && styles.myMessageTime]}>
          {formatMessageTime(message.createdAtMs)}
        </Text>
      </View>

      {isMine ? (
        <View style={styles.messageAvatarWrap}>
          {message.senderAvatarUrl ? (
            <Image
              source={{ uri: message.senderAvatarUrl }}
              style={styles.messageAvatarImage}
              contentFit="cover"
            />
          ) : (
            <View
              style={[
                styles.messageAvatarFallback,
                { backgroundColor: getAvatarColor(senderName) },
              ]}
            >
              <Text style={styles.messageAvatarFallbackText}>
                {getInitials(senderName)}
              </Text>
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  messageRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  theirMessageRow: {
    justifyContent: "flex-start",
  },
  myMessageRow: {
    justifyContent: "flex-end",
  },
  messageAvatarWrap: {
    width: 34,
    height: 34,
    borderRadius: Radius.full,
    overflow: "hidden",
  },
  messageAvatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: Radius.full,
    backgroundColor: "#E8E8E8",
  },
  messageAvatarFallback: {
    alignItems: "center",
    borderRadius: Radius.full,
    height: "100%",
    justifyContent: "center",
    width: "100%",
  },
  messageAvatarFallbackText: {
    color: "#FFFFFF",
    ...TypeScale.bodySm,
    fontWeight: FontWeight.extrabold,
  },
  messageBubble: {
    borderRadius: Radius.xl,
    maxWidth: "82%",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  myMessageBubble: {
    alignSelf: "flex-end",
    backgroundColor: "#2D6A4F",
  },
  theirMessageBubble: {
    alignSelf: "flex-start",
    backgroundColor: "#FFFFFF",
    borderColor: "#E8E8E8",
    borderWidth: 1,
  },
  messageSender: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
    marginBottom: Spacing.xs,
    textTransform: "uppercase",
    flexShrink: 1,
  },
  myMessageSender: {
    color: "#F0F0F0",
  },
  theirMessageSender: {
    color: "#6B7280",
  },
  messageText: {
    color: "#1A1A1A",
    ...TypeScale.titleSm,
  },
  myMessageText: {
    color: "#FFFFFF",
  },
  messageTime: {
    color: "#7A8870",
    ...TypeScale.labelMd,
    marginTop: Spacing.sm,
    textAlign: "right",
  },
  myMessageTime: {
    color: "#D9E8C7",
  },
});
