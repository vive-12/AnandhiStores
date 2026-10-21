import {
  collection,
  doc,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
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
  imageScale?: number | null;
  imageOffsetX?: number | null;
  imageOffsetY?: number | null;
  imageRotation?: number | null;
}

const COL = 'banners';
export const MAX_BANNERS = 5;

/**
 * Live listener for active banners (customer home carousel).
 */
export function listenBanners(
  onData: (banners: AppBanner[]) => void,
  onError: (e: Error) => void,
): Unsubscribe {
  const q = query(collection(db, COL), limit(200));

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
            imageScale: data.imageScale ?? 1,
            imageOffsetX: data.imageOffsetX ?? 0,
            imageOffsetY: data.imageOffsetY ?? 0,
            imageRotation: data.imageRotation ?? 0,
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
  const q = query(collection(db, COL), limit(200));
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
          imageScale: data.imageScale ?? 1,
          imageOffsetX: data.imageOffsetX ?? 0,
          imageOffsetY: data.imageOffsetY ?? 0,
          imageRotation: data.imageRotation ?? 0,
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
  const currentSnap = await getDocs(query(collection(db, COL)));
  if (currentSnap.size >= MAX_BANNERS) {
    throw new Error(`Maximum limit of ${MAX_BANNERS} banners reached. Please delete an existing banner before creating a new one.`);
  }

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
