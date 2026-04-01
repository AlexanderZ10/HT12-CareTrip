import { MaterialIcons } from "@expo/vector-icons";
import React from "react";
import {
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";

import { useAppLanguage } from "../../../components/app-language-provider";
import { type GroupChatSharedTrip } from "../../../utils/group-chat";
import { type SavedTrip } from "../../../utils/saved-trips";
import { type TravelGroup } from "../../../utils/groups";
import {
  buildSharedTripDetailsText,
  getAvatarColor,
  getInitials,
  hasMeaningfulDescription,
} from "../helpers";
import { styles } from "../screen-styles";

interface MemberRow {
  avatarUrl: string;
  id: string;
  isCreator: boolean;
  label: string;
  username: string;
}

interface GroupDetailModalsProps {
  colors: Record<string, string>;
  expenseAmount: string;
  expenseSheetVisible: boolean;
  expenseTitle: string;
  group: TravelGroup | null;
  groupDescriptionInput: string;
  groupDetailsVisible: boolean;
  groupJoinKeyInput: string;
  groupNameInput: string;
  isCreator: boolean;
  memberRows: MemberRow[];
  memberSearchQuery: string;
  membersLabel: string;
  onAddExpense: () => void;
  onChangeExpenseAmount: (value: string) => void;
  onChangeExpenseTitle: (value: string) => void;
  onChangeGroupDescriptionInput: (value: string) => void;
  onChangeGroupJoinKeyInput: (value: string) => void;
  onChangeGroupNameInput: (value: string) => void;
  onChangeMemberSearchQuery: (value: string) => void;
  onCloseExpenseSheet: () => void;
  onCloseGroupDetails: () => void;
  onClosePreviewTrip: () => void;
  onCloseShareSheet: () => void;
  onNavigateToSaved: () => void;
  onOpenPlannerTicket: (bookingUrl: string) => void;
  onPickGroupPhoto: () => void;
  onRemoveMember: (memberId: string) => void;
  onResetGroupPhoto: () => void;
  onSaveGroupSettings: () => void;
  onSaveSharedTripToHome: (sharedTrip: GroupChatSharedTrip) => void;
  onShareTrip: (trip: SavedTrip) => void;
  previewTrip: GroupChatSharedTrip | null;
  profileName: string;
  removingMemberId: string | null;
  savedTrips: SavedTrip[];
  savingExpense: boolean;
  savingGroupSettings: boolean;
  savingSharedTripKey: string | null;
  shareSheetVisible: boolean;
  sharingTripId: string | null;
  updatingGroupPhoto: boolean;
}

export function GroupDetailModals({
  colors,
  expenseAmount,
  expenseSheetVisible,
  expenseTitle,
  group,
  groupDescriptionInput,
  groupDetailsVisible,
  groupJoinKeyInput,
  groupNameInput,
  isCreator,
  memberRows,
  memberSearchQuery,
  membersLabel,
  onAddExpense,
  onChangeExpenseAmount,
  onChangeExpenseTitle,
  onChangeGroupDescriptionInput,
  onChangeGroupJoinKeyInput,
  onChangeGroupNameInput,
  onChangeMemberSearchQuery,
  onCloseExpenseSheet,
  onCloseGroupDetails,
  onClosePreviewTrip,
  onCloseShareSheet,
  onNavigateToSaved,
  onOpenPlannerTicket,
  onPickGroupPhoto,
  onRemoveMember,
  onResetGroupPhoto,
  onSaveGroupSettings,
  onSaveSharedTripToHome,
  onShareTrip,
  previewTrip,
  profileName,
  removingMemberId,
  savedTrips,
  savingExpense,
  savingGroupSettings,
  savingSharedTripKey,
  shareSheetVisible,
  sharingTripId,
  updatingGroupPhoto,
}: GroupDetailModalsProps) {
  const { t } = useAppLanguage();

  return (
    <>
      {/* Group details modal */}
      <Modal
        animationType="slide"
        onRequestClose={onCloseGroupDetails}
        visible={groupDetailsVisible}
      >
        <SafeAreaView style={[styles.detailsScreen, { backgroundColor: colors.screenSoft }]} edges={["top"]}>
          <View style={[styles.detailsTopBar, { borderBottomColor: colors.border }]}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={onCloseGroupDetails}
              style={styles.backButton}
            >
              <MaterialIcons color={colors.textPrimary} name="close" size={22} />
            </TouchableOpacity>
            <Text style={[styles.detailsTopBarTitle, { color: colors.textPrimary }]}>{t("groupDetail.groupInfo")}</Text>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView
            contentContainerStyle={styles.groupDetailsContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.detailsHeroSection}>
              <TouchableOpacity
                activeOpacity={isCreator ? 0.92 : 1}
                disabled={!isCreator || updatingGroupPhoto}
                onPress={onPickGroupPhoto}
                style={styles.groupDetailsPhotoWrap}
              >
                {group?.photoUrl ? (
                  <Image
                    source={{ uri: group.photoUrl }}
                    style={styles.groupDetailsPhoto}
                    contentFit="cover"
                  />
                ) : (
                  <View
                    style={[
                      styles.groupDetailsPhotoFallback,
                      { backgroundColor: getAvatarColor(group?.name ?? "Group") },
                    ]}
                  >
                    <Text style={styles.groupDetailsPhotoFallbackText}>
                      {getInitials(group?.name ?? "Group")}
                    </Text>
                  </View>
                )}
                {isCreator ? (
                  <View style={styles.groupDetailsPhotoBadge}>
                    <MaterialIcons
                      color="#8B5611"
                      name={group?.photoUrl ? "photo-camera" : "add-a-photo"}
                      size={16}
                    />
                  </View>
                ) : null}
              </TouchableOpacity>

              <Text numberOfLines={2} style={[styles.detailsHeroTitle, { color: colors.textPrimary }]}>
                {group?.name}
              </Text>
              <Text style={[styles.detailsHeroMeta, { color: colors.textSecondary }]}>
                {group?.accessType === "private" ? t("common.private") : t("common.public")} • {membersLabel}
              </Text>
              {isCreator && group?.photoUrl ? (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={onResetGroupPhoto}
                  style={styles.groupDetailsSecondaryAction}
                >
                  <Text style={[styles.groupDetailsSecondaryActionText, { color: colors.textMuted }]}>
                    {updatingGroupPhoto ? t("groupDetail.updating") : t("groupDetail.resetPhoto")}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {group?.description && hasMeaningfulDescription(group.description) ? (
              <View style={[styles.detailsSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.detailsSectionTitle, { color: colors.textMuted }]}>{t("groupDetail.description")}</Text>
                <Text style={[styles.descriptionText, { color: colors.textPrimary }]}>
                  {group.description}
                </Text>
              </View>
            ) : null}

            <View style={[styles.detailsSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.membersHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.detailsSectionTitle, { color: colors.textMuted }]}>{t("groupDetail.members")}</Text>
                  <Text style={[styles.membersSubtitle, { color: colors.textSecondary }]}>
                    {t("groupDetail.membersHint")}
                  </Text>
                </View>
                <View style={[styles.membersCountBadge, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
                  <Text style={[styles.membersCountText, { color: colors.textPrimary }]}>{membersLabel}</Text>
                </View>
              </View>

                <View style={styles.membersSearchShell}>
                  <MaterialIcons color="#7B8A6D" name="search" size={18} />
                  <TextInput
                    style={styles.membersSearchInput}
                    value={memberSearchQuery}
                    onChangeText={onChangeMemberSearchQuery}
                    placeholder={t("groupDetail.searchMembers")}
                    placeholderTextColor="#809071"
                  />
                </View>

                {memberRows.length === 0 ? (
                  <Text style={styles.membersEmptyText}>{t("groupDetail.noMembersMatch")}</Text>
                ) : (
                  memberRows.map((member) => (
                    <View key={member.id} style={styles.memberRow}>
                      {member.avatarUrl ? (
                        <Image
                          source={{ uri: member.avatarUrl }}
                          style={styles.memberAvatarImage}
                          contentFit="cover"
                        />
                      ) : (
                        <View style={styles.memberAvatarCircle}>
                          <Text style={styles.memberAvatarText}>{getInitials(member.label)}</Text>
                        </View>
                      )}

                      <View style={styles.memberTextWrap}>
                        <Text style={styles.memberName}>
                          {member.label}
                          {member.isCreator ? ` • ${t("groupDetail.creator")}` : ""}
                        </Text>
                        <Text style={styles.memberMeta}>
                          {member.username ? `@${member.username}` : member.id.slice(0, 8)}
                        </Text>
                      </View>

                      {isCreator && !member.isCreator ? (
                        <TouchableOpacity
                          style={[
                            styles.memberActionButton,
                            removingMemberId === member.id && styles.memberActionButtonDisabled,
                          ]}
                          onPress={() => {
                            onRemoveMember(member.id);
                          }}
                          disabled={removingMemberId === member.id}
                          activeOpacity={0.9}
                        >
                          <Text style={styles.memberActionButtonText}>
                            {removingMemberId === member.id ? t("common.removing") : t("common.remove")}
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ))
                )}
            </View>

            {isCreator ? (
              <View style={[styles.detailsSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.detailsSectionTitle, { color: colors.textMuted }]}>{t("groupDetail.groupSettings")}</Text>
                <Text style={[styles.settingsSubtitle, { color: colors.textSecondary }]}>
                  {t("groupDetail.groupSettingsHint")}
                </Text>

                  <Text style={styles.settingsLabel}>{t("groupDetail.groupName")}</Text>
                  <TextInput
                    style={styles.settingsInput}
                    value={groupNameInput}
                    onChangeText={onChangeGroupNameInput}
                    placeholder={t("groupDetail.groupName")}
                    placeholderTextColor="#809071"
                  />

                  <Text style={styles.settingsLabel}>{t("groupDetail.description")}</Text>
                  <TextInput
                    multiline
                    numberOfLines={4}
                    style={[styles.settingsInput, styles.groupDescriptionInput]}
                    value={groupDescriptionInput}
                    onChangeText={onChangeGroupDescriptionInput}
                    placeholder={t("groupDetail.description")}
                    placeholderTextColor="#809071"
                    textAlignVertical="top"
                  />

                  {group?.accessType === "private" ? (
                    <>
                      <Text style={styles.settingsLabel}>{t("groupDetail.privateCode")}</Text>
                      <TextInput
                        style={styles.settingsInput}
                        value={groupJoinKeyInput}
                        onChangeText={onChangeGroupJoinKeyInput}
                        placeholder={t("groupDetail.privateCode")}
                        placeholderTextColor="#809071"
                        autoCapitalize="characters"
                      />
                    </>
                  ) : null}

                  <TouchableOpacity
                    style={[
                      styles.settingsSaveButton,
                      savingGroupSettings && styles.settingsSaveButtonDisabled,
                    ]}
                    onPress={onSaveGroupSettings}
                    disabled={savingGroupSettings}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.settingsSaveButtonText}>
                      {savingGroupSettings ? t("common.saving") : t("groupDetail.saveSettings")}
                    </Text>
                  </TouchableOpacity>
              </View>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Share sheet modal */}
      <Modal
        animationType="fade"
        onRequestClose={onCloseShareSheet}
        transparent
        visible={shareSheetVisible}
      >
        <View style={[styles.modalOverlay, { backgroundColor: colors.modalOverlay }]}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={onCloseShareSheet}
            style={styles.modalBackdrop}
          />
          <View style={styles.sheetCard}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderTextWrap}>
                <Text style={styles.sheetTitle}>{t("groupDetail.shareFromTrips")}</Text>
                <Text style={styles.sheetSubtitle}>
                  {t("groupDetail.selectTripToShare")}
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={onCloseShareSheet}
                style={styles.sheetCloseButton}
              >
                <MaterialIcons color="#1A1A1A" name="close" size={20} />
              </TouchableOpacity>
            </View>

            {savedTrips.length === 0 ? (
              <View style={styles.sheetEmptyState}>
                <Text style={styles.sheetEmptyTitle}>{t("groupDetail.noTripsYet")}</Text>
                <Text style={styles.sheetEmptyText}>
                  {t("groupDetail.noTripsHint")}
                </Text>
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={onNavigateToSaved}
                  style={styles.sheetPrimaryButton}
                >
                  <Text style={styles.sheetPrimaryButtonText}>{t("groupDetail.openTrips")}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView
                contentContainerStyle={styles.sheetTripsContent}
                showsVerticalScrollIndicator={false}
              >
                {savedTrips.map((trip) => (
                  <View key={trip.id} style={styles.sheetTripCard}>
                    <View style={styles.sheetTripTopRow}>
                      <View
                        style={[
                          styles.sheetTripSourceBadge,
                          trip.source === "home"
                            ? styles.sharedTripHomeBadge
                            : styles.sharedTripDiscoverBadge,
                        ]}
                      >
                        <Text
                          style={[
                            styles.sheetTripSourceBadgeText,
                            trip.source === "home"
                              ? styles.sharedTripHomeBadgeText
                              : styles.sharedTripDiscoverBadgeText,
                          ]}
                        >
                          {trip.source === "home" ? t("common.homePlanner") : t("common.discover")}
                        </Text>
                      </View>
                      <Text style={styles.sheetTripDate}>
                        {new Intl.DateTimeFormat("bg-BG", {
                          day: "2-digit",
                          month: "short",
                        }).format(new Date(trip.createdAtMs))}
                      </Text>
                    </View>
                    <Text style={styles.sheetTripTitle}>{trip.title}</Text>
                    <Text style={styles.sheetTripDestination}>{trip.destination}</Text>
                    <View style={styles.sheetTripMetaRow}>
                      {trip.duration ? <Text style={styles.sheetTripMetaText}>{trip.duration}</Text> : null}
                      {trip.budget ? <Text style={styles.sheetTripMetaText}>{trip.budget}</Text> : null}
                    </View>
                    {trip.summary ? (
                      <Text numberOfLines={2} style={styles.sheetTripSummary}>
                        {trip.summary}
                      </Text>
                    ) : null}
                    <TouchableOpacity
                      activeOpacity={0.9}
                      disabled={sharingTripId !== null}
                      onPress={() => {
                        onShareTrip(trip);
                      }}
                      style={[
                        styles.sheetShareButton,
                        sharingTripId === trip.id && styles.sheetShareButtonDisabled,
                      ]}
                    >
                      <Text style={styles.sheetShareButtonText}>
                        {sharingTripId === trip.id ? t("groupDetail.sharing") : t("groupDetail.shareToGroup")}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Preview trip modal */}
      <Modal
        animationType="fade"
        onRequestClose={onClosePreviewTrip}
        transparent
        visible={!!previewTrip}
      >
        <View style={[styles.modalOverlay, { backgroundColor: colors.modalOverlay }]}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={onClosePreviewTrip}
            style={styles.modalBackdrop}
          />
          <View style={styles.previewCard}>
            <View style={styles.previewHeader}>
              <View style={styles.previewHeaderTextWrap}>
                <Text style={styles.previewTitle}>{previewTrip?.title}</Text>
                <Text style={styles.previewDestination}>{previewTrip?.destination}</Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={onClosePreviewTrip}
                style={styles.sheetCloseButton}
              >
                <MaterialIcons color="#1A1A1A" name="close" size={20} />
              </TouchableOpacity>
            </View>

            <View style={styles.previewMetaRow}>
              <View
                style={[
                  styles.sheetTripSourceBadge,
                  previewTrip?.source === "home"
                    ? styles.sharedTripHomeBadge
                    : styles.sharedTripDiscoverBadge,
                ]}
              >
                <Text
                  style={[
                    styles.sheetTripSourceBadgeText,
                    previewTrip?.source === "home"
                      ? styles.sharedTripHomeBadgeText
                      : styles.sharedTripDiscoverBadgeText,
                  ]}
                >
                  {previewTrip?.source === "home" ? t("common.homePlanner") : t("common.discover")}
                </Text>
              </View>
              {previewTrip?.duration ? <Text style={styles.previewMetaText}>{previewTrip.duration}</Text> : null}
              {previewTrip?.budget ? <Text style={styles.previewMetaText}>{previewTrip.budget}</Text> : null}
            </View>

            {previewTrip?.summary ? <Text style={styles.previewSummary}>{previewTrip.summary}</Text> : null}

            {previewTrip?.linkedTransports?.length ? (
              <View style={styles.previewLinkedTransportSection}>
                <Text style={styles.previewLinkedTransportTitle}>{t("groupDetail.plannerTicketLinks")}</Text>
                {previewTrip.linkedTransports.map((linkedTransport) => (
                  <View key={linkedTransport.itemKey} style={styles.previewLinkedTransportCard}>
                    <View style={styles.previewLinkedTransportTopRow}>
                      <View style={styles.previewLinkedTransportTextWrap}>
                        <Text style={styles.previewLinkedTransportCardTitle}>
                          {linkedTransport.title}
                        </Text>
                        {linkedTransport.route ? (
                          <Text
                            numberOfLines={2}
                            style={styles.previewLinkedTransportRoute}
                          >
                            {linkedTransport.route}
                          </Text>
                        ) : null}
                      </View>
                      <Text style={styles.previewLinkedTransportAmount}>
                        {linkedTransport.amountLabel}
                      </Text>
                    </View>
                    <View style={styles.previewLinkedTransportMetaRow}>
                      {linkedTransport.duration ? (
                        <Text style={styles.previewLinkedTransportMetaText}>
                          {linkedTransport.duration}
                        </Text>
                      ) : null}
                      {linkedTransport.sourceLabel ? (
                        <Text style={styles.previewLinkedTransportMetaText}>
                          {linkedTransport.sourceLabel}
                        </Text>
                      ) : null}
                    </View>
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() => {
                        onOpenPlannerTicket(linkedTransport.bookingUrl);
                      }}
                      style={styles.previewLinkedTransportButton}
                    >
                      <MaterialIcons color="#6B7280" name="open-in-new" size={16} />
                      <Text style={styles.previewLinkedTransportButtonText}>{t("groupDetail.openTicketLink")}</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : null}

            <ScrollView
              contentContainerStyle={styles.previewDetailsContent}
              showsVerticalScrollIndicator={false}
              style={styles.previewDetailsScroll}
            >
              <Text style={styles.previewDetailsText}>
                {buildSharedTripDetailsText(previewTrip)}
              </Text>
            </ScrollView>

            {previewTrip ? (
              <TouchableOpacity
                style={[
                  styles.previewSaveButton,
                  savingSharedTripKey === previewTrip.sourceKey &&
                    styles.previewSaveButtonDisabled,
                ]}
                onPress={() => {
                  onSaveSharedTripToHome(previewTrip);
                }}
                disabled={savingSharedTripKey === previewTrip.sourceKey}
                activeOpacity={0.9}
              >
                <Text style={styles.previewSaveButtonText}>
                  {savingSharedTripKey === previewTrip.sourceKey
                    ? t("common.saving")
                    : t("groupDetail.saveToHome")}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Expense sheet modal */}
      <Modal
        animationType="fade"
        onRequestClose={onCloseExpenseSheet}
        transparent
        visible={expenseSheetVisible}
      >
        <View style={[styles.modalOverlay, { backgroundColor: colors.modalOverlay }]}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={onCloseExpenseSheet}
            style={styles.modalBackdrop}
          />
          <View style={styles.sheetCard}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderTextWrap}>
                <Text style={styles.sheetTitle}>{t("groupDetail.addExpense")}</Text>
                <Text style={styles.sheetSubtitle}>
                  {`${t("groupDetail.expenseSplit")} — ${membersLabel.toLowerCase()}`}
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={onCloseExpenseSheet}
                style={styles.sheetCloseButton}
              >
                <MaterialIcons color="#1A1A1A" name="close" size={20} />
              </TouchableOpacity>
            </View>

            <TextInput
              onChangeText={onChangeExpenseTitle}
              placeholder={t("groupDetail.expenseTitlePlaceholder")}
              placeholderTextColor="#809071"
              style={styles.sheetTextInput}
              value={expenseTitle}
            />
            <TextInput
              keyboardType={Platform.OS === "ios" ? "decimal-pad" : "numeric"}
              onChangeText={onChangeExpenseAmount}
              placeholder={t("groupDetail.expenseAmountPlaceholder")}
              placeholderTextColor="#809071"
              style={styles.sheetTextInput}
              value={expenseAmount}
            />

            <View style={styles.expensePreviewCard}>
              <Text style={styles.expensePreviewKicker}>{t("groupDetail.preview")}</Text>
              <Text style={styles.expensePreviewTitle}>
                {expenseTitle.trim() || t("groupDetail.expensePreviewDefault")}
              </Text>
              <Text style={styles.expensePreviewMeta}>{t("groupDetail.paidBy")} {profileName}</Text>
              <View style={styles.expensePreviewPills}>
                <View style={styles.expensePreviewPill}>
                  <Text style={styles.expensePreviewPillText}>
                    {expenseAmount.trim() ? `${expenseAmount.trim()} EUR` : "0 EUR"}
                  </Text>
                </View>
                <View style={styles.expensePreviewPill}>
                  <Text style={styles.expensePreviewPillText}>
                    {group?.memberCount ?? 0} {t("groupDetail.travelers")}
                  </Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              activeOpacity={0.9}
              disabled={savingExpense}
              onPress={onAddExpense}
              style={[styles.sheetPrimaryButton, savingExpense && styles.sheetShareButtonDisabled]}
            >
              <Text style={styles.sheetPrimaryButtonText}>
                {savingExpense ? t("groupDetail.adding") : t("groupDetail.addExpense")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}
