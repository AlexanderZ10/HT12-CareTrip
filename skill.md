# Design Skill

## UI/UX Patterns Used in CareTrip

### Color System
- **Accent:** `#2D6A4F` (deep green) — used for primary actions, active states, badges
- **Accent muted:** lighter tint of accent for selected chip backgrounds
- **Screen backgrounds:** light `#F5F5F0` / dark mode equivalent
- **Cards:** white / dark card color with `1px` border in `colors.border`
- **Text hierarchy:** `textPrimary`, `textSecondary`, `textMuted` — three levels of emphasis
- **Error states:** red tones (`#DC3545`) for destructive actions and error messages
- **Warning/booking cards:** warm yellow background with yellow border

### Typography (Design System Constants)
- `TypeScale.xs` through `TypeScale.xxl` for consistent sizing
- `FontWeight.regular`, `FontWeight.medium`, `FontWeight.semibold`, `FontWeight.bold`
- Section headers: uppercase, small, muted (`letterSpacing: 1.2`)
- Kicker text: small, uppercase, accent-colored

### Spacing & Layout
- `Spacing.xs` (4), `Spacing.sm` (8), `Spacing.md` (12), `Spacing.lg` (16), `Spacing.xl` (20), `Spacing.xxl` (24)
- `Radius.sm` (8), `Radius.md` (12), `Radius.lg` (16), `Radius.xl` (20)
- Cards: `borderRadius: Radius.lg`, `borderWidth: 1`, `padding: Spacing.lg`
- Consistent `gap` usage instead of margins between siblings

### Component Patterns

#### Cards
- Rounded corners (`Radius.lg`)
- Subtle border (`colors.border`)
- Background follows card color from theme
- Inner padding `Spacing.lg`

#### Choice Pills / Chips
- Rounded capsule shape (`borderRadius: 999`)
- Border changes color when selected (accent)
- Background fills with `accentMuted` when selected
- Text color changes to accent when selected

#### Buttons
- Primary: filled accent background, white text, rounded (`Radius.md`)
- Outline: transparent background, accent border, accent text
- Disabled: muted background, muted text
- Press feedback via `activeOpacity={0.9}` or `0.85`

#### Modals / Bottom Sheets
- `Modal` with `transparent` + overlay backdrop (`colors.modalOverlay`)
- Sheet card: white/dark background, top-rounded corners, inner padding
- Close button: small circular icon button in top-right

#### Floating Notices / Toasts
- Absolute positioned at top
- Animated entrance with spring (Reanimated)
- Auto-dismiss after timeout
- Accent background, white text

#### Section Headers
- Uppercase label text
- Muted color
- `letterSpacing: 1.2`
- `marginBottom: Spacing.sm`

### Interaction Patterns

#### Long-press Context Menu (Messages)
- `onLongPress` on message bubble
- `measureInWindow` to position menu below the message
- `Modal` with transparent overlay
- Menu items: Edit, Delete with icons

#### Keyboard Dismissal
- `DismissKeyboard` wrapper using `onStartShouldSetResponder` (returns `false` to not steal scroll)
- `keyboardShouldPersistTaps="handled"` on ScrollViews
- `keyboardDismissMode="on-drag"` for scroll-to-dismiss

#### Pull-to-refresh
- Not used — refresh via explicit button with cooldown (once per day for Discover)

### Animation Patterns
- **Entrance animations:** staggered `withDelay` + `withTiming` for opacity and translateY
- **Button press:** `withSpring` scale animation via Reanimated
- **Tab icons:** spring scale + dot opacity for active state
- **Toast notifications:** `withSpring` for entrance, `withTiming` for exit

### Dark Mode
- Fully supported via `AppThemeProvider` context
- All colors referenced from `colors` object (never hardcoded)
- `StatusBar style` switches based on `isDark`
- `sceneStyle` and `tabBarStyle` use theme colors

### Multi-language (i18n)
- 5 languages: BG, EN, DE, ES, FR
- `AppLanguageProvider` context with `t(key)` function
- Translation keys organized by screen: `tab.*`, `profile.*`, `home.*`, `discover.*`, `saved.*`, `groups.*`, `groupDetail.*`, `onboarding.*`, `common.*`
- Predefined option values (onboarding, travel pace, stay style) use reverse-lookup translation via `translateOnboardingOption()`
- AI-generated content regenerated when language changes (Discover trips)
- Stored chat/booking data stays in original language

### Responsive Layout
- `useWindowDimensions` for phone vs tablet detection
- Phone-specific styles via `isPhoneLayout` conditional
- Drawer navigation on tablet, bottom sheet on phone
- Grid layouts adapt column count based on screen width
