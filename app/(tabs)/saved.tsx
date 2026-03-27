import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAppTheme } from "../../components/app-theme-provider";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { auth, db } from "../../firebase";
import { parseBookingOrders, type BookingOrder } from "../../utils/bookings";
import { getFirestoreUserMessage } from "../../utils/firestore-errors";
import { getProfileDisplayName } from "../../utils/profile-info";
import { parseSavedTrips, removeSavedTripForUser, type SavedTrip } from "../../utils/saved-trips";

const FILTER_OPTIONS = [
  { id: "all", label: "All" },
  { id: "paid", label: "Paid" },
  { id: "home", label: "Home Planner" },
  { id: "discover", label: "Discover" },
] as const;

type SavedFilter = (typeof FILTER_OPTIONS)[number]["id"];

function formatSavedDate(value: number) {
  return new Intl.DateTimeFormat("bg-BG", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "long",
  }).format(new Date(value));
}

function getSavedTripDetailLines(trip: SavedTrip) {
  const excluded = new Set(
    [trip.summary, trip.destination, trip.title]
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
  const seen = new Set<string>();

  return trip.details
    .split("\n")
    .map((line) => line.replace(/^[-•]\s*/, "").trim())
    .filter((line) => line && !line.endsWith(":"))
    .filter((line) => {
      const normalized = line.toLowerCase();

      if (!normalized || excluded.has(normalized) || seen.has(normalized)) {
        return false;
      }

      seen.add(normalized);
      return true;
    });
}

function buildTripPreviewPoints(trip: SavedTrip) {
  return getSavedTripDetailLines(trip).slice(0, 3);
}

export default function SavedTabScreen() {
  const router = useRouter();
  const { colors, isDark } = useAppTheme();
  const { width } = useWindowDimensions();
  const isPhoneLayout = width < 768;
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileName, setProfileName] = useState("Traveler");
  const [bookingOrders, setBookingOrders] = useState<BookingOrder[]>([]);
  const [savedTrips, setSavedTrips] = useState<SavedTrip[]>([]);
  const [error, setError] = useState("");
  const [activeFilter, setActiveFilter] = useState<SavedFilter>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [tripSearch, setTripSearch] = useState("");
  const [selectedTrip, setSelectedTrip] = useState<SavedTrip | null>(null);
  const [pendingDeleteTrip, setPendingDeleteTrip] = useState<SavedTrip | null>(null);
  const [deletingTripKey, setDeletingTripKey] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (nextUser) => {
      unsubscribeProfile?.();
      unsubscribeProfile = null;

      setUser(nextUser);

      if (!nextUser) {
        setBookingOrders([]);
        setSavedTrips([]);
        setLoading(false);
        router.replace("/login");
        return;
      }

      setLoading(true);
      setError("");

      unsubscribeProfile = onSnapshot(
        doc(db, "profiles", nextUser.uid),
        (profileSnapshot) => {
          if (!profileSnapshot.exists()) {
            setSavedTrips([]);
            setLoading(false);
            router.replace("/onboarding");
            return;
          }

          const profileData = profileSnapshot.data() as Record<string, unknown>;
          setProfileName(
            getProfileDisplayName({
              email: nextUser.email,
              profileInfo:
                profileData.profileInfo && typeof profileData.profileInfo === "object"
                  ? (profileData.profileInfo as Record<string, unknown>)
                  : undefined,
              username: typeof profileData.username === "string" ? profileData.username : null,
            })
          );
          setBookingOrders(parseBookingOrders(profileData));
          setSavedTrips(parseSavedTrips(profileData));
          setLoading(false);
        },
        (nextError) => {
          setError(getFirestoreUserMessage(nextError, "read"));
          setLoading(false);
        }
      );
    });

    return () => {
      unsubscribeProfile?.();
      unsubscribeAuth();
    };
  }, [router]);

  async function handleDeleteTrip(trip: SavedTrip) {
    if (!user) return;
    const key = `${trip.source}_${trip.id}`;
    setDeletingTripKey(key);
    try {
      const remaining = await removeSavedTripForUser(user.uid, trip.sourceKey);
      setSavedTrips(remaining);
    } catch {
      // silent
    } finally {
      setDeletingTripKey(null);
      setPendingDeleteTrip(null);
    }
  }

  const selectedFilterLabel =
    FILTER_OPTIONS.find((option) => option.id === activeFilter)?.label ?? "All";
  const filteredBookingOrders = activeFilter === "all" || activeFilter === "paid"
    ? bookingOrders
    : [];
  const filteredSavedTrips =
    activeFilter === "all"
      ? savedTrips
      : savedTrips.filter((trip) => trip.source === activeFilter);

  const filteredTrips = useMemo(() => {
    const query = tripSearch.trim().toLowerCase();

    if (!query) {
      return filteredSavedTrips;
    }

    return filteredSavedTrips.filter((trip) =>
      [trip.title, trip.destination, trip.summary, trip.details, trip.budget, trip.duration]
        .filter((value): value is string => !!value)
        .some((value) => value.toLowerCase().includes(query))
    );
  }, [filteredSavedTrips, tripSearch]);

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.loader, { backgroundColor: colors.screenSoft }]}
        edges={["top", "left", "right"]}
      >
        <ActivityIndicator size="large" color="#639922" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: colors.screenSoft }]}
      edges={["top", "left", "right"]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, { backgroundColor: colors.heroAlt }]}>
          <Text style={[styles.kicker, { color: isDark ? "#B7E07C" : "#D6E8AE" }]}>Saved</Text>
          <Text style={styles.title}>Запазени маршрути за {profileName}</Text>
          <Text style={styles.subtitle}>
            Тук събираме trip идеи от Discover и AI маршрутите от Home на едно място.
          </Text>
        </View>

        <View style={styles.searchShell}>
          <MaterialIcons color="#7B8A6D" name="search" size={22} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search Trips"
            placeholderTextColor="#809071"
            value={tripSearch}
            onChangeText={setTripSearch}
          />
        </View>

        <View style={styles.filterSection}>
          <Text style={styles.filterLabel}>Filter</Text>
          <TouchableOpacity
            style={styles.filterButton}
            onPress={() => setFilterOpen((current) => !current)}
            activeOpacity={0.9}
          >
            <Text style={styles.filterButtonText}>{selectedFilterLabel}</Text>
            <Text style={styles.filterButtonArrow}>{filterOpen ? "▲" : "▼"}</Text>
          </TouchableOpacity>

          {filterOpen ? (
            <View style={styles.filterMenu}>
              {FILTER_OPTIONS.map((option) => {
                const isActive = option.id === activeFilter;

                return (
                  <TouchableOpacity
                    key={option.id}
                    style={[
                      styles.filterOption,
                      isActive && styles.filterOptionActive,
                    ]}
                    onPress={() => {
                      setActiveFilter(option.id);
                      setFilterOpen(false);
                    }}
                    activeOpacity={0.9}
                  >
                    <Text
                      style={[
                        styles.filterOptionText,
                        isActive && styles.filterOptionTextActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}
        </View>

      {error ? (
        <View
          style={[
            styles.errorCard,
            { backgroundColor: colors.errorBackground, borderColor: colors.errorBorder },
          ]}
        >
          <Text style={styles.errorTitle}>Не успяхме да заредим запазените трипове</Text>
          <Text style={[styles.errorText, { color: colors.errorText }]}>{error}</Text>
        </View>
      ) : null}

      {!error && filteredBookingOrders.length > 0 ? (
        <View style={styles.bookingsSection}>
          <Text style={[styles.bookingsSectionTitle, { color: colors.textPrimary }]}>Booked in app</Text>
          <Text style={[styles.bookingsSectionSubtitle, { color: colors.textSecondary }]}>
            Потвърдените transport и stay резервации се пазят тук.
          </Text>

          {filteredBookingOrders.map((booking) => (
            <View
              key={booking.id}
              style={[
                styles.bookingCard,
                {
                  backgroundColor: colors.warningBackground,
                  borderColor: colors.warningBorder,
                },
              ]}
            >
              <View style={styles.bookingTopRow}>
                <View style={styles.bookingPaidBadge}>
                  <Text style={styles.bookingPaidBadgeText}>Paid</Text>
                </View>
                <Text style={styles.dateText}>{formatSavedDate(booking.createdAtMs)}</Text>
              </View>

              <Text style={styles.tripTitle}>{booking.title}</Text>
              <Text style={styles.tripDestination}>{booking.destination}</Text>

              <View style={styles.metaRow}>
                {booking.days ? <Text style={styles.metaText}>{booking.days}</Text> : null}
                {booking.travelers ? <Text style={styles.metaText}>{booking.travelers}</Text> : null}
                {booking.budget ? <Text style={styles.metaText}>{booking.budget}</Text> : null}
              </View>

              <Text style={styles.bookingTotal}>{booking.totalLabel}</Text>
              <Text style={styles.bookingPaymentMeta}>{booking.paymentMethod}</Text>

              {booking.transport ? (
                <View style={styles.bookingDetailBlock}>
                  <Text style={styles.bookingDetailTitle}>Transport</Text>
                  <Text style={styles.bookingDetailText}>
                    {booking.transport.mode} • {booking.transport.provider}
                  </Text>
                  <Text style={styles.bookingDetailText}>{booking.transport.route}</Text>
                </View>
              ) : null}

              {booking.stay ? (
                <View style={styles.bookingDetailBlock}>
                  <Text style={styles.bookingDetailTitle}>Stay</Text>
                  <Text style={styles.bookingDetailText}>
                    {booking.stay.name} • {booking.stay.type}
                  </Text>
                  <Text style={styles.bookingDetailText}>
                    {booking.stay.area} • {booking.stay.pricePerNight}
                  </Text>
                </View>
              ) : null}

              <Text style={styles.bookingContactText}>
                {booking.contactName} • {booking.contactEmail}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {!error && filteredBookingOrders.length === 0 && filteredTrips.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.cardAlt }]}>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Няма елементи за този филтър</Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Смени dropdown филтъра или запази нов trip / booking, за да се появи тук.
          </Text>
        </View>
      ) : null}

      {!error && savedTrips.length > 0 && filteredTrips.length === 0 && tripSearch.trim() ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.cardAlt }]}>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No matching trips</Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Try another destination, budget, or keyword from the saved plan.
          </Text>
        </View>
      ) : null}

        {filteredTrips.map((trip) => {
          const isDeleting = deletingTripKey === trip.sourceKey;
          const previewPoints = buildTripPreviewPoints(trip);

          return (
          <TouchableOpacity
            key={trip.id}
            style={[
              styles.tripCard,
              { backgroundColor: colors.cardAlt, borderColor: colors.border },
            ]}
            activeOpacity={0.94}
            onPress={() => setSelectedTrip(trip)}
          >
          <View style={styles.cardTopRow}>
            <View
              style={[
                styles.sourceBadge,
                trip.source === "home" ? styles.homeBadge : styles.discoverBadge,
              ]}
            >
              <Text
                style={[
                  styles.sourceBadgeText,
                  trip.source === "home"
                    ? styles.homeBadgeText
                    : styles.discoverBadgeText,
                ]}
              >
                {trip.source === "home" ? "Home Planner" : "Discover"}
              </Text>
            </View>
            <View style={styles.cardTopRowRight}>
              <Text style={styles.dateText}>{formatSavedDate(trip.createdAtMs)}</Text>
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  setPendingDeleteTrip(trip);
                }}
                hitSlop={8}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <ActivityIndicator size="small" color="#A63228" />
                ) : (
                  <MaterialIcons name="delete-outline" size={20} color="#A63228" />
                )}
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.tripTitle}>{trip.title}</Text>
          <Text style={styles.tripDestination}>{trip.destination}</Text>

          <View style={[styles.previewGrid, isPhoneLayout && styles.previewGridPhone]}>
            <View style={styles.previewInfoCard}>
              <Text style={styles.previewInfoLabel}>Destination</Text>
              <Text style={styles.previewInfoValue}>{trip.destination}</Text>
            </View>
            <View style={styles.previewInfoCard}>
              <Text style={styles.previewInfoLabel}>Source</Text>
              <Text style={styles.previewInfoValue}>
                {trip.source === "home" ? "Home Planner" : "Discover"}
              </Text>
            </View>
            {trip.duration ? (
              <View style={styles.previewInfoCard}>
                <Text style={styles.previewInfoLabel}>Duration</Text>
                <Text style={styles.previewInfoValue}>{trip.duration}</Text>
              </View>
            ) : null}
            {trip.budget ? (
              <View style={styles.previewInfoCard}>
                <Text style={styles.previewInfoLabel}>Budget</Text>
                <Text style={styles.previewInfoValue}>{trip.budget}</Text>
              </View>
            ) : null}
          </View>

          {trip.summary ? (
            <Text style={styles.summaryText} numberOfLines={isPhoneLayout ? 4 : 3}>
              {trip.summary}
            </Text>
          ) : null}

          {previewPoints.length > 0 ? (
            <View style={styles.previewPointsWrap}>
              {previewPoints.map((point) => (
                <Text key={`${trip.id}-${point}`} style={styles.previewPointText}>
                  • {point}
                </Text>
              ))}
            </View>
          ) : null}

          <Text style={styles.detailsText} numberOfLines={isPhoneLayout ? 6 : 5}>
            {trip.details}
          </Text>
          </TouchableOpacity>
        );
        })}
      </ScrollView>

      <Modal
        visible={!!selectedTrip}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedTrip(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTextWrap}>
                <Text style={styles.modalTitle}>{selectedTrip?.title}</Text>
                <Text style={styles.modalDestination}>{selectedTrip?.destination}</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setSelectedTrip(null)}
                activeOpacity={0.9}
              >
                <MaterialIcons name="close" size={20} color="#29440F" />
              </TouchableOpacity>
            </View>

            {selectedTrip ? (
              <>
                <View style={[styles.previewGrid, isPhoneLayout && styles.previewGridPhone]}>
                  <View style={styles.previewInfoCard}>
                    <Text style={styles.previewInfoLabel}>Source</Text>
                    <Text style={styles.previewInfoValue}>
                      {selectedTrip.source === "home" ? "Home Planner" : "Discover"}
                    </Text>
                  </View>
                  <View style={styles.previewInfoCard}>
                    <Text style={styles.previewInfoLabel}>Saved on</Text>
                    <Text style={styles.previewInfoValue}>
                      {formatSavedDate(selectedTrip.createdAtMs)}
                    </Text>
                  </View>
                  {selectedTrip.duration ? (
                    <View style={styles.previewInfoCard}>
                      <Text style={styles.previewInfoLabel}>Duration</Text>
                      <Text style={styles.previewInfoValue}>{selectedTrip.duration}</Text>
                    </View>
                  ) : null}
                  {selectedTrip.budget ? (
                    <View style={styles.previewInfoCard}>
                      <Text style={styles.previewInfoLabel}>Budget</Text>
                      <Text style={styles.previewInfoValue}>{selectedTrip.budget}</Text>
                    </View>
                  ) : null}
                </View>

                {selectedTrip.summary ? (
                  <Text style={styles.modalSummary}>{selectedTrip.summary}</Text>
                ) : null}

                <ScrollView
                  style={styles.modalDetailsScroll}
                  contentContainerStyle={styles.modalDetailsContent}
                  showsVerticalScrollIndicator={false}
                >
                  {getSavedTripDetailLines(selectedTrip).map((line) => (
                    <Text key={`${selectedTrip.id}-${line}`} style={styles.modalDetailLine}>
                      • {line}
                    </Text>
                  ))}
                </ScrollView>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      <ConfirmDialog
        visible={!!pendingDeleteTrip}
        title="Изтриване на трип"
        message={`Сигурен ли си, че искаш да премахнеш "${pendingDeleteTrip?.title ?? ""}"?`}
        confirmLabel="Изтрий"
        onConfirm={() => {
          if (pendingDeleteTrip) handleDeleteTrip(pendingDeleteTrip);
        }}
        onCancel={() => setPendingDeleteTrip(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#EAF3DE",
  },
  content: {
    padding: 20,
    paddingBottom: 32,
  },
  loader: {
    flex: 1,
    backgroundColor: "#EAF3DE",
    alignItems: "center",
    justifyContent: "center",
  },
  hero: {
    backgroundColor: "#2F4F14",
    borderRadius: 28,
    padding: 24,
    marginBottom: 18,
  },
  searchShell: {
    alignItems: "center",
    backgroundColor: "#F8FBF2",
    borderColor: "#D8E3C2",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  searchInput: {
    color: "#29440F",
    flex: 1,
    fontSize: 15,
    marginLeft: 10,
  },
  kicker: {
    color: "#D6E8AE",
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 28,
    lineHeight: 36,
    fontWeight: "800",
    marginBottom: 10,
  },
  subtitle: {
    color: "#EAF3DE",
    fontSize: 15,
    lineHeight: 22,
  },
  errorCard: {
    backgroundColor: "#FFF1EF",
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: "#F0B6AE",
    marginBottom: 16,
  },
  errorTitle: {
    color: "#A63228",
    fontSize: 17,
    fontWeight: "800",
    marginBottom: 6,
  },
  errorText: {
    color: "#8A3D35",
    fontSize: 14,
    lineHeight: 20,
  },
  emptyCard: {
    backgroundColor: "#F6F8EE",
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
  },
  emptyTitle: {
    color: "#29440F",
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 10,
    textAlign: "center",
  },
  emptyText: {
    color: "#5F6E53",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  filterSection: {
    marginBottom: 16,
  },
  filterLabel: {
    color: "#47642A",
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    marginBottom: 8,
  },
  filterButton: {
    backgroundColor: "#FAFCF5",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "#DDE8C7",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  filterButtonText: {
    color: "#29440F",
    fontSize: 15,
    fontWeight: "700",
  },
  filterButtonArrow: {
    color: "#5A6E41",
    fontSize: 12,
    fontWeight: "800",
  },
  filterMenu: {
    marginTop: 8,
    backgroundColor: "#FAFCF5",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#DDE8C7",
    padding: 8,
  },
  filterOption: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  filterOptionActive: {
    backgroundColor: "#EAF3DE",
  },
  filterOptionText: {
    color: "#365A14",
    fontSize: 14,
    fontWeight: "700",
  },
  filterOptionTextActive: {
    color: "#29440F",
  },
  bookingsSection: {
    marginBottom: 18,
  },
  bookingsSectionTitle: {
    color: "#29440F",
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 6,
  },
  bookingsSectionSubtitle: {
    color: "#5F6E53",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  bookingCard: {
    backgroundColor: "#FFF8E7",
    borderRadius: 24,
    padding: 20,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#F1D7A5",
  },
  bookingTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  bookingPaidBadge: {
    backgroundColor: "#DFF1D0",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bookingPaidBadgeText: {
    color: "#1D6C4D",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  bookingTotal: {
    color: "#4E3A19",
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 6,
  },
  bookingPaymentMeta: {
    color: "#8B5611",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 10,
  },
  bookingDetailBlock: {
    marginBottom: 10,
  },
  bookingDetailTitle: {
    color: "#47642A",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  bookingDetailText: {
    color: "#5A6E41",
    fontSize: 14,
    lineHeight: 20,
  },
  bookingContactText: {
    color: "#627254",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  tripCard: {
    backgroundColor: "#F6F8EE",
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#1E2A12",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    gap: 10,
  },
  cardTopRowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sourceBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  discoverBadge: {
    backgroundColor: "#FFF2DA",
  },
  homeBadge: {
    backgroundColor: "#E4EFD0",
  },
  sourceBadgeText: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  discoverBadgeText: {
    color: "#8B5611",
  },
  homeBadgeText: {
    color: "#3B6D11",
  },
  dateText: {
    color: "#6B7A5D",
    fontSize: 12,
    fontWeight: "600",
  },
  tripTitle: {
    color: "#29440F",
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 6,
  },
  tripDestination: {
    color: "#5A6E41",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 10,
  },
  previewGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 12,
  },
  previewGridPhone: {
    gap: 8,
  },
  previewInfoCard: {
    backgroundColor: "#EEF5DF",
    borderColor: "#D7E4BD",
    borderRadius: 16,
    borderWidth: 1,
    minWidth: 132,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  previewInfoLabel: {
    color: "#7A866A",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  previewInfoValue: {
    color: "#29440F",
    fontSize: 14,
    fontWeight: "800",
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 10,
  },
  metaText: {
    color: "#516244",
    fontSize: 13,
    fontWeight: "700",
    marginRight: 12,
    marginBottom: 4,
  },
  summaryText: {
    color: "#3C4B30",
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 10,
  },
  previewPointsWrap: {
    marginBottom: 10,
  },
  previewPointText: {
    color: "#516244",
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 4,
  },
  detailsText: {
    color: "#46563A",
    fontSize: 14,
    lineHeight: 21,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(16, 26, 8, 0.48)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 860,
    maxHeight: "84%",
    backgroundColor: "#FAFCF5",
    borderColor: "#DDE8C7",
    borderRadius: 28,
    borderWidth: 1,
    padding: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  modalHeaderTextWrap: {
    flex: 1,
    paddingRight: 12,
  },
  modalTitle: {
    color: "#29440F",
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800",
  },
  modalDestination: {
    color: "#5D6F4D",
    fontSize: 17,
    fontWeight: "700",
    marginTop: 6,
  },
  modalCloseButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#EEF5DF",
    alignItems: "center",
    justifyContent: "center",
  },
  modalSummary: {
    color: "#3C4B30",
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 12,
  },
  modalDetailsScroll: {
    marginTop: 6,
  },
  modalDetailsContent: {
    paddingBottom: 6,
  },
  modalDetailLine: {
    color: "#46563A",
    fontSize: 15,
    lineHeight: 23,
    marginBottom: 10,
  },
});
