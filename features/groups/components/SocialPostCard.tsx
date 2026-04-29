import { MaterialIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { Avatar } from "../../../components/Avatar";
import { useAppLanguage } from "../../../components/app-language-provider";
import { useAppTheme } from "../../../components/app-theme-provider";
import {
  FontWeight,
  Radius,
  Spacing,
  TypeScale,
} from "../../../constants/design-system";
import type { PublicProfile } from "../../../utils/public-profiles";
import type { SocialPost, SocialPostComment } from "../../../utils/social";

type SocialPostCardProps = {
  actionDisabled?: boolean;
  actionLabel?: string;
  authorProfile?: PublicProfile;
  badge?: string;
  commentAuthorProfiles?: Record<string, PublicProfile>;
  commentError?: string;
  comments?: SocialPostComment[];
  commenting?: boolean;
  currentUserLabel?: string;
  currentUserPhotoUrl?: string;
  loading?: boolean;
  onActionPress?: () => void;
  onCommentSubmit?: (text: string) => Promise<boolean> | boolean | void;
  post: SocialPost;
  timestampLabel: string;
};

function getCommentLabels(language: "bg" | "en" | "de" | "es" | "fr") {
  if (language === "bg") {
    return {
      add: "Добави коментар...",
      comments: (count: number) => `${count} коментар${count === 1 ? "" : "а"}`,
      more: "още",
      post: "Публикувай",
      previous: (count: number) =>
        count === 1 ? "Виж предишния коментар" : `Виж още ${count} коментара`,
      send: "Изпрати",
      sending: "Изпраща се...",
      showLess: "Скрий коментарите",
      view: (count: number) => `Виж ${count} коментар${count === 1 ? "" : "а"}`,
    };
  }

  if (language === "de") {
    return {
      add: "Kommentar schreiben...",
      comments: (count: number) => `${count} Kommentar${count === 1 ? "" : "e"}`,
      more: "mehr",
      post: "Posten",
      previous: (count: number) =>
        count === 1 ? "Vorherigen Kommentar ansehen" : `${count} weitere Kommentare ansehen`,
      send: "Senden",
      sending: "Wird gesendet...",
      showLess: "Kommentare ausblenden",
      view: (count: number) => `${count} Kommentar${count === 1 ? "" : "e"} ansehen`,
    };
  }

  if (language === "es") {
    return {
      add: "Anade un comentario...",
      comments: (count: number) => `${count} comentario${count === 1 ? "" : "s"}`,
      more: "mas",
      post: "Publicar",
      previous: (count: number) =>
        count === 1 ? "Ver comentario anterior" : `Ver ${count} comentarios mas`,
      send: "Enviar",
      sending: "Enviando...",
      showLess: "Ocultar comentarios",
      view: (count: number) => `Ver ${count} comentario${count === 1 ? "" : "s"}`,
    };
  }

  if (language === "fr") {
    return {
      add: "Ajouter un commentaire...",
      comments: (count: number) => `${count} commentaire${count === 1 ? "" : "s"}`,
      more: "plus",
      post: "Publier",
      previous: (count: number) =>
        count === 1 ? "Voir le commentaire precedent" : `Voir ${count} commentaires de plus`,
      send: "Envoyer",
      sending: "Envoi...",
      showLess: "Masquer les commentaires",
      view: (count: number) => `Voir ${count} commentaire${count === 1 ? "" : "s"}`,
    };
  }

  return {
    add: "Add a comment...",
    comments: (count: number) => `${count} comment${count === 1 ? "" : "s"}`,
    more: "more",
    post: "Post",
    previous: (count: number) =>
      count === 1 ? "View previous comment" : `View ${count} more comments`,
    send: "Send",
    sending: "Sending...",
    showLess: "Hide comments",
    view: (count: number) => `View ${count} comment${count === 1 ? "" : "s"}`,
  };
}

export function SocialPostCard({
  actionDisabled = false,
  actionLabel,
  authorProfile,
  badge,
  commentAuthorProfiles = {},
  commentError,
  comments = [],
  commenting = false,
  currentUserLabel = "You",
  currentUserPhotoUrl = "",
  loading = false,
  onActionPress,
  onCommentSubmit,
  post,
  timestampLabel,
}: SocialPostCardProps) {
  const { colors } = useAppTheme();
  const { language } = useAppLanguage();
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentsExpanded, setCommentsExpanded] = useState(false);
  const [showFullCaption, setShowFullCaption] = useState(false);
  const commentInputRef = useRef<TextInput>(null);

  const profilePhotoUrl = authorProfile?.photoUrl || authorProfile?.avatarUrl || "";
  const handle = post.authorUsername || post.authorLabel.toLowerCase().replace(/\s+/g, "_");
  const captionTooLong = post.caption.length > 120;
  const displayCaption =
    captionTooLong && !showFullCaption ? `${post.caption.slice(0, 120).trim()}…` : post.caption;
  const labels = getCommentLabels(language);
  const visibleComments = commentsExpanded ? comments : [];
  const hiddenCommentCount = Math.max(comments.length - visibleComments.length, 0);
  const canPostComment = commentDraft.trim().length > 0 && !commenting && !!onCommentSubmit;
  const submitComment = async () => {
    if (!canPostComment || !onCommentSubmit) {
      return;
    }

    const submitted = await onCommentSubmit(commentDraft);

    if (submitted !== false) {
      setCommentDraft("");
      setCommentsExpanded(true);
    }
  };

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
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              setCommentsExpanded(true);
              setTimeout(() => commentInputRef.current?.focus(), 0);
            }}
            style={styles.actionIcon}
          >
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

      {comments.length > 0 ? (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setCommentsExpanded((current) => !current)}
        >
          <Text style={[styles.commentsSummary, { color: colors.textSecondary }]}>
            {commentsExpanded ? labels.showLess : labels.view(comments.length)}
          </Text>
        </TouchableOpacity>
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
              {" "}{labels.more}
            </Text>
          ) : null}
        </Text>
      ) : null}

      {visibleComments.length > 0 ? (
        <View style={styles.commentsList}>
          {hiddenCommentCount > 0 ? (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setCommentsExpanded(true)}
            >
              <Text style={[styles.previousCommentsText, { color: colors.textSecondary }]}>
                {labels.previous(hiddenCommentCount)}
              </Text>
            </TouchableOpacity>
          ) : null}
          {visibleComments.map((comment) => {
            const commentProfile = commentAuthorProfiles[comment.authorId];
            const commentLabel = commentProfile?.displayName || comment.authorLabel;
            const commentPhotoUrl =
              commentProfile?.photoUrl || commentProfile?.avatarUrl || "";
            const commentHandle =
              commentProfile?.username ||
              comment.authorUsername ||
              commentLabel.toLowerCase().replace(/\s+/g, "_");
            const pending = comment.id.startsWith("local-");

            return (
              <View key={comment.id} style={styles.commentRow}>
                <Avatar label={commentLabel} photoUrl={commentPhotoUrl} size={26} />
                <View style={[styles.commentBubble, { backgroundColor: colors.cardAlt }]}>
                  <Text style={[styles.commentText, { color: colors.textPrimary }]}>
                    <Text style={styles.captionUsername}>{commentHandle} </Text>
                    {comment.text}
                  </Text>
                  {pending ? (
                    <Text style={[styles.commentPendingText, { color: colors.textMuted }]}>
                      {labels.sending}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      {onCommentSubmit ? (
        <View style={[styles.commentComposer, { borderTopColor: colors.border }]}>
          <View style={styles.commentComposerRow}>
            <Avatar label={currentUserLabel} photoUrl={currentUserPhotoUrl} size={28} />
            <View
              style={[
                styles.commentInputShell,
                { backgroundColor: colors.inputBackground, borderColor: colors.border },
              ]}
            >
              <TextInput
                accessibilityLabel={labels.add}
                editable={!commenting}
                onChangeText={setCommentDraft}
                onFocus={() => setCommentsExpanded(true)}
                onSubmitEditing={() => {
                  void submitComment();
                }}
                placeholder={labels.add}
                placeholderTextColor={colors.textMuted}
                returnKeyType="send"
                ref={commentInputRef}
                style={[styles.commentInput, { color: colors.textPrimary }]}
                value={commentDraft}
              />
              <TouchableOpacity
                accessibilityLabel={labels.send}
                activeOpacity={0.8}
                disabled={!canPostComment}
                onPress={() => {
                  void submitComment();
                }}
                style={[
                  styles.commentPostButton,
                  {
                    backgroundColor: canPostComment ? colors.accent : colors.cardAlt,
                  },
                ]}
              >
                {commenting ? (
                  <ActivityIndicator color={colors.buttonTextOnAction} size="small" />
                ) : (
                  <MaterialIcons
                    name="arrow-upward"
                    size={18}
                    color={canPostComment ? colors.buttonTextOnAction : colors.textMuted}
                  />
                )}
              </TouchableOpacity>
            </View>
          </View>
          {commentError ? (
            <Text style={[styles.commentErrorText, { color: colors.errorText }]}>
              {commentError}
            </Text>
          ) : null}
        </View>
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
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
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
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xs,
  },
  actionLeft: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.lg,
  },
  actionIcon: {
    padding: 3,
  },
  likesCount: {
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.bold,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
  },
  commentsSummary: {
    ...TypeScale.bodyMd,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
  },
  caption: {
    ...TypeScale.bodyMd,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
    lineHeight: 21,
  },
  captionUsername: {
    fontWeight: FontWeight.bold,
  },
  captionMore: {
    ...TypeScale.bodyMd,
  },
  commentsList: {
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  previousCommentsText: {
    ...TypeScale.bodySm,
    paddingBottom: 2,
  },
  commentRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: Spacing.sm,
  },
  commentBubble: {
    borderRadius: Radius.lg,
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  commentText: {
    ...TypeScale.bodyMd,
    lineHeight: 20,
  },
  commentPendingText: {
    ...TypeScale.labelSm,
    marginTop: 2,
  },
  commentComposer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  commentComposerRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.sm,
  },
  commentInputShell: {
    alignItems: "center",
    borderRadius: Radius.full,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    minHeight: 40,
    paddingLeft: Spacing.md,
    paddingRight: 4,
  },
  commentInput: {
    ...TypeScale.bodyMd,
    flex: 1,
    minHeight: 38,
    paddingVertical: 6,
  },
  commentPostButton: {
    alignItems: "center",
    borderRadius: Radius.full,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  commentErrorText: {
    ...TypeScale.labelLg,
    marginLeft: 36,
    marginTop: Spacing.xs,
  },
  timestamp: {
    ...TypeScale.labelSm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
});
