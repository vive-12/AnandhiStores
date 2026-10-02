// hooks/useCart.ts — Zustand cart store persisted in AsyncStorage
// Cart lines store itemId + qty only. Prices always come from live useItems().
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CartLine, CartStore } from '../types';

export const useCart = create<CartStore>()(
  persist(
    (set, get) => ({
      lines: [],
      uid:   null,

      initForUser: (uid: string) => {
        // If switching users, clear the old cart
        if (get().uid && get().uid !== uid) {
          set({ lines: [], uid });
        } else {
          set({ uid });
        }
      },

      addItem: (itemId: string) => {
        const lines = get().lines;
        const existing = lines.find(l => l.itemId === itemId);
        if (existing) {
          set({ lines: lines.map(l => l.itemId === itemId ? { ...l, qty: l.qty + 1 } : l) });
        } else {
          set({ lines: [...lines, { itemId, qty: 1 }] });
        }
      },

      removeItem: (itemId: string) => {
        const lines = get().lines;
        const existing = lines.find(l => l.itemId === itemId);
        if (existing && existing.qty > 1) {
          set({ lines: lines.map(l => l.itemId === itemId ? { ...l, qty: l.qty - 1 } : l) });
        } else {
          set({ lines: lines.filter(l => l.itemId !== itemId) });
        }
      },

      setQty: (itemId: string, qty: number) => {
        if (qty <= 0) {
          set({ lines: get().lines.filter(l => l.itemId !== itemId) });
        } else {
          const lines = get().lines;
          const existing = lines.find(l => l.itemId === itemId);
          if (existing) {
            set({ lines: lines.map(l => l.itemId === itemId ? { ...l, qty } : l) });
          } else {
            set({ lines: [...lines, { itemId, qty }] });
          }
        }
      },

      clearCart: () => set({ lines: [] }),
    }),
    {
      name:    'anandhi-cart',
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist lines and uid — not actions
      partialize: (state) => ({ lines: state.lines, uid: state.uid }),
    },
  ),
);

/** Convenience selector: total item count */
export const useCartCount = () =>
  useCart(s => s.lines.reduce((sum, l) => sum + l.qty, 0));

/** Convenience selector: qty for a specific item */
export const useItemQty = (itemId: string) =>
  useCart(s => s.lines.find(l => l.itemId === itemId)?.qty ?? 0);
