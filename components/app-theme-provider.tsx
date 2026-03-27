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
    accent: "#5C8C1F",
    accentMuted: "#EEF4E5",
    accentPressed: "#4E7A19",
    border: "#DDE8C7",
    card: "#FAFCF5",
    cardAlt: "#F6F8EE",
    centerButtonBorder: "#EEF4E5",
    errorBackground: "#FFF1EF",
    errorBorder: "#F0B6AE",
    errorText: "#8A3D35",
    hero: "#223814",
    heroAlt: "#2F4F14",
    inputBackground: "#FFFFFF",
    inputBorder: "#DDE8C7",
    inputPlaceholder: "#809071",
    modalOverlay: "rgba(34,56,20,0.28)",
    screen: "#EEF4E5",
    screenSoft: "#EAF3DE",
    successBackground: "#F3F9E6",
    successBorder: "#C9DF98",
    successText: "#3B6D11",
    tabBar: "#FAFCF5",
    tabInactive: "#748066",
    textPrimary: "#29440F",
    textSecondary: "#5F6E53",
    textMuted: "#7A8870",
    warningBackground: "#FFF8E7",
    warningBorder: "#F1D7A5",
    warningText: "#8B5611",
  },
  dark: {
    accent: "#84C441",
    accentMuted: "#243027",
    accentPressed: "#73B035",
    border: "#2E3C31",
    card: "#1A241C",
    cardAlt: "#202C22",
    centerButtonBorder: "#18211A",
    errorBackground: "#341816",
    errorBorder: "#6B2D26",
    errorText: "#FFB8AE",
    hero: "#0C110D",
    heroAlt: "#111913",
    inputBackground: "#101712",
    inputBorder: "#334235",
    inputPlaceholder: "#8C9985",
    modalOverlay: "rgba(0,0,0,0.52)",
    screen: "#101712",
    screenSoft: "#151E17",
    successBackground: "#162416",
    successBorder: "#365E33",
    successText: "#B5E88D",
    tabBar: "#121A14",
    tabInactive: "#8A9784",
    textPrimary: "#F2F7EC",
    textSecondary: "#B6C3AE",
    textMuted: "#94A08E",
    warningBackground: "#342819",
    warningBorder: "#6E5422",
    warningText: "#F0C978",
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
