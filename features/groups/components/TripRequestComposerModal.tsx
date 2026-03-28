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

import { useAppTheme } from "../../../components/app-theme-provider";
import {
  FontWeight,
  Radius,
  Spacing,
  TypeScale,
} from "../../../constants/design-system";

type TripRequestComposerModalProps = {
  visible: boolean;
  onClose: () => void;
  destination: string;
  onDestinationChange: (value: string) => void;
  budget: string;
  onBudgetChange: (value: string) => void;
  timing: string;
  onTimingChange: (value: string) => void;
  travelers: string;
  onTravelersChange: (value: string) => void;
  note: string;
  onNoteChange: (value: string) => void;
  saving: boolean;
  onPublishPress: () => void;
  error: string;
  successMessage: string;
};

export function TripRequestComposerModal({
  visible,
  onClose,
  destination,
  onDestinationChange,
  budget,
  onBudgetChange,
  timing,
  onTimingChange,
  travelers,
  onTravelersChange,
  note,
  onNoteChange,
  saving,
  onPublishPress,
  error,
  successMessage,
}: TripRequestComposerModalProps) {
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
              <Text style={styles.modalTitle}>New trip request</Text>
              <Text style={styles.modalSubtitle}>
                Tell the group tab where you want to go and what kind of people you want with you.
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

          {error ? (
            <View
              style={[
                styles.feedbackCardError,
                { backgroundColor: colors.errorBackground, borderColor: colors.errorBorder },
              ]}
            >
              <Text style={[styles.feedbackTextError, { color: colors.errorText }]}>{error}</Text>
            </View>
          ) : null}

          {successMessage ? (
            <View
              style={[
                styles.feedbackCardSuccess,
                { backgroundColor: colors.successBackground, borderColor: colors.successBorder },
              ]}
            >
              <Text style={[styles.feedbackTextSuccess, { color: colors.successText }]}>
                {successMessage}
              </Text>
            </View>
          ) : null}

          <ScrollView showsVerticalScrollIndicator={false}>
            <TextInput
              onChangeText={onDestinationChange}
              placeholder="Destination"
              placeholderTextColor="#9CA3AF"
              style={styles.modalInput}
              value={destination}
            />

            <View style={styles.requestInputGrid}>
              <TextInput
                onChangeText={onBudgetChange}
                placeholder="Budget"
                placeholderTextColor="#9CA3AF"
                style={[styles.modalInput, styles.requestGridInput]}
                value={budget}
              />
              <TextInput
                onChangeText={onTimingChange}
                placeholder="When"
                placeholderTextColor="#9CA3AF"
                style={[styles.modalInput, styles.requestGridInput]}
                value={timing}
              />
            </View>

            <TextInput
              onChangeText={onTravelersChange}
              placeholder="How many people"
              placeholderTextColor="#9CA3AF"
              style={styles.modalInput}
              value={travelers}
            />

            <TextInput
              multiline
              numberOfLines={4}
              onChangeText={onNoteChange}
              placeholder="What kind of trip is it? Food, beaches, budget vibe, roadtrip energy..."
              placeholderTextColor="#9CA3AF"
              style={[styles.modalInput, styles.modalTextarea]}
              textAlignVertical="top"
              value={note}
            />

            <View style={styles.requestPreviewCard}>
              <Text style={styles.requestPreviewKicker}>Preview</Text>
              <Text style={styles.requestPreviewTitle}>
                {destination.trim() || "Your next trip idea"}
              </Text>
              <View style={styles.requestPreviewChips}>
                <View style={styles.requestPreviewChip}>
                  <Text style={styles.requestPreviewChipText}>
                    {budget.trim() || "Open budget"}
                  </Text>
                </View>
                <View style={styles.requestPreviewChip}>
                  <Text style={styles.requestPreviewChipText}>
                    {timing.trim() || "Flexible timing"}
                  </Text>
                </View>
                <View style={styles.requestPreviewChip}>
                  <Text style={styles.requestPreviewChipText}>
                    {travelers.trim() || "2-4 people"}
                  </Text>
                </View>
              </View>
              <Text style={styles.requestPreviewNote}>
                {note.trim() ||
                  "People will see this inside Groups and can mark themselves as interested before you open a full chat."}
              </Text>
            </View>
          </ScrollView>

          <TouchableOpacity
            activeOpacity={0.9}
            disabled={saving}
            onPress={onPublishPress}
            style={[styles.createButton, saving && styles.createButtonDisabled]}
          >
            <Text style={styles.createButtonText}>
              {saving ? "Publishing..." : "Publish request"}
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
  requestInputGrid: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  requestGridInput: {
    flex: 1,
  },
  requestPreviewCard: {
    backgroundColor: "#F8F8F8",
    borderColor: "#E8E8E8",
    borderRadius: Radius.xl,
    borderWidth: 1,
    marginTop: Spacing.lg,
    padding: Spacing.lg,
  },
  requestPreviewKicker: {
    ...TypeScale.labelLg,
    color: "#2D6A4F",
    fontWeight: FontWeight.extrabold,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  requestPreviewTitle: {
    ...TypeScale.headingMd,
    color: "#1A1A1A",
    fontWeight: FontWeight.extrabold,
    marginTop: 6,
  },
  requestPreviewChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  requestPreviewChip: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E8E8E8",
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  requestPreviewChipText: {
    ...TypeScale.labelLg,
    color: "#6B7280",
    fontWeight: FontWeight.bold,
  },
  requestPreviewNote: {
    ...TypeScale.bodyMd,
    color: "#6B7280",
    marginTop: Spacing.md,
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
