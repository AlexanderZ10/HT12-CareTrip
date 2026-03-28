import { MaterialIcons } from "@expo/vector-icons";
import React from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TextInput,
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
import { normalizeGroupJoinKey } from "../../../utils/groups";

type JoinGroupModalProps = {
  visible: boolean;
  onClose: () => void;
  joinKeyValue: string;
  onJoinKeyChange: (value: string) => void;
  joining: boolean;
  onJoinPress: () => void;
  onClearFeedback: () => void;
};

export function JoinGroupModal({
  visible,
  onClose,
  joinKeyValue,
  onJoinKeyChange,
  joining,
  onJoinPress,
  onClearFeedback,
}: JoinGroupModalProps) {
  const { colors } = useAppTheme();

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={[styles.modalBackdrop, { backgroundColor: colors.modalOverlay }]}>
        <View style={styles.joinKeyModalSheet}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Join with private key</Text>
              <Text style={styles.modalSubtitle}>
                Paste the key shared by the group creator.
              </Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={onClose}
              style={styles.modalClose}
            >
              <MaterialIcons color="#374151" name="close" size={22} />
            </TouchableOpacity>
          </View>

          <TextInput
            autoCapitalize="characters"
            onChangeText={(value) => {
              onJoinKeyChange(normalizeGroupJoinKey(value));
              onClearFeedback();
            }}
            placeholder="Enter private key"
            placeholderTextColor="#9CA3AF"
            style={styles.modalInput}
            value={joinKeyValue}
          />

          <TouchableOpacity
            activeOpacity={0.9}
            disabled={joining}
            onPress={onJoinPress}
            style={[styles.createButton, joining && styles.createButtonDisabled]}
          >
            <Text style={styles.createButtonText}>
              {joining ? "Joining..." : "Join group"}
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
  modalInput: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E8E8E8",
    borderRadius: Radius.lg,
    borderWidth: 1,
    color: "#1A1A1A",
    ...TypeScale.titleSm,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
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
  createButtonText: {
    ...TypeScale.titleSm,
    color: "#FFFFFF",
    fontWeight: FontWeight.extrabold,
  },
});
