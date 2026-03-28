import AsyncStorage from "@react-native-async-storage/async-storage";
import { initializeApp } from "firebase/app";
import * as FirebaseAuth from "firebase/auth";
import { getAuth, initializeAuth } from "firebase/auth";
import { getFirestore, initializeFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";
import { Platform } from "react-native";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

type ReactNativeAuthModule = {
  getReactNativePersistence?: (storage: unknown) => unknown;
};

type AuthInitOptions = NonNullable<Parameters<typeof initializeAuth>[1]>;
type AuthPersistenceOption = AuthInitOptions["persistence"];

function createAuth() {
  if (Platform.OS === "web") {
    return getAuth(app);
  }

  try {
    const authModule = FirebaseAuth as unknown as ReactNativeAuthModule;
    const getReactNativePersistence = authModule.getReactNativePersistence;

    if (typeof getReactNativePersistence === "function") {
      const persistence = getReactNativePersistence(AsyncStorage) as AuthPersistenceOption;
      return initializeAuth(app, {
        persistence,
      });
    }
  } catch {
    // Fall back to in-memory auth when RN persistence isn't available.
  }

  return getAuth(app);
}

export const auth = createAuth();

function shouldUseFirestoreWebTransportWorkaround() {
  if (typeof window === "undefined") {
    return false;
  }

  const hostname = window.location?.hostname ?? "";
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)
  );
}

export const db = shouldUseFirestoreWebTransportWorkaround()
  ? initializeFirestore(app, {
      experimentalForceLongPolling: true,
      ignoreUndefinedProperties: true,
      useFetchStreams: false,
    } as Parameters<typeof initializeFirestore>[1] & Record<string, unknown>)
  : getFirestore(app);

export const storage = getStorage(app);
export const functions = getFunctions(
  app,
  process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION || "us-central1"
);
