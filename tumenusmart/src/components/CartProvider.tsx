"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ItemCarrito, precioUnitario } from "@/lib/cart-types";

// Un carrito por local. Sin esto, alguien que abre dos menús distintos en el
// mismo navegador terminaría con productos de un negocio dentro del pedido
// del otro.
function claveGuardado(claveLocal: string): string {
  return `tumenusmart:carrito:${claveLocal}`;
}

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

export function CartProvider({
  children,
  claveLocal,
}: {
  children: React.ReactNode;
  /** nombre del local en la URL — separa este carrito del de otros negocios */
  claveLocal: string;
}) {
  const [items, setItems] = useState<ItemCarrito[]>([]);
  const [cargado, setCargado] = useState(false);

  // Cargar el carrito de ESTE local (si existe) al montar en el navegador.
  // Si se cambia de local, se vacía y se lee el del nuevo.
  useEffect(() => {
    setCargado(false);
    setItems([]);
    try {
      const guardado = window.localStorage.getItem(claveGuardado(claveLocal));
      if (guardado) setItems(JSON.parse(guardado));
    } catch {
      // localStorage no disponible o corrupto: seguimos con carrito vacío
    } finally {
      setCargado(true);
    }
  }, [claveLocal]);

  useEffect(() => {
    if (!cargado) return;
    try {
      window.localStorage.setItem(claveGuardado(claveLocal), JSON.stringify(items));
    } catch {
      // si falla el guardado, el carrito sigue funcionando en memoria
    }
  }, [items, cargado, claveLocal]);

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
