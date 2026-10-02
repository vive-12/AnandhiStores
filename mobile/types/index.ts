// types/index.ts — All shared TypeScript types for Anandhi Stores
// Matches the DATA MODEL in PROJECT_CONTEXT.md exactly.
// Import from here: import type { User, Order, ... } from '../types';

import { Timestamp } from 'firebase/firestore';

// ─── User ────────────────────────────────────────────────────────────────────

export type UserRole   = 'customer' | 'agent' | 'admin';
export type UserStatus = 'pending' | 'approved' | 'blocked';

export interface Address {
  door:     string;
  street:   string;
  locality: string;
  city:     string;
  landmark: string;
  lat:      number | null;
  lng:      number | null;
}

export interface User {
  id:           string;           // Firestore doc ID (= Firebase Auth UID)
  role:         UserRole;
  name:         string;
  first_name?:  string;
  last_name?:   string;
  phone:        string;
  pin?:         string;           // hashed in P4 — plain text until migration
  plainPin?:    string;           // fallback plain PIN
  status:       UserStatus;
  address?:     Address;
  isOnline?:    boolean;          // agents only
  pendingCans?: number;           // water can recovery tracking
  createdAt?:   Timestamp | string | any;
}

// ─── Item ─────────────────────────────────────────────────────────────────────

export interface Item {
  id:        string;
  name:      string;
  category:  string;
  unit:      string;
  price:     number;
  inStock:   boolean;
  isDeleted: boolean;          // soft-delete — never hard-delete
  sortOrder: number;
  imageUrl?: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── Order ───────────────────────────────────────────────────────────────────

export type OrderStatus =
  | 'placed'
  | 'packed'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export type OrderSource = 'customer' | 'admin_manual';

export type SlotType = 'asap' | 'scheduled';

export interface OrderSlot {
  type:  SlotType;
  label: string;
}

export interface OrderItem {
  itemId:    string;
  name:      string;
  unit:      string;
  price:     number;
  qty:       number;
  lineTotal: number;
}

export interface AddressSnapshot {
  door:     string;
  street:   string;
  locality: string;
  city:     string;
  landmark: string;
  lat:      number | null;
  lng:      number | null;
}

export interface StatusHistoryEntry {
  status: OrderStatus | 'placed'; // includes initial placed entry
  at:     Timestamp;
  byUid:  string;
  byRole: UserRole;
}

export interface Order {
  id:              string;
  orderNo:         string;           // e.g. AS-1042
  customerId:      string;
  customerName:    string;
  customerPhone:   string;
  addressSnapshot: AddressSnapshot;
  items:           OrderItem[];
  subtotal:        number;
  deliveryFee:     number;
  total:           number;
  paymentMethod:   'COD';
  slot:            OrderSlot;
  notes:           string;
  status:          OrderStatus;
  agentId:         string | null;
  agentName:       string | null;
  agentPhone:      string | null;
  agentFee:        number | null;
  source:          OrderSource;
  cancelReason:    string | null;
  cancelledBy:     string | null;    // uid
  statusHistory:   StatusHistoryEntry[];
  createdAt:       Timestamp;
  updatedAt:       Timestamp;
  packedAt:        Timestamp | null;
  pickedUpAt:      Timestamp | null;
  deliveredAt:     Timestamp | null;
  cancelledAt:     Timestamp | null;
  // Can recovery extension (Q4 — kept compatible)
  type?:               'order' | 'recovery';
  pendingCansToCollect?: number;
  emptyCansCollected?:   number;
  checkedItems?:         Record<string, boolean>;
}

// ─── Settings ────────────────────────────────────────────────────────────────

export interface Settings {
  minOrderValue:      number;
  deliveryFee:        number;
  freeDeliveryAbove:  number;
  openTime:           string;   // "HH:mm" IST
  closeTime:          string;   // "HH:mm" IST
  isStoreOpenOverride: null | true | false;
  slots:              string[]; // slot labels
  agentFeePerDelivery: number;
}

// ─── Notification ─────────────────────────────────────────────────────────────

export type NotificationType =
  | 'order_placed'
  | 'order_assigned'
  | 'order_packed'
  | 'order_picked_up'
  | 'order_delivered'
  | 'order_cancelled'
  | 'agent_reassigned'
  | 'stock_changed'
  | 'settings_changed';

export interface AppNotification {
  id:        string;
  toUid:     string;
  toRole:    UserRole;
  type:      NotificationType;
  orderId:   string | null;
  title:     string;
  body:      string;
  read:      boolean;
  createdAt: Timestamp;
}

// ─── Banner ───────────────────────────────────────────────────────────────────

export interface Banner {
  id:        string;
  title:     string;
  imageUrl:  string | null;
  color:     string | null;
  isActive:  boolean;
  sortOrder: number;
  subtitle?: string | null;
  linkedItemId?: string | null;
  linkedItemName?: string | null;
}

// ─── Stats ───────────────────────────────────────────────────────────────────

export interface DailyStats {
  date:                 string;   // YYYY-MM-DD
  orders:               number;
  revenue:              number;
  cashCollectedByAgent: Record<string, number>;
  deliveriesByAgent:    Record<string, number>;
  itemQty:              Record<string, number>;
  cancelledOrders?:     number;
}

// ─── Cart (local Zustand store) ───────────────────────────────────────────────

export interface CartLine {
  itemId: string;
  qty:    number;
}

export interface CartStore {
  lines:       CartLine[];
  uid:         string | null;
  addItem:     (itemId: string) => void;
  removeItem:  (itemId: string) => void;
  setQty:      (itemId: string, qty: number) => void;
  clearCart:   () => void;
  initForUser: (uid: string) => void;
}

// ─── Actor (used in service functions) ───────────────────────────────────────

export interface Actor {
  uid:  string;
  role: UserRole;
  name: string;
}
