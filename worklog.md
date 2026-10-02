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

