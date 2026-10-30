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
