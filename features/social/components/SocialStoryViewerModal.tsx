import { MaterialIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { getAvatarColor, getInitials } from "../../../components/Avatar";
import {
  FontWeight,
  Radius,
  Spacing,
  TypeScale,
} from "../../../constants/design-system";

export type SocialStoryViewerData = {
  authorLabel: string;
  authorUsername?: string;
  avatarUrl?: string;
  caption?: string;
  imageUri: string;
  isCurrentUser?: boolean;
  location?: string;
  timestampLabel?: string;
};

type SocialStoryViewerModalProps = {
  story: SocialStoryViewerData | null;
  visible: boolean;
  onAddPress?: () => void;
  onClose: () => void;
};

export function SocialStoryViewerModal({
  story,
  visible,
  onAddPress,
  onClose,
}: SocialStoryViewerModalProps) {
  if (!story) {
    return null;
  }

  const authorHandle = story.authorUsername ? `@${story.authorUsername}` : "";
  const subtitle = [authorHandle, story.timestampLabel].filter(Boolean).join(" • ");
  const footer = [story.location, story.caption].filter(Boolean).join(" • ");

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity activeOpacity={1} onPress={onClose} style={StyleSheet.absoluteFillObject} />

        <View style={styles.viewer}>
          <Image source={{ uri: story.imageUri }} style={styles.storyImage} contentFit="cover" />

          <View style={styles.topOverlay}>
            <View style={styles.headerRow}>
              <View style={styles.authorRow}>
                <View
                  style={[
                    styles.avatar,
                    { backgroundColor: getAvatarColor(story.authorLabel || "Story") },
                  ]}
                >
                  {story.avatarUrl ? (
                    <Image source={{ uri: story.avatarUrl }} style={styles.avatarImage} contentFit="cover" />
                  ) : (
                    <Text style={styles.avatarText}>{getInitials(story.authorLabel || "Story")}</Text>
                  )}
                </View>

                <View style={styles.authorTextWrap}>
                  <Text numberOfLines={1} style={styles.authorName}>
                    {story.authorLabel}
                  </Text>
                  {subtitle ? (
                    <Text numberOfLines={1} style={styles.authorMeta}>
                      {subtitle}
                    </Text>
                  ) : null}
                </View>
              </View>

              <View style={styles.headerActions}>
                {story.isCurrentUser ? (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={onAddPress}
                    style={[styles.headerButton, styles.addButton]}
                  >
                    <MaterialIcons name="add" size={18} color="#FFFFFF" />
                  </TouchableOpacity>
                ) : null}

                <TouchableOpacity activeOpacity={0.85} onPress={onClose} style={styles.headerButton}>
                  <MaterialIcons name="close" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {footer ? (
            <View style={styles.bottomOverlay}>
              <Text style={styles.footerText}>{footer}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.92)",
    flex: 1,
    justifyContent: "center",
    padding: Spacing.lg,
  },
  viewer: {
    borderRadius: Radius["3xl"],
    overflow: "hidden",
    width: "100%",
    aspectRatio: 9 / 16,
    backgroundColor: "#0E1014",
  },
  storyImage: {
    height: "100%",
    width: "100%",
  },
  topOverlay: {
    left: 0,
    padding: Spacing.lg,
    position: "absolute",
    right: 0,
    top: 0,
  },
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  authorRow: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    paddingRight: Spacing.md,
  },
  avatar: {
    alignItems: "center",
    borderRadius: Radius.full,
    height: 38,
    justifyContent: "center",
    overflow: "hidden",
    width: 38,
  },
  avatarImage: {
    height: "100%",
    width: "100%",
  },
  avatarText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: FontWeight.extrabold,
  },
  authorTextWrap: {
    flex: 1,
    marginLeft: Spacing.sm,
  },
  authorName: {
    ...TypeScale.titleSm,
    color: "#FFFFFF",
    fontWeight: FontWeight.extrabold,
  },
  authorMeta: {
    ...TypeScale.bodySm,
    color: "#D4D7DD",
    marginTop: 2,
  },
  headerActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.sm,
  },
  headerButton: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    borderRadius: Radius.full,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  addButton: {
    backgroundColor: "rgba(32, 127, 89, 0.88)",
  },
  bottomOverlay: {
    backgroundColor: "rgba(0, 0, 0, 0.36)",
    bottom: 0,
    left: 0,
    padding: Spacing.lg,
    position: "absolute",
    right: 0,
  },
  footerText: {
    ...TypeScale.bodyMd,
    color: "#FFFFFF",
    fontWeight: FontWeight.semibold,
  },
});
