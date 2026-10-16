# PERMISSIONS_TEST.md — Firestore Security Rules & Permissions Matrix

This document defines the test verification matrix for production Firestore security rules implemented in [`firestore.rules`](file:///d:/Vivek/Can/firestore.rules).

---

## 1. Permissions Matrix

| # | Role | Collection | Action | Target / Condition | Expected Result | Rationale |
|---|---|---|---|---|---|---|
| **P-01** | Unauthenticated | `users` | Read | Query single user by `phone` | **ALLOW** | Needed by phone + PIN login flow prior to Firebase Auth sign-in |
| **P-02** | Unauthenticated | `users` | Write | Create or modify user doc | **DENY** | Unauthenticated writes strictly forbidden |
| **P-03** | Customer | `users` | Read | Read own document (`request.auth.uid == userId`) | **ALLOW** | Customer reads own profile |
| **P-04** | Customer | `users` | Read | Read other customer's document | **DENY** | Privacy isolation between users |
| **P-05** | Customer | `users` | Update | Update own address or name | **ALLOW** | Allowed profile fields |
| **P-06** | Customer | `users` | Update | Update own `role` or `status` | **DENY** | Role escalation prevented by `request.resource.data.role == resource.data.role` |
| **P-07** | Customer | `users` | Update | Update own `isOnline` | **DENY** | `isOnline` restricted to agents |
| **P-08** | Agent | `users` | Update | Update own `isOnline` | **ALLOW** | Agents clock in / out |
| **P-09** | Admin | `users` | All | Read, create, update, delete any user | **ALLOW** | Admin full access for approval, PIN resets, blocking |
| **P-10** | Unapproved Customer | `items` | Read | Read catalogue | **DENY** | Pending customers cannot browse catalogue until approved |
| **P-11** | Approved Customer | `items` | Read | Read catalogue | **ALLOW** | Browse groceries and water cans |
| **P-12** | Customer / Agent | `items` | Write | Add, edit, or delete items | **DENY** | Only admin manages inventory |
| **P-13** | Admin | `items` | Write | Create, edit, soft-delete items | **ALLOW** | Full inventory control |
| **P-14** | Customer | `settings` | Read | Read store hours, delivery fees | **ALLOW** | Live display in customer cart |
| **P-15** | Customer | `settings` | Write | Modify store settings | **DENY** | Admin only |
| **P-16** | Customer | `orders` | Create | Create order with `status: 'placed'`, own `customerId`, and `COD` | **ALLOW** | Standard checkout flow |
| **P-17** | Customer | `orders` | Create | Create order with status other than `'placed'` | **DENY** | Status machine integrity |
| **P-18** | Customer | `orders` | Read | Read own orders (`customerId == auth.uid`) | **ALLOW** | Order tracking & history |
| **P-19** | Customer | `orders` | Read | Read another customer's order | **DENY** | Cross-customer data isolation |
| **P-20** | Customer | `orders` | Update | Cancel own order while status is `'placed'` | **ALLOW** | Customer cancellation permitted |
| **P-21** | Customer | `orders` | Update | Cancel order after it is `'packed'` or `'out_for_delivery'` | **DENY** | Cannot cancel once store processes |
| **P-22** | Agent | `orders` | Read | Read assigned orders (`agentId == auth.uid`) | **ALLOW** | Agent dashboard queries |
| **P-23** | Agent | `orders` | Read | Read unassigned or other agent's orders | **DENY** | Agent only sees assigned tasks |
| **P-24** | Agent | `orders` | Update | `'packed'` ➔ `'out_for_delivery'` ("Mark Picked Up") | **ALLOW** | Valid status transition |
| **P-25** | Agent | `orders` | Update | `'out_for_delivery'` ➔ `'delivered'` ("Mark Delivered") | **ALLOW** | Valid status transition |
| **P-26** | Agent | `orders` | Update | Modify items, address, or customer total | **DENY** | `affectedKeys().hasOnly(['status', 'pickedUpAt', 'deliveredAt', 'statusHistory', 'updatedAt'])` |
| **P-27** | Admin | `orders` | All | Assign agent, mark packed, cancel, reassign | **ALLOW** | Admin full order management |
| **P-28** | Recipient | `notifications` | Read | Read notifications where `toUid == auth.uid` | **ALLOW** | In-app alerts |
| **P-29** | Other User | `notifications` | Read | Read another user's notifications | **DENY** | Private notification delivery |
| **P-30** | Recipient | `notifications` | Update | Mark notification `read: true` | **ALLOW** | `affectedKeys().hasOnly(['read'])` |
| **P-31** | Agent | `stats_daily` | Update | Increment stats upon delivery | **ALLOW** | Synchronous stats updates in delivery batch |
| **P-32** | Customer | `stats_daily` | Read | Read store financial/delivery stats | **DENY** | Business analytics restricted to admin |
| **P-33** | Signed-in User | `counters` | Read/Write | Increment order counter in transaction | **ALLOW** | Atomic order sequence generator |

---

## 2. Deployment Instructions

### Option A: Firebase CLI (Recommended)
1. Ensure the Firebase CLI is installed:
   ```bash
   npm install -g firebase-tools
   ```
2. Log in and select the project:
   ```bash
   firebase login
   firebase use <your-firebase-project-id>
   ```
3. Deploy Firestore security rules and composite indexes:
   ```bash
   firebase deploy --only firestore
   ```

### Option B: Firebase Console (Manual Copy-Paste)
1. Open the [Firebase Console](https://console.firebase.google.com).
2. Navigate to **Firestore Database** ➔ **Rules** tab.
3. Replace the test rules with the entire content of [`firestore.rules`](file:///d:/Vivek/Can/firestore.rules).
4. Click **Publish**.
5. Navigate to **Firestore Database** ➔ **Indexes** tab.
6. Verify that the composite indexes listed in [`firestore.indexes.json`](file:///d:/Vivek/Can/firestore.indexes.json) are created or created automatically when clicking links from any initial Firestore queries in the log.
