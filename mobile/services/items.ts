// services/items.ts — Item read/write service
// All screens must call these instead of Firestore directly.
import {
  collection, doc, addDoc, updateDoc, onSnapshot,
  query, where, orderBy, serverTimestamp, Unsubscribe,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Item } from '../types';

const COL = 'items';

/** Live listener — excludes soft-deleted items by default */
export function listenItems(
  onData: (items: Item[]) => void,
  onError: (e: Error) => void,
  includeDeleted = false,
): Unsubscribe {
  const q = collection(db, COL);

  return onSnapshot(
    q,
    snap => {
      const items = snap.docs.map(d => ({ ...d.data(), id: d.id } as Item));
      const filtered = includeDeleted ? items : items.filter(i => !i.isDeleted);
      filtered.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      onData(filtered);
    },
    onError,
  );
}

/** Add a new item */
export async function createItem(
  data: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'isDeleted'>,
): Promise<string> {
  const ref = await addDoc(collection(db, COL), {
    ...data,
    isDeleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/** Edit an existing item */
export async function updateItem(
  itemId: string,
  data: Partial<Omit<Item, 'id' | 'createdAt' | 'isDeleted'>>,
): Promise<void> {
  await updateDoc(doc(db, COL, itemId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

/** Soft-delete — sets isDeleted: true, never calls deleteDoc */
export async function softDeleteItem(itemId: string): Promise<void> {
  await updateDoc(doc(db, COL, itemId), {
    isDeleted: true,
    updatedAt: serverTimestamp(),
  });
}

/** Toggle inStock */
export async function toggleStock(itemId: string, inStock: boolean): Promise<void> {
  await updateDoc(doc(db, COL, itemId), {
    inStock,
    updatedAt: serverTimestamp(),
  });
}
