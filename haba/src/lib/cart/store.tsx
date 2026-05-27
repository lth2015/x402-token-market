"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getProductById, type MarvieProduct } from "@/lib/haba";

/**
 * Consumer cart — client-side only. Persisted to localStorage so a refresh
 * during a demo doesn't drop the items. Items are stored by SKU id; the
 * MarvieProduct itself is looked up on the fly from the static catalog.
 *
 * Demo USDC rate: 1 USDC = 150 JPY (matches RealTopupButton elsewhere).
 */
const STORAGE_KEY = "haba.cart.v1";
const USDC_RATE_JPY = 150;

export type CartItem = { productId: MarvieProduct["id"]; qty: number };

export type CartHydratedItem = CartItem & { product: MarvieProduct };

type CartCtx = {
  items: CartHydratedItem[];
  totalItems: number;
  totalJpy: number;
  totalUsdc: number;
  addItem: (productId: MarvieProduct["id"], qty?: number) => void;
  addItems: (productIds: MarvieProduct["id"][]) => void;
  removeItem: (productId: MarvieProduct["id"]) => void;
  setQty: (productId: MarvieProduct["id"], qty: number) => void;
  clear: () => void;
};

const CartContext = createContext<CartCtx | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  // Start with empty state; hydrate from localStorage in useEffect to avoid
  // SSR / first-render mismatch.
  const [rawItems, setRawItems] = useState<CartItem[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as CartItem[];
      if (Array.isArray(parsed)) setRawItems(parsed.filter((i) => i?.productId && i?.qty > 0));
    } catch {
      // ignore corrupt storage
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rawItems));
    } catch {
      // ignore quota / privacy errors
    }
  }, [rawItems]);

  const hydrated = useMemo<CartHydratedItem[]>(() => {
    return rawItems
      .map((i) => {
        const product = getProductById(i.productId);
        return product ? { ...i, product } : null;
      })
      .filter((x): x is CartHydratedItem => x !== null);
  }, [rawItems]);

  const totalItems = useMemo(
    () => hydrated.reduce((acc, it) => acc + it.qty, 0),
    [hydrated],
  );
  const totalJpy = useMemo(
    () => hydrated.reduce((acc, it) => acc + it.product.priceJpy * it.qty, 0),
    [hydrated],
  );
  const totalUsdc = useMemo(() => +(totalJpy / USDC_RATE_JPY).toFixed(4), [totalJpy]);

  const addItem = useCallback((productId: MarvieProduct["id"], qty = 1) => {
    setRawItems((prev) => {
      const existing = prev.find((i) => i.productId === productId);
      if (existing) return prev.map((i) => (i.productId === productId ? { ...i, qty: i.qty + qty } : i));
      return [...prev, { productId, qty }];
    });
  }, []);

  const addItems = useCallback((productIds: MarvieProduct["id"][]) => {
    setRawItems((prev) => {
      const next = [...prev];
      for (const pid of productIds) {
        const existing = next.find((i) => i.productId === pid);
        if (existing) existing.qty += 1;
        else next.push({ productId: pid, qty: 1 });
      }
      return next;
    });
  }, []);

  const removeItem = useCallback((productId: MarvieProduct["id"]) => {
    setRawItems((prev) => prev.filter((i) => i.productId !== productId));
  }, []);

  const setQty = useCallback((productId: MarvieProduct["id"], qty: number) => {
    if (qty <= 0) {
      setRawItems((prev) => prev.filter((i) => i.productId !== productId));
      return;
    }
    setRawItems((prev) => prev.map((i) => (i.productId === productId ? { ...i, qty } : i)));
  }, []);

  const clear = useCallback(() => setRawItems([]), []);

  const value = useMemo<CartCtx>(
    () => ({
      items: hydrated,
      totalItems,
      totalJpy,
      totalUsdc,
      addItem,
      addItems,
      removeItem,
      setQty,
      clear,
    }),
    [hydrated, totalItems, totalJpy, totalUsdc, addItem, addItems, removeItem, setQty, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartCtx {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart must be used inside <CartProvider />");
  }
  return ctx;
}
