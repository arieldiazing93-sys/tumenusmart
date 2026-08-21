"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ItemCarrito, precioUnitario } from "@/lib/cart-types";

const STORAGE_KEY = "pedidos-app:carrito";

type CartContextValue = {
  items: ItemCarrito[];
  agregarItem: (item: ItemCarrito) => void;
  quitarItem: (key: string) => void;
  actualizarCantidad: (key: string, cantidad: number) => void;
  vaciarCarrito: () => void;
  subtotal: number;
  cantidadTotal: number;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ItemCarrito[]>([]);
  const [cargado, setCargado] = useState(false);

  // Cargar carrito guardado (si existe) una sola vez, al montar en el navegador.
  useEffect(() => {
    try {
      const guardado = window.localStorage.getItem(STORAGE_KEY);
      if (guardado) setItems(JSON.parse(guardado));
    } catch {
      // localStorage no disponible o corrupto: seguimos con carrito vacío
    } finally {
      setCargado(true);
    }
  }, []);

  useEffect(() => {
    if (!cargado) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // si falla el guardado, el carrito sigue funcionando en memoria
    }
  }, [items, cargado]);

  function agregarItem(nuevo: ItemCarrito) {
    setItems((actuales) => {
      const existente = actuales.find((i) => i.key === nuevo.key);
      if (existente) {
        return actuales.map((i) =>
          i.key === nuevo.key ? { ...i, cantidad: i.cantidad + nuevo.cantidad } : i
        );
      }
      return [...actuales, nuevo];
    });
  }

  function quitarItem(key: string) {
    setItems((actuales) => actuales.filter((i) => i.key !== key));
  }

  function actualizarCantidad(key: string, cantidad: number) {
    if (cantidad <= 0) return quitarItem(key);
    setItems((actuales) =>
      actuales.map((i) => (i.key === key ? { ...i, cantidad } : i))
    );
  }

  function vaciarCarrito() {
    setItems([]);
  }

  const subtotal = useMemo(
    () => items.reduce((suma, i) => suma + precioUnitario(i) * i.cantidad, 0),
    [items]
  );

  const cantidadTotal = useMemo(
    () => items.reduce((suma, i) => suma + i.cantidad, 0),
    [items]
  );

  return (
    <CartContext.Provider
      value={{
        items,
        agregarItem,
        quitarItem,
        actualizarCantidad,
        vaciarCarrito,
        subtotal,
        cantidadTotal,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart debe usarse dentro de <CartProvider>");
  return ctx;
}
