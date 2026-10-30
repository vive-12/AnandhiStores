// services/qr.ts — QR Code Management & UPI Payment Service
import {
  collection, doc, getDoc, getDocs, onSnapshot,
  setDoc, deleteDoc, writeBatch, Timestamp,
  query, orderBy, limit, Unsubscribe,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { QRCodeItem } from '../types';
import { getSettings } from './settings';
import { isStoreOpen } from '../utils/compute';
import { log } from '../utils/logger';

export const QR_COL = 'qr_codes';
export const MAX_QR_CODES = 5;

function qrListQuery() {
  return query(collection(db, QR_COL), limit(100));
}

/** Default fallback store UPI details if none seeded */
export const DEFAULT_STORE_UPI = {
  name: 'Primary Store UPI (GPay / PhonePe)',
  upiId: 'anandhistores@okaxis',
  merchantName: 'Anandhi Stores',
};

/**
 * Generate standard NPCI UPI payment URI
 */
export function generateUPIUri(params: {
  upiId: string;
  merchantName?: string;
  amount: number;
  orderNo?: string;
}): string {
  const { upiId, merchantName = 'Anandhi Stores', amount, orderNo = '' } = params;
  const cleanUpi = upiId.trim();
  const cleanName = encodeURIComponent(merchantName.trim());
  const cleanNote = encodeURIComponent(orderNo ? `Order ${orderNo}` : 'Anandhi Stores Payment');
  return `upi://pay?pa=${cleanUpi}&pn=${cleanName}&am=${amount.toFixed(2)}&cu=INR&tn=${cleanNote}`;
}

/**
 * Get standard rendered QR Code Image URL from UPI URI (supports offline-first caching)
 */
export function getQRCodeImageUrl(upiUri: string, size = 320): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(upiUri)}`;
}

/**
 * Listen to all QR codes in real-time
 */
export function listenQRCodes(
  onData: (items: QRCodeItem[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(collection(db, QR_COL), orderBy('createdAt', 'desc'), limit(10));
  return onSnapshot(
    q,
    snapshot => {
      const list: QRCodeItem[] = snapshot.docs.filter(d => !d.data().isArchived).map(d => ({
        id: d.id,
        ...d.data(),
      } as QRCodeItem));
      onData(list);
    },
    error => {
      log.admin.error('Failed to listen to QR codes', { error: error.message });
      onError?.(error);
    },
  );
}

/**
 * Get the active default QR code for agents to show customers
 */
export async function getDefaultQRCode(): Promise<QRCodeItem | null> {
  try {
    const snap = await getDocs(qrListQuery());
    if (snap.empty) return null;
    const all = snap.docs.filter(d => !d.data().isArchived).map(d => ({ id: d.id, ...d.data() } as QRCodeItem));
    const def = all.find(q => q.isDefault);
    return def || all[0] || null;
  } catch (err) {
    log.admin.error('Error fetching default QR code', err);
    return null;
  }
}

/**
 * Save (create or update) a QR code.
 * Enforces maximum of 5 QR codes.
 */
export async function saveQRCode(params: {
  id?: string;
  name: string;
  upiId: string;
  merchantName?: string;
  imageUrl?: string;
  isDefault?: boolean;
}): Promise<string> {
  await requirePaymentEditWindow();
  if (!params.upiId?.includes('@') || !params.imageUrl?.trim()) throw new Error('Upload the payment QR and enter its matching UPI ID.');
  const snap = await getDocs(qrListQuery());
  const existingDocs = snap.docs.filter(d => !d.data().isArchived).map(d => ({ id: d.id, ...d.data() } as QRCodeItem));

  const isEditing = Boolean(params.id && existingDocs.some(d => d.id === params.id));

  // Check 5 QR limit when creating new
  if (!isEditing && existingDocs.length >= MAX_QR_CODES) {
    throw new Error(`Maximum limit of ${MAX_QR_CODES} QR codes reached. Please delete or edit an existing one.`);
  }

  const batch = writeBatch(db);
  const now = Timestamp.now();
  const targetId = params.id || doc(collection(db, QR_COL)).id;
  const targetRef = doc(db, QR_COL, targetId);

  // If this is set as default OR is the very first QR code, unset default on all others
  const willBeDefault = Boolean(params.isDefault || existingDocs.length === 0);

  if (willBeDefault) {
    existingDocs.forEach(item => {
      if (item.id !== targetId && item.isDefault) {
        batch.update(doc(db, QR_COL, item.id), { isDefault: false, updatedAt: now });
      }
    });
  }

  const existingData = isEditing ? existingDocs.find(d => d.id === targetId) : null;

  batch.set(
    targetRef,
    {
      name: params.name.trim(),
      upiId: params.upiId.trim(),
      merchantName: (params.merchantName || 'Anandhi Stores').trim(),
      imageUrl: params.imageUrl?.trim() || null,
      isDefault: willBeDefault,
      ...(!isEditing ? { totalSales: 0, orderCount: 0, lastUsedAt: null, createdAt: now } : {}),
      isArchived: false,
      updatedAt: now,
    },
    { merge: true },
  );

  await batch.commit();
  log.admin.info('Saved QR code successfully', { id: targetId, name: params.name, isDefault: willBeDefault });
  return targetId;
}

/**
 * Set an existing QR code as the default active code
 */
export async function setDefaultQRCode(qrId: string): Promise<void> {
  await requirePaymentEditWindow();
  const snap = await getDocs(qrListQuery());
  const batch = writeBatch(db);
  const now = Timestamp.now();

  snap.docs.forEach(d => {
    const isTarget = d.id === qrId;
    batch.update(doc(db, QR_COL, d.id), {
      isDefault: isTarget,
      updatedAt: now,
    });
  });

  await batch.commit();
  log.admin.info('Set default QR code', { qrId });
}

/**
 * Delete a QR code. If the deleted one was default, set another remaining as default.
 */
export async function deleteQRCode(qrId: string): Promise<void> {
  await requirePaymentEditWindow();
  const snap = await getDocs(qrListQuery());
  const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as QRCodeItem));
  const target = all.find(d => d.id === qrId);

  const batch = writeBatch(db);
  batch.update(doc(db, QR_COL, qrId), { isArchived: true, isDefault: false, updatedAt: Timestamp.now() });

  if (target?.isDefault) {
    const remaining = all.filter(d => d.id !== qrId);
    if (remaining.length > 0) {
      batch.update(doc(db, QR_COL, remaining[0].id), {
        isDefault: true,
        updatedAt: Timestamp.now(),
      });
    }
  }

  await batch.commit();
  log.admin.info('Deleted QR code', { qrId });
}

/**
 * Seed initial default QR code if the collection is empty
 */
export async function seedDefaultQRCodeIfEmpty(): Promise<void> { /* Explicit admin setup only. */ }

async function requirePaymentEditWindow(): Promise<void> {
  const settings = await getSettings();
  if (settings.instantDeliveryEnabled !== false && isStoreOpen(settings)) throw new Error('Close instant delivery before changing payment QR details. Scheduled orders stay available.');
}
