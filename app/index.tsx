import { useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { auth, db } from "../firebase";
import { isFirestorePermissionError } from "../utils/firestore-errors";

export default function EntryScreen() {
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      if (!nextUser) {
        router.replace("/login");
        return;
      }

      try {
        const profileSnapshot = await getDoc(doc(db, "profiles", nextUser.uid));

        if (!profileSnapshot.exists()) {
          router.replace("/onboarding");
          return;
        }

        if (profileSnapshot.data().onboardingCompleted !== true) {
          router.replace("/onboarding");
          return;
        }

        router.replace("/home");
      } catch (error) {
        if (isFirestorePermissionError(error)) {
          router.replace("/home");
        } else {
          router.replace("/onboarding");
        }
      }
    });

    return unsubscribe;
  }, [router]);

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom", "left", "right"]}>
      <ActivityIndicator size="large" color="#639922" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#EAF3DE",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
});
