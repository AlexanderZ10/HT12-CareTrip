import { MaterialIcons } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { useAppLanguage } from "../../../components/app-language-provider";
import { useAppTheme } from "../../../components/app-theme-provider";
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
  composerBottomInset: number;
  composerValue: string;
  editingMessageText: string;
  isMember: boolean;
  isEditing: boolean;
  isPublicGroup: boolean;
  joining: boolean;
  onCancelEditing: () => void;
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
  composerBottomInset,
  composerValue,
  editingMessageText,
  isMember,
  isEditing,
  isPublicGroup,
  joining,
  onCancelEditing,
  onChangeComposerValue,
  onFocusInput,
  onOpenExpenseSheet,
  onOpenShareSheet,
  onSend,
  savingExpense,
  sending,
}: GroupChatComposerProps) {
  const { t } = useAppLanguage();
  const { colors } = useAppTheme();
  const canWrite = isPublicGroup || isMember;
  const isSendDisabled =
    sending ||
    joining ||
    composerValue.trim().length === 0 ||
    !canWrite;

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.composerBar,
        {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          paddingBottom: composerBottomInset,
        },
      ]}
    >
      {isEditing ? (
        <View style={[styles.editingBanner, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
          <View style={styles.editingTextWrap}>
            <Text style={[styles.editingKicker, { color: colors.textSecondary }]}>{t("groupDetail.editingMessage")}</Text>
            <Text numberOfLines={1} style={[styles.editingPreview, { color: colors.textPrimary }]}>
              {editingMessageText}
            </Text>
          </View>
          <TouchableOpacity activeOpacity={0.85} onPress={onCancelEditing} style={[styles.editingCloseButton, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <MaterialIcons color={colors.textSecondary} name="close" size={16} />
          </TouchableOpacity>
        </View>
      ) : null}
      <TouchableOpacity
        activeOpacity={0.9}
        disabled={!canOpenSharePicker || sending || joining}
        onPress={onOpenShareSheet}
        style={[
          styles.shareSavedButton,
          { backgroundColor: colors.accentMuted, borderColor: colors.border },
          (!canOpenSharePicker || sending || joining) && styles.shareSavedButtonDisabled,
        ]}
      >
        <MaterialIcons color={colors.accent} name="bookmark-added" size={20} />
      </TouchableOpacity>
      <TouchableOpacity
        activeOpacity={0.9}
        disabled={!canManageExpenses || sending || joining || savingExpense}
        onPress={onOpenExpenseSheet}
        style={[
          styles.shareSavedButton,
          { backgroundColor: colors.accentMuted, borderColor: colors.border },
          (!canManageExpenses || sending || joining || savingExpense) &&
            styles.shareSavedButtonDisabled,
        ]}
      >
        <MaterialIcons color={colors.accent} name="receipt-long" size={20} />
      </TouchableOpacity>
      <TextInput
        multiline
        onChangeText={onChangeComposerValue}
        onFocus={onFocusInput}
        editable={canWrite}
        placeholder={
          canWrite
            ? t("groups.writeMessage")
            : t("groupDetail.needAccessToWrite")
        }
        placeholderTextColor={colors.inputPlaceholder}
        style={[styles.composerInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.textPrimary }]}
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
          { backgroundColor: colors.accent },
          isSendDisabled && styles.sendButtonDisabled,
        ]}
      >
        <MaterialIcons color={colors.buttonTextOnAction} name="north-east" size={20} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  composerBar: {
    alignItems: "flex-end",
    borderTopWidth: 1,
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
  },
  editingBanner: {
    alignItems: "center",
    borderRadius: Radius.xl,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    width: "100%",
  },
  editingTextWrap: {
    flex: 1,
    paddingRight: Spacing.sm,
  },
  editingKicker: {
    ...TypeScale.labelMd,
    fontWeight: FontWeight.bold,
    textTransform: "uppercase",
  },
  editingPreview: {
    ...TypeScale.bodySm,
    marginTop: Spacing.xs,
  },
  editingCloseButton: {
    alignItems: "center",
    borderRadius: Radius.full,
    borderWidth: 1,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  shareSavedButton: {
    alignItems: "center",
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
    borderRadius: Radius.xl,
    borderWidth: 1,
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
