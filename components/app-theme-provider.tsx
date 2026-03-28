import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { auth, db } from "../firebase";

export type AppThemePreference = "light" | "dark";

export function parseAppThemePreference(value: unknown): AppThemePreference {
  return value === "dark" ? "dark" : "light";
}

const APP_THEME_COLORS = {
  light: {
    accent: "#2D6A4F",
    accentMuted: "#F0F7F4",
    accentPressed: "#1B4332",
    accentText: "#2D6A4F",
    border: "#E8E8E8",
    buttonTextOnAction: "#FFFFFF",
    card: "#FFFFFF",
    cardAlt: "#F8F8F8",
    centerButtonBorder: "#E8E8E8",
    destructive: "#DC3545",
    destructiveText: "#FFFFFF",
    disabledBackground: "#E9ECEF",
    disabledText: "#ADB5BD",
    divider: "#F0F0F0",
    elevated: "#FFFFFF",
    error: "#DC3545",
    errorBackground: "#FFF5F5",
    errorBorder: "#FCA5A5",
    errorText: "#991B1B",
    focusBorder: "#2D6A4F",
    hero: "#1A1A1A",
    heroAlt: "#2D2D2D",
    heroText: "#FFFFFF",
    highlight: "#F59E0B",
    info: "#3B82F6",
    inputBackground: "#F5F5F5",
    inputBorder: "#E0E0E0",
    inputPlaceholder: "#9CA3AF",
    inputText: "#1A1A1A",
    modalOverlay: "rgba(0,0,0,0.4)",
    overlay: "rgba(0,0,0,0.5)",
    primaryAction: "#2D6A4F",
    screen: "#FFFFFF",
    screenSoft: "#FAFAFA",
    skeleton: "#E5E7EB",
    skeletonHighlight: "#F3F4F6",
    success: "#059669",
    successBackground: "#ECFDF5",
    successBorder: "#6EE7B7",
    successText: "#065F46",
    tabBar: "#FFFFFF",
    tabInactive: "#9CA3AF",
    textInverse: "#FFFFFF",
    textPrimary: "#1A1A1A",
    textSecondary: "#6B7280",
    textMuted: "#9CA3AF",
    warning: "#F59E0B",
    warningBackground: "#FFFBEB",
    warningBorder: "#FCD34D",
    warningText: "#92400E",
  },
  dark: {
    accent: "#52B788",
    accentMuted: "#1A2F23",
    accentPressed: "#40916C",
    accentText: "#95D5B2",
    border: "#2A2A2A",
    buttonTextOnAction: "#FFFFFF",
    card: "#1C1C1E",
    cardAlt: "#2C2C2E",
    centerButtonBorder: "#3A3A3C",
    destructive: "#FF6B6B",
    destructiveText: "#FFFFFF",
    disabledBackground: "#2C2C2E",
    disabledText: "#636366",
    divider: "#2A2A2A",
    elevated: "#2C2C2E",
    error: "#FF6B6B",
    errorBackground: "#2D1B1B",
    errorBorder: "#7F1D1D",
    errorText: "#FCA5A5",
    focusBorder: "#52B788",
    hero: "#111111",
    heroAlt: "#1C1C1E",
    heroText: "#F5F5F5",
    highlight: "#FBBF24",
    info: "#60A5FA",
    inputBackground: "#2C2C2E",
    inputBorder: "#3A3A3C",
    inputPlaceholder: "#636366",
    inputText: "#F5F5F5",
    modalOverlay: "rgba(0,0,0,0.6)",
    overlay: "rgba(0,0,0,0.7)",
    primaryAction: "#52B788",
    screen: "#111111",
    screenSoft: "#1C1C1E",
    skeleton: "#2C2C2E",
    skeletonHighlight: "#3A3A3C",
    success: "#34D399",
    successBackground: "#1A2F23",
    successBorder: "#065F46",
    successText: "#6EE7B7",
    tabBar: "#1C1C1E",
    tabInactive: "#636366",
    textInverse: "#111111",
    textPrimary: "#F5F5F5",
    textSecondary: "#A1A1AA",
    textMuted: "#71717A",
    warning: "#FBBF24",
    warningBackground: "#2D2517",
    warningBorder: "#92400E",
    warningText: "#FCD34D",
  },
} as const;

type AppThemeContextValue = {
  colors: (typeof APP_THEME_COLORS)[AppThemePreference];
  isDark: boolean;
  setThemePreference: (value: AppThemePreference) => void;
  themePreference: AppThemePreference;
};

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [themePreference, setThemePreference] = useState<AppThemePreference>("light");

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (nextUser) => {
      unsubscribeProfile?.();
      unsubscribeProfile = null;

      if (!nextUser) {
        setThemePreference("light");
        return;
      }

      unsubscribeProfile = onSnapshot(
        doc(db, "profiles", nextUser.uid),
        (profileSnapshot) => {
          if (!profileSnapshot.exists()) {
            setThemePreference("light");
            return;
          }

          const profileData = profileSnapshot.data() as Record<string, unknown>;
          setThemePreference(parseAppThemePreference(profileData.themePreference));
        },
        () => {
          setThemePreference("light");
        }
      );
    });

    return () => {
      unsubscribeProfile?.();
      unsubscribeAuth();
    };
  }, []);

  const value = useMemo(
    () => ({
      colors: APP_THEME_COLORS[themePreference],
      isDark: themePreference === "dark",
      setThemePreference,
      themePreference,
    }),
    [themePreference]
  );

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
}

export function useAppTheme() {
  const context = useContext(AppThemeContext);

  if (!context) {
    throw new Error("useAppTheme must be used within AppThemeProvider.");
  }

  return context;
}
