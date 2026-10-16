# Anandhi Stores: Build Guide for Antigravity

One app, three roles (customer, agent, admin), Firebase backend, Zomato-style UI. Every feature is wired so that a change in one role shows up live in the other two.

---

## How to use this guide

1. Paste **P0** first. It creates `PROJECT_CONTEXT.md`, the rulebook every later prompt refers to.
2. Run prompts **in order, one at a time**. Don't paste several together.
3. Use Planning mode if your Antigravity version has it, and read the plan before approving.
4. After each prompt: test in Expo Go, tick the checklist, then `git commit`. If the agent breaks something, `git checkout .` and re-run with a narrower scope.
5. Test sync with **three sessions at once**: your phone (customer), an emulator or simulator (agent), and `npx expo start --web` in a browser (admin).

**Good to know**

- The floating blue gear in your screenshots is **Expo Go's developer-menu button**, not part of your app. It disappears in real builds, so don't spend time "fixing" it.
- **Test Accounts**: Create test users locally. Do not store phone numbers, PINs, or other login credentials in this guide.
- **Automated Verification**: Run `npm test` from `mobile/` to execute the local in-memory order-flow simulation. It does not authenticate against Firebase or write production data.
- **Standalone Android Preview Build**: Download the installable APK at [Anandhi Stores EAS Build](https://expo.dev/accounts/shivani2/projects/anandhi-stores/builds/16b80a84-fa02-4ec5-b4d5-79a39eac44ac).
- **Payment Scope**: Cash on Delivery (COD) and Store UPI QR Code (Scan-to-Pay on delivery with chained sales analytics).
- **No-Store Direct Pickup**: Delivery agents can pick up directly from `placed` or `packed` without a separate store packing step.

---

## Progress tracker

**Foundation**

- [x] P0 Master context file
- [x] P1 Codebase audit
- [x] P2 Design system and shared components
- [x] P3 Data layer (services, hooks, status machine)
- [x] P4 Auth, session, role routing, validation
- [x] P5 Loading, error, offline handling
- [x] P6 Firestore security rules and indexes
- [x] P7 Store settings (min order, delivery charge, hours)

**Customer**

- [x] P8 Home and browse
- [x] P9 Listing, search, item detail
- [x] P10 Cart
- [x] P11 Checkout
- [x] P12 Confirmation and live tracking
- [x] P13 Order history and reorder

**Admin**

- [x] P14 Order management and assign agent
- [x] P15 Manual order creation
- [x] P16 Customer order history in profiles
- [x] P17 Analytics and agent performance

**Agent**

- [x] P18 Order list and detail
- [x] P19 Status actions and online toggle
- [x] P20 Earnings and cash collected

**Finish & Polish**

- [x] P21 Notifications
- [x] P22 Cross-role sync audit
- [x] P23 Zomato-style UI polish
- [x] P24 Pre-build checks

**Post-Launch Extensions**

- [x] P25 Store UPI QR Code Payments & Chained Sales Analytics
- [x] P26 Empty Water Can Tracking & Direct Recovery Lifecycle
- [x] P27 Standalone Production & Preview Android APK Builds (EAS)
- [x] P28 Admin Navigation Architecture & Header Ergonomics
- [x] P29 Interactive Multi-Timeframe Agent Metrics & Shift Breakdown

---

## P0: Master context (paste this first)

Paste everything in the block below. It is the single source of truth for rules, data, sync behaviour and design.

```
Create a file named PROJECT_CONTEXT.md in the project root with EXACTLY the content below. From now on, read it before every task and follow it. Do not change app code in this task.

=== PROJECT ===
Anandhi Stores: a single Expo (React Native, Expo Router, TypeScript) app for a local grocery and 20L water-can delivery store in Chennai. Backend: Firebase (Auth + Firestore). Three roles in ONE app: customer, agent, admin. Payment: Cash on Delivery only. Must run in Expo Go. Existing screens and behaviour (approve and set PIN, reset PIN, agent ONLINE toggle, inventory stock toggle, open in maps, GPS capture) must keep working.

=== ROLES AND ROUTES ===
Route groups: (auth), (customer), (agent), (admin). Each group layout guards access by the signed-in user's role and redirects otherwise. Session persists across app restarts. Roles are enforced in Firestore rules, not only in the UI.

=== GOLDEN RULES (SYNC CONTRACT) ===
1. One order document is the single source of truth. Customer, agent and admin all read the SAME document.
2. Every screen that shows shared data uses real-time listeners (onSnapshot) with unsubscribe on unmount. Always use limit() on list queries.
3. Screens never call Firestore directly. All reads and writes live in /services and /hooks.
4. Any service function that changes order state must, in ONE batch or transaction: update the order, append to statusHistory, and write notification documents for every affected role.
5. Orders store SNAPSHOTS (item name, unit, price, address, customer and agent name and phone) so later edits never rewrite history.
6. Inventory items are soft-deleted (isDeleted: true), never hard-deleted.
7. Every new feature or change must list its impact on all three roles before any code is written. If a role is unaffected, say why.
8. No hard-coded colors, spacing or font sizes. Use theme tokens only.

=== ORDER STATUS MACHINE ===
placed -> packed -> out_for_delivery -> delivered
(No-store direct pickup workflow: agent can transition placed -> out_for_delivery or packed -> out_for_delivery)
cancelled is reachable from placed (customer or admin) and from packed (admin only).
- Customer: creates order (placed), cancels only while placed.
- Admin: assigns or reassigns agent, marks ready/packed, cancels with reason, creates manual orders, dispatches can recovery orders.
- Agent: only sees orders assigned to them. placed or packed -> out_for_delivery ("Pick Up & Start Delivery"), out_for_delivery -> delivered ("Mark Delivered"). Supports Cash or UPI QR scan-to-pay.
Agent free/busy: agent is FREE when isOnline is true and they have zero active orders (placed, packed or out_for_delivery with their agentId). An agent with active orders cannot go offline.

=== DATA MODEL (Firestore) ===
users/{uid}: role (customer|agent|admin), name, phone, status (pending|approved|blocked), address {door, street, locality, city, landmark, lat, lng}, isOnline (agents), createdAt
items/{itemId}: name, category, unit, price, inStock (bool), isDeleted (bool), sortOrder, createdAt, updatedAt
orders/{orderId}: orderNo (e.g. AS-1042 from a counter doc in a transaction), customerId, customerName, customerPhone, addressSnapshot {...}, items [{itemId, name, unit, price, qty, lineTotal}], subtotal, deliveryFee, total, paymentMethod ("COD"|"upi_qr"), qrId, qrLabel, type ("grocery"|"recovery"), pendingCans, slot {type: asap|scheduled, label}, notes, status, agentId, agentName, agentPhone, agentFee, source (customer|admin_manual), cancelReason, cancelledBy, statusHistory [{status, at, byUid, byRole}], createdAt, updatedAt, packedAt, pickedUpAt, deliveredAt, cancelledAt
qr_codes/{qrId}: name, upiId, payeeName, qrUrl, isDefault (bool), totalSales (number), orderCount (number), createdAt, lastUsedAt
settings/store: minOrderValue, deliveryFee, freeDeliveryAbove, openTime, closeTime (IST, "HH:mm"), isStoreOpenOverride (null|true|false), slots [labels], agentFeePerDelivery
notifications/{id}: toUid, toRole, type, orderId, title, body, read, createdAt
banners/{id}: title, imageUrl or color, isActive, sortOrder
stats_daily/{YYYY-MM-DD}: orders, revenue, upiRevenue, upiOrders, cashCollectedByAgent {agentId: amount}, deliveriesByAgent {agentId: count}, qrSales {qrId: amount}, qrOrders {qrId: count}, itemQty {itemId: qty}
counters/orders: next (used in a transaction for orderNo)

=== SYNC MATRIX: every event must update all affected roles live ===
1. Customer registers -> Admin: Pending profile appears with badge. Customer: "Awaiting approval" screen, cannot order.
2. Admin approves and sets PIN -> Customer can log in and order.
3. Admin resets an agent's PIN -> Agent's active session is signed out; the new PIN works.
4. Customer places order -> Customer: confirmation + tracker at "Placed". Admin: appears under Unassigned, dashboard counts update, alert. Agent: nothing yet.
5. Admin assigns agent -> Agent: order appears in Assigned + notification. Customer: tracker shows delivery partner name and a call button. Admin: moves from Unassigned to Active; agent's active count updates.
6. Admin marks packed -> Customer: "Packed". Agent: "Ready for pickup" and Mark Picked Up becomes enabled.
7. Agent marks picked up -> Customer: "Out for delivery" + notification. Admin: status updates in Active. Agent: moves to Out tab.
8. Agent marks delivered -> Customer: "Delivered" + Reorder. Admin: Today Delivered +1, agent stats and cash collected update, agent becomes Free if no other active orders. Agent: moves to Completed, earnings update.
9. Customer cancels (only while placed) -> Admin: notified, leaves Unassigned/Active. Agent (if assigned): order disappears with a notice.
10. Admin cancels with reason -> Customer sees Cancelled + reason. Agent: order removed with notice.
11. Admin reassigns agent -> Old agent loses it (notified). New agent gains it. Customer sees the new partner.
12. Admin toggles stock, edits price, adds or deletes an item -> Customer catalog and cart update live (cart lines flagged, totals recomputed). Existing orders are unchanged (snapshots).
13. Admin changes store settings -> Customer cart and checkout reflect new minimum, fee and hours immediately. Agent fee applies to future assignments only.
14. Agent goes online or offline -> Admin: Free Agents count and assign picker update.
15. Customer edits address or phone -> Admin profile updates. Only future orders use it; existing orders keep their snapshot.
16. Admin creates a manual order -> Same order document and flow. If linked to a customer profile it appears in that customer's history.
17. Admin adds or disables a banner -> Customer home carousel updates live.

=== DESIGN SYSTEM (Zomato-style, sleek) ===
Colors: green900 #123524 (headers), green700 #1F5B3C (primary), green500 #2E8B57 (success), amber #E8A33D (primary action / FAB), coral #E1604A (danger), cream #FBF8F1 (background), card #FFFFFF, ink #16221B, inkSoft #5C6B62, line #E7E1D3.
Status colors: placed amber, packed #5B5BD6, out_for_delivery #2F80ED, delivered green500, cancelled coral.
Type: Manrope (800 headings, 600 labels, 500 body). Scale: 12, 14, 16, 20, 26.
Spacing: 4, 8, 12, 16, 24, 32 only. Radius: card 18, chip 100, button 14.
Patterns: sticky bottom cart bar ("2 items - Rs 72   View cart"), ADD button that morphs into a - 1 + stepper, bottom sheets (not full-page modals) for item detail, filters and agent picker, skeleton loaders instead of spinners, pull-to-refresh, toasts for feedback, light haptics on taps and confirmations, press-scale animation on buttons, vertical status timeline for tracking, swipe-to-confirm for Mark Delivered, illustrated empty and error states with one clear action.
Touch targets at least 44pt. Respect safe areas. Sentence case. Buttons say exactly what happens ("Place order", not "Submit").
Libraries (install with npx expo install): react-native-reanimated, react-native-gesture-handler, @gorhom/bottom-sheet, expo-image, expo-haptics, lucide-react-native + react-native-svg, @expo-google-fonts/manrope, expo-font, @react-native-community/netinfo, @react-native-async-storage/async-storage, zustand.

=== CODING STANDARDS ===
TypeScript types in /types. Folders: /services, /hooks, /components/ui, /theme, /utils. Every list has loading (skeleton), empty and error states. Validate all inputs (phone: 10 digits starting 6-9; PIN: 4 digits). Show friendly error messages. Never leave console.log in finished code.
```

---

## Phase 1: Foundation

### P1: Codebase audit (no code changes)

- [x] `AUDIT.md` created
- [x] Current auth method and PIN storage understood
- [x] Gaps vs `PROJECT_CONTEXT.md` listed

```
Read PROJECT_CONTEXT.md. Audit the existing codebase WITHOUT changing any code. Create AUDIT.md covering:
1. Folder and route structure, Expo SDK version, installed packages.
2. How login works today: where the phone + PIN are stored and checked. Flag clearly if PINs are stored in plain text in Firestore or checked on the client.
3. Every Firestore collection and field currently used, and where in the code it is read or written.
4. Which screens already exist for customer, agent and admin, and which components can be reused.
5. A gap list against PROJECT_CONTEXT.md and a recommended migration order.
Do not fix anything yet. Ask me about anything ambiguous.
```

### P2: Design system and shared components

- [x] Theme tokens file (colors, spacing, radius, type)
- [x] Manrope font loaded
- [x] Button, Card, Chip, StatusPill, QtyStepper, Skeleton, EmptyState, ErrorState, Toast, BottomSheet, StickyBar, SwipeToConfirm, ScreenHeader
- [x] Dev-only `/dev/ui` showcase screen

```
Follow PROJECT_CONTEXT.md. Build the design system.
1. Create /theme with tokens from the Design System section (colors, status colors, spacing, radius, typography) and load Manrope via expo-font.
2. Create /components/ui: Button (primary, secondary, ghost, danger; loading state; press-scale animation; light haptic), Card, Chip (selectable), StatusPill (uses status colors), QtyStepper (ADD morphs into - 1 +), Skeleton (animated shimmer), EmptyState (icon, title, one action), ErrorState (message + Retry), Toast (success, error, info), BottomSheet wrapper around @gorhom/bottom-sheet, StickyBar (for cart bar), SwipeToConfirm, ScreenHeader (curved green900 header with title and subtitle).
3. Create a dev-only screen /dev/ui that renders every component and state so I can review them in Expo Go.
4. Do not restyle existing screens yet.
Install packages with npx expo install. Follow the standard footer below.

Standard footer: reuse existing code, do not break existing screens, list files changed, list which sync-matrix rows this covers, and stop and ask if anything is ambiguous.
```

### P3: Data layer (services, hooks, status machine)

- [x] Types for User, Item, Order, Settings, Notification
- [x] Services with no Firestore calls left inside screens
- [x] `transitionOrder()` enforces the status machine and writes history + notifications atomically
- [x] Order number from counter transaction
- [x] Items soft-deleted

```
Follow PROJECT_CONTEXT.md. Build the data layer.
1. Create /types for User, Item, Order, OrderItem, Settings, AppNotification, matching the Data Model exactly.
2. Create /services: orders, items, users, settings, notifications, stats. Create /hooks: useAuthUser, useItems, useOrders(filters by role), useOrder(id), useSettings, useNotifications, useAgents. All hooks use onSnapshot with cleanup and limit().
3. In services/orders implement: createOrder (transaction: next orderNo from counters/orders, snapshots of items, address and customer), assignAgent, reassignAgent, transitionOrder(orderId, toStatus, actor) which validates allowed transitions and actor role from the Status Machine, then in ONE batch updates the order, appends statusHistory, sets timestamps, writes notifications for every affected role, and on delivered increments stats_daily.
4. Change item deletion to soft delete everywhere and make item queries exclude isDeleted by default.
5. Refactor existing screens to use these services and hooks instead of calling Firestore directly. Behaviour and UI must stay the same.
Follow the standard footer.
```

### P4: Auth, session, role routing, validation

- [x] Session survives app restart
- [x] Role-based redirect after login
- [x] Route guards in every group layout
- [x] Phone and PIN validation with inline errors
- [x] Customer "Awaiting approval" screen
- [x] Admin PIN reset signs the user out

```
Follow PROJECT_CONTEXT.md and AUDIT.md. Harden auth and routing.
1. Persist the Firebase Auth session across app restarts (React Native AsyncStorage persistence). Show a branded splash/skeleton while restoring the session.
2. After login, redirect by role to (customer), (agent) or (admin). Add guards in each group's _layout so a signed-in user of another role (or a signed-out user) is redirected, including via deep links.
3. Customers with status "pending" see an "Awaiting approval" screen with their submitted details and cannot browse or order. "blocked" users see a message and are signed out.
4. Validation utilities in /utils: Indian mobile (10 digits starting 6-9), 4-digit numeric PIN. Apply to login, register, add agent, approve and set PIN, reset PIN. Show inline errors, disable the button while submitting, trim input.
5. When admin resets a PIN or blocks a user, that user's active session must be invalidated on their next request or snapshot event and sent to login.
6. Do NOT change how PINs are stored without asking me first. If the audit found plain-text PINs, propose a safer approach as a written plan and wait for my approval.
Follow the standard footer.
```

### P5: Loading, error and offline handling

- [x] Every list: skeleton, empty, error, pull-to-refresh
- [x] Offline banner
- [x] Agent status updates survive losing signal
- [x] Global error boundary

```
Follow PROJECT_CONTEXT.md. Add resilience everywhere.
1. Every list and detail screen must show: skeleton while loading, EmptyState when empty, ErrorState with Retry on failure, and pull-to-refresh where it makes sense.
2. Add a NetInfo-based offline banner ("You're offline. Changes will sync when you're back").
3. Firestore offline persistence is not available with the JS SDK in React Native, so implement a small outbox in AsyncStorage for agent actions (picked up, delivered, online toggle): show optimistic UI with a "Saving..." marker, queue the write, and replay on reconnect. Before replaying, re-read the order and skip or surface a conflict if its status already changed (for example admin cancelled it).
4. Add a global error boundary with a friendly fallback screen.
5. Prevent double submissions on every write button.
Follow the standard footer.
```

### P6: Firestore security rules and indexes

- [x] `firestore.rules` written and deployed
- [x] `firestore.indexes.json` written and deployed
- [x] Permission matrix tested with real accounts
- [x] Test-mode rules removed

```
Follow PROJECT_CONTEXT.md. Write production Firestore security rules in firestore.rules and required indexes in firestore.indexes.json.
Rules:
- Helper functions for isSignedIn, role (read from users/{uid}), isAdmin, isAgent, isCustomer, isApproved.
- users: a user reads and updates their own profile but cannot change role, status or isOnline-for-others; admin reads and writes all. Agents may update only their own isOnline.
- items: any approved signed-in user reads; only admin writes.
- settings, banners: signed-in read; admin write.
- orders: customer can read only where customerId == their uid; can create only with status "placed", their own uid, paymentMethod "COD"; can update only to cancelled, and only while status is placed. Agent can read only where agentId == their uid; can update only status (packed -> out_for_delivery, out_for_delivery -> delivered), timestamps and statusHistory, using affectedKeys().hasOnly(...). Admin full access.
- notifications: read and mark-read only by toUid; create allowed only as part of legitimate order flows; admin full.
- stats_daily, counters: writable only as part of allowed flows; read by admin.
Also make sure every client query includes the filter the rules require (customerId or agentId), and add the composite indexes my queries need.
Produce a PERMISSIONS_TEST.md table (role, action, expected allow/deny) and tell me how to deploy (Firebase console or CLI). Follow the standard footer.
```

### P7: Store settings (minimum order, delivery charge, hours)

- [x] Admin Settings screen
- [x] `computeTotals()` and `isStoreOpen()` shared utilities
- [x] Customer side reacts live

```
Follow PROJECT_CONTEXT.md. Build store settings.
1. Admin Settings screen (opened from an icon in the admin header, no new bottom tab): minOrderValue, deliveryFee, freeDeliveryAbove, openTime and closeTime (IST), manual override (Auto / Force open / Force closed), delivery slot labels (add, remove, reorder), agentFeePerDelivery. Validate numbers, save with a toast.
2. Shared utilities in /utils: computeTotals(cartItems, settings) returning subtotal, deliveryFee, total, amountToFreeDelivery, meetsMinimum; and isStoreOpen(settings, nowIST) which handles the manual override.
3. Customer side must read settings live (sync rows 12 and 13): show a "Store is closed, opens at 7:00 AM" banner and disable checkout when closed.
Follow the standard footer.
```

---

## Phase 2: Customer app

### P8: Home and browse

- [x] Header with greeting and delivery address chip
- [x] Search bar, banner carousel, category chips
- [x] Live item list, out-of-stock items greyed out
- [x] Sticky cart bar
- [x] Store-closed banner

```
Follow PROJECT_CONTEXT.md. Build the customer Home screen in the Zomato style.
- Curved green header: greeting, delivery address chip (tap opens a bottom sheet to view or edit address), search bar.
- Banner carousel from active banners (hidden if none).
- Horizontal category chips built from the categories in items; selecting one filters the list.
- Item list (live via useItems): name, unit, price, category icon placeholder (no image upload for now), QtyStepper. Out-of-stock items stay visible but greyed with "Out of stock" and no ADD.
- StickyBar at the bottom when the cart has items: "N items - Rs total   View cart".
- Skeleton loaders, pull-to-refresh, empty and error states, store-closed banner from P7.
- Customer bottom tabs: Home, Orders, Account.
Sync: rows 12, 13 and 17 must work live without refresh.
Follow the standard footer.
```

### P9: Listing, search, item detail

- [x] Debounced search
- [x] Category listing
- [x] Item detail bottom sheet

```
Follow PROJECT_CONTEXT.md. Add search, category listing and item detail.
1. Search screen: debounced (300 ms) client-side search over live items by name and category, recent searches saved locally, empty state "No items match".
2. Category screen reusing the same item row component.
3. Tapping an item opens a bottom sheet with name, unit, price, stock state, QtyStepper (max 20 per item) and "Add to cart" showing the line total.
4. If an item becomes out of stock or its price changes while the sheet is open, update it live and show a small notice.
Follow the standard footer.
```

### P10: Cart

- [x] Persistent cart (survives app restart)
- [x] Quantity change and swipe to remove
- [x] Live revalidation against inventory
- [x] Bill summary with free-delivery progress

```
Follow PROJECT_CONTEXT.md. Build the cart.
1. Zustand cart store persisted in AsyncStorage, keyed by customer uid. Cart lines store itemId and qty only; name and price always come from live items so they stay correct.
2. Cart screen: line items with QtyStepper, swipe-to-remove with undo toast, bill summary (subtotal, delivery fee, total) via computeTotals, a progress bar "Add Rs X more for free delivery", minimum-order message that disables checkout, empty state with "Browse items".
3. Live revalidation (sync row 12): if an item goes out of stock, flag the line and exclude it from totals with a clear notice; if the price changes, update totals and show "Price updated" on that line. Remove lines for soft-deleted items with a notice.
4. Clear the cart on sign out of a different user.
Follow the standard footer.
```

### P11: Checkout

- [x] Address card with edit and GPS fallback
- [x] Delivery slot (ASAP or scheduled)
- [x] Notes
- [x] Place order with all guards
- [x] Double-tap protection

```
Follow PROJECT_CONTEXT.md. Build checkout.
1. Address card from the customer's profile (door, street, locality, city, landmark, GPS). "Edit" opens a bottom sheet. For GPS use expo-location: ask permission with a clear reason, handle allowed, denied and permanently denied, and always allow manual entry as a fallback. Saving updates users/{uid} (sync row 15).
2. Delivery slot selector: "As soon as possible" or a slot from settings.slots. Optional notes field (max 200 chars).
3. Bill summary and a "Cash on delivery" label.
4. "Place order" button runs guards in this order: store open, customer approved, cart not empty, every item still in stock, minimum order met. On failure show a specific message. On success call createOrder (transaction), clear the cart, and navigate to the confirmation screen. Protect against double taps with an idempotency key.
5. The order must store snapshots of items, prices, address and customer details.
Sync: row 4 (Admin sees it instantly under Unassigned).
Follow the standard footer.
```

### P12: Confirmation and live tracking

- [x] Success screen
- [x] Live status timeline
- [x] Delivery partner card with tap-to-call
- [x] Cancel while placed

```
Follow PROJECT_CONTEXT.md. Build order confirmation and tracking.
1. Confirmation screen with an animated check (Reanimated), order number, total, slot and "Track order".
2. Tracking screen bound to useOrder(id) via onSnapshot: vertical timeline Placed, Packed, Out for delivery, Delivered, with timestamps from statusHistory and a pulsing dot on the current step. Cancelled orders show a cancelled state with the reason.
3. Delivery partner card appears once agentId is set: name and a Call button (Linking tel:). Hidden until assigned (sync row 5).
4. Items and bill summary, delivery address, notes.
5. "Cancel order" button only while status is "placed", with a confirmation sheet. Uses transitionOrder so admin and any assigned agent are updated (sync row 9).
6. Delivered state shows "Reorder".
Follow the standard footer.
```

### P13: Order history and reorder

- [x] Ongoing and Past tabs
- [x] Pagination
- [x] Reorder

```
Follow PROJECT_CONTEXT.md. Build the customer Orders tab.
1. Two segments: Ongoing (placed, packed, out_for_delivery) and Past (delivered, cancelled). Live listener for Ongoing; Past loads 20 at a time with "Load more".
2. Order card: order number, date, status pill, item summary ("Tomato x2, Water can x1"), total, and tap to open tracking.
3. "Reorder" on past orders adds all currently available items to the cart at CURRENT prices, then lists any items that were skipped because they are out of stock or removed, and opens the cart.
4. Empty states for both segments.
Follow the standard footer.
```

---

## Phase 3: Admin panel

### P14: Order management and assign agent

- [x] Orders list with filters
- [x] Order detail
- [x] Assign and reassign agent sheet
- [x] Mark packed, cancel with reason
- [x] Alert for new orders

```
Follow PROJECT_CONTEXT.md. Build admin order management without adding a sixth tab: put it under Dashboard.
1. Dashboard stat cards (Total, Active, Today Delivered, Free Agents) become tappable and open the Orders list filtered accordingly. Below them show an "Unassigned orders" section (replacing the current empty-only state when orders exist).
2. Orders screen: segments Unassigned, Active, Delivered, Cancelled; search by order number, customer name or phone; date filter for Delivered. Live listeners.
3. Order detail: items, bill, customer name, tap-to-call phone, address with the existing Open in Maps, slot, notes, status timeline, assigned agent.
4. "Assign agent" bottom sheet: online agents first with their active-order counts and a Free badge; offline agents shown disabled. Buttons: "Assign", "Assign and mark packed". Reassign supported (sync row 11).
5. Actions: Mark packed, Cancel with required reason (sync row 10). All via transitionOrder and assignAgent.
6. New-order alert: when a new placed order arrives, show an in-app banner with light haptic, and update counts live.
Sync rows: 4 to 11, 14.
Follow the standard footer.
```

### P15: Manual order creation

- [x] Customer picker with search by phone
- [x] Walk-in option
- [x] Item picker
- [x] Same order flow afterwards

```
Follow PROJECT_CONTEXT.md. Add manual order creation for phone orders.
1. "New order" button on the Orders screen opens a flow: (a) pick a customer by searching phone or name, or create a walk-in customer (name, phone, address), (b) pick items from live inventory with QtyStepper, (c) review bill with the option to override delivery fee, (d) optionally assign an agent, (e) create.
2. Uses createOrder with source "admin_manual" and the same snapshots, so it follows the normal status machine. If linked to a customer profile it appears in that customer's history (sync row 16).
3. Validate phone, address and non-empty items. Respect the same min-order rule unless admin explicitly overrides.
Follow the standard footer.
```

### P16: Customer order history in profiles

- [x] Lifetime stats on profile card
- [x] Order list per customer

```
Follow PROJECT_CONTEXT.md. On the admin Profiles screen, extend each customer card with: total orders, total spent (delivered only) and last order date (use count and sum aggregation queries or a limited query). Add a "View orders" action that opens a bottom sheet listing that customer's orders (newest first, paginated); tapping one opens the admin order detail from P14. Keep the existing Approve and Set PIN and Assign behaviours unchanged.
Follow the standard footer.
```

### P17: Analytics and agent performance

- [x] Insights section
- [x] Top-selling items
- [x] Agent performance with real data
- [x] Cash collected per agent

```
Follow PROJECT_CONTEXT.md. Build analytics cheaply using stats_daily (not by scanning all orders).
1. Dashboard "Insights" with a range switch (Today, 7 days, 30 days): revenue (delivered only), orders delivered, cancelled count, average order value, top 5 items by quantity. Use simple View-based bar charts, no heavy chart library.
2. Agents screen: replace the placeholder zeros with real Today, Weekly, Monthly delivered counts, online status, current active orders, and cash collected today. Tapping an agent opens a detail sheet with recent deliveries.
3. Keep Reset PIN and Add New Agent working.
Sync: row 8 (delivery updates all of this live).
Follow the standard footer.
```

---

## Phase 4: Agent app

### P18: Order list and detail

- [x] Assigned, Out, Completed tabs on real data
- [x] Order detail with items, address, call
- [x] COD amount shown prominently

```
Follow PROJECT_CONTEXT.md. Make the agent home real.
1. The existing Assigned, Out and Completed counters and tabs now use live data for the signed-in agent only (query where agentId == uid): Assigned = placed or packed, Out = out_for_delivery, Completed = delivered (today first, paginated).
2. Order card: order number, customer name, locality, slot, total, status pill, and "Ready for pickup" highlight when packed.
3. Order detail: items with quantities, full address with landmark, notes, tap-to-call customer (Linking tel:), Open in Maps using the stored GPS if present, and a prominent "Collect Rs X in cash" banner.
4. New assignment shows an in-app banner with light haptic (sync row 5); cancelled or reassigned orders disappear with a notice (rows 9, 10, 11).
Follow the standard footer.
```

### P19: Status actions and online toggle

- [x] Mark Picked Up
- [x] Swipe to Mark Delivered
- [x] Online toggle blocked when active orders exist

```
Follow PROJECT_CONTEXT.md. Add agent actions.
1. "Mark Picked Up" is enabled only when status is packed; otherwise show a disabled "Waiting for the store to pack" state. Calls transitionOrder (sync row 7).
2. "Mark Delivered" uses SwipeToConfirm, then asks "Collected Rs X?" Calls transitionOrder, which updates stats_daily (cash collected, deliveries) in the same batch (sync row 8).
3. ONLINE/OFFLINE toggle writes users/{uid}.isOnline (sync row 14). If the agent has active orders, block going offline with a clear message.
4. Use the outbox from P5 so actions survive poor signal, show a "Saving..." marker, and handle conflicts gracefully.
5. Light haptic and toast on success.
Follow the standard footer.
```

### P20: Earnings and cash collected

- [x] Today, week, month deliveries and earnings
- [x] Cash to hand over

```
Follow PROJECT_CONTEXT.md. Add an Earnings screen for agents (a tab or a header button).
- Today, This week, This month: deliveries and earnings (sum of agentFee on delivered orders; agentFee is snapshotted from settings at assignment).
- "Cash collected today" so the agent knows how much to hand over, with the list of completed orders and each amount.
- Must match the numbers admin sees on the Agents screen (P17) exactly, since both derive from the same data.
Follow the standard footer.
```

---

## Phase 5: Finish

### P21: Notifications

- [x] Bell icon with unread badge for all roles
- [x] Notification list
- [x] Permission handling
- [x] In-app live banners and vibration alerts

```
Follow PROJECT_CONTEXT.md. Build notifications for all three roles.
1. In-app (works in Expo Go): a bell with unread badge in every role's header, a notifications list (newest first, tap opens the related order, mark read), and a live in-app banner when a new notification arrives. Notification documents are already written by transitionOrder; verify each sync-matrix row creates the right ones for the right roles.
2. Push: use expo-notifications, request permission with a clear reason, handle denied, save the Expo push token to users/{uid}. Explain the two sending options and wait for my choice: (A) a Firebase Cloud Function that sends via the Expo push API when a notification document is created (needs the Blaze plan), (B) in-app only for now. Note that Android remote push does not work in Expo Go, so test push with a development build.
3. Never send a notification to the person who triggered the action.
Follow the standard footer.
```

### P22: Cross-role sync audit

- [x] `SYNC_REPORT.md` with every row tested
- [x] All gaps fixed
- [x] Automated 98-assertion E2E test suite passing

```
Follow PROJECT_CONTEXT.md. Audit the whole app against the Sync Matrix.
1. For each of the 17 rows, find the code path that performs the action and confirm it (a) uses a service function, (b) updates the order or item document once, (c) writes the right notifications, (d) is read via onSnapshot by every affected role's screen.
2. Grep for any direct Firestore calls inside screens and for any status change that bypasses transitionOrder, and fix them.
3. Write SYNC_REPORT.md: a table of row, status (pass or fail), file references, and what you fixed.
4. Write a manual test script I can follow with three sessions (phone = customer, simulator = agent, web = admin) covering the full order lifecycle, cancellation at each stage, reassignment, stock change during checkout, and agent going offline.
Fix every failing row, then report.
```

### P23: Zomato-style UI polish

- [x] Consistent tokens everywhere
- [x] Motion and haptics
- [x] Accessibility and keyboard handling
- [x] Zero-layout-overlap bottom padding on Home

```
Follow PROJECT_CONTEXT.md. Do a full UI polish pass across customer, agent and admin screens.
- Replace every hard-coded color, size or spacing with theme tokens. Apply ScreenHeader, Card, Button and StatusPill consistently, and restyle the remaining original screens (Login, Profiles, Agents, Inventory, Offers, Dashboard) to match, keeping all behaviour unchanged.
- Motion: press-scale on buttons and cards, list-item fade-in only on first load, ADD to stepper morph, bottom sheet transitions. Respect reduced motion.
- Haptics on add, confirm and delivery actions.
- Every screen: skeletons, empty states, error states, safe areas, KeyboardAvoidingView on forms, touch targets of 44pt or more, accessibility labels on icon buttons.
- Performance: FlatList with keyExtractor and memoised rows, expo-image with placeholders, no listeners left running after unmount.
Report anything you chose not to change and why.
```

### P24: Pre-build checks

- [x] `app.json` complete
- [x] Permission texts
- [x] Firebase config via environment
- [x] First preview build

```
Follow PROJECT_CONTEXT.md. Prepare for the first EAS preview build.
1. Review app.json (or app.config.js): name, slug, version, icon, splash, android.package, ios.bundleIdentifier, plugins. Add location permission texts (expo-location), notification config, and confirm only permissions we actually use are declared.
2. Move Firebase config to environment variables via EXPO_PUBLIC_ keys and make sure no secrets are committed.
3. Remove console.log, dead code and unused packages. Run npx expo-doctor and fix what it reports.
4. Create eas.json with development, preview (internal APK) and production profiles.
5. Give me a step-by-step checklist for: eas login, eas build:configure, eas build --platform android --profile preview, installing the APK on a real phone, and re-running the full P22 test script on the build.
Follow the standard footer.
```

---

## Phase 6: Post-Launch Extensions & Upgrades

### P25: Store UPI QR Code Payments & Chained Sales Analytics

- [x] Admin Store QR Codes Manager (`app/admin/qr.tsx`) with 5-code capacity limit
- [x] Agent Delivery Scan-to-Pay QR Modal (`app/agent/delivery/[id].tsx`)
- [x] Dynamic UPI payment URI generator (`services/qr.ts`)
- [x] Chained Sales Accounting on `orders` and `stats_daily` (`upiRevenue`, `upiOrders`, `qrSales`, `qrOrders`)
- [x] Composite indexes & deployed security rules for `qr_codes`
- [x] Suite 9 automated E2E tests passing

```
Follow PROJECT_CONTEXT.md. Integrate UPI QR code payments and sales tracking.
1. Create a dedicated Admin screen at /admin/qr to register, edit, and set default store UPI QR codes (name, upiId, payeeName, optional qrUrl). Enforce 5-QR max capacity.
2. In agent delivery/[id].tsx, add a prominent "QR" payment button alongside Cash delivery. When selected, show customer Scan-to-Pay modal with active store QR and exact order amount.
3. On delivery confirmation, atomically update order with paymentMethod: 'upi_qr', qrId, and qrLabel, increment stats_daily upiRevenue and upiOrders, and increment totalSales and orderCount on the qr_codes doc.
4. Update firestore.rules and add composite indexes for qr_codes.
```

### P26: Empty Water Can Tracking & Direct Recovery Lifecycle

- [x] Admin Cans Ledger screen (`app/admin/cans.tsx`)
- [x] Automated pure recovery dispatch (`type: 'recovery'`, `total_amount: 0`)
- [x] Agent specialized recovery checklist & empties collection stepper (`app/agent/delivery/[id].tsx`)
- [x] Suite 4 automated E2E tests passing

```
Follow PROJECT_CONTEXT.md. Build empty water can recovery.
1. Track pending empties outside per customer.
2. Support automated pure recovery orders (type: 'recovery') assigned to agents when net cans are > 0.
3. In agent delivery/[id].tsx, render dynamic empties stepper and hide grocery checklist for recovery tasks.
```

### P27: Standalone Production & Preview Android APK Builds (EAS)

- [x] `eas.json` configured with development, preview (APK), and production profiles
- [x] Cloud Keystore provisioned under Expo account `@shivani2`
- [x] Cloud build pipeline verified: Standalone APK generated and hosted on Expo CDN
- [x] Clean zero-warning builds with `expo-font`, `react-native-reanimated`, and `expo-location`

```
Follow PROJECT_CONTEXT.md. Configure EAS Build for standalone Android distribution.
1. Setup eas.json with preview profile: "buildType": "apk".
2. Link Expo account and provision managed cloud Keystore.
3. Trigger build with npx eas build --platform android --profile preview.
```

### P28: Admin Navigation Architecture & Header Ergonomics

- [x] Centralized "Anandhi Stores ▾" header options modal (`app/admin/alerts.tsx`)
- [x] Single canonical sign-out location with confirmation alert
- [x] Header de-duplication: removed redundant top buttons, uncluttered admin tab bar
- [x] High-contrast dark green Notification Bell (`styles.bellWrap`)

```
Follow PROJECT_CONTEXT.md. Streamline Admin header navigation.
1. Bind "Anandhi Stores ▾" and profile button to a dedicated modal housing Store Settings, Manual Order, and Logout.
2. Eliminate redundant action buttons from the dashboard header for maximum touch ergonomics.
3. Ensure notification bell has high contrast against green900.
```

### P29: Interactive Multi-Timeframe Agent Metrics & Shift Breakdown

- [x] Segmented timeframe chips on Agent Dashboard (`Today`, `7 Days`, `30 Days`)
- [x] Dynamic COD revenue & runs filtering across Firestore Timestamps and epoch timestamps
- [x] Interactive performance metric cards in Earnings & Cash Handover bottom sheet
- [x] Suite 7 automated E2E tests passing

```
Follow PROJECT_CONTEXT.md. Make agent earnings and metrics interactive.
1. Add Today, 7-Day, and 30-Day timeframe filter chips to agent completed runs tab.
2. In Earnings bottom sheet, transform summary boxes into active selectable filters.
3. Dynamically recompute COD collected and order counts based on selected timeframe.
```

---

## Reusable prompts

### R1: Any new feature or change (keeps all three roles in sync)

```
Follow PROJECT_CONTEXT.md. Change request: <describe it>.
BEFORE writing code, give me a table: Customer impact | Agent impact | Admin impact | Firestore fields and rules affected | Notifications needed | New or changed sync-matrix rows. Wait for my approval. Then implement through /services, use real-time listeners, update the security rules and PROJECT_CONTEXT.md, and finish with the standard footer.
```

### R2: Bug fix

```
Follow PROJECT_CONTEXT.md. Bug: <what you did, what you expected, what happened, which role and screen>. First explain the root cause and which files are involved. Fix it with the smallest change, confirm it does not break any sync-matrix row, and list files changed.
```

### R3: Review what the agent just did

```
Review the changes you just made against PROJECT_CONTEXT.md. List any place where a screen calls Firestore directly, any hard-coded style value, any missing loading, empty or error state, any status change that bypasses transitionOrder, and any sync-matrix row this work affects but does not update for all roles. Fix what you find.
```
