import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, initializeFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyC3D7LJg3E5SdlC-JrRyUjNKpwTHd37PLk",
  authDomain: "travelapp-f7ff4.firebaseapp.com",
  projectId: "travelapp-f7ff4",
  storageBucket: "travelapp-f7ff4.firebasestorage.app",
  messagingSenderId: "1093173844964",
  appId: "1:1093173844964:web:991c37c1fdfe50853705f1"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

function shouldUseFirestoreWebTransportWorkaround() {
  if (typeof window === "undefined") {
    return false;
  }

  const hostname = window.location?.hostname ?? "";
  return hostname === "localhost" || hostname === "127.0.0.1";
}

export const db = shouldUseFirestoreWebTransportWorkaround()
  ? initializeFirestore(app, {
      experimentalForceLongPolling: true,
      ignoreUndefinedProperties: true,
      useFetchStreams: false,
    } as Parameters<typeof initializeFirestore>[1] & Record<string, unknown>)
  : getFirestore(app);

export const functions = getFunctions(
  app,
  process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION || "us-central1"
);
