import { MaterialIcons } from "@expo/vector-icons";
import React from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
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
      <KeyboardAvoidingView
        style={[styles.modalBackdrop, { backgroundColor: colors.modalOverlay }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[styles.joinKeyModalSheet, { backgroundColor: colors.card }]}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                Join with private key
              </Text>
              <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
                Paste the key shared by the group creator.
              </Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={onClose}
              style={[styles.modalClose, { backgroundColor: colors.inputBackground }]}
            >
              <MaterialIcons color={colors.textSecondary} name="close" size={22} />
            </TouchableOpacity>
          </View>

          <TextInput
            autoCapitalize="characters"
            onChangeText={(value) => {
              onJoinKeyChange(normalizeGroupJoinKey(value));
              onClearFeedback();
            }}
            placeholder="Enter private key"
            placeholderTextColor={colors.inputPlaceholder}
            style={[
              styles.modalInput,
              {
                backgroundColor: colors.card,
                borderColor: colors.inputBorder,
                color: colors.textPrimary,
              },
            ]}
            value={joinKeyValue}
          />

          <TouchableOpacity
            activeOpacity={0.9}
            disabled={joining}
            onPress={onJoinPress}
            style={[
              styles.createButton,
              { backgroundColor: colors.accent },
              joining && styles.createButtonDisabled,
            ]}
          >
            <Text style={[styles.createButtonText, { color: colors.buttonTextOnAction }]}>
              {joining ? "Joining..." : "Join group"}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
  modalInput: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    ...TypeScale.titleSm,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
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
