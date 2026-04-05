# CareTrip — Skills & Knowledge Base

## 1. Design System

### Color System
- **Accent:** `#2D6A4F` (deep green) — primary actions, active states, badges
- **Accent muted:** lighter tint for selected chip backgrounds
- **Screen backgrounds:** light `#F5F5F0` / dark mode equivalent
- **Cards:** white / dark card with `1px` border via `colors.border`
- **Text hierarchy:** `textPrimary`, `textSecondary`, `textMuted` — three levels
- **Error states:** red tones (`#DC3545`) for destructive actions
- **Warning/booking cards:** warm yellow background with yellow border

### Typography
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

**Cards** — Rounded corners (`Radius.lg`), subtle border, theme background, inner padding `Spacing.lg`

**Choice Pills / Chips** — Capsule shape (`borderRadius: 999`), accent border+fill when selected

**Buttons** — Primary (filled accent, white text), Outline (transparent, accent border), Disabled (muted). Press feedback `activeOpacity={0.9}`

**Modals / Bottom Sheets** — `Modal transparent` + overlay backdrop, sheet card with top-rounded corners, close icon in top-right

**Floating Notices / Toasts** — Absolute top, spring entrance animation, auto-dismiss, accent background

**Section Headers** — Uppercase, muted color, `letterSpacing: 1.2`, `marginBottom: Spacing.sm`

### Interaction Patterns
- **Long-press context menu:** `onLongPress` → `measureInWindow` → `Modal` with menu below message
- **Keyboard dismissal:** `DismissKeyboard` wrapper (`onStartShouldSetResponder` returns false), `keyboardShouldPersistTaps="handled"`, `keyboardDismissMode="on-drag"`
- **Refresh:** explicit button with cooldown (no pull-to-refresh)

### Animation Patterns
- **Entrance:** staggered `withDelay` + `withTiming` for opacity and translateY
- **Button press:** `withSpring` scale via Reanimated
- **Tab icons:** spring scale + dot opacity
- **Toasts:** `withSpring` entrance, `withTiming` exit

### Dark Mode
- Fully supported via `AppThemeProvider` context
- All colors from `colors` object (never hardcoded hex in JSX)
- `StatusBar style` switches based on `isDark`

### Responsive Layout
- `useWindowDimensions` for phone vs tablet detection
- `isPhoneLayout` conditional styles
- Drawer on tablet, bottom sheet on phone
- Grid columns adapt to screen width

---

## 2. Multi-language (i18n)

- **5 languages:** BG, EN, DE, ES, FR
- `AppLanguageProvider` context with `t(key)` function
- Keys organized by screen: `tab.*`, `profile.*`, `home.*`, `discover.*`, `saved.*`, `groups.*`, `groupDetail.*`, `onboarding.*`, `common.*`
- Predefined options (onboarding, travel pace, stay style) use `translateOnboardingOption()` reverse-lookup
- AI content regenerates when language changes (Discover trips)
- Stored chat/booking data stays in original language

---

## 3. State Management

- **No global state library** — React hooks + Firestore real-time listeners
- `useState` / `useEffect` for local UI state
- `onSnapshot` listeners for real-time Firestore data (always clean up with returned unsubscribe)
- `AppThemeProvider` context for light/dark theme
- `AppLanguageProvider` context for language
- `useCallback` / `useMemo` for expensive operations and stable references
- `useRef` for mutable values that shouldn't trigger re-renders (e.g., Firestore listener refs in effects)

---

## 4. Firebase / Firestore

### Collections
- `profiles` — user profile, preferences, onboarding, discover data, home planner state
- `publicProfiles` — public-facing profile data
- `groups` — group metadata, members, access type
- `groups/{id}/messages` — group chat messages (text, shared-trip, expense types)
- `groups/{id}/expenseRepayments` — Stripe payment records
- `bookingOrders` — confirmed paid bookings
- `savedTrips` — user's saved trip plans
- `tripRequests` — open trip ideas
- `usernames` — username → uid mapping

### Patterns
- `setDoc` with `{ merge: true }` for partial updates
- `runTransaction` for group creation (atomic member + group setup)
- `writeBatch` for bulk operations
- `serverTimestamp()` for all timestamp fields
- `onSnapshot` for real-time listeners, `getDoc` for one-time reads
- Security rules in `firestore.rules` — owner-based access for profiles, member-based for groups

### Firestore Error Handling
- `getFirestoreUserMessage(error, action, language)` — translates Firestore errors to user-friendly messages in 5 languages
- Handles `permission-denied`, `not-found`, `unavailable`, `resource-exhausted`

---

## 5. AI Integration (Google Gemini)

- **Model:** Gemini 2.0 Flash via `@google/generative-ai` SDK
- **Home planner:** conversational AI that gathers trip preferences through 7+ open-ended questions, then generates a grounded travel plan with real transport/accommodation options
- **Discover:** generates personalized trip recommendations based on user profile
- **Structured output:** `responseMimeType: "application/json"` with `responseJsonSchema` for typed responses
- **Multi-language:** all prompts include `Answer in ${languageForPrompt}.` directive
- **Prompt patterns:** system instruction + user context + conversation history

---

## 6. Navigation (Expo Router)

- File-based routing via Expo Router
- Entry: `app/index.tsx` → auth check → redirect to `/login`, `/onboarding`, or `/(tabs)/home`
- Tab bar: 5 tabs (Home, Discover, Saved, Groups, Profile) in `app/(tabs)/_layout.tsx`
- Group detail: `app/groups/[groupId].tsx` — dynamic route
- Stack navigator at root, tabs nested inside
- `router.replace()` for auth redirects, `router.push()` for navigation

---

## 7. Payments (Stripe)

- Firebase Cloud Functions handle Stripe checkout sessions
- `createTestCheckoutSession` → creates session with line items
- `verifyTestCheckoutSession` → confirms payment status
- `stripeCheckoutReturnBridge` → handles webhook redirect
- Web: `window.location.assign(checkoutUrl)` redirect
- Mobile: `expo-web-browser` for in-app checkout
- Payment records stored in `groups/{id}/expenseRepayments`

---

## 8. Authentication

- Firebase Auth with email/password
- `onAuthStateChanged` listener for auth state
- Username system: `usernames` collection maps username → uid
- Profile creation on first sign-up, onboarding flow for preferences
- Password reset via `sendPasswordResetEmail`

---

## 9. Image Handling

- `expo-image-picker` for avatar/group photo selection
- Images converted to base64 data URIs (stored inline in Firestore)
- Size limit validation (`PROFILE_PHOTO_MAX_LENGTH`)
- `expo-image` (`Image` component) for optimized rendering with `contentFit`
- Avatar fallback: initials or icon when no photo

---

## 10. Platform-specific Code

- Web variants: `.web.tsx` suffix (e.g., `discover-trip-map.web.tsx`)
- Expo Router resolves platform-specific files automatically
- `Platform.OS` checks for iOS/Android/Web differences
- `KeyboardAvoidingView` behavior differs by platform
- Web: no keyboard dismissal needed (virtual keyboard)

---

## 11. Connecting to External Databases (SQL, PostgreSQL, etc.)

### Option A: Direct Connection (NOT recommended for mobile)
Mobile apps should **never** connect directly to SQL databases — this exposes credentials and the database to the internet.

### Option B: REST API Layer (Recommended)
Create a backend API that sits between the app and the database:

```
Mobile App  →  REST API (Express/Fastify/Hono)  →  PostgreSQL / MySQL / SQLite
```

**Implementation steps:**
1. Create an API server (can be a Firebase Cloud Function, or a separate Node.js/Express server)
2. The API connects to your SQL database using an ORM or query builder
3. The mobile app calls the API endpoints via `fetch` or `axios`

**Example with Firebase Functions + PostgreSQL:**
```typescript
// functions/src/index.ts
import { onRequest } from "firebase-functions/v2/https";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export const getUsers = onRequest(async (req, res) => {
  const result = await pool.query("SELECT id, name, email FROM users LIMIT 50");
  res.json(result.rows);
});
```

**Example with Prisma ORM (type-safe):**
```typescript
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// In a Cloud Function or API route:
const trips = await prisma.trip.findMany({
  where: { userId: req.auth.uid },
  orderBy: { createdAt: "desc" },
});
```

**Example calling from the React Native app:**
```typescript
const response = await fetch("https://your-api.com/api/trips", {
  headers: { Authorization: `Bearer ${await user.getIdToken()}` },
});
const trips = await response.json();
```

### Option C: Supabase (Firestore alternative with PostgreSQL)
Supabase is a Firebase alternative built on PostgreSQL:
- Real-time subscriptions (like Firestore `onSnapshot`)
- Row-level security (like Firestore rules)
- Auto-generated REST API from your schema
- JS client: `@supabase/supabase-js`

```typescript
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Query
const { data, error } = await supabase
  .from("trips")
  .select("*")
  .eq("user_id", userId)
  .order("created_at", { ascending: false });

// Real-time listener (like onSnapshot)
supabase
  .channel("trips")
  .on("postgres_changes", { event: "*", schema: "public", table: "trips" }, (payload) => {
    console.log("Change:", payload);
  })
  .subscribe();
```

### Option D: SQLite (Local on-device database)
For offline-first or local caching:

```typescript
import * as SQLite from "expo-sqlite";

const db = await SQLite.openDatabaseAsync("caretrip.db");

await db.execAsync(`
  CREATE TABLE IF NOT EXISTS cached_trips (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    destination TEXT,
    created_at INTEGER
  );
`);

const trips = await db.getAllAsync("SELECT * FROM cached_trips ORDER BY created_at DESC");
```

### Key Considerations
| Approach | Best For | Auth | Real-time | Offline |
|----------|----------|------|-----------|---------|
| Firestore (current) | Document-based, real-time apps | Firebase Auth | Yes (onSnapshot) | Yes (built-in) |
| REST API + PostgreSQL | Relational data, complex queries | JWT / Firebase token | No (poll or WebSocket) | No (needs caching) |
| Supabase | Relational + real-time | Built-in auth | Yes (channels) | Partial |
| SQLite (local) | Offline cache, local data | N/A | N/A | Yes |

### Migration Path (Firestore → PostgreSQL)
If you wanted to migrate CareTrip from Firestore to PostgreSQL:
1. Define SQL schema matching Firestore collections (profiles → users table, groups → groups + group_members tables)
2. Set up a Node.js API with Prisma or Drizzle ORM
3. Deploy as Firebase Cloud Functions or a separate server (Railway, Fly.io, Render)
4. Replace Firestore `onSnapshot` calls with API fetch + optional WebSocket for real-time
5. Replace Firestore security rules with API middleware auth checks
6. Migrate data with a one-time script

---

## 12. Testing Patterns

### Unit Tests
```typescript
// Jest + React Native Testing Library
import { render, fireEvent } from "@testing-library/react-native";

test("ChoicePill toggles selection", () => {
  const onPress = jest.fn();
  const { getByText } = render(
    <ChoicePill label="Nature" selected={false} onPress={onPress} />
  );
  fireEvent.press(getByText("Nature"));
  expect(onPress).toHaveBeenCalled();
});
```

### Integration Tests
```typescript
// Test Firestore interactions with emulator
import { connectFirestoreEmulator } from "firebase/firestore";
connectFirestoreEmulator(db, "localhost", 8080);

test("saves profile to Firestore", async () => {
  await setDoc(doc(db, "profiles", "test-user"), { language: "en" });
  const snap = await getDoc(doc(db, "profiles", "test-user"));
  expect(snap.data()?.language).toBe("en");
});
```

### E2E Tests
```typescript
// Detox or Maestro for full app testing
// maestro/login-flow.yaml
appId: com.caretrip.app
---
- launchApp
- tapOn: "Email"
- inputText: "test@example.com"
- tapOn: "Password"
- inputText: "password123"
- tapOn: "Sign in"
- assertVisible: "AI Planner"
```

---

## 13. Performance Optimization

- **Memoization:** `useMemo` for filtered lists, `useCallback` for stable handler refs
- **Lazy loading:** tab screens lazy-loaded by Expo Router (only mount when first visited)
- **Image optimization:** `expo-image` with `contentFit` and caching
- **List virtualization:** `FlatList` for long lists (group messages could benefit)
- **Bundle size:** platform-specific `.web.tsx` variants avoid shipping native-only code to web
- **Firestore:** `onSnapshot` with cleanup prevents memory leaks; `merge: true` for minimal writes

---

## 14. Error Handling Patterns

- **Firestore errors:** `getFirestoreUserMessage()` translates error codes to user-friendly messages in all 5 languages
- **AI errors:** `getHomePlannerErrorMessage()` handles Gemini API failures gracefully
- **Network errors:** optimistic UI updates with rollback on failure (e.g., language change)
- **Form validation:** inline error messages below fields, cleared on user input
- **Global error state:** `error` state variable per screen, displayed in styled error cards

---

## 15. Security Best Practices

- **No API keys in source code** — all keys in `.env` (gitignored)
- `.env.example` provides template without values
- Firestore security rules enforce owner-based and member-based access
- Firebase Auth tokens validate user identity
- `merge: true` on `setDoc` prevents accidental data overwrites
- Input validation at UI level (min length, required fields) and Firestore rules level
- No direct SQL/database connections from client — always through authenticated API layer
