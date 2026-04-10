import { MaterialIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React from "react";
import {
  ActivityIndicator,
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
  shadow,
} from "../../../constants/design-system";

type SocialPostComposerModalProps = {
  caption: string;
  imageUri: string;
  loading?: boolean;
  location: string;
  visible: boolean;
  onCaptionChange: (value: string) => void;
  onClose: () => void;
  onLocationChange: (value: string) => void;
  onPublish: () => void;
};

export function SocialPostComposerModal({
  caption,
  imageUri,
  loading = false,
  location,
  visible,
  onCaptionChange,
  onClose,
  onLocationChange,
  onPublish,
}: SocialPostComposerModalProps) {
  const { colors } = useAppTheme();

  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
        <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.header}>
            <View>
              <Text style={[styles.title, { color: colors.textPrimary }]}>Create post</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                Add a short travel caption before you publish.
              </Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={onClose}
              style={[styles.closeButton, { backgroundColor: colors.cardAlt }]}
            >
              <MaterialIcons name="close" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={[styles.preview, { backgroundColor: colors.cardAlt }]}>
            <Image source={{ uri: imageUri }} style={styles.previewImage} contentFit="cover" />
          </View>

          <TextInput
            multiline
            onChangeText={onCaptionChange}
            placeholder="Write a short travel caption"
            placeholderTextColor={colors.inputPlaceholder}
            style={[
              styles.input,
              styles.textarea,
              {
                backgroundColor: colors.inputBackground,
                borderColor: colors.inputBorder,
                color: colors.textPrimary,
              },
            ]}
            textAlignVertical="top"
            value={caption}
          />

          <TextInput
            onChangeText={onLocationChange}
            placeholder="Add a location"
            placeholderTextColor={colors.inputPlaceholder}
            style={[
              styles.input,
              {
                backgroundColor: colors.inputBackground,
                borderColor: colors.inputBorder,
                color: colors.textPrimary,
              },
            ]}
            value={location}
          />

          <TouchableOpacity
            activeOpacity={0.9}
            disabled={loading}
            onPress={onPublish}
            style={[styles.publishButton, { backgroundColor: colors.accent, opacity: loading ? 0.82 : 1 }]}
          >
            {loading ? (
              <ActivityIndicator size="small" color={colors.buttonTextOnAction} />
            ) : (
              <>
                <MaterialIcons name="send" size={18} color={colors.buttonTextOnAction} />
                <Text style={[styles.publishText, { color: colors.buttonTextOnAction }]}>
                  Publish post
                </Text>
              </>
            )}
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
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  title: {
    ...TypeScale.headingMd,
  },
  subtitle: {
    ...TypeScale.bodyMd,
    marginTop: Spacing.xs,
  },
  closeButton: {
    alignItems: "center",
    borderRadius: Radius.full,
    height: 36,
    justifyContent: "center",
    width: 36,
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
  input: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  textarea: {
    minHeight: 120,
  },
  publishButton: {
    alignItems: "center",
    borderRadius: Radius.full,
    flexDirection: "row",
    gap: Spacing.sm,
    justifyContent: "center",
    marginTop: Spacing.lg,
    minHeight: 56,
  },
  publishText: {
    ...TypeScale.titleSm,
    fontWeight: FontWeight.extrabold,
  },
});
