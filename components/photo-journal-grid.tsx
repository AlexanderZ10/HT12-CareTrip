import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  FontWeight,
  Radius,
  Spacing,
  TypeScale,
} from "../constants/design-system";
import type { JournalPhoto } from "../utils/photo-journal";
import { useAppTheme } from "./app-theme-provider";
import { PhotoStoryViewer } from "./photo-story-viewer";

// ── Types ────────────────────────────────────────────────────────────────────

type PhotoJournalGridProps = {
  photos: JournalPhoto[];
  onAddPress?: () => void;
  onDelete?: (photo: JournalPhoto) => void;
  currentUserId?: string;
};

type StoryGroup = {
  creatorId: string;
  creatorLabel: string;
  latestImageUri: string;
  photos: JournalPhoto[];
  hasUnseen: boolean;
};

// ── Constants ────────────────────────────────────────────────────────────────

const RING_SIZE = 72;
const AVATAR_SIZE = 64;
const RING_BORDER = 3;

// ── Helpers ──────────────────────────────────────────────────────────────────

function groupPhotosByCreator(photos: JournalPhoto[]): StoryGroup[] {
  const map = new Map<string, JournalPhoto[]>();

  for (const photo of photos) {
    const existing = map.get(photo.creatorId) ?? [];
    existing.push(photo);
    map.set(photo.creatorId, existing);
  }

  const groups: StoryGroup[] = [];

  for (const [creatorId, creatorPhotos] of map) {
    // Sort newest first within each creator
    creatorPhotos.sort((a, b) => b.createdAtMs - a.createdAtMs);

    groups.push({
      creatorId,
      creatorLabel: creatorPhotos[0].creatorLabel,
      latestImageUri: creatorPhotos[0].imageUri,
      photos: creatorPhotos,
      hasUnseen: true, // Could track seen state with AsyncStorage
    });
  }

  // Sort groups by most recent photo
  groups.sort((a, b) => b.photos[0].createdAtMs - a.photos[0].createdAtMs);
  return groups;
}

// ── Component ────────────────────────────────────────────────────────────────

export function PhotoJournalGrid({
  photos,
  onAddPress,
  onDelete,
  currentUserId,
}: PhotoJournalGridProps) {
  const { colors } = useAppTheme();
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerPhotos, setViewerPhotos] = useState<JournalPhoto[]>([]);
  const [viewerInitialIndex, setViewerInitialIndex] = useState(0);

  const storyGroups = useMemo(() => groupPhotosByCreator(photos), [photos]);

  const openStory = (group: StoryGroup) => {
    setViewerPhotos(group.photos);
    setViewerInitialIndex(0);
    setViewerVisible(true);
  };

  const handleDeleteFromViewer = (photo: JournalPhoto) => {
    onDelete?.(photo);
    // Remove from viewer list
    setViewerPhotos((current) => {
      const next = current.filter((p) => p.id !== photo.id);
      if (next.length === 0) {
        setViewerVisible(false);
      }
      return next;
    });
  };

  return (
    <>
      {/* Story circles row (Instagram-style) */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.storyRow}
      >
        {/* Add story button */}
        {onAddPress && (
          <Pressable onPress={onAddPress} style={styles.storyItem}>
            <View
              style={[
                styles.addRing,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.cardAlt,
                },
              ]}
            >
              <Ionicons name="add" size={28} color={colors.accent} />
            </View>
            <Text
              style={[styles.storyLabel, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              Add
            </Text>
          </Pressable>
        )}

        {/* Story groups */}
        {storyGroups.map((group) => (
          <Pressable
            key={group.creatorId}
            onPress={() => openStory(group)}
            style={styles.storyItem}
          >
            <View
              style={[
                styles.storyRing,
                {
                  borderColor: group.hasUnseen
                    ? colors.accent
                    : colors.border,
                },
              ]}
            >
              <Image
                source={{ uri: group.latestImageUri }}
                style={styles.storyAvatar}
                contentFit="cover"
                transition={150}
              />
            </View>
            <Text
              style={[styles.storyLabel, { color: colors.textPrimary }]}
              numberOfLines={1}
            >
              {group.creatorLabel}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Recent photos grid below */}
      {photos.length > 0 && (
        <View style={styles.recentSection}>
          <Text style={[styles.recentTitle, { color: colors.textMuted }]}>
            RECENT
          </Text>
          <View style={styles.recentGrid}>
            {photos.slice(0, 9).map((photo, index) => (
              <Pressable
                key={photo.id}
                onPress={() => {
                  setViewerPhotos(photos);
                  setViewerInitialIndex(index);
                  setViewerVisible(true);
                }}
                style={({ pressed }) => [
                  styles.recentCell,
                  {
                    backgroundColor: colors.skeleton,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                <Image
                  source={{ uri: photo.imageUri }}
                  style={StyleSheet.absoluteFillObject}
                  contentFit="cover"
                  transition={150}
                />
                {photo.caption !== "" && (
                  <View style={styles.recentOverlay}>
                    <Text style={styles.recentCaption} numberOfLines={1}>
                      {photo.caption}
                    </Text>
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* Story viewer modal */}
      <PhotoStoryViewer
        visible={viewerVisible}
        photos={viewerPhotos}
        initialIndex={viewerInitialIndex}
        onClose={() => setViewerVisible(false)}
        onDelete={onDelete ? handleDeleteFromViewer : undefined}
        currentUserId={currentUserId}
      />
    </>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  storyRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  storyItem: {
    alignItems: "center",
    width: RING_SIZE + 4,
  },
  storyRing: {
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: RING_BORDER,
    padding: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  storyAvatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  addRing: {
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 2,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  storyLabel: {
    marginTop: Spacing.xs,
    ...TypeScale.labelSm,
    fontWeight: FontWeight.medium,
    textAlign: "center",
  },
  recentSection: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  recentTitle: {
    ...TypeScale.labelSm,
    fontWeight: FontWeight.bold,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: Spacing.sm,
  },
  recentGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 2,
  },
  recentCell: {
    width: "32.8%",
    aspectRatio: 1,
    borderRadius: Radius.sm,
    overflow: "hidden",
  },
  recentOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  recentCaption: {
    color: "#FFFFFF",
    ...TypeScale.labelSm,
    fontWeight: FontWeight.medium,
  },
});
