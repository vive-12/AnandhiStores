# Codex Codebase Review and Production Checklist

**Review date:** 2026-10-10  
**Reviewer:** Codex  
**Scope:** Static, line-oriented review of the application source, Firebase configuration/rules/functions, test scripts, and project docs in this repository.  
**Target:** Development nearing production, initially serving about 2,000 users.

## How to use this review

This is a source review, not a claim that every line or button was exercised on a device. The repository contains roughly 75 tracked runtime/configuration files and about 20,000 lines. I traced the main app entry and role routes, service and hook boundaries, Firestore reads/writes/rules, order and recovery transitions, auth flows, and test scripts. Each finding below points to the relevant file/line area so it can be checked directly. Line numbers may move as code changes; use the named function/symbol as the stable locator.

**Priority:** P0 = block production; P1 = fix before broad rollout; P2 = planned hardening/scale improvement. “Existing safeguard” describes what source currently does; “recommended fix” is proposed work and has not been applied by this documentation-only review.

## Executive summary

The app has recognizable customer, admin, and agent workflows, and the order transition helpers have useful transactional checks. The biggest production blocker is that Firestore rules permit unauthenticated reads/writes to sensitive and financially important collections. Client-side checks cannot compensate for those rules. Other high-priority items are resolving Auth/PIN identity consistently, validating order totals on a trusted server, reconciling seeded duplicate user profiles, and removing production access to development diagnostics.

For 2,000 users, the current bounded queries and Firestore listeners are a reasonable starting point if traffic is moderate. The code should still get a small concurrency/load exercise: order IDs and daily statistics currently funnel writes through shared documents. A production launch needs a real staging project and a deploy/rollback checklist, not just a successful local test suite.

## Release blockers and high-priority findings

### P0 — Lock down Firestore and move trusted decisions server-side

**Evidence:** [firestore.rules](firestore.rules), around lines 55, 95, 100, 148, 155, and 159. `users`, `stats_daily`, `counters`, and `agents` rules allow broad read/write. `orders` has unauthenticated create/update/delete allowances. `notifications` allows open creates. `qr_codes` permits writes from unauthenticated users/agents. Several comments describe protection that the actual match expressions do not enforce.

**Impact:** A direct Firestore client can read personal data (including phone/address and legacy PIN fields) and alter roles, orders, agent balances, can/recovery records, sales statistics, QR state, or notifications. A user can bypass every validation in the app UI. A 2,000-user cap does not reduce this risk.

**Fix before production:** Replace broad allows with default-deny, authenticated role- and document-owner-specific reads. Permit only narrowly scoped self-profile changes. Put order creation, assignment, status transitions, payment confirmation, inventory/can ledger changes, stats aggregation, and privileged notifications behind callable Cloud Functions or another trusted backend. Check role claims and ownership inside the backend and in rules as a second layer. Add Firestore Emulator rule tests for anonymous, customer, agent, and admin attempts, including cross-user document IDs and field-level changes. Do not deploy until these tests pass.

**Temporary development exception:** The user previously requested open rules temporarily for testing. That is a development convenience only; confirm the Firebase project/rules before every test and close the exception before any production data or real users are present.

### P0 — Separate development and production Firebase projects

**Evidence:** [mobile/config/firebase.ts](mobile/config/firebase.ts), around lines 12–19, contains a hard-coded project/config fallback. The demo login is development-gated in [mobile/app.config.js](mobile/app.config.js) and [mobile/config/demoCredentials.ts](mobile/config/demoCredentials.ts), but that does not isolate Firestore writes.

**Impact:** A development build or a missing environment variable can point a developer/test action at the production Firebase project. Hidden demo UI is not a data boundary.

**Fix:** Use separate Firebase projects for local/dev, staging, and production. Make project selection explicit per build profile; fail closed if the required configuration is missing. Add a startup-visible environment label in non-production builds, and assert the expected project ID in deploy scripts and smoke tests. Do not put service-account secrets in the mobile app.

### P0 — Make sign-in, PIN resets, and account identity agree

**Evidence:** [mobile/services/auth.ts](mobile/services/auth.ts), around lines 44, 66, 138–151, 191 onward, and 288–329. PIN verification hashes a short PIN with the phone number and compares a profile value client-side. Registration calls Firebase Email/Password Auth. Admin/agent creation and PIN reset depend on callable Functions. [functions/index.js](functions/index.js) resolves Firestore profiles and Firebase Auth users through different lookup paths; the reset path needs an explicit invariant that Auth UID, profile document ID, normalized phone, and role refer to the same person. Duplicate phone/profile records exist in the development data, and selecting the first matching profile is ambiguous.

**Impact:** The reported `auth/operation-not-allowed` result means Firebase Email/Password sign-in is disabled in the current project. The development-only fallback can validate local profile/PIN data in Expo Go, but it is not Firebase Auth and must never become a production authentication mechanism. A weak PIN hash can be brute-forced if exposed; open rules make that worse. Ambiguous duplicate profiles can reset or authenticate the wrong account.

**Fix:** Decide and document the production sign-in provider, enable it in the correct Firebase project, deploy callable functions, and verify the admin custom claim. Normalize phone numbers and enforce uniqueness in a trusted transaction. Migrate duplicate profiles and legacy PIN fields. Do not store a low-entropy PIN verifier in a client-readable profile; use Firebase Auth or a server-side verifier with rate limiting, lockout, and audited reset tokens. Enforce that the caller is authorized to reset the exact UID/phone/role. Add signup, approval, first-login reset, self-reset, admin reset, disabled-account, duplicate-phone, and wrong-role tests.

### P0 — Prevent production access to development routes and logs

**Evidence:** [mobile/app/_layout.tsx](mobile/app/_layout.tsx), around lines 43 and 71, allows `/dev/*` through route-guard logic for a logged-out user. [mobile/app/dev/logs.tsx](mobile/app/dev/logs.tsx) exposes stored logs; [mobile/utils/logger.ts](mobile/utils/logger.ts) persists serialized diagnostic details, while service logs can contain UIDs, order IDs, phones, errors, or stacks. The UI showcase is in [mobile/app/dev/ui.tsx](mobile/app/dev/ui.tsx).

**Impact:** A production user may reach developer screens or see retained personal/order data. A route guard alone is insufficient if the route is registered and the screen itself is callable.

**Fix:** Exclude dev routes and their navigation entries from production builds or guard both layout and screen with `__DEV__` plus role checks. Redact phone/address/token/PIN/order details before persistence; cap and expire logs; disable full-log export in production. Add a production-config test asserting dev screens and demo credentials are absent.

### P0 — Validate order contents, price, and totals on the trusted side

**Evidence:** Customer checkout in [mobile/app/(customer)/index.tsx](mobile/app/(customer)/index.tsx), around lines 368–394, builds `orderItems` from the current catalog but takes `subtotal`, `deliveryFee`, and `total` from `cartTotals`. Unavailable/deleted cart items can be omitted while totals still reflect the original cart. The order service in [mobile/services/orders.ts](mobile/services/orders.ts), around lines 204 onward, writes client-provided order values.

**Impact:** A stale cart, manipulated client, changed product price, or concurrent catalog update can produce a stored order whose line items do not sum to its charged amount. Client validation is bypassable under direct Firestore access.

**Fix:** Send item IDs and quantities only. In a trusted transaction/function, re-read active prices and availability, enforce quantity/minimum/store rules, calculate fees and total, and persist a price snapshot. Reject the whole checkout if any requested line is no longer valid; never silently drop lines while retaining their price. Add tests for stale/deleted/out-of-stock items, price changes, tampered totals, and concurrent checkout.

## Findings by workflow

### Authentication, registration, and profiles

- Login: [mobile/app/auth/login.tsx](mobile/app/auth/login.tsx), [mobile/services/auth.ts](mobile/services/auth.ts). The local demo path is intended for Expo development only. In the current Firebase project, the Auth provider was unavailable, so a passing demo-profile check is not a real Auth sign-in test.
- Signup and approval: [mobile/app/auth/register.tsx](mobile/app/auth/register.tsx), [mobile/app/auth/awaiting-approval.tsx](mobile/app/auth/awaiting-approval.tsx), [mobile/app/admin/profiles.tsx](mobile/app/admin/profiles.tsx). Customer registration currently depends on Email/Password Auth and Firestore profile creation. Ensure new registrations create an admin-visible, durable notification through a trusted function once rules are closed; verify approval and rejection both update Auth/profile state and communicate a clear outcome.
- Reset: [mobile/app/auth/reset-pin.tsx](mobile/app/auth/reset-pin.tsx), `auth.ts` reset/change functions, and [functions/index.js](functions/index.js). Test the complete temporary-PIN flow from admin action to forced user reset and subsequent login, with replay/expiry behavior and identity checks.
- Profile/agent lists: [mobile/services/users.ts](mobile/services/users.ts) and [mobile/hooks/useCustomers.ts](mobile/hooks/useCustomers.ts). `setAgentOnline` can create a skeletal profile if the UID is unknown (around line 115 onward); reject unknown IDs or handle an explicit migration, rather than silently creating ghost agent records.

### Customer pages

- Home/catalog/cart/checkout: [mobile/app/(customer)/index.tsx](mobile/app/(customer)/index.tsx). Its purpose is coherent: show products, construct a cart, validate store/minimum/address prerequisites, then create an order. Fix the stale-cart/total mismatch above. The screen is very large (~2,161 lines); split catalog, cart, and checkout into smaller components/hooks to make error/loading and payment behavior easier to test. It currently maps visible products rather than using a virtualized list; at the present 500-item cap this may be acceptable, but use `FlatList`/pagination if catalog size grows and profile image/render costs on representative devices.
- History: [mobile/app/(customer)/history.tsx](mobile/app/(customer)/history.tsx). Verify empty, loading, permission-denied, cancelled, active, and recovery states. Do not imply a recovery request is a retail sale.
- Account: [mobile/app/(customer)/account.tsx](mobile/app/(customer)/account.tsx). Keep profile, address, PIN, and support actions consistent with backend rules. Support contact values are hardcoded in customer screens; source them from settings or a build config so the displayed contact cannot drift.
- Tracking: [mobile/app/track/[id].tsx](mobile/app/track/[id].tsx). Ensure the authenticated owner can only view their own order and that cancelled/recovery lifecycle states do not lead to a tracking dead end.

### Admin pages and purpose

| Page | Intended responsibility | Review action |
|---|---|---|
| [mobile/app/admin/alerts.tsx](mobile/app/admin/alerts.tsx) | New orders, operations, agent assignment, packing | Fix the split assignment/packing transaction described below; surface listener errors. |
| [mobile/app/admin/analytics.tsx](mobile/app/admin/analytics.tsx) | Sales and operational KPIs | Keep recovery work out of retail sales totals or display a separate recovery metric. |
| [mobile/app/admin/cans.tsx](mobile/app/admin/cans.tsx) | Can recovery requests, collection, reassignment | Keep active recovery visible until collection/completion; label recovery distinctly and prevent counting the same cans both as “out” and “returned.” |
| [mobile/app/admin/inventory.tsx](mobile/app/admin/inventory.tsx) | Product availability/catalog inventory | Move image bytes to Storage; define whether `inStock` is a simple toggle or true quantity inventory. |
| [mobile/app/admin/agents.tsx](mobile/app/admin/agents.tsx) | Agent roster/availability | Do not allow assignment to an unavailable/disabled agent without explicit override. |
| [mobile/app/admin/profiles.tsx](mobile/app/admin/profiles.tsx) | Customer/agent profiles and approvals | Enforce role and identity constraints server-side; expose actionable approval errors. |
| [mobile/app/admin/qr.tsx](mobile/app/admin/qr.tsx) | UPI QR configuration | Enforce one default and the maximum count transactionally/server-side; distinguish manual confirmation from verified payment. |
| [mobile/app/admin/settings.tsx](mobile/app/admin/settings.tsx) | Store settings | Validate values and audit high-impact changes; separate production configuration. |
| Offers (within inventory/admin navigation) | Promotional offer management | Current page exists; ensure enabled dates/eligibility affect customer pricing consistently on server and client. |

Admin area navigation lives in [mobile/app/admin/_layout.tsx](mobile/app/admin/_layout.tsx). The reviewed pages have discernible purposes. A page being present does not itself prove that every action has a recoverable error path; test each mutation with success, permission denial, offline, stale data, and retry.

### Agent and recovery lifecycle

- Agent dashboard and delivery: [mobile/app/agent/dashboard.tsx](mobile/app/agent/dashboard.tsx), [mobile/app/agent/delivery/[id].tsx](mobile/app/agent/delivery/[id].tsx). The pickup checklist persists and locks after delivered, based on current implementation. Verify reassignment, offline transitions, duplicate taps, and reconnect while a transition is in flight.
- Recovery workflows in [mobile/services/orders.ts](mobile/services/orders.ts), around lines 365–504, and admin Cans/Alerts screens. Existing changes retain the delivering agent as the default recovery assignee and keep active recovery on the operational screen. Keep active recovery visible until explicitly collected/completed so admins can reassign a busy agent. Add state-transition tests proving duplicate/stale writes fail, assigned agent and customer ledger agree, and repeated can collection cannot double-adjust the balance.
- Assignment plus packing in [mobile/app/admin/alerts.tsx](mobile/app/admin/alerts.tsx), around lines 226–257, are currently two operations: assignment/notification first, then optional pack transition. If packing fails or is stale, the assignment may already be committed while the UI reports failure. Combine the intended operation in one trusted transaction or report the partial success explicitly and offer a safe retry.
- Retail order notifications in [mobile/services/orders.ts](mobile/services/orders.ts), around lines 269–271, default the target to literal `'admin'` when `adminUid` is absent. Customer checkout does not pass an admin UID. This can create a notification no real admin listens to. Resolve admin recipients server-side and test that placing an order appears in the admin inbox and push stream.
- Admin realtime order-list error handling in [mobile/app/admin/_layout.tsx](mobile/app/admin/_layout.tsx), around lines 82–98, uses an empty error callback. Show a recoverable error/retry state and log a redacted diagnostic. Also inspect the listener error path in [mobile/app/admin/alerts.tsx](mobile/app/admin/alerts.tsx) and make its failure visible.

### Daily totals, KPIs, and can accounting

- Store daily key calculation in [mobile/utils/compute.ts](mobile/utils/compute.ts), around lines 47–65, deliberately uses India Standard Time; tests cover boundary cases. Preserve the same timezone for both writes and reads, and use server timestamps for event time.
- [mobile/services/stats.ts](mobile/services/stats.ts) and [mobile/app/admin/analytics.tsx](mobile/app/admin/analytics.tsx) should define which statuses count as a sale, how cancelled/refunded orders affect totals, and whether recovery is operational activity versus revenue. Keep recovery jobs excluded from retail sales KPIs or show a separate, clearly labeled recovery series.
- Current can balance/recovery changes aim to avoid double-counting cans currently out. Add invariant tests against the customer ledger and operational can totals after every transition and retry, not only the happy-path final value.
- [mobile/components/ui/NotificationBell.tsx](mobile/components/ui/NotificationBell.tsx), around lines 25–68, derives “today” from device-local time while business daily reporting uses IST. Use one shared timezone helper. Its unread-count effect around lines 123–132 can return before updating the previous-count reference when a new unread item appears; check for repeated toast/retrigger behavior. Opening/closing the bell marks items read (around lines 142 and 162); confirm that this is the intended inbox behavior and make it accessible to users.

## Data, performance, and scale (~2,000 users)

### Queries and listeners

- Queries now have bounds in several services, which protects cost and memory. Current caps include approximately 50 customer orders, 100 agent orders, 200 admin orders, up to 500 recovery jobs, 200 role profiles, 100 pending customers, 50 online agents, 500 items, 200 banners, and 50 notifications. Review the concrete query limits in `mobile/hooks/*` and `mobile/services/{orders,items,users,banners,notifications}.ts`.
- A limit is not pagination: old orders/profiles silently disappear beyond the cap. Add cursor pagination for customer history, admin order search/history, recovery history, and profile management. Show “load more”/date filters and distinguish “no records” from “not loaded.” Keep active operational work in a query that cannot be pushed out by old completed items.
- Multiple mounted tabs/screens may subscribe to the same orders (admin layout plus Alerts screen and hooks). Count listeners and Firestore reads in a test session; centralize only where it reduces duplicate streams without creating a fragile global cache. Unsubscribe on unmount/blur and verify no duplicate listener survives role changes.
- [mobile/hooks/useOrder.ts](mobile/hooks/useOrder.ts), around lines 12–25, records a listener error but does not clear `loading`; a failed stream may leave an endless spinner. [mobile/hooks/useAuthUser.ts](mobile/hooks/useAuthUser.ts), around lines 36–39, also needs a clear error/loading contract because [mobile/services/users.ts](mobile/services/users.ts) `listenUser` has no error callback. Standardize hook states and clear stale records when user ID changes.

### Contention and write volume

- [mobile/services/orders.ts](mobile/services/orders.ts), around line 223 onward, increments a shared `counters/orders` document for order IDs. Every concurrent order creation contends on one document. Daily statistics also concentrate writes into `stats_daily/{date}`. For 2,000 users and modest traffic this may be sufficient, but burst traffic can cause retries/latency. Load-test realistic concurrency, transaction retries, and p95 latency; if contention appears, use server-generated IDs or a sharded/distributed counter and an asynchronous aggregation pipeline.
- Keep Firestore transaction work short and side-effect-free. Do not send notifications or external API calls inside a transaction callback that can be retried. Use an outbox/event pattern on the trusted backend with idempotency keys.
- List pages should avoid loading large base64 images in every document. [mobile/app/admin/inventory.tsx](mobile/app/admin/inventory.tsx), around lines 124–139 and 216–251, stores data-URI image content in Firestore. This can approach Firestore document limits, increase reads/egress, and cause slow catalog snapshots. Upload image files to Firebase Storage; persist only a validated Storage path/URL and thumbnail metadata. Add Storage rules (currently no Storage rules are configured in [firebase.json](firebase.json)).
- Catalog uses a bounded list and renders a subset in [mobile/app/(customer)/index.tsx](mobile/app/(customer)/index.tsx). At 500 small products it may be acceptable; Storage-backed thumbnails, memoized rows, and list virtualization become important if the catalog grows or low-end iPhones struggle.
- [mobile/services/outbox.ts](mobile/services/outbox.ts) defines queue/replay logic, and root layout initializes it, but no production action calls `enqueueAction`. It is not evidence that order actions work offline. The persisted queue is not user-scoped/expired/locked, and queue-save failures are swallowed. Either remove/disable the unused offline promise or fully scope by UID, expire/validate queued actions, make replay idempotent, and add offline/reconnect tests before advertising offline support.

### QR and payment integrity

- [mobile/services/qr.ts](mobile/services/qr.ts), around lines 44 and 97–185, generates QR imagery via third-party `api.qrserver.com` with the UPI URI, and checks max/default constraints through client reads/batches. Concurrent admin saves can violate the cap or create multiple defaults. Generate QR locally or through a first-party service; avoid sending payment payload/order references to an unnecessary third party. Enforce QR count/default in a transaction or server function.
- Agent selection of “UPI” is not proof of payment. Until a payment-provider callback or reconciliation exists, label it “payment reported/awaiting verification” and do not count it as a confirmed paid order in financial reporting. Audit any flow that turns a client tap directly into delivered/paid stats.

## UI, responsiveness, and error paths

- Static scan found the core screen actions wired to handlers. Explicit no-op presses appear in the developer UI showcase [mobile/app/dev/ui.tsx](mobile/app/dev/ui.tsx), around lines 52, 54, and 55, where they are mock/disabled controls; [mobile/app/admin/offers.tsx](mobile/app/admin/offers.tsx), around line 349, has an empty backdrop handler to absorb taps. These are intentional-looking cases, but should be removed or clearly disabled from user-visible production UI.
- I did not drive Expo Go on a physical iPhone or tap every button. Therefore button responsiveness is **not device-verified**. Run a role-by-role tap matrix on iOS Expo Go and production-like builds, including slow network, offline, double tap, permission denied, keyboard open, small screen, and long text. For each control verify it has a visible response, loading/disabled behavior, success confirmation, and recoverable failure.
- Keep error/loading/empty states distinct on each screen. A blank list can mean “none,” “still loading,” or “permission denied”; never collapse these into one state. Provide retry controls for failed listeners and mutations. Avoid swallowing errors in callbacks.
- Customer screens and Alerts are very large (~2,161 and ~2,205 lines); agent dashboard and delivery screens are each ~1,398 lines. Split by domain and extract business rules from JSX to services/hooks. This improves readability and targeted testing, and lowers regression risk when order state changes.
- Check accessibility before release: accessible labels/roles for icon-only buttons, dynamic type, color contrast, focus order, touch targets, and VoiceOver announcements for status changes. Include keyboard safe area and modal dismissal checks on iOS.
- Hardcoded support values and inconsistent local-time rendering are sources of confusing UI; route them through settings and one store-time formatter.

## Test and verification plan

### What was run during this review

- `npm test`: passed, 37 assertions.
- `npm run test:order`: passed, 37 assertions. These order suites substantially duplicate one another; running both does not provide twice the scenario coverage.
- Auth smoke script: 3/3 local development profile/PIN checks passed. Firebase Auth sign-in was unavailable and returned `auth/operation-not-allowed` because Email/Password is disabled in the configured Firebase project.
- `npx tsc --noEmit`, `node --check app.config.js`, and `node --check test-auth-smoke.mjs`: passed.
- Expo config inspection: development config enables local demo login; production config omits the demo panel/values.
- A broad `npm run test:all` attempt hit Firestore DNS/network `unavailable` in the sandbox before Auth; relevant suites were then run separately. That network failure is not a pass for the full integration suite.

### Add before launch

1. **Firestore Emulator security tests:** deny anonymous reads/writes and cross-role/cross-user modifications; prove allowed customer self-profile fields and admin actions only.
2. **Function tests:** auth claims, signup/approval, create/assign/transition/cancel/recovery, reset PIN, role checks, idempotency, stale/duplicate transitions, notification fanout, and failures.
3. **Workflow integration:** new customer signup → admin notification/approval → first login/reset → order → assign → pack → deliver → recovery assign/reassign/collect → customer ledger and admin/agent KPIs. Assert before/after values and every persisted document.
4. **UI automation/manual matrix:** customer/admin/agent login and each visible button in Expo Go on iOS, with at least one production-like build. Verify keyboard, offline, retry, loading, and double-tap cases.
5. **Load test:** representative burst and steady-state order creation/listening for 2,000 accounts, measuring Firestore reads/writes, p95 screen update and transaction latency, retries, and cost. Treat these as measured values, not assumptions.
6. **Release smoke:** production Firebase project ID, Auth provider, deployed functions and claims, closed rules, indexes, Storage rules, no demo credentials/dev routes/log viewer, crash/error reporting, backup/export and rollback procedure.

The current Node suites use local/in-memory assertions and do not validate deployed Firestore rules, callable Functions, UI taps, Storage, or production sign-in. Keep these limitations visible in CI output.

## Documentation and maintenance

- [mobile/AUDIT.md](mobile/AUDIT.md) describes an older app structure and stale security assumptions; refresh it or mark it as archived so it is not mistaken for a current audit.
- [mobile/PROJECT_CONTEXT.md](mobile/PROJECT_CONTEXT.md) says Cash on Delivery only and contains service/status descriptions that conflict with current UPI QR and recovery behavior. Align it with implemented flows.
- Historical entries in [worklog.md](worklog.md) report older test totals such as 186 assertions. Keep those labeled as historical; today’s current suites are 37 assertions each.
- Turn on formatter/linter and TypeScript strictness incrementally (`mobile/tsconfig.json` currently has `strict: false`). Add CI gates for typecheck, unit suites, rules emulator tests, production Expo config checks, and secret scanning.
- Keep a data migration checklist for existing duplicate phone profiles, legacy PIN fields, stale assignments, recovery records, and daily total keys before enforcing the new schema/rules.

## Suggested order of work

1. **Before any production data:** separate Firebase projects; close rules; deploy trusted order/auth/stat functions; resolve duplicate users; enable the intended Auth provider; remove production dev/demo/log routes.
2. **Before pilot users:** fix server-side checkout totals and admin notification recipients; make assignment/packing outcome atomic or explicitly recoverable; add recovery/KPI/can invariants; add visible listener errors/loading recovery.
3. **Before public launch:** move images to Storage, add pagination and telemetry, validate QR defaults and payment states, run rule/function/UI tests, and complete a 2,000-account traffic simulation with observed costs/latency.
4. **During rollout:** staged percentage release, monitor sign-in failures, transaction retries, listener errors, checkout conversion, duplicate orders, recovery age/reassignment, and Firestore spend; keep rollback builds and data repair steps ready.

## Overall assessment

The primary customer/admin/agent concepts are coherent, and recent order/recovery work has meaningful local test coverage. The application is **not production-ready while broad unauthenticated Firestore rules remain active and client-side data is treated as trusted**. Resolve the P0 items and add emulator-backed security/integration coverage before connecting real customer data. For a 2,000-user initial audience, there is no need to prematurely build a complex distributed platform: secure the trust boundary first, then measure listener/read volume and shared-document contention under realistic bursts.
