import { MaterialIcons } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
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
  shadow,
} from "../../constants/design-system";
import { ActionMenu } from "../../features/groups/components/ActionMenu";
import { CreateGroupModal } from "../../features/groups/components/CreateGroupModal";
import { DeleteGroupModal } from "../../features/groups/components/DeleteGroupModal";
import { GroupRow } from "../../features/groups/components/GroupRow";
import { JoinGroupModal } from "../../features/groups/components/JoinGroupModal";
import { TripRequestCard } from "../../features/groups/components/TripRequestCard";
import { TripRequestComposerModal } from "../../features/groups/components/TripRequestComposerModal";
import { useGroupsScreen } from "../../features/groups/useGroupsScreen";
import { formatRelativeTime } from "../../utils/formatting";

export default function GroupsTabScreen() {
  const { colors } = useAppTheme();
  const { t } = useAppLanguage();
  const insets = useSafeAreaInsets();
  const vm = useGroupsScreen();

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
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.topBar}>
          <View style={styles.topBarTextWrap}>
            <Text style={[styles.pageTitle, { color: colors.textPrimary }]}>{t("groups.title")}</Text>
            <Text style={[styles.pageSubtitle, { color: colors.textSecondary }]}>
              @{vm.userHandle} • {vm.profileName}
            </Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => vm.setActionMenuVisible(true)}
            style={[
              styles.topBarCircleButton,
              {
                backgroundColor: colors.accent,
                borderColor: colors.centerButtonBorder,
              },
            ]}
          >
            <MaterialIcons color={colors.buttonTextOnAction} name="add" size={28} />
          </TouchableOpacity>
        </View>

        <View
          style={[
            styles.searchShell,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          <MaterialIcons color={colors.textMuted} name="search" size={24} />
          <TextInput
            onChangeText={(value) => {
              vm.setSearchQuery(value);
              vm.clearFeedback();
            }}
            placeholder={t("groups.searchPublic")}
            placeholderTextColor={colors.inputPlaceholder}
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
            <Text style={[styles.feedbackTextError, { color: colors.errorText }]}>{vm.error}</Text>
          </View>
        ) : null}

        {vm.successMessage ? (
          <View
            style={[
              styles.feedbackCardSuccess,
              { backgroundColor: colors.successBackground, borderColor: colors.successBorder },
            ]}
          >
            <Text style={[styles.feedbackTextSuccess, { color: colors.successText }]}>
              {vm.successMessage}
            </Text>
          </View>
        ) : null}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.storiesRow}
          contentContainerStyle={styles.storiesContent}
        >
          {vm.publicUsers.map((profile) => (
            <TouchableOpacity
              activeOpacity={0.9}
              key={profile.id}
              onPress={() => vm.openComposer(profile.uid)}
              style={styles.storyButton}
            >
              <Avatar
                label={profile.displayName || profile.username || "Traveler"}
                photoUrl={profile.photoUrl}
                size={74}
                subtitle=""
              />
              <Text numberOfLines={1} style={[styles.storyLabel, { color: colors.textPrimary }]}>
                {profile.username ? profile.username : profile.displayName}
              </Text>
              <Text numberOfLines={1} style={[styles.storyHint, { color: colors.textMuted }]}>
                {profile.homeBase || "Public profile"}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {!vm.searchQuery.trim() ? (
          <View style={styles.sectionBlock}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t("groups.tripRequests")}</Text>
              <Text style={[styles.sectionMeta, { color: colors.textSecondary }]}>{vm.openTripRequests.length} {t("groups.open")}</Text>
            </View>
            <Text style={[styles.sectionSupportText, { color: colors.textSecondary }]}>
              {t("groups.tripRequestsHint")}
            </Text>

            {vm.openTripRequests.length === 0 ? (
              <View
                style={[
                  styles.requestEmptyState,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.requestEmptyIcon,
                    { backgroundColor: colors.accentMuted, borderColor: colors.border },
                  ]}
                >
                  <MaterialIcons color={colors.accent} name="travel-explore" size={28} />
                </View>
                <Text style={[styles.requestEmptyTitle, { color: colors.textPrimary }]}>
                  {t("groups.noTripRequests")}
                </Text>
                <Text style={[styles.requestEmptyText, { color: colors.textSecondary }]}>
                  {t("groups.noTripRequestsHint")}
                </Text>
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={vm.openRequestComposer}
                  style={[styles.inlineCreateRequestButton, { backgroundColor: colors.accent }]}
                >
                  <MaterialIcons color={colors.buttonTextOnAction} name="add" size={18} />
                  <Text style={[styles.inlineCreateRequestButtonText, { color: colors.buttonTextOnAction }]}>{t("groups.newTripRequest")}</Text>
                </TouchableOpacity>
              </View>
            ) : (
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
            )}
          </View>
        ) : null}

        {vm.searchQuery.trim() ? (
          <View style={styles.sectionBlock}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t("groups.searchResults")}</Text>
            <Text style={[styles.sectionMeta, { color: colors.textSecondary }]}>{vm.searchedPublicGroups.length} {t("groups.publicGroups")}</Text>

            {vm.searchedPublicGroups.length === 0 ? (
              <View style={[styles.emptyState, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
                <Text style={[styles.emptyStateTitle, { color: colors.textPrimary }]}>{t("groups.noMatches")}</Text>
                <Text style={[styles.emptyStateText, { color: colors.textSecondary }]}>
                  {t("groups.noMatchesHint")}
                </Text>
              </View>
            ) : (
              vm.searchedPublicGroups.map((group) => (
                <GroupRow
                  actionLabel={group.memberIds.includes(vm.userId) ? t("common.joined") : t("common.join")}
                  actionLoading={vm.joiningGroupId === group.id}
                  badge={t("common.public")}
                  group={group}
                  key={group.id}
                  onActionPress={
                    group.memberIds.includes(vm.userId) ? undefined : () => vm.joinGroup(group.id)
                  }
                  onPress={() => vm.openGroupChat(group.id)}
                  preview={
                    group.description || `Created by ${group.creatorLabel}`
                  }
                  rightMeta={formatRelativeTime(group.updatedAtMs ?? group.createdAtMs)}
                />
              ))
            )}
          </View>
        ) : null}

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t("groups.messages")}</Text>
          <Text style={[styles.sectionMeta, { color: colors.textSecondary }]}>
            {t("groups.requests")} {vm.invitedGroups.length ? `(${vm.invitedGroups.length})` : ""}
          </Text>
        </View>

        {vm.invitedGroups.length > 0 ? (
          vm.invitedGroups.map((group) => (
            <GroupRow
              actionLabel={t("groups.accept")}
              actionLoading={vm.joiningGroupId === group.id}
              badge={t("groups.invite")}
              group={group}
              key={`invite-${group.id}`}
              onActionPress={() => vm.joinGroup(group.id)}
              preview={`${group.creatorLabel} invited you${group.description ? ` • ${group.description}` : ""}`}
              rightMeta={t("groups.request")}
            />
          ))
        ) : null}

        {vm.joinedGroups.length === 0 ? (
          <View style={[styles.emptyState, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
            <Text style={[styles.emptyStateTitle, { color: colors.textPrimary }]}>{t("groups.noGroups")}</Text>
            <Text style={[styles.emptyStateText, { color: colors.textSecondary }]}>
              {t("groups.noGroupsHint")}
            </Text>
          </View>
        ) : (
          vm.joinedGroups.map((group) => {
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
                ? `Invited ${invitedLabels.join(", ")}`
                : group.description || `Created by ${group.creatorLabel}`;

            return (
              <GroupRow
                badge={group.accessType === "private" ? t("common.private") : t("common.public")}
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
                rightMeta={formatRelativeTime(group.updatedAtMs ?? group.createdAtMs)}
              />
            );
          })
        )}

        {!vm.searchQuery.trim() ? (
          <View style={styles.sectionBlock}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t("groups.publicGroupsSection")}</Text>
              <Text style={[styles.sectionMeta, { color: colors.textSecondary }]}>{vm.publicGroups.length} {t("groups.available")}</Text>
            </View>

            {vm.publicGroups.length === 0 ? (
              <View style={[styles.emptyState, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
                <Text style={[styles.emptyStateTitle, { color: colors.textPrimary }]}>{t("groups.noPublicGroups")}</Text>
                <Text style={[styles.emptyStateText, { color: colors.textSecondary }]}>
                  {t("groups.noPublicGroupsHint")}
                </Text>
              </View>
            ) : (
              vm.publicGroups
                .filter((group) => !group.memberIds.includes(vm.userId))
                .slice(0, 5)
                .map((group) => (
                  <GroupRow
                    actionLabel={t("common.join")}
                    actionLoading={vm.joiningGroupId === group.id}
                    badge={t("common.public")}
                    group={group}
                    key={`discover-${group.id}`}
                    onActionPress={() => vm.joinGroup(group.id)}
                    onPress={() => vm.openGroupChat(group.id)}
                    preview={group.description || `Created by ${group.creatorLabel}`}
                    rightMeta={formatRelativeTime(group.updatedAtMs ?? group.createdAtMs)}
                  />
                ))
            )}
          </View>
        ) : null}
      </ScrollView>
      </KeyboardAvoidingView>

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
    maxWidth: 980,
    paddingBottom: 128,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    width: "100%",
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
    minHeight: 56,
    borderRadius: Radius.lg,
  },
  topBarTextWrap: {
    flex: 1,
    paddingRight: Spacing.lg,
  },
  pageTitle: {
    ...TypeScale.displayMd,
  },
  pageSubtitle: {
    ...TypeScale.bodyMd,
    marginTop: 6,
  },
  topBarCircleButton: {
    alignItems: "center",
    borderRadius: Radius["3xl"],
    borderWidth: 3,
    height: 56,
    justifyContent: "center",
    ...shadow("lg"),
    width: 56,
  },
  searchShell: {
    alignItems: "center",
    borderRadius: Radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  searchInput: {
    flex: 1,
    ...TypeScale.bodyLg,
    marginLeft: Spacing.md,
  },
  feedbackCardError: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginBottom: Spacing.md,
    padding: Spacing.md,
  },
  feedbackTextError: {
    ...TypeScale.bodyMd,
  },
  feedbackCardSuccess: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginBottom: Spacing.md,
    padding: Spacing.md,
  },
  feedbackTextSuccess: {
    ...TypeScale.bodyMd,
  },
  storiesRow: {
    marginBottom: Spacing.lg,
  },
  storiesContent: {
    gap: Spacing.md,
    paddingRight: Spacing.md,
  },
  storyButton: {
    alignItems: "center",
    width: 88,
  },
  storyLabel: {
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.bold,
    marginTop: Spacing.sm,
    textAlign: "center",
  },
  storyHint: {
    ...TypeScale.labelLg,
    marginTop: Spacing.xs,
    textAlign: "center",
  },
  sectionBlock: {
    marginTop: Spacing.md,
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
    marginTop: Spacing.sm,
    borderRadius: 1,
  },
  sectionTitle: {
    ...TypeScale.headingMd,
    fontWeight: FontWeight.extrabold,
  },
  sectionMeta: {
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.bold,
  },
  sectionSupportText: {
    ...TypeScale.bodyMd,
    marginBottom: Spacing.xs,
  },
  requestCardsContent: {
    paddingRight: Spacing.xl,
  },
  requestEmptyState: {
    alignItems: "center",
    borderRadius: Radius["3xl"],
    borderWidth: 1,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing["2xl"],
  },
  requestEmptyIcon: {
    alignItems: "center",
    borderRadius: Radius.xl,
    borderWidth: 1,
    height: 62,
    justifyContent: "center",
    width: 62,
  },
  requestEmptyTitle: {
    ...TypeScale.headingSm,
    fontWeight: FontWeight.extrabold,
    marginTop: Spacing.md,
    textAlign: "center",
  },
  requestEmptyText: {
    ...TypeScale.bodyMd,
    marginTop: Spacing.sm,
    textAlign: "center",
  },
  inlineCreateRequestButton: {
    alignItems: "center",
    borderRadius: Radius.lg,
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  inlineCreateRequestButtonText: {
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.extrabold,
  },
  emptyState: {
    alignItems: "center",
    borderRadius: Radius["2xl"],
    borderWidth: 1,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing["2xl"],
  },
  emptyStateTitle: {
    ...TypeScale.titleLg,
    fontWeight: FontWeight.extrabold,
    textAlign: "center",
  },
  emptyStateText: {
    ...TypeScale.bodyMd,
    marginTop: Spacing.sm,
    textAlign: "center",
  },
});
