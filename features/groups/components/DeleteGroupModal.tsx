import { MaterialIcons } from "@expo/vector-icons";
import React from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { useAppTheme } from "../../../components/app-theme-provider";
import {
  FontWeight,
  Radius,
  Spacing,
  TypeScale,
} from "../../../constants/design-system";
import type { TravelGroup } from "../../../utils/groups";

type DeleteGroupModalProps = {
  visible: boolean;
  group: TravelGroup | null;
  deleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function DeleteGroupModal({
  visible,
  group,
  deleting,
  onClose,
  onConfirm,
}: DeleteGroupModalProps) {
  const { colors } = useAppTheme();

  return (
    <Modal
      animationType="slide"
      onRequestClose={() => {
        if (deleting) {
          return;
        }

        onClose();
      }}
      transparent
      visible={visible}
    >
      <View style={[styles.modalBackdrop, { backgroundColor: colors.modalOverlay }]}>
        <View style={[styles.joinKeyModalSheet, { backgroundColor: colors.card }]}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                Delete group
              </Text>
              <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
                Only the creator can remove an outdated group for everyone.
              </Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.9}
              disabled={deleting}
              onPress={onClose}
              style={[styles.modalClose, { backgroundColor: colors.inputBackground }]}
            >
              <MaterialIcons color={colors.textSecondary} name="close" size={22} />
            </TouchableOpacity>
          </View>

          <View
            style={[
              styles.deleteSummaryCard,
              {
                backgroundColor: colors.errorBackground,
                borderColor: colors.errorBorder,
              },
            ]}
          >
            <Text style={[styles.deleteSummaryTitle, { color: colors.errorText }]}>
              {group?.name ?? "Group"}
            </Text>
            <Text style={[styles.deleteSummaryText, { color: colors.errorText }]}>
              This will permanently remove the group chat and all messages for every member.
            </Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.9}
            disabled={deleting}
            onPress={onConfirm}
            style={[
              styles.createButton,
              { backgroundColor: colors.errorText },
              deleting && styles.createButtonDisabled,
            ]}
          >
            <Text style={[styles.createButtonText, { color: colors.buttonTextOnAction }]}>
              {deleting ? "Deleting..." : "Delete group"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
  },
  joinKeyModalSheet: {
    borderTopLeftRadius: Radius["3xl"],
    borderTopRightRadius: Radius["3xl"],
    paddingBottom: Radius["3xl"],
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  modalHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.lg,
  },
  modalTitle: {
    ...TypeScale.headingLg,
    fontWeight: FontWeight.extrabold,
  },
  modalSubtitle: {
    ...TypeScale.bodyMd,
    marginTop: Spacing.xs,
  },
  modalClose: {
    alignItems: "center",
    borderRadius: Radius.full,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  deleteSummaryCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginTop: Spacing.sm,
    padding: Spacing.md,
  },
  deleteSummaryTitle: {
    ...TypeScale.titleLg,
    fontWeight: FontWeight.extrabold,
  },
  deleteSummaryText: {
    ...TypeScale.bodyMd,
    marginTop: Spacing.sm,
  },
  createButton: {
    alignItems: "center",
    borderRadius: Radius.lg,
    justifyContent: "center",
    marginTop: Spacing.lg,
    minHeight: 54,
  },
  createButtonDisabled: {
    opacity: 0.7,
  },
  createButtonText: {
    ...TypeScale.titleSm,
    fontWeight: FontWeight.extrabold,
  },
});
