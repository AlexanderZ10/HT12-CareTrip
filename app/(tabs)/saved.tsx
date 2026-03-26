import { useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { auth, db } from "../../firebase";
import { parseBookingOrders, type BookingOrder } from "../../utils/bookings";
import { getFirestoreUserMessage } from "../../utils/firestore-errors";
import { getProfileDisplayName } from "../../utils/profile-info";
import { parseSavedTrips, type SavedTrip } from "../../utils/saved-trips";

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

export default function SavedTabScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profileName, setProfileName] = useState("Traveler");
  const [bookingOrders, setBookingOrders] = useState<BookingOrder[]>([]);
  const [savedTrips, setSavedTrips] = useState<SavedTrip[]>([]);
  const [error, setError] = useState("");
  const [activeFilter, setActiveFilter] = useState<SavedFilter>("all");
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (nextUser) => {
      unsubscribeProfile?.();
      unsubscribeProfile = null;

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

  const selectedFilterLabel =
    FILTER_OPTIONS.find((option) => option.id === activeFilter)?.label ?? "All";
  const filteredBookingOrders = activeFilter === "all" || activeFilter === "paid"
    ? bookingOrders
    : [];
  const filteredSavedTrips =
    activeFilter === "all"
      ? savedTrips
      : savedTrips.filter((trip) => trip.source === activeFilter);

  if (loading) {
    return (
      <SafeAreaView style={styles.loader} edges={["top", "left", "right"]}>
        <ActivityIndicator size="large" color="#639922" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Text style={styles.kicker}>Saved</Text>
          <Text style={styles.title}>Запазени маршрути за {profileName}</Text>
          <Text style={styles.subtitle}>
            Тук събираме trip идеи от Discover и AI маршрутите от Home на едно място.
          </Text>
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
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Не успяхме да заредим запазените трипове</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {!error && filteredBookingOrders.length > 0 ? (
        <View style={styles.bookingsSection}>
          <Text style={styles.bookingsSectionTitle}>Booked in app</Text>
          <Text style={styles.bookingsSectionSubtitle}>
            Потвърдените transport и stay резервации се пазят тук.
          </Text>

          {filteredBookingOrders.map((booking) => (
            <View key={booking.id} style={styles.bookingCard}>
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

      {!error && filteredBookingOrders.length === 0 && filteredSavedTrips.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Няма елементи за този филтър</Text>
          <Text style={styles.emptyText}>
            Смени dropdown филтъра или запази нов trip / booking, за да се появи тук.
          </Text>
        </View>
      ) : null}

        {filteredSavedTrips.map((trip) => (
          <View key={trip.id} style={styles.tripCard}>
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
            <Text style={styles.dateText}>{formatSavedDate(trip.createdAtMs)}</Text>
          </View>

          <Text style={styles.tripTitle}>{trip.title}</Text>
          <Text style={styles.tripDestination}>{trip.destination}</Text>

          <View style={styles.metaRow}>
            {trip.duration ? <Text style={styles.metaText}>{trip.duration}</Text> : null}
            {trip.budget ? <Text style={styles.metaText}>{trip.budget}</Text> : null}
          </View>

          {trip.summary ? <Text style={styles.summaryText}>{trip.summary}</Text> : null}

          <Text style={styles.detailsText}>{trip.details}</Text>
          </View>
        ))}
      </ScrollView>
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
  detailsText: {
    color: "#46563A",
    fontSize: 14,
    lineHeight: 21,
  },
});
