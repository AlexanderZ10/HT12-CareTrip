<div align="center">

<img src="assets/images/CareTrip.png" alt="CareTrip" width="200"/>

# CareTrip

**AI-powered group travel planning. From idea to booking in one conversation.**

*Plan together. Travel smarter. Share every moment.*

---

> **HackTUES 12** -- *"Code to Care"* -- themes: **Travel with Purpose** + **Beyond the City**
> 50 hours . March 2026

---

[![Expo](https://img.shields.io/badge/Expo-54-000020?logo=expo)](https://expo.dev)
[![React Native](https://img.shields.io/badge/React_Native-0.81-61dafb?logo=react)](https://reactnative.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?logo=typescript)](https://www.typescriptlang.org)
[![Firebase](https://img.shields.io/badge/Firebase-12-orange?logo=firebase)](https://firebase.google.com)
[![Stripe](https://img.shields.io/badge/Stripe-v21-635bff?logo=stripe)](https://stripe.com)
[![Gemini](https://img.shields.io/badge/Gemini-2.5_Flash-4285F4?logo=google)](https://ai.google.dev)

</div>

---

## What is CareTrip?

CareTrip is a cross-platform mobile app (iOS, Android, Web) that turns group travel planning from a chaotic group-chat experience into a structured, AI-assisted workflow. Instead of switching between messaging apps, spreadsheets, and booking sites, CareTrip puts everything in one place:

1. **Ask the AI** -- describe your dream trip in natural language
2. **Get a full plan** -- day-by-day itinerary, transport options, accommodation with real pricing
3. **Book directly** -- Stripe-powered checkout for flights, buses, and hotels
4. **Travel together** -- create groups, share plans, split expenses, and coordinate in real time

The AI planner is powered by **Google Gemini 2.5 Flash** and enriched with live travel offers from **Skyscanner** (flights + hotels) and **Busbud** (buses). Every plan includes real booking URLs and pricing -- not just suggestions.

---

## Features

### AI Trip Planner (Home)
- **Conversational planning** -- multi-turn chat guides you through budget, duration, group size, transport preference, timing, and destination
- **Structured plans** -- AI returns day-by-day itineraries with transport options, accommodation, budget notes, and a personalized profile tip
- **Real travel offers** -- Skyscanner flights/hotels and Busbud buses are fetched and embedded in plans with live pricing and booking URLs
- **Multiple chat threads** -- create, rename, pin, search, and delete conversations
- **Persistent history** -- all chats stored locally via AsyncStorage and survive app restarts
- **Animated chat UI** -- typing indicators, message bubbles, quick reply chips, and keyboard-aware scrolling

### Smart Discovery (Discover)
- **Personalized recommendations** -- Gemini generates destination suggestions based on your onboarding profile (interests, accessibility needs, skills)
- **Interactive map** -- Leaflet-based map with zoom/pan to explore recommended destinations
- **Image galleries** -- each recommendation includes photos, highlights, attractions, and accessibility notes
- **Save to collection** -- bookmark any discovery for later or share it to a group

### Group Travel Coordination
- **Create & join groups** -- public (open) or private (join key required)
- **Real-time group chat** -- text messages, shared trips, and expense cards all in one stream
- **Share plans to groups** -- send any Home Planner or Discover trip directly into group chat with full details
- **Member management** -- avatars, labels, and usernames for every member
- **Trip requests** -- propose trips within a group and collect interest before committing

### Expense Splitting & Payments
- **Group expenses** -- create expenses with `group-payment` (split among all) or `reimbursement` (pay back one person) modes
- **Linked bookings** -- attach expenses to specific transport or accommodation items
- **Stripe payments** -- pay your share directly through the app with card, Apple Pay, or Google Pay
- **Repayment tracking** -- every payment is recorded with Stripe payment intent, session ID, and status

### Booking System
- **End-to-end checkout** -- select transport + accommodation from your plan, fill contact details, choose payment method, and pay
- **Three-stage flow** -- form -> processing -> success receipt with booking reference
- **Booking orders** -- all paid bookings saved to your Saved tab with full details
- **Deep linking** -- Stripe checkout returns handled seamlessly on both mobile and web via `travelapp://` scheme

### Profile & Personalization
- **Onboarding quiz** -- select interests, accessibility needs, and skills (feeds into AI recommendations)
- **Personal profile** -- full name, bio, home base, travel pace, stay style, dream destinations
- **Profile photo** -- pick from gallery with automatic compression
- **Public/private visibility** -- toggle whether other users can see your profile
- **Theme preference** -- light, dark, or system automatic
- **Password management** -- reset via email from within the app

### Saved Trips & Bookings
- **Unified collection** -- saved trips from Discover, plans from Home Planner, and paid booking orders all in one place
- **Filter by source** -- All, Paid, Home Planner, Discover
- **Search** -- find trips by destination
- **Trip details** -- full breakdown with highlights, budget, and transport info

---

## Architecture

```
Mobile / Web App (Expo)
        |
        |  Expo Router (file-based navigation)
        |  React Native + Reanimated (UI)
        |  AsyncStorage (local chat persistence)
        |
        v
   Firebase Backend
   +---------------------------+
   | Auth (email/password)     |
   | Firestore (real-time DB)  |
   | Storage (profile photos)  |
   | Cloud Functions           |
   |   +-- Stripe checkout     |
   |   +-- Stripe verify       |
   |   +-- Travel offer search |
   |   +-- Checkout bridge     |
   +---------------------------+
        |                |
        v                v
   Stripe API     Travel Providers
   (payments)     +-- Skyscanner (flights, hotels)
                  +-- Busbud (buses)
                  +-- Gemini 2.5 Flash (AI plans + discovery)
```

**Resilient by design:**
- Gemini unavailable -> pre-computed recommendations used
- Travel offers timeout -> plan generated without live pricing
- Stripe return fails -> manual deep-link fallback with session ID
- Firestore offline -> local AsyncStorage preserves chat state

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Expo 54 (Expo Router v6, file-based routing) |
| **UI** | React Native 0.81.5 + React 19 |
| **Language** | TypeScript 5.9 (strict mode) |
| **Animations** | React Native Reanimated v4 |
| **State** | Firestore real-time listeners + React hooks + AsyncStorage |
| **Auth** | Firebase Authentication (email/password) |
| **Database** | Cloud Firestore (real-time sync) |
| **File Storage** | Firebase Storage (profile photos) |
| **Backend** | Firebase Cloud Functions (Node.js 20) |
| **Payments** | Stripe SDK v21 (card, Apple Pay, Google Pay) |
| **AI** | Google Gemini 2.5 Flash (`@google/genai`) |
| **Flights & Hotels** | Skyscanner API |
| **Buses** | Busbud API |
| **Maps** | React Native Maps / Leaflet |
| **Icons** | Expo Vector Icons (MaterialIcons) |
| **Images** | expo-image (high-performance) |

---

## Project Structure

```
HT12-CareTrip/
|
+-- app/                              # Expo Router screens (thin orchestrators)
|   +-- _layout.tsx                   # Root layout + auth provider
|   +-- index.tsx                     # Entry: routes to login/onboarding/home
|   +-- login.tsx                     # Email/username login
|   +-- register.tsx                  # Registration with CAPTCHA + strength bar
|   +-- onboarding.tsx                # Interest/accessibility/skills quiz
|   +-- payment-return.tsx            # Stripe checkout callback handler
|   +-- (tabs)/
|   |   +-- _layout.tsx              # Bottom tab navigator (5 tabs)
|   |   +-- home.tsx                 # AI chat trip planner
|   |   +-- discover.tsx             # Gemini-powered destination discovery
|   |   +-- groups.tsx               # Travel group management
|   |   +-- saved.tsx                # Saved trips & booking orders
|   |   +-- profile.tsx              # User profile & settings
|   +-- groups/
|       +-- [groupId].tsx            # Group detail: chat, expenses, shared trips
|
+-- features/                         # Feature modules
|   +-- home/
|   |   +-- components/              # ChatMessageBubble, PlanCard, BookingModal,
|   |   |                            # ChatDrawer, QuickReplies, ChatComposer
|   |   +-- helpers.ts               # 30+ pure functions for plan building
|   |   +-- constants.ts             # Budget/day/transport suggestions, destinations
|   |   +-- types.ts                 # BookingCheckoutStage, BookingReceipt
|   +-- groups/
|   |   +-- components/              # GroupRow, CreateGroupModal, JoinGroupModal,
|   |   |                            # TripRequestCard, ActionMenu, DeleteGroupModal
|   |   +-- useGroupsScreen.ts       # All state & handlers as a custom hook
|   |   +-- helpers.ts               # Search matching, sanitization
|   +-- group-detail/
|   |   +-- components/              # GroupChatMessage, ExpenseCard, SharedTripCard,
|   |   |                            # GroupChatComposer, GroupDetailModals
|   |   +-- helpers.ts               # Message formatting, trip preview builders
|   |   +-- screen-styles.ts         # Shared styles for screen + modals
|   +-- auth/
|   |   +-- components/              # PasswordStrengthBar, MathCaptcha
|   +-- profile/
|       +-- components/              # ProfileHelpers, AvatarSheet
|
+-- services/                         # Firebase operations layer
|   +-- auth.ts                      # Register, login, logout, password reset
|   +-- profiles.ts                  # Profile CRUD, photo, visibility, theme
|   +-- groups.ts                    # Group CRUD, join/leave, trip requests
|   +-- bookings.ts                  # Save booking orders
|   +-- saved-trips.ts              # Save/delete/subscribe saved trips
|
+-- components/                       # Shared UI components
|   +-- Avatar.tsx                   # Shared avatar with color generation
|   +-- app-theme-provider.tsx       # Theme context (light/dark/auto)
|   +-- confirm-dialog.tsx           # Confirmation modal
|   +-- dismiss-keyboard.tsx         # Keyboard dismissal wrapper
|   +-- discover-trip-map.tsx        # Map visualization
|
+-- constants/
|   +-- design-system.ts             # 4pt spacing grid, radius, typography,
|                                    # font weights, shadows, z-index
|
+-- utils/                            # Pure functions & business logic
|   +-- home-travel-planner.ts       # Gemini prompt construction for AI planner
|   +-- trip-recommendations.ts      # Gemini API for Discover screen
|   +-- home-chat-storage.ts         # AsyncStorage persistence for chats
|   +-- groups.ts                    # Group parsing, join key normalization
|   +-- group-chat.ts               # Message parsing, expense/trip builders
|   +-- group-expense-repayments.ts  # Repayment parsing & formatting
|   +-- bookings.ts                  # Booking order parsing & validation
|   +-- saved-trips.ts              # Build/save/parse saved trips
|   +-- travel-offers.ts            # Normalize Skyscanner/Busbud responses
|   +-- currency.ts                 # BGN <-> EUR conversion
|   +-- formatting.ts               # Date/time formatters
|   +-- error-messages.ts           # Localized error messages (Bulgarian)
|   +-- auth-errors.ts              # Auth validation & error mapping
|   +-- firestore-errors.ts         # Firestore error -> user message
|   +-- stripe-checkout-return.ts   # Deep-link URL builder for Stripe
|   +-- profile-info.ts             # Profile extraction & display name
|   +-- public-profiles.ts          # Public profile payload builder
|   +-- math-captcha.ts             # Registration CAPTCHA generator
|
+-- travel-providers/                 # External API integrations
|   +-- skyscanner.ts               # Flight & hotel search
|   +-- busbud.ts                   # Bus route search
|
+-- functions/                        # Firebase Cloud Functions (Node.js 20)
|   +-- src/
|       +-- index.ts                 # 5 endpoints: checkout, verify, search,
|                                    # payment intent, return bridge
|
+-- firebase.ts                       # Firebase initialization
+-- firestore.rules                   # Security rules for all collections
+-- app.json                          # Expo configuration
```

---

## Screens & Navigation

| Tab | Screen | Key Features |
|---|---|---|
| Home | AI Planner | Multi-turn chat, structured plans, quick replies, booking modal |
| Discover | Recommendations | Gemini-generated trips, map view, image gallery, save/share |
| Groups | Group List | Create/join groups, trip requests, member search |
| Saved | Collection | Saved trips + booking orders, filter by source, search |
| Profile | Settings | Edit profile, theme toggle, visibility, password reset, logout |

| Route | Screen | Key Features |
|---|---|---|
| `/login` | Login | Email or username login with animations |
| `/register` | Register | Password strength bar, math CAPTCHA, shake-on-error |
| `/onboarding` | Onboarding | Interests, accessibility, skills selection |
| `/groups/[groupId]` | Group Detail | Real-time chat, share trips, create expenses, Stripe payments |
| `/payment-return` | Payment Return | Stripe checkout callback handler |

---

## Data Model

### Firestore Collections

```
/profiles/{userId}
  +-- email, username, profilePhotoUrl
  +-- profileInfo: { fullName, aboutMe, homeBase, travelPace, stayStyle, dreamDestinations }
  +-- preferences.onboarding: { interests, assistance, skills }
  +-- profileVisibility: "public" | "private"
  +-- themePreference: "light" | "dark" | "automatic"

/usernames/{username}
  +-- uid, usernameLower

/groups/{groupId}
  +-- name, description, photoUrl
  +-- creatorId, creatorLabel, accessType: "public" | "private"
  +-- memberIds[], memberLabelsById, memberAvatarUrlsById
  +-- joinKeyNormalized (for private groups)
  +-- /messages/{messageId}
  |     +-- senderId, senderLabel, text
  |     +-- messageType: "text" | "shared-trip" | "expense"
  |     +-- sharedTrip?: { title, destination, details, linkedTransports[] }
  |     +-- expense?: { title, amount, paidById, participantIds[], collectionMode }
  +-- /expenseRepayments/{repaymentId}
        +-- expenseMessageId, paidById, paidToId
        +-- amountValue, provider: "stripe", paymentIntentId, status

/tripRequests/{requestId}
  +-- destination, budgetLabel, timingLabel, travelersLabel
  +-- creatorId, note, interestedUserIds[], status: "open" | "closed"

/publicProfiles/{userId}
  +-- username, displayName, avatarUrl, aboutMe, homeBase
```

### Local Storage (AsyncStorage)

```
HomePlannerStore
  +-- chats: HomePlannerChatThread[]
  |     +-- id, title, pinned, createdAtMs, updatedAtMs
  |     +-- state: { step, destination, budget, days, travelers, transport, timing }
  |     +-- state.messages: HomeChatMessage[]
  |     +-- state.latestPlan: GroundedTravelPlan
  +-- activeChatId: string | null
```

---

## Cloud Functions API

| Function | Method | Description |
|---|---|---|
| `createTestCheckoutSession` | HTTPS Callable | Create Stripe checkout session for booking |
| `createTestPaymentIntent` | HTTPS Callable | Create direct payment intent (Apple/Google Pay) |
| `verifyTestCheckoutSession` | HTTPS Callable | Verify payment status after checkout |
| `searchOffers` | HTTPS Callable | Search Skyscanner flights/hotels + Busbud buses |
| `stripeCheckoutReturnBridge` | HTTPS Request | HTML bridge redirecting Stripe returns to app |

---

## AI Integration

### Home Planner (Gemini 2.5 Flash)

The AI planner uses a structured prompt system that guides users through 7 steps:

```
Step 0: Budget      ->  "What's your budget?"
Step 1: Days        ->  "How many days?"
Step 2: Travelers   ->  "How many travelers?"
Step 3: Transport   ->  "Preferred transport?"
Step 4: Timing      ->  "When do you want to go?"
Step 5: Destination  ->  "Where do you want to go?"
Step 6: Planning    ->  AI generates full plan with live offers
```

**Output schema** (enforced via Gemini JSON mode):
- `title` -- plan name
- `summary` -- 2-3 sentence overview
- `transportOptions[]` -- mode, provider, route, duration, price, bookingUrl
- `stayOptions[]` -- name, type, area, pricePerNight, bookingUrl
- `dayPlans[]` -- day number, title, activities with time/description/location
- `budgetNote` -- cost breakdown
- `profileTip` -- personalized suggestion based on user profile

### Discover (Gemini 2.5 Flash)

Generates personalized destination recommendations using the user's onboarding profile:
- Selected interests (nature, history, food, crafts, etc.)
- Accessibility needs (mobility, vision, hearing, etc.)
- Skills and contributions (gardening, cooking, photography, etc.)

Returns structured `TripRecommendation` objects with coordinates, images, highlights, and Wikipedia references.

---

## Design System

### Tokens (`constants/design-system.ts`)

| Token | Scale |
|---|---|
| **Spacing** | 4pt grid: `xs(4) sm(8) md(12) lg(16) xl(20) 2xl(24) 3xl(32) 4xl(40)` |
| **Radius** | `xs(4) sm(8) md(12) lg(16) xl(20) 2xl(24) 3xl(28) full(9999)` |
| **Typography** | `labelSm..labelLg, bodySm..bodyLg, titleSm..titleLg, headingSm..headingLg` |
| **Font Weight** | `regular(400) medium(500) semibold(600) bold(700) extrabold(800) black(900)` |
| **Shadows** | `sm, md, lg, xl` -- platform-aware (iOS shadowOffset / Android elevation) |

### Theme Colors

| Token | Light | Dark |
|---|---|---|
| **Accent** | `#2D6A4F` (forest green) | `#52B788` |
| **Screen** | `#F8F9FA` | `#0D1117` |
| **Card** | `#FFFFFF` | `#161B22` |
| **Text Primary** | `#1A1A1A` | `#E6EDF3` |
| **Error** | `#DC3545` | `#F87171` |
| **Success** | `#198754` | `#34D399` |

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- Expo CLI (`npx expo`)
- Firebase project with Auth, Firestore, Storage, and Functions enabled
- Stripe account (test mode)
- Google Gemini API key

### Installation

```bash
git clone <repo-url>
cd HT12-CareTrip
npm install
```

### Environment Setup

```bash
cp .env.example .env
```

Fill in your keys:

```env
EXPO_PUBLIC_GEMINI_API_KEY=           # Google Gemini API
EXPO_PUBLIC_FIREBASE_API_KEY=         # Firebase config (6 keys)
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=
EXPO_PUBLIC_FIREBASE_PROJECT_ID=
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
EXPO_PUBLIC_FIREBASE_APP_ID=
```

For Cloud Functions (`functions/.env`):

```env
STRIPE_SECRET_KEY=sk_test_...
```

### Run the App

```bash
npm start              # Start Expo dev server (pick platform from menu)
npm run android        # Android emulator
npm run ios            # iOS simulator
npm run web            # Web browser
```

### Deploy Cloud Functions

```bash
cd functions
npm install
npm run build
npm run deploy         # Deploy to Firebase
```

### Local Functions Emulator

```bash
npm run payments:emulator   # From HT12-CareTrip root
```

---

## Key Design Patterns

**Feature-based architecture** -- screen files are thin orchestrators (<700 lines). All UI components, hooks, helpers, and types live in `features/{domain}/`.

**Services layer** -- Firebase operations extracted from screens into `services/` for reusability and testability.

**Real-time everywhere** -- every list (groups, messages, expenses, profiles) uses Firestore `onSnapshot` listeners for instant sync across devices.

**Graceful degradation** -- Gemini timeout -> cached recommendations. Travel offers fail -> plan without pricing. Stripe bridge fails -> manual deep-link fallback.

**Currency normalization** -- all monetary values normalized between BGN and EUR (1 EUR = 1.956 BGN) for consistent display.

**Bulgarian-first UI** -- all user-facing text, error messages, and AI prompts are in Bulgarian.

**Theme-aware styling** -- all colors come from `useAppTheme()` context. No hardcoded hex values in components. Light and dark mode fully supported.

---

## License

MIT License -- see [LICENSE](LICENSE) for details.

---

<div align="center">

Built for travelers who plan together.

</div>
