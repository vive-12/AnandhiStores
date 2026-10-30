# Anandhi Stores — multi-tool review log

Independent reviews of this development-phase codebase. **Do not rewrite earlier entries.** Append a new `##` section at the bottom.

---

## How later tools should add an entry

1. Read `dev_docs/PROJECT_CONTEXT.md` and this file first.
2. Review the live code (do not trust `dev_docs/AUDIT.md`; it is stale).
3. Append a new section using the template at the bottom of this file.
4. Name the heading after the tool (`Cursor`, `ChatGPT`, `Claude`, `Gemini`, `Codex`, etc.).
5. Cover four lists: **could be better**, **missing**, **not needed**, plus **already good** so the owner can compare tools.
6. Do not change app code unless the owner asks.

Copy-paste prompt for any other app:

```
You are reviewing the Anandhi Stores repo (local grocery + 20L water-can delivery, Chennai).

Stack: Expo SDK 58 / React Native / Expo Router / TypeScript, Firebase Auth + Firestore, Cloud Functions in functions/. Three roles in one app: customer, agent, admin. Spec: dev_docs/PROJECT_CONTEXT.md. Owner decisions: phone+PIN (SMS OTP deferred), Firestore rules temporarily open, demo login still present.

Task:
1. Read PROJECT_CONTEXT.md, firestore.rules, functions/index.js, mobile/services/*, mobile/hooks/*, mobile/app/** layouts and screens.
2. Do a deep review: what is already good, what could be better, what is missing vs the spec and a live store, what is not needed (dead code, unused deps, leftover scripts, stale docs).
3. Open review.md in the repo root. Do NOT edit earlier ## entries. APPEND a new section at the bottom titled "## <YourToolName> — YYYY-MM-DD".
4. Use this structure inside the entry:
   - Summary (5–8 lines)
   - Already good (bullets with file paths)
   - Could be better (bullets with file paths and why)
   - Missing (bullets; say if it is spec, security, ops, or product extras)
   - Not needed (bullets; say delete, archive, or gate for prod)
   - Disagreements with earlier entries (optional)
5. Be specific. No generic “add tests / add comments”. Do not implement fixes unless asked.
```

---

## Cursor — 2026-10-30

Reviewer: **Cursor** (Grok 4.6). Scope: whole repo. No emulator, device, or Firebase deploy checks.

### Summary

This is a real store app, not a sketch. Customer catalog/cart/checkout, agent pickup/delivery + can recovery, and admin ops (orders, profiles, agents, inventory, offers, cans, QR, settings, analytics) all exist and mostly go through `/services` and `/hooks`. The order transaction in `mobile/services/orders.ts` is the strongest piece: snapshots, status history, stats, auto-recovery, duplicate-delivery protection.

The product is blocked from live customers by trust, not by missing screens. Firestore is public, demo login skips Auth, PIN hashes equal Auth passwords, and Cloud Functions are still local. Several packages and one-off scripts are leftover from the AquaRush / Express era.

### Already good

- Single order document as source of truth; customer, agent, and admin read the same `orders/{id}` (`mobile/services/orders.ts`).
- Status changes run in one transaction: order, `statusHistory`, notifications, IST daily stats, pending-can balance, automatic recovery run (`transitionOrder`).
- Duplicate / stale delivery taps cannot double-count revenue or spawn a second recovery job.
- Recovery (`type: 'recovery'`) is excluded from retail revenue, cash collection, and item-sales KPIs.
- Screens do not import Firestore; reads/writes live in `mobile/services/` and `mobile/hooks/`.
- List listeners use `limit()`; composite indexes exist in `firestore.indexes.json`.
- Role layouts redirect non-matching users (`mobile/app/admin/_layout.tsx`, `agent/_layout.tsx`, `(customer)/_layout.tsx`). Temporary PIN forces `/auth/reset-pin`.
- PIN reset / agent create / change PIN go through callable functions (`functions/index.js`) with Admin SDK rollback if the profile write fails.
- Inventory soft-delete (`isDeleted`) in `mobile/services/items.ts`.
- Shared UI kit + theme (`mobile/components/ui/`, `mobile/theme/index.ts`), ErrorBoundary, OfflineBanner, outbox replay, local order simulation (`mobile/scripts/test_scripts/test-comprehensive-e2e.js`).
- Expo Go SDK 58 alignment, Manrope, bottom sheets, swipe-to-confirm on deliver, GPS / open-in-maps still present.

### Could be better

- **Firestore rules vs comments.** Helpers in `firestore.rules` describe role policy, then `users`, `stats_daily`, `counters`, `agents` use `allow read, write: if true`, and most other matches allow `!isSignedIn()`. Close them only after login no longer needs a public phone query.
- **PIN hash is the Auth password.** `hashPin` = SHA-256(pin + phone), stored on `users.pin` and used as `signInWithEmailAndPassword` password (`mobile/services/auth.ts`, `functions/index.js`). With open user reads, stealing the hash is enough to sign in.
- **Demo login skips Auth.** `mobile/config/demoCredentials.ts` is `enabled: true` with real-looking phones/PINs shown on `mobile/app/auth/login.tsx`. `isDemoCredential` returns before Firebase sign-in.
- **Session restore ignores Auth.** `restoreSession` loads AsyncStorage uid + Firestore profile; it does not require `auth.currentUser` to match. Fine only while rules are open.
- **Admin trust is a Firestore field.** Rules `isAdmin()` reads `users/{uid}.role`. Callables correctly require `token.admin === true`, but the client/rules path does not. Anyone who can write their user doc can become “admin” in rules.
- **Customer cancel packed is allowed in the service.** Spec: packed cancel is admin-only. UI in history/track checks `placed`; `TRANSITIONS` in `orders.ts` still allows `customer` + `packed` → `cancelled`.
- **New-order in-app notice can target uid `admin`.** Customer `createOrder` in `(customer)/index.tsx` omits `adminUid`, so the Firestore notification uses `toUid: 'admin'`. Push uses `toRole: 'admin'`; the bell may miss it.
- **`assignAgent` skips `statusHistory`.** Golden rule 4 says every order-state write appends history in the same transaction. Assignment only updates agent fields + notifications.
- **Can detection is a string match.** Delivered “cans” = item name or unit contains `"can"`. Grocery SKUs can false-positive. Needs a catalog flag (`isWaterCan` / category).
- **`setAgentOnline` has no server check.** UI blocks offline with active orders (`agent/dashboard.tsx`); the service write does not, so a direct client call can mark an agent free while they still have runs.
- **Blocked-user redirect loop risk.** Root `RouteGuard` sends blocked customers to login without clearing session, then logged-in users on auth routes are sent home (`mobile/app/_layout.tsx`).
- **TypeScript is not strict.** `mobile/tsconfig.json` has `"strict": false`; lots of `as any` around timestamps.
- **Theme rule is routinely broken.** Spec: tokens only. Screens use emoji tab icons, `#0284C7`, `#EF4444`, `#FFFFFF`, and Ionicons instead of the specified `lucide-react-native`.
- **Customer checkout does not notify a real admin uid** (same as createOrder gap). Also no store-hours hard block visible as a single shared helper used by both cart and admin override.
- **Pagination.** Admin orders cap 200, recovery 500, users 200. No “load more”; older history is invisible.
- **Functions region vs client** is aligned (`asia-south1`), but nothing in CI deploys or smoke-tests them.
- **Firebase client config is hardcoded** as fallbacks in `mobile/config/firebase.ts` (normal for Firebase API keys, but env should be the only source for non-dev).
- **Reset-pin placeholder encoding** is broken (`placeholder="â€¢ â€¢ â€¢ â€¢"` in `mobile/app/auth/reset-pin.tsx`).
- **Docs drift.** `dev_docs/AUDIT.md` still describes JSX, no Auth, hard-coded admin PIN. `package.json` name is `aquarush-mobile` while `app.json` is Anandhi Stores.

### Missing

Spec / contract (should exist for the stated product):

- Enforced Firestore rules (roles in rules, not only UI). Currently the opposite.
- Deployed Cloud Functions + `admin: true` custom claim (`functions/scripts/set-admin-claim.js` exists, not evidenced as applied).
- Server-side phone+PIN verification so `users` does not need public reads.
- Auth-backed session on every cold start (restore must wait for Firebase Auth).
- `statusHistory` on agent assign/reassign.
- Packed-cancel restricted to admin in the service layer, not only the UI.
- Catalog field for 20L water cans (recovery must not parse product names).
- Cursor pagination once order/user lists exceed current limits.
- Storage rules (and likely actual Storage uploads). `getStorage` is initialized but unused; inventory “custom photo” has no Storage path.

Security / ops (needed before real customers):

- Demo credentials off in preview/production EAS profiles.
- `.gitignore` for `*.json` user dumps, `.env`, and `mobile/scripts/backup_users_*.json` (dump is currently in the repo).
- Rate-limit / lockout story for 4-digit PINs (10k search space).
- `storage.rules` and `firestore.rules` tests; `PERMISSIONS_TEST.md` is not wired to the emulator.
- CI: `tsc --strict`, the local order sim, and a functions dry-run.
- Production EAS secrets; `eas.json` production profile has no env/demo-off flag.
- Live exercise of register → approve → order → assign → pack → deliver → recovery across IST midnight (checklist still open).

Product extras (not in PROJECT_CONTEXT, useful later, do not block the core loop):

- Proof of delivery (photo / signature).
- Live agent GPS on the tracker (today: open in maps + captured address lat/lng).
- In-app map (`react-native-maps` is installed but unused).
- Multiple saved addresses per customer.
- Tamil copy / accessibility beyond 44pt targets.
- Receipt / share bill.
- SMS OTP (explicitly deferred by owner).

### Not needed

Delete, archive, or gate. Do not keep these in a production mindset:

- **`axios`** — listed in `mobile/package.json`, not imported anywhere. Express backend is gone.
- **`react-native-maps`** — unused; `mobile/utils/openMap.js` opens Google Maps instead.
- **`lucide-react-native`** — specified in PROJECT_CONTEXT, never imported; app uses `@expo/vector-icons` Ionicons. Either use lucide everywhere or drop the unused package and update the spec.
- **`firebase/storage` export** — initialized, never used.
- **Demo credentials UI** on the login screen for any non-dev build (`demoCredentials.enabled` should be false outside `__DEV__`).
- **Committed user dump** `mobile/scripts/backup_users_1793167663684.json` — PII; does not belong in git.
- **One-off / dual-write scripts** once data is migrated: `mobile/sync_cans.js`, `mobile/scripts/reconcile_users.mjs`, `mobile/scripts/inspect_users.mjs`, `mobile/scripts/inspect_details.mjs`, `mobile/scripts/seed_500_products.js` (keep in a private ops folder, not the app tree).
- **Legacy collections as a long-term model** — `agents`, `inventory`, `offers` plus snake_case fields (`is_available`, `plainPin`). Support during migration is fine; new writes should stop.
- **Stale `dev_docs/AUDIT.md`** as a source of truth — archive or stamp “superseded 2026-09-30”.
- **`dev/ui` and `dev/logs` in production binaries** — useful in development; gate with `__DEV__` or omit from EAS production (comment in `mobile/app/dev/ui.tsx` already says this).
- **Root role-picker** — already gone; `mobile/app/index.tsx` is only a splash. Do not bring it back.
- **Hard-coded AquaRush naming** in `mobile/package.json` (`aquarush-mobile`).
- **UPI QR as a second payment system** if the owner wants to stay COD-only per spec. If UPI is an accepted expansion, keep it and update PROJECT_CONTEXT; otherwise it is extra surface (agent payment method, `qr_codes`, analytics split).
- **Customer “Dashboard” spend tab** — not in the original three tabs (Home / History / Account). Nice-to-have analytics; not required for the sync contract. Keep only if customers will use it.

### Suggested order of work (not implemented)

1. Deploy functions + grant admin claim; confirm PIN reset / create agent on the live project.
2. Disable demo Auth bypass in preview/prod; make `restoreSession` require matching Firebase Auth.
3. Move phone lookup behind a callable; then replace open rules with the existing role helpers + admin claim.
4. Fix packed-cancel, `createOrder` admin uid, `assignAgent` history, water-can catalog flag, `setAgentOnline` transaction.
5. Remove unused deps/scripts/dumps; enable `strict`; archive AUDIT.md; update PROJECT_CONTEXT for UPI/recovery if those stay.

### Disagreements with earlier docs

- `dev_docs/AUDIT.md` is wrong for the current tree (TypeScript, Firebase Auth, services/hooks, no hard-coded admin PIN screen).
- `dev_docs/CODEBASE_REVIEW_CHECKLIST.md` is closer. Cursor agrees with its open items: functions deploy, admin claim, close rules, pagination, live Auth/notification exercise. Cursor adds: demo Auth skip, PIN-hash-as-password, unused maps/axios/lucide/storage, committed user backup JSON.

---

## Template for the next tool

```
## <ToolName> — YYYY-MM-DD

Reviewer: **<ToolName>**. Scope: …

### Summary
### Already good
### Could be better
### Missing
### Not needed
### Disagreements with earlier entries
```


---

## CURSOR— 2026-10-30

Reviewer: **Claude Sonnet 4.6 (Antigravity)**. Scope: full repo read — `PROJECT_CONTEXT.md`, `firestore.rules`, `functions/index.js`, all of `mobile/services/`, `mobile/hooks/`, `mobile/app/**`, `mobile/types/`, `mobile/theme/`, `mobile/utils/`, `mobile/config/`, scripts and package files. No emulator or live Firebase run.

### Summary

The codebase is further along than its security posture suggests. The critical order pipeline (`services/orders.ts`) is genuinely solid: atomic transactions cover status, history, stats, can-balance, recovery-run creation, and duplicate-delivery protection in one pass. The role layouts guard routes, the services/hooks separation is clean, the offline outbox is wired, and the design tokens are real and mostly respected. What blocks a real customer launch is not missing screens — it is a cluster of trust gaps that compound each other: Firestore is wide open, the session is not backed by Firebase Auth on cold start, demo credentials ship in every build, and the PIN hash doubles as the Auth password (so a Firestore read is a credential steal). Cloud Functions exist and are correct but are not evidenced as deployed to the live project. Several spec behaviours (assignAgent missing statusHistory, packed-cancel allowed to customers in the service layer, can-detection by name-substring) are bugs in the existing code rather than missing features. There is also visible technical debt from the AquaRush/Express era: `package.json` name `aquarush-mobile`, `axios` and `react-native-maps` installed but unused, a committed PII backup JSON, and one-off scripts living in the app tree.

### Already good

- **Atomic order pipeline** — `transitionOrder` in [`mobile/services/orders.ts`](file:///d:/Vivek/Can/mobile/services/orders.ts) commits order, `statusHistory`, notifications, IST `stats_daily`, `pendingCans` balance and auto-recovery in one Firestore transaction; duplicate-delivery protection is built in.
- **Can recovery lifecycle** — recovery orders are created automatically when `cansDelivered > cansCollected`; they are correctly excluded from revenue, cash-collection and item KPIs; the service re-reads the counter inside the same transaction so concurrent deliveries cannot race on order numbers.
- **Services/hooks discipline** — screens import nothing from `firebase/firestore` directly; all Firestore operations live in `mobile/services/`; hooks wire `onSnapshot` with limit and clean up with `unsubscribe`.
- **Firestore rules for orders are the tightest collection** — [`firestore.rules`](file:///d:/Vivek/Can/firestore.rules) L99-136 uses `diffAffectedKeys().hasOnly()` to restrict what fields each role may touch on order updates, and enforces the `placed→cancelled` guard for customers at the rule level.
- **Cloud Functions use Admin SDK with rollback** — [`functions/index.js`](file:///d:/Vivek/Can/functions/index.js) rolls back Auth creation if the Firestore write fails in `adminCreateAgent`, and restores the previous password hash if the profile write fails in `adminResetPin` and `changeOwnPin`.
- **`requireAdmin` checks the custom claim** — [`functions/index.js` L19-25](file:///d:/Vivek/Can/functions/index.js) enforces `token.admin === true` (not a Firestore field), so callables cannot be escalated by profile tampering.
- **Offline outbox** — [`mobile/services/outbox.ts`](file:///d:/Vivek/Can/mobile/services/outbox.ts) serialises `transition_order` and `set_agent_online` to AsyncStorage, replays on reconnect, and discards stale/conflicted actions cleanly.
- **Agent dashboard: new-order false-positive guard** — [`mobile/app/agent/dashboard.tsx`](file:///d:/Vivek/Can/mobile/app/agent/dashboard.tsx) L196-233 seeds `prevOrderIdsRef` from the first snapshot so Firestore's cache-then-network double-fire does not trigger a stale alert every time the agent opens the app.
- **Admin new-order alert skips the initial snapshot** — [`mobile/app/admin/_layout.tsx`](file:///d:/Vivek/Can/mobile/app/admin/_layout.tsx) L80-104 uses `isInitialSnapshot` to prevent popup storms on admin login.
- **Design tokens exist and are mostly used** — [`mobile/theme/index.ts`](file:///d:/Vivek/Can/mobile/theme/index.ts) defines all spec colours, spacing, radius and font sizes; most screens import `Colors`, `Spacing`, `Radius`, `FontSize` from theme rather than hardcoding.
- **Item soft-delete enforced** — [`mobile/services/items.ts`](file:///d:/Vivek/Can/mobile/services/items.ts) `softDeleteItem` never calls `deleteDoc`; cart and customer screen filter `isDeleted` before display.
- **Zustand cart persisted per-user** — [`mobile/hooks/useCart.ts`](file:///d:/Vivek/Can/mobile/hooks/useCart.ts) uses `zustand/persist` with AsyncStorage and clears cart on user switch.
- **`isStoreOpen` / `computeTotals` shared** — [`mobile/utils/compute.ts`](file:///d:/Vivek/Can/mobile/utils/compute.ts) is the single place for cart maths and store-hours logic; both customer and admin reach it indirectly through hooks/settings.
- **OfflineBanner + ErrorBoundary** — root layout mounts both; the outbox listener is also started in root `useEffect` with proper cleanup.
- **SwipeToConfirm on delivery** — spec pattern; present in `mobile/components/ui/`.
- **Push notifications are best-effort** — every `sendRemotePushNotification` call is wrapped in `.catch(() => {})` so a push failure never aborts the order transaction.

### Could be better

- **`restoreSession` does not verify Firebase Auth** — [`mobile/services/auth.ts` L108-133](file:///d:/Vivek/Can/mobile/services/auth.ts): it reads AsyncStorage uid, fetches the Firestore profile, and returns it as a valid session even when `auth.currentUser` is `null` (i.e. the user has been signed out server-side or had their refresh token revoked by `adminResetPin`). Revocation via `revokeRefreshTokens` in Cloud Functions is therefore ineffective on a warm app restart.
- **`loginWithPhone` queries Firestore before signing in to Firebase Auth** — [`mobile/services/auth.ts` L190-193](file:///d:/Vivek/Can/mobile/services/auth.ts): the phone query returns raw PIN fields (`data.pin`, `data.plainPin`) to a public-rules database. Anyone with network access can call the query and read hashes without authenticating. The PIN check should happen server-side (callable function) so the DB can be locked.
- **`signInWithPhonePin` will silently create a new Auth account on first login** — [`mobile/services/auth.ts` L63-83](file:///d:/Vivek/Can/mobile/services/auth.ts): if `signInWithEmailAndPassword` fails (wrong password) it falls through to `createUserWithEmailAndPassword`. A typo in a PIN will create a stale Auth account rather than returning "Incorrect PIN".
- **`assignAgent` does not append `statusHistory`** — [`mobile/services/orders.ts` L330-336](file:///d:/Vivek/Can/mobile/services/orders.ts): the transaction updates agent fields and writes notifications but never touches `statusHistory`. Spec golden rule 4 says every write that changes order state appends history; assignment is a meaningful state change (admin sync matrix row 5, 11).
- **Customer can cancel a `packed` order at the service layer** — [`mobile/services/orders.ts` L48](file:///d:/Vivek/Can/mobile/services/orders.ts): `TRANSITIONS` allows `customer + packed → cancelled`. Spec says packed-cancel is admin-only. The Firestore rule also permits this at L112-119 (customer can cancel only from `placed`), so the rule is tighter than the service — but any client that constructs the right Firestore write directly can bypass both.
- **Can detection uses a substring match** — [`mobile/services/orders.ts` L453](file:///d:/Vivek/Can/mobile/services/orders.ts): `i.name.toLowerCase().includes('can') || i.unit.toLowerCase().includes('can')` will match "Canned Tomatoes", "Scan card", etc. The `Item` type has no `isWaterCan` flag and the category `'Water'` exists in [`admin/inventory.tsx` L44](file:///d:/Vivek/Can/mobile/app/admin/inventory.tsx) but is not used as the detection signal.
- **`setAgentOnline` is a plain `updateDoc` with no active-order check** — [`mobile/services/users.ts` L139-171](file:///d:/Vivek/Can/mobile/services/users.ts): the UI blocks going offline with active orders, but the service writes unconditionally. A second device, an outbox replay, or a direct Firestore call can mark the agent free while runs are open.
- **Blocked user redirect loop** — [`mobile/app/_layout.tsx` L81-86](file:///d:/Vivek/Can/mobile/app/_layout.tsx): a blocked customer is sent to `/auth/login`, but the RouteGuard also redirects logged-in users away from auth routes back to their home; if `restoreSession` returns the blocked user before the status is refreshed the guard can oscillate.
- **Manual order passes a `fakeOrder` stub to `assignAgent`** — [`mobile/app/admin/alerts.tsx` L473-502](file:///d:/Vivek/Can/mobile/app/admin/alerts.tsx): the order object constructed in-memory has `statusHistory: []`, `createdAt: {} as any`, and `orderNo: 'AS-NEW'`. If `assignAgent` is extended to log or diff fields, this stale stub will silently produce wrong output. The service already re-reads the document inside its transaction, so passing a fresh `getOrder` result (or just the `orderId`) would be safer.
- **`sendRemotePushNotification` reads `users` collection with `getDocs` on every call** — [`mobile/services/notifications.ts` L43-52](file:///d:/Vivek/Can/mobile/services/notifications.ts): each admin-targeted push fires an unbounded query for all admin users. With one admin this is trivial, but the pattern should use a cached/known admin UID list rather than a repeated query.
- **`listenItems` uses `limit(500)` with no `orderBy`** — [`mobile/services/items.ts` L18](file:///d:/Vivek/Can/mobile/services/items.ts): without `orderBy`, Firestore returns items in insertion order and the 500-doc cap is invisible to the admin. A `seed_500_products.js` was run; if there are more than 500 items, newer ones will silently be missing. Also, applying `isDeleted` filter client-side after fetching all 500 wastes reads.
- **Delivery countdown timer is cosmetic** — [`mobile/app/track/[id].tsx` L57, 92-98](file:///d:/Vivek/Can/mobile/app/track/%5Bid%5D.tsx): the 15-minute countdown resets on every status change and is pure UI; the spec does not require it and it sets a false expectation for the customer when an order actually takes 45 minutes.
- **`useAuthUser` resolves `effectiveUid` as `sessionUid || firebaseUid`** — [`mobile/hooks/useAuthUser.ts` L28](file:///d:/Vivek/Can/mobile/hooks/useAuthUser.ts): a demo-mode login sets `sessionUid` but not `firebaseUid`, so the hook returns the Firestore profile as if authenticated. This is intentional for demo mode but means the hook cannot be used as an Auth gate.
- **`replayOutbox` indentation is misaligned** — [`mobile/services/outbox.ts` L84-128](file:///d:/Vivek/Can/mobile/services/outbox.ts): the `remaining`, `replayed`, `conflicts` declarations and the `for` loop are at two different indentation levels relative to the `try` block. It works but suggests a paste artifact.
- **Demo credential PIN values are shown in plain text on screen** — [`mobile/app/auth/login.tsx` L119-121](file:///d:/Vivek/Can/mobile/app/auth/login.tsx): the tile renders `PIN {credential.pin}` verbatim. Even for dev builds, displaying raw PINs in the UI trains bad habits and will cause a copy-paste mistake when the flag is eventually toggled.
- **`items` collection has no server-side `isDeleted == false` filter** — [`mobile/services/items.ts` L18-29](file:///d:/Vivek/Can/mobile/services/items.ts): the query fetches all 500 items (including deleted ones) and filters client-side. This costs reads proportional to historical deletes and cannot be indexed.
- **`admin/_layout.tsx` calls `useSafeAreaInsets()` after a conditional early return** — [`mobile/app/admin/_layout.tsx` L118](file:///d:/Vivek/Can/mobile/app/admin/_layout.tsx): `useSafeAreaInsets` is called on line 118 but the `if (!uid || role !== 'admin') return <Redirect>` is on line 116. React's Rules of Hooks forbid calling a hook after a conditional return; this is a hooks-order violation that will cause a crash on React's strict-mode exhaustive check.

### Missing

**Spec / contract:**

- `statusHistory` entry on agent assignment and reassignment (`mobile/services/orders.ts` `assignAgent`) — **spec golden rule 4**.
- Server-side phone+PIN lookup (callable function); until this exists the `users` collection must stay world-readable — **spec security**.
- `isWaterCan: boolean` (or use of the existing `'Water'` category) on `Item` to make can-recovery detection reliable — **spec data model**.
- `restoreSession` must await `auth.authStateReady()` and cross-check `auth.currentUser.uid === stored.id` before trusting the stored session — **spec, session integrity**.
- Packed-cancel restricted to admin at the service layer (`TRANSITIONS` in `orders.ts`), not just the Firestore rule — **spec order status machine**.
- `storageRules` file — `getStorage` is initialized in `mobile/config/firebase.ts` and `expo-image-picker` is imported in `admin/inventory.tsx`, but no Storage rules or upload path exist — **spec: custom photo path for items is dead code**.

**Security / ops (needed before real customers):**

- `demoCredentials.enabled` must default to `false` outside `__DEV__`; currently it is hardcoded `true` in the source and there is no EAS build profile that overrides it — **security**.
- `.gitignore` does not cover `*.json` data dumps; `mobile/scripts/backup_users_1793167663684.json` (PII) is committed — **security**.
- PIN lockout / rate-limiting: 4-digit PIN = 10 000 combinations; the client and Firestore rules have no brute-force protection — **security**.
- Custom admin claim (`token.admin === true`) must be set before Cloud Functions can enforce admin access; `functions/scripts/set-admin-claim.js` exists but there is no evidence it has been run on the live project — **ops**.
- `firestore.rules` tests (the `PERMISSIONS_TEST.md` file exists but references `firebase emulators:exec` and is not wired to any CI or `npm test` script) — **ops**.
- CI: `tsc --noEmit` (strict), rule tests, and a `functions` dry-run are all absent — **ops**.
- EAS `production` profile in `eas.json` has no `env` block to turn off demo mode or point at a non-dev Firebase project — **ops**.

**Product extras (useful, not blocking the core loop):**

- Proof of delivery (photo) — agent delivery screen already has a `Modal` and `Image` import; the slot exists.
- In-app order receipt / share bill after delivery.
- Multiple delivery addresses per customer.
- Cursor-based pagination for admin order history and customer profiles once the 200-doc limit is hit.
- Tamil-language support (`react-native-localize` or Expo Localization).

### Not needed

- **`axios` in `mobile/package.json`** — installed at `^1.20.0`, zero imports anywhere in `mobile/`. Express backend is gone. → **delete from dependencies**.
- **`react-native-maps` in `mobile/package.json` at `1.29.11`** — `mobile/utils/openMap.js` opens Google Maps via `Linking.openURL`; no `MapView` component is imported anywhere. → **delete from dependencies**.
- **`lucide-react-native`** — listed as required in `PROJECT_CONTEXT.md` design section; not installed, not imported. Every screen uses `@expo/vector-icons` Ionicons. Decide: adopt lucide everywhere (requires icon swap across all screens) or remove from the spec and stay on Ionicons. → **resolve one way or the other**.
- **`mobile/scripts/backup_users_1793167663684.json`** — committed PII dump. → **delete from repo and add `mobile/scripts/*.json` to `.gitignore`**.
- **`mobile/sync_cans.js`** — standalone dual-write migration script at the `mobile/` root. → **move to a private ops folder or delete once migration is confirmed done**.
- **`mobile/scripts/reconcile_users.mjs`, `inspect_users.mjs`, `inspect_details.mjs`, `seed_500_products.js`** — one-off admin/migration tools inside the app tree. → **move to a private ops repo or `archive/` folder outside `mobile/`**.
- **Demo login block shown to real users** — [`mobile/app/auth/login.tsx` L102-124](file:///d:/Vivek/Can/mobile/app/auth/login.tsx) renders phone + PIN in plain text whenever `demoCredentials.enabled` is truthy, which is always true right now. → **gate strictly on `__DEV__` or an EAS build variable**.
- **`mobile/app/dev/ui.tsx` and `mobile/app/dev/logs.tsx`** — the comment in `dev/ui.tsx` already says "do not ship". → **gate with `__DEV__` check in the tab navigator or exclude from production EAS profile**.
- **`package.json` name `aquarush-mobile`** — [`mobile/package.json`](file:///d:/Vivek/Can/mobile/package.json) is from the previous product. → **rename to `anandhi-mobile`**.
- **`dev_docs/AUDIT.md`** — describes JSX, no-Auth, hardcoded admin PIN; wildly wrong for the current codebase. Its presence invites new contributors to implement things that are already done. → **stamp "superseded 2026-09-30" at the top or delete**.
- **`plainPin` field on the `User` type** — [`mobile/types/index.ts` L30](file:///d:/Vivek/Can/mobile/types/index.ts): the migration code in `functions/index.js` `previousPassword()` reads and then deletes `plainPin` on PIN reset. Once all accounts have been reset, this field and its read-paths in `auth.ts` (`data.pin === pin || data.plainPin === pin`) can be removed. → **archive after migration is confirmed**.
- **`whatsapp://send?phone=919600102028` hardcoded in customer home** — [`mobile/app/(customer)/index.tsx` L761](file:///d:/Vivek/Can/mobile/app/(customer)/index.tsx): the store phone number is hardcoded in JSX. It should come from `settings/store` or a `mobile/config/storeInfo.ts` constant so it can be changed without a release. → **move to config**.

### Disagreements with earlier entries (Cursor — 2026-10-30)

- **Partially agree on the `assignAgent`/statusHistory gap** — both entries flag it; confirmed by direct code read.
- **Partially disagree on "Ionicons vs lucide"** — Cursor's entry says lucide is "never imported"; confirmed. But the right fix is a decision, not automatically "drop lucide from the spec" — the spec's design section has strong opinions about icon style (lucide is thinner, more consistent with the Zomato-style intent). The owner should decide and then do one pass, not silently ship Ionicons everywhere.
- **New finding vs Cursor entry**: the **hooks-order violation** in `admin/_layout.tsx` (L116 conditional return before L118 `useSafeAreaInsets()`) is not noted by Cursor. This is a real React bug that will crash in strict mode.
- **New finding vs Cursor entry**: the **`signInWithPhonePin` fall-through** that silently creates a new Firebase Auth account on wrong-password is not flagged in the earlier review.
- **New finding vs Cursor entry**: `sendRemotePushNotification` doing an unbounded `getDocs` on `users` for every admin push is not called out; it is a Firestore read cost issue at scale.
- **Agree with Cursor's suggested order of work** — deploy functions + grant admin claim first; the rest of the trust gaps cannot be closed until callables are live and the DB can be locked.

## Codex — 2026-10-30

### Summary

The app has a coherent customer, agent and admin route structure, and the order service is a substantial implementation of the shared live-order workflow.
The requested owner decision to leave Firestore rules open explains the current rule posture, but it leaves every business collection unauthenticated and writable over the client API; treat this as a demo-only deployment boundary.
Phone + PIN login currently reads credential fields from Firestore before Firebase Auth sign-in, so the present design cannot be made private just by tightening the existing rules.
Order totals, minimums, item prices and availability are calculated on the device and trusted by order creation, leaving a direct-write path for forged orders.
There is a product contract conflict: the project spec says COD only, while delivery completion supports UPI QR and the app includes QR management and payment analytics.
The repo also retains stale documentation and operational scripts, and the configured test commands point to scripts without establishing repeatable automated checks.

### Already good

- `mobile/app/_layout.tsx`, `mobile/app/(customer)/_layout.tsx`, `mobile/app/agent/_layout.tsx`, and `mobile/app/admin/_layout.tsx`: root session restoration and per-role route layouts are present; the customer, agent and admin routes are explicitly guarded.
- `mobile/services/orders.ts`: order-number allocation and order creation use a transaction; transitions re-read current state and atomically update history, notifications, delivery stats and can-recovery work.
- `mobile/services/outbox.ts`, `mobile/hooks/useCart.ts`, and `mobile/components/ui/OfflineBanner.tsx`: offline order actions have an outbox and cart persistence, appropriate for unreliable mobile data.
- `mobile/services/items.ts` and `mobile/services/users.ts`: item deletion is soft deletion, and customer-facing item/user/order/settings hooks are separated from screen components.
- `mobile/utils/compute.ts`: cart totals, phone/PIN validation helpers and IST store-hour calculation are centralized instead of duplicated in screens.
- `functions/index.js`: PIN reset and agent provisioning are handled through callable functions with admin custom-claim checks and rollback handling around profile/Auth writes.

### Could be better

- `firestore.rules`: the broad `allow read, write: if true` on users, stats, counters, agents, notifications, orders and other collections also permits unauthenticated mutations. This is the explicitly accepted temporary setting, but the rules as deployed cannot enforce the spec's role boundaries or protect profile PIN hashes, push tokens, addresses and order data.
- `mobile/services/auth.ts`, `mobile/config/demoCredentials.ts`, and `mobile/app/auth/login.tsx`: login queries user and legacy-agent documents and compares `pin`/`plainPin` locally before Auth sign-in; demo credential bypass is enabled by default. A Firestore rules lockdown therefore depends on replacing this lookup with a server-side phone+PIN flow and gating demo access by build environment.
- `mobile/services/orders.ts` `createOrder` and `mobile/app/(customer)/index.tsx`: the client supplies item snapshots, prices, subtotal, fee and total; the transaction allocates the order number but does not re-read catalog/settings or validate stock/minimum/price. With current open rules, a modified client can create arbitrarily priced orders. The same invariant should be enforced by a trusted server write before live ordering.
- `mobile/services/orders.ts` `transitionOrder` and `mobile/types/index.ts`: delivery can set `cash` or `upi_qr`, and QR stats are recorded; this contradicts `PROJECT_CONTEXT.md`'s COD-only contract. Decide whether COD-only is still authoritative and remove or formally amend the QR/UPI flow and analytics to avoid reports and agent screens describing unsupported payment options.
- `mobile/services/orders.ts` `TRANSITIONS`: `packed → cancelled` is allowed to both customer and admin in service code, despite the spec reserving packed cancellation for admin. The current Firestore rule prevents a customer from performing that transition only when rules are closed; UI/service and rule validation should agree.
- `mobile/services/orders.ts` cancellation path: cancellation increments `stats_daily.cancelledOrders` or `cancelledRecoveryOrders`, while the documented `stats_daily` model specifies delivered order counts, revenue, agent collections/deliveries and item quantities. Confirm the expanded metrics are intentional and ensure analytics definitions explain whether cancelled counts are included.
- `mobile/services/banners.ts` `createBanner`: the preflight count uses an unbounded one-shot collection read and is separate from the insert, so concurrent admin creates can exceed `MAX_BANNERS`; it also reads every banner despite the admin listener already being capped. If five is a hard invariant, enforce it atomically on a trusted write path.
- `mobile/services/stats.ts` and `mobile/hooks/useStats.ts`: recent stats are bounded by `limit(days)` without date ordering/filtering. Firestore does not guarantee the newest N daily docs from that query, so the 45-day analytics window can omit recent days as history grows.
- `mobile/services/users.ts` `setAgentOnline`: the service writes online status directly and does not itself check active assigned orders. The spec makes “cannot go offline while active” a business invariant; UI-only gating is bypassable by another client and the outbox replay path.
- `mobile/app/(customer)/_layout.tsx`: the customer tab set includes a `Dashboard` tab (`dashboard.tsx`) in addition to Home, Orders and Account; the spec lists no customer dashboard requirement. Clarify its customer-facing purpose or remove it from primary navigation if it duplicates home/history.
- `mobile/app/_layout.tsx`: push permission is requested for every app start regardless of role or whether the user has opted in, and `registerDevicePushToken` is invoked on every route-guard effect. Defer permission prompting to a clear notification onboarding/action and avoid repeated registration work.
- `mobile/services/banners.ts`, `mobile/services/items.ts`, and `mobile/services/users.ts`: bounded listeners cap records at 200/500 without surfacing truncation or pagination. This is tolerable for a small demo catalogue but can silently hide inventory, banners or profiles once the cap is crossed.

### Missing

- **Security:** a server-trusted order creation path that derives item prices, stock, minimum value, fees and total from current Firestore data; current client writes accept caller-supplied commercial values.
- **Security:** remove PIN/hash reads from the client login query and introduce server-side verification with throttling/lockout; the current 4-digit PIN and public read exposure make credential guessing and hash extraction practical.
- **Security:** production Firestore rules with role/ownership checks and field-level constraints for users, orders, notifications, counters, settings, QR codes and stats. This is intentionally deferred by owner decision, but must be a release gate.
- **Spec:** consistent enforcement of the order status machine (packed cancellation admin-only) in both service and deployed rules.
- **Spec/product decision:** resolve COD-only versus UPI/QR payment in the spec and implementation; also decide whether customer dashboard and can-recovery extensions are approved scope beyond the listed data model.
- **Ops:** deployment/configuration evidence for callable functions, custom admin claim provisioning, Firebase project selection and production Firestore rules. `firebase.json` configures sources but does not establish that functions or rules are deployed.
- **Ops:** a production release checklist covering demo credentials, rules publication, callable deployment, admin claim, Firebase project, push configuration and PII cleanup. `mobile/eas.json` has dev/preview/production profiles but no explicit production configuration for those gates.
- **Ops:** reproducible CI/build validation for TypeScript, rules and functions. `mobile/package.json` test scripts invoke ad hoc scripts, but no CI config or emulator rules test is present in the repo.
- **Product extras:** proof-of-delivery capture, customer receipt/share, Tamil/localized copy and paginated historical views remain outside the core flow described in the current screens/spec.

### Not needed

- `dev_docs/AUDIT.md` — **archive or delete**: it describes the old JSX/no-auth app and conflicts with the current TypeScript/Auth architecture.
- `mobile/scripts/backup_users_1793167663684.json` — **delete**: committed user backup contains account data; `.gitignore` does not currently exclude JSON backups. Rotate/remove any credentials or personal data represented there as part of cleanup.
- `mobile/scripts/inspect_*.mjs`, `mobile/scripts/reconcile_users.mjs`, `mobile/scripts/seed_500_products.js`, `mobile/scripts/test_scripts/*`, and `mobile/sync_cans.js` — **archive outside the shipped app tree or delete after confirming no active migration depends on them**; they mix one-off admin/data migration utilities and direct integration scripts with the Expo app's npm test surface.
- `mobile/package.json`: `axios` and `react-native-maps` appear unused in the app sources, while `lucide-react-native` is installed but the UI uses Expo Ionicons/emoji — **delete unused dependencies after confirming native build configuration, and either adopt lucide or remove it**.
- `mobile/config/demoCredentials.ts` and the demo credential panel in `mobile/app/auth/login.tsx` — **gate for production**; credentials are hardcoded and the enabled default is true.
- `mobile/app/dev/ui.tsx` and `mobile/app/dev/logs.tsx` — **gate for production**: they are routable Expo Router files and should not be exposed in a store build unless deliberately retained as internal tools.

### Disagreements with earlier entries

- The earlier Codex entry reports a Rules-of-Hooks violation in `mobile/app/admin/_layout.tsx` because `useSafeAreaInsets()` followed an auth early return. In the current file, the hook is called before both conditional returns; that finding is stale and should not be carried forward.


## Codexpro— 2026-10-30

### Summary

The customer shopping, admin dispatch and agent delivery flows are substantially implemented around one shared order document.
The strongest work is transactional completion, snapshot-based history, real-time service/hooks separation and inventory soft deletion.
Ordinary-use defects remain independently of the accepted demo phase: manual recovery attaches to the admin, admin notices miss recipients, and live agent totals exclude newly completed runs.
Warm-session handling does not fulfil PIN-reset sign-out or immediate blocking, and successful PIN changes leave users on the reset form.
Limits bound reads, but filtering after those limits can hide unfinished deliveries and make calendar/lifetime reports incomplete.
Phone+PIN, deferred SMS OTP, temporarily open rules and demo login are accepted owner decisions here; production trust boundaries are separate release requirements.
Scope: static review of the spec, rules, functions, every service/hook and all 27 app route files at checkout 82f1989. Backend JavaScript syntax was checked; app dependencies are absent, so no device, TypeScript, emulator, deployed-rule, callable or push-delivery validation was performed. No live Firebase writes or application fixes were made.

### Already good

- **Shared transactional order model:** mobile/services/orders.ts:226–279,423–559 allocates order numbers atomically and re-reads orders before transitions. Completion groups history, timestamps, notifications, metrics, customer can balance and automatic recovery creation in one commit. Repeating a delivered transition cannot double-count sales.
- **Historical snapshots:** mobile/services/orders.ts:237–265,533–548 and mobile/app/(customer)/history.tsx:188–223 preserve item prices/quantities, customer contacts and delivery addresses. Agent delivery reads the address snapshot; later catalogue/address edits do not rewrite an existing bill.
- **Actual services/hooks boundary:** app screens do not import Firestore directly. mobile/hooks/useOrders.ts, useItems.ts, useCustomers.ts and useSettings.ts return listener cleanup functions. mobile/services/items.ts:56–61 soft-deletes inventory.
- **Privileged account operations:** functions/index.js:19–24,46–122,150–195 uses custom admin claims for reset/provisioning and attempts Auth compensation when profile writes fail. Callable/client regions agree on asia-south1 in mobile/config/firebase.ts:27. Agent deletion needs separate work below.
- **Registration/approval resilience:** mobile/services/auth.ts:163–174 compensates failed profile creation and avoids reporting a committed registration as failed when notifications fail. mobile/services/notifications.ts:141–168 targets actual admin UIDs with deterministic signup notice IDs. mobile/app/auth/awaiting-approval.tsx:15–27 listens for approval.
- **Live cart pricing foundation:** mobile/hooks/useCart.ts persists IDs/quantities; mobile/utils/compute.ts:18–38 and mobile/app/(customer)/index.tsx:269–271 derive totals from live catalogue/settings. Account isolation is not yet wired, as discussed below.
- **Practical doorstep workflow:** mobile/app/agent/delivery/[id].tsx implements checklist verification, swipe confirmation, calling and maps; mobile/app/(customer)/account.tsx:84–136 captures GPS. mobile/services/orders.ts:501–515 separates recovery metrics from retail revenue/cash/item quantities.
- **Useful isolated verification:** mobile/scripts/test_scripts/test-comprehensive-e2e.js loads the real TypeScript order service with an in-memory Firestore adapter. Preserve this suite; its isolation is useful, although it does not validate deployed rules, SDK serialization or actual transaction contention.

### Could be better

- **P1 — Manual collection uses the admin as customer.** mobile/app/admin/cans.tsx:148–175 passes customer name/address but omits customerId; mobile/services/orders.ts:239 defaults ownership to actor.uid, the admin. Assignment notifies the intended customer but never repairs ownership. Completion updates the wrong profile, the actual customer's pendingCans remains, and the run misses their history. Pass and validate the selected customer identity throughout the flow.
- **P1 — Partial can recovery is falsely finished.** mobile/services/orders.ts:455–459,521–549 accepts a recovery delivered with zero/partial cans, leaves the residual balance, and creates follow-up work only for retail deliveries. mobile/app/admin/cans.tsx:390 displays requested pendingCansToCollect before actual emptyCansCollected, so three requested/one collected is shown as three collected. Preserve/requeue the remainder and report actual collections. Also, the listener in mobile/app/agent/delivery/[id].tsx:83–110 captures the initial zero counter and can overwrite an edited count with the requested quantity on subsequent snapshots.
- **P1 — Admin in-app notices are missing/unaddressable.** Customer checkout omits adminUid (mobile/app/(customer)/index.tsx:416–432), so creation writes toUid: 'admin' (mobile/services/orders.ts:270–279). Agent pickup/completion and customer cancellation also omit adminUid; addNotif skips undefined recipients (orders.ts:486–499,553–556). The bell queries the actual signed-in UID (mobile/services/notifications.ts:186–190). Role-targeted push and order-list popups do not replace durable notices. Resolve affected admin recipients in the authoritative event write (sync rows 4/7/8/9).
- **P1 — Warm sessions ignore PIN reset/blocking.** mobile/services/auth.ts:108–132 restores a stored profile ID without waiting for or matching Firebase Auth. Login can retain legacy profile IDs different from the Auth UID. mobile/hooks/useAuthUser.ts:28–44 prefers sessionUid and misleadingly returns it as firebaseUid. Root restoration runs once, and profile listeners do not update/clear the global session except on awaiting approval (mobile/app/_layout.tsx:104–121, mobile/hooks/useSession.ts). Admin-reset mustChangePin and blocking therefore do not reliably invalidate running sessions. Establish one live session authority, explicit demo handling and verified Auth/profile-ID migration (sync rows 2/3).
- **P1 — Registration inputs remount while typing.** mobile/app/auth/register.tsx:82–94 defines InputField inside RegisterScreen and renders it as a component. Each state update creates a new component type, which can remount TextInput and lose focus/keyboard after each character. Give the input component stable identity and verify continuous phone/PIN/address typing on a device.
- **P1 — Conditional hook ordering remains.** mobile/app/admin/_layout.tsx:115–118 calls useSafeAreaInsets after both loading/auth early returns. Changes in those states alter which hooks execute and can fail during restoration/logout. Move the hook above all returns. The last Codex entry incorrectly dismisses this finding for the current checkout.
- **P1 — Successful PIN change has no exit.** mobile/app/auth/reset-pin.tsx:40–44 changes PIN, reauthenticates and updates session without navigating. Root explicitly exempts auth/reset-pin from auth-to-home routing (mobile/app/_layout.tsx:88–90), and the screen has no back/done action. First-login users remain on the form; explicitly transition to role home after success.
- **P1 — Agent completion totals are frozen.** mobile/app/agent/dashboard.tsx:130–165 stores clickTime once and excludes deliveries later than it. A run completed after opening the dashboard is absent from Completed and cash totals even when its live snapshot arrives; tapping a timeframe advances the boundary. Use a live boundary. Separately, mobile/services/stats.ts:182–201 limits daily docs before sorting, so recent days can be omitted; useStats(30) in admin analytics cannot cover a 31-day month. Query the required date window before limiting.
- **P1 — History limits can hide active work.** mobile/services/orders.ts:127–167 caps all agent orders at 100 and admin orders at 200; dashboards derive active counts from these mixed feeds (mobile/app/agent/dashboard.tsx:72–193, mobile/app/admin/alerts.tsx:125–170). An old unfinished run can disappear after enough newer orders and make an agent appear free, eligible for offline mode or deletion. Fetch active work separately and paginate completed history. Recovery similarly limits 500 mixed active/terminal runs before filtering (orders.ts:179–193).
- **P1 before live use — Credential and order trust remain on-device.** mobile/services/auth.ts:189–235 publicly reads credential material; the stored hash is also the Firebase password, so it can be reused for direct Auth sign-in without recovering the PIN. mobile/services/orders.ts:226–268 trusts caller prices, totals, quantities and actor role; validateTransition checks role/status but not actor ownership/assignment. Keep the owner's current development posture explicit, but derive commercial invariants and verify/throttle PINs on a trusted path before real use.
- **P2 — Assignment/availability invariants need authoritative validation.** mobile/services/orders.ts:318–356 has no assignment history or current agent role/approval/online check; mobile/services/users.ts:139–170 does not enforce zero active work before going offline. Stale pickers/second devices bypass UI checks. Reassigning the same agent also overwrites agentFee with current settings. Audit assignment actors and preserve agreed assignment fees unless deliberately reassigned (golden rule 4, sync rows 5/11/13/14).
- **P2 — Customer cancellation races with packing.** mobile/services/orders.ts:48 permits customer cancellation from packed. Checking placed in history/tracker UI is insufficient: an admin can pack between that check and the transaction re-read, and the service still allows cancellation. Split transitions by actor and require admin reasons on the authoritative path.
- **P2 — Unavailable cart lines silently disappear from fulfilment.** mobile/app/(customer)/index.tsx:1165–1193 hides deleted items, renders out-of-stock lines as normally editable, and handlePlaceOrder:389–402 silently drops unavailable items. computeTotals excludes them while the cart badge still counts them. Flag changed lines and require basket review (sync row 12). Reorder in mobile/app/(customer)/history.tsx:65–69 adds each SKU only once, ignoring original quantities and availability.
- **P2 — Profile/cart state is not fully scoped or fresh.** Account loads a one-shot profile and saves name without updating session (mobile/app/(customer)/account.tsx:57–82,160–164). Checkout prefers session name/phone over the freshly fetched profile (mobile/app/(customer)/index.tsx:420–425), so future orders can retain an old name. There are no app callers of useCart.initForUser. Reset retained data/errors when UID changes in useNotifications, useOrder, useCustomerOrders and useAgentOrders; wire cart initialization and shared profile updates.
- **P2 — Checkout can retain obsolete store/slot state.** mobile/app/(customer)/index.tsx:274–276 memoizes open status solely on settings changes; crossing closing time never invalidates it. A deleted slot remains selected and can be ordered; selectedSlot starts at hardcoded '5 min' and is not checked against current slots. mobile/services/settings.ts:21–25 does not fill missing settings fields in existing partial documents. Re-evaluate on foreground/checkout and validate complete current settings (sync row 13).
- **P2 — Agent deletion can conceal failure/orphan work.** mobile/services/users.ts:111–130 deletes profiles before calling the function and swallows callable failures. functions/index.js:125–147 lacks target-role/active-order checks, swallows deletion errors and returns success. A wrong UID, concurrent assignment or unavailable function can remove a non-agent, strand deliveries or retain Auth access. Prefer server-validated deactivation, reassignment checks and auditable outcomes.
- **P2 — Push delivery is an unreliable client side effect.** mobile/services/notifications.ts:25–82 sends after commit, ignores HTTP/ticket responses and has no durable retry/receipt handling. Killing the app after commit can lose push. A single profile token is overwritten across devices and not removed at logout (notifications.ts:89–132; auth.ts:277–281). Root and bells register repeatedly; each mounted bell can schedule a local copy of a remote event (mobile/components/ui/NotificationBell.tsx:104–155). Centralize token/response handling and event-backed dispatch, and verify cold-start taps/permission denial/multiple mounted tabs.
- **P2 — Failure states sometimes look like empty queues.** mobile/app/track/[id].tsx:76–85,175–178 keeps 'Fetching' for listener failure/missing orders; mobile/services/users.ts:52–89 has no snapshot error callback. Agent dashboard collects ordersError but never renders it and leaves optimistic online state unchanged on write failure (dashboard.tsx:58,252–266). Offers, QR and Settings also omit usable listener-error recovery. Show operation-specific retry states.
- **P2 if UPI stays — Payee/accounting state is unsafe to edit concurrently.** mobile/hooks/useQRCodes.ts:19–21 auto-seeds from any consuming role with a hardcoded payee in mobile/services/qr.ts:19–23,203–221. saveQRCode:105–147 rewrites counters read before a concurrent delivery, potentially losing increments. Delivery uses the live default QR rather than freezing the displayed destination; deleting QR docs removes lifetime totals despite preservation copy. Provision verified payees deliberately, separate editable configuration from accounting, snapshot the payment destination and record manual verification. This is an expansion beyond COD-only.
- **P2 — Photo/promotion behavior needs honest limits.** mobile/app/admin/inventory.tsx:129–147,241–260 and mobile/app/admin/offers.tsx:195–224,334–365 store base64 images directly in Firestore without a byte bound/upload service. Large photos inflate listener payloads or exceed document limits, and URI fallback can be device-local. The feature exists but needs bounded shared media handling. Customer banners say 'offer applied' while only adding normal-priced items (mobile/app/(customer)/index.tsx:292–315); no discount calculation/model exists.
- **P2 — Reporting/ETA labels overstate the available data.** mobile/app/track/[id].tsx:57,91–98,203–218 shows an independent 15-minute countdown as delivery ETA, and its timeline implies Packed happened even on direct pickup. Customer dashboard uses at most 50 orders, omits delivery fees and derives historical categories from current items (mobile/app/(customer)/dashboard.tsx:50,77–90). Admin customer lifetime figures use the latest 200 store-wide orders (mobile/app/admin/profiles.tsx:50,73–107). Scope labels honestly or query/aggregate the requested history.

### Missing

- **Spec — Live reset/block enforcement:** verify an agent with an open run loses access on admin PIN reset, can sign in with the new PIN and reaches role home after changing it; verify blocking an already logged-in customer prevents checkout. Include canonical Auth/profile UID migration, rather than treating AsyncStorage as an authenticated session (sync rows 2/3).
- **Spec — Complete affected-role events:** durable notices must reach actual admin/customer/old-agent/new-agent recipients with the associated write; record assignment/reassignment actors. Verify pickup, delivery and customer cancellation in the admin bell, not only the order list (golden rule 4, sync rows 4–11).
- **Spec — Controlled phone change:** Account supports name/address but no phone editor or coordinated update of derived Auth email/PIN salt (mobile/app/(customer)/account.tsx, mobile/services/auth.ts:43–52). Sync row 15 explicitly includes phone edits. Define verification/support handling without assuming deferred SMS OTP is now mandatory; retain old order contacts.
- **Security, deferred release gate — Restricted-write design exercised against actual rules:** firestore.rules deliberately allows unauthenticated access/profile self-promotion. Removing bypasses alone is insufficient: agent completion updates customer balances and creates recovery orders, and customer cancellation writes stats. Move privileged effects to trusted handlers/callables or narrowly authorize atomic writes. Exercise those operations plus forged totals, cross-customer reads, wrong-agent completion and self-role changes in the emulator before live use. Preserve phone+PIN with server throttling.
- **Ops — Targeted regression coverage:** extend the local order suite with explicit customer ownership in manual recovery, partial-recovery remainders and packed-cancel races. Verify continuous registration typing/PIN-change navigation, and fixtures with over 100 agent/200 store orders plus old active runs. Its in-memory adapter serializes transactions and treats dotted paths uniformly; it does not establish actual SDK serialization, retries or rules behavior.
- **Ops — Cash and can reconciliation:** stats_daily records cash collected, but not cash handed to admin, acknowledgement, shortages/excess or agent payouts. 'Cash to Hand Over Today' is gross collections, not outstanding settlement (mobile/app/agent/dashboard.tsx:870–895). pendingCans also lacks an adjustment ledger for damaged/lost cans, deposits or disputes. Add traceable closing/reconciliation before relying on these screens operationally.
- **Ops — Explicit release/environment evidence:** mobile/config/firebase.ts falls back to the shared project; mobile/app.config.js always enables demo credentials; mobile/eas.json has no explicit demo-off policy. Record deployed functions/rules/index versions, admin claim verification, supported Expo Go/device exercise, push-build validation and private backup/restore procedures. Local code does not prove either deployment or non-deployment.
- **Product extras — Local store operations:** serviceable Chennai areas/radius, dated slot capacity/cutoffs, substitutions/partial fulfilment, failed doorstep delivery/retry, receipts and Tamil copy would help a live grocery/water store. The current slot is only a label. Prioritize with the owner; live agent GPS, in-app maps, proof photos and SMS OTP are not prerequisites for the existing external-map/COD contract.

### Not needed

- **Delete unused dependencies after a build check:** axios, react-native-maps and lucide-react-native are declared in mobile/package.json but have no imports in app sources. External navigation uses Linking. Retain lucide only if the specified icon migration is wanted; unused lucide alone does not prove react-native-svg is removable.
- **Delete the committed dump; gate future exports:** mobile/scripts/backup_users_1793167663684.json includes contact/address fields, PIN material and push tokens. backup_users.mjs exports whole collections into a tracked directory. Use narrow backup-output ignores/private destinations, not a blanket JSON ignore that would hide required configuration. Assess Git history exposure and affected credential/token invalidation; deleting the current file does not erase history.
- **Archive/gate live one-off tools:** mobile/scripts/reconcile_users.mjs hardcodes account IDs and deletes/updates profiles. mobile/sync_cans.js reads old user_id/empty_cans_collected and writes pending_cans while current code uses camelCase. inspect_*.mjs, seed_500_products.js and live read/write/integration probes belong behind explicit target-project/dry-run controls. None was executed here.
- **Retain local order tests; delete duplicate execution:** mobile/scripts/test_scripts/test-e2e-order.js merely requires test-comprehensive-e2e.js, so package.json test:all runs that suite twice before live Auth smoke. Clarify/remove the duplicate step. test-banner-matcher.js duplicates matcher implementation rather than importing mobile/utils/bannerMatcher.ts; replace/archive that copied implementation.
- **Delete or deliberately finish the dormant outbox:** mobile/services/outbox.ts has no enqueueAction callers in app code, though root starts replay. Its payload omits checklist, empty-can and payment/QR intent and its global queue is not UID-scoped. It provides no pickup/delivery transaction fallback today. If retained, preserve complete intent/account ownership/conflicts first; mobile/components/ui/OfflineBanner.tsx's 'Changes will sync' promise is otherwise misleading.
- **Gate for prod:** retain owner-approved demo login during development, with an explicit release flag for mobile/app.config.js, mobile/config/demoCredentials.ts and mobile/app/auth/login.tsx. mobile/app/dev/ui.tsx and dev/logs.tsx are routable without login via root's inDev exemption; hide/deny them in store builds, especially persisted-log export.
- **Archive stale guidance; delete obsolete names/comments:** dev_docs/AUDIT.md describes JSX/no Auth/AquaRush; dev_docs/README.md links to another developer's absolute drive and logs absent from this checkout. Keep the audit as dated history. Later cleanup should remove the obsolete admin-login comment in mobile/app/auth/login.tsx:2–3, unused adminLink/adminLinkTxt styles, the 'matches exactly' assertion in mobile/types/index.ts:2 and aquarush-mobile package naming.
- **Archive compatibility after verified migration:** legacy agents/snake_case/plainPin paths in mobile/services/auth.ts, users.ts and functions/index.js are still reachable. Canonicalize Auth/profile IDs and preserve order references before removal. The unused storage export in mobile/config/firebase.ts can be deleted until a shared upload service needs it.
- **Gate/archive product extras only by decision:** QR/UPI (mobile/services/qr.ts, mobile/app/admin/qr.tsx, agent payment picker) contradicts COD-only; the customer spending dashboard is optional. They are used features, not dead code. Keep and update the spec if approved, otherwise gate/archive related routes/reports. Extensive banner crop-editor refinement is lower priority than dispatch/accounting correctness.

### Disagreements with earlier entries

- The last **Codex** entry says the admin safe-area hook precedes both returns. It is actually line 118 after returns at 115/116; the **CURSOR** finding is correct for this checkout. Hook-order failure on state changes is not a special 'strict-mode exhaustive check'.
- Earlier claims of per-user cart isolation/working offline outbox overstate implementation: no app calls initForUser or enqueueAction. Initialization/replay infrastructure is not a completed integration.
- Do not archive all test_scripts/* as the last Codex entry suggests. Retain the real local order-service suite and distinguish it from live-project probes.
- A wrong PIN does not automatically create an Auth account: loginWithPhone requires a matching Firestore credential first, and duplicate emails prevent duplicate Auth creation. Broad create-on-sign-in-error remains poor migration/error handling and does not reconcile profile/Auth IDs.
- The specific blocked-customer redirect oscillation is not demonstrated: that root branch returns before general auth routing, and restoreSession rejects blocked profiles. The confirmed defect is stale status/role/session in running clients.
- Admin push lookup is bounded by limit(25) in mobile/services/notifications.ts:43, contrary to the earlier unbounded-query claim. Inventory photos are persisted as base64; missing Storage upload does not mean that feature is absent.
- The tracker countdown's interval restarts on status changes; secs itself does not reset until remount. It still is not an operational ETA. lucide is declared in package.json, and local source cannot prove native compatibility or whether Cloud Functions are deployed.


## Codexpro implementation — 2026-10-30

### Summary

Implemented the owner's cash/QR-only, no-OTP and low-cost development direction locally.
Partial can collections now preserve the same recovery run and remaining balance for as many days as required, with separate customer/admin/agent views and recovery-only metrics.
Admin order notices resolve actual recipients; account-help requests notify admin after three failed PIN attempts and expose call/WhatsApp assistance.
Live session version/block handling, PIN-change exit, registration focus, hook ordering, availability/deactivation and packing-race protections were addressed without deleting order identities.
Active work is paged independently of history; daily summaries drive admin/agent totals, unsupported ETA was removed, and bounded customer reports are labelled honestly.
Instant-off still permits scheduled ordering, QR/UPI edits preserve accounting, and offers use compressed uploads plus reusable presets.
Earlier review entries are preserved; detailed changed-file list, local validation, cost boundaries and owner-deferred items are in dev_docs/worklog.md.

### Already good

- The existing transactional order service and isolated local suite were retained and extended instead of replacing shared order documents.
- Cash or a manually verified admin-uploaded QR/UPI is sufficient; no gateway integration was added.

### Could be better — remaining boundaries

- Current firestore.rules remains deliberately open for development. firestore.production.rules is fail-closed and not selected for deployment; privileged order writers/emulator validation are still a release gate.
- Persisted notices survive a sender closing, but all-apps-closed system push requires the optional server worker and a reviewed deployment. It stays disabled to avoid silently introducing a billing requirement.
- Named development account setup is an explicit app action, not a live database migration performed by this coding session. Duplicate identities and old malformed recovery ownership need review before migrating real data.

### Missing — OPEN by owner request

- Ops: full device/emulator regression, deployment/admin-claim/index evidence, Expo Go/native push exercise and private backup/restore validation.
- Product extras: service areas, dated slot capacity, substitutions/partial fulfilment, failed delivery/retry, receipts and Tamil.
- Ops: acknowledged cash handover and lost/damaged/deposit can-reconciliation records.
- Security: production trusted-write migration and restrictive-rule rollout, while retaining the approved phone+PIN UX.

### Not needed

- No SMS OTP provider, payment gateway, paid scheduler, hosted photo processor or new Storage bucket is required by these changes.
- No forced expiry/auto-completion of recovery after 2 or 10 days.
- Dormant global outbox replay was removed from startup; offline transactional actions now ask for reconnection rather than falsely promising queued delivery.


## Codexpro— 2026-10-30 — Data reset verification

### Summary
Owner-authorized fresh-start reset was applied to Firebase project anandhi-stores.
Exactly three Firestore app profiles remain: Vivek (admin), Shivani (customer), Suresh (agent).
Offers and promotion banners were removed alongside extra profiles and legacy agent copies.
Order, recovery, review, sales, history, notification and counter collections are empty.
Can/work balances and QR accounting totals are zero; products/settings/payment configuration were preserved.
Private before/after evidence is ignored under .verify; no deployment or billing change occurred.

### Already good
- functions/.env is ignored; the supplied token was used without printing it.
- dev_docs/worklog.md records exact applied scope and live verification, distinguishing app profiles from Firebase Auth accounts.

### Could be better
- functions/scripts/reset-store-data.js supports ADC credentials; this one-off operation used the supplied Firebase CLI refresh token through the Google REST APIs instead. Avoid confusing these authentication methods when rerunning maintenance.

### Missing
- Ops: device-level session/cache refresh remains a user-device step; this reset verifies server records. Existing targeted regression and release evidence tasks remain open.

### Not needed
- Deleted live legacy agents copies, two extra users, old offers/banners and order counter as explicitly requested.
- Gate private .verify snapshots and functions/.env from version control and sharing; both remain ignored.


## Codexpro— 2026-10-30 — Repository organization

### Summary
All project documentation now lives under dev_docs/, including this review history.
The review content above was moved intact; its historical paths are preserved.
Use dev_docs/review.md for future appended entries, superseding the older root-path instruction.
One ignored root .env holds local environment values; one root .env.example documents the keys.
Executable regression checks are grouped under mobile/tests/regression/.
The live Firebase check remains opt-in and is excluded from routine local regression.

### Already good
- mobile/app.config.js selects demo fields explicitly, keeping root cloud tokens outside Expo extra.
- dev_docs/REGRESSION.md distinguishes service regression from outstanding device/rules verification.

### Could be better
- Historical entries retain their original paths and findings; use dev_docs/README.md as the current document index.

### Missing
- Ops: targeted device/emulator and deployed-environment evidence remain open; folder changes do not satisfy those checks.

### Not needed
- Deleted duplicate nested .env and .env.example files after merging populated local values into root .env.
- Removed the empty mobile/scripts/test_scripts folder after moving both checks.


## Codexpro— 2026-10-30 — Role testing setup

### Summary
All testing now lives in the repository-root Testing/ folder with separate User, Agent and Admin suites.
The unified runner passed 312 local assertions plus TypeScript and the action inventory.
Financial checkpoints use actual screen/hook formulas throughout order and recovery stages.
The actual Firebase SDK verified the three configured development profile/PIN identities.
The UI inventory covers 432 source handler sites and 631 role-context/workflow evidence rows.
Native execution is deferred by owner; no browser testing was performed in this pass.

### Already good
- Testing/run.cjs separates fast parallel local checks from sequential development mutations, client reads and the UI gate.
- Testing/Integration/stages.test.cjs verifies before/after sales, expense, chart, product, agent and recovery effects against actual source callbacks.
- Testing/User/, Testing/Agent/, Testing/Admin/ contain separate executable, workflow and screen-action cases.

### Could be better
- Testing/Shared/screen-calculations.cjs deliberately fails if a named screen callback is renamed; update its bindings alongside that source change. This does not replace native component interaction.
- Testing/Native/ currently prepares login/home smoke only; the remaining detailed UI workflows require device validation and stable selectors as they are automated.

### Missing
- Product: mobile/app/agent/dashboard.tsx shows cash collections/completed runs but has no distinct earned-fee or payout tracker; G-MONEY stays unmet.
- Ops: all native/UI evidence is pending by owner choice. Production rules/writers, device push, deployed version/admin-claim proof remain separate open gates.

### Not needed
- Deleted the now-empty mobile/tests tree after moving all retained checks into Testing/.
- Removed duplicate Shared/ui-scenarios.json; each role cases.json is the current workflow source.
