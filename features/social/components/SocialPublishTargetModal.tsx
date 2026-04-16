import { MaterialIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React from "react";
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { useAppTheme } from "../../../components/app-theme-provider";
import {
  FontWeight,
  Radius,
  Spacing,
  TypeScale,
  shadow,
} from "../../../constants/design-system";

type SocialPublishTargetModalProps = {
  imageUri: string;
  loading?: boolean;
  visible: boolean;
  onClose: () => void;
  onChoosePost: () => void;
  onChooseStory: () => void;
};

export function SocialPublishTargetModal({
  imageUri,
  loading = false,
  visible,
  onClose,
  onChoosePost,
  onChooseStory,
}: SocialPublishTargetModalProps) {
  const { colors } = useAppTheme();

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
        <TouchableOpacity activeOpacity={1} onPress={onClose} style={StyleSheet.absoluteFillObject} />
        <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Where should it go?</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Choose whether this photo becomes a story or a feed post.
          </Text>

          <View style={[styles.preview, { backgroundColor: colors.cardAlt }]}>
            <Image source={{ uri: imageUri }} style={styles.previewImage} contentFit="cover" />
          </View>

          <View style={styles.actionsRow}>
            <TouchableOpacity
              activeOpacity={0.9}
              disabled={loading}
              onPress={onChooseStory}
              style={[styles.secondaryAction, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}
            >
              {loading ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <>
                  <MaterialIcons name="auto-stories" size={18} color={colors.accent} />
                  <Text style={[styles.secondaryText, { color: colors.textPrimary }]}>Story</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.9}
              disabled={loading}
              onPress={onChoosePost}
              style={[styles.primaryAction, { backgroundColor: colors.accent }]}
            >
              {loading ? (
                <ActivityIndicator size="small" color={colors.buttonTextOnAction} />
              ) : (
                <>
                  <MaterialIcons name="dynamic-feed" size={18} color={colors.buttonTextOnAction} />
                  <Text style={[styles.primaryText, { color: colors.buttonTextOnAction }]}>Post</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
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
  preview: {
    borderRadius: Radius.xl,
    marginTop: Spacing.lg,
    overflow: "hidden",
  },
  previewImage: {
    aspectRatio: 4 / 5,
    width: "100%",
  },
  actionsRow: {
    flexDirection: "row",
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  secondaryAction: {
    alignItems: "center",
    borderRadius: Radius.full,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: Spacing.sm,
    justifyContent: "center",
    minHeight: 54,
  },
  primaryAction: {
    alignItems: "center",
    borderRadius: Radius.full,
    flex: 1,
    flexDirection: "row",
    gap: Spacing.sm,
    justifyContent: "center",
    minHeight: 54,
  },
  secondaryText: {
    ...TypeScale.titleSm,
    fontWeight: FontWeight.extrabold,
  },
  primaryText: {
    ...TypeScale.titleSm,
    fontWeight: FontWeight.extrabold,
  },
});
