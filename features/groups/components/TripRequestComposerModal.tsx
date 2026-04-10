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
      <KeyboardAvoidingView
        style={[styles.modalBackdrop, { backgroundColor: colors.modalOverlay }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                New trip request
              </Text>
              <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
                Tell the group tab where you want to go and what kind of people you want with you.
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

          {error ? (
            <View
              style={[
                styles.feedbackCard,
                { backgroundColor: colors.errorBackground, borderColor: colors.errorBorder },
              ]}
            >
              <Text style={[styles.feedbackText, { color: colors.errorText }]}>{error}</Text>
            </View>
          ) : null}

          {successMessage ? (
            <View
              style={[
                styles.feedbackCard,
                { backgroundColor: colors.successBackground, borderColor: colors.successBorder },
              ]}
            >
              <Text style={[styles.feedbackText, { color: colors.successText }]}>
                {successMessage}
              </Text>
            </View>
          ) : null}

          <ScrollView showsVerticalScrollIndicator={false}>
            <TextInput
              onChangeText={onDestinationChange}
              placeholder="Destination"
              placeholderTextColor={colors.inputPlaceholder}
              style={[
                styles.modalInput,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.inputBorder,
                  color: colors.textPrimary,
                },
              ]}
              value={destination}
            />

            <View style={styles.requestInputGrid}>
              <TextInput
                onChangeText={onBudgetChange}
                placeholder="Budget"
                placeholderTextColor={colors.inputPlaceholder}
                style={[
                  styles.modalInput,
                  styles.requestGridInput,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.inputBorder,
                    color: colors.textPrimary,
                  },
                ]}
                value={budget}
              />
              <TextInput
                onChangeText={onTimingChange}
                placeholder="When"
                placeholderTextColor={colors.inputPlaceholder}
                style={[
                  styles.modalInput,
                  styles.requestGridInput,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.inputBorder,
                    color: colors.textPrimary,
                  },
                ]}
                value={timing}
              />
            </View>

            <TextInput
              onChangeText={onTravelersChange}
              placeholder="How many people"
              placeholderTextColor={colors.inputPlaceholder}
              style={[
                styles.modalInput,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.inputBorder,
                  color: colors.textPrimary,
                },
              ]}
              value={travelers}
            />

            <TextInput
              multiline
              numberOfLines={4}
              onChangeText={onNoteChange}
              placeholder="What kind of trip is it? Food, beaches, budget vibe, roadtrip energy..."
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
              value={note}
            />

            <View
              style={[
                styles.requestPreviewCard,
                { backgroundColor: colors.cardAlt, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.requestPreviewKicker, { color: colors.accent }]}>
                Preview
              </Text>
              <Text style={[styles.requestPreviewTitle, { color: colors.textPrimary }]}>
                {destination.trim() || "Your next trip idea"}
              </Text>
              <View style={styles.requestPreviewChips}>
                <View
                  style={[
                    styles.requestPreviewChip,
                    { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                >
                  <Text style={[styles.requestPreviewChipText, { color: colors.textSecondary }]}>
                    {budget.trim() || "Open budget"}
                  </Text>
                </View>
                <View
                  style={[
                    styles.requestPreviewChip,
                    { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                >
                  <Text style={[styles.requestPreviewChipText, { color: colors.textSecondary }]}>
                    {timing.trim() || "Flexible timing"}
                  </Text>
                </View>
                <View
                  style={[
                    styles.requestPreviewChip,
                    { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                >
                  <Text style={[styles.requestPreviewChipText, { color: colors.textSecondary }]}>
                    {travelers.trim() || "2-4 people"}
                  </Text>
                </View>
              </View>
              <Text style={[styles.requestPreviewNote, { color: colors.textSecondary }]}>
                {note.trim() ||
                  "People will see this inside Groups and can mark themselves as interested before you open a full chat."}
              </Text>
            </View>
          </ScrollView>

          <TouchableOpacity
            activeOpacity={0.9}
            disabled={saving}
            onPress={onPublishPress}
            style={[
              styles.createButton,
              { backgroundColor: colors.accent },
              saving && styles.createButtonDisabled,
            ]}
          >
            <Text style={[styles.createButtonText, { color: colors.buttonTextOnAction }]}>
              {saving ? "Publishing..." : "Publish request"}
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
  feedbackCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginBottom: Spacing.md,
    padding: Spacing.md,
  },
  feedbackText: {
    ...TypeScale.bodyMd,
  },
  requestInputGrid: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  requestGridInput: {
    flex: 1,
  },
  requestPreviewCard: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    marginTop: Spacing.lg,
    padding: Spacing.lg,
  },
  requestPreviewKicker: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  requestPreviewTitle: {
    ...TypeScale.headingMd,
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
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  requestPreviewChipText: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.bold,
  },
  requestPreviewNote: {
    ...TypeScale.bodyMd,
    marginTop: Spacing.md,
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
