// services/settings.ts — Store settings service
import {
  doc, getDoc, setDoc, onSnapshot, Unsubscribe,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Settings } from '../types';

const DOC_PATH = 'settings/store';

const DEFAULTS: Settings = {
  minOrderValue:       99,
  deliveryFee:         20,
  freeDeliveryAbove:   299,
  openTime:            '07:00',
  closeTime:           '21:00',
  isStoreOpenOverride: null,
  slots:               ['ASAP', 'Morning 7–9 AM', 'Evening 5–7 PM'],
  agentFeePerDelivery: 30,
};

/** Live listener for store settings */
export function listenSettings(
  onData: (s: Settings) => void,
  onError: (e: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, DOC_PATH),
    snap => {
      if (snap.exists()) {
        onData(snap.data() as Settings);
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
  return snap.exists() ? (snap.data() as Settings) : DEFAULTS;
}

/** Admin: save settings */
export async function saveSettings(settings: Settings): Promise<void> {
  await setDoc(doc(db, DOC_PATH), settings, { merge: true });
}
