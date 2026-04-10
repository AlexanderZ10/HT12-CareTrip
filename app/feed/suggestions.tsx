import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Avatar } from "../../components/Avatar";
import { useAppTheme } from "../../components/app-theme-provider";
import {
  FontWeight,
  Radius,
  Spacing,
  TypeScale,
} from "../../constants/design-system";
import { useGroupsScreen } from "../../features/groups/useGroupsScreen";

export default function FeedSuggestionsScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
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
      edges={["top", "bottom", "left", "right"]}
    >
      {/* ── Instagram-style detail header: ← back + title ── */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <MaterialIcons name="arrow-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          Suggested for you
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {vm.suggestedProfiles.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={[styles.emptyIcon, { borderColor: colors.textPrimary }]}>
              <MaterialIcons name="people-outline" size={32} color={colors.textPrimary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              No suggestions yet
            </Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              When more travelers join CareTrip and make their profiles public, they will show up here.
            </Text>
          </View>
        ) : (
          <>
            <Text style={[styles.subheader, { color: colors.textSecondary }]}>
              All suggestions
            </Text>

            {vm.suggestedProfiles.map((profile) => {
              const connection = vm.buildSocialProfilePreview(profile.uid).connection;
              const isPendingFromMe =
                connection?.status === "pending" && connection.requesterId === vm.userId;
              const isPendingToMe =
                connection?.status === "pending" && connection.recipientId === vm.userId;

              let actionLabel = "Follow";
              let actionDisabled = false;
              if (isPendingFromMe) {
                actionLabel = "Requested";
                actionDisabled = true;
              } else if (isPendingToMe) {
                actionLabel = "Accept";
              }

              const handle = profile.username
                ? `@${profile.username}`
                : profile.displayName.toLowerCase().replace(/\s+/g, "_");

              const isLoading = vm.updatingFriendshipId === connection?.id;

              return (
                <View key={profile.uid} style={styles.row}>
                  <Avatar
                    label={profile.displayName}
                    photoUrl={profile.photoUrl || profile.avatarUrl}
                    size={48}
                  />

                  <View style={styles.rowText}>
                    <Text
                      numberOfLines={1}
                      style={[styles.rowHandle, { color: colors.textPrimary }]}
                    >
                      {handle}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[styles.rowSubtitle, { color: colors.textSecondary }]}
                    >
                      {profile.displayName}
                      {profile.homeBase ? ` · ${profile.homeBase}` : ""}
                    </Text>
                    <Text style={[styles.rowMeta, { color: colors.textMuted }]}>
                      Suggested for you
                    </Text>
                  </View>

                  <TouchableOpacity
                    activeOpacity={0.85}
                    disabled={actionDisabled || isLoading}
                    onPress={() => {
                      if (isPendingToMe && connection) {
                        void vm.acceptFriendRequest(connection);
                      } else if (!isPendingFromMe) {
                        void vm.sendFriendRequest(profile);
                      }
                    }}
                    style={[
                      styles.followButton,
                      {
                        backgroundColor:
                          actionDisabled || isLoading
                            ? colors.disabledBackground
                            : colors.accent,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.followButtonText,
                        {
                          color:
                            actionDisabled || isLoading
                              ? colors.disabledText
                              : colors.buttonTextOnAction,
                        },
                      ]}
                    >
                      {isLoading ? "..." : actionLabel}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
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
  // ─── Header ───
  header: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
  },
  backButton: {
    padding: 4,
    width: 40,
  },
  headerTitle: {
    ...TypeScale.bodyLg,
    fontWeight: FontWeight.bold,
  },
  headerSpacer: {
    width: 40,
  },
  // ─── Content ───
  content: {
    paddingBottom: Spacing["3xl"],
    paddingTop: Spacing.md,
  },
  subheader: {
    ...TypeScale.bodySm,
    fontWeight: FontWeight.semibold,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  // ─── Row ───
  row: {
    alignItems: "center",
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm + 2,
  },
  rowText: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  rowHandle: {
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.bold,
  },
  rowSubtitle: {
    ...TypeScale.bodySm,
    marginTop: 1,
  },
  rowMeta: {
    ...TypeScale.labelSm,
    marginTop: 2,
  },
  followButton: {
    alignItems: "center",
    borderRadius: Radius.md,
    marginLeft: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 8,
  },
  followButtonText: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.bold,
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
    textAlign: "center",
  },
});
