import { MaterialIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar } from "../../components/Avatar";
import { useAppLanguage } from "../../components/app-language-provider";
import { useAppTheme } from "../../components/app-theme-provider";
import {
  FontWeight,
  Spacing,
  TypeScale,
} from "../../constants/design-system";
import { useGroupsScreen } from "../../features/groups/useGroupsScreen";
import { SocialMediaSourceModal } from "../../features/social/components/SocialMediaSourceModal";
import { SocialPostComposerModal } from "../../features/social/components/SocialPostComposerModal";
import { SocialPublishTargetModal } from "../../features/social/components/SocialPublishTargetModal";
import {
  SocialStoryViewerModal,
  type SocialStoryViewerData,
} from "../../features/social/components/SocialStoryViewerModal";
import {
  SOCIAL_DOCK_BOTTOM_GAP,
  SOCIAL_DOCK_CONTENT_SPACER,
  SOCIAL_DOCK_HEIGHT,
  SocialTabsDock,
} from "../../features/social/components/SocialTabsDock";
import { formatRelativeTime } from "../../utils/formatting";
import { getLanguageLocale } from "../../utils/translations";

const SCREEN_WIDTH = Dimensions.get("window").width;
const GRID_COLUMNS = 3;
const GRID_GAP = 2;
const GRID_TILE_SIZE = (SCREEN_WIDTH - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;

type GridTab = "posts" | "tagged";

export default function SocialProfileTabScreen() {
  const { colors } = useAppTheme();
  const { language } = useAppLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const vm = useGroupsScreen();
  const locale = getLanguageLocale(language);
  const [sourceModalVisible, setSourceModalVisible] = useState(false);
  const [targetModalVisible, setTargetModalVisible] = useState(false);
  const [postComposerVisible, setPostComposerVisible] = useState(false);
  const [selectedStory, setSelectedStory] = useState<SocialStoryViewerData | null>(null);
  const [activeTab, setActiveTab] = useState<GridTab>("posts");

  const handleEditProfile = () => {
    router.push("/profile");
  };

  const handleShareProfile = async () => {
    try {
      await Share.share({
        message: `Check out @${vm.userHandle} on CareTrip — let's plan a trip together!`,
        title: `@${vm.userHandle} on CareTrip`,
      });
    } catch {
      // User cancelled or share failed silently
    }
  };

  const handleDiscoverPeople = () => {
    router.push("/feed/suggestions");
  };

  const handleOpenMenu = () => {
    router.push("/profile");
  };

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

  const postCount = vm.mySocialPosts.length;
  const followersCount = vm.friendCount;
  const followingCount = vm.friendCount;

  const myPostsWithImages = useMemo(
    () => vm.mySocialPosts.filter((post) => !!post.imageUri),
    [vm.mySocialPosts]
  );

  const activeStoriesByAuthorId = useMemo(
    () => new Map(vm.activeStories.map((story) => [story.authorId, story] as const)),
    [vm.activeStories]
  );

  const currentUserStory = activeStoriesByAuthorId.get(vm.userId);

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
        >
          {/* ─── Top bar: handle (left) + new post + menu (right) ─── */}
          <View style={styles.topBar}>
            <View style={styles.topBarHandleWrap}>
              <Text numberOfLines={1} style={[styles.topBarHandle, { color: colors.textPrimary }]}>
                @{vm.userHandle}
              </Text>
              <MaterialIcons name="keyboard-arrow-down" size={24} color={colors.textPrimary} />
            </View>
            <View style={styles.topBarActions}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setSourceModalVisible(true)}
                style={styles.topBarIconButton}
              >
                <MaterialIcons name="add-box" size={28} color={colors.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleOpenMenu}
                style={styles.topBarIconButton}
              >
                <MaterialIcons name="menu" size={28} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* ─── Profile header: avatar + 3 stats inline ─── */}
          <View style={styles.profileHeader}>
            <Avatar label={vm.profileName} photoUrl={vm.profileAvatarUrl} size={86} />

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>{postCount}</Text>
                <Text style={[styles.statLabel, { color: colors.textPrimary }]}>posts</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>{followersCount}</Text>
                <Text style={[styles.statLabel, { color: colors.textPrimary }]}>followers</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>{followingCount}</Text>
                <Text style={[styles.statLabel, { color: colors.textPrimary }]}>following</Text>
              </View>
            </View>
          </View>

          {/* ─── Display name + bio ─── */}
          <View style={styles.bioSection}>
            <Text style={[styles.displayName, { color: colors.textPrimary }]}>{vm.profileName}</Text>
            <Text style={[styles.bioText, { color: colors.textPrimary }]}>
              ✈️ Travel moments, group trips, and stories from the road.
            </Text>
          </View>

          {/* ─── Edit / Share buttons (Instagram style: full width, side by side) ─── */}
          <View style={styles.profileActions}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleEditProfile}
              style={[styles.profileActionButton, { backgroundColor: colors.inputBackground }]}
            >
              <Text style={[styles.profileActionText, { color: colors.textPrimary }]}>
                Edit profile
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
                void handleShareProfile();
              }}
              style={[styles.profileActionButton, { backgroundColor: colors.inputBackground }]}
            >
              <Text style={[styles.profileActionText, { color: colors.textPrimary }]}>
                Share profile
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleDiscoverPeople}
              style={[styles.profileActionIconButton, { backgroundColor: colors.inputBackground }]}
            >
              <MaterialIcons name="person-add" size={18} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* ─── Story highlights row (active stories from friends) ─── */}
          {vm.activeStories.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.highlightsRow}
            >
              {currentUserStory ? (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => openStoryViewer(vm.userId)}
                  style={styles.highlightItem}
                >
                  <View style={[styles.highlightCircle, { borderColor: colors.accent }]}>
                    <Image
                      source={{ uri: currentUserStory.imageUri }}
                      style={styles.highlightImage}
                      contentFit="cover"
                    />
                  </View>
                  <Text style={[styles.highlightLabel, { color: colors.textPrimary }]}>Your story</Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setSourceModalVisible(true)}
                style={styles.highlightItem}
              >
                <View
                  style={[
                    styles.highlightCircleNew,
                    { backgroundColor: colors.inputBackground, borderColor: colors.border },
                  ]}
                >
                  <MaterialIcons name="add" size={28} color={colors.textPrimary} />
                </View>
                <Text style={[styles.highlightLabel, { color: colors.textPrimary }]}>New</Text>
              </TouchableOpacity>

              {vm.activeStories.slice(0, 8).map((story) => {
                if (story.authorId === vm.userId) {
                  return null;
                }

                const profile = vm.publicProfilesById[story.authorId];
                const photoUrl = story.imageUri || profile?.photoUrl || profile?.avatarUrl || "";
                const label = profile?.username || story.authorLabel || "story";

                return (
                  <TouchableOpacity
                    key={story.id}
                    activeOpacity={0.8}
                    onPress={() => openStoryViewer(story.authorId)}
                    style={styles.highlightItem}
                  >
                    <View style={[styles.highlightCircle, { borderColor: colors.border }]}>
                      {photoUrl ? (
                        <Image source={{ uri: photoUrl }} style={styles.highlightImage} contentFit="cover" />
                      ) : (
                        <View style={[styles.highlightFallback, { backgroundColor: colors.accent }]}>
                          <Text style={styles.highlightFallbackText}>
                            {(label || "?")[0].toUpperCase()}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text numberOfLines={1} style={[styles.highlightLabel, { color: colors.textPrimary }]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : null}

          {/* ─── Tab bar (grid icon | tagged icon) ─── */}
          <View style={[styles.tabBar, { borderTopColor: colors.border }]}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setActiveTab("posts")}
              style={[
                styles.tabButton,
                activeTab === "posts" && [styles.tabButtonActive, { borderTopColor: colors.textPrimary }],
              ]}
            >
              <MaterialIcons
                name="grid-on"
                size={26}
                color={activeTab === "posts" ? colors.textPrimary : colors.textMuted}
              />
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setActiveTab("tagged")}
              style={[
                styles.tabButton,
                activeTab === "tagged" && [styles.tabButtonActive, { borderTopColor: colors.textPrimary }],
              ]}
            >
              <MaterialIcons
                name="person-pin"
                size={26}
                color={activeTab === "tagged" ? colors.textPrimary : colors.textMuted}
              />
            </TouchableOpacity>
          </View>

          {/* ─── Feedback banners ─── */}
          {vm.error ? (
            <View style={styles.feedbackWrap}>
              <Text style={[styles.feedbackText, { color: colors.errorText }]}>{vm.error}</Text>
            </View>
          ) : null}

          {/* ─── Posts grid (3-column square tiles, no gaps) ─── */}
          {activeTab === "posts" ? (
            myPostsWithImages.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={[styles.emptyIcon, { borderColor: colors.textPrimary }]}>
                  <MaterialIcons name="photo-camera" size={32} color={colors.textPrimary} />
                </View>
                <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Share Photos</Text>
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                  When you share photos, they will appear on your profile.
                </Text>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setSourceModalVisible(true)}
                  style={styles.emptyAction}
                >
                  <Text style={[styles.emptyActionText, { color: colors.accent }]}>
                    Share your first photo
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.grid}>
                {myPostsWithImages.map((post) => (
                  <TouchableOpacity key={post.id} activeOpacity={0.85} style={styles.gridTile}>
                    <Image
                      source={{ uri: post.imageUri }}
                      style={styles.gridImage}
                      contentFit="cover"
                    />
                  </TouchableOpacity>
                ))}
              </View>
            )
          ) : (
            <View style={styles.emptyState}>
              <View style={[styles.emptyIcon, { borderColor: colors.textPrimary }]}>
                <MaterialIcons name="person-pin" size={32} color={colors.textPrimary} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                Photos of You
              </Text>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                When people tag you in photos, they will appear here.
              </Text>
            </View>
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
    paddingTop: Spacing.sm,
  },
  // ─── Top bar ───
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  topBarHandleWrap: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
  },
  topBarHandle: {
    fontSize: 22,
    fontWeight: FontWeight.black,
  },
  topBarActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.md,
  },
  topBarIconButton: {
    padding: 4,
  },
  // ─── Profile header (avatar + stats) ───
  profileHeader: {
    alignItems: "center",
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  statsRow: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: Spacing.lg,
  },
  statItem: {
    alignItems: "center",
  },
  statValue: {
    ...TypeScale.headingMd,
    fontWeight: FontWeight.bold,
  },
  statLabel: {
    ...TypeScale.bodyMd,
    marginTop: 2,
  },
  // ─── Bio ───
  bioSection: {
    paddingHorizontal: Spacing.lg,
  },
  displayName: {
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.bold,
  },
  bioText: {
    ...TypeScale.bodyMd,
    lineHeight: 19,
    marginTop: 2,
  },
  // ─── Profile actions ───
  profileActions: {
    flexDirection: "row",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  profileActionButton: {
    alignItems: "center",
    borderRadius: 8,
    flex: 1,
    paddingVertical: 8,
  },
  profileActionText: {
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.semibold,
  },
  profileActionIconButton: {
    alignItems: "center",
    borderRadius: 8,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  // ─── Highlights row ───
  highlightsRow: {
    gap: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  highlightItem: {
    alignItems: "center",
    width: 70,
  },
  highlightCircle: {
    borderRadius: 999,
    borderWidth: 1,
    height: 64,
    overflow: "hidden",
    width: 64,
  },
  highlightCircleNew: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    height: 64,
    justifyContent: "center",
    width: 64,
  },
  highlightImage: {
    height: "100%",
    width: "100%",
  },
  highlightFallback: {
    alignItems: "center",
    height: "100%",
    justifyContent: "center",
    width: "100%",
  },
  highlightFallbackText: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: FontWeight.extrabold,
  },
  highlightLabel: {
    ...TypeScale.labelSm,
    marginTop: 6,
    maxWidth: 70,
    textAlign: "center",
  },
  // ─── Tab bar ───
  tabBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    marginTop: Spacing.sm,
  },
  tabButton: {
    alignItems: "center",
    borderTopColor: "transparent",
    borderTopWidth: 1.5,
    flex: 1,
    paddingVertical: Spacing.md,
  },
  tabButtonActive: {
    borderTopWidth: 1.5,
  },
  // ─── Feedback ───
  feedbackWrap: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  feedbackText: {
    ...TypeScale.bodyMd,
    textAlign: "center",
  },
  // ─── Empty state ───
  emptyState: {
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing["3xl"],
  },
  emptyIcon: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 2,
    height: 64,
    justifyContent: "center",
    marginBottom: Spacing.md,
    width: 64,
  },
  emptyTitle: {
    ...TypeScale.headingMd,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.xs,
  },
  emptyText: {
    ...TypeScale.bodyMd,
    marginBottom: Spacing.md,
    textAlign: "center",
  },
  emptyAction: {
    paddingVertical: Spacing.sm,
  },
  emptyActionText: {
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.bold,
  },
  // ─── Grid ───
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GRID_GAP,
  },
  gridTile: {
    height: GRID_TILE_SIZE,
    width: GRID_TILE_SIZE,
  },
  gridImage: {
    height: "100%",
    width: "100%",
  },
});
