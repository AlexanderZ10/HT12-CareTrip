import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import DiscoverTripMap from "../../components/discover-trip-map";
import { auth, db } from "../../firebase";
import { getFirestoreUserMessage } from "../../utils/firestore-errors";
import { getProfileDisplayName } from "../../utils/profile-info";
import {
  buildSavedTripFromDiscover,
  getDiscoverSavedSourceKey,
  parseSavedTrips,
  saveTripForUser,
} from "../../utils/saved-trips";
import {
  enrichDiscoverTrips,
  GEMINI_MODEL,
  extractDiscoverProfile,
  generateTripsWithGemini,
  getLocalDateKey,
  getTripGenerationErrorMessage,
  parseStoredDiscoverData,
  type DiscoverProfile,
  type StoredDiscoverData,
  type TripRecommendation,
} from "../../utils/trip-recommendations";

export default function DiscoverTabScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWideLayout = width >= 980;
  const isPhoneLayout = width < 768;

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [profileName, setProfileName] = useState("Traveler");
  const [profile, setProfile] = useState<DiscoverProfile | null>(null);
  const [discoverData, setDiscoverData] = useState<StoredDiscoverData | null>(null);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");
  const [savedSourceKeys, setSavedSourceKeys] = useState<string[]>([]);
  const [savingTripKey, setSavingTripKey] = useState<string | null>(null);
  const [expandedMapTrip, setExpandedMapTrip] = useState<TripRecommendation | null>(null);
  const hasRequestedInitialTripsRef = useRef(false);
  const metadataRepairKeyRef = useRef<string | null>(null);

  const todayKey = getLocalDateKey();
  const refreshUsedToday = discoverData?.lastRefreshDateKey === todayKey;
  const heroTitle = isPhoneLayout ? `Discover за ${profileName}` : `Settlements for ${profileName}`;
  const heroSubtitle = isPhoneLayout
    ? "Реални селища със снимка, карта и идеи какво да видиш."
    : "Реални селища с активности, забележителности и истинска карта на местата.";

  const generateAndStoreTrips = useCallback(
    async (
      profileData: DiscoverProfile,
      nextUser: User,
      isManualRefresh: boolean,
      previousTrips: TripRecommendation[],
      currentDiscoverData: StoredDiscoverData | null
    ) => {
      try {
        setGenerating(true);
        setError("");

        const generatedTrips = await generateTripsWithGemini(profileData, previousTrips);
        const generatedAtMs = Date.now();

        const nextDiscoverData: StoredDiscoverData = {
          generatedAtMs,
          lastRefreshDateKey: isManualRefresh
            ? todayKey
            : currentDiscoverData?.lastRefreshDateKey ?? null,
          sourceModel: GEMINI_MODEL,
          summary: generatedTrips.summary,
          trips: generatedTrips.trips,
        };

        await setDoc(
          doc(db, "profiles", nextUser.uid),
          {
            discover: nextDiscoverData,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        setDiscoverData(nextDiscoverData);
      } catch (nextError) {
        const aiErrorMessage = getTripGenerationErrorMessage(nextError);

        if (
          aiErrorMessage !== "Не успяхме да генерираме нови предложения. Опитай отново."
        ) {
          setError(aiErrorMessage);
          return;
        }

        setError(getFirestoreUserMessage(nextError, "write"));
      } finally {
        setGenerating(false);
      }
    },
    [todayKey]
  );

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (nextUser) => {
      unsubscribeProfile?.();
      unsubscribeProfile = null;
      hasRequestedInitialTripsRef.current = false;

      if (!nextUser) {
        setUser(null);
        setLoading(false);
        router.replace("/login");
        return;
      }

      setUser(nextUser);
      setLoading(true);
      setError("");
      setSaveError("");
      setSaveSuccess("");

      unsubscribeProfile = onSnapshot(
        doc(db, "profiles", nextUser.uid),
        (profileSnapshot) => {
          if (!profileSnapshot.exists()) {
            setLoading(false);
            router.replace("/onboarding");
            return;
          }

          const profileData = profileSnapshot.data() as Record<string, unknown>;
          const discoverProfile = extractDiscoverProfile(profileData);

          if (!discoverProfile) {
            setLoading(false);
            router.replace("/onboarding");
            return;
          }

          setProfile(discoverProfile);
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
          setSavedSourceKeys(parseSavedTrips(profileData).map((trip) => trip.sourceKey));

          const storedDiscoverData = parseStoredDiscoverData(profileData);
          setDiscoverData(storedDiscoverData);

          const tripsMissingMetadata =
            storedDiscoverData?.trips.filter(
              (trip) =>
                !trip.imageUrl || trip.latitude === null || trip.longitude === null
            ) ?? [];

          if (tripsMissingMetadata.length > 0) {
            const repairKey = tripsMissingMetadata
              .map(
                (trip) =>
                  `${trip.id}:${trip.imageUrl ? 1 : 0}:${trip.latitude ?? "x"}:${trip.longitude ?? "x"}`
              )
              .join("|");

            if (metadataRepairKeyRef.current !== repairKey) {
              metadataRepairKeyRef.current = repairKey;

              void (async () => {
                try {
                  const enrichedDiscoverData = await enrichDiscoverTrips(
                    storedDiscoverData?.trips ?? []
                  );

                  if (!enrichedDiscoverData.changed) {
                    return;
                  }

                  await setDoc(
                    doc(db, "profiles", nextUser.uid),
                    {
                      discover: {
                        ...storedDiscoverData,
                        trips: enrichedDiscoverData.trips,
                      },
                      updatedAt: serverTimestamp(),
                    },
                    { merge: true }
                  );
                } finally {
                  metadataRepairKeyRef.current = null;
                }
              })();
            }
          } else {
            metadataRepairKeyRef.current = null;
          }

          if (storedDiscoverData?.trips.length) {
            hasRequestedInitialTripsRef.current = false;
          }

          if (
            (!storedDiscoverData || storedDiscoverData.trips.length === 0) &&
            !hasRequestedInitialTripsRef.current
          ) {
            hasRequestedInitialTripsRef.current = true;
            void generateAndStoreTrips(
              discoverProfile,
              nextUser,
              false,
              [],
              storedDiscoverData
            );
          }

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
  }, [generateAndStoreTrips, router]);

  const handleRefresh = async () => {
    if (!user || !profile || generating || refreshUsedToday) {
      return;
    }

    await generateAndStoreTrips(
      profile,
      user,
      true,
      discoverData?.trips ?? [],
      discoverData
    );
  };

  const handleSaveTrip = async (trip: TripRecommendation) => {
    if (!user) {
      return;
    }

    const sourceKey = getDiscoverSavedSourceKey(trip);

    if (savedSourceKeys.includes(sourceKey)) {
      setSaveError("");
      setSaveSuccess(`„${trip.title}“ вече е запазен в Saved.`);
      return;
    }

    try {
      setSavingTripKey(sourceKey);
      setSaveError("");
      setSaveSuccess("");

      const nextSavedTrips = await saveTripForUser(
        user.uid,
        buildSavedTripFromDiscover(trip)
      );

      setSavedSourceKeys(nextSavedTrips.map((savedTrip) => savedTrip.sourceKey));
      setSaveSuccess(`„${trip.title}“ е запазен в Saved.`);
    } catch (nextError) {
      setSaveSuccess("");
      setSaveError(getFirestoreUserMessage(nextError, "write"));
    } finally {
      setSavingTripKey(null);
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
    <>
      <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerBlock}>
            <Text style={styles.kicker}>Discover</Text>
            <Text style={[styles.pageTitle, isPhoneLayout && styles.pageTitlePhone]}>
              {heroTitle}
            </Text>
            <Text style={[styles.pageSubtitle, isPhoneLayout && styles.pageSubtitlePhone]}>
              {heroSubtitle}
            </Text>
          </View>

          <View style={[styles.discoverControlsCard, isPhoneLayout && styles.discoverControlsCardPhone]}>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                isPhoneLayout && styles.primaryButtonPhone,
                (generating || refreshUsedToday) && styles.primaryButtonDisabled,
              ]}
              onPress={handleRefresh}
              disabled={generating || refreshUsedToday}
              activeOpacity={0.9}
            >
              <Text style={styles.primaryButtonText}>
                {generating
                  ? "Refreshing settlements..."
                  : refreshUsedToday
                    ? "Refresh used today"
                    : "Refresh settlements"}
              </Text>
            </TouchableOpacity>

            <Text style={styles.refreshNote}>
              {refreshUsedToday
                ? "Днес вече беше използван refresh. Утре можеш да заредиш нови селища."
                : "Можеш да поискаш нов set settlements веднъж на ден."}
            </Text>
          </View>

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Discover is blocked</Text>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {saveSuccess ? (
          <View style={styles.saveSuccessCard}>
            <Text style={styles.saveSuccessText}>{saveSuccess}</Text>
          </View>
        ) : null}

        {saveError ? (
          <View style={styles.saveErrorCard}>
            <Text style={styles.saveErrorText}>{saveError}</Text>
          </View>
        ) : null}

        {discoverData?.summary ? (
          <View style={[styles.summaryCard, isPhoneLayout && styles.summaryCardPhone]}>
            <Text style={styles.summaryTitle}>Защо тези места са точни за теб</Text>
            <Text style={styles.summaryText}>{discoverData.summary}</Text>
          </View>
        ) : null}

        {generating && !discoverData?.trips.length ? (
          <View style={[styles.loadingCard, isPhoneLayout && styles.loadingCardPhone]}>
            <ActivityIndicator size="large" color="#639922" />
            <Text style={styles.loadingTitle}>Gemini is building your settlements feed</Text>
            <Text style={styles.loadingText}>
              Комбинираме профила ти с internet research, за да върнем реални селища с
              какво да се прави в тях.
            </Text>
          </View>
        ) : null}

          {discoverData?.trips.map((trip) => {
          const sourceKey = getDiscoverSavedSourceKey(trip);
          const isSaved = savedSourceKeys.includes(sourceKey);
          const isSaving = savingTripKey === sourceKey;

          return (
            <View key={trip.id} style={[styles.tripCard, isPhoneLayout && styles.tripCardPhone]}>
              <View style={[styles.topRow, !isWideLayout && styles.topRowStacked]}>
                <View style={[styles.imagePanel, !isWideLayout && styles.imagePanelStacked]}>
                  {trip.imageUrl ? (
                    <Image
                      source={{ uri: trip.imageUrl }}
                      style={[styles.heroImage, isPhoneLayout && styles.heroImagePhone]}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={[styles.imageFallback, isPhoneLayout && styles.imageFallbackPhone]}>
                      <Text
                        style={[
                          styles.imageFallbackTitle,
                          isPhoneLayout && styles.imageFallbackTitlePhone,
                        ]}
                      >
                        {trip.title}
                      </Text>
                      <Text style={styles.imageFallbackText}>No photo found yet</Text>
                    </View>
                  )}
                </View>

                <View style={styles.mapPanel}>
                  <Text style={styles.mapPanelTitle}>Map preview</Text>
                  <DiscoverTripMap
                    attractions={trip.attractions}
                    country={trip.country}
                    destination={trip.destination}
                    height={isPhoneLayout ? 152 : 196}
                    latitude={trip.latitude}
                    longitude={trip.longitude}
                    title={trip.title}
                  />
                  <TouchableOpacity
                    style={[styles.expandButton, isPhoneLayout && styles.expandButtonPhone]}
                    onPress={() => setExpandedMapTrip(trip)}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.expandButtonText}>Expand map</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.tripHeader}>
                <View style={styles.tripHeaderText}>
                  <Text style={[styles.tripTitle, isPhoneLayout && styles.tripTitlePhone]}>
                    {trip.title}
                  </Text>
                  <Text style={styles.tripDestination}>{trip.destination}</Text>
                </View>
                <View style={styles.popularityBadge}>
                  <Text style={styles.popularityBadgeText}>Visited & active</Text>
                </View>
              </View>

              <Text style={styles.tripWhy}>{trip.whyItFits}</Text>
              <Text style={styles.popularityText}>{trip.popularityNote}</Text>

              <View style={styles.sectionBlock}>
                <Text style={styles.sectionTitle}>What to do</Text>
                {trip.highlights.map((highlight) => (
                  <Text key={`${trip.id}-activity-${highlight}`} style={styles.sectionText}>
                    • {highlight}
                  </Text>
                ))}
              </View>

              <View style={styles.sectionBlock}>
                <Text style={styles.sectionTitle}>Must-see spots</Text>
                {trip.attractions.map((attraction) => (
                  <Text key={`${trip.id}-attraction-${attraction}`} style={styles.sectionText}>
                    • {attraction}
                  </Text>
                ))}
              </View>

              <View style={styles.sectionBlock}>
                <Text style={styles.sectionTitle}>Accessibility</Text>
                <Text style={styles.sectionText}>{trip.accessibilityNotes}</Text>
              </View>

              <TouchableOpacity
                style={[
                  styles.saveButton,
                  isPhoneLayout && styles.saveButtonPhone,
                  (isSaved || isSaving) && styles.saveButtonDisabled,
                  isSaved && styles.saveButtonSaved,
                ]}
                onPress={() => {
                  void handleSaveTrip(trip);
                }}
                disabled={isSaved || isSaving}
                activeOpacity={0.9}
              >
                <Text
                  style={[
                    styles.saveButtonText,
                    isSaved && styles.saveButtonTextSaved,
                  ]}
                >
                  {isSaving
                    ? "Saving..."
                    : isSaved
                      ? "Saved in tab"
                      : "Save settlement"}
                </Text>
              </TouchableOpacity>
            </View>
          );
          })}
        </ScrollView>
      </SafeAreaView>

      <Modal
        visible={!!expandedMapTrip}
        transparent
        animationType="fade"
        onRequestClose={() => setExpandedMapTrip(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{expandedMapTrip?.title}</Text>
            {expandedMapTrip ? (
              <DiscoverTripMap
                attractions={expandedMapTrip.attractions}
                country={expandedMapTrip.country}
                destination={expandedMapTrip.destination}
                height={420}
                latitude={expandedMapTrip.latitude}
                longitude={expandedMapTrip.longitude}
                title={expandedMapTrip.title}
              />
            ) : null}
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setExpandedMapTrip(null)}
              activeOpacity={0.9}
            >
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#EEF4E5",
  },
  content: {
    width: "100%",
    maxWidth: 1180,
    alignSelf: "center",
    padding: 20,
    paddingBottom: 32,
  },
  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF4E5",
  },
  headerBlock: {
    marginBottom: 12,
  },
  kicker: {
    color: "#5C8C1F",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  pageTitle: {
    color: "#29440F",
    fontSize: 28,
    lineHeight: 36,
    fontWeight: "800",
    marginBottom: 10,
  },
  pageTitlePhone: {
    fontSize: 20,
    lineHeight: 26,
    marginBottom: 8,
  },
  pageSubtitle: {
    color: "#5F6E53",
    fontSize: 15,
    lineHeight: 22,
  },
  pageSubtitlePhone: {
    fontSize: 13,
    lineHeight: 18,
  },
  discoverControlsCard: {
    backgroundColor: "#F6F8EE",
    borderRadius: 22,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#DDE8C7",
  },
  discoverControlsCardPhone: {
    borderRadius: 18,
    padding: 14,
  },
  primaryButton: {
    backgroundColor: "#BA7517",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryButtonPhone: {
    borderRadius: 14,
    paddingVertical: 13,
  },
  primaryButtonDisabled: {
    opacity: 0.55,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  refreshNote: {
    marginTop: 10,
    color: "#5F6E53",
    fontSize: 13,
    lineHeight: 18,
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
  saveSuccessCard: {
    backgroundColor: "#F3F9E6",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "#C9DF98",
    marginBottom: 16,
  },
  saveSuccessText: {
    color: "#3B6D11",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  saveErrorCard: {
    backgroundColor: "#FFF1EF",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "#F0B6AE",
    marginBottom: 16,
  },
  saveErrorText: {
    color: "#8A3D35",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  summaryCard: {
    backgroundColor: "#FFF8E7",
    borderRadius: 22,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#F1D7A5",
  },
  summaryCardPhone: {
    borderRadius: 18,
    padding: 16,
  },
  summaryTitle: {
    color: "#8B5611",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 8,
  },
  summaryText: {
    color: "#6A5731",
    fontSize: 15,
    lineHeight: 22,
  },
  loadingCard: {
    backgroundColor: "#F6F8EE",
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    marginBottom: 16,
  },
  loadingCardPhone: {
    borderRadius: 20,
    padding: 18,
  },
  loadingTitle: {
    marginTop: 14,
    color: "#29440F",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 8,
    textAlign: "center",
  },
  loadingText: {
    color: "#5F6E53",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  tripCard: {
    backgroundColor: "#F6F8EE",
    borderRadius: 26,
    padding: 20,
    marginBottom: 18,
    shadowColor: "#1E2A12",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  tripCardPhone: {
    borderRadius: 22,
    padding: 14,
  },
  topRow: {
    flexDirection: "row",
    marginBottom: 18,
  },
  topRowStacked: {
    flexDirection: "column",
  },
  imagePanel: {
    flex: 1.4,
    marginRight: 14,
  },
  imagePanelStacked: {
    marginRight: 0,
    marginBottom: 12,
  },
  mapPanel: {
    flex: 1,
  },
  heroImage: {
    width: "100%",
    height: 240,
    borderRadius: 22,
    backgroundColor: "#E0E8D0",
  },
  heroImagePhone: {
    height: 180,
    borderRadius: 18,
  },
  imageFallback: {
    height: 240,
    borderRadius: 22,
    backgroundColor: "#EAF3DE",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  imageFallbackPhone: {
    height: 180,
    borderRadius: 18,
    padding: 16,
  },
  imageFallbackTitle: {
    color: "#29440F",
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 8,
  },
  imageFallbackTitlePhone: {
    fontSize: 18,
    lineHeight: 24,
  },
  imageFallbackText: {
    color: "#5F6E53",
    fontSize: 14,
    textAlign: "center",
  },
  mapPanelTitle: {
    color: "#3B6D11",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 8,
    textTransform: "uppercase",
  },
  expandButton: {
    marginTop: 10,
    backgroundColor: "#FFF2DA",
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  expandButtonPhone: {
    marginTop: 8,
    paddingVertical: 10,
  },
  expandButtonText: {
    color: "#8B5611",
    fontWeight: "800",
  },
  tripHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  tripHeaderText: {
    flex: 1,
    paddingRight: 12,
  },
  tripTitle: {
    color: "#29440F",
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 6,
  },
  tripTitlePhone: {
    fontSize: 19,
    lineHeight: 24,
  },
  tripDestination: {
    color: "#5A6E41",
    fontSize: 15,
    fontWeight: "700",
  },
  popularityBadge: {
    backgroundColor: "#FFF2DA",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  popularityBadgeText: {
    color: "#8B5611",
    fontSize: 12,
    fontWeight: "800",
  },
  tripWhy: {
    color: "#3C4B30",
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 10,
  },
  popularityText: {
    color: "#6A5731",
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 14,
  },
  sectionBlock: {
    marginTop: 6,
  },
  sectionTitle: {
    color: "#3B6D11",
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    marginBottom: 6,
  },
  sectionText: {
    color: "#46563A",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 4,
  },
  saveButton: {
    marginTop: 18,
    backgroundColor: "#639922",
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveButtonPhone: {
    marginTop: 14,
    borderRadius: 14,
    paddingVertical: 12,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonSaved: {
    backgroundColor: "#E4EFD0",
    borderWidth: 1,
    borderColor: "#C8DAA5",
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  saveButtonTextSaved: {
    color: "#3B6D11",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(18, 27, 10, 0.54)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 900,
    backgroundColor: "#FAFCF5",
    borderRadius: 28,
    padding: 20,
  },
  modalTitle: {
    color: "#29440F",
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 14,
  },
  modalMapImage: {
    width: "100%",
    height: 420,
    borderRadius: 22,
    backgroundColor: "#DDE8C7",
  },
  modalCloseButton: {
    backgroundColor: "#223814",
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 16,
  },
  modalCloseText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
});
