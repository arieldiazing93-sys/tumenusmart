"use client";

import Link from "next/link";
import { useCart } from "@/components/CartProvider";
import { precioUnitario, opcionesTexto, ingredientesQuitadosTexto } from "@/lib/cart-types";
import { formatearGuarani } from "@/lib/format";

export default function CarritoPage() {
  const { items, actualizarCantidad, quitarItem, subtotal } = useCart();

  if (items.length === 0) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="mb-4 text-neutral-500">Todavía no agregaste productos.</p>
        <Link href="/" className="font-medium text-brand">
          Volver al menú
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pb-32 pt-8">
      <h1 className="mb-6 text-xl font-bold text-neutral-900">Tu carrito</h1>

      <div className="flex flex-col gap-3">
        {items.map((item) => (
          <div
            key={item.key}
            className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-4"
          >
            <div>
              <p className="font-medium text-neutral-900">{item.nombreProducto}</p>
              {item.opciones.length > 0 && (
                <p className="text-sm text-neutral-500">{opcionesTexto(item)}</p>
              )}
              {ingredientesQuitadosTexto(item) && (
                <p className="text-sm text-red-500">{ingredientesQuitadosTexto(item)}</p>
              )}
              <p className="text-sm text-neutral-500">
                {formatearGuarani(precioUnitario(item))} c/u
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center rounded-lg border border-neutral-300">
                <button
                  type="button"
                  className="px-2 py-1"
                  onClick={() => actualizarCantidad(item.key, item.cantidad - 1)}
                >
                  −
                </button>
                <span className="w-6 text-center text-sm">{item.cantidad}</span>
                <button
                  type="button"
                  className="px-2 py-1"
                  onClick={() => actualizarCantidad(item.key, item.cantidad + 1)}
                >
                  +
                </button>
              </div>
              <button
                type="button"
                onClick={() => quitarItem(item.key)}
                className="text-sm text-red-500"
              >
                Quitar
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-neutral-200 bg-white p-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <span className="text-lg font-semibold">{formatearGuarani(subtotal)}</span>
          <Link
            href="/checkout"
            className="rounded-lg bg-brand px-6 py-3 font-medium text-white hover:bg-brand-dark"
          >
            Continuar
          </Link>
        </div>
      </div>
    </main>
  );
}
