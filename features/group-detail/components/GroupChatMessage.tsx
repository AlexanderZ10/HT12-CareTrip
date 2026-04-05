import { MaterialIcons } from "@expo/vector-icons";
import React, { useCallback, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";

import { useAppLanguage } from "../../../components/app-language-provider";
import { useAppTheme } from "../../../components/app-theme-provider";
import {
  FontWeight,
  Radius,
  shadow,
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
import { getLanguageLocale } from "../../../utils/translations";
import { formatMessageTime, getAvatarColor, getInitials } from "../helpers";
import { ExpenseCard } from "./ExpenseCard";
import { SharedTripCard } from "./SharedTripCard";

interface GroupChatMessageProps {
  canDeleteMessage: boolean;
  canEditMessage: boolean;
  creatingLinkedExpenseKey: string | null;
  deleting: boolean;
  expenseRemainingCollection: number;
  group: { memberCount: number } | null;
  isMember: boolean;
  isMine: boolean;
  linkedExpenseMessagesByKey: Record<string, GroupChatMessageType>;
  message: GroupChatMessageType;
  myOutstandingAmount: number;
  myRepayment: GroupExpenseRepayment | null;
  onDeleteMessage: (message: GroupChatMessageType) => void;
  onEditMessage: (message: GroupChatMessageType) => void;
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

interface MenuPosition {
  top: number;
  left: number;
  bubbleWidth: number;
}

export function GroupChatMessageRow({
  canDeleteMessage,
  canEditMessage,
  creatingLinkedExpenseKey,
  deleting,
  expenseRemainingCollection,
  group,
  isMember,
  isMine,
  linkedExpenseMessagesByKey,
  message,
  myOutstandingAmount,
  myRepayment,
  onDeleteMessage,
  onEditMessage,
  onCreateLinkedTransportExpense,
  onOpenPlannerTicket,
  onPayExpense,
  onPreviewTrip,
  processingRepaymentExpenseId,
  settledShareCount,
  userId,
}: GroupChatMessageProps) {
  const { language, t } = useAppLanguage();
  const { colors } = useAppTheme();
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const bubbleRef = useRef<View>(null);
  const hasSharedTrip = message.messageType === "shared-trip" && !!message.sharedTrip;
  const hasExpense = message.messageType === "expense" && !!message.expense;
  const expense = hasExpense ? (message.expense as GroupChatExpense) : null;
  const senderName = isMine ? t("common.you") : message.senderLabel;
  const showMenu = canEditMessage || canDeleteMessage;

  const handleLongPress = useCallback(() => {
    if (!showMenu) return;
    bubbleRef.current?.measureInWindow((x, y, width, height) => {
      setMenuPosition({ top: y + height + 4, left: x, bubbleWidth: width });
      setMenuVisible(true);
    });
  }, [showMenu]);

  return (
    <View
      style={[styles.messageRow, isMine ? styles.myMessageRow : styles.theirMessageRow]}
    >
      {!isMine ? (
        <View style={styles.messageAvatarWrap}>
          {message.senderAvatarUrl ? (
            <Image
              source={{ uri: message.senderAvatarUrl }}
              style={[styles.messageAvatarImage, { backgroundColor: colors.border }]}
              contentFit="cover"
            />
          ) : (
            <View
              style={[
                styles.messageAvatarFallback,
                { backgroundColor: getAvatarColor(senderName) },
              ]}
            >
              <Text style={[styles.messageAvatarFallbackText, { color: colors.buttonTextOnAction }]}>
                {getInitials(senderName)}
              </Text>
            </View>
          )}
        </View>
      ) : null}

      <Pressable
        onLongPress={handleLongPress}
        delayLongPress={400}
        style={styles.bubblePressable}
      >
        <View
          ref={bubbleRef}
          style={[
            styles.messageBubble,
            isMine
              ? { backgroundColor: colors.accent }
              : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
          ]}
        >
          <Text
            style={[
              styles.messageSender,
              { color: isMine ? colors.screenSoft : colors.textSecondary },
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
            <Text style={[styles.messageText, { color: isMine ? colors.buttonTextOnAction : colors.textPrimary }]}>
              {message.text}
            </Text>
          )}
          <Text style={[styles.messageTime, { color: isMine ? colors.textMuted : colors.textMuted }]}>
            {formatMessageTime(message.createdAtMs, getLanguageLocale(language))}
          </Text>
        </View>
      </Pressable>

      {showMenu ? (
        <Modal
          transparent
          visible={menuVisible}
          animationType="fade"
          onRequestClose={() => setMenuVisible(false)}
        >
          <Pressable style={[styles.menuOverlay, { backgroundColor: colors.modalOverlay }]} onPress={() => setMenuVisible(false)}>
            <View
              style={[
                styles.menuContainer,
                { backgroundColor: colors.card },
                menuPosition && {
                  position: "absolute",
                  top: menuPosition.top,
                  ...(isMine
                    ? { right: undefined, left: menuPosition.left + menuPosition.bubbleWidth - 200 }
                    : { left: menuPosition.left }),
                },
              ]}
            >
              {canEditMessage ? (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => {
                    setMenuVisible(false);
                    onEditMessage(message);
                  }}
                  style={styles.menuItem}
                >
                  <MaterialIcons name="edit" size={20} color={colors.textPrimary} />
                  <Text style={[styles.menuItemText, { color: colors.textPrimary }]}>{t("groups.edit")}</Text>
                </TouchableOpacity>
              ) : null}
              {canEditMessage && canDeleteMessage ? (
                <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
              ) : null}
              {canDeleteMessage ? (
                <TouchableOpacity
                  activeOpacity={0.7}
                  disabled={deleting}
                  onPress={() => {
                    setMenuVisible(false);
                    onDeleteMessage(message);
                  }}
                  style={styles.menuItem}
                >
                  <MaterialIcons name="delete-outline" size={20} color={colors.error} />
                  <Text style={[styles.menuItemText, { color: colors.error }]}>
                    {deleting ? t("common.deleting") : t("groups.delete")}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </Pressable>
        </Modal>
      ) : null}

      {isMine ? (
        <View style={styles.messageAvatarWrap}>
          {message.senderAvatarUrl ? (
            <Image
              source={{ uri: message.senderAvatarUrl }}
              style={[styles.messageAvatarImage, { backgroundColor: colors.border }]}
              contentFit="cover"
            />
          ) : (
            <View
              style={[
                styles.messageAvatarFallback,
                { backgroundColor: getAvatarColor(senderName) },
              ]}
            >
              <Text style={[styles.messageAvatarFallbackText, { color: colors.buttonTextOnAction }]}>
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
  },
  messageAvatarFallback: {
    alignItems: "center",
    borderRadius: Radius.full,
    height: "100%",
    justifyContent: "center",
    width: "100%",
  },
  messageAvatarFallbackText: {
    ...TypeScale.bodySm,
    fontWeight: FontWeight.extrabold,
  },
  bubblePressable: {
    flexShrink: 1,
  },
  messageBubble: {
    borderRadius: Radius.xl,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  messageSender: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
    marginBottom: Spacing.xs,
    textTransform: "uppercase",
    flexShrink: 1,
  },
  messageText: {
    ...TypeScale.titleSm,
  },
  menuOverlay: {
    flex: 1,
  },
  menuContainer: {
    borderRadius: Radius.xl,
    minWidth: 200,
    overflow: "hidden",
    paddingVertical: Spacing.xs,
    ...shadow("lg"),
  },
  menuItem: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 14,
  },
  menuItemText: {
    ...TypeScale.titleSm,
    fontWeight: FontWeight.bold,
  },
  menuDivider: {
    height: 1,
    marginHorizontal: Spacing.md,
  },
  messageTime: {
    ...TypeScale.labelMd,
    marginTop: Spacing.sm,
    textAlign: "right",
  },
});
