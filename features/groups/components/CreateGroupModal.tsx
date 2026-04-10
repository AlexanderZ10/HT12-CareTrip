import { MaterialIcons } from "@expo/vector-icons";
import React from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { Avatar } from "../../../components/Avatar";
import { useAppTheme } from "../../../components/app-theme-provider";
import {
  FontWeight,
  Radius,
  Spacing,
  TypeScale,
} from "../../../constants/design-system";
import { createSuggestedGroupKey, normalizeGroupJoinKey, type GroupAccessType } from "../../../utils/groups";
import type { PublicProfile } from "../../../utils/public-profiles";

type ComposerUserRowProps = {
  profile: PublicProfile;
  selected: boolean;
  onPress: () => void;
};

function ComposerUserRow({ profile, selected, onPress }: ComposerUserRowProps) {
  const { colors } = useAppTheme();

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      style={[
        styles.composerUserRow,
        { backgroundColor: colors.cardAlt, borderColor: colors.border },
      ]}
    >
      <Avatar
        label={profile.displayName || profile.username || "Traveler"}
        photoUrl={profile.photoUrl}
        size={48}
      />
      <View style={styles.composerUserTextWrap}>
        <Text style={[styles.composerUserName, { color: colors.textPrimary }]}>
          {profile.displayName}
        </Text>
        <Text style={[styles.composerUserMeta, { color: colors.textSecondary }]}>
          @{profile.username || "traveler"}
          {profile.homeBase ? ` • ${profile.homeBase}` : ""}
        </Text>
      </View>
      <View
        style={[
          styles.selectBubble,
          { borderColor: colors.border },
          selected && {
            alignItems: "center" as const,
            backgroundColor: colors.accent,
            borderColor: colors.accent,
            justifyContent: "center" as const,
          },
        ]}
      >
        {selected ? (
          <MaterialIcons color={colors.buttonTextOnAction} name="check" size={16} />
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

type CreateGroupModalProps = {
  visible: boolean;
  onClose: () => void;
  groupName: string;
  onGroupNameChange: (value: string) => void;
  groupDescription: string;
  onGroupDescriptionChange: (value: string) => void;
  groupAccess: GroupAccessType;
  onGroupAccessChange: (value: GroupAccessType) => void;
  groupJoinKey: string;
  onGroupJoinKeyChange: (value: string) => void;
  inviteSearchQuery: string;
  onInviteSearchQueryChange: (value: string) => void;
  selectedInviteIds: string[];
  onToggleInvite: (profileId: string) => void;
  filteredInviteProfiles: PublicProfile[];
  publicProfilesById: Record<string, PublicProfile>;
  saving: boolean;
  onCreatePress: () => void;
};

export function CreateGroupModal({
  visible,
  onClose,
  groupName,
  onGroupNameChange,
  groupDescription,
  onGroupDescriptionChange,
  groupAccess,
  onGroupAccessChange,
  groupJoinKey,
  onGroupJoinKeyChange,
  inviteSearchQuery,
  onInviteSearchQueryChange,
  selectedInviteIds,
  onToggleInvite,
  filteredInviteProfiles,
  publicProfilesById,
  saving,
  onCreatePress,
}: CreateGroupModalProps) {
  const { colors } = useAppTheme();

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <KeyboardAvoidingView
        style={[styles.modalBackdrop, { backgroundColor: colors.overlay }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                New group
              </Text>
              <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
                Pick public users, choose access, and create the chat.
              </Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={onClose}
              style={[styles.modalClose, { backgroundColor: colors.inputBackground }]}
            >
              <MaterialIcons color={colors.textSecondary} name="close" size={22} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <TextInput
              onChangeText={onGroupNameChange}
              placeholder="Group name"
              placeholderTextColor={colors.inputPlaceholder}
              style={[
                styles.modalInput,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.inputBorder,
                  color: colors.textPrimary,
                },
              ]}
              value={groupName}
            />

            <TextInput
              multiline
              numberOfLines={4}
              onChangeText={onGroupDescriptionChange}
              placeholder="What is this group about?"
              placeholderTextColor={colors.inputPlaceholder}
              style={[
                styles.modalInput,
                styles.modalTextarea,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.inputBorder,
                  color: colors.textPrimary,
                },
              ]}
              textAlignVertical="top"
              value={groupDescription}
            />

            <View style={styles.accessRow}>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => {
                  onGroupAccessChange("public");
                  onGroupJoinKeyChange("");
                }}
                style={[
                  styles.accessChip,
                  { backgroundColor: colors.inputBackground },
                  groupAccess === "public" && { backgroundColor: colors.accent },
                ]}
              >
                <MaterialIcons
                  color={
                    groupAccess === "public"
                      ? colors.buttonTextOnAction
                      : colors.textSecondary
                  }
                  name="public"
                  size={16}
                />
                <Text
                  style={[
                    styles.accessChipText,
                    { color: colors.textSecondary },
                    groupAccess === "public" && {
                      color: colors.buttonTextOnAction,
                    },
                  ]}
                >
                  Public
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => {
                  onGroupAccessChange("private");
                  if (!groupJoinKey) {
                    onGroupJoinKeyChange(createSuggestedGroupKey());
                  }
                }}
                style={[
                  styles.accessChip,
                  { backgroundColor: colors.inputBackground },
                  groupAccess === "private" && styles.accessChipSelectedPrivate,
                ]}
              >
                <MaterialIcons
                  color={
                    groupAccess === "private"
                      ? colors.buttonTextOnAction
                      : colors.textSecondary
                  }
                  name="lock-outline"
                  size={16}
                />
                <Text
                  style={[
                    styles.accessChipText,
                    { color: colors.textSecondary },
                    groupAccess === "private" && {
                      color: colors.buttonTextOnAction,
                    },
                  ]}
                >
                  Private
                </Text>
              </TouchableOpacity>
            </View>

            {groupAccess === "private" ? (
              <View
                style={[
                  styles.privateKeyComposerCard,
                  {
                    backgroundColor: colors.warningBackground,
                    borderColor: colors.warningBorder,
                  },
                ]}
              >
                <View style={styles.privateKeyRow}>
                  <Text
                    style={[styles.privateKeyLabel, { color: colors.warningText }]}
                  >
                    Private key
                  </Text>
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() =>
                      onGroupJoinKeyChange(createSuggestedGroupKey())
                    }
                  >
                    <Text
                      style={[styles.privateKeyGenerate, { color: colors.accent }]}
                    >
                      Generate
                    </Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  autoCapitalize="characters"
                  onChangeText={(value) =>
                    onGroupJoinKeyChange(normalizeGroupJoinKey(value))
                  }
                  placeholder="TEAM2026"
                  placeholderTextColor={colors.inputPlaceholder}
                  style={[
                    styles.modalInput,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.inputBorder,
                      color: colors.textPrimary,
                    },
                  ]}
                  value={groupJoinKey}
                />
              </View>
            ) : null}

            <Text style={[styles.inviteTitle, { color: colors.textPrimary }]}>
              Invite public users
            </Text>

            {selectedInviteIds.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.selectedInvitesRow}
              >
                {selectedInviteIds.map((inviteId) => {
                  const invitedProfile = publicProfilesById[inviteId];

                  if (!invitedProfile) {
                    return null;
                  }

                  return (
                    <TouchableOpacity
                      activeOpacity={0.9}
                      key={inviteId}
                      onPress={() => onToggleInvite(inviteId)}
                      style={[
                        styles.selectedInviteChip,
                        { backgroundColor: colors.inputBackground },
                      ]}
                    >
                      <Avatar
                        label={invitedProfile.displayName}
                        photoUrl={invitedProfile.photoUrl}
                        size={36}
                      />
                      <Text
                        style={[
                          styles.selectedInviteText,
                          { color: colors.textPrimary },
                        ]}
                      >
                        {invitedProfile.username || invitedProfile.displayName}
                      </Text>
                      <MaterialIcons
                        color={colors.textSecondary}
                        name="close"
                        size={16}
                      />
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : null}

            <TextInput
              onChangeText={onInviteSearchQueryChange}
              placeholder="Search public users"
              placeholderTextColor={colors.inputPlaceholder}
              style={[
                styles.modalInput,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.inputBorder,
                  color: colors.textPrimary,
                },
              ]}
              value={inviteSearchQuery}
            />

            {filteredInviteProfiles.length === 0 ? (
              <View
                style={[
                  styles.modalEmptyState,
                  {
                    backgroundColor: colors.cardAlt,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.modalEmptyStateTitle,
                    { color: colors.textPrimary },
                  ]}
                >
                  Няма users за показване
                </Text>
                <Text
                  style={[
                    styles.modalEmptyStateText,
                    { color: colors.textSecondary },
                  ]}
                >
                  Покажи public профили от Profile таба или промени search-а.
                </Text>
              </View>
            ) : (
              filteredInviteProfiles.map((profile) => (
                <ComposerUserRow
                  key={profile.id}
                  onPress={() => onToggleInvite(profile.uid)}
                  profile={profile}
                  selected={selectedInviteIds.includes(profile.uid)}
                />
              ))
            )}
          </ScrollView>

          <TouchableOpacity
            activeOpacity={0.9}
            disabled={saving}
            onPress={onCreatePress}
            style={[
              styles.createButton,
              { backgroundColor: colors.accent },
              saving && styles.createButtonDisabled,
            ]}
          >
            <Text
              style={[styles.createButtonText, { color: colors.buttonTextOnAction }]}
            >
              {saving ? "Creating..." : "Create group"}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: Radius["3xl"],
    borderTopRightRadius: Radius["3xl"],
    maxHeight: "88%",
    paddingBottom: Radius["3xl"],
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  modalHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.lg,
  },
  modalTitle: {
    ...TypeScale.headingLg,
    fontWeight: FontWeight.extrabold,
  },
  modalSubtitle: {
    ...TypeScale.bodyMd,
    marginTop: Spacing.xs,
  },
  modalClose: {
    alignItems: "center",
    borderRadius: Radius.full,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  modalInput: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    ...TypeScale.titleSm,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  modalTextarea: {
    minHeight: 94,
  },
  accessRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  accessChip: {
    alignItems: "center",
    borderRadius: Radius.full,
    flex: 1,
    flexDirection: "row",
    gap: Spacing.sm,
    justifyContent: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  accessChipSelectedPrivate: {
    backgroundColor: "#BA7517",
  },
  accessChipText: {
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.bold,
  },
  privateKeyComposerCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginTop: Spacing.md,
    padding: Spacing.md,
  },
  privateKeyRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  privateKeyLabel: {
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.extrabold,
  },
  privateKeyGenerate: {
    ...TypeScale.bodySm,
    fontWeight: FontWeight.bold,
  },
  inviteTitle: {
    ...TypeScale.titleMd,
    fontWeight: FontWeight.extrabold,
    marginTop: Spacing.lg,
  },
  selectedInvitesRow: {
    marginTop: Spacing.md,
    maxHeight: 62,
  },
  selectedInviteChip: {
    alignItems: "center",
    borderRadius: Radius.full,
    flexDirection: "row",
    gap: Spacing.sm,
    marginRight: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  selectedInviteText: {
    ...TypeScale.bodySm,
    fontWeight: FontWeight.bold,
  },
  composerUserRow: {
    alignItems: "center",
    borderRadius: Radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  composerUserTextWrap: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  composerUserName: {
    ...TypeScale.titleMd,
    fontWeight: FontWeight.extrabold,
  },
  composerUserMeta: {
    ...TypeScale.bodySm,
    marginTop: Spacing.xs,
  },
  selectBubble: {
    borderRadius: Radius.md,
    borderWidth: 1,
    height: Spacing["2xl"],
    width: Spacing["2xl"],
  },
  modalEmptyState: {
    alignItems: "center",
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
  },
  modalEmptyStateTitle: {
    ...TypeScale.titleMd,
    fontWeight: FontWeight.extrabold,
    textAlign: "center",
  },
  modalEmptyStateText: {
    ...TypeScale.bodyMd,
    marginTop: Spacing.sm,
    textAlign: "center",
  },
  createButton: {
    alignItems: "center",
    borderRadius: Radius.lg,
    justifyContent: "center",
    marginTop: Spacing.lg,
    minHeight: 54,
  },
  createButtonDisabled: {
    opacity: 0.7,
  },
  createButtonText: {
    ...TypeScale.titleSm,
    fontWeight: FontWeight.extrabold,
  },
});
