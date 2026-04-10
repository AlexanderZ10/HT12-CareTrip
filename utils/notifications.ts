import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebase";

export type NotificationSubscription = {
  remove: () => void;
};

export type NotificationReceivedCallback = (notification: unknown) => void;
export type NotificationResponseCallback = (response: unknown) => void;

let notificationsModulePromise: Promise<typeof import("expo-notifications")> | null = null;
let notificationHandlerConfigured = false;
const SMART_ALERT_STORAGE_KEY = "caretrip:smart-alert-dedupe";

function isExpoGo() {
  return (
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
    Constants.appOwnership === "expo"
  );
}

function canUsePushNotifications() {
  if (Platform.OS === "web") return false;
  if (isExpoGo()) return false;
  if (!Device.isDevice) return false;
  return true;
}

async function loadNotificationsModule() {
  if (!notificationsModulePromise) {
    notificationsModulePromise = import("expo-notifications");
  }

  return notificationsModulePromise;
}

function getConfiguredProjectId() {
  const envProjectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim();

  if (envProjectId) {
    return envProjectId;
  }

  const expoConfigProjectId = Constants.expoConfig?.extra?.eas?.projectId;

  if (typeof expoConfigProjectId === "string" && expoConfigProjectId.trim()) {
    return expoConfigProjectId.trim();
  }

  const easConfigProjectId = Constants.easConfig?.projectId;

  if (typeof easConfigProjectId === "string" && easConfigProjectId.trim()) {
    return easConfigProjectId.trim();
  }

  return null;
}

/** Validates that a string looks like a valid Expo push token. */
function isValidExpoPushToken(token: string): boolean {
  return (
    typeof token === "string" &&
    token.length > 0 &&
    token.length < 200 &&
    (token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken["))
  );
}

export async function initializeNotifications() {
  if (!canUsePushNotifications() || notificationHandlerConfigured) {
    return;
  }

  try {
    const Notifications = await loadNotificationsModule();

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    notificationHandlerConfigured = true;
  } catch (err) {
    console.warn("Failed to initialize notifications:", err);
  }
}

export async function registerForPushNotifications(
  userId: string
): Promise<string | null> {
  if (!canUsePushNotifications()) {
    return null;
  }

  try {
    await initializeNotifications();

    const Notifications = await loadNotificationsModule();
    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      return null;
    }

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    const projectId = getConfiguredProjectId();

    if (!projectId) {
      console.warn("Push notifications: no EAS project ID configured.");
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });

    // Validate token format before persisting
    if (!isValidExpoPushToken(tokenData.data)) {
      console.warn("Push notifications: received invalid token format.");
      return null;
    }

    // Save token to the user's Firestore profile
    await setDoc(
      doc(db, "profiles", userId),
      {
        expoPushToken: tokenData.data,
        pushTokenUpdatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return tokenData.data;
  } catch (err) {
    console.warn("Failed to register push notifications:", err);
    return null;
  }
}

export function addNotificationReceivedListener(
  callback: NotificationReceivedCallback
) {
  return (async (): Promise<NotificationSubscription | undefined> => {
    if (!canUsePushNotifications()) {
      return undefined;
    }

    try {
      await initializeNotifications();
      const Notifications = await loadNotificationsModule();
      return Notifications.addNotificationReceivedListener(callback);
    } catch {
      return undefined;
    }
  })();
}

export function addNotificationResponseListener(
  callback: NotificationResponseCallback
) {
  return (async (): Promise<NotificationSubscription | undefined> => {
    if (!canUsePushNotifications()) {
      return undefined;
    }

    try {
      await initializeNotifications();
      const Notifications = await loadNotificationsModule();
      return Notifications.addNotificationResponseReceivedListener(callback);
    } catch {
      return undefined;
    }
  })();
}

type StoredSmartAlertState = Record<string, number>;

async function readSmartAlertState() {
  try {
    const rawValue = await AsyncStorage.getItem(SMART_ALERT_STORAGE_KEY);
    const parsedValue = rawValue ? (JSON.parse(rawValue) as StoredSmartAlertState) : {};

    if (!parsedValue || typeof parsedValue !== "object" || Array.isArray(parsedValue)) {
      return {} as StoredSmartAlertState;
    }

    return parsedValue;
  } catch {
    return {} as StoredSmartAlertState;
  }
}

async function writeSmartAlertState(nextState: StoredSmartAlertState) {
  try {
    await AsyncStorage.setItem(SMART_ALERT_STORAGE_KEY, JSON.stringify(nextState));
  } catch (error) {
    console.warn("Failed to persist smart alert state:", error);
  }
}

export async function sendLocalSmartNotificationIfNeeded(input: {
  body: string;
  dedupeKey: string;
  title: string;
}) {
  if (!canUsePushNotifications()) {
    return false;
  }

  try {
    await initializeNotifications();
    const Notifications = await loadNotificationsModule();
    const existingState = await readSmartAlertState();
    const now = Date.now();
    const recentNotificationMs = existingState[input.dedupeKey] ?? 0;

    if (recentNotificationMs > 0 && now - recentNotificationMs < 36 * 60 * 60 * 1000) {
      return false;
    }

    // Write the timestamp BEFORE scheduling to prevent concurrent calls from
    // both passing the dedup check (TOCTOU race). If scheduling fails, the
    // dedup write remains — preventing spam is the safer failure mode.
    const updatedState = { ...existingState, [input.dedupeKey]: now };
    await writeSmartAlertState(updatedState);

    await Notifications.scheduleNotificationAsync({
      content: {
        body: input.body,
        data: {
          kind: "smart-trip-alert",
          smartAlertKey: input.dedupeKey,
        },
        sound: "default",
        title: input.title,
      },
      trigger: null,
    });

    return true;
  } catch {
    return false;
  }
}
