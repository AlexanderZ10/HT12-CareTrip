import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppTheme } from "../../components/app-theme-provider";
import { DismissKeyboard } from "../../components/dismiss-keyboard";
import { ConfirmDialog } from "../../components/confirm-dialog";
import {
  FontWeight,
  Layout,
  Radius,
  Spacing,
  TypeScale,
  shadow,
} from "../../constants/design-system";
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
  const insets = useSafeAreaInsets();
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
        <View style={[styles.hero, { backgroundColor: colors.heroAlt }]}>
          <Text style={[styles.kicker, { color: isDark ? "#B7E07C" : "#D6E8AE" }]}>Saved</Text>
          <Text style={styles.title}>Запазени маршрути за {profileName}</Text>
          <Text style={styles.subtitle}>
            Тук събираме trip идеи от Discover и AI маршрутите от Home на едно място.
          </Text>
        </View>

        <View style={styles.searchShell}>
          <MaterialIcons color="#9CA3AF" name="search" size={22} />
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
                  <ActivityIndicator size="small" color="#DC3545" />
                ) : (
                  <MaterialIcons name="delete-outline" size={20} color="#DC3545" />
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
      </KeyboardAvoidingView>
      </DismissKeyboard>

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
                <MaterialIcons name="close" size={20} color="#1A1A1A" />
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
    backgroundColor: "#F0F0F0",
  },
  content: {
    padding: Spacing.xl,
    paddingBottom: Spacing["3xl"],
  },
  loader: {
    flex: 1,
    backgroundColor: "#F0F0F0",
    alignItems: "center",
    justifyContent: "center",
  },
  hero: {
    backgroundColor: "#2D2D2D",
    borderRadius: Radius["3xl"],
    padding: Spacing["2xl"],
    marginBottom: Spacing.lg,
  },
  searchShell: {
    alignItems: "center",
    backgroundColor: "#F5F5F5",
    borderColor: "#E0E0E0",
    borderRadius: Radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  searchInput: {
    color: "#1A1A1A",
    flex: 1,
    ...TypeScale.titleSm,
    marginLeft: Spacing.sm,
  },
  kicker: {
    color: "#D6E8AE",
    ...TypeScale.bodySm,
    fontWeight: FontWeight.bold,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
  },
  title: {
    color: "#FFFFFF",
    ...TypeScale.displayMd,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    color: "#F0F0F0",
    ...TypeScale.titleSm,
  },
  errorCard: {
    backgroundColor: "#FFF1EF",
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: "#F0B6AE",
    marginBottom: Spacing.lg,
  },
  errorTitle: {
    color: "#DC3545",
    ...TypeScale.titleLg,
    fontWeight: FontWeight.extrabold,
    marginBottom: Spacing.xs,
  },
  errorText: {
    color: "#991B1B",
    ...TypeScale.bodyMd,
  },
  emptyCard: {
    backgroundColor: "#F8F8F8",
    borderRadius: Radius["2xl"],
    padding: Spacing["2xl"],
    alignItems: "center",
  },
  emptyTitle: {
    color: "#1A1A1A",
    ...TypeScale.headingMd,
    marginBottom: Spacing.sm,
    textAlign: "center",
  },
  emptyText: {
    color: "#6B7280",
    ...TypeScale.titleSm,
    textAlign: "center",
  },
  filterSection: {
    marginBottom: Spacing.lg,
  },
  filterLabel: {
    color: "#6B7280",
    ...TypeScale.bodySm,
    fontWeight: FontWeight.extrabold,
    textTransform: "uppercase",
    marginBottom: Spacing.sm,
  },
  filterButton: {
    backgroundColor: "#FFFFFF",
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderColor: "#E8E8E8",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  filterButtonText: {
    color: "#1A1A1A",
    ...TypeScale.titleSm,
    fontWeight: FontWeight.bold,
  },
  filterButtonArrow: {
    color: "#6B7280",
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
  },
  filterMenu: {
    marginTop: Spacing.sm,
    backgroundColor: "#FFFFFF",
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: "#E8E8E8",
    padding: Spacing.sm,
  },
  filterOption: {
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  filterOptionActive: {
    backgroundColor: "#F0F0F0",
  },
  filterOptionText: {
    color: "#1A1A1A",
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.bold,
  },
  filterOptionTextActive: {
    color: "#1A1A1A",
  },
  bookingsSection: {
    marginBottom: Spacing.lg,
  },
  bookingsSectionTitle: {
    color: "#1A1A1A",
    ...TypeScale.headingMd,
    marginBottom: Spacing.xs,
  },
  bookingsSectionSubtitle: {
    color: "#6B7280",
    ...TypeScale.bodyMd,
    marginBottom: Spacing.md,
  },
  bookingCard: {
    backgroundColor: "#FFFBEB",
    borderRadius: Radius["2xl"],
    padding: Spacing.xl,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: "#FCD34D",
  },
  bookingTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  bookingPaidBadge: {
    backgroundColor: "#DFF1D0",
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  bookingPaidBadgeText: {
    color: "#1D6C4D",
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
    textTransform: "uppercase",
  },
  bookingTotal: {
    color: "#4E3A19",
    ...TypeScale.headingMd,
    marginBottom: Spacing.xs,
  },
  bookingPaymentMeta: {
    color: "#92400E",
    ...TypeScale.bodySm,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.sm,
  },
  bookingDetailBlock: {
    marginBottom: Spacing.sm,
  },
  bookingDetailTitle: {
    color: "#6B7280",
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
    textTransform: "uppercase",
    marginBottom: Spacing.xs,
  },
  bookingDetailText: {
    color: "#6B7280",
    ...TypeScale.bodyMd,
  },
  bookingContactText: {
    color: "#9CA3AF",
    ...TypeScale.bodySm,
    marginTop: Spacing.xs,
  },
  tripCard: {
    backgroundColor: "#F8F8F8",
    borderRadius: Radius["2xl"],
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
    ...shadow("md"),
  },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  cardTopRowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  sourceBadge: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  discoverBadge: {
    backgroundColor: "#FFF7ED",
  },
  homeBadge: {
    backgroundColor: "#E5E7EB",
  },
  sourceBadgeText: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  discoverBadgeText: {
    color: "#92400E",
  },
  homeBadgeText: {
    color: "#2D6A4F",
  },
  dateText: {
    color: "#6B7A5D",
    ...TypeScale.labelMd,
  },
  tripTitle: {
    color: "#1A1A1A",
    ...TypeScale.headingMd,
    marginBottom: Spacing.xs,
  },
  tripDestination: {
    color: "#6B7280",
    ...TypeScale.titleSm,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.sm,
  },
  previewGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  previewGridPhone: {
    gap: Spacing.sm,
  },
  previewInfoCard: {
    backgroundColor: "#F0F0F0",
    borderColor: "#D1D5DB",
    borderRadius: Radius.lg,
    borderWidth: 1,
    minWidth: 132,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  previewInfoLabel: {
    color: "#9CA3AF",
    ...TypeScale.labelSm,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.4,
    marginBottom: Spacing.xs,
    textTransform: "uppercase",
  },
  previewInfoValue: {
    color: "#1A1A1A",
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.extrabold,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: Spacing.sm,
  },
  metaText: {
    color: "#6B7280",
    ...TypeScale.bodySm,
    fontWeight: FontWeight.bold,
    marginRight: Spacing.md,
    marginBottom: Spacing.xs,
  },
  summaryText: {
    color: "#3C4B30",
    ...TypeScale.titleSm,
    marginBottom: Spacing.sm,
  },
  previewPointsWrap: {
    marginBottom: Spacing.sm,
  },
  previewPointText: {
    color: "#6B7280",
    ...TypeScale.bodyMd,
    marginBottom: Spacing.xs,
  },
  detailsText: {
    color: "#6B7280",
    ...TypeScale.bodyMd,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(16, 26, 8, 0.48)",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
  },
  modalCard: {
    width: "100%",
    maxWidth: Layout.modalMaxWidth + 380,
    maxHeight: "84%",
    backgroundColor: "#FFFFFF",
    borderColor: "#E8E8E8",
    borderRadius: Radius["3xl"],
    borderWidth: 1,
    padding: Spacing.xl,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.lg,
  },
  modalHeaderTextWrap: {
    flex: 1,
    paddingRight: Spacing.md,
  },
  modalTitle: {
    color: "#1A1A1A",
    ...TypeScale.displayMd,
  },
  modalDestination: {
    color: "#5D6F4D",
    ...TypeScale.titleLg,
    fontWeight: FontWeight.bold,
    marginTop: Spacing.xs,
  },
  modalCloseButton: {
    width: Layout.touchTarget,
    height: Layout.touchTarget,
    borderRadius: Radius.md,
    backgroundColor: "#F0F0F0",
    alignItems: "center",
    justifyContent: "center",
  },
  modalSummary: {
    color: "#3C4B30",
    ...TypeScale.bodyLg,
    marginBottom: Spacing.md,
  },
  modalDetailsScroll: {
    marginTop: Spacing.xs,
  },
  modalDetailsContent: {
    paddingBottom: Spacing.xs,
  },
  modalDetailLine: {
    color: "#6B7280",
    ...TypeScale.titleSm,
    marginBottom: Spacing.sm,
  },
});
