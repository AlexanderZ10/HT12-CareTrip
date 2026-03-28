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
        <View style={styles.joinKeyModalSheet}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Delete group</Text>
              <Text style={styles.modalSubtitle}>
                Only the creator can remove an outdated group for everyone.
              </Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.9}
              disabled={deleting}
              onPress={onClose}
              style={styles.modalClose}
            >
              <MaterialIcons color="#374151" name="close" size={22} />
            </TouchableOpacity>
          </View>

          <View style={styles.deleteSummaryCard}>
            <Text style={styles.deleteSummaryTitle}>{group?.name ?? "Group"}</Text>
            <Text style={styles.deleteSummaryText}>
              This will permanently remove the group chat and all messages for every member.
            </Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.9}
            disabled={deleting}
            onPress={onConfirm}
            style={[
              styles.createButton,
              styles.deleteButton,
              deleting && styles.createButtonDisabled,
            ]}
          >
            <Text style={styles.createButtonText}>
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
    backgroundColor: "rgba(0,0,0,0.25)",
    flex: 1,
    justifyContent: "flex-end",
  },
  joinKeyModalSheet: {
    backgroundColor: "#FFFFFF",
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
    color: "#1A1A1A",
    fontWeight: FontWeight.extrabold,
  },
  modalSubtitle: {
    ...TypeScale.bodyMd,
    color: "#6B7280",
    marginTop: Spacing.xs,
  },
  modalClose: {
    alignItems: "center",
    backgroundColor: "#F5F5F5",
    borderRadius: Radius.full,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  deleteSummaryCard: {
    backgroundColor: "#FFF1EF",
    borderColor: "#F0B6AE",
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginTop: Spacing.sm,
    padding: Spacing.md,
  },
  deleteSummaryTitle: {
    ...TypeScale.titleLg,
    color: "#991B1B",
    fontWeight: FontWeight.extrabold,
  },
  deleteSummaryText: {
    ...TypeScale.bodyMd,
    color: "#991B1B",
    marginTop: Spacing.sm,
  },
  createButton: {
    alignItems: "center",
    backgroundColor: "#2D6A4F",
    borderRadius: Radius.lg,
    justifyContent: "center",
    marginTop: Spacing.lg,
    minHeight: 54,
  },
  createButtonDisabled: {
    opacity: 0.7,
  },
  deleteButton: {
    backgroundColor: "#B84B3A",
  },
  createButtonText: {
    ...TypeScale.titleSm,
    color: "#FFFFFF",
    fontWeight: FontWeight.extrabold,
  },
});
