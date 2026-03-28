import { MaterialIcons } from "@expo/vector-icons";
import React from "react";
import { Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import {
  FontWeight,
  Layout,
  Radius,
  Spacing,
  TypeScale,
} from "../../../constants/design-system";

interface GroupChatComposerProps {
  canManageExpenses: boolean;
  canOpenSharePicker: boolean;
  colors: Record<string, string>;
  composerBottomInset: number;
  composerValue: string;
  isMember: boolean;
  isPublicGroup: boolean;
  joining: boolean;
  onChangeComposerValue: (value: string) => void;
  onFocusInput: () => void;
  onOpenExpenseSheet: () => void;
  onOpenShareSheet: () => void;
  onSend: () => void;
  savingExpense: boolean;
  sending: boolean;
}

export function GroupChatComposer({
  canManageExpenses,
  canOpenSharePicker,
  colors,
  composerBottomInset,
  composerValue,
  isMember,
  isPublicGroup,
  joining,
  onChangeComposerValue,
  onFocusInput,
  onOpenExpenseSheet,
  onOpenShareSheet,
  onSend,
  savingExpense,
  sending,
}: GroupChatComposerProps) {
  const canWrite = isPublicGroup || isMember;
  const isSendDisabled =
    sending ||
    joining ||
    composerValue.trim().length === 0 ||
    !canWrite;

  return (
    <View style={[styles.composerBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: composerBottomInset }]}>
      <TouchableOpacity
        activeOpacity={0.9}
        disabled={!canOpenSharePicker || sending || joining}
        onPress={onOpenShareSheet}
        style={[
          styles.shareSavedButton,
          (!canOpenSharePicker || sending || joining) && styles.shareSavedButtonDisabled,
        ]}
      >
        <MaterialIcons color="#2D6A4F" name="bookmark-added" size={20} />
      </TouchableOpacity>
      <TouchableOpacity
        activeOpacity={0.9}
        disabled={!canManageExpenses || sending || joining || savingExpense}
        onPress={onOpenExpenseSheet}
        style={[
          styles.shareSavedButton,
          (!canManageExpenses || sending || joining || savingExpense) &&
            styles.shareSavedButtonDisabled,
        ]}
      >
        <MaterialIcons color="#2D6A4F" name="receipt-long" size={20} />
      </TouchableOpacity>
      <TextInput
        multiline
        onChangeText={onChangeComposerValue}
        onFocus={onFocusInput}
        editable={canWrite}
        placeholder={
          canWrite
            ? "Write a message"
            : "You need access to write"
        }
        placeholderTextColor="#809071"
        style={[styles.composerInput, { color: colors.textPrimary }]}
        value={composerValue}
        returnKeyType={Platform.OS === "web" ? undefined : "send"}
        blurOnSubmit={false}
        onSubmitEditing={() => {
          if (Platform.OS !== "web") {
            onSend();
          }
        }}
      />
      <TouchableOpacity
        activeOpacity={0.9}
        disabled={isSendDisabled}
        onPress={onSend}
        style={[
          styles.sendButton,
          isSendDisabled && styles.sendButtonDisabled,
        ]}
      >
        <MaterialIcons color="#FFFFFF" name="north-east" size={20} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  composerBar: {
    alignItems: "flex-end",
    backgroundColor: "#FFFFFF",
    borderTopColor: "#E8E8E8",
    borderTopWidth: 1,
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
  },
  shareSavedButton: {
    alignItems: "center",
    backgroundColor: "#F4F8EC",
    borderColor: "#E8E8E8",
    borderRadius: Radius.xl,
    borderWidth: 1,
    height: Layout.touchTarget,
    justifyContent: "center",
    marginRight: Spacing.sm,
    width: Layout.touchTarget,
  },
  shareSavedButtonDisabled: {
    opacity: 0.55,
  },
  composerInput: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E8E8E8",
    borderRadius: Radius.xl,
    borderWidth: 1,
    color: "#1A1A1A",
    flex: 1,
    ...TypeScale.titleSm,
    maxHeight: 120,
    minHeight: Layout.touchTarget,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingVertical: Spacing.md,
  },
  sendButton: {
    alignItems: "center",
    backgroundColor: "#2D6A4F",
    borderRadius: Radius.xl,
    height: Layout.touchTarget,
    justifyContent: "center",
    marginLeft: Spacing.sm,
    width: Layout.touchTarget,
  },
  sendButtonDisabled: {
    opacity: 0.55,
  },
});
