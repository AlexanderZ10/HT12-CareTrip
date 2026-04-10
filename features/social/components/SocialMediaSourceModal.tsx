import { MaterialIcons } from "@expo/vector-icons";
import React from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { useAppTheme } from "../../../components/app-theme-provider";
import {
  FontWeight,
  Radius,
  Spacing,
  TypeScale,
  shadow,
} from "../../../constants/design-system";

type SocialMediaSourceModalProps = {
  visible: boolean;
  loading?: boolean;
  onChooseLibrary: () => void;
  onClose: () => void;
  onTakePhoto: () => void;
};

export function SocialMediaSourceModal({
  visible,
  loading = false,
  onChooseLibrary,
  onClose,
  onTakePhoto,
}: SocialMediaSourceModalProps) {
  const { colors } = useAppTheme();

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
        <TouchableOpacity activeOpacity={1} onPress={onClose} style={StyleSheet.absoluteFillObject} />
        <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Create something new</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Start with a fresh camera shot or choose a photo from your gallery.
          </Text>

          <TouchableOpacity
            activeOpacity={0.9}
            disabled={loading}
            onPress={onTakePhoto}
            style={[styles.action, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}
          >
            <View style={[styles.iconWrap, { backgroundColor: colors.accentMuted }]}>
              <MaterialIcons name="photo-camera" size={20} color={colors.accent} />
            </View>
            <View style={styles.textWrap}>
              <Text style={[styles.actionTitle, { color: colors.textPrimary }]}>Take photo</Text>
              <Text style={[styles.actionText, { color: colors.textSecondary }]}>
                Open the camera and snap something right now.
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.9}
            disabled={loading}
            onPress={onChooseLibrary}
            style={[styles.action, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}
          >
            <View style={[styles.iconWrap, { backgroundColor: colors.accentMuted }]}>
              <MaterialIcons name="photo-library" size={20} color={colors.accent} />
            </View>
            <View style={styles.textWrap}>
              <Text style={[styles.actionTitle, { color: colors.textPrimary }]}>Choose photo</Text>
              <Text style={[styles.actionText, { color: colors.textSecondary }]}>
                Pick one from your library and keep moving.
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    padding: Spacing.lg,
  },
  sheet: {
    borderRadius: Radius["3xl"],
    borderWidth: 1,
    padding: Spacing.lg,
    ...shadow("lg"),
  },
  title: {
    ...TypeScale.headingMd,
  },
  subtitle: {
    ...TypeScale.bodyMd,
    marginTop: Spacing.xs,
  },
  action: {
    alignItems: "center",
    borderRadius: Radius.xl,
    borderWidth: 1,
    flexDirection: "row",
    marginTop: Spacing.md,
    padding: Spacing.md,
  },
  iconWrap: {
    alignItems: "center",
    borderRadius: Radius.lg,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  textWrap: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  actionTitle: {
    ...TypeScale.titleSm,
    fontWeight: FontWeight.extrabold,
  },
  actionText: {
    ...TypeScale.bodySm,
    marginTop: 2,
  },
});
