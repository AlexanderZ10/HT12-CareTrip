import { MaterialIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React from "react";
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { useAppLanguage } from "../../../components/app-language-provider";
import { useAppTheme } from "../../../components/app-theme-provider";
import {
  FontWeight,
  Radius,
  Spacing,
  TypeScale,
} from "../../../constants/design-system";

interface GroupChatComposerProps {
  canManageExpenses: boolean;
  canOpenSharePicker: boolean;
  canPickPhoto: boolean;
  composerBottomInset: number;
  composerPhotoUri: string;
  composerValue: string;
  editingMessageText: string;
  isMember: boolean;
  isEditing: boolean;
  isPublicGroup: boolean;
  joining: boolean;
  onCancelEditing: () => void;
  onChangeComposerValue: (value: string) => void;
  onClearComposerPhoto: () => void;
  onFocusInput: () => void;
  onOpenCamera: () => void;
  onOpenExpenseSheet: () => void;
  onOpenPhotoLibrary: () => void;
  onOpenShareSheet: () => void;
  onSend: () => void;
  pickingPhoto: boolean;
  savingExpense: boolean;
  sending: boolean;
}

export function GroupChatComposer({
  canManageExpenses,
  canOpenSharePicker,
  canPickPhoto,
  composerBottomInset,
  composerPhotoUri,
  composerValue,
  editingMessageText,
  isMember,
  isEditing,
  isPublicGroup,
  joining,
  onCancelEditing,
  onChangeComposerValue,
  onClearComposerPhoto,
  onFocusInput,
  onOpenCamera,
  onOpenExpenseSheet,
  onOpenPhotoLibrary,
  onOpenShareSheet,
  onSend,
  pickingPhoto,
  savingExpense,
  sending,
}: GroupChatComposerProps) {
  const { t } = useAppLanguage();
  const { colors } = useAppTheme();
  const canWrite = isPublicGroup || isMember;
  const isSendDisabled =
    sending ||
    joining ||
    (composerValue.trim().length === 0 && !composerPhotoUri) ||
    !canWrite;

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.composerShell,
        {
          backgroundColor: colors.card,
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
      {composerPhotoUri ? (
        <View
          style={[
            styles.photoPreviewBanner,
            { backgroundColor: colors.cardAlt, borderColor: colors.border },
          ]}
        >
          <Image source={{ uri: composerPhotoUri }} style={styles.photoPreviewImage} contentFit="cover" />
          <View style={styles.photoPreviewTextWrap}>
            <Text style={[styles.editingKicker, { color: colors.textSecondary }]}>Photo attached</Text>
            <Text numberOfLines={1} style={[styles.editingPreview, { color: colors.textPrimary }]}>
              Add a caption or send it as-is.
            </Text>
          </View>
          <View style={styles.photoPreviewActions}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={onOpenCamera}
              style={[styles.photoPreviewActionButton, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <MaterialIcons color={colors.textSecondary} name="photo-camera" size={16} />
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={onClearComposerPhoto}
              style={[styles.photoPreviewActionButton, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <MaterialIcons color={colors.textSecondary} name="close" size={16} />
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
      <View style={[styles.composerInputRow, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}>
        <View style={styles.actionStrip}>
          <TouchableOpacity
            activeOpacity={0.7}
            disabled={!canPickPhoto || sending || joining || pickingPhoto}
            onPress={onOpenPhotoLibrary}
            onLongPress={onOpenCamera}
            style={[
              styles.actionIcon,
              (!canPickPhoto || sending || joining || pickingPhoto) && styles.actionIconDisabled,
            ]}
          >
            <MaterialIcons color={colors.accent} name="add-photo-alternate" size={22} />
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.7}
            disabled={!canOpenSharePicker || sending || joining}
            onPress={onOpenShareSheet}
            style={[
              styles.actionIcon,
              (!canOpenSharePicker || sending || joining) && styles.actionIconDisabled,
            ]}
          >
            <MaterialIcons color={colors.textSecondary} name="bookmark-added" size={22} />
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.7}
            disabled={!canManageExpenses || sending || joining || savingExpense}
            onPress={onOpenExpenseSheet}
            style={[
              styles.actionIcon,
              (!canManageExpenses || sending || joining || savingExpense) && styles.actionIconDisabled,
            ]}
          >
            <MaterialIcons color={colors.textSecondary} name="receipt-long" size={22} />
          </TouchableOpacity>
        </View>
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
            { backgroundColor: colors.accent },
            isSendDisabled && styles.sendButtonDisabled,
          ]}
        >
          <MaterialIcons color={colors.buttonTextOnAction} name="arrow-upward" size={20} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  composerShell: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  editingBanner: {
    alignItems: "center",
    borderRadius: Radius.xl,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: Spacing.sm,
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
  photoPreviewBanner: {
    alignItems: "center",
    borderRadius: Radius.xl,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    width: "100%",
  },
  photoPreviewImage: {
    borderRadius: Radius.md,
    height: 52,
    width: 52,
  },
  photoPreviewTextWrap: {
    flex: 1,
    marginLeft: Spacing.sm,
    paddingRight: Spacing.sm,
  },
  photoPreviewActions: {
    flexDirection: "row",
    gap: Spacing.xs,
  },
  photoPreviewActionButton: {
    alignItems: "center",
    borderRadius: Radius.full,
    borderWidth: 1,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  composerInputRow: {
    alignItems: "flex-end",
    borderRadius: Radius["2xl"],
    borderWidth: 1,
    flexDirection: "row",
    paddingLeft: Spacing.xs,
    paddingRight: Spacing.xs,
    paddingVertical: Spacing.xs,
  },
  actionStrip: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: Platform.OS === "ios" ? 6 : 4,
  },
  actionIcon: {
    alignItems: "center",
    justifyContent: "center",
    width: 36,
    height: 36,
    borderRadius: Radius.full,
  },
  actionIconDisabled: {
    opacity: 0.35,
  },
  composerInput: {
    flex: 1,
    ...TypeScale.bodyMd,
    maxHeight: 120,
    minHeight: 36,
    paddingHorizontal: Spacing.sm,
    paddingTop: Platform.OS === "ios" ? 9 : 7,
    paddingBottom: Platform.OS === "ios" ? 9 : 7,
  },
  sendButton: {
    alignItems: "center",
    borderRadius: Radius.full,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
});
