import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppLanguage } from "../../components/app-language-provider";
import { useAppTheme } from "../../components/app-theme-provider";
import {
  FontWeight,
  Radius,
  Spacing,
  TypeScale,
} from "../../constants/design-system";
import { SocialPostCard } from "../../features/groups/components/SocialPostCard";
import { useSharedGroupsScreen } from "../../features/groups/GroupsScreenProvider";
import { SocialMediaSourceModal } from "../../features/social/components/SocialMediaSourceModal";
import { SocialPostComposerModal } from "../../features/social/components/SocialPostComposerModal";
import { SocialPublishTargetModal } from "../../features/social/components/SocialPublishTargetModal";
import {
  SocialStoryViewerModal,
  type SocialStoryViewerData,
} from "../../features/social/components/SocialStoryViewerModal";
import { StoryRail } from "../../features/social/components/StoryRail";
import {
  SOCIAL_DOCK_BOTTOM_GAP,
  SOCIAL_DOCK_CONTENT_SPACER,
  SOCIAL_DOCK_HEIGHT,
  SocialTabsDock,
} from "../../features/social/components/SocialTabsDock";
import { SuggestionCard } from "../../features/social/components/SuggestionCard";
import { formatRelativeTime } from "../../utils/formatting";
import { getLanguageLocale } from "../../utils/translations";

const TRAVEL_POST_PATTERN =
  /travel|trip|journey|vacation|holiday|beach|flight|hotel|city|island|road|mountain|camp|museum|food|cafe|airport|destination|път|пъту|море|плаж|полет|хотел|град|планина|остров|дестинац|екскурз|почивк/i;

export default function FeedTabScreen() {
  const { colors } = useAppTheme();
  const { language } = useAppLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const vm = useSharedGroupsScreen();
  const locale = getLanguageLocale(language);
  const [sourceModalVisible, setSourceModalVisible] = useState(false);
  const [targetModalVisible, setTargetModalVisible] = useState(false);
  const [postComposerVisible, setPostComposerVisible] = useState(false);
  const [selectedStory, setSelectedStory] = useState<SocialStoryViewerData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  const RAIL_LIMIT = 10;

  const travelPosts = useMemo(
    () =>
      vm.feedPosts.filter(
        (post) =>
          post.authorId === vm.userId ||
          !!post.imageUri ||
          !!post.location ||
          TRAVEL_POST_PATTERN.test(post.caption)
      ),
    [vm.feedPosts, vm.userId]
  );

  const activeStoriesByAuthorId = useMemo(
    () => new Map(vm.activeStories.map((story) => [story.authorId, story] as const)),
    [vm.activeStories]
  );

  const storyItems = useMemo(() => {
    const currentUserStory = activeStoriesByAuthorId.get(vm.userId);
    const items = [
      {
        hasActiveStory: !!currentUserStory,
        key: "your-story",
        kind: "current" as const,
        label: "Your story",
        photoUrl: currentUserStory?.imageUri || vm.profileAvatarUrl,
      },
      ...vm.friendProfiles
        .filter((friend) => activeStoriesByAuthorId.has(friend.uid))
        .slice(0, 10)
        .map((friend) => ({
          hasActiveStory: true,
          key: `friend-${friend.uid}`,
          kind: "friend" as const,
          label: friend.username || friend.label,
          photoUrl:
            activeStoriesByAuthorId.get(friend.uid)?.imageUri ||
            friend.photoUrl,
        })),
    ];

    return items;
  }, [activeStoriesByAuthorId, vm.friendProfiles, vm.profileAvatarUrl, vm.userId]);

  const openStoryViewer = useCallback(
    (authorId: string) => {
      const story = activeStoriesByAuthorId.get(authorId);

      if (!story) {
        return;
      }

      const authorProfile =
        authorId === vm.userId ? null : vm.publicProfilesById[authorId];

      setSelectedStory({
        authorLabel:
          authorId === vm.userId
            ? "Your story"
            : authorProfile?.displayName || story.authorLabel || "Story",
        authorUsername:
          authorId === vm.userId ? vm.userHandle : authorProfile?.username || story.authorUsername,
        avatarUrl:
          authorId === vm.userId
            ? vm.profileAvatarUrl
            : authorProfile?.photoUrl || authorProfile?.avatarUrl,
        caption: story.caption,
        imageUri: story.imageUri,
        isCurrentUser: authorId === vm.userId,
        location: story.location,
        timestampLabel: formatRelativeTime(story.createdAtMs, locale),
      });
    },
    [activeStoriesByAuthorId, locale, vm.profileAvatarUrl, vm.publicProfilesById, vm.userHandle, vm.userId]
  );

  const dismissPublishModals = () => {
    setSourceModalVisible(false);
    setTargetModalVisible(false);
    setPostComposerVisible(false);
  };

  const closePublishFlow = () => {
    dismissPublishModals();
    vm.resetPostDraft();
  };

  const handleSourcePick = async (source: "camera" | "library") => {
    setSourceModalVisible(false);
    const picked = await vm.pickSocialImage(source);

    if (picked) {
      setTargetModalVisible(true);
    }
  };

  const handlePublishStory = async () => {
    const published = await vm.publishStoryFromDraft();

    if (published) {
      dismissPublishModals();
    }
  };

  const handlePublishPost = async () => {
    const published = await vm.handleCreateSocialPost();

    if (published) {
      dismissPublishModals();
    }
  };

  const renderFeedPost = (post: (typeof travelPosts)[number]) => {
    const profilePreview = vm.buildSocialProfilePreview(post.authorId);
    const connectionState = vm.getConnectionStateForProfile(post.authorId);
    const authorProfile = vm.publicProfilesById[post.authorId];
    let actionLabel: string | undefined;
    let onActionPress: (() => void) | undefined;
    let actionDisabled = false;
    let badge: string | undefined;

    if (post.authorId === vm.userId) {
      badge = "You";
    } else if (connectionState === "mutual" || connectionState === "following") {
      badge = "Following";
    } else if (connectionState === "followed-by") {
      badge = "Follows you";
      actionLabel = "Follow back";
      onActionPress = () => {
        const connection = profilePreview.connection;

        if (connection) {
          void vm.acceptFriendRequest(connection);
        }
      };
    } else if (authorProfile) {
      actionLabel = "Follow";
      onActionPress = () => {
        void vm.sendFriendRequest(authorProfile);
      };
    }

    return (
      <SocialPostCard
        actionDisabled={actionDisabled}
        actionLabel={actionLabel}
        authorProfile={authorProfile}
        badge={badge}
        comments={vm.commentsByPostId[post.id] ?? []}
        commentAuthorProfiles={vm.publicProfilesById}
        commentError={vm.commentErrorsByPostId[post.id]}
        commenting={vm.commentingPostId === post.id}
        currentUserLabel={vm.profileName}
        currentUserPhotoUrl={vm.profileAvatarUrl}
        key={post.id}
        loading={vm.isUpdatingConnectionWithProfile(post.authorId)}
        onActionPress={onActionPress}
        onCommentSubmit={(text) => vm.addSocialPostComment(post.id, text)}
        post={post}
        timestampLabel={formatRelativeTime(post.createdAtMs, locale)}
      />
    );
  };

  const openAllSuggestions = () => {
    router.push("/feed/suggestions");
  };

  const renderSuggestionsRail = () => {
    if (vm.suggestedProfiles.length === 0) {
      return null;
    }

    const hasMore = vm.suggestedProfiles.length > RAIL_LIMIT;

    return (
      <View style={[styles.suggestionsBlock, { borderColor: colors.border }]}>
        <View style={styles.suggestionsHeader}>
          <Text style={[styles.suggestionsTitle, { color: colors.textPrimary }]}>
            Suggested for you
          </Text>
          <TouchableOpacity activeOpacity={0.7} onPress={openAllSuggestions}>
            <Text style={[styles.suggestionsSeeAll, { color: colors.textPrimary }]}>See All</Text>
          </TouchableOpacity>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.suggestionsRail}
        >
          {vm.suggestedProfiles.slice(0, RAIL_LIMIT).map((profile) => {
            const connectionState = vm.getConnectionStateForProfile(profile.uid);

            const actionLabel = vm.getFollowActionLabelForProfile(profile.uid);
            const actionDisabled = connectionState === "following";

            const handle = profile.username
              ? `@${profile.username}`
              : profile.displayName.toLowerCase().replace(/\s+/g, "_");

            return (
              <SuggestionCard
                key={profile.uid}
                actionDisabled={actionDisabled}
                actionLabel={actionLabel}
                handle={handle}
                label={profile.displayName}
                loading={vm.isUpdatingConnectionWithProfile(profile.uid)}
                onActionPress={() => {
                  const connection = vm.buildSocialProfilePreview(profile.uid).connection;

                  if (connectionState === "followed-by" && connection) {
                    void vm.acceptFriendRequest(connection);
                  } else if (connectionState === "none") {
                    void vm.sendFriendRequest(profile);
                  }
                }}
                photoUrl={profile.photoUrl || profile.avatarUrl}
              />
            );
          })}

          {hasMore ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={openAllSuggestions}
              style={[
                styles.seeAllCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={[styles.seeAllIconWrap, { backgroundColor: colors.cardAlt }]}>
                <MaterialIcons name="arrow-forward" size={28} color={colors.textPrimary} />
              </View>
              <Text style={[styles.seeAllCardTitle, { color: colors.textPrimary }]}>See all</Text>
              <Text style={[styles.seeAllCardSubtitle, { color: colors.textSecondary }]}>
                {vm.suggestedProfiles.length} suggestions
              </Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      </View>
    );
  };

  if (vm.loading) {
    return (
      <SafeAreaView
        style={[styles.loader, { backgroundColor: colors.screenSoft }]}
        edges={["top", "left", "right"]}
      >
        <ActivityIndicator size="large" color={colors.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: colors.screenSoft }]}
      edges={["top", "left", "right"]}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 8 : 0}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {
              paddingBottom:
                SOCIAL_DOCK_HEIGHT + SOCIAL_DOCK_BOTTOM_GAP + SOCIAL_DOCK_CONTENT_SPACER,
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* ── Instagram-style minimal topbar: brand title + camera ── */}
          <View style={styles.topBar}>
            <Text style={[styles.brandTitle, { color: colors.textPrimary }]}>CareTrip</Text>
            <TouchableOpacity
              accessibilityLabel="Create new post"
              activeOpacity={0.8}
              onPress={() => {
                setSourceModalVisible(true);
              }}
              style={styles.topBarIconButton}
            >
              <MaterialIcons color={colors.textPrimary} name="add-box" size={28} />
            </TouchableOpacity>
          </View>

          {vm.error ? (
            <View
              style={[
                styles.feedbackCardError,
                { backgroundColor: colors.errorBackground, borderColor: colors.errorBorder },
              ]}
            >
              <Text style={[styles.feedbackText, { color: colors.errorText }]}>{vm.error}</Text>
            </View>
          ) : null}

          {vm.successMessage ? (
            <View
              style={[
                styles.feedbackCardSuccess,
                { backgroundColor: colors.successBackground, borderColor: colors.successBorder },
              ]}
            >
              <Text style={[styles.feedbackText, { color: colors.successText }]}>
                {vm.successMessage}
              </Text>
            </View>
          ) : null}

          {/* ── Instagram-style stories rail (no header, full bleed) ── */}
          <View style={[styles.storiesWrap, { borderBottomColor: colors.border }]}>
            <StoryRail
              items={storyItems}
              onAddPress={() => {
                setSourceModalVisible(true);
              }}
              onPress={(item) => {
                if (item.kind === "current" && !item.hasActiveStory) {
                  setSourceModalVisible(true);
                  return;
                }

                const authorId =
                  item.kind === "current"
                    ? vm.userId
                    : item.key.replace(/^friend-/, "");

                openStoryViewer(authorId);
              }}
            />
          </View>

          {/* ── Posts feed with Instagram-style suggestions injected after 2nd post ── */}
          {travelPosts.length === 0 ? (
            <>
              <View
                style={[
                  styles.emptyState,
                  { backgroundColor: colors.cardAlt, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.emptyStateTitle, { color: colors.textPrimary }]}>
                  No travel posts yet.
                </Text>
                <Text style={[styles.emptyStateText, { color: colors.textSecondary }]}>
                  Publish the first route, city, beach, meal, or trip idea and start the feed.
                </Text>
              </View>
              {renderSuggestionsRail()}
            </>
          ) : (
            travelPosts.map((post, index) => (
              <React.Fragment key={post.id}>
                {renderFeedPost(post)}
                {index === 1 ? renderSuggestionsRail() : null}
              </React.Fragment>
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <SocialTabsDock />
      <SocialMediaSourceModal
        visible={sourceModalVisible}
        loading={vm.pickingPostImage}
        onChooseLibrary={() => {
          void handleSourcePick("library");
        }}
        onClose={closePublishFlow}
        onTakePhoto={() => {
          void handleSourcePick("camera");
        }}
      />
      <SocialPublishTargetModal
        imageUri={vm.postImageUri}
        loading={vm.postingSocialPost}
        visible={targetModalVisible}
        onChoosePost={() => {
          setTargetModalVisible(false);
          setPostComposerVisible(true);
        }}
        onChooseStory={() => {
          void handlePublishStory();
        }}
        onClose={closePublishFlow}
      />
      <SocialPostComposerModal
        caption={vm.postCaption}
        imageUri={vm.postImageUri}
        loading={vm.postingSocialPost}
        location={vm.postLocation}
        visible={postComposerVisible}
        onCaptionChange={(value) => {
          vm.setPostCaption(value);
          vm.clearFeedback();
        }}
        onClose={closePublishFlow}
        onLocationChange={(value) => {
          vm.setPostLocation(value);
          vm.clearFeedback();
        }}
        onPublish={() => {
          void handlePublishPost();
        }}
      />
      <SocialStoryViewerModal
        story={selectedStory}
        visible={!!selectedStory}
        onAddPress={() => {
          setSelectedStory(null);
          setSourceModalVisible(true);
        }}
        onClose={() => {
          setSelectedStory(null);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  loader: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  content: {
    alignSelf: "center",
    maxWidth: 760,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    width: "100%",
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
    minHeight: 48,
  },
  brandTitle: {
    fontSize: 28,
    fontWeight: FontWeight.black,
    letterSpacing: 0.3,
  },
  topBarIconButton: {
    padding: 4,
  },
  storiesWrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: Spacing.sm,
    marginHorizontal: -Spacing.xl,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  feedbackCardError: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginBottom: Spacing.md,
    padding: Spacing.md,
  },
  feedbackCardSuccess: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginBottom: Spacing.md,
    padding: Spacing.md,
  },
  feedbackText: {
    ...TypeScale.bodyMd,
  },
  emptyState: {
    borderRadius: Radius["2xl"],
    borderWidth: 1,
    marginVertical: Spacing.xl,
    padding: Spacing.xl,
  },
  emptyStateTitle: {
    ...TypeScale.headingSm,
  },
  emptyStateText: {
    ...TypeScale.bodyMd,
    marginTop: Spacing.xs,
  },
  // ─── Suggestions rail ───
  suggestionsBlock: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginBottom: Spacing.lg,
    marginHorizontal: -Spacing.xl,
    paddingVertical: Spacing.md,
  },
  suggestionsHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  suggestionsTitle: {
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.bold,
  },
  suggestionsSeeAll: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.bold,
  },
  suggestionsRail: {
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
  },
  // ─── See all CTA card at the end of suggestions rail ───
  seeAllCard: {
    alignItems: "center",
    borderRadius: Radius.lg,
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.lg,
    width: 124,
  },
  seeAllIconWrap: {
    alignItems: "center",
    borderRadius: 999,
    height: 64,
    justifyContent: "center",
    marginBottom: Spacing.sm,
    width: 64,
  },
  seeAllCardTitle: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.bold,
  },
  seeAllCardSubtitle: {
    ...TypeScale.labelSm,
    marginTop: 2,
    textAlign: "center",
  },
});
