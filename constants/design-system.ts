/**
 * CareTrip Design System
 *
 * Single source of truth for all design primitives.
 * Import what you need — never hardcode values directly in components.
 *
 * Usage:
 *   import { Spacing, Radius, Typography, Shadows, ZIndex } from "@/constants/design-system";
 *   import { useAppTheme } from "@/utils/app-theme";
 */

import { Platform } from "react-native";

// ---------------------------------------------------------------------------
// Spacing — 4pt grid
// ---------------------------------------------------------------------------

export const Spacing = {
  /** 4 */
  xs: 4,
  /** 8 */
  sm: 8,
  /** 12 */
  md: 12,
  /** 16 */
  lg: 16,
  /** 20 */
  xl: 20,
  /** 24 */
  "2xl": 24,
  /** 32 */
  "3xl": 32,
  /** 40 */
  "4xl": 40,
  /** 48 */
  "5xl": 48,
  /** 64 */
  "6xl": 64,
} as const;

// ---------------------------------------------------------------------------
// Border Radius
// ---------------------------------------------------------------------------

export const Radius = {
  /** 4 — small tags, tiny badges */
  xs: 4,
  /** 8 — small chips */
  sm: 8,
  /** 12 — inputs, small cards */
  md: 12,
  /** 16 — standard cards */
  lg: 16,
  /** 20 — large cards */
  xl: 20,
  /** 24 — pills, modals */
  "2xl": 24,
  /** 28 — hero sections, sheets */
  "3xl": 28,
  /** 9999 — fully rounded (avatar, icon buttons) */
  full: 9999,
} as const;

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

/**
 * Font weight constants — use these instead of raw strings.
 * React Native accepts string literals; cast with `as any` only if TS complains.
 */
export const FontWeight = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
  extrabold: "800",
  black: "900",
} as const;

/**
 * Named type scale.
 * Each entry provides `fontSize`, `lineHeight`, and a recommended `fontWeight`.
 * Pair with Fonts from constants/theme.ts for the font family.
 */
export const TypeScale = {
  /** Screen-level display titles (28–32px) */
  displayLg: { fontSize: 32, lineHeight: 40, fontWeight: FontWeight.black },
  displayMd: { fontSize: 28, lineHeight: 36, fontWeight: FontWeight.extrabold },

  /** Section headings (22–24px) */
  headingLg: { fontSize: 24, lineHeight: 32, fontWeight: FontWeight.bold },
  headingMd: { fontSize: 22, lineHeight: 30, fontWeight: FontWeight.bold },
  headingSm: { fontSize: 20, lineHeight: 28, fontWeight: FontWeight.semibold },

  /** UI labels and subheadings (16–18px) */
  titleLg: { fontSize: 18, lineHeight: 26, fontWeight: FontWeight.semibold },
  titleMd: { fontSize: 16, lineHeight: 24, fontWeight: FontWeight.semibold },
  titleSm: { fontSize: 15, lineHeight: 22, fontWeight: FontWeight.medium },

  /** Body copy (14–16px) */
  bodyLg: { fontSize: 16, lineHeight: 24, fontWeight: FontWeight.regular },
  bodyMd: { fontSize: 14, lineHeight: 22, fontWeight: FontWeight.regular },
  bodySm: { fontSize: 13, lineHeight: 20, fontWeight: FontWeight.regular },

  /** Small labels, captions, metadata (11–12px) */
  labelLg: { fontSize: 12, lineHeight: 18, fontWeight: FontWeight.semibold },
  labelMd: { fontSize: 12, lineHeight: 18, fontWeight: FontWeight.medium },
  labelSm: { fontSize: 11, lineHeight: 16, fontWeight: FontWeight.medium },
} as const;

// ---------------------------------------------------------------------------
// Shadows — platform-aware presets
// ---------------------------------------------------------------------------

const iosShadow = (opacity: number, radius: number, offsetY: number) => ({
  shadowColor: "#0D1F02",
  shadowOffset: { width: 0, height: offsetY },
  shadowOpacity: opacity,
  shadowRadius: radius,
});

/**
 * Elevation presets.
 * On iOS: shadow* props. On Android: elevation.
 * Spread the appropriate key into your StyleSheet.
 *
 * Example:
 *   ...Platform.OS === "android" ? Shadows.md.android : Shadows.md.ios
 */
export const Shadows = {
  sm: {
    ios: iosShadow(0.06, 4, 2),
    android: { elevation: 2 },
  },
  md: {
    ios: iosShadow(0.08, 8, 4),
    android: { elevation: 4 },
  },
  lg: {
    ios: iosShadow(0.1, 14, 6),
    android: { elevation: 8 },
  },
  xl: {
    ios: iosShadow(0.14, 20, 8),
    android: { elevation: 12 },
  },
} as const;

/**
 * Convenience helper — returns the right shadow object for the current platform.
 *
 * Example:
 *   StyleSheet.create({ card: { ...shadow("md") } })
 */
export function shadow(size: keyof typeof Shadows) {
  return Platform.OS === "android" ? Shadows[size].android : Shadows[size].ios;
}

// ---------------------------------------------------------------------------
// Z-Index
// ---------------------------------------------------------------------------

export const ZIndex = {
  base: 0,
  raised: 1,
  dropdown: 10,
  sticky: 20,
  overlay: 30,
  modal: 40,
  toast: 50,
} as const;

// ---------------------------------------------------------------------------
// Icon Sizes
// ---------------------------------------------------------------------------

export const IconSize = {
  xs: 14,
  sm: 18,
  md: 22,
  lg: 26,
  xl: 32,
  "2xl": 40,
} as const;

// ---------------------------------------------------------------------------
// Animation Durations (ms)
// ---------------------------------------------------------------------------

export const Duration = {
  /** 100ms — micro feedback (press states) */
  instant: 100,
  /** 200ms — fast transitions */
  fast: 200,
  /** 300ms — standard transitions */
  normal: 300,
  /** 450ms — page transitions, modals */
  slow: 450,
  /** 600ms — elaborate entrance animations */
  slower: 600,
} as const;

// ---------------------------------------------------------------------------
// Layout Constants
// ---------------------------------------------------------------------------

export const Layout = {
  /** Standard horizontal screen padding */
  screenPaddingH: Spacing.lg,
  /** Standard vertical screen padding */
  screenPaddingV: Spacing.xl,
  /** Hero section min-height */
  heroMinHeight: 180,
  /** Tab bar height */
  tabBarHeight: 88,
  /** Standard card padding */
  cardPadding: Spacing.lg,
  /** Modal max-width on wide screens */
  modalMaxWidth: 480,
  /** Min touch target size (WCAG AA) */
  touchTarget: 48,
} as const;
