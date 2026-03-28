import { MaterialIcons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import {
  FontWeight,
  Radius,
  Spacing,
  TypeScale,
} from "../../../constants/design-system";
import {
  type GroupChatLinkedTransport,
  type GroupChatMessage,
  type GroupChatSharedTrip,
} from "../../../utils/group-chat";
import {
  buildLinkedExpenseLookupKey,
  buildSharedTripDetailsPreview,
  formatExpenseAmount,
  getSharedTripSourceLabel,
} from "../helpers";

interface SharedTripCardProps {
  creatingLinkedExpenseKey: string | null;
  group: { memberCount: number } | null;
  isMine: boolean;
  linkedExpenseMessagesByKey: Record<string, GroupChatMessage>;
  message: GroupChatMessage;
  onCreateLinkedTransportExpense: (
    message: GroupChatMessage,
    linkedTransport: GroupChatLinkedTransport
  ) => void;
  onOpenPlannerTicket: (bookingUrl: string) => void;
  onPreviewTrip: (sharedTrip: GroupChatSharedTrip) => void;
}

export function SharedTripCard({
  creatingLinkedExpenseKey,
  group,
  isMine,
  linkedExpenseMessagesByKey,
  message,
  onCreateLinkedTransportExpense,
  onOpenPlannerTicket,
  onPreviewTrip,
}: SharedTripCardProps) {
  const sharedTripLinkedTransports = message.sharedTrip?.linkedTransports ?? [];

  return (
    <View
      style={[
        styles.sharedTripCard,
        isMine ? styles.mySharedTripCard : styles.theirSharedTripCard,
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.92}
        onPress={() => {
          if (message.sharedTrip) {
            onPreviewTrip(message.sharedTrip);
          }
        }}
      >
        <View style={styles.sharedTripTopRow}>
          <Text style={[styles.sharedTripKicker, isMine && styles.mySharedTripKicker]}>
            Trip plan
          </Text>
          <View
            style={[
              styles.sharedTripSourceBadge,
              message.sharedTrip?.source === "home"
                ? styles.sharedTripHomeBadge
                : styles.sharedTripDiscoverBadge,
            ]}
          >
            <Text
              style={[
                styles.sharedTripSourceBadgeText,
                message.sharedTrip?.source === "home"
                  ? styles.sharedTripHomeBadgeText
                  : styles.sharedTripDiscoverBadgeText,
              ]}
            >
              {getSharedTripSourceLabel(message.sharedTrip?.source ?? "discover")}
            </Text>
          </View>
        </View>
        <Text style={[styles.sharedTripTitle, isMine && styles.mySharedTripTitle]}>
          {message.sharedTrip?.title}
        </Text>
        <Text
          style={[
            styles.sharedTripDestination,
            isMine && styles.mySharedTripDestination,
          ]}
        >
          {message.sharedTrip?.destination}
        </Text>
        <View style={styles.sharedTripMetaRow}>
          {message.sharedTrip?.duration ? (
            <Text
              style={[
                styles.sharedTripMetaText,
                isMine && styles.mySharedTripMetaText,
              ]}
            >
              {message.sharedTrip.duration}
            </Text>
          ) : null}
          {message.sharedTrip?.budget ? (
            <Text
              style={[
                styles.sharedTripMetaText,
                isMine && styles.mySharedTripMetaText,
              ]}
            >
              {message.sharedTrip.budget}
            </Text>
          ) : null}
        </View>
        {message.sharedTrip?.summary ? (
          <Text
            numberOfLines={3}
            style={[styles.sharedTripSummary, isMine && styles.mySharedTripSummary]}
          >
            {message.sharedTrip.summary}
          </Text>
        ) : null}
        <Text
          numberOfLines={4}
          style={[
            styles.sharedTripDetailsPreview,
            isMine && styles.mySharedTripDetailsPreview,
          ]}
        >
          {buildSharedTripDetailsPreview(message.sharedTrip)}
        </Text>
        <Text style={[styles.sharedTripHint, isMine && styles.mySharedTripHint]}>
          {sharedTripLinkedTransports.length > 0
            ? "Tap to open the full trip plan and all linked planner offers"
            : "Tap to open the full trip plan"}
        </Text>
      </TouchableOpacity>
      {sharedTripLinkedTransports.length > 0 ? (
        <View style={styles.linkedTransportSection}>
          <Text
            style={[
              styles.linkedTransportSectionTitle,
              isMine && styles.myLinkedTransportSectionTitle,
            ]}
          >
            Planner ticket prices
          </Text>
          {sharedTripLinkedTransports.slice(0, 2).map((linkedTransport) => {
            const linkedExpenseKey = buildLinkedExpenseLookupKey(
              message.sharedTrip?.sourceKey ?? "",
              linkedTransport.itemKey
            );
            const linkedExpenseMessage = linkedExpenseMessagesByKey[linkedExpenseKey] ?? null;
            const ticketShareAmount =
              group && group.memberCount > 0
                ? linkedTransport.amountValue / group.memberCount
                : linkedTransport.amountValue;

            return (
              <View
                key={linkedTransport.itemKey}
                style={[
                  styles.linkedTransportCard,
                  isMine ? styles.myLinkedTransportCard : styles.theirLinkedTransportCard,
                ]}
              >
                <View style={styles.linkedTransportTopRow}>
                  <View style={styles.linkedTransportTextWrap}>
                    <Text
                      style={[
                        styles.linkedTransportTitle,
                        isMine && styles.myLinkedTransportTitle,
                      ]}
                    >
                      {linkedTransport.title}
                    </Text>
                    {linkedTransport.route ? (
                      <Text
                        numberOfLines={2}
                        style={[
                          styles.linkedTransportRoute,
                          isMine && styles.myLinkedTransportRoute,
                        ]}
                      >
                        {linkedTransport.route}
                      </Text>
                    ) : null}
                  </View>
                  <Text
                    style={[
                      styles.linkedTransportAmount,
                      isMine && styles.myLinkedTransportAmount,
                    ]}
                  >
                    {linkedTransport.amountLabel}
                  </Text>
                </View>

                <View style={styles.linkedTransportMetaRow}>
                  {linkedTransport.duration ? (
                    <Text
                      style={[
                        styles.linkedTransportMetaText,
                        isMine && styles.myLinkedTransportMetaText,
                      ]}
                    >
                      {linkedTransport.duration}
                    </Text>
                  ) : null}
                  {linkedTransport.sourceLabel ? (
                    <Text
                      style={[
                        styles.linkedTransportMetaText,
                        isMine && styles.myLinkedTransportMetaText,
                      ]}
                    >
                      {linkedTransport.sourceLabel}
                    </Text>
                  ) : null}
                  <Text
                    style={[
                      styles.linkedTransportMetaText,
                      isMine && styles.myLinkedTransportMetaText,
                    ]}
                  >
                    {formatExpenseAmount(ticketShareAmount)} each
                  </Text>
                </View>

                {linkedExpenseMessage ? (
                  <View
                    style={[
                      styles.linkedTransportPostedBadge,
                      isMine
                        ? styles.myLinkedTransportPostedBadge
                        : styles.theirLinkedTransportPostedBadge,
                    ]}
                  >
                    <MaterialIcons color="#2D6A4F" name="check-circle" size={15} />
                    <Text style={styles.linkedTransportPostedBadgeText}>
                      Expense posted in chat
                    </Text>
                  </View>
                ) : (
                  <View style={styles.linkedTransportActionsRow}>
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() => {
                        onOpenPlannerTicket(linkedTransport.bookingUrl);
                      }}
                      style={[
                        styles.linkedTransportSecondaryButton,
                        isMine && styles.myLinkedTransportSecondaryButton,
                      ]}
                    >
                      <MaterialIcons color="#6B7280" name="open-in-new" size={16} />
                      <Text style={styles.linkedTransportSecondaryButtonText}>
                        Open link
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={0.9}
                      disabled={creatingLinkedExpenseKey === linkedExpenseKey}
                      onPress={() => {
                        onCreateLinkedTransportExpense(message, linkedTransport);
                      }}
                      style={[
                        styles.linkedTransportPrimaryButton,
                        creatingLinkedExpenseKey === linkedExpenseKey &&
                          styles.linkedTransportPrimaryButtonDisabled,
                      ]}
                    >
                      <MaterialIcons color="#FFFFFF" name="payments" size={16} />
                      <Text style={styles.linkedTransportPrimaryButtonText}>
                        {creatingLinkedExpenseKey === linkedExpenseKey
                          ? "Posting..."
                          : "Create in-app split"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
          {sharedTripLinkedTransports.length > 2 ? (
            <Text
              style={[
                styles.linkedTransportMoreHint,
                isMine && styles.myLinkedTransportMoreHint,
              ]}
            >
              Open the trip to see all planner ticket options.
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sharedTripCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginTop: 2,
    padding: Spacing.md,
  },
  mySharedTripCard: {
    backgroundColor: "#F7FAF1",
    borderColor: "#E8E8E8",
  },
  theirSharedTripCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E8E8E8",
  },
  sharedTripTopRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  sharedTripKicker: {
    color: "#6B7280",
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
    textTransform: "uppercase",
  },
  mySharedTripKicker: {
    color: "#6B7280",
  },
  sharedTripSourceBadge: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  sharedTripHomeBadge: {
    backgroundColor: "#E5E7EB",
  },
  sharedTripDiscoverBadge: {
    backgroundColor: "#FFF2DA",
  },
  sharedTripSourceBadgeText: {
    ...TypeScale.labelSm,
    fontWeight: FontWeight.extrabold,
  },
  sharedTripHomeBadgeText: {
    color: "#2D6A4F",
  },
  sharedTripDiscoverBadgeText: {
    color: "#8B5611",
  },
  sharedTripTitle: {
    color: "#1A1A1A",
    ...TypeScale.titleLg,
    fontWeight: FontWeight.extrabold,
  },
  mySharedTripTitle: {
    color: "#1A1A1A",
  },
  sharedTripDestination: {
    color: "#5A6E41",
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.bold,
    marginTop: Spacing.xs,
  },
  mySharedTripDestination: {
    color: "#5A6E41",
  },
  sharedTripMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: Spacing.sm,
  },
  sharedTripMetaText: {
    color: "#627254",
    ...TypeScale.bodySm,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.xs,
    marginRight: Spacing.sm,
  },
  mySharedTripMetaText: {
    color: "#627254",
  },
  sharedTripSummary: {
    color: "#435238",
    ...TypeScale.bodyMd,
    marginTop: Spacing.sm,
  },
  mySharedTripSummary: {
    color: "#435238",
  },
  sharedTripDetailsPreview: {
    color: "#57684A",
    ...TypeScale.bodySm,
    marginTop: Spacing.sm,
  },
  mySharedTripDetailsPreview: {
    color: "#57684A",
  },
  sharedTripHint: {
    color: "#7A8870",
    ...TypeScale.labelMd,
    fontWeight: FontWeight.bold,
    marginTop: Spacing.sm,
  },
  mySharedTripHint: {
    color: "#7A8870",
  },
  linkedTransportSection: {
    marginTop: Spacing.md,
  },
  linkedTransportSectionTitle: {
    color: "#6B7280",
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  myLinkedTransportSectionTitle: {
    color: "#6B7280",
  },
  linkedTransportCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginTop: Spacing.sm,
    padding: Spacing.md,
  },
  myLinkedTransportCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E8E8E8",
  },
  theirLinkedTransportCard: {
    backgroundColor: "#F8F8F8",
    borderColor: "#E8E8E8",
  },
  linkedTransportTopRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  linkedTransportTextWrap: {
    flex: 1,
    paddingRight: Spacing.sm,
  },
  linkedTransportTitle: {
    color: "#1A1A1A",
    ...TypeScale.titleSm,
    fontWeight: FontWeight.extrabold,
  },
  myLinkedTransportTitle: {
    color: "#1A1A1A",
  },
  linkedTransportRoute: {
    color: "#5A6E41",
    ...TypeScale.bodySm,
    marginTop: Spacing.xs,
  },
  myLinkedTransportRoute: {
    color: "#5A6E41",
  },
  linkedTransportAmount: {
    color: "#1A1A1A",
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.extrabold,
  },
  myLinkedTransportAmount: {
    color: "#1A1A1A",
  },
  linkedTransportMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  linkedTransportMetaText: {
    color: "#627254",
    ...TypeScale.labelMd,
    fontWeight: FontWeight.bold,
  },
  myLinkedTransportMetaText: {
    color: "#627254",
  },
  linkedTransportActionsRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  linkedTransportSecondaryButton: {
    alignItems: "center",
    backgroundColor: "#F5F5F5",
    borderColor: "#E8E8E8",
    borderRadius: Radius.md,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: Spacing.xs,
    justifyContent: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  myLinkedTransportSecondaryButton: {
    backgroundColor: "#F5F5F5",
    borderColor: "#E8E8E8",
  },
  linkedTransportSecondaryButtonText: {
    color: "#6B7280",
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
  },
  linkedTransportPrimaryButton: {
    alignItems: "center",
    backgroundColor: "#2D6A4F",
    borderRadius: Radius.md,
    flex: 1,
    flexDirection: "row",
    gap: Spacing.xs,
    justifyContent: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  linkedTransportPrimaryButtonDisabled: {
    opacity: 0.6,
  },
  linkedTransportPrimaryButtonText: {
    color: "#FFFFFF",
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
  },
  linkedTransportPostedBadge: {
    alignItems: "center",
    borderRadius: Radius.md,
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  myLinkedTransportPostedBadge: {
    backgroundColor: "#E6F1DA",
  },
  theirLinkedTransportPostedBadge: {
    backgroundColor: "#F5F5F5",
  },
  linkedTransportPostedBadgeText: {
    color: "#2D6A4F",
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
  },
  linkedTransportMoreHint: {
    color: "#7A8870",
    ...TypeScale.labelMd,
    fontWeight: FontWeight.bold,
    marginTop: Spacing.sm,
  },
  myLinkedTransportMoreHint: {
    color: "#7A8870",
  },
});
