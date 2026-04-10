import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  StatusBar,
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

// ── Constants ────────────────────────────────────────────────────────────────

const STORY_DURATION_MS = 5000;
const SWIPE_DOWN_THRESHOLD = 120;
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

// ── Types ────────────────────────────────────────────────────────────────────

type PhotoStoryViewerProps = {
  visible: boolean;
  photos: JournalPhoto[];
  initialIndex?: number;
  onClose: () => void;
  onDelete?: (photo: JournalPhoto) => void;
  currentUserId?: string;
};

// ── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({
  count,
  activeIndex,
  progress,
}: {
  count: number;
  activeIndex: number;
  progress: Animated.Value;
}) {
  return (
    <View style={styles.progressRow}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.progressTrack}>
          <Animated.View
            style={[
              styles.progressFill,
              i < activeIndex
                ? { flex: 1 }
                : i === activeIndex
                  ? {
                      flex: 0,
                      width: progress.interpolate({
                        inputRange: [0, 1],
                        outputRange: ["0%", "100%"],
                      }),
                    }
                  : { flex: 0, width: 0 },
            ]}
          />
        </View>
      ))}
    </View>
  );
}

// ── Time Formatting ──────────────────────────────────────────────────────────

function formatTimeAgo(ms: number): string {
  if (ms <= 0) return "";

  const now = Date.now();
  const diff = now - ms;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  const date = new Date(ms);
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
}

// ── Main Component ───────────────────────────────────────────────────────────

export function PhotoStoryViewer({
  visible,
  photos,
  initialIndex = 0,
  onClose,
  onDelete,
  currentUserId,
}: PhotoStoryViewerProps) {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const progress = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<Animated.CompositeAnimation | null>(null);
  const translateY = useRef(new Animated.Value(0)).current;
  const isPaused = useRef(false);

  const photo = photos[activeIndex];

  // ── Auto-advance timer ───────────────────────────────────────────────────

  const startTimer = useCallback(() => {
    progress.setValue(0);
    timerRef.current?.stop();
    timerRef.current = Animated.timing(progress, {
      toValue: 1,
      duration: STORY_DURATION_MS,
      useNativeDriver: false,
    });
    timerRef.current.start(({ finished }) => {
      if (finished && !isPaused.current) {
        if (activeIndex < photos.length - 1) {
          setActiveIndex((i) => i + 1);
        } else {
          onClose();
        }
      }
    });
  }, [activeIndex, onClose, photos.length, progress]);

  useEffect(() => {
    if (visible) {
      setActiveIndex(initialIndex);
    }
  }, [visible, initialIndex]);

  useEffect(() => {
    if (visible && photos.length > 0) {
      startTimer();
    }
    return () => {
      timerRef.current?.stop();
    };
  }, [visible, activeIndex, startTimer, photos.length]);

  // ── Swipe down to close ──────────────────────────────────────────────────

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dy) > 10 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: () => {
        timerRef.current?.stop();
      },
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) {
          translateY.setValue(g.dy);
        }
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > SWIPE_DOWN_THRESHOLD) {
          Animated.timing(translateY, {
            toValue: SCREEN_H,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            translateY.setValue(0);
            onClose();
          });
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
          }).start(() => {
            startTimer();
          });
        }
      },
    })
  ).current;

  // ── Tap handlers (left = prev, right = next) ────────────────────────────

  const handleTap = (x: number) => {
    timerRef.current?.stop();

    if (x < SCREEN_W * 0.3) {
      // Left tap → previous
      if (activeIndex > 0) {
        setActiveIndex((i) => i - 1);
      } else {
        startTimer();
      }
    } else {
      // Right tap → next
      if (activeIndex < photos.length - 1) {
        setActiveIndex((i) => i + 1);
      } else {
        onClose();
      }
    }
  };

  // ── Long press to pause ──────────────────────────────────────────────────

  const handleLongPressIn = () => {
    isPaused.current = true;
    timerRef.current?.stop();
  };

  const handleLongPressOut = () => {
    isPaused.current = false;
    startTimer();
  };

  if (!visible || photos.length === 0 || !photo) {
    return null;
  }

  const isOwn = currentUserId ? photo.creatorId === currentUserId : false;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <Animated.View
        style={[
          styles.container,
          {
            transform: [{ translateY }],
            opacity: translateY.interpolate({
              inputRange: [0, SWIPE_DOWN_THRESHOLD * 2],
              outputRange: [1, 0.5],
              extrapolate: "clamp",
            }),
          },
        ]}
        {...panResponder.panHandlers}
      >
        {/* Background image */}
        <Image
          source={{ uri: photo.imageUri }}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
          transition={150}
        />

        {/* Gradient overlay top */}
        <View style={styles.gradientTop} />

        {/* Gradient overlay bottom */}
        <View style={styles.gradientBottom} />

        {/* Tap zones */}
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={(e) => handleTap(e.nativeEvent.locationX)}
          onLongPress={handleLongPressIn}
          onPressOut={handleLongPressOut}
          delayLongPress={200}
        />

        {/* Progress bars */}
        <View style={styles.topSection}>
          <ProgressBar
            count={photos.length}
            activeIndex={activeIndex}
            progress={progress}
          />

          {/* Header: avatar, name, time, close */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarText}>
                  {photo.creatorLabel.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View>
                <Text style={styles.creatorName}>{photo.creatorLabel}</Text>
                <Text style={styles.timeAgo}>
                  {formatTimeAgo(photo.createdAtMs)}
                </Text>
              </View>
            </View>

            <View style={styles.headerRight}>
              {isOwn && onDelete && (
                <Pressable
                  onPress={() => onDelete(photo)}
                  hitSlop={12}
                  style={styles.headerButton}
                >
                  <Ionicons name="trash-outline" size={22} color="#FFFFFF" />
                </Pressable>
              )}
              <Pressable
                onPress={onClose}
                hitSlop={12}
                style={styles.headerButton}
              >
                <Ionicons name="close" size={26} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>
        </View>

        {/* Bottom: caption + location */}
        <View style={styles.bottomSection}>
          {photo.location !== "" && (
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={14} color="#FFFFFF" />
              <Text style={styles.locationText}>{photo.location}</Text>
            </View>
          )}
          {photo.caption !== "" && (
            <Text style={styles.captionText}>{photo.caption}</Text>
          )}
        </View>

        {/* Page indicator */}
        <View style={styles.pageIndicator}>
          <Text style={styles.pageText}>
            {activeIndex + 1} / {photos.length}
          </Text>
        </View>
      </Animated.View>
    </Modal>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  gradientTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 160,
    backgroundColor: "transparent",
    // Simulated gradient with overlay
    borderBottomWidth: 0,
  },
  gradientBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 200,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  topSection: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 54,
    paddingHorizontal: Spacing.md,
    zIndex: 10,
  },
  progressRow: {
    flexDirection: "row",
    gap: 3,
    marginBottom: Spacing.sm,
  },
  progressTrack: {
    flex: 1,
    height: 2.5,
    backgroundColor: "rgba(255,255,255,0.3)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 2,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flex: 1,
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#FFFFFF",
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.bold,
  },
  creatorName: {
    color: "#FFFFFF",
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.semibold,
  },
  timeAgo: {
    color: "rgba(255,255,255,0.7)",
    ...TypeScale.labelSm,
    fontWeight: FontWeight.regular,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  headerButton: {
    padding: Spacing.xs,
  },
  bottomSection: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.lg,
    paddingBottom: 48,
    zIndex: 10,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: Spacing.xs,
  },
  locationText: {
    color: "#FFFFFF",
    ...TypeScale.bodySm,
    fontWeight: FontWeight.medium,
  },
  captionText: {
    color: "#FFFFFF",
    ...TypeScale.bodyLg,
    fontWeight: FontWeight.regular,
    lineHeight: 24,
  },
  pageIndicator: {
    position: "absolute",
    bottom: 16,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    zIndex: 10,
  },
  pageText: {
    color: "rgba(255,255,255,0.7)",
    ...TypeScale.labelSm,
    fontWeight: FontWeight.medium,
  },
});
