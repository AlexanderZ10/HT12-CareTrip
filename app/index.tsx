import { useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";

import { auth, db } from "../firebase";
import { isFirestorePermissionError } from "../utils/firestore-errors";

const CARETRIP_BACKGROUND = require("../assets/images/CareTrip-background.png");
const CARETRIP_ICON = require("../assets/images/CareTrip.png");

export default function EntryScreen() {
  const router = useRouter();
  const [nextRoute, setNextRoute] = useState<string | null>(null);
  const [minimumDelayDone, setMinimumDelayDone] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setMinimumDelayDone(true);
    }, 900);

    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      if (!nextUser) {
        setNextRoute("/login");
        return;
      }

      try {
        const profileSnapshot = await getDoc(doc(db, "profiles", nextUser.uid));

        if (!profileSnapshot.exists()) {
          setNextRoute("/onboarding");
          return;
        }

        if (profileSnapshot.data().onboardingCompleted !== true) {
          setNextRoute("/onboarding");
          return;
        }

        setNextRoute("/home");
      } catch (error) {
        if (isFirestorePermissionError(error)) {
          setNextRoute("/home");
        } else {
          setNextRoute("/onboarding");
        }
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!minimumDelayDone || !nextRoute) {
      return;
    }

    router.replace(nextRoute as "/(tabs)/home");
  }, [minimumDelayDone, nextRoute, router]);

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom", "left", "right"]}>
      <Image source={CARETRIP_BACKGROUND} style={styles.backgroundImage} contentFit="cover" />
      <View style={styles.backgroundOverlay} />
      <View style={styles.content}>
        <Image source={CARETRIP_ICON} style={styles.logoImage} contentFit="contain" />
        <View style={styles.loadingCard}>
          <Text style={styles.loadingTitle}>CareTrip</Text>
          <Text style={styles.loadingSubtitle}>Preparing your journey</Text>
          <ActivityIndicator size="large" color="#2D6A4F" style={styles.spinner} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F0F0F0",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
  },
  backgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(245, 250, 238, 0.28)",
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  logoImage: {
    width: 220,
    height: 220,
    marginBottom: 6,
  },
  loadingCard: {
    width: "100%",
    maxWidth: 320,
    borderRadius: 26,
    paddingHorizontal: 24,
    paddingVertical: 22,
    alignItems: "center",
    backgroundColor: "rgba(250, 252, 245, 0.82)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.6)",
    shadowColor: "#1E2A12",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  loadingTitle: {
    color: "#1A1A1A",
    fontSize: 28,
    fontWeight: "900",
    marginBottom: 4,
  },
  loadingSubtitle: {
    color: "#5A6E41",
    fontSize: 15,
    fontWeight: "600",
  },
  spinner: {
    marginTop: 18,
  },
});
