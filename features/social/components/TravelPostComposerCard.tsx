import { MaterialIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { useAppTheme } from "../../../components/app-theme-provider";
import {
  FontWeight,
  Radius,
  Spacing,
  TypeScale,
  shadow,
} from "../../../constants/design-system";

type TravelPostComposerCardProps = {
  caption: string;
  imageUri: string;
  location: string;
  pickingImage: boolean;
  posting: boolean;
  subtitle: string;
  title: string;
  onCaptionChange: (value: string) => void;
  onClearImage: () => void;
  onLocationChange: (value: string) => void;
  onPickImage: () => void;
  onPublish: () => void;
};

export function TravelPostComposerCard({
  caption,
  imageUri,
  location,
  pickingImage,
  posting,
  subtitle,
  title,
  onCaptionChange,
  onClearImage,
  onLocationChange,
  onPickImage,
  onPublish,
}: TravelPostComposerCardProps) {
  const { colors } = useAppTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
      ]}
    >
      <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text>

      <TextInput
        multiline
        onChangeText={onCaptionChange}
        placeholder="What are you seeing, tasting, or planning?"
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

      {imageUri ? (
        <View style={styles.previewWrap}>
          <Image source={{ uri: imageUri }} style={styles.previewImage} contentFit="cover" />
          <TouchableOpacity
            activeOpacity={0.92}
            onPress={onClearImage}
            style={[styles.previewRemoveButton, { backgroundColor: colors.overlay }]}
          >
            <MaterialIcons color="#FFFFFF" name="close" size={18} />
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.actionsRow}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={onPickImage}
          style={[
            styles.secondaryAction,
            {
              backgroundColor: colors.cardAlt,
              borderColor: colors.border,
              opacity: pickingImage ? 0.72 : 1,
            },
          ]}
        >
          <MaterialIcons color={colors.accent} name="photo-library" size={18} />
          <Text style={[styles.secondaryActionText, { color: colors.textPrimary }]}>
            {pickingImage ? "Picking..." : "Choose photo"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.9}
          onPress={onPublish}
          style={[
            styles.primaryAction,
            {
              backgroundColor: colors.accent,
              opacity: posting ? 0.8 : 1,
            },
          ]}
        >
          <MaterialIcons color={colors.buttonTextOnAction} name="send" size={18} />
          <Text style={[styles.primaryActionText, { color: colors.buttonTextOnAction }]}>
            {posting ? "Publishing..." : "Publish post"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius["3xl"],
    borderWidth: 1,
    padding: Spacing.lg,
    ...shadow("sm"),
  },
  title: {
    ...TypeScale.headingMd,
  },
  subtitle: {
    ...TypeScale.bodyMd,
    marginTop: Spacing.xs,
  },
  input: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  textarea: {
    minHeight: 148,
  },
  previewWrap: {
    borderRadius: Radius.xl,
    marginTop: Spacing.lg,
    overflow: "hidden",
    position: "relative",
  },
  previewImage: {
    aspectRatio: 4 / 5,
    width: "100%",
  },
  previewRemoveButton: {
    alignItems: "center",
    borderRadius: Radius.full,
    height: 32,
    justifyContent: "center",
    position: "absolute",
    right: Spacing.md,
    top: Spacing.md,
    width: 32,
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
    minHeight: 58,
    paddingHorizontal: Spacing.lg,
  },
  secondaryActionText: {
    ...TypeScale.titleSm,
    fontWeight: FontWeight.extrabold,
  },
  primaryAction: {
    alignItems: "center",
    borderRadius: Radius.full,
    flex: 1,
    flexDirection: "row",
    gap: Spacing.sm,
    justifyContent: "center",
    minHeight: 58,
    paddingHorizontal: Spacing.lg,
  },
  primaryActionText: {
    ...TypeScale.titleSm,
    fontWeight: FontWeight.extrabold,
  },
});
