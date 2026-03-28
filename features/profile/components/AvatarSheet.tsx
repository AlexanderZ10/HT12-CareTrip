import { MaterialIcons } from "@expo/vector-icons";
import React from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  FontWeight,
  Radius,
  Spacing,
  TypeScale,
} from "../../../constants/design-system";

type AvatarSheetProps = {
  visible: boolean;
  onClose: () => void;
  showAvatar: boolean;
  onPickPhoto: () => void;
  onRemovePhoto: () => void;
  updatingPhoto: boolean;
  colors: {
    modalOverlay: string;
    card: string;
    border: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    accent: string;
    errorText: string;
  };
};

export function AvatarSheet({
  visible,
  onClose,
  showAvatar,
  onPickPhoto,
  onRemovePhoto,
  updatingPhoto,
  colors,
}: AvatarSheetProps) {
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={[styles.modalOverlay, { backgroundColor: colors.modalOverlay }]}>
        <Pressable onPress={onClose} style={StyleSheet.absoluteFillObject} />
        <View style={[styles.sheet, { backgroundColor: colors.card }]}>
          <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
          <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Profile photo</Text>
          <Text style={[styles.sheetSubtitle, { color: colors.textSecondary }]}>Choose from gallery or reset to default.</Text>
          <Pressable style={[styles.sheetPrimaryBtn, { backgroundColor: colors.accent }]} onPress={onPickPhoto}>
            <MaterialIcons name="photo-library" size={18} color="#FFFFFF" />
            <Text style={styles.sheetPrimaryBtnText}>
              {showAvatar ? "Choose new photo" : "Choose photo"}
            </Text>
          </Pressable>
          {showAvatar ? (
            <Pressable style={[styles.sheetSecondaryBtn, { borderColor: colors.border }]} onPress={onRemovePhoto}>
              <MaterialIcons name="delete-outline" size={18} color={colors.errorText} />
              <Text style={[styles.sheetSecondaryBtnText, { color: colors.errorText }]}>Remove photo</Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.sheetCancel} onPress={onClose}>
            <Text style={[styles.sheetCancelText, { color: colors.textMuted }]}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: Radius["3xl"],
    borderTopRightRadius: Radius["3xl"],
    paddingHorizontal: Spacing["2xl"],
    paddingBottom: Spacing["3xl"],
    paddingTop: Spacing.md,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: Radius.full,
    alignSelf: "center",
    marginBottom: Spacing.xl,
  },
  sheetTitle: {
    ...TypeScale.headingSm,
    marginBottom: Spacing.xs,
  },
  sheetSubtitle: {
    ...TypeScale.bodyMd,
    marginBottom: Spacing.xl,
  },
  sheetPrimaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    borderRadius: Radius.md,
    paddingVertical: Spacing.lg,
  },
  sheetPrimaryBtnText: {
    ...TypeScale.titleMd,
    color: "#FFFFFF",
    fontWeight: FontWeight.bold,
  },
  sheetSecondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    borderRadius: Radius.md,
    paddingVertical: Spacing.lg,
    marginTop: Spacing.sm,
    borderWidth: 1,
  },
  sheetSecondaryBtnText: {
    ...TypeScale.titleMd,
    fontWeight: FontWeight.semibold,
  },
  sheetCancel: {
    alignItems: "center",
    paddingVertical: Spacing.md,
    marginTop: Spacing.xs,
  },
  sheetCancelText: {
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.semibold,
  },
});
