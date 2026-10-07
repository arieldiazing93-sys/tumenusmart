"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ItemCarrito, precioUnitario } from "@/lib/cart-types";
import { conPreciosVigentes } from "@/lib/cart-precios";

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
  /** Los precios vigentes de la carta (promociones incluidas): el carrito se pone al día con ellos. Ver SincronizarPrecios. */
  fijarPrecios: (precios: Record<string, number>) => void;
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
  // Lo que el cliente pidió, con el precio con que se lo mostraron al pedirlo. Es lo que se guarda en el teléfono.
  const [itemsGuardados, setItems] = useState<ItemCarrito[]>([]);
  // Los precios vigentes de la carta de este momento (con las promociones de precio). Hasta que llegan, no se toca nada.
  const [precios, setPrecios] = useState<Record<string, number> | null>(null);
  const [cargado, setCargado] = useState(false);
  // Lo que se muestra y se suma: cada línea con el precio de AHORA. Un cliente que agregó una pizza a las 17:50 y pide a las 18:05 ve y
  // paga el precio de las 18:05 — no el de cuando tocó el producto.
  const items = useMemo(() => conPreciosVigentes(itemsGuardados, precios), [itemsGuardados, precios]);
  const fijarPrecios = useCallback((nuevos: Record<string, number>) => setPrecios(nuevos), []);

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
      window.localStorage.setItem(claveGuardado(claveLocal), JSON.stringify(itemsGuardados));
    } catch {
      // si falla el guardado, el carrito sigue funcionando en memoria
    }
  }, [itemsGuardados, cargado, claveLocal]);

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
        fijarPrecios,
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
