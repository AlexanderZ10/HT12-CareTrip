import { MaterialIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Avatar } from "../../../components/Avatar";
import { useAppTheme } from "../../../components/app-theme-provider";
import {
  FontWeight,
  Radius,
  Spacing,
  TypeScale,
} from "../../../constants/design-system";
import type { PublicProfile } from "../../../utils/public-profiles";
import type { SocialPost } from "../../../utils/social";

type SocialPostCardProps = {
  actionDisabled?: boolean;
  actionLabel?: string;
  authorProfile?: PublicProfile;
  badge?: string;
  loading?: boolean;
  onActionPress?: () => void;
  post: SocialPost;
  timestampLabel: string;
};

export function SocialPostCard({
  actionDisabled = false,
  actionLabel,
  authorProfile,
  badge,
  loading = false,
  onActionPress,
  post,
  timestampLabel,
}: SocialPostCardProps) {
  const { colors } = useAppTheme();
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showFullCaption, setShowFullCaption] = useState(false);

  const profilePhotoUrl = authorProfile?.photoUrl || authorProfile?.avatarUrl || "";
  const handle = post.authorUsername || post.authorLabel.toLowerCase().replace(/\s+/g, "_");
  const captionTooLong = post.caption.length > 120;
  const displayCaption =
    captionTooLong && !showFullCaption ? `${post.caption.slice(0, 120).trim()}…` : post.caption;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* ─── Header: avatar, username, location, action ─── */}
      <View style={styles.header}>
        <Avatar label={post.authorLabel} photoUrl={profilePhotoUrl} size={36} />
        <View style={styles.headerText}>
          <View style={styles.usernameRow}>
            <Text numberOfLines={1} style={[styles.username, { color: colors.textPrimary }]}>
              {handle}
            </Text>
            {badge ? (
              <View style={[styles.badge, { backgroundColor: colors.accentMuted }]}>
                <Text style={[styles.badgeText, { color: colors.accentText }]}>{badge}</Text>
              </View>
            ) : null}
          </View>
          {post.location ? (
            <Text numberOfLines={1} style={[styles.location, { color: colors.textSecondary }]}>
              {post.location}
            </Text>
          ) : null}
        </View>

        {actionLabel && onActionPress ? (
          <TouchableOpacity
            activeOpacity={0.9}
            disabled={actionDisabled || loading}
            onPress={onActionPress}
            style={[
              styles.followButton,
              {
                backgroundColor:
                  actionDisabled || loading ? colors.disabledBackground : colors.accent,
              },
            ]}
          >
            <Text
              style={[
                styles.followButtonText,
                {
                  color:
                    actionDisabled || loading
                      ? colors.disabledText
                      : colors.buttonTextOnAction,
                },
              ]}
            >
              {loading ? "..." : actionLabel}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity activeOpacity={0.7} style={styles.moreButton}>
            <MaterialIcons name="more-horiz" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* ─── Image (full-bleed, square aspect ratio like Instagram) ─── */}
      {post.imageUri ? (
        <View style={[styles.imageWrap, { backgroundColor: colors.cardAlt }]}>
          <Image
            source={{ uri: post.imageUri }}
            style={styles.image}
            contentFit="cover"
            transition={200}
          />
        </View>
      ) : null}

      {/* ─── Action row: like, comment, share, save ─── */}
      <View style={styles.actionRow}>
        <View style={styles.actionLeft}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setLiked((current) => !current)}
            style={styles.actionIcon}
          >
            <MaterialIcons
              name={liked ? "favorite" : "favorite-border"}
              size={26}
              color={liked ? "#E0245E" : colors.textPrimary}
            />
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.7} style={styles.actionIcon}>
            <MaterialIcons name="chat-bubble-outline" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.7} style={styles.actionIcon}>
            <MaterialIcons name="send" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setSaved((current) => !current)}
          style={styles.actionIcon}
        >
          <MaterialIcons
            name={saved ? "bookmark" : "bookmark-border"}
            size={26}
            color={colors.textPrimary}
          />
        </TouchableOpacity>
      </View>

      {/* ─── Likes count (placeholder for now) ─── */}
      {liked ? (
        <Text style={[styles.likesCount, { color: colors.textPrimary }]}>1 like</Text>
      ) : null}

      {/* ─── Caption: bold username + text ─── */}
      {post.caption ? (
        <Text style={[styles.caption, { color: colors.textPrimary }]}>
          <Text style={styles.captionUsername}>{handle} </Text>
          {displayCaption}
          {captionTooLong && !showFullCaption ? (
            <Text
              style={[styles.captionMore, { color: colors.textSecondary }]}
              onPress={() => setShowFullCaption(true)}
            >
              {" "}more
            </Text>
          ) : null}
        </Text>
      ) : null}

      {/* ─── Timestamp ─── */}
      <Text style={[styles.timestamp, { color: colors.textMuted }]}>
        {timestampLabel.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginHorizontal: -Spacing.xl, // bleed to screen edges Instagram-style
    marginBottom: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
  },
  headerText: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  usernameRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.sm,
  },
  username: {
    ...TypeScale.titleSm,
    fontWeight: FontWeight.bold,
  },
  location: {
    ...TypeScale.labelLg,
    marginTop: 1,
  },
  badge: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  badgeText: {
    ...TypeScale.labelSm,
    fontWeight: FontWeight.extrabold,
  },
  followButton: {
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
  },
  followButtonText: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
  },
  moreButton: {
    padding: 4,
  },
  imageWrap: {
    aspectRatio: 1,
    width: "100%",
  },
  image: {
    height: "100%",
    width: "100%",
  },
  actionRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm + 2,
    paddingBottom: Spacing.xs,
  },
  actionLeft: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.md,
  },
  actionIcon: {
    padding: 2,
  },
  likesCount: {
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.bold,
    paddingHorizontal: Spacing.md,
    paddingTop: 2,
  },
  caption: {
    ...TypeScale.bodyMd,
    paddingHorizontal: Spacing.md,
    paddingTop: 4,
  },
  captionUsername: {
    fontWeight: FontWeight.bold,
  },
  captionMore: {
    ...TypeScale.bodyMd,
  },
  timestamp: {
    ...TypeScale.labelSm,
    paddingHorizontal: Spacing.md,
    paddingTop: 6,
  },
});
