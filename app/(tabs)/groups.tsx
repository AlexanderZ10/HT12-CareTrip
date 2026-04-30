import { MaterialIcons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar } from "../../components/Avatar";
import { useAppLanguage } from "../../components/app-language-provider";
import { useAppTheme } from "../../components/app-theme-provider";
import {
  FontWeight,
  Radius,
  Spacing,
  TypeScale,
} from "../../constants/design-system";
import { ActionMenu } from "../../features/groups/components/ActionMenu";
import { CreateGroupModal } from "../../features/groups/components/CreateGroupModal";
import { DeleteGroupModal } from "../../features/groups/components/DeleteGroupModal";
import { FriendProfileCard } from "../../features/groups/components/FriendProfileCard";
import { GroupRow } from "../../features/groups/components/GroupRow";
import { JoinGroupModal } from "../../features/groups/components/JoinGroupModal";
import { TripRequestCard } from "../../features/groups/components/TripRequestCard";
import { TripRequestComposerModal } from "../../features/groups/components/TripRequestComposerModal";
import { useSharedGroupsScreen } from "../../features/groups/GroupsScreenProvider";
import {
  getLastSocialTab,
  SOCIAL_DOCK_BOTTOM_GAP,
  SOCIAL_DOCK_CONTENT_SPACER,
  SOCIAL_DOCK_HEIGHT,
  SocialTabsDock,
} from "../../features/social/components/SocialTabsDock";
import { formatRelativeTime } from "../../utils/formatting";
import { getLanguageLocale } from "../../utils/translations";

export default function GroupsTabScreen() {
  const { colors } = useAppTheme();
  const { language, t } = useAppLanguage();
  const locale = getLanguageLocale(language);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isFocused = useIsFocused();
  const hasRestoredTab = useRef(false);
  const vm = useSharedGroupsScreen();
  const isSearching = vm.searchQuery.trim().length > 0;
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  useEffect(() => {
    if (!isFocused || hasRestoredTab.current) return;
    hasRestoredTab.current = true;
    getLastSocialTab().then((tab) => {
      if (tab !== "/groups") {
        router.replace(tab);
      }
    });
  }, [isFocused, router]);

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

  const buildPeopleCard = (
    profile: {
      aboutMe?: string;
      avatarUrl?: string;
      displayName?: string;
      homeBase?: string;
      photoUrl?: string;
      uid: string;
      username?: string;
    },
    fullWidth = false
  ) => {
    const preview = vm.buildSocialProfilePreview(profile.uid);
    const connection = preview.connection;
    const connectionState = vm.getConnectionStateForProfile(profile.uid);
    const actionLoading = vm.isUpdatingConnectionWithProfile(profile.uid);

    if (connection && (connectionState === "following" || connectionState === "mutual")) {
      return (
        <FriendProfileCard
          actionDisabled={connectionState === "following"}
          actionLabel={connectionState === "mutual" ? t("groups.message") : t("groups.following")}
          badge={t("groups.following")}
          fullWidth={fullWidth}
          key={profile.uid}
          label={preview.label}
          loading={actionLoading}
          onActionPress={() => vm.openComposer(preview.uid)}
          onSecondaryActionPress={() => {
            void vm.removeFriendship(connection);
          }}
          photoUrl={preview.photoUrl}
          secondaryActionLabel={t("groups.unfollow")}
          username={preview.username}
          aboutMe={preview.aboutMe}
          homeBase={preview.homeBase}
        />
      );
    }

    if (connection && connectionState === "followed-by") {
      return (
        <FriendProfileCard
          actionLabel={t("groups.followBack")}
          badge={t("groups.followsYou")}
          fullWidth={fullWidth}
          key={profile.uid}
          label={preview.label}
          loading={actionLoading}
          onActionPress={() => {
            void vm.acceptFriendRequest(connection);
          }}
          onSecondaryActionPress={() => {
            void vm.removeFriendship(connection);
          }}
          photoUrl={preview.photoUrl}
          secondaryActionLabel={t("groups.decline")}
          username={preview.username}
          aboutMe={preview.aboutMe}
          homeBase={preview.homeBase}
        />
      );
    }

    return (
      <FriendProfileCard
        actionLabel={t("groups.follow")}
        badge={t("groups.publicProfile")}
        fullWidth={fullWidth}
        key={profile.uid}
        label={preview.label}
        loading={actionLoading}
        onActionPress={() => {
          void vm.sendFriendRequest({
            aboutMe: profile.aboutMe ?? "",
            avatarUrl: profile.avatarUrl ?? "",
            displayName: profile.displayName ?? preview.label,
            homeBase: profile.homeBase ?? "",
            id: profile.uid,
            photoUrl: profile.photoUrl ?? "",
            uid: profile.uid,
            updatedAtMs: null,
            username: profile.username ?? "",
            usernameLower: (profile.username ?? "").toLowerCase(),
          });
        }}
        onSecondaryActionPress={() => vm.openComposer(preview.uid)}
        photoUrl={preview.photoUrl}
        secondaryActionLabel={t("groups.write")}
        username={preview.username}
        aboutMe={preview.aboutMe}
        homeBase={preview.homeBase}
      />
    );
  };

  const renderEmptyState = (title: string, text: string) => (
    <View
      style={[
        styles.emptyState,
        { backgroundColor: colors.cardAlt, borderColor: colors.border },
      ]}
    >
      <Text style={[styles.emptyStateTitle, { color: colors.textPrimary }]}>{title}</Text>
      <Text style={[styles.emptyStateText, { color: colors.textSecondary }]}>{text}</Text>
    </View>
  );

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
          automaticallyAdjustContentInsets={false}
          contentInsetAdjustmentBehavior="never"
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
          {/* ── Instagram DM-style topbar: handle + new chat icon ── */}
          <View style={styles.topBar}>
            <View style={styles.topBarHandleWrap}>
              <Text numberOfLines={1} style={[styles.handle, { color: colors.textPrimary }]}>
                @{vm.userHandle}
              </Text>
              <MaterialIcons name="keyboard-arrow-down" size={24} color={colors.textPrimary} />
            </View>
            <TouchableOpacity
              accessibilityLabel="Create new group or trip request"
              activeOpacity={0.86}
              onPress={() => vm.setActionMenuVisible(true)}
              style={[styles.topBarAddButton, { backgroundColor: colors.accent }]}
            >
              <MaterialIcons color={colors.buttonTextOnAction} name="add" size={19} />
              <Text style={[styles.topBarAddButtonText, { color: colors.buttonTextOnAction }]}>
                {t("groups.createGroup")}
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── Instagram-style rounded gray search pill ── */}
          <View
            style={[
              styles.searchShell,
              { backgroundColor: colors.inputBackground },
            ]}
          >
            <MaterialIcons color={colors.textMuted} name="search" size={20} />
            <TextInput
              accessibilityLabel="Search groups and people"
              onChangeText={(value) => {
                vm.setSearchQuery(value);
                vm.clearFeedback();
              }}
              placeholder={t("groups.searchPlaceholder")}
              placeholderTextColor={colors.textMuted}
              style={[styles.searchInput, { color: colors.textPrimary }]}
              value={vm.searchQuery}
            />
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

          {!isSearching && vm.smartAlerts.length > 0 ? (
            <View style={styles.sectionBlock}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                  {t("groups.smartAlerts")}
                </Text>
                <Text style={[styles.sectionMeta, { color: colors.textSecondary }]}>
                  {vm.smartAlerts.length}
                </Text>
              </View>
              <View style={styles.alertColumn}>
                {vm.smartAlerts.map((alert) => (
                  <TouchableOpacity
                    key={alert.id}
                    activeOpacity={alert.groupId ? 0.86 : 1}
                    disabled={!alert.groupId}
                    onPress={() => {
                      if (alert.groupId) {
                        vm.openGroupChat(alert.groupId);
                      }
                    }}
                    style={[
                      styles.alertCard,
                      {
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.alertIconWrap,
                        { backgroundColor: colors.accentMuted },
                      ]}
                    >
                      <MaterialIcons color={colors.accent} name="notifications-active" size={18} />
                    </View>
                    <View style={styles.alertTextWrap}>
                      <Text style={[styles.alertTitle, { color: colors.textPrimary }]}>
                        {alert.title}
                      </Text>
                      <Text style={[styles.alertBody, { color: colors.textSecondary }]}>
                        {alert.body}
                      </Text>
                    </View>
                    {alert.groupId ? (
                      <MaterialIcons color={colors.textMuted} name="chevron-right" size={20} />
                    ) : null}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : null}

          {isSearching ? (
            <>
              <View style={styles.sectionBlock}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                    {t("groups.people")}
                  </Text>
                  <Text style={[styles.sectionMeta, { color: colors.textSecondary }]}>
                    {vm.searchedPublicProfiles.length}
                  </Text>
                </View>

                {vm.searchedPublicProfiles.length === 0
                  ? renderEmptyState(
                      t("groups.noTravelersMatched"),
                      t("groups.noTravelersMatchedHint")
                    )
                  : (
                    <View style={styles.verticalCards}>
                      {vm.searchedPublicProfiles.map((profile) => buildPeopleCard(profile, true))}
                    </View>
                  )}
              </View>

              <View style={styles.sectionBlock}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                    {t("groups.publicGroupsSection")}
                  </Text>
                  <Text style={[styles.sectionMeta, { color: colors.textSecondary }]}>
                    {vm.searchedPublicGroups.length}
                  </Text>
                </View>

                {vm.searchedPublicGroups.length === 0
                  ? renderEmptyState(
                      t("groups.noMatches"),
                      t("groups.noMatchesHint")
                    )
                  : (
                    vm.searchedPublicGroups.map((group) => (
                      <GroupRow
                        actionLabel={
                          group.memberIds.includes(vm.userId) ? t("common.joined") : t("common.join")
                        }
                        actionLoading={vm.joiningGroupId === group.id}
                        badge={t("common.public")}
                        group={group}
                        key={group.id}
                        onActionPress={
                          group.memberIds.includes(vm.userId) ? undefined : () => vm.joinGroup(group.id)
                        }
                        onPress={() => vm.openGroupChat(group.id)}
                        preview={group.description || `${t("groups.createdBy")} ${group.creatorLabel}`}
                        rightMeta={formatRelativeTime(group.updatedAtMs ?? group.createdAtMs, locale)}
                      />
                    ))
                  )}
              </View>
            </>
          ) : (
            <>
              {/* ── Top horizontal rail of friends (Instagram DM-style with circular avatars) ── */}
              {vm.friendProfiles.length > 0 ? (
                <View style={styles.friendRailWrap}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.friendRail}
                  >
                    {vm.friendProfiles.slice(0, 12).map((profile) => (
                      <TouchableOpacity
                        key={profile.uid}
                        activeOpacity={0.7}
                        onPress={() => vm.openComposer(profile.uid)}
                        style={styles.friendRailItem}
                      >
                        <View style={[styles.friendRailRing, { borderColor: colors.border }]}>
                          {/* Avatar reuses 56px to match the row size */}
                          <Avatar label={profile.label} photoUrl={profile.photoUrl} size={56} />
                        </View>
                        <Text
                          numberOfLines={1}
                          style={[styles.friendRailLabel, { color: colors.textPrimary }]}
                        >
                          {profile.username || profile.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              ) : null}

              {/* ── Messages section header (Instagram DM "Messages" + "Requests") ── */}
              <View style={styles.dmHeader}>
                <Text style={[styles.dmHeaderTitle, { color: colors.textPrimary }]}>{t("groups.messages")}</Text>
                {vm.invitedGroups.length > 0 || vm.pendingIncomingFriendships.length > 0 ? (
                  <Text style={[styles.dmRequestsLink, { color: colors.accent }]}>
                    {t("groups.requests")} ({vm.invitedGroups.length + vm.pendingIncomingFriendships.length})
                  </Text>
                ) : null}
              </View>

              {/* ── Pending invites at top of message list ── */}
              {vm.invitedGroups.map((group) => (
                <GroupRow
                  actionLabel={t("groups.accept")}
                  actionLoading={vm.joiningGroupId === group.id}
                  badge={t("groups.invite")}
                  group={group}
                  key={`invite-${group.id}`}
                  onActionPress={() => vm.joinGroup(group.id)}
                  preview={`${group.creatorLabel} ${t("groups.invitedYou")}${group.description ? ` • ${group.description}` : ""}`}
                  rightMeta={t("groups.request")}
                />
              ))}

              {/* ── Joined groups (clean flat rows) ── */}
              {vm.joinedGroups.length === 0 && vm.invitedGroups.length === 0
                ? renderEmptyState(
                    t("groups.noChatsYet"),
                    t("groups.noChatsHint")
                  )
                : vm.joinedGroups.map((group) => {
                    const invitedLabels = group.invitedUserIds
                      .slice(0, 2)
                      .map(
                        (inviteId) =>
                          vm.publicProfilesById[inviteId]?.username ||
                          vm.publicProfilesById[inviteId]?.displayName
                      )
                      .filter(Boolean);
                    const previewText =
                      invitedLabels.length > 0
                        ? `${t("groups.invited")} ${invitedLabels.join(", ")}`
                        : group.description || `${t("groups.createdBy")} ${group.creatorLabel}`;

                    return (
                      <GroupRow
                        actionLabel={group.creatorId === vm.userId ? t("common.delete") : undefined}
                        actionLoading={vm.deletingGroupId === group.id}
                        actionVariant="danger"
                        group={group}
                        key={group.id}
                        onActionPress={
                          group.creatorId === vm.userId ? () => vm.openDeleteModal(group) : undefined
                        }
                        onPress={() => vm.openGroupChat(group.id)}
                        preview={previewText}
                        rightMeta={formatRelativeTime(group.updatedAtMs ?? group.createdAtMs, locale)}
                      />
                    );
                  })}

              {/* ── Pending friend requests (Instagram-style "people you may know") ── */}
              {vm.pendingIncomingFriendships.length > 0 ? (
                <>
                  <View style={[styles.dmHeader, styles.dmHeaderSpaced]}>
                    <Text style={[styles.dmHeaderTitle, { color: colors.textPrimary }]}>
                      {t("groups.friendRequests")}
                    </Text>
                  </View>
                  {vm.pendingIncomingFriendships.map((friendship) =>
                    buildPeopleCard(
                      {
                        displayName: vm.buildSocialProfilePreview(friendship.requesterId).label,
                        uid: friendship.requesterId,
                        username: vm.buildSocialProfilePreview(friendship.requesterId).username,
                      },
                      true
                    )
                  )}
                </>
              ) : null}

              {/* ── Trip requests (compact horizontal scroll) ── */}
              {vm.openTripRequests.length > 0 ? (
                <>
                  <View style={[styles.dmHeader, styles.dmHeaderSpaced]}>
                    <Text style={[styles.dmHeaderTitle, { color: colors.textPrimary }]}>
                      {t("groups.tripIdeas")}
                    </Text>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.requestCardsContent}
                  >
                    {vm.openTripRequests.map((request) => (
                      <TripRequestCard
                        currentUserId={vm.userId}
                        key={request.id}
                        onClosePress={() => {
                          void vm.closeTripRequest(request);
                        }}
                        onCreateGroupPress={() => {
                          void vm.createGroupFromRequest(request);
                        }}
                        onToggleInterestPress={() => {
                          void vm.toggleTripRequestInterest(request);
                        }}
                        request={request}
                        updating={vm.updatingTripRequestId === request.id}
                      />
                    ))}
                  </ScrollView>
                </>
              ) : null}

              {/* ── Discover public groups (clean flat list) ── */}
              {vm.publicGroups.length > 0 ? (
                <>
                  <View style={[styles.dmHeader, styles.dmHeaderSpaced]}>
                    <Text style={[styles.dmHeaderTitle, { color: colors.textPrimary }]}>
                      {t("groups.discoverGroups")}
                    </Text>
                  </View>
                  {vm.publicGroups
                    .filter((group) => !group.memberIds.includes(vm.userId))
                    .slice(0, 8)
                    .map((group) => (
                      <GroupRow
                        actionLabel={t("common.join")}
                        actionLoading={vm.joiningGroupId === group.id}
                        badge={t("common.public")}
                        group={group}
                        key={`public-${group.id}`}
                        onActionPress={() => vm.joinGroup(group.id)}
                        onPress={() => vm.openGroupChat(group.id)}
                        preview={group.description || `${t("groups.createdBy")} ${group.creatorLabel}`}
                        rightMeta={formatRelativeTime(group.updatedAtMs ?? group.createdAtMs, locale)}
                      />
                    ))}
                </>
              ) : null}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <SocialTabsDock />

      <ActionMenu
        visible={vm.actionMenuVisible}
        onClose={() => vm.setActionMenuVisible(false)}
        onCreateGroup={() => vm.openComposer()}
        onUsePrivateKey={() => {
          vm.setActionMenuVisible(false);
          vm.setJoinKeyModalVisible(true);
        }}
        onCreateTripRequest={vm.openRequestComposer}
      />

      <DeleteGroupModal
        visible={vm.deleteModalVisible}
        group={vm.groupPendingDelete}
        deleting={!!vm.deletingGroupId}
        onClose={() => {
          vm.setDeleteModalVisible(false);
          vm.setGroupPendingDelete(null);
        }}
        onConfirm={() => {
          void vm.handleDeleteGroup();
        }}
      />

      <JoinGroupModal
        visible={vm.joinKeyModalVisible}
        onClose={() => vm.setJoinKeyModalVisible(false)}
        joinKeyValue={vm.joinKeyValue}
        onJoinKeyChange={vm.setJoinKeyValue}
        joining={vm.joiningByKey}
        onJoinPress={vm.handleJoinByKey}
        onClearFeedback={vm.clearFeedback}
      />

      <CreateGroupModal
        visible={vm.composerVisible}
        onClose={() => vm.setComposerVisible(false)}
        groupName={vm.groupName}
        onGroupNameChange={vm.setGroupName}
        groupDescription={vm.groupDescription}
        onGroupDescriptionChange={vm.setGroupDescription}
        groupAccess={vm.groupAccess}
        onGroupAccessChange={vm.setGroupAccess}
        groupJoinKey={vm.groupJoinKey}
        onGroupJoinKeyChange={vm.setGroupJoinKey}
        inviteSearchQuery={vm.inviteSearchQuery}
        onInviteSearchQueryChange={vm.setInviteSearchQuery}
        selectedInviteIds={vm.selectedInviteIds}
        onToggleInvite={vm.toggleInvite}
        filteredInviteProfiles={vm.filteredInviteProfiles}
        publicProfilesById={vm.publicProfilesById}
        saving={vm.savingGroup}
        onCreatePress={vm.handleCreateGroup}
      />

      <TripRequestComposerModal
        visible={vm.requestComposerVisible}
        onClose={() => vm.setRequestComposerVisible(false)}
        destination={vm.requestDestination}
        onDestinationChange={vm.setRequestDestination}
        budget={vm.requestBudget}
        onBudgetChange={vm.setRequestBudget}
        timing={vm.requestTiming}
        onTimingChange={vm.setRequestTiming}
        travelers={vm.requestTravelers}
        onTravelersChange={vm.setRequestTravelers}
        note={vm.requestNote}
        onNoteChange={vm.setRequestNote}
        saving={vm.savingTripRequest}
        onPublishPress={vm.handleCreateTripRequest}
        error={vm.error}
        successMessage={vm.successMessage}
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
    paddingTop: Spacing.xs,
    width: "100%",
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
    minHeight: 48,
  },
  topBarHandleWrap: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    paddingRight: Spacing.md,
  },
  handle: {
    fontSize: 22,
    fontWeight: FontWeight.black,
  },
  topBarAddButton: {
    alignItems: "center",
    borderRadius: Radius.full,
    flexDirection: "row",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: 9,
  },
  topBarAddButtonText: {
    ...TypeScale.bodySm,
    fontWeight: FontWeight.extrabold,
  },
  searchShell: {
    alignItems: "center",
    borderRadius: Radius.full,
    flexDirection: "row",
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
  },
  searchInput: {
    ...TypeScale.bodyMd,
    flex: 1,
    marginLeft: Spacing.sm,
    padding: 0,
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
  sectionBlock: {
    marginBottom: Spacing.lg,
  },
  sectionHeader: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    ...TypeScale.headingMd,
    fontWeight: FontWeight.bold,
  },
  sectionMeta: {
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.semibold,
  },
  sectionSupportText: {
    ...TypeScale.bodyMd,
    marginBottom: Spacing.md,
  },
  horizontalCards: {
    gap: Spacing.md,
    paddingRight: Spacing.lg,
  },
  verticalCards: {
    gap: 0,
  },
  alertColumn: {
    gap: Spacing.sm,
  },
  alertCard: {
    alignItems: "center",
    borderRadius: Radius.xl,
    borderWidth: 1,
    flexDirection: "row",
    padding: Spacing.md,
  },
  alertIconWrap: {
    alignItems: "center",
    borderRadius: Radius.full,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  alertTextWrap: {
    flex: 1,
    marginLeft: Spacing.md,
    marginRight: Spacing.xs,
  },
  alertTitle: {
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.bold,
  },
  alertBody: {
    ...TypeScale.bodySm,
    marginTop: 3,
    lineHeight: 18,
  },
  // ── Friend rail (top horizontal scroll) ──
  friendRailWrap: {
    marginHorizontal: -Spacing.xl,
    marginBottom: Spacing.lg,
  },
  friendRail: {
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
  },
  friendRailItem: {
    alignItems: "center",
    width: 74,
  },
  friendRailRing: {
    borderRadius: 999,
    borderWidth: 2,
    padding: 2,
  },
  friendRailLabel: {
    ...TypeScale.labelSm,
    marginTop: 5,
    maxWidth: 74,
    textAlign: "center",
  },
  // ── DM section header ──
  dmHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 0,
    paddingVertical: Spacing.sm,
  },
  dmHeaderSpaced: {
    marginTop: Spacing.lg,
    marginBottom: Spacing.xs,
  },
  dmHeaderTitle: {
    ...TypeScale.titleMd,
    fontWeight: FontWeight.bold,
  },
  dmRequestsLink: {
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.bold,
  },
  emptyState: {
    alignItems: "center",
    borderRadius: Radius.xl,
    borderWidth: 1,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing["3xl"],
    marginVertical: Spacing.sm,
  },
  emptyStateTitle: {
    ...TypeScale.titleMd,
    fontWeight: FontWeight.bold,
    textAlign: "center",
  },
  emptyStateText: {
    ...TypeScale.bodyMd,
    marginTop: Spacing.sm,
    textAlign: "center",
    lineHeight: 22,
  },
  requestCardsContent: {
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
});
