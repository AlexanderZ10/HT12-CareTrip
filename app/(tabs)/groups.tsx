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
import { useAppTheme } from "../../components/app-theme-provider";
import { DismissKeyboard } from "../../components/dismiss-keyboard";
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
  const insets = useSafeAreaInsets();
  const vm = useGroupsScreen();

  if (vm.loading) {
    return (
      <SafeAreaView
        style={[styles.loader, { backgroundColor: colors.screenSoft }]}
        edges={["top", "left", "right"]}
      >
        <ActivityIndicator size="large" color="#2D6A4F" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: colors.screenSoft }]}
      edges={["top", "left", "right"]}
    >
      <DismissKeyboard>
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
            <Text style={[styles.pageTitle, { color: colors.textPrimary }]}>Groups</Text>
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
            <MaterialIcons color="#FFFFFF" name="add" size={28} />
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
            placeholder="Search public groups"
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
              <Text numberOfLines={1} style={styles.storyLabel}>
                {profile.username ? profile.username : profile.displayName}
              </Text>
              <Text numberOfLines={1} style={styles.storyHint}>
                {profile.homeBase || "Public profile"}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {!vm.searchQuery.trim() ? (
          <View style={styles.sectionBlock}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Trip requests</Text>
              <Text style={styles.sectionMeta}>{vm.openTripRequests.length} open</Text>
            </View>
            <Text style={[styles.sectionSupportText, { color: colors.textSecondary }]}>
              Quick travel ideas that can turn into a real group when the vibe is right.
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
                  Няма active trip requests
                </Text>
                <Text style={[styles.requestEmptyText, { color: colors.textSecondary }]}>
                  Пусни идея за trip, събери interested users и после я превърни в група.
                </Text>
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={vm.openRequestComposer}
                  style={[styles.inlineCreateRequestButton, { backgroundColor: colors.accent }]}
                >
                  <MaterialIcons color="#FFFFFF" name="add" size={18} />
                  <Text style={styles.inlineCreateRequestButtonText}>New trip request</Text>
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
            <Text style={styles.sectionTitle}>Search results</Text>
            <Text style={styles.sectionMeta}>{vm.searchedPublicGroups.length} public groups</Text>

            {vm.searchedPublicGroups.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateTitle}>Няма съвпадения</Text>
                <Text style={styles.emptyStateText}>
                  Опитай с друго име на група, creator или тема.
                </Text>
              </View>
            ) : (
              vm.searchedPublicGroups.map((group) => (
                <GroupRow
                  actionLabel={group.memberIds.includes(vm.userId) ? "Joined" : "Join"}
                  actionLoading={vm.joiningGroupId === group.id}
                  badge="Public"
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
          <Text style={styles.sectionTitle}>Messages</Text>
          <Text style={styles.sectionMeta}>
            Requests {vm.invitedGroups.length ? `(${vm.invitedGroups.length})` : ""}
          </Text>
        </View>

        {vm.invitedGroups.length > 0 ? (
          vm.invitedGroups.map((group) => (
            <GroupRow
              actionLabel="Accept"
              actionLoading={vm.joiningGroupId === group.id}
              badge="Invite"
              group={group}
              key={`invite-${group.id}`}
              onActionPress={() => vm.joinGroup(group.id)}
              preview={`${group.creatorLabel} invited you${group.description ? ` • ${group.description}` : ""}`}
              rightMeta="Request"
            />
          ))
        ) : null}

        {vm.joinedGroups.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateTitle}>Още нямаш групи</Text>
            <Text style={styles.emptyStateText}>
              Създай група или приеми invite, за да се появят тук като messages.
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
                badge={group.accessType === "private" ? "Private" : "Public"}
                actionLabel={group.creatorId === vm.userId ? "Delete" : undefined}
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
              <Text style={styles.sectionTitle}>Public groups</Text>
              <Text style={styles.sectionMeta}>{vm.publicGroups.length} available</Text>
            </View>

            {vm.publicGroups.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateTitle}>Няма public групи</Text>
                <Text style={styles.emptyStateText}>
                  Първата public група ще се появи тук и ще може да бъде намирана през search.
                </Text>
              </View>
            ) : (
              vm.publicGroups
                .filter((group) => !group.memberIds.includes(vm.userId))
                .slice(0, 5)
                .map((group) => (
                  <GroupRow
                    actionLabel="Join"
                    actionLoading={vm.joiningGroupId === group.id}
                    badge="Public"
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
      </DismissKeyboard>

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
    backgroundColor: "#F0F0F0",
    flex: 1,
  },
  loader: {
    alignItems: "center",
    backgroundColor: "#F0F0F0",
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
    color: "#1A1A1A",
    ...TypeScale.displayMd,
  },
  pageSubtitle: {
    ...TypeScale.bodyMd,
    color: "#6B7280",
    marginTop: 6,
  },
  topBarCircleButton: {
    alignItems: "center",
    backgroundColor: "#2D6A4F",
    borderColor: "#D1D5DB",
    borderRadius: Radius["3xl"],
    borderWidth: 3,
    height: 56,
    justifyContent: "center",
    ...shadow("lg"),
    width: 56,
  },
  searchShell: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E8E8E8",
    borderRadius: Radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  searchInput: {
    color: "#1A1A1A",
    flex: 1,
    ...TypeScale.bodyLg,
    marginLeft: Spacing.md,
  },
  feedbackCardError: {
    backgroundColor: "#FFF1EF",
    borderColor: "#F0B6AE",
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginBottom: Spacing.md,
    padding: Spacing.md,
  },
  feedbackTextError: {
    ...TypeScale.bodyMd,
    color: "#991B1B",
  },
  feedbackCardSuccess: {
    backgroundColor: "#F0FFF4",
    borderColor: "#A7F3D0",
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginBottom: Spacing.md,
    padding: Spacing.md,
  },
  feedbackTextSuccess: {
    ...TypeScale.bodyMd,
    color: "#2D6A4F",
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
    color: "#1A1A1A",
    fontWeight: FontWeight.bold,
    marginTop: Spacing.sm,
    textAlign: "center",
  },
  storyHint: {
    ...TypeScale.labelLg,
    color: "#9CA3AF",
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
    color: "#1A1A1A",
    fontWeight: FontWeight.extrabold,
  },
  sectionMeta: {
    ...TypeScale.bodyMd,
    color: "#6B7280",
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
    color: "#FFFFFF",
    fontWeight: FontWeight.extrabold,
  },
  emptyState: {
    alignItems: "center",
    backgroundColor: "#F8F8F8",
    borderColor: "#E8E8E8",
    borderRadius: Radius["2xl"],
    borderWidth: 1,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing["2xl"],
  },
  emptyStateTitle: {
    ...TypeScale.titleLg,
    color: "#1A1A1A",
    fontWeight: FontWeight.extrabold,
    textAlign: "center",
  },
  emptyStateText: {
    ...TypeScale.bodyMd,
    color: "#6B7280",
    marginTop: Spacing.sm,
    textAlign: "center",
  },
});
