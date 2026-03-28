import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";

import { auth, db } from "../firebase";

export type AppThemeMode = "dark" | "light";

// ---------------------------------------------------------------------------
// Palette definitions
// Full semantic token set for the CareTrip design system.
// NEVER reference these raw objects in components — always use useAppTheme().
// ---------------------------------------------------------------------------

export const LIGHT_THEME = {
  // --- Backgrounds ---
  /** Main screen background */
  appBackground: "#FFFFFF",
  /** Card and surface background */
  cardBackground: "#FFFFFF",
  /** Elevated surfaces (e.g. floating cards) */
  elevated: "#FFFFFF",
  /** Hero / header sections */
  heroBackground: "#1A1A1A",
  /** Tab bar background */
  tabBarBackground: "#FFFFFF",
  /** Overlay scrim (modals, drawers) */
  overlay: "rgba(16, 26, 8, 0.48)",
  /** Skeleton / shimmer base */
  skeleton: "#E5E7EB",
  /** Skeleton / shimmer highlight */
  skeletonHighlight: "#F3F4F6",

  // --- Borders ---
  /** Standard card border */
  cardBorder: "#E8E8E8",
  /** Input field border */
  inputBorder: "#E0E0E0",
  /** Divider lines */
  divider: "#F0F0F0",
  /** Focus ring for inputs */
  focusBorder: "#2D6A4F",

  // --- Text ---
  /** Primary body / heading text */
  textPrimary: "#1A1A1A",
  /** Secondary / supporting text */
  bodyText: "#6B7280",
  /** Muted / disabled text */
  textMuted: "#9CA3AF",
  /** Inverse text (on dark backgrounds) */
  textInverse: "#FFFFFF",
  /** Accent label text */
  accentText: "#2D6A4F",
  /** Text on hero sections */
  heroText: "#FFFFFF",
  /** Highlighted text colour */
  highlightText: "#0D1F02",

  // --- Inputs ---
  /** Input field background */
  inputBackground: "#FFFFFF",
  /** Input field text */
  inputText: "#1A1A1A",
  /** Input placeholder text */
  inputPlaceholder: "#9CA3AF",

  // --- Actions ---
  /** Primary CTA colour (buttons, links) */
  primaryAction: "#2D6A4F",
  /** Text / icon on primary action backgrounds */
  buttonTextOnAction: "#FFFFFF",
  /** Destructive action (delete, error) */
  destructive: "#DC3545",
  /** Text on destructive backgrounds */
  destructiveText: "#FFFFFF",
  /** Disabled element background */
  disabledBackground: "#E9ECEF",
  /** Disabled element text */
  disabledText: "#ADB5BD",

  // --- Accent / highlight ---
  /** Orange warm highlight accent */
  highlight: "#EF9F27",
  /** Success state */
  success: "#059669",
  /** Warning state */
  warning: "#E8A020",
  /** Error state */
  error: "#DC3545",
  /** Info state */
  info: "#3B82F6",

  // --- Tab bar ---
  /** Active tab icon/label */
  tabBarActive: "#1A1A1A",
  /** Inactive tab icon/label */
  tabBarInactive: "#9CA3AF",

  // --- Chips / pills / mode selectors ---
  summaryChipBackground: "#F5F5F5",
  summaryChipText: "#374151",
  modeCardBackground: "#FFFFFF",
  modeCardBorder: "#E8E8E8",
  modeInactiveBackground: "#F5F5F5",
  modeInactiveText: "#6B7280",
  modeSelectedLightBackground: "#EAF3FF",
  modeSelectedLightBorder: "#A7C8F9",
  modeSelectedLightText: "#355D96",
  modeSelectedDarkBackground: "#1A1A1A",
  modeSelectedDarkBorder: "#1A1A1A",
  modeSelectedDarkText: "#F5F5F5",

  // --- Screen icon overlay ---
  screenIconBackground: "rgba(255,255,255,0.08)",
  screenIconBorder: "rgba(255,255,255,0.14)",
} as const;

export const DARK_THEME = {
  // --- Backgrounds ---
  appBackground: "#111111",
  cardBackground: "#1C1C1E",
  elevated: "#2C2C2E",
  heroBackground: "#1C1C1E",
  tabBarBackground: "#1C1C1E",
  overlay: "rgba(0, 0, 0, 0.64)",
  skeleton: "#2C2C2E",
  skeletonHighlight: "#3A3A3C",

  // --- Borders ---
  cardBorder: "#2A2A2A",
  inputBorder: "#3A3A3C",
  divider: "#2A2A2A",
  focusBorder: "#52B788",

  // --- Text ---
  textPrimary: "#F5F5F5",
  bodyText: "#A1A1AA",
  textMuted: "#71717A",
  textInverse: "#0D1F02",
  accentText: "#95D5B2",
  heroText: "#F5F5F5",
  highlightText: "#0D1F02",

  // --- Inputs ---
  inputBackground: "#2C2C2E",
  inputText: "#F5F5F5",
  inputPlaceholder: "#636366",

  // --- Actions ---
  primaryAction: "#52B788",
  buttonTextOnAction: "#0D1F02",
  destructive: "#FF6B6B",
  destructiveText: "#FFFFFF",
  disabledBackground: "#2C2C2E",
  disabledText: "#636366",

  // --- Accent / highlight ---
  highlight: "#EF9F27",
  success: "#34D399",
  warning: "#EF9F27",
  error: "#FF6B6B",
  info: "#60A5FA",

  // --- Tab bar ---
  tabBarActive: "#F5F5F5",
  tabBarInactive: "#636366",

  // --- Chips / pills / mode selectors ---
  summaryChipBackground: "#2C2C2E",
  summaryChipText: "#95D5B2",
  modeCardBackground: "#1C1C1E",
  modeCardBorder: "#2A2A2A",
  modeInactiveBackground: "#2C2C2E",
  modeInactiveText: "#95D5B2",
  modeSelectedLightBackground: "#DDE7F5",
  modeSelectedLightBorder: "#C4D1E6",
  modeSelectedLightText: "#304865",
  modeSelectedDarkBackground: "#52B788",
  modeSelectedDarkBorder: "#52B788",
  modeSelectedDarkText: "#111111",

  // --- Screen icon overlay ---
  screenIconBackground: "#2C2C2E",
  screenIconBorder: "#52B788",
} as const;

export type AppPalette = { readonly [K in keyof typeof LIGHT_THEME]: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getProfileThemeMode(value: unknown): AppThemeMode {
  return value === "dark" ? "dark" : "light";
}

export function getThemePalette(mode: AppThemeMode): AppPalette {
  return mode === "dark" ? DARK_THEME : LIGHT_THEME;
}

// ---------------------------------------------------------------------------
// useAppTheme — syncs theme from Firestore user profile in real-time
// ---------------------------------------------------------------------------

export function useAppTheme() {
  const [mode, setMode] = useState<AppThemeMode>("light");

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (nextUser) => {
      unsubscribeProfile?.();
      unsubscribeProfile = null;

      if (!nextUser) {
        setMode("light");
        return;
      }

      unsubscribeProfile = onSnapshot(doc(db, "profiles", nextUser.uid), (snapshot) => {
        if (!snapshot.exists()) {
          setMode("light");
          return;
        }

        const profileData = snapshot.data() as Record<string, unknown>;
        setMode(getProfileThemeMode(profileData.profileTheme));
      });
    });

    return () => {
      unsubscribeProfile?.();
      unsubscribeAuth();
    };
  }, []);

  const palette = useMemo(() => getThemePalette(mode), [mode]);

  return { mode, palette };
}

// ---------------------------------------------------------------------------
// useThemedStyles — memoised StyleSheet factory
//
// Usage:
//   const styles = useThemedStyles((palette) =>
//     StyleSheet.create({
//       container: { backgroundColor: palette.appBackground },
//     })
//   );
// ---------------------------------------------------------------------------

import { StyleSheet } from "react-native";

export function useThemedStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (palette: AppPalette) => T,
): T {
  const { palette } = useAppTheme();
  return useMemo(() => factory(palette), [palette]);
}
