// utils/compute.ts — Shared business logic utilities
import type { CartLine, Item, Settings } from '../types';

// ─── Cart totals ──────────────────────────────────────────────────────────────

export interface CartTotals {
  subtotal:           number;
  deliveryFee:        number;
  total:              number;
  amountToFreeDelivery: number;
  meetsMinimum:       boolean;
}

/**
 * Compute cart totals from cart lines + live items + store settings.
 * Called by customer cart and checkout screens.
 */
export function computeTotals(
  lines: CartLine[],
  itemsMap: Record<string, Item>,
  settings: Settings,
): CartTotals {
  let subtotal = 0;

  for (const line of lines) {
    const item = itemsMap[line.itemId];
    if (item && item.inStock && !item.isDeleted) {
      subtotal += item.price * line.qty;
    }
  }

  const freeDelivery = subtotal >= settings.freeDeliveryAbove;
  const deliveryFee  = freeDelivery ? 0 : settings.deliveryFee;
  const total        = subtotal + deliveryFee;
  const amountToFreeDelivery = Math.max(0, settings.freeDeliveryAbove - subtotal);
  const meetsMinimum = subtotal >= settings.minOrderValue;

  return { subtotal, deliveryFee, total, amountToFreeDelivery, meetsMinimum };
}

// ─── Store hours ──────────────────────────────────────────────────────────────

/**
 * Determine if the store is currently open.
 * Respects the admin override (null = auto, true = force open, false = force closed).
 */
export function isStoreOpen(settings: Settings, now: Date = new Date()): boolean {
  if (settings.isStoreOpenOverride === true)  return true;
  if (settings.isStoreOpenOverride === false) return false;

  // Auto: check IST time
  const istOffset = 5.5 * 60; // IST = UTC+5:30
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
  const ist   = new Date(utcMs + istOffset * 60 * 1000);

  const hh = ist.getHours();
  const mm = ist.getMinutes();
  const current = hh * 60 + mm;

  const [openH,  openM]  = settings.openTime.split(':').map(Number);
  const [closeH, closeM] = settings.closeTime.split(':').map(Number);
  const open  = openH  * 60 + openM;
  const close = closeH * 60 + closeM;

  return current >= open && current < close;
}

/** Format IST time label e.g. "opens at 7:00 AM" */
export function storeOpenLabel(settings: Settings): string {
  const [h, m] = settings.openTime.split(':').map(Number);
  const ampm   = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `opens at ${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// ─── Validation ───────────────────────────────────────────────────────────────

/** Indian mobile number: 10 digits, starts with 6–9 */
export function isValidPhone(phone: string): boolean {
  return /^[6-9]\d{9}$/.test(phone.trim());
}

/** 4-digit numeric PIN */
export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

/** Trim phone to digits only */
export function normalisePhone(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10);
}
