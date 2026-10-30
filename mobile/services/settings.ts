// services/settings.ts — Store settings service
import {
  doc, getDoc, setDoc, onSnapshot, Unsubscribe,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Settings } from '../types';

const DOC_PATH = 'settings/store';

const DEFAULTS: Settings = {
  instantDeliveryEnabled: true,
  supportPhone: '9003115101',
  minOrderValue:       99,
  deliveryFee:         20,
  freeDeliveryAbove:   299,
  openTime:            '07:00',
  closeTime:           '21:00',
  isStoreOpenOverride: null,
  slots:               ['5 min', 'Morning 7–9 AM', 'Evening 5–7 PM'],
  agentFeePerDelivery: 30,
};

export function normalizeSettings(data: any): Settings {
  if (!data) return DEFAULTS;
  const rawSlots = Array.isArray(data.slots) && data.slots.length > 0 ? data.slots : DEFAULTS.slots;
  const slots = rawSlots.map((s: string) => (typeof s === 'string' && s.trim().toUpperCase() === 'ASAP' ? '5 min' : s));
  return { ...DEFAULTS, ...data, slots };
}

/** Live listener for store settings */
export function listenSettings(
  onData: (s: Settings) => void,
  onError: (e: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, DOC_PATH),
    snap => {
      if (snap.exists()) {
        onData(normalizeSettings(snap.data()));
      } else {
        onData(DEFAULTS);
      }
    },
    onError,
  );
}

/** One-shot fetch */
export async function getSettings(): Promise<Settings> {
  const snap = await getDoc(doc(db, DOC_PATH));
  return snap.exists() ? normalizeSettings(snap.data()) : DEFAULTS;
}

/** Admin: save settings */
export async function saveSettings(settings: Settings): Promise<void> {
  await setDoc(doc(db, DOC_PATH), settings, { merge: true });
}
