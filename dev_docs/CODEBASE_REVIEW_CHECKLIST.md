# Codebase review and behavior checklist

Review scope: admin screens, their navigation/actions, order/recovery/auth/statistics services and hooks, agent completion flow, Firebase list queries and their indexes. Demo login credentials and the in-app admin seed screen and script have been removed at the project owner's request. The owner chose to keep phone + PIN for now; SMS OTP is deferred to avoid per-SMS charges. Firestore rules are temporarily left open at the owner's request.

## Implemented in this review

- [x] **Order state changes** — read the current order inside a Firestore transaction, validate the actor/status transition against that current state, and atomically write status history, notifications, balance changes, daily metrics and generated recovery work. Repeated/stale delivery actions cannot count twice.
- [x] **Agent assignment** — read the current order transactionally; reject missing, completed, cancelled and regular-order-in-delivery assignments. Recovery runs may be reassigned while en route, so an admin can move a busy agent’s run.
- [x] **Automatic recovery** — a retail delivery that leaves cans outstanding creates a zero-value recovery run for the same customer and delivering agent. It appears in the dedicated Cans active-run queue until delivered/cancelled.
- [x] **Manual recovery assignment** — create a run for the customer’s balance after subtracting cans already on active recovery runs; the new run is assigned to the selected agent.
- [x] **Can balance display** — count active assigned cans plus only the remaining unscheduled balance, so the Cans screen does not add the same cans twice.
- [x] **Collection boundaries** — a retail delivery records returns only up to the fresh cans delivered in that order; previously assigned cans remain on their recovery job. A recovery run can collect up to its own outstanding quantity.
- [x] **Recovery reassignment** — active runs remain visible in the Cans screen and can be reassigned, including while marked out for delivery.
- [x] **Sales reporting** — recovery completions and cancellations use separate daily counters. Recovery work is excluded from revenue, retail order count, payment breakdown, item-sales totals and retail admin-order list. Recovery completions are shown separately in Analytics.
- [x] **Agent KPI accounting** — recovery work no longer increments the retail delivery count or cash collection totals.
- [x] **Customer/agent retail histories** — customer purchase totals and the agent’s retail-delivery KPI/history exclude recovery jobs; active recovery work remains in the agent’s assigned/out-for-delivery workload.
- [x] **Store date boundaries** — daily-stat document IDs and analytics/agent date comparisons use Asia/Kolkata date keys. Time labels explicitly format in Asia/Kolkata.
- [x] **Bounded listeners** — customer/agent/admin orders, recovery runs, users, pending users, online agents, banners, items, notifications, QR codes and recent daily stats use query limits. Added the recovery query’s composite index.
- [x] **PIN/Auth alignment source** — admin PIN reset and agent creation use Firebase callable functions, which update Firebase Auth and the matching profile together. Removed the old direct Firestore PIN-reset helper and the client approval helper that wrote plaintext PINs.
- [x] **Legacy-agent PIN reset support** — callable reset/change functions can match legacy `agents/{id}` records by phone while verifying the signed-in Auth email for self-service changes.
- [x] **Authentication failure handling** — registration no longer creates a local-only UID when Firebase Auth fails; login no longer silently continues after both Auth sign-in and account creation fail.
- [x] **Auth persistence** — Firebase Auth uses React Native AsyncStorage persistence, and callable account operations wait for Firebase Auth restoration before sending requests.
- [x] **Temporary PIN lifecycle** — Admin reset/approval and agent creation mark the PIN temporary. Route guard sends the user to the reset screen until they choose a new PIN; admin success messages do not reveal the PIN.
- [x] **Signup admin alert** — After profile creation, the client writes an in-app notification to each of the bounded set of admin profiles. Notification failure does not turn a successful registration into a false failure.
- [x] **Auth setup diagnostics** — Login now distinguishes a Firebase Auth project/provider configuration error from an incorrect PIN or ordinary account recovery failure.
- [x] **PIN change route** — customer Account and agent dashboard link to a signed-in change-PIN screen; it verifies the current PIN and updates Firebase Auth plus the profile hash.
- [x] **Refresh controls** — the order hooks now expose a real listener reload. Admin order, profile, agent and recovery pull-to-refresh actions reconnect listeners; customer order history reloads its listener too.
- [x] **Recovery error path** — the Cans screen shows a retry state when either the customer or recovery listener fails.
- [x] **Admin alert navigation** — “View orders” dismisses the new-order dialog and opens the admin order screen.
- [x] **Recent-order honesty** — the dashboard’s bounded order count is labeled “Recent Orders (max 200)”.
- [x] **No-op callback scan** — reviewed admin button and press handlers. The no-op press handler in Offers is the modal’s touch absorber; the no-op controls in `mobile/app/dev/ui.tsx` are visual component samples, not production actions.

## Admin page purpose and action flow

- [x] **Dashboard / Alerts** — monitor recent retail orders, assign/reassign agents, pack, cancel, create manual orders and open order details. Retail order metrics exclude recovery work; recovery workload still contributes to agent-busy sorting.
- [x] **Analytics** — report retail revenue, payment mix, retail order counts, cancelled retail orders, item quantities and fulfillment rates; can-recovery completions/cancellations are labeled separately.
- [x] **Profiles** — review/approve/block customers, reset PINs through the trusted function, call customers, inspect retail order history and open the agent-management screen.
- [x] **Agents** — create Auth-backed agent accounts, reset PINs, inspect assignments/performance and call agents.
- [x] **Inventory** — manage catalog and stock; the inventory page links to Offers for promotional content.
- [x] **Offers** — manage active promotional banners and linked catalog items.
- [x] **Cans** — show unscheduled customer can balances and all active recovery runs; dispatch and reassign collection jobs.
- [x] **QR** — add/edit/select/delete UPI payment QR entries, preview them and select a default.
- [x] **Settings** — control store availability, hours, delivery settings and delivery slots.
- [x] **Admin navigation** — tab bar exposes the main operational pages; hidden Agents, Offers and Settings routes are linked from Profiles, Inventory and the dashboard menu respectively. Swipe navigation moves among the main tabs.

## Deployment and owner decisions still required

- [ ] Deploy `functions/` to Firebase. Functions are not deployed by this local code review.
- [ ] Install the Functions dependencies from `functions/package.json` before deployment.
- [ ] Grant the existing admin Auth account the `admin: true` custom claim using the trusted Admin SDK script in `functions/scripts/set-admin-claim.js`, then sign out and back in. The callable PIN reset and agent-create operations reject callers without this claim.
- [ ] Replace open Firestore rules. The current client-side phone lookup requires unauthenticated user reads; close access only after moving PIN verification behind a trusted server endpoint. Owner requested to keep these rules open temporarily.
- [x] Remove visible sample credentials and the in-app admin seed screen. Remove the fixed-credential admin seed script as well.
- [ ] Revisit SMS verification only if the owner accepts per-SMS charges; the current phase keeps phone + PIN and uses in-app admin notifications.
- [ ] Add cursor pagination if expected order history can exceed 200 retail records or the recovery queue can exceed 500 records. The listeners are bounded now; records beyond those caps are not reachable in these screens yet.
- [ ] Exercise the flows against Firebase after Functions are deployed: register/approve/login, reset a customer and agent PIN, create an agent, concurrent delivery taps, auto-recovery assignment/reassignment/completion, can balance reconciliation, and Analytics across IST midnight/week/month boundaries.
- [ ] Exercise the signup notification against the connected Firestore project and the one-time PIN forced-change path against deployed Functions and a real Auth account; current local order simulation does not cover Auth or notifications.
- [ ] Resolve existing legacy records with plaintext PINs and reconcile any recovery runs created before the new queue/balance logic.

## Review checks performed

- [x] Inspected changed code paths and screen handlers; searched admin/app/service code for TODO/FIXME and empty callbacks.
- [x] `git diff --check` completed without whitespace errors.
- [x] Parsed `firebase.json`, `firestore.indexes.json` and `functions/package.json` as JSON.
- [ ] Runtime, emulator, mobile-device and deployment checks were not run in this review.
