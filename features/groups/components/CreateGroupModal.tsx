import { MaterialIcons } from "@expo/vector-icons";
import React from "react";
import {
  Modal,
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
  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={styles.composerUserRow}>
      <Avatar
        label={profile.displayName || profile.username || "Traveler"}
        photoUrl={profile.photoUrl}
        size={48}
      />
      <View style={styles.composerUserTextWrap}>
        <Text style={styles.composerUserName}>{profile.displayName}</Text>
        <Text style={styles.composerUserMeta}>
          @{profile.username || "traveler"}
          {profile.homeBase ? ` • ${profile.homeBase}` : ""}
        </Text>
      </View>
      <View style={[styles.selectBubble, selected && styles.selectBubbleSelected]}>
        {selected ? <MaterialIcons color="#FFFFFF" name="check" size={16} /> : null}
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
      <View style={[styles.modalBackdrop, { backgroundColor: colors.modalOverlay }]}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>New group</Text>
              <Text style={styles.modalSubtitle}>
                Pick public users, choose access, and create the chat.
              </Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={onClose}
              style={styles.modalClose}
            >
              <MaterialIcons color="#374151" name="close" size={22} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <TextInput
              onChangeText={onGroupNameChange}
              placeholder="Group name"
              placeholderTextColor="#9CA3AF"
              style={styles.modalInput}
              value={groupName}
            />

            <TextInput
              multiline
              numberOfLines={4}
              onChangeText={onGroupDescriptionChange}
              placeholder="What is this group about?"
              placeholderTextColor="#9CA3AF"
              style={[styles.modalInput, styles.modalTextarea]}
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
                  groupAccess === "public" && styles.accessChipSelected,
                ]}
              >
                <MaterialIcons
                  color={groupAccess === "public" ? "#FFFFFF" : "#6B7280"}
                  name="public"
                  size={16}
                />
                <Text
                  style={[
                    styles.accessChipText,
                    groupAccess === "public" && styles.accessChipTextSelected,
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
                  groupAccess === "private" && styles.accessChipSelectedPrivate,
                ]}
              >
                <MaterialIcons
                  color={groupAccess === "private" ? "#FFFFFF" : "#6B7280"}
                  name="lock-outline"
                  size={16}
                />
                <Text
                  style={[
                    styles.accessChipText,
                    groupAccess === "private" && styles.accessChipTextSelected,
                  ]}
                >
                  Private
                </Text>
              </TouchableOpacity>
            </View>

            {groupAccess === "private" ? (
              <View style={styles.privateKeyComposerCard}>
                <View style={styles.privateKeyRow}>
                  <Text style={styles.privateKeyLabel}>Private key</Text>
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => onGroupJoinKeyChange(createSuggestedGroupKey())}
                  >
                    <Text style={styles.privateKeyGenerate}>Generate</Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  autoCapitalize="characters"
                  onChangeText={(value) => onGroupJoinKeyChange(normalizeGroupJoinKey(value))}
                  placeholder="TEAM2026"
                  placeholderTextColor="#9CA3AF"
                  style={styles.modalInput}
                  value={groupJoinKey}
                />
              </View>
            ) : null}

            <Text style={styles.inviteTitle}>Invite public users</Text>

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
                      style={styles.selectedInviteChip}
                    >
                      <Avatar
                        label={invitedProfile.displayName}
                        photoUrl={invitedProfile.photoUrl}
                        size={36}
                      />
                      <Text style={styles.selectedInviteText}>
                        {invitedProfile.username || invitedProfile.displayName}
                      </Text>
                      <MaterialIcons color="#6B7280" name="close" size={16} />
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : null}

            <TextInput
              onChangeText={onInviteSearchQueryChange}
              placeholder="Search public users"
              placeholderTextColor="#9CA3AF"
              style={styles.modalInput}
              value={inviteSearchQuery}
            />

            {filteredInviteProfiles.length === 0 ? (
              <View style={styles.modalEmptyState}>
                <Text style={styles.modalEmptyStateTitle}>Няма users за показване</Text>
                <Text style={styles.modalEmptyStateText}>
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
            style={[styles.createButton, saving && styles.createButtonDisabled]}
          >
            <Text style={styles.createButtonText}>
              {saving ? "Creating..." : "Create group"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    backgroundColor: "rgba(0,0,0,0.25)",
    flex: 1,
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#FFFFFF",
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
    color: "#1A1A1A",
    fontWeight: FontWeight.extrabold,
  },
  modalSubtitle: {
    ...TypeScale.bodyMd,
    color: "#6B7280",
    marginTop: Spacing.xs,
  },
  modalClose: {
    alignItems: "center",
    backgroundColor: "#F5F5F5",
    borderRadius: Radius.full,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  modalInput: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E8E8E8",
    borderRadius: Radius.lg,
    borderWidth: 1,
    color: "#1A1A1A",
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
    backgroundColor: "#F5F5F5",
    borderRadius: Radius.full,
    flex: 1,
    flexDirection: "row",
    gap: Spacing.sm,
    justifyContent: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  accessChipSelected: {
    backgroundColor: "#2D6A4F",
  },
  accessChipSelectedPrivate: {
    backgroundColor: "#BA7517",
  },
  accessChipText: {
    ...TypeScale.bodyMd,
    color: "#6B7280",
    fontWeight: FontWeight.bold,
  },
  accessChipTextSelected: {
    color: "#FFFFFF",
  },
  privateKeyComposerCard: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FCD34D",
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
    color: "#92400E",
    fontWeight: FontWeight.extrabold,
  },
  privateKeyGenerate: {
    ...TypeScale.bodySm,
    color: "#2D6A4F",
    fontWeight: FontWeight.bold,
  },
  inviteTitle: {
    ...TypeScale.titleMd,
    color: "#1A1A1A",
    fontWeight: FontWeight.extrabold,
    marginTop: Spacing.lg,
  },
  selectedInvitesRow: {
    marginTop: Spacing.md,
    maxHeight: 62,
  },
  selectedInviteChip: {
    alignItems: "center",
    backgroundColor: "#F5F5F5",
    borderRadius: Radius.full,
    flexDirection: "row",
    gap: Spacing.sm,
    marginRight: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  selectedInviteText: {
    ...TypeScale.bodySm,
    color: "#1A1A1A",
    fontWeight: FontWeight.bold,
  },
  composerUserRow: {
    alignItems: "center",
    backgroundColor: "#F8F8F8",
    borderColor: "#E8E8E8",
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
    color: "#1A1A1A",
    fontWeight: FontWeight.extrabold,
  },
  composerUserMeta: {
    ...TypeScale.bodySm,
    color: "#6B7280",
    marginTop: Spacing.xs,
  },
  selectBubble: {
    borderColor: "#D1D5DB",
    borderRadius: Radius.md,
    borderWidth: 1,
    height: Spacing["2xl"],
    width: Spacing["2xl"],
  },
  selectBubbleSelected: {
    alignItems: "center",
    backgroundColor: "#2D6A4F",
    borderColor: "#2D6A4F",
    justifyContent: "center",
  },
  modalEmptyState: {
    alignItems: "center",
    backgroundColor: "#F8F8F8",
    borderColor: "#E8E8E8",
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
  },
  modalEmptyStateTitle: {
    ...TypeScale.titleMd,
    color: "#1A1A1A",
    fontWeight: FontWeight.extrabold,
    textAlign: "center",
  },
  modalEmptyStateText: {
    ...TypeScale.bodyMd,
    color: "#6B7280",
    marginTop: Spacing.sm,
    textAlign: "center",
  },
  createButton: {
    alignItems: "center",
    backgroundColor: "#2D6A4F",
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
    color: "#FFFFFF",
    fontWeight: FontWeight.extrabold,
  },
});
