import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { SaleMode } from './database.types';

/** Item keranjang. Harga di sini hanya untuk tampilan; server menghitung ulang. */
export type CartItem = {
  product_id: string;
  slug: string;
  nama: string;
  harga: number;
  satuan: string;
  sale_mode: SaleMode;
  gambar_path: string | null;
  qty: number;
};

type CartState = {
  items: CartItem[];
  count: number;
  subtotal: number;
  add: (item: Omit<CartItem, 'qty'>, qty?: number) => void;
  setQty: (productId: string, qty: number) => void;
  remove: (productId: string) => void;
  replace: (items: CartItem[]) => void;
  clear: () => void;
};

const KEY = 'gutvibes.keranjang.v1';
const CartContext = createContext<CartState | null>(null);

function load(): CartItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as CartItem[]) : [];
    return Array.isArray(parsed) ? parsed.filter((i) => i && i.product_id && i.qty > 0) : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(items));
    } catch {
      /* penyimpanan browser tidak tersedia: keranjang tetap jalan di memori */
    }
  }, [items]);

  const add = useCallback((item: Omit<CartItem, 'qty'>, qty = 1) => {
    setItems((prev) => {
      const found = prev.find((i) => i.product_id === item.product_id);
      if (found) return prev.map((i) => (i.product_id === item.product_id ? { ...i, ...item, qty: Math.min(999, i.qty + qty) } : i));
      return [...prev, { ...item, qty: Math.min(999, qty) }];
    });
  }, []);
  const setQty = useCallback((productId: string, qty: number) => {
    setItems((prev) => (qty <= 0 ? prev.filter((i) => i.product_id !== productId) : prev.map((i) => (i.product_id === productId ? { ...i, qty: Math.min(999, qty) } : i))));
  }, []);
  const remove = useCallback((productId: string) => setItems((prev) => prev.filter((i) => i.product_id !== productId)), []);
  const replace = useCallback((next: CartItem[]) => setItems(next), []);
  const clear = useCallback(() => setItems([]), []);

  const value = useMemo<CartState>(
    () => ({
      items,
      count: items.reduce((n, i) => n + i.qty, 0),
      subtotal: items.reduce((n, i) => n + i.harga * i.qty, 0),
      add,
      setQty,
      remove,
      replace,
      clear,
    }),
    [items, add, setQty, remove, replace, clear],
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartState {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart harus di dalam <CartProvider>');
  return ctx;
}
