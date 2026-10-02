// services/banners.ts — Promotional banners service
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  Unsubscribe,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Banner } from '../types';

export interface AppBanner extends Banner {
  subtitle?: string;
  linkedItemId?: string | null;
  linkedItemName?: string | null;
}

const COL = 'banners';

/**
 * Live listener for active banners (customer home carousel).
 */
export function listenBanners(
  onData: (banners: AppBanner[]) => void,
  onError: (e: Error) => void,
): Unsubscribe {
  const q = collection(db, COL);

  return onSnapshot(
    q,
    snap => {
      const banners = snap.docs
        .map(d => {
          const data = d.data();
          return {
            id: d.id,
            title: data.title || '',
            subtitle: data.subtitle,
            imageUrl: data.imageUrl ?? null,
            color: data.color || data.bg_color || '#1F5B3C',
            isActive: data.isActive ?? true,
            sortOrder: data.sortOrder ?? 0,
            linkedItemId: data.linkedItemId || data.linked_item_id || null,
            linkedItemName: data.linkedItemName || data.linked_item_name || null,
          } as AppBanner;
        })
        .filter(b => b.isActive);
      banners.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      onData(banners);
    },
    onError,
  );
}

/** Admin: listen to all banners regardless of isActive */
export function listenAllBanners(
  onData: (banners: AppBanner[]) => void,
  onError: (e: Error) => void,
): Unsubscribe {
  const q = query(collection(db, COL));
  return onSnapshot(
    q,
    snap => {
      const banners = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          title: data.title || '',
          subtitle: data.subtitle,
          imageUrl: data.imageUrl ?? null,
          color: data.color || data.bg_color || '#1F5B3C',
          isActive: data.isActive ?? true,
          sortOrder: data.sortOrder ?? 0,
          linkedItemId: data.linkedItemId || data.linked_item_id || null,
          linkedItemName: data.linkedItemName || data.linked_item_name || null,
        } as AppBanner;
      });
      banners.sort((a, b) => a.sortOrder - b.sortOrder);
      onData(banners);
    },
    onError,
  );
}

/** Admin: create a new banner */
export async function createBanner(
  data: Omit<Banner, 'id'> & { subtitle?: string; linkedItemId?: string | null; linkedItemName?: string | null },
): Promise<string> {
  const ref = await addDoc(collection(db, COL), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/** Admin: update banner */
export async function updateBanner(
  bannerId: string,
  data: Partial<Omit<Banner, 'id'>> & { subtitle?: string; linkedItemId?: string | null; linkedItemName?: string | null },
): Promise<void> {
  await updateDoc(doc(db, COL, bannerId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

/** Admin: toggle banner isActive (sync row 17) */
export async function toggleBannerActive(
  bannerId: string,
  isActive: boolean,
): Promise<void> {
  await updateDoc(doc(db, COL, bannerId), {
    isActive,
    updatedAt: serverTimestamp(),
  });
}

/** Admin: delete banner */
export async function deleteBanner(bannerId: string): Promise<void> {
  await deleteDoc(doc(db, COL, bannerId));
  try {
    await deleteDoc(doc(db, 'offers', bannerId));
  } catch {}
}
