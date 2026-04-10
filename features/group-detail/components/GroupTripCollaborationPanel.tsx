import { MaterialIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { useEffect, useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { Avatar } from "../../../components/Avatar";
import { TripRouteMap } from "../../../components/trip-route-map";
import {
  FontWeight,
  Radius,
  Spacing,
  TypeScale,
  shadow,
} from "../../../constants/design-system";
import {
  buildTrackerMapPoints,
  getTripPresenceStatusLabel,
  normalizeDateKey,
  type GroupItineraryBoard,
  type GroupTripPresence,
  type GroupTripRecap,
  type TripPresenceStatus,
} from "../../../utils/group-trip-collaboration";
import { formatRelativeTime } from "../../../utils/formatting";

type GroupTripCollaborationPanelProps = {
  accentColor: string;
  borderColor: string;
  buttonTextColor: string;
  cardAltColor: string;
  cardColor: string;
  currentUserId: string;
  emptyColor: string;
  groupName: string;
  latestSharedTripAvailable: boolean;
  onAddBoardDay: (title: string) => void;
  onAddBoardItem: (dayId: string, title: string) => void;
  onCreateBoardFromLatestTrip: () => void;
  onCycleBookingState: (dayId: string, itemId: string) => void;
  onGenerateRecap: () => void;
  onMoveBoardDay: (dayId: string, direction: -1 | 1) => void;
  onSaveBoardDates: (startDateKey: string, endDateKey: string) => void;
  onSetPresenceStatus: (status: TripPresenceStatus) => void;
  onToggleBoardAssignment: (dayId: string, itemId: string) => void;
  onToggleBoardVote: (dayId: string, itemId: string) => void;
  presenceRoster: GroupTripPresence[];
  recap: GroupTripRecap | null;
  savingBoard: boolean;
  savingPresence: boolean;
  savingRecap: boolean;
  textMutedColor: string;
  textPrimaryColor: string;
  tripBoard: GroupItineraryBoard | null;
};

const STATUS_OPTIONS: TripPresenceStatus[] = [
  "airport",
  "checked-in",
  "exploring",
  "in-transit",
];

export function GroupTripCollaborationPanel({
  accentColor,
  borderColor,
  buttonTextColor,
  cardAltColor,
  cardColor,
  currentUserId,
  emptyColor,
  groupName,
  latestSharedTripAvailable,
  onAddBoardDay,
  onAddBoardItem,
  onCreateBoardFromLatestTrip,
  onCycleBookingState,
  onGenerateRecap,
  onMoveBoardDay,
  onSaveBoardDates,
  onSetPresenceStatus,
  onToggleBoardAssignment,
  onToggleBoardVote,
  presenceRoster,
  recap,
  savingBoard,
  savingPresence,
  savingRecap,
  textMutedColor,
  textPrimaryColor,
  tripBoard,
}: GroupTripCollaborationPanelProps) {
  const [startDateInput, setStartDateInput] = useState("");
  const [endDateInput, setEndDateInput] = useState("");
  const [newDayTitle, setNewDayTitle] = useState("");
  const [itemDraftsByDayId, setItemDraftsByDayId] = useState<Record<string, string>>({});

  useEffect(() => {
    setStartDateInput(tripBoard?.startDateKey ?? "");
    setEndDateInput(tripBoard?.endDateKey ?? "");
  }, [tripBoard?.endDateKey, tripBoard?.startDateKey]);

  const trackerStops = useMemo(
    () =>
      buildTrackerMapPoints({
        board: tripBoard,
        presences: presenceRoster.filter((presence) => presence.sharingEnabled),
      }),
    [presenceRoster, tripBoard]
  );

  const currentPresence = presenceRoster.find((presence) => presence.userId === currentUserId);

  const handleSaveDates = () => {
    onSaveBoardDates(normalizeDateKey(startDateInput), normalizeDateKey(endDateInput));
  };

  const renderSeedState = (title: string, text: string) => (
    <View
      style={[
        styles.emptyState,
        {
          backgroundColor: cardAltColor,
          borderColor,
        },
      ]}
    >
      <Text style={[styles.emptyTitle, { color: textPrimaryColor }]}>{title}</Text>
      <Text style={[styles.emptyText, { color: textMutedColor }]}>{text}</Text>
      {latestSharedTripAvailable ? (
        <TouchableOpacity
          activeOpacity={0.88}
          disabled={savingBoard}
          onPress={onCreateBoardFromLatestTrip}
          style={[styles.seedButton, { backgroundColor: accentColor }]}
        >
          <MaterialIcons color={buttonTextColor} name="auto-awesome" size={18} />
          <Text style={[styles.seedButtonText, { color: buttonTextColor }]}>
            {savingBoard ? "Building..." : "Create from latest shared trip"}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  return (
    <>
      <View style={[styles.card, { backgroundColor: cardColor, borderColor }]}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderTextWrap}>
            <Text style={[styles.sectionKicker, { color: accentColor }]}>Live Trip Tracker</Text>
            <Text style={[styles.sectionTitle, { color: textPrimaryColor }]}>
              See who is moving right now
            </Text>
            <Text style={[styles.sectionText, { color: textMutedColor }]}>
              Shared travel statuses keep the whole crew in sync while the trip is unfolding.
            </Text>
          </View>
          <View
            style={[
              styles.countBadge,
              { backgroundColor: cardAltColor, borderColor },
            ]}
          >
            <Text style={[styles.countBadgeText, { color: textPrimaryColor }]}>
              {
                presenceRoster.filter((presence) => presence.sharingEnabled).length
              }{" "}
              live
            </Text>
          </View>
        </View>

        {trackerStops.length > 0 ? (
          <TripRouteMap stops={trackerStops} style={styles.trackerMap} />
        ) : (
          renderSeedState(
            "No live tracker data yet.",
            "Create a trip board and update your status to light up the shared map."
          )
        )}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.statusRow}
        >
          {STATUS_OPTIONS.map((status) => {
            const active = currentPresence?.sharingEnabled && currentPresence.status === status;

            return (
              <TouchableOpacity
                key={status}
                activeOpacity={0.88}
                disabled={savingPresence}
                onPress={() => onSetPresenceStatus(status)}
                style={[
                  styles.statusChip,
                  {
                    backgroundColor: active ? accentColor : cardAltColor,
                    borderColor: active ? accentColor : borderColor,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.statusChipText,
                    { color: active ? buttonTextColor : textPrimaryColor },
                  ]}
                >
                  {getTripPresenceStatusLabel(status)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.rosterColumn}>
          {presenceRoster.map((presence) => {
            const active = presence.sharingEnabled;

            return (
              <View
                key={presence.userId}
                style={[
                  styles.rosterRow,
                  { borderBottomColor: borderColor },
                ]}
              >
                <Avatar label={presence.label} photoUrl={presence.avatarUrl} size={42} />
                <View style={styles.rosterTextWrap}>
                  <Text style={[styles.rosterName, { color: textPrimaryColor }]}>
                    {presence.label}
                    {presence.userId === currentUserId ? " • You" : ""}
                  </Text>
                  <Text style={[styles.rosterMeta, { color: textMutedColor }]}>
                    {active
                      ? `${getTripPresenceStatusLabel(presence.status)} • ${formatRelativeTime(
                          presence.updatedAtMs
                        )}`
                      : "Off the live map right now"}
                  </Text>
                </View>
                <View
                  style={[
                    styles.liveDot,
                    { backgroundColor: active ? accentColor : emptyColor },
                  ]}
                />
              </View>
            );
          })}
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: cardColor, borderColor }]}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderTextWrap}>
            <Text style={[styles.sectionKicker, { color: accentColor }]}>
              Collaborative Itinerary
            </Text>
            <Text style={[styles.sectionTitle, { color: textPrimaryColor }]}>
              Plan, vote and assign bookings
            </Text>
            <Text style={[styles.sectionText, { color: textMutedColor }]}>
              Turn the AI plan into a live board the whole group can shape together.
            </Text>
          </View>
          {tripBoard ? (
            <View
              style={[
                styles.countBadge,
                { backgroundColor: cardAltColor, borderColor },
              ]}
            >
              <Text style={[styles.countBadgeText, { color: textPrimaryColor }]}>
                {tripBoard.entryCount} items
              </Text>
            </View>
          ) : null}
        </View>

        {!tripBoard
          ? renderSeedState(
              "No shared itinerary board yet.",
              "Share a trip into the group first, then turn it into a live board for dates, votes and booking ownership."
            )
          : (
            <>
              <View style={styles.dateRow}>
                <TextInput
                  placeholder="Start YYYY-MM-DD"
                  placeholderTextColor={textMutedColor}
                  style={[
                    styles.dateInput,
                    { backgroundColor: cardAltColor, borderColor, color: textPrimaryColor },
                  ]}
                  value={startDateInput}
                  onChangeText={setStartDateInput}
                />
                <TextInput
                  placeholder="End YYYY-MM-DD"
                  placeholderTextColor={textMutedColor}
                  style={[
                    styles.dateInput,
                    { backgroundColor: cardAltColor, borderColor, color: textPrimaryColor },
                  ]}
                  value={endDateInput}
                  onChangeText={setEndDateInput}
                />
              </View>

              <TouchableOpacity
                activeOpacity={0.88}
                disabled={savingBoard}
                onPress={handleSaveDates}
                style={[styles.inlineButton, { backgroundColor: accentColor }]}
              >
                <MaterialIcons color={buttonTextColor} name="calendar-today" size={16} />
                <Text style={[styles.inlineButtonText, { color: buttonTextColor }]}>
                  {savingBoard ? "Saving..." : "Save trip dates"}
                </Text>
              </TouchableOpacity>

              {(tripBoard.startDateKey || tripBoard.endDateKey) && (
                <Text style={[styles.boardMeta, { color: textMutedColor }]}>
                  {tripBoard.destination}
                  {tripBoard.startDateKey ? ` • Starts ${tripBoard.startDateKey}` : ""}
                  {tripBoard.endDateKey ? ` • Ends ${tripBoard.endDateKey}` : ""}
                </Text>
              )}

              <View style={styles.dayColumn}>
                {tripBoard.tripDays.map((day, index) => (
                  <View
                    key={day.id}
                    style={[
                      styles.dayCard,
                      { backgroundColor: cardAltColor, borderColor },
                    ]}
                  >
                    <View style={styles.dayHeader}>
                      <View style={styles.dayHeaderTextWrap}>
                        <Text style={[styles.dayLabel, { color: accentColor }]}>
                          {day.dayLabel}
                        </Text>
                        <Text style={[styles.dayTitle, { color: textPrimaryColor }]}>
                          {day.title}
                        </Text>
                      </View>
                      <View style={styles.dayHeaderActions}>
                        <TouchableOpacity
                          activeOpacity={0.8}
                          disabled={savingBoard || index === 0}
                          onPress={() => onMoveBoardDay(day.id, -1)}
                          style={[
                            styles.iconButton,
                            { backgroundColor: cardColor, borderColor },
                          ]}
                        >
                          <MaterialIcons color={textPrimaryColor} name="arrow-upward" size={16} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          activeOpacity={0.8}
                          disabled={savingBoard || index === tripBoard.tripDays.length - 1}
                          onPress={() => onMoveBoardDay(day.id, 1)}
                          style={[
                            styles.iconButton,
                            { backgroundColor: cardColor, borderColor },
                          ]}
                        >
                          <MaterialIcons color={textPrimaryColor} name="arrow-downward" size={16} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={styles.itemColumn}>
                      {day.items.map((item) => {
                        const voted = item.voterIds.includes(currentUserId);
                        const assignedToMe = item.assignedUserId === currentUserId;

                        return (
                          <View
                            key={item.id}
                            style={[
                              styles.itemRow,
                              { backgroundColor: cardColor, borderColor },
                            ]}
                          >
                            <View style={styles.itemTextWrap}>
                              <Text style={[styles.itemTitle, { color: textPrimaryColor }]}>
                                {item.title}
                              </Text>
                              <Text style={[styles.itemMeta, { color: textMutedColor }]}>
                                {item.assignedLabel
                                  ? `Booked by ${item.assignedLabel}`
                                  : `Tap Assign to claim this booking`}
                              </Text>
                            </View>
                            <View style={styles.itemActions}>
                              <TouchableOpacity
                                activeOpacity={0.86}
                                onPress={() => onToggleBoardVote(day.id, item.id)}
                                style={[
                                  styles.smallChip,
                                  {
                                    backgroundColor: voted ? accentColor : cardAltColor,
                                    borderColor: voted ? accentColor : borderColor,
                                  },
                                ]}
                              >
                                <MaterialIcons
                                  color={voted ? buttonTextColor : textPrimaryColor}
                                  name="favorite-border"
                                  size={14}
                                />
                                <Text
                                  style={[
                                    styles.smallChipText,
                                    { color: voted ? buttonTextColor : textPrimaryColor },
                                  ]}
                                >
                                  {item.voterIds.length}
                                </Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                activeOpacity={0.86}
                                onPress={() => onToggleBoardAssignment(day.id, item.id)}
                                style={[
                                  styles.smallChip,
                                  {
                                    backgroundColor: assignedToMe ? accentColor : cardAltColor,
                                    borderColor: assignedToMe ? accentColor : borderColor,
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.smallChipText,
                                    { color: assignedToMe ? buttonTextColor : textPrimaryColor },
                                  ]}
                                >
                                  {assignedToMe ? "Mine" : "Assign"}
                                </Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                activeOpacity={0.86}
                                onPress={() => onCycleBookingState(day.id, item.id)}
                                style={[
                                  styles.smallChip,
                                  {
                                    backgroundColor:
                                      item.bookingState === "booked" ? accentColor : cardAltColor,
                                    borderColor:
                                      item.bookingState === "booked" ? accentColor : borderColor,
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.smallChipText,
                                    {
                                      color:
                                        item.bookingState === "booked"
                                          ? buttonTextColor
                                          : textPrimaryColor,
                                    },
                                  ]}
                                >
                                  {item.bookingState === "booked"
                                    ? "Booked"
                                    : item.bookingState === "claimed"
                                      ? "Claimed"
                                      : "Open"}
                                </Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        );
                      })}
                    </View>

                    <View style={styles.addItemRow}>
                      <TextInput
                        placeholder={`Add a stop for ${day.dayLabel}`}
                        placeholderTextColor={textMutedColor}
                        style={[
                          styles.inlineInput,
                          { backgroundColor: cardColor, borderColor, color: textPrimaryColor },
                        ]}
                        value={itemDraftsByDayId[day.id] ?? ""}
                        onChangeText={(value) =>
                          setItemDraftsByDayId((currentDrafts) => ({
                            ...currentDrafts,
                            [day.id]: value,
                          }))
                        }
                      />
                      <TouchableOpacity
                        activeOpacity={0.88}
                        disabled={savingBoard}
                        onPress={() => {
                          const nextTitle = itemDraftsByDayId[day.id]?.trim() ?? "";

                          if (!nextTitle) {
                            return;
                          }

                          onAddBoardItem(day.id, nextTitle);
                          setItemDraftsByDayId((currentDrafts) => ({
                            ...currentDrafts,
                            [day.id]: "",
                          }));
                        }}
                        style={[styles.addButton, { backgroundColor: accentColor }]}
                      >
                        <MaterialIcons color={buttonTextColor} name="add" size={18} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>

              <View style={styles.addDayRow}>
                <TextInput
                  placeholder="Add a new day"
                  placeholderTextColor={textMutedColor}
                  style={[
                    styles.inlineInput,
                    { backgroundColor: cardAltColor, borderColor, color: textPrimaryColor },
                  ]}
                  value={newDayTitle}
                  onChangeText={setNewDayTitle}
                />
                <TouchableOpacity
                  activeOpacity={0.88}
                  disabled={savingBoard}
                  onPress={() => {
                    const trimmedTitle = newDayTitle.trim();

                    if (!trimmedTitle) {
                      return;
                    }

                    onAddBoardDay(trimmedTitle);
                    setNewDayTitle("");
                  }}
                  style={[styles.addButtonWide, { backgroundColor: accentColor }]}
                >
                  <MaterialIcons color={buttonTextColor} name="playlist-add" size={18} />
                  <Text style={[styles.addButtonWideText, { color: buttonTextColor }]}>
                    Add day
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
      </View>

      <View style={[styles.card, { backgroundColor: cardColor, borderColor }]}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderTextWrap}>
            <Text style={[styles.sectionKicker, { color: accentColor }]}>Trip Recap</Text>
            <Text style={[styles.sectionTitle, { color: textPrimaryColor }]}>
              Turn your trip into a memory card
            </Text>
            <Text style={[styles.sectionText, { color: textMutedColor }]}>
              Photos, highlights and shared spending roll into a recap the group can revisit later.
            </Text>
          </View>
        </View>

        {!recap ? (
          <View
            style={[
              styles.emptyState,
              {
                backgroundColor: cardAltColor,
                borderColor,
              },
            ]}
          >
            <Text style={[styles.emptyTitle, { color: textPrimaryColor }]}>
              No recap has been generated yet.
            </Text>
            <Text style={[styles.emptyText, { color: textMutedColor }]}>
              Once the trip is over, generate a recap from the chat, photo journal and shared expenses.
            </Text>
            <TouchableOpacity
              activeOpacity={0.88}
              disabled={savingRecap}
              onPress={onGenerateRecap}
              style={[styles.seedButton, { backgroundColor: accentColor }]}
            >
              <MaterialIcons color={buttonTextColor} name="auto-stories" size={18} />
              <Text style={[styles.seedButtonText, { color: buttonTextColor }]}>
                {savingRecap ? "Generating..." : "Generate recap"}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View
            style={[
              styles.recapCard,
              { backgroundColor: cardAltColor, borderColor },
            ]}
          >
            {recap.coverImageUri ? (
              <Image source={{ uri: recap.coverImageUri }} style={styles.recapImage} contentFit="cover" />
            ) : null}

            <Text style={[styles.recapTitle, { color: textPrimaryColor }]}>{recap.title}</Text>
            <Text style={[styles.recapCaption, { color: textMutedColor }]}>
              {recap.coverCaption}
            </Text>

            <View style={styles.recapStatsRow}>
              <View style={[styles.recapStat, { backgroundColor: cardColor, borderColor }]}>
                <Text style={[styles.recapStatValue, { color: textPrimaryColor }]}>
                  {recap.totalPhotos}
                </Text>
                <Text style={[styles.recapStatLabel, { color: textMutedColor }]}>Photos</Text>
              </View>
              <View style={[styles.recapStat, { backgroundColor: cardColor, borderColor }]}>
                <Text style={[styles.recapStatValue, { color: textPrimaryColor }]}>
                  {recap.memberCount}
                </Text>
                <Text style={[styles.recapStatLabel, { color: textMutedColor }]}>Travelers</Text>
              </View>
            </View>

            {recap.visitedPlaces.length > 0 ? (
              <Text style={[styles.recapList, { color: textPrimaryColor }]}>
                Places: {recap.visitedPlaces.join(" • ")}
              </Text>
            ) : null}
            {recap.photoMoments.length > 0 ? (
              <Text style={[styles.recapList, { color: textPrimaryColor }]}>
                Moments: {recap.photoMoments.join(" • ")}
              </Text>
            ) : null}
            {recap.chatHighlights.length > 0 ? (
              <Text style={[styles.recapList, { color: textPrimaryColor }]}>
                Highlights: {recap.chatHighlights.join(" • ")}
              </Text>
            ) : null}

            <Text style={[styles.recapSpend, { color: textMutedColor }]}>
              {recap.spendSummaryLabel}
            </Text>
            <Text style={[styles.recapMeta, { color: textMutedColor }]}>
              Built for {groupName} • {formatRelativeTime(recap.createdAtMs)}
            </Text>

            <TouchableOpacity
              activeOpacity={0.88}
              disabled={savingRecap}
              onPress={onGenerateRecap}
              style={[styles.inlineButton, { backgroundColor: accentColor }]}
            >
              <MaterialIcons color={buttonTextColor} name="refresh" size={16} />
              <Text style={[styles.inlineButtonText, { color: buttonTextColor }]}>
                {savingRecap ? "Refreshing..." : "Refresh recap"}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius["2xl"],
    borderWidth: 1,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    padding: Spacing.lg,
    ...shadow("sm"),
  },
  sectionHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sectionHeaderTextWrap: {
    flex: 1,
    paddingRight: Spacing.md,
  },
  sectionKicker: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  sectionTitle: {
    ...TypeScale.headingSm,
    fontWeight: FontWeight.extrabold,
    marginTop: Spacing.xs,
  },
  sectionText: {
    ...TypeScale.bodyMd,
    marginTop: Spacing.sm,
  },
  countBadge: {
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  countBadgeText: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
  },
  trackerMap: {
    marginTop: Spacing.md,
  },
  statusRow: {
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingBottom: Spacing.xs,
  },
  statusChip: {
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  statusChipText: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.bold,
  },
  rosterColumn: {
    marginTop: Spacing.md,
  },
  rosterRow: {
    alignItems: "center",
    borderBottomWidth: 1,
    flexDirection: "row",
    paddingVertical: Spacing.sm,
  },
  rosterTextWrap: {
    flex: 1,
    marginLeft: Spacing.sm,
  },
  rosterName: {
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.bold,
  },
  rosterMeta: {
    ...TypeScale.bodySm,
    marginTop: 2,
  },
  liveDot: {
    borderRadius: Radius.full,
    height: 10,
    marginLeft: Spacing.sm,
    width: 10,
  },
  emptyState: {
    alignItems: "center",
    borderRadius: Radius.xl,
    borderWidth: 1,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
  },
  emptyTitle: {
    ...TypeScale.titleMd,
    fontWeight: FontWeight.extrabold,
    textAlign: "center",
  },
  emptyText: {
    ...TypeScale.bodyMd,
    marginTop: Spacing.sm,
    textAlign: "center",
  },
  seedButton: {
    alignItems: "center",
    borderRadius: Radius.lg,
    flexDirection: "row",
    gap: Spacing.sm,
    justifyContent: "center",
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  seedButtonText: {
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.extrabold,
  },
  dateRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  dateInput: {
    ...TypeScale.bodyMd,
    borderRadius: Radius.lg,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  inlineButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: Radius.lg,
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  inlineButtonText: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
  },
  boardMeta: {
    ...TypeScale.bodySm,
    marginTop: Spacing.sm,
  },
  dayColumn: {
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  dayCard: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.md,
  },
  dayHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  dayHeaderTextWrap: {
    flex: 1,
    paddingRight: Spacing.md,
  },
  dayHeaderActions: {
    flexDirection: "row",
    gap: Spacing.xs,
  },
  iconButton: {
    alignItems: "center",
    borderRadius: Radius.md,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  dayLabel: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
  },
  dayTitle: {
    ...TypeScale.titleMd,
    fontWeight: FontWeight.extrabold,
    marginTop: 2,
  },
  itemColumn: {
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  itemRow: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.sm,
  },
  itemTextWrap: {
    marginBottom: Spacing.sm,
  },
  itemTitle: {
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.bold,
  },
  itemMeta: {
    ...TypeScale.bodySm,
    marginTop: 2,
  },
  itemActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
  },
  smallChip: {
    alignItems: "center",
    borderRadius: Radius.full,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
  },
  smallChipText: {
    ...TypeScale.labelMd,
    fontWeight: FontWeight.bold,
  },
  addItemRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  inlineInput: {
    ...TypeScale.bodyMd,
    borderRadius: Radius.lg,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  addButton: {
    alignItems: "center",
    borderRadius: Radius.lg,
    justifyContent: "center",
    minWidth: 48,
    paddingHorizontal: Spacing.sm,
  },
  addDayRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  addButtonWide: {
    alignItems: "center",
    borderRadius: Radius.lg,
    flexDirection: "row",
    gap: Spacing.xs,
    justifyContent: "center",
    minWidth: 116,
    paddingHorizontal: Spacing.md,
  },
  addButtonWideText: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
  },
  recapCard: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    marginTop: Spacing.md,
    overflow: "hidden",
    padding: Spacing.md,
  },
  recapImage: {
    borderRadius: Radius.xl,
    height: 180,
    marginBottom: Spacing.md,
    width: "100%",
  },
  recapTitle: {
    ...TypeScale.headingSm,
    fontWeight: FontWeight.extrabold,
  },
  recapCaption: {
    ...TypeScale.bodyMd,
    marginTop: Spacing.sm,
  },
  recapStatsRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  recapStat: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    flex: 1,
    padding: Spacing.md,
  },
  recapStatValue: {
    ...TypeScale.headingSm,
    fontWeight: FontWeight.extrabold,
  },
  recapStatLabel: {
    ...TypeScale.bodySm,
    marginTop: 2,
  },
  recapList: {
    ...TypeScale.bodyMd,
    marginTop: Spacing.sm,
  },
  recapSpend: {
    ...TypeScale.bodyMd,
    marginTop: Spacing.md,
  },
  recapMeta: {
    ...TypeScale.bodySm,
    marginTop: Spacing.xs,
  },
});
