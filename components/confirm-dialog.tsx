import React from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { useAppTheme } from "./app-theme-provider";

type ConfirmDialogProps = {
  cancelLabel?: string;
  confirmLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  visible: boolean;
};

export function ConfirmDialog({
  cancelLabel = "Cancel",
  confirmLabel = "Delete",
  destructive = false,
  loading = false,
  message,
  onCancel,
  onConfirm,
  title,
  visible,
}: ConfirmDialogProps) {
  const { colors } = useAppTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <Pressable style={[styles.overlay, { backgroundColor: colors.modalOverlay }]} onPress={onCancel}>
        <Pressable style={[styles.card, { backgroundColor: colors.card }]} onPress={(event) => event.stopPropagation()}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
          <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton, { backgroundColor: colors.cardAlt }]}
              onPress={onCancel}
              disabled={loading}
              activeOpacity={0.9}
            >
              <Text style={[styles.cancelLabel, { color: colors.textSecondary }]}>{cancelLabel}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.button,
                {
                  backgroundColor: destructive
                    ? colors.destructive
                    : colors.primaryAction,
                },
                loading && styles.buttonDisabled,
              ]}
              onPress={onConfirm}
              disabled={loading}
              activeOpacity={0.9}
            >
              {loading ? (
                <ActivityIndicator size="small" color={colors.buttonTextOnAction} />
              ) : (
                <Text style={[styles.confirmLabel, { color: colors.buttonTextOnAction }]}>{confirmLabel}</Text>
              )}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 24,
    padding: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 8,
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
  },
  actions: {
    flexDirection: "row",
    marginTop: 18,
  },
  button: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButton: {
    marginRight: 10,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  cancelLabel: {
    fontSize: 15,
    fontWeight: "700",
  },
  confirmLabel: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
});
