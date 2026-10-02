# AUDIT.md — Anandhi Stores Codebase Audit

> Generated: 2026-09-30 | Auditor: Antigravity (P1 task)
> No code was changed during this audit.

---

## 1. Folder and Route Structure

`
mobile/
├── app/
│   ├── _layout.jsx          Root Stack navigator (no auth guard)
│   ├── index.jsx            Role-picker home screen (Customer / Agent / Admin)
│   ├── (customer)/
│   │   ├── _layout.jsx      Customer Tabs (Order, History, Account) — NO auth guard
│   │   ├── index.jsx        Order/Home screen (places orders, shows inventory)
│   │   ├── history.jsx      Order history
│   │   └── account.jsx      Customer account / address
│   ├── admin/
│   │   ├── _layout.jsx      Admin Tabs (Dashboard, Analytics, Profiles, Agents, Inventory, Offers) — NO auth guard
│   │   ├── alerts.jsx       Admin Dashboard (stats, order list, assign agent)
│   │   ├── analytics.jsx    Analytics placeholder (static/empty)
│   │   ├── profiles.jsx     Customer profiles — approve, reset PIN, assign agent
│   │   ├── agents.jsx       Agent management — add agent, reset PIN, online toggle
│   │   ├── inventory.jsx    Item management (add/edit/delete — hard delete, not soft)
│   │   ├── offers.jsx       Banners / offers management
│   │   └── cans.jsx         Water-can specific screen
│   ├── agent/
│   │   ├── dashboard.jsx    Agent order list + ONLINE toggle
│   │   └── delivery/        (directory — delivery detail screens)
│   ├── auth/
│   │   ├── login.jsx        Customer login (phone + PIN)
│   │   ├── agent-login.jsx  Agent login (phone + PIN)
│   │   ├── register.jsx     Customer registration
│   │   └── reset-pin.jsx    PIN reset flow
│   └── track/               (directory — order tracking)
├── config/
│   └── firebase.js          Firebase init (Firestore only, no Auth SDK)
├── utils/
│   ├── logger.js            Custom log wrapper
│   └── openMap.js           Map launch utility
├── app.json                 Expo config (SDK 57, name "AquaRush", slug "aquarush")
└── package.json
`

### Key observations
- App name in app.json is still **"AquaRush"** / slug **"aquarush"** — needs renaming to Anandhi Stores.
- The project uses **.jsx** throughout; PROJECT_CONTEXT.md specifies **TypeScript**. Migration needed.
- No /types, /services, /hooks, /components/ui, or /theme folders exist yet.
- Route groups do not follow PROJECT_CONTEXT.md spec: (customer) exists but (agent) and (admin) are plain folders (not route groups).
- The 	rack/ directory exists but is not documented in the build guide's expected routes.

---

## 2. Expo SDK and Installed Packages

| Item | Value |
|---|---|
| Expo SDK | **57.0.0** |
| React Native | 0.86.3 |
| React | 19.2.3 |
| expo-router | ~57.0.22 |
| firebase | ^12.19.0 |
| @react-native-async-storage/async-storage | ^1.23.1 |
| expo-location | ~57.0.19 |
| expo-notifications | ~57.0.21 |
| react-native-maps | 1.27.2 |
| expo-av | ^16.0.8 |
| axios | ^1.20.0 |
| @expo/vector-icons | ^15.0.2 |

### Missing packages (required by PROJECT_CONTEXT.md)
- react-native-reanimated
- react-native-gesture-handler
- @gorhom/bottom-sheet
- expo-image
- expo-haptics
- lucide-react-native + react-native-svg
- @expo-google-fonts/manrope
- expo-font
- @react-native-community/netinfo
- zustand

---

## 3. Authentication — How Login Works Today

### Customer Login (uth/login.jsx)
1. Takes phone + PIN from user input.
2. Calls getDocs (one-shot, not real-time) on collection(db, 'users') filtered by phone.
3. Compares userData.pin !== pin — **PIN is stored in plain text in Firestore** and compared on the client side.
4. On success, stores the full user object in AsyncStorage.setItem('user', JSON.stringify(userData)).
5. Navigates to /(customer).
6. Handles status === 'pending_pin_reset' → redirects to reset-pin.

### Agent Login (uth/agent-login.jsx)
1. Queries collection(db, 'agents') — **a separate collection from users**.
2. Same plain-text PIN comparison: gentData.pin !== pin.
3. Stores agent in AsyncStorage.setItem('agent', ...).
4. Navigates to /agent/dashboard.

### Admin Login (pp/index.jsx)
1. PIN is **hard-coded** as const ADMIN_PIN = '1234' in the JS file.
2. No Firestore query. No session persistence.
3. The admin can re-enter the app from the home screen at any time.

### 🚨 Critical security flags
1. **Plain-text PINs in Firestore** (users and agents collections) — compared client-side. Anyone with Firebase credentials can read all PINs.
2. **No Firebase Auth** is used — the app does not use irebase/auth. Session is purely AsyncStorage.
3. **Hard-coded admin PIN** in source code.
4. **No route guards** — any screen in (customer)/, dmin/, or gent/ is reachable without authentication by navigating directly (deep link or programmatic push).

---

## 4. Firestore Collections in Use

| Collection | Fields seen in code | Where read/written |
|---|---|---|
| users | id, phone, pin (plain text), name, status (pending_review, pending_pin_reset, ctive, pproved), address, assigned_agent, created_at | login.jsx, profiles.jsx, account.jsx, register.jsx |
| gents | id, phone, pin (plain text), name, is_available, created_at | agent-login.jsx, agents.jsx, profiles.jsx, alerts.jsx |
| orders | id, user_id, customer_name, customer_phone, customer_lat, customer_lng, delivery_address, status (placed, ssigned, out_for_delivery, delivered), agent_id, placed_at, items[], cod_amount, type (order\|ecovery), pending_cans_to_collect | index.jsx (customer), alerts.jsx, agent/dashboard.jsx, history.jsx |
| inventory | id, name, category, price, unit, in_stock, (no isDeleted field) | inventory.jsx (admin), customer/index.jsx |
| offers | id, title, image_url, is_active | offers.jsx (admin), customer/index.jsx |
| (implied) cans | unknown — cans.jsx exists | cans.jsx |

### Collections in PROJECT_CONTEXT.md that do NOT yet exist
- items (PROJECT_CONTEXT.md spec) — currently called inventory
- settings/store
- 
otifications/{id}
- anners/{id} (currently called offers)
- stats_daily/{YYYY-MM-DD}
- counters/orders

### Field naming mismatches
| Existing field | PROJECT_CONTEXT.md target | Notes |
|---|---|---|
| user_id | customerId | On orders |
| customer_name | customerName | camelCase target |
| gent_id | gentId | On orders |
| is_available | isOnline | On agent/user docs |
| in_stock | inStock | On items |
| placed_at | createdAt | Timestamp field names |
| status: 'assigned' | Not a valid status — only placed/packed/out_for_delivery/delivered/cancelled | Extra state in current code |

---

## 5. Existing Screens by Role

### Customer
| Screen | File | Status |
|---|---|---|
| Login | uth/login.jsx | ✅ Works, PIN plain text |
| Register | uth/register.jsx | ✅ Works |
| Reset PIN | uth/reset-pin.jsx | ✅ Works |
| Home / Order | (customer)/index.jsx | ⚠️ getDocs (one-shot), no real-time listeners, no cart persistence, no theming |
| Order History | (customer)/history.jsx | ⚠️ exists, likely one-shot |
| Account | (customer)/account.jsx | ⚠️ exists |

### Agent
| Screen | File | Status |
|---|---|---|
| Agent Login | uth/agent-login.jsx | ✅ Works, separate agents collection |
| Dashboard | gent/dashboard.jsx | ⚠️ uses onSnapshot but queries gents collection separately; status machine has extra "assigned" state; no TypeScript |
| Delivery detail | gent/delivery/ | Unknown — not read |

### Admin
| Screen | File | Status |
|---|---|---|
| Role picker (with PIN) | pp/index.jsx | 🚨 PIN hard-coded |
| Dashboard | dmin/alerts.jsx | ⚠️ uses onSnapshot on full orders collection (no limit()); functional |
| Analytics | dmin/analytics.jsx | ⚠️ Likely placeholder |
| Profiles | dmin/profiles.jsx | ⚠️ getDocs (one-shot); approve, reset PIN, assign agent work |
| Agents | dmin/agents.jsx | ⚠️ exists |
| Inventory | dmin/inventory.jsx | 🚨 Uses hard-delete (deleteDoc); no soft delete; getDocs one-shot |
| Offers / Banners | dmin/offers.jsx | ⚠️ exists |
| Cans | dmin/cans.jsx | Water-can specific — may be superseded by grocery model |

### Reusable components
- None in a shared /components folder. All UI is inline per screen.
- utils/openMap.js and utils/logger.js are shared utilities that should be preserved.

---

## 6. Gap List vs PROJECT_CONTEXT.md

| # | Gap | Priority |
|---|---|---|
| G1 | No Firebase Auth — sessions are AsyncStorage-only, no real UID | 🔴 Critical |
| G2 | PINs stored plain-text, compared client-side | 🔴 Critical |
| G3 | Admin PIN hard-coded in source | 🔴 Critical |
| G4 | No route guards — any screen accessible without login | 🔴 Critical |
| G5 | No TypeScript — entire codebase is JSX | 🟡 High |
| G6 | Agents in separate gents collection instead of users | 🟡 High |
| G7 | Status machine has extra ssigned status not in spec | 🟡 High |
| G8 | Inventory hard-deletes items; isDeleted field missing | 🟡 High |
| G9 | No /services or /hooks — all Firestore calls inside screens | 🟡 High |
| G10 | No /theme — every screen has inline hard-coded colors/spacing | 🟡 High |
| G11 | No settings/store collection | 🟡 High |
| G12 | No 
otifications collection or logic | 🟡 High |
| G13 | No stats_daily or counters/orders | 🟡 High |
| G14 | No orderNo (AS-XXXX) — orders use Firestore auto-IDs | 🟠 Medium |
| G15 | No Zustand cart store | 🟠 Medium |
| G16 | No skeleton loaders, bottom sheets, or Reanimated | 🟠 Medium |
| G17 | Customer home uses getDocs (one-shot) — not real-time | 🟠 Medium |
| G18 | Admin orders query has no limit() | 🟠 Medium |
| G19 | Field names are snake_case; target is camelCase | 🟠 Medium |
| G20 | App name/slug still "AquaRush" in app.json | 🟢 Low |
| G21 | Firebase config (API key etc.) hard-coded, not env vars | 🟢 Low |
| G22 | No Manrope font | 🟢 Low |
| G23 | No offline banner or outbox | 🟢 Low |

---

## 7. Recommended Migration Order

The guide's P-order is correct. Within P3 and P4, here is the suggested sequencing to avoid breaking working screens:

1. **P0** ✅ — PROJECT_CONTEXT.md created
2. **P1** ✅ — This audit (no code changes)
3. **P2** — Design system + shared components (additive; won't break screens)
4. **P3** — Data layer: types, services, hooks in parallel with existing screens. Refactor one screen at a time to use services.
5. **P4** — Auth overhaul: introduce Firebase Auth SDK, migrate sessions, add route guards.
   - ⚠️ **Ask before changing PIN storage.** Recommend: hash PINs with a one-way function (e.g. SHA-256 client-side before storing) or move to a Cloud Function verifier. Do not simply migrate plain text to a new collection.
6. Continue P5–P24 in order.

---

## 8. Questions / Ambiguities to Resolve Before Coding

1. **PIN hashing strategy**: Do you want to migrate to a safer PIN storage approach now (P4), or handle it after the main build is stable? What existing PINs are set in Firestore that we must not break?
2. **gents vs users collection**: The current code uses a separate gents collection. Migrating agents into users (as PROJECT_CONTEXT.md requires) will break the current agent login. Shall we migrate in P4 or sooner?
3. **ssigned status**: The current order flow uses a placed -> assigned -> out_for_delivery -> delivered machine. PROJECT_CONTEXT.md removes ssigned in favour of placed -> packed -> out_for_delivery -> delivered. Any live orders in ssigned status will need migrating. Is the database currently empty or do we have real orders to preserve?
4. **cans.jsx**: The water-can recovery flow (collecting empty cans) is a separate order type. Is this feature still required, or does the grocery model fully replace it?
5. **TypeScript migration**: Shall we convert files to .tsx/.ts as we touch them (incremental), or do a bulk rename first?
