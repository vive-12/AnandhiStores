# Project Worklog: Anandhi Stores (AquaRush)

## Date: 2026-09-26

### 🏗️ Big Structural Changes
*   **Serverless Migration Completed**: We completely eliminated the legacy Node.js/Express backend for all mobile app API requests. The entire mobile app now connects directly to Firebase Firestore using the native Firebase Web SDK.
*   **Decommissioned Axios**: All `axios` REST calls were removed from the codebase, significantly reducing latency and simplifying state management.

### ✨ Features & Updates
*   **Real-time Admin Dashboard**: Upgraded `alerts.jsx`, `profiles.jsx`, `inventory.jsx`, `offers.jsx`, and `agents.jsx` to use real-time Firestore listeners (`onSnapshot`) and direct queries (`getDocs`).
*   **Customer & Auth Migration**: Fully migrated the authentication flows (`register.jsx`, `login.jsx`, `agent-login.jsx`) and customer dashboards (`account.jsx`, `history.jsx`) to Firestore.
*   **Crash Resolution (Audio)**: Removed `expo-av` (which was causing native module crashes in Expo Go) and replaced it with React Native's highly reliable `Vibration` API for new order alerts in the Admin and Agent dashboards.
*   **Agent Online/Offline System**: Added a functional "Online/Offline" toggle directly in the Agent Dashboard header, allowing agents to clock in and out.
*   **Agent Filtering**: The Admin assignment menus now strictly hide offline agents, preventing accidental dispatch to unavailable drivers.
*   **Admin Approval Flow**: Added a massive, highly visible "Approve & Set PIN (Done)" button to the Admin Profiles screen to make approving new customers intuitive.
*   **Can Recovery Workflow**: Implemented `admin/cans.jsx` to track pending empty cans outside. Automated creation of `type: 'recovery'` orders assigned to agents when net cans are > 0.
*   **Agent Recovery UI Overhaul**: Redesigned `agent/delivery/[id].jsx` to dynamically hide grocery checklists and cash collection during recovery tasks, showing a clear "Collect X Cans" summary instead. Changed button verbiage to "Out for Collection".
*   **Agent Dashboard Cans Widget**: Added a permanent, sticky banner to the agent dashboard tracking their total pending cans to collect.
*   **Clickable Offer Banners**: Added `linked_item_name` to the Admin Offers panel. Wrapped Customer banners in `TouchableOpacity`, which auto-adds the matching inventory item to the cart when tapped.

### 🐛 Issues Faced & Solutions
1.  **Issue (Missing Assign Button)**: Newly registered customers were given the status `pending_pin_reset`, but the admin UI only checked for `pending_review`, causing the "Assign Agent" button to stay hidden.
    *   **Solution**: Updated the condition to accept both statuses and changed the default registration status to `pending_review`.
2.  **Issue (Uncaught Promise TypeError)**: Clicking the agent assignment button crashed the app with a `TypeError` if an agent went offline while the modal was open (causing them to disappear from the array).
    *   **Solution**: Added strict `if (!agent)` safety checks before calling Firestore, and added fallback values (`|| ''`) to `updateDoc` fields so Firestore never receives an invalid `undefined` value.
3.  **Issue (Phone Link Crash)**: Clicking the phone call icon for agents/customers with missing phone numbers threw an uncaught promise rejection in Android.
    *   **Solution**: Added `.catch(err => console.log(err))` to all `Linking.openURL()` calls in `alerts.jsx` and `dashboard.jsx`.
4.  **Issue (Undefined is not a function)**: Tapping the "Online" toggle or attempting to reset an Agent's PIN threw `undefined is not a function` on `firestore.doc()`.
    *   **Root Cause**: `import * as firestore` namespace imports don't work reliably with Firebase v9 modular SDK + Expo Metro bundler. Additionally, `agent.id` was stored as a number in AsyncStorage, but Firestore doc IDs must be strings.
    *   **Solution**: Switched `dashboard.jsx` and `agents.jsx` to use named imports (`import { doc, updateDoc, ... } from 'firebase/firestore'`) matching the working pattern in other screens. Wrapped doc IDs with `String()`.
5.  **Issue (Firestore Rules Rejecting Admin Cans Assignment)**: `setDoc` threw `PERMISSION_DENIED` when manually assigning a recovery task because it lacked `total_amount: 0`, failing the schema validation rules.
    *   **Solution**: Updated `cans.jsx` and `delivery/[id].jsx` to enforce inclusion of `total_amount: 0` when dispatching pure recovery orders.
6.  **Issue (Admin Alerts Crash on Scripted Orders)**: `o.placed_at.toMillis()` crashed because orders generated via Node.js scripts used standard ISO strings, while UI-generated orders used Firebase Timestamps.
    *   **Solution**: Refactored `alerts.jsx` date parsing to elegantly fallback `const timeMs = o.placed_at.toMillis ? o.placed_at.toMillis() : new Date(o.placed_at).getTime();`.

### 🆕 Logger Utility Added
*   Created `utils/logger.js` with `log.info()`, `log.warn()`, `log.error()`, `log.debug()` — timestamps, level emojis, screen tags, and a 200-entry in-memory buffer.
*   Integrated into: `register.jsx`, `alerts.jsx`, `profiles.jsx`, `agents.jsx`, `dashboard.jsx`.

## Date: 2026-10-02

### 🏗️ No-Store Workflow Fix
*   **Issue (Agent Stuck at Placed)**: Since there is no physical store, the agent picks up items and delivers directly. But the status machine required admin to "Mark Packed" before the agent could do anything — leaving agents stuck at the "Waiting for Store to Pack" screen with no action button.
*   **Root Cause**: `services/orders.ts` only allowed agents to transition from `packed` → `out_for_delivery`. The `placed` status was blocked.
*   **Fix**: 
    1.  Updated `services/orders.ts` — added `'placed'` to the valid from-states for agent's `out_for_delivery` transition: `{ from: ['placed', 'packed'], to: 'out_for_delivery', allowedRoles: ['agent'] }`
    2.  Updated `app/agent/delivery/[id].tsx` — replaced the "Waiting for Store to Pack" message with a **"Pick Up & Start Delivery"** button that shows for both `placed` and `packed` orders.
    3.  Updated `app/admin/alerts.tsx` — renamed "Mark Packed 📦" → "Ready for Pickup 📦", "Assign & Mark Packed" → "Assign & Mark Ready", and updated all related toast messages.

### Files Changed
*   `services/orders.ts` — modified (status machine transition)
*   `app/agent/delivery/[id].tsx` — modified (UI: removed waiting state, added pickup button for placed)
*   `app/admin/alerts.tsx` — modified (UI: renamed packed labels to "Ready for Pickup")

## Date: 2026-10-04

### 🐛 Android-Only Bugs Fixed

7.  **Issue (Android: Agent Logout → Frozen Blank Green Screen)**
    *   **Symptom**: Tapping Sign Out on Android showed a blank green screen forever. iOS worked fine.
    *   **Root Cause 1 — Layout guard returned a View, not a Redirect**: `agent/_layout.tsx` returned `<View style={{ backgroundColor: green900 }} />` when `!uid || role !== 'agent'`. On Android, Expo Router's route guard does not navigate away from a plain View — it just freezes. iOS's JS thread timing masked this.
    *   **Root Cause 2 — Race condition in logout order**: `handleLogout` called `clearSession()` before `router.replace()`. Clearing Zustand state first caused the layout guard to re-render with `!uid`, returning the blank View before the router could navigate.
    *   **Solution**:
        1.  `agent/_layout.tsx`: Changed `return <View />` → `return <Redirect href="/auth/login" />`.
        2.  `agent/dashboard.tsx`: Reordered logout to `router.replace('/auth/login')` first, then `await logout()` + `clearSession()`.

8.  **Issue (Android: Agent Dashboard Completely Frozen After Order Assigned — iOS Was Responsive)**
    *   **Symptom**: After admin assigned an order, the agent dashboard became fully unresponsive on Android — no tabs, no "View Order" button, no Maps button worked. iOS showed the "New Delivery Assigned!" modal correctly and remained interactive.
    *   **Root Cause**: Firestore `onSnapshot` fires **twice** on first connection — once from local disk cache, once from the server. The `newAssignmentAlert` useEffect used `prevOrderIdsRef.current.size > 0` as its guard. The first (cache) snapshot set the ref. The second (server) snapshot had `size > 0` and treated all pre-existing assigned orders as "new", triggering the `<Modal transparent>`. On Android, a `transparent` Modal **without `statusBarTranslucent`** renders its touch handler covering the full screen but appears visually invisible — blocking every single touch event. iOS's Modal does not have this behaviour, which is why it stayed responsive.
    *   **Solution**:
        1.  Added `initialLoadDone = useRef(false)`. First real snapshot silently seeds `prevOrderIdsRef` and sets `initialLoadDone = true`. Only subsequent snapshots trigger the alert modal.
        2.  Added `statusBarTranslucent` and `onRequestClose` props to the Modal for correct Android rendering.

### Files Changed
*   `app/agent/_layout.tsx` — guard: blank View → `<Redirect href="/auth/login" />`
*   `app/agent/dashboard.tsx` — logout order fix; `initialLoadDone` ref for modal; Modal `statusBarTranslucent`

9.  **Issue (Android: Customer & Admin Logout Blank Screen Freeze)**
    *   **Root Cause**: `admin/_layout.tsx` and `(customer)/_layout.tsx` returned `<View style={{ flex: 1, backgroundColor: Colors.green900 }} />` instead of `<Redirect href="/auth/login" />`.
    *   **Solution**: Updated route guards to return `<Redirect href="/auth/login" />` and updated `handleLogout` in `admin/alerts.tsx` and `admin/settings.tsx` to call `router.replace('/auth/login')` prior to clearing session state.

10. **Issue (Android: Modal Touch Freezing & Back Button Crashes Across App)**
    *   **Root Cause**: Modals across `admin/_layout.tsx`, `NotificationBell.tsx`, `agent/delivery/[id].tsx`, `admin/inventory.tsx`, `admin/profiles.tsx`, `admin/offers.tsx`, `admin/agents.tsx`, `admin/alerts.tsx`, and `(customer)/index.tsx` lacked `statusBarTranslucent` and `onRequestClose`.
    *   **Solution**: Added `statusBarTranslucent` and `onRequestClose` handlers to all modal instances so touches are never blocked invisibly and Android hardware back button functions cleanly.

11. **Issue (Firestore Rules: Agent Item Checklist Permission Denied)**
    *   **Root Cause**: `firestore.rules` restricted agent updates to only transitions changing status and omitted `checkedItems` from `affectedKeys()`.
    *   **Solution**: Added `checkedItems` to the allowed keys list and enabled same-status updates so item ticks sync without error.

12. **Issue (Android Maps Open Rejection)**
    *   **Root Cause**: `utils/openMap.js` lacked `.catch()` error handling on `Linking.openURL()`.
    *   **Solution**: Added graceful error handling and fallback alerts for Google Maps and Waze URLs.

13. **Comprehensive End-to-End Test Suite & Analytics Normalization**
    *   **Scope**: Built and executed `mobile/scripts/test-comprehensive-e2e.js` covering 40 rigorous test assertions across 6 suites (multi-role auth, state machine boundaries, customer & admin cancellations, water can recovery, agent reassignment multi-party notifications, and analytics stats sync).
    *   **Fix Identified & Solved**: Dotted increment keys in `stats_daily` (e.g. `cashCollectedByAgent.1`) were not mapped into nested objects by raw document reads. Implemented `normalizeStatsDoc` in `services/stats.ts` to seamlessly map dotted keys into nested agent performance maps.
    *   **Result**: All 40/40 test assertions passed with zero errors.

14. **Production Firestore Rules & Composite Indexes Deployed**
    *   **Scope**: Released compiled [`firestore.rules`](file:///d:/Vivek/Can/firestore.rules) and [`firestore.indexes.json`](file:///d:/Vivek/Can/firestore.indexes.json) to production Firebase project `anandhi-stores`.
    *   **Verification**: Enabled required `firestore.googleapis.com` API, deployed all composite indexes, and activated production security rules allowing agent checklist ticks and strict role-based access.

15. **Credentials & Token Synchronization in [`.env`](file:///d:/Vivek/Can/.env)**
    *   **Scope**: Verified token differentiation: identified that `.env` previously contained a GitHub Personal Access Token (`ghp_...`), whereas the token provided by the user is the Firebase CI Deployment Token (`1//0gLkKb...`).
    *   **Sync**: Cleaned and formatted `.env` with active login credentials matching the UI:
        *   👑 Admin: `9876543219` / PIN `1234`
        *   🛒 Customer (Shivani): `9789042245` / PIN `1211`
        *   🛵 Delivery Agent (Smallvivek): `9940405016` / PIN `1211`
        *   Added explicit `FIREBASE_TOKEN` and removed deprecated credentials.

16. **Phase P23: Zomato-Style UI Polish, Motion, & Accessibility**
    *   **Design & Layout Integrity**: Maintained strict zero-layout-overlap rule. Customer Home bottom padding (`120pt`) kept intact so StickyBar never covers catalogue items.
    *   **Interactive Components ([`Card.tsx`](file:///d:/Vivek/Can/mobile/components/ui/Card.tsx), [`Button.tsx`](file:///d:/Vivek/Can/mobile/components/ui/Button.tsx), [`QtyStepper.tsx`](file:///d:/Vivek/Can/mobile/components/ui/QtyStepper.tsx), [`ScreenHeader.tsx`](file:///d:/Vivek/Can/mobile/components/ui/ScreenHeader.tsx))**:
        *   Enhanced `Card` to support optional `onPress` with spring-scale press animation (`useSharedValue` + `withSpring(0.98)`) and light haptic feedback while maintaining backward-compatible static rendering.
        *   Added `accessibilityRole="button"`, `accessibilityState`, and clear `accessibilityLabel` strings to `Button`, `ScreenHeader` back navigation, and `QtyStepper` (Add, Increment, Decrement).
        *   Enhanced `login.tsx` demo buttons and links with minimum 44pt accessible touch targets and explicit role declarations.
        *   Wrapped [`account.tsx`](file:///d:/Vivek/Can/mobile/app/(customer)/account.tsx) with `KeyboardAvoidingView` to prevent keyboard collisions on iOS/Android, and fixed logout sequence to prevent route guard race conditions.
        *   Enhanced delivery agent empties stepper and checklist rows with `hitSlop` and accessible checkbox state semantics.
    *   **Quality Assurance**:
        *   `npx tsc --noEmit`: Clean compilation with **0 errors**.
        *   `test-comprehensive-e2e.js`: **40/40 assertions passed** across all 6 test suites.

17. **Test Suite NPM Integration & [`.locations`](file:///d:/Vivek/Can/.locations) File**
    *   **Scope**: Added `"test": "node scripts/test-comprehensive-e2e.js"` and `"test:order": "node scripts/test-e2e-order.js"` to [`mobile/package.json`](file:///d:/Vivek/Can/mobile/package.json).
    *   **Automated Logging**: Configured [`test-comprehensive-e2e.js`](file:///d:/Vivek/Can/mobile/scripts/test-comprehensive-e2e.js) to automatically output all test runs to [`mobile/logs/test-e2e.log`](file:///d:/Vivek/Can/mobile/logs/test-e2e.log).
    *   **Locations Registry**: Created [`.locations`](file:///d:/Vivek/Can/.locations) documenting paths for test scripts, logs, environments, source code, and documentation.
    *   **Execution Verification**: Executed `npm test` successfully with **40/40 tests passing**.

18. **Agent Dashboard: Today, 7-Day, and 30-Day Runs Made Fully Interactive & Functional**
    *   **Root Cause**: Previously, the "Today's Runs", "7-Day Runs", and "30-Day Runs" boxes inside the Earnings sheet were static `<View>` elements that did not respond to user touches. Furthermore, if `stats_daily` had not yet synced, the counts displayed 0 or the bottom sheet failed to render.
    *   **Solution**:
        *   Implemented robust date parsing (`deliveredAt` / `updatedAt` / `createdAt`) to calculate dynamic order counts and COD revenue across Today, Last 7 Days, and Last 30 Days directly from the agent's completed runs, combined with `stats_daily`.
        *   Added `runTimeframe` state (`'today' | '7days' | '30days'`) with haptic feedback on change.
        *   Added an interactive segmented timeframe chip bar (`Today (X) | 7 Days (Y) | 30 Days (Z)`) directly on the Completed tab of the main Agent Dashboard so agents can filter completed runs on the fly without having to open the bottom sheet.
        *   Transformed the 3 performance metric boxes in the "Earnings & Cash Handover" BottomSheet into interactive `TouchableOpacity` controls with active border/background highlighting (`s.perfBoxActive`).
        *   Updated the Hero Card and Run Breakdown list to dynamically recalculate the exact COD collected and filter the order items for the active timeframe.
    *   **Verification**: `npx tsc --noEmit` clean (0 errors) and `npm test` verified 40/40 passing assertions.

19. **Test Suite Expansion: Suite 7 (Agent Run Timeframes & Metrics)**
    *   **Scope**: Added comprehensive verification for date parsing (Firestore `Timestamp`, epoch seconds, ISO strings), timeframe isolation (`Today`, `7-Day`, `30-Day`), and dynamic COD calculation.
    *   **Live Firestore Integration**: Created, queried, and verified live agent test run within today's window and ensured clean teardown. Expanded assertions to 53/53.

20. **Test Suite Expansion: Suite 8 (Environment & Active UI Credentials Verification)**
    *   **Scope**: Verified that all credentials and tokens configured in [`.env`](file:///d:/Vivek/Can/.env) adhere to specifications and authenticate against live Firestore accounts:
        *   Validated `FIREBASE_TOKEN` (`1//...`), `GITHUB_TOKEN` (`ghp_...`), and Expo Go CLI credentials.
        *   Verified active customer credentials (`9789042245` / `1211` — Shivani) resolve with valid role, address, and status.
        *   Verified active delivery agent credentials (`9940405016` / `1211` — Smallvivek) resolve with valid role and status.
        *   Verified active store admin credentials (`9876543219` / `1234` — Store Admin) resolve with valid role and admin quick-unlock capability.
        *   Tested security isolation: verified wrong PIN rejection across all roles and prevented customer/agent credentials from unlocking admin console.
    *   **Verification**: Comprehensive test suite now executes **78/78 assertions passing with 0 failures**.
21. **UPI QR Codes Management & Chained Sales Tracking (Agent Delivery + Admin Management)**
    *   **Agent Delivery Screen (`app/agent/delivery/[id].tsx`)**:
        *   Added a prominent "QR" button directly above the "Slide to Mark Delivered" slider when orders are out for delivery.
        *   Tapping the button opens a customer-facing Scan-to-Pay modal displaying the active store UPI QR code, exact order total, payee name, and UPI ID (VPA).
        *   Supports one-tap confirmation for QR payments (`paymentMethod: 'upi_qr'`) and provides a payment method toggle (`Cash` vs `UPI QR`) in the swipe delivery modal.
    *   **Admin Screen & Layout (`app/admin/qr.tsx` & `app/admin/_layout.tsx`)**:
        *   Added a new "QR Pay" tab and top-bar action buttons in Admin Alerts and Analytics screens.
        *   Admin can save up to 5 QR codes (with strict capacity enforcement), edit names, UPI IDs, payee names, and custom QR image URLs.
        *   Allows setting any QR code as the active default with one tap (automatically updating all agent delivery screens).
        *   **Track Sales per QR Code**: Each QR code card displays lifetime revenue (`totalSales`), total orders completed (`orderCount`), and last used timestamp.
    *   **Chained Sales Accounting (`services/orders.ts` & `services/qr.ts`)**:
        *   Delivering an order via QR atomically:
            1. Updates order doc with `paymentMethod: 'upi_qr'`, `qrId`, and `qrLabel`.
            2. Increments `totalSales` by order total and `orderCount` by 1 on the specific `qr_codes` document.
            3. Increments daily analytics `stats_daily` (`upiRevenue`, `upiOrders`, `qrSales.${qrId}`, `qrOrders.${qrId}`).
    *   **Production Security Rules**:
        *   Updated [`firestore.rules`](file:///d:/Vivek/Can/firestore.rules) to permit reads/writes on `qr_codes` and allow agents to record `paymentMethod`, `qrId`, and `qrLabel` upon delivery.
        *   Successfully compiled and deployed rules live to Firebase project `anandhi-stores`.
    *   **Test Suite Expansion (Suite 9)**:
        *   Added verification for UPI URI formatting, QR Firestore document creation, 5-QR capacity enforcement, default switching, and live end-to-end QR order delivery with chained sales tracking.
        *   **Result**: Test suite now executes **98/98 assertions passing with 0 failures**.

22. **Standalone Android Preview APK Build (EAS)**
    *   **EAS Setup**: Successfully initialized Expo Application Services under account `@shivani2` (`anandhi-stores`), linked project ID `89170e22-3b73-4828-a94e-172135ffe4f9`, and generated managed cloud Android Keystore.
    *   **Build Trigger**: Executed `npx eas build --platform android --profile preview` to generate standalone installable `.apk`.
    *   **Status**: `SUCCESS` (Exit code 0).
    *   **Install Link & QR Code**: [Download Anandhi Stores APK](https://expo.dev/accounts/shivani2/projects/anandhi-stores/builds/16b80a84-fa02-4ec5-b4d5-79a39eac44ac).

23. **Admin UI Refinement & Navigation Cleanup**
    *   **Clickable Store Header & Centralized Admin Options Modal (`alerts.tsx`)**:
        *   Made "Anandhi Stores ▾" on the left and the Admin profile button on the right trigger a dedicated Store & Admin Options Modal.
        *   Modal provides a clear, safe, and spacious home for **Log Out** (with confirmation dialog), Store Settings & Hours (`/admin/settings`), Manual Order creation, and QR Codes management.
    *   **Notification Bell Visibility Fix**:
        *   Replaced white-on-white icon rendering (`#FFFFFF`) with prominent dark green (`Colors.green900`) inside a circular button container (`styles.bellWrap`), ensuring 100% visibility and crisp badge display.
    *   **Header De-cluttering**:
        *   Removed the redundant phone icon (`📱`) shortcut from the Admin Dashboard header.
    *   **QR Screen Header Cleanup (`qr.tsx`)**:
        *   Removed redundant top-right "Add QR" button from `ScreenHeader`, leaving the prominent in-body `+ Add another QR Code` button.
    *   **Analytics De-cluttering (`analytics.tsx`)**:
        *   Removed the redundant "UPI QR Codes & Sales" shortcut card, keeping the Analytics tab strictly focused on core business KPIs.
    *   **Tab Renaming (`_layout.tsx`)**:
        *   Renamed bottom navigation tab from "QR Pay" to "QR Code".

24. **Dashboard Header & Modal De-duplication**
    *   **De-duplicated Options in Anandhi Stores Modal**:
        *   Removed duplicate "QR Codes & Sales" from the modal (already a dedicated bottom navigation tab).
        *   Modal now cleanly presents: **Create Manual Order**, **Store Settings & Hours**, and canonical **Log Out**.
    *   **Single Canonical Log Out**:
        *   Removed redundant Administrator Session / Logout card from Store Settings screen (`settings.tsx`), leaving the header modal as the single authoritative place to sign out.
    *   **Minimalist Dashboard Header (`alerts.tsx`)**:
        *   Removed `+ New Order` button from the dashboard header (cleanly housed inside Anandhi Stores modal).
        *   Removed the three dots (`⋮`) button to eliminate redundant options entry points.
        *   Adjusted header spacing so "Anandhi Stores ▾" sits spaciously on the left, and the Notification Bell is cleanly aligned on the right.

## Date: 2026-10-06

25. **Admin Navigation Consolidation & Tab Bar Ergonomics**
    *   **Tab Bar Consolidation (`app/admin/_layout.tsx`)**:
        *   Consolidated bottom navigation from 8 tabs down to 6 core destinations: **Alerts** (Dashboard), **Analytics**, **Profiles**, **Inventory**, **Cans**, and **QR**.
        *   Hidden `agents` and `offers` routes from the tab bar via `options={{ href: null }}` while preserving full deep-linking.
        *   Enlarged tab icons to 24px with larger touch targets and bold 11px typography for effortless one-handed thumb reach.
    *   **Integrated Offers inside Inventory (`app/admin/inventory.tsx`)**:
        *   Embedded `OffersScreen` directly into the Inventory module using a top segmented pill switcher (`Products & Stock` vs `Offers & Banners`).
    *   **Integrated Delivery Agents inside Profiles (`app/admin/profiles.tsx`)**:
        *   Embedded `AdminAgents` directly into the Profiles module using a top segmented pill switcher (`Customers` vs `Delivery Agents`).
        *   Enhanced customer cards with live badges for custom fees (`deliveryFee`, `canDeposit`) and assigned delivery agent name.

26. **QR Code Management & Analytics UI Polish**
    *   **QR Screen Header & Text Cleanup (`app/admin/qr.tsx`)**:
        *   Renamed screen header to clean "QR Code Management".
        *   Removed verbose configuration descriptions, redundant top "Add QR" button, and back button.
        *   Cleaned card content: removed redundant "primary/secondary total all-time qr sales", slot capacity text, "SAVED QR CODE(2)", "Tap 'Set default'...", "Payee: anandhi store", and redundant bank tags.
    *   **Timeframe Normalization Across Screens**:
        *   Standardized timeframe buttons to **Today**, **Weekly**, **Monthly** across QR management, Analytics, and Agent dashboards.
        *   Removed verbose time range labels (e.g. `12 am -> 2.08 am`).
        *   Fixed newly created default QR codes to cleanly show ₹0 across all timeframes.
    *   **Layout & Alignment Fixes**:
        *   Fixed alignment on the "Cancelled" tab in the Admin Dashboard.
        *   Removed overflowing / clipped QR details card in Analytics to ensure all cards fit completely within the device viewport.

27. **Agent Delivery Stock Pickup Checklist & State Locking**
    *   **Persistent Checklist (`app/agent/delivery/[id].tsx`)**:
        *   Normalized Firestore map keys between numbers and string keys (`0` vs `"0"`) and synced with local AsyncStorage.
        *   Closing and re-opening the app or re-logging in keeps checked checklist items intact without unclickable states.
    *   **Lifecycle Interactivity Enforcement**:
        *   Checklist items remain freely toggleable before delivery (`placed`, `packed`, `out_for_delivery`).
        *   Checklist is strictly locked (`disabled={isDelivered}`) once an order is marked `delivered`.

28. **Customer PIN Reset & Security Rules Update**
    *   **Self-Service PIN Change (`services/auth.ts`)**:
        *   Added `changePin(uid, phone, oldPin, newPin)` enabling customers and agents to securely change temporary credentials.
    *   **Customer Schema Expansion (`types/index.ts`)**:
        *   Added custom customer fee and assignment attributes: `deliveryFee?: number`, `canDeposit?: number`, `assignedAgentId?: string`, `assignedAgentName?: string`.
    *   **Production Firestore Rules Deployment**:
        *   Updated [`firestore.rules`](file:///d:/Vivek/Can/firestore.rules) to permit customer self-service registration and admin fee updates on `/users/{userId}`.
        *   Successfully deployed live to Firebase project `anandhi-stores`.

29. **Master End-to-End Complete Lifecycle Verification (Suite 11)**
    *   **Test Expansion (`scripts/test-comprehensive-e2e.js`)**:
        *   Added comprehensive **Suite 11** covering the full end-to-end customer and order lifecycle:
            *   *Step 1*: New customer creation with full verified details (name, phone, address, coordinates).
            *   *Step 2*: Admin review and agent assignment with custom delivery fee (₹35) and water can deposit (₹150).
            *   *Step 3*: Customer login with temporary PIN and self-service PIN change.
            *   *Step 4*: Pre-order baseline metrics recorded across Agent (today, weekly, monthly), QR code, and Analytics.
            *   *Step 5*: Multi-item order placement (Groceries + 20L Water Can + Deposit).
            *   *Step 6*: Empty can recovery order creation and agent assignment.
            *   *Step 7*: Order status progression (`placed` -> `packed` -> `out_for_delivery` -> `delivered`) tracked and verified at each stage.
            *   *Step 8*: Can recovery lifecycle tracking and customer ledger balance reconciliation.
            *   *Step 9*: Agent earnings verified before vs. after across Today, Weekly, and Monthly timeframes.
            *   *Step 10*: Active default QR code sales reflection and order count incrementation.
            *   *Step 11*: Real-time sales reflection in Admin Analytics and daily statistics.
            *   *Step 12*: Stock pickup checklist state persistence and post-delivery locking verification.
            *   *Step 13*: Final customer profile verification of custom fees and assigned agent.
    *   **Verification**: Comprehensive test suite now executes **186/186 assertions passing with 0 failures**. TypeScript check (`tsc --noEmit`) passes with 0 errors.
