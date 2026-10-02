# PROJECT_CONTEXT.md — Anandhi Stores

Read this file before every task and follow it. Do not change app code when instructed only to read this.

---

## PROJECT

Anandhi Stores: a single Expo (React Native, Expo Router, TypeScript) app for a local grocery and 20L water-can delivery store in Chennai. Backend: Firebase (Auth + Firestore). Three roles in ONE app: customer, agent, admin. Payment: Cash on Delivery only. Must run in Expo Go. Existing screens and behaviour (approve and set PIN, reset PIN, agent ONLINE toggle, inventory stock toggle, open in maps, GPS capture) must keep working.

---

## ROLES AND ROUTES

Route groups: (auth), (customer), (agent), (admin). Each group layout guards access by the signed-in user's role and redirects otherwise. Session persists across app restarts. Roles are enforced in Firestore rules, not only in the UI.

---

## GOLDEN RULES (SYNC CONTRACT)

1. One order document is the single source of truth. Customer, agent and admin all read the SAME document.
2. Every screen that shows shared data uses real-time listeners (onSnapshot) with unsubscribe on unmount. Always use limit() on list queries.
3. Screens never call Firestore directly. All reads and writes live in /services and /hooks.
4. Any service function that changes order state must, in ONE batch or transaction: update the order, append to statusHistory, and write notification documents for every affected role.
5. Orders store SNAPSHOTS (item name, unit, price, address, customer and agent name and phone) so later edits never rewrite history.
6. Inventory items are soft-deleted (isDeleted: true), never hard-deleted.
7. Every new feature or change must list its impact on all three roles before any code is written. If a role is unaffected, say why.
8. No hard-coded colors, spacing or font sizes. Use theme tokens only.

---

## ORDER STATUS MACHINE

placed -> packed -> out_for_delivery -> delivered
placed -> out_for_delivery -> delivered  (no-store shortcut — agent picks up directly)

cancelled is reachable from placed (customer or admin) and from packed (admin only).

- Customer: creates order (placed), cancels only while placed.
- Admin: assigns or reassigns agent, optionally marks 'packed' (Ready for Pickup), cancels with reason, creates manual orders.
- Agent: only sees orders assigned to them. placed|packed -> out_for_delivery ("Pick Up & Start Delivery"), out_for_delivery -> delivered ("Slide to Mark Delivered"). Nothing else.

Agent free/busy: agent is FREE when isOnline is true and they have zero active orders (placed, packed or out_for_delivery with their agentId). An agent with active orders cannot go offline.

---

## DATA MODEL (Firestore)

users/{uid}: role (customer|agent|admin), name, phone, status (pending|approved|blocked), address {door, street, locality, city, landmark, lat, lng}, isOnline (agents), createdAt
items/{itemId}: name, category, unit, price, inStock (bool), isDeleted (bool), sortOrder, createdAt, updatedAt
orders/{orderId}: orderNo (e.g. AS-1042 from a counter doc in a transaction), customerId, customerName, customerPhone, addressSnapshot {...}, items [{itemId, name, unit, price, qty, lineTotal}], subtotal, deliveryFee, total, paymentMethod "COD", slot {type: asap|scheduled, label}, notes, status, agentId, agentName, agentPhone, agentFee, source (customer|admin_manual), cancelReason, cancelledBy, statusHistory [{status, at, byUid, byRole}], createdAt, updatedAt, packedAt, pickedUpAt, deliveredAt, cancelledAt
settings/store: minOrderValue, deliveryFee, freeDeliveryAbove, openTime, closeTime (IST, "HH:mm"), isStoreOpenOverride (null|true|false), slots [labels], agentFeePerDelivery
notifications/{id}: toUid, toRole, type, orderId, title, body, read, createdAt
banners/{id}: title, imageUrl or color, isActive, sortOrder
stats_daily/{YYYY-MM-DD}: orders, revenue, cashCollectedByAgent {agentId: amount}, deliveriesByAgent {agentId: count}, itemQty {itemId: qty} (incremented in the same batch that marks an order delivered)
counters/orders: next (used in a transaction for orderNo)

---

## SYNC MATRIX — every event must update all affected roles live

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

---

## DESIGN SYSTEM (Zomato-style, sleek)

Colors: green900 #123524 (headers), green700 #1F5B3C (primary), green500 #2E8B57 (success), amber #E8A33D (primary action / FAB), coral #E1604A (danger), cream #FBF8F1 (background), card #FFFFFF, ink #16221B, inkSoft #5C6B62, line #E7E1D3.
Status colors: placed amber, packed #5B5BD6, out_for_delivery #2F80ED, delivered green500, cancelled coral.
Type: Manrope (800 headings, 600 labels, 500 body). Scale: 12, 14, 16, 20, 26.
Spacing: 4, 8, 12, 16, 24, 32 only. Radius: card 18, chip 100, button 14.
Patterns: sticky bottom cart bar ("2 items - Rs 72   View cart"), ADD button that morphs into a - 1 + stepper, bottom sheets (not full-page modals) for item detail, filters and agent picker, skeleton loaders instead of spinners, pull-to-refresh, toasts for feedback, light haptics on taps and confirmations, press-scale animation on buttons, vertical status timeline for tracking, swipe-to-confirm for Mark Delivered, illustrated empty and error states with one clear action.
Touch targets at least 44pt. Respect safe areas. Sentence case. Buttons say exactly what happens ("Place order", not "Submit").
Libraries (install with npx expo install): react-native-reanimated, react-native-gesture-handler, @gorhom/bottom-sheet, expo-image, expo-haptics, lucide-react-native + react-native-svg, @expo-google-fonts/manrope, expo-font, @react-native-community/netinfo, @react-native-async-storage/async-storage, zustand.

---

## CODING STANDARDS

TypeScript types in /types. Folders: /services, /hooks, /components/ui, /theme, /utils. Every list has loading (skeleton), empty and error states. Validate all inputs (phone: 10 digits starting 6-9; PIN: 4 digits). Show friendly error messages. Never leave console.log in finished code.

---

## STANDARD FOOTER

After every implementation task:
1. List all files changed (created, modified, deleted).
2. List which sync-matrix rows this work covers.
3. Stop and ask if anything is ambiguous before writing code.
4. Do not break existing screens or behaviour.
5. Reuse existing code where possible.
