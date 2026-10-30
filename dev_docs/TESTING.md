# Repeatable testing before changes and builds

## Commands

Run from mobile/ (or use npm --prefix mobile from the repository root).

| Command | Use | Real Firebase data |
| --- | --- | --- |
| npm test | All local role, integration, screen-formula and utility checks; TypeScript; action inventory | No |
| npm run test:user | Focus User checks plus type/inventory validation | No |
| npm run test:agent | Focus Agent checks plus type/inventory validation | No |
| npm run test:admin | Focus Admin checks plus type/inventory validation | No |
| npm run test:client | Actual Firebase SDK profile/PIN reads for all three configured identities | Read-only |
| npm run test:dev | All local checks, actual client check, then labelled live development service flows | Yes: orders, recoveries, statistics and notices |
| npm run test:auth:live | Separate Firebase Auth smoke; demo profile verification is not Auth account proof | Sign-in/read only |
| npm run test:prebuild | Local + connected development checks + current-source UI evidence gate | Yes; fails if UI evidence is pending |
| npm run test:actions:update | Regenerate source/role action inventories after changing controls | No |
| npm run test:ui:report | Generate the interactive device-evidence checklist | No app actions executed |
| npm run test:ui:import -- <exported-json> | Import observed results from the checklist | No |
| npm run test:ui:gate | Check that every expected UI row passed for this exact source revision | No |

Routine npm test uses up to three isolated local processes. Current role/logic checks take seconds; TypeScript took about 42 seconds on this computer. The first actual client probe took about 55 seconds on this network. Live mutations remain sequential to prevent simultaneous reset/settings/payee operations from corrupting each other's expectations. --verbose prints individual assertions.

## Identities and data

One ignored root .env holds all credentials and the three canonical profile IDs. The User is Shivani, Admin is Vivek and Agent is Suresh. Local tests use fake identities and an in-memory database. Explicit test:dev uses those three real development profiles with a Firebase CLI token. It changes temporary settings/PIN/status values, verifies effects, then restores configuration/known credentials in finally. It keeps operational balances if an unfinished test run remains, rather than hiding work. Test orders/QR copies use a run marker and remain for later owner cleanup. No actual payment, call, WhatsApp message, OTP or deployment is required.

The live adapter is development-only and locked to project anandhi-stores. It loads the actual services but uses IAM-backed Firestore REST transactions; it is not a native UI or deployed client-permission test. The actual client SDK check is independent. Production Auth/rules/claims, all-apps-closed push, native permissions and release evidence remain separate gates.

A forced process kill can prevent finally from restoring temporary configuration. Let a connected run finish; if interrupted, inspect the retained run IDs and re-check original PINs, availability, settings and QR default. Do not assume an interrupted run restored state.

## What is checked at each order stage

Integration/stages.test.cjs captures baseline, placed, assigned, packed, pickup, retail delivery, recovery pickup, partial collection, ten simulated days later, full recovery, UPI delivery and cancellation. Each checkpoint evaluates the actual screen/hook callbacks and checks admin revenue, COD/UPI, retail/recovery counts, customer expense/profile totals and chart bars, agent deliveries/COD, and product rankings. It imports the formula from source instead of copying a second implementation.

Admin/User product ranks have different meanings: admin top products use delivered quantities; customer top products rank by item spending. Customer expense totals include delivery fees while category/item spend is merchandise only. Recovery must never inflate either retail purchase spending or retail delivery/sales totals.

The agent's current sheet presents cash collections and completed runs. An agreed agentFee is stored on delivered orders, but a rendered earned-fee/payout tracker is not currently implemented. That remains an explicit product/UI gap, not a passed earnings check.

## Every UI control

Each role folder has cases.json and generated ui-actions.json. The source inventory includes JSX event handlers in screens and shared components; shared controls require evidence for each role. It does not prove dynamic rows, gestures, OS dialogs or visual layouts automatically. Workflow cases require valid/invalid, cancel/back, repeated-tap, error/offline and cross-role observations where applicable.

1. Run test:actions:update after changing handlers and inspect the diff in TEST_ACTIONS.md and the role action files.
2. Run test:ui:report. Open the generated .verify/tests/ui-checklist.html to record checks performed on the actual phone/emulator. This HTML is a reporting form, not browser testing of the app.
3. Enter tester, device/OS/build, actual observation, related order/run ID and evidence reference. Do not enter passwords or tokens.
4. Export and import the evidence JSON. Partially filled evidence can be saved, but pending/failed rows still block the gate.
5. Run test:prebuild before sharing a build. Source changes invalidate old evidence. A green local suite alone never means every UI action passed.

The owner explicitly deferred device execution. Current 631 UI entries remain pending until observed; no check is auto-passed because its handler exists.

## Reports

Each runner invocation writes ignored .verify/tests/<timestamp>/summary.json and report.html. Stage effects and role observations are saved beside them. .verify/tests/latest.json points to the latest invocation and includes its mode; a read-only client run must not be mistaken for a complete local/pre-build run. Reports contain test outcomes and labelled record IDs, not a Firebase backup or credential export.

The worklog retains open native/device, restricted-write emulator, deployment/version and release evidence. No new paid testing service or cloud runner was enabled.
