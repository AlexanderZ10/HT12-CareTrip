import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ConfirmDialog } from "../../components/confirm-dialog";
import { auth, db } from "../../firebase";
import { getFirestoreUserMessage } from "../../utils/firestore-errors";
import { getProfileDisplayName } from "../../utils/profile-info";
import {
  parseSavedTrips,
  removeSavedTripForUser,
  type SavedTrip,
} from "../../utils/saved-trips";

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
  const [user, setUser] = useState<User | null>(null);
  const [profileName, setProfileName] = useState("Traveler");
  const [savedTrips, setSavedTrips] = useState<SavedTrip[]>([]);
  const [error, setError] = useState("");
  const [pendingDeleteTrip, setPendingDeleteTrip] = useState<SavedTrip | null>(null);
  const [deletingTripKey, setDeletingTripKey] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (nextUser) => {
      unsubscribeProfile?.();
      unsubscribeProfile = null;

      if (!nextUser) {
        setUser(null);
        setSavedTrips([]);
        setLoading(false);
        router.replace("/login");
        return;
      }

      setUser(nextUser);
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

  const handleDeleteTrip = async () => {
    if (!user || !pendingDeleteTrip || deletingTripKey) {
      return;
    }

    const sourceKey = pendingDeleteTrip.sourceKey;

    try {
      setDeletingTripKey(sourceKey);
      setError("");

      const nextSavedTrips = await removeSavedTripForUser(user.uid, sourceKey);
      setSavedTrips(nextSavedTrips);
      setPendingDeleteTrip(null);
    } catch (nextError) {
      setError(getFirestoreUserMessage(nextError, "write"));
    } finally {
      setDeletingTripKey(null);
    }
  };

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
          <Text style={styles.kicker}>Trips</Text>
          <Text style={styles.title}>Trips for {profileName}</Text>
          <Text style={styles.subtitle}>
            Places from Discover and plans from Home are collected here in one tab.
          </Text>
        </View>

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Could not load Trips</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {!error && savedTrips.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No trips yet</Text>
          <Text style={styles.emptyText}>
            Save a place from Discover or a plan from Home and it will appear here.
          </Text>
        </View>
      ) : null}

        {savedTrips.map((trip) => {
          const isDeleting = deletingTripKey === trip.sourceKey;

          return (
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
            <View style={styles.cardMetaActions}>
              <Text style={styles.dateText}>{formatSavedDate(trip.createdAtMs)}</Text>
              <TouchableOpacity
                style={[styles.deleteButton, isDeleting && styles.deleteButtonDisabled]}
                onPress={() => setPendingDeleteTrip(trip)}
                disabled={isDeleting}
                activeOpacity={0.9}
              >
                <MaterialIcons name="delete-outline" size={16} color="#8A3D35" />
                <Text style={styles.deleteButtonText}>
                  {isDeleting ? "Deleting..." : "Delete"}
                </Text>
              </TouchableOpacity>
            </View>
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
        );
        })}
      </ScrollView>
      <ConfirmDialog
        visible={!!pendingDeleteTrip}
        title="Delete trip?"
        message={
          pendingDeleteTrip
            ? `This will remove "${pendingDeleteTrip.title}" from Trips.`
            : ""
        }
        confirmLabel="Delete"
        destructive
        loading={!!deletingTripKey}
        onCancel={() => {
          if (!deletingTripKey) {
            setPendingDeleteTrip(null);
          }
        }}
        onConfirm={() => {
          void handleDeleteTrip();
        }}
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
    alignItems: "flex-start",
    marginBottom: 12,
    gap: 10,
  },
  cardMetaActions: {
    alignItems: "flex-end",
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
    marginBottom: 8,
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#FFF1EF",
    borderWidth: 1,
    borderColor: "#F0C7C1",
  },
  deleteButtonDisabled: {
    opacity: 0.7,
  },
  deleteButtonText: {
    color: "#8A3D35",
    fontSize: 12,
    fontWeight: "800",
    marginLeft: 4,
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
